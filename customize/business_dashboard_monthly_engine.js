(function () {
    'use strict';

    /**
     * App82 経営月次 — 8月起算12か月集計（読取専用）
     * CAYANAS_BusinessDashboardMonthly
     */

    const VERSION = '1.2.0';

    const assertDeps = () => {
        if (typeof CAYANAS_BUSINESS_DASHBOARD === 'undefined') {
            throw new Error('CAYANAS_BUSINESS_DASHBOARD が未読込です。');
        }
    };

    const CFG = () => CAYANAS_BUSINESS_DASHBOARD;
    const F = () => CFG().FIELDS;
    const M = () => CFG().MONTHLY || {};

    const todayYmdJst = () => (
        new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
    );

    const getFieldValue = (record, fieldCode) => {
        const field = record?.[fieldCode];
        if (!field || field.value === null || field.value === undefined) {
            return '';
        }
        return field.value;
    };

    const toNumber = (value) => {
        if (value === null || value === undefined || value === '') {
            return 0;
        }
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    };

    const normalizeYmd = (value) => String(value ?? '').trim().slice(0, 10);

    const pad2 = (n) => String(n).padStart(2, '0');

    const ymd = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

    const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

    const monthEnd = (y, m) => ymd(y, m, daysInMonth(y, m));

    const monthStart = (y, m) => ymd(y, m, 1);

    const isAggregationActive = (record) => {
        const rule = CFG().AGGREGATION;
        const value = record?.[rule.fieldCode]?.value;
        return String(value ?? '').trim() !== rule.cancelled;
    };

    const normalizeSubcategory = (raw) => {
        const value = String(raw ?? '').trim();
        if (!value) {
            return '';
        }
        const aliases = M().SUBCATEGORY_ALIASES || {};
        return aliases[value] || value;
    };

    const fetchAllRecords = async (appId, query, fields) => {
        const out = [];
        let offset = 0;
        const baseQuery = String(query || 'order by レコード番号 asc');

        while (true) {
            const body = {
                app: appId,
                query: `${baseQuery} limit 500 offset ${offset}`,
                totalCount: true,
            };
            if (Array.isArray(fields) && fields.length) {
                body.fields = fields;
            }
            const res = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', body);
            const records = res.records || [];
            out.push(...records);
            const total = Number(res.totalCount || 0);
            if (out.length >= total || records.length === 0) {
                break;
            }
            offset += 500;
            if (offset > 500000) {
                break;
            }
        }

        return out;
    };

    const buildProductLookup = (productRecords) => {
        const pf = F().product;
        const byCode = new Map();
        const byName = new Map();

        (productRecords || []).forEach((record) => {
            const code = String(getFieldValue(record, pf.itemCode)).trim();
            const name = String(getFieldValue(record, pf.itemName)).trim();
            const subcategory = normalizeSubcategory(getFieldValue(record, pf.subcategory));
            if (code) {
                byCode.set(code, subcategory);
            }
            if (name && !byName.has(name)) {
                byName.set(name, subcategory);
            }
        });

        return { byCode, byName };
    };

    const resolveSubcategory = (itemCode, itemName, lookup) => {
        const code = String(itemCode ?? '').trim();
        const name = String(itemName ?? '').trim();
        if (code && lookup.byCode.has(code)) {
            return lookup.byCode.get(code) || '';
        }
        if (name && lookup.byName.has(name)) {
            return lookup.byName.get(name) || '';
        }
        return '';
    };

    const tailorCategoryKeys = () => {
        const overseas = M().OVERSEAS_SUBCATEGORY || '海外仕立';
        const domestic = M().DOMESTIC_KIMONO_SUBCATEGORY || '国内仕立';
        const obi = M().OBI_SUBCATEGORY || '帯仕立';
        return { overseas, domestic, obi };
    };

    /**
     * App13中分類から仕立てルートを決定。
     * 複数の仕立て分類が同居する場合は conflict（重複計上しない）。
     * @returns {{
     *   route: 'overseas'|'domestic'|'obi'|'conflict'|'other',
     *   tailorCategories: string[],
     *   isConflict: boolean,
     * }}
     */
    const classifyTailorRouteDetail = (subcategories) => {
        const keys = tailorCategoryKeys();
        const set = new Set((subcategories || []).map(normalizeSubcategory).filter(Boolean));
        const found = [];
        if (set.has(keys.overseas)) {
            found.push('overseas');
        }
        if (set.has(keys.domestic)) {
            found.push('domestic');
        }
        if (set.has(keys.obi)) {
            found.push('obi');
        }
        if (found.length === 0) {
            return { route: 'other', tailorCategories: [], isConflict: false };
        }
        if (found.length === 1) {
            return { route: found[0], tailorCategories: found, isConflict: false };
        }
        return { route: 'conflict', tailorCategories: found, isConflict: true };
    };

    /**
     * @returns {'overseas'|'domestic'|'obi'|'conflict'|'other'}
     */
    const classifyKimonoRoute = (subcategories) => (
        classifyTailorRouteDetail(subcategories).route
    );

    const isTailorSubcategory = (sub) => {
        const list = M().TAILOR_SUBCATEGORIES || ['海外仕立', '国内仕立', '帯仕立'];
        return list.indexOf(normalizeSubcategory(sub)) >= 0;
    };

    const isCountableTailorRoute = (route) => (
        route === 'overseas' || route === 'domestic' || route === 'obi'
    );

    /**
     * 1受注の行解析
     */
    const analyzeOrder = (record, lookup) => {
        const of = F().order;
        const manageNo = String(getFieldValue(record, of.manageNo)).trim();
        const orderDate = normalizeYmd(getFieldValue(record, of.orderDate));
        const customerCode = String(getFieldValue(record, of.customerCode)).trim();
        const customerName = String(getFieldValue(record, of.customerName)).trim();
        const kimonoType = String(getFieldValue(record, of.kimonoType)).trim() || '—';
        const kimonoSpec = String(getFieldValue(record, of.kimonoSpec)).trim() || '—';
        const table = record[of.detailTable];
        const rows = Array.isArray(table?.value) ? table.value : [];

        let orderTotal = 0;
        let tailorAmount = 0;
        let addonAmount = 0;
        let unresolvedAmount = 0;
        let hasUnresolved = false;
        const subs = [];

        rows.forEach((row) => {
            const rowValue = row?.value ?? {};
            const itemCode = rowValue[of.itemCode]?.value;
            const itemName = rowValue[of.itemName]?.value;
            if (!String(itemCode ?? '').trim() && !String(itemName ?? '').trim()) {
                return;
            }
            const amount = toNumber(rowValue[of.amount]?.value);
            orderTotal += amount;
            const subcategory = resolveSubcategory(itemCode, itemName, lookup);
            if (!subcategory) {
                hasUnresolved = true;
                unresolvedAmount += amount;
                return;
            }
            subs.push(subcategory);
            if (isTailorSubcategory(subcategory)) {
                tailorAmount += amount;
            } else {
                addonAmount += amount;
            }
        });

        const classified = classifyTailorRouteDetail(subs);
        const route = classified.route;

        return {
            manageNo,
            orderDate,
            customerCode,
            customerName,
            kimonoType,
            kimonoSpec,
            route,
            tailorCategories: classified.tailorCategories,
            isConflict: classified.isConflict,
            orderTotal,
            tailorAmount,
            addonAmount,
            unresolvedAmount,
            amountSeparable: !hasUnresolved,
            isTailorKimono: isCountableTailorRoute(route),
        };
    };

    /**
     * 分析年度キー = 開始年（8月の年）
     */
    const fiscalYearRange = (startYear) => {
        const y = Number(startYear);
        return {
            startYear: y,
            label: `${y}年度`,
            startDate: ymd(y, 8, 1),
            endDate: ymd(y + 1, 7, 31),
            months: (M().MONTH_ORDER || [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7]).map((month) => {
                const year = month >= 8 ? y : y + 1;
                return {
                    key: `${year}-${pad2(month)}`,
                    year,
                    month,
                    label: `${month}月`,
                    start: monthStart(year, month),
                    end: monthEnd(year, month),
                };
            }),
        };
    };

    const listFiscalYears = (asOfYmd, dataStartYmd) => {
        const asOf = normalizeYmd(asOfYmd) || todayYmdJst();
        const dataStart = normalizeYmd(dataStartYmd) || M().DATA_START_DATE || '2026-03-24';
        const asOfYear = Number(asOf.slice(0, 4));
        const asOfMonth = Number(asOf.slice(5, 7));
        const currentStartYear = asOfMonth >= 8 ? asOfYear : asOfYear - 1;
        const dataYear = Number(dataStart.slice(0, 4));
        const dataMonth = Number(dataStart.slice(5, 7));
        const earliestStartYear = dataMonth >= 8 ? dataYear : dataYear - 1;
        const years = [];
        for (let y = earliestStartYear; y <= currentStartYear; y += 1) {
            years.push(fiscalYearRange(y));
        }
        if (!years.length) {
            years.push(fiscalYearRange(currentStartYear));
        }
        return years;
    };

    const monthStatus = (monthMeta, asOfYmd, dataStartYmd) => {
        const asOf = normalizeYmd(asOfYmd) || todayYmdJst();
        const dataStart = normalizeYmd(dataStartYmd) || M().DATA_START_DATE || '2026-03-24';
        if (monthMeta.start > asOf) {
            return 'future';
        }
        if (monthMeta.end < dataStart) {
            return 'before_data';
        }
        return 'ready';
    };

    const emptyMonthMetrics = () => ({
        overseasKimono: 0,
        domesticKimono: 0,
        obiKimono: 0,
        tailorKimono: 0,
        orderTotal: 0,
        tailorAmount: 0,
        addonAmount: 0,
        inseparableCount: 0,
        byCustomer: new Map(),
        byKimonoType: new Map(),
    });

    const ensureCustomer = (map, code, name) => {
        const key = code || '（未設定）';
        if (!map.has(key)) {
            map.set(key, {
                customerCode: key,
                customerName: name || key,
                overseasKimono: 0,
                domesticKimono: 0,
                obiKimono: 0,
                tailorKimono: 0,
                orderTotal: 0,
                tailorAmount: 0,
                addonAmount: 0,
                inseparableCount: 0,
                manageNos: new Set(),
            });
        }
        return map.get(key);
    };

    const ensureType = (map, type) => {
        const key = type || '—';
        if (!map.has(key)) {
            map.set(key, {
                kimonoType: key,
                overseasKimono: 0,
                domesticKimono: 0,
                obiKimono: 0,
                tailorKimono: 0,
            });
        }
        return map.get(key);
    };

    const bumpRouteCount = (target, route) => {
        if (route === 'overseas') {
            target.overseasKimono += 1;
        } else if (route === 'domestic') {
            target.domesticKimono += 1;
        } else if (route === 'obi') {
            target.obiKimono += 1;
        }
        target.tailorKimono += 1;
    };

    const addOrderToMonth = (bucket, order) => {
        if (!order.manageNo || !order.isTailorKimono) {
            return;
        }
        bumpRouteCount(bucket, order.route);
        bucket.orderTotal += order.orderTotal;
        if (order.amountSeparable) {
            bucket.tailorAmount += order.tailorAmount;
            bucket.addonAmount += order.addonAmount;
        } else {
            bucket.inseparableCount += 1;
        }

        const cust = ensureCustomer(bucket.byCustomer, order.customerCode, order.customerName);
        if (!cust.manageNos.has(order.manageNo)) {
            cust.manageNos.add(order.manageNo);
            bumpRouteCount(cust, order.route);
        }
        cust.orderTotal += order.orderTotal;
        if (order.amountSeparable) {
            cust.tailorAmount += order.tailorAmount;
            cust.addonAmount += order.addonAmount;
        } else {
            cust.inseparableCount += 1;
        }

        const typeRow = ensureType(bucket.byKimonoType, order.kimonoType);
        bumpRouteCount(typeRow, order.route);
    };

    const finalizeCustomerMap = (map) => (
        [...map.values()].map((row) => ({
            customerCode: row.customerCode,
            customerName: row.customerName,
            overseasKimono: row.overseasKimono,
            domesticKimono: row.domesticKimono,
            obiKimono: row.obiKimono,
            tailorKimono: row.tailorKimono,
            orderTotal: row.orderTotal,
            tailorAmount: row.tailorAmount,
            addonAmount: row.addonAmount,
            inseparableCount: row.inseparableCount,
            amountSeparable: row.inseparableCount === 0,
        })).sort((a, b) => b.tailorKimono - a.tailorKimono || b.orderTotal - a.orderTotal)
    );

    const finalizeTypeMap = (map) => (
        [...map.values()].sort((a, b) => b.tailorKimono - a.tailorKimono)
    );

    const filterRouteCount = (metrics, routeFilter) => {
        if (routeFilter === 'overseas') {
            return metrics.overseasKimono;
        }
        if (routeFilter === 'domestic') {
            return metrics.domesticKimono;
        }
        if (routeFilter === 'obi') {
            return metrics.obiKimono;
        }
        return metrics.tailorKimono;
    };

    const routeCountFromRow = (row, routeFilter) => {
        if (routeFilter === 'overseas') {
            return row.overseasKimono;
        }
        if (routeFilter === 'domestic') {
            return row.domesticKimono;
        }
        if (routeFilter === 'obi') {
            return row.obiKimono;
        }
        return row.tailorKimono;
    };

    const buildMonthSeries = (fiscal, monthBuckets, asOf, dataStart, routeFilter) => {
        let cumulative = 0;
        let prevCount = null;
        return fiscal.months.map((monthMeta) => {
            const status = monthStatus(monthMeta, asOf, dataStart);
            const metrics = monthBuckets.get(monthMeta.key) || emptyMonthMetrics();
            const count = status === 'ready' ? filterRouteCount(metrics, routeFilter) : null;
            let mom = null;
            let momRate = null;
            if (status === 'ready') {
                cumulative += count;
                if (prevCount !== null) {
                    mom = count - prevCount;
                    momRate = prevCount === 0
                        ? (count === 0 ? 0 : null)
                        : (count - prevCount) / prevCount;
                }
                prevCount = count;
            }
            return {
                key: monthMeta.key,
                label: monthMeta.label,
                year: monthMeta.year,
                month: monthMeta.month,
                status,
                overseasKimono: status === 'ready' ? metrics.overseasKimono : null,
                domesticKimono: status === 'ready' ? metrics.domesticKimono : null,
                obiKimono: status === 'ready' ? metrics.obiKimono : null,
                tailorKimono: status === 'ready' ? metrics.tailorKimono : null,
                filteredKimono: count,
                cumulative: status === 'ready' ? cumulative : null,
                mom,
                momRate,
                orderTotal: status === 'ready' ? metrics.orderTotal : null,
                tailorAmount: status === 'ready' ? metrics.tailorAmount : null,
                addonAmount: status === 'ready' ? metrics.addonAmount : null,
                inseparableCount: status === 'ready' ? metrics.inseparableCount : null,
            };
        });
    };

    const buildCustomerMatrix = (fiscal, monthBuckets, asOf, dataStart, routeFilter) => {
        const customerMap = new Map();
        fiscal.months.forEach((monthMeta) => {
            if (monthStatus(monthMeta, asOf, dataStart) !== 'ready') {
                return;
            }
            const metrics = monthBuckets.get(monthMeta.key) || emptyMonthMetrics();
            metrics.byCustomer.forEach((row, code) => {
                if (!customerMap.has(code)) {
                    customerMap.set(code, {
                        customerCode: row.customerCode,
                        customerName: row.customerName,
                        months: {},
                        yearTotal: 0,
                    });
                }
                const target = customerMap.get(code);
                const value = routeCountFromRow(row, routeFilter);
                target.months[monthMeta.key] = value;
                target.yearTotal += value;
            });
        });
        return [...customerMap.values()].sort((a, b) => b.yearTotal - a.yearTotal);
    };

    const buildCustomerRanking = (selectedMetrics, previousMetrics, routeFilter) => {
        const prevMap = new Map(
            (previousMetrics ? finalizeCustomerMap(previousMetrics.byCustomer) : [])
                .map((row) => [row.customerCode, row])
        );
        return finalizeCustomerMap(selectedMetrics.byCustomer).map((row) => {
            const prev = prevMap.get(row.customerCode);
            const currentCount = routeCountFromRow(row, routeFilter);
            const prevCount = prev ? routeCountFromRow(prev, routeFilter) : 0;
            const currentAmount = row.orderTotal;
            const prevAmount = prev ? prev.orderTotal : 0;
            return {
                ...row,
                filteredKimono: currentCount,
                kimonoDelta: currentCount - prevCount,
                amountDelta: currentAmount - prevAmount,
                kimonoDeltaRate: prevCount === 0
                    ? (currentCount === 0 ? 0 : null)
                    : (currentCount - prevCount) / prevCount,
            };
        }).sort((a, b) => b.kimonoDelta - a.kimonoDelta || b.filteredKimono - a.filteredKimono);
    };

    const matchesFilters = (order, filters) => {
        if (!order.isTailorKimono) {
            return false;
        }
        if (filters.route === 'overseas' && order.route !== 'overseas') {
            return false;
        }
        if (filters.route === 'domestic' && order.route !== 'domestic') {
            return false;
        }
        if (filters.route === 'obi' && order.route !== 'obi') {
            return false;
        }
        if (filters.customerCode && filters.customerCode !== 'ALL'
            && order.customerCode !== filters.customerCode) {
            return false;
        }
        if (filters.kimonoType && filters.kimonoType !== 'ALL'
            && order.kimonoType !== filters.kimonoType) {
            return false;
        }
        return true;
    };

    /**
     * @param {{
     *   fiscalStartYear: number,
     *   route?: 'all'|'overseas'|'domestic'|'obi',
     *   customerCode?: string,
     *   kimonoType?: string,
     *   selectedMonthKey?: string,
     *   orders?: object[],
     *   products?: object[],
     *   deliveredManageNos?: Set<string>,
     *   asOfDate?: string,
     * }} options
     */
    const buildMonthlyReport = async (options) => {
        assertDeps();
        const opts = options || {};
        const asOf = normalizeYmd(opts.asOfDate) || todayYmdJst();
        const dataStart = M().DATA_START_DATE || '2026-03-24';
        const fiscalYears = listFiscalYears(asOf, dataStart);
        const startYear = Number(opts.fiscalStartYear)
            || fiscalYears[fiscalYears.length - 1].startYear;
        const fiscal = fiscalYearRange(startYear);
        const routeFilter = opts.route || 'all';
        const customerFilter = opts.customerCode || 'ALL';
        const kimonoFilter = opts.kimonoType || 'ALL';

        const of = F().order;
        const df = F().delivery;
        const pf = F().product;

        const orderFields = [
            of.manageNo, of.orderDate, of.customerCode, of.customerName,
            of.kimonoType, of.kimonoSpec, of.detailTable, of.aggregationStatus,
        ];
        const productFields = [pf.itemCode, pf.itemName, pf.subcategory];
        const deliveryFields = [df.detailTable, df.aggregationStatus];

        const [orderRecords, productRecords, deliveryRecords] = await Promise.all([
            opts.analyzed
                ? Promise.resolve(null)
                : (opts.orders
                    ? Promise.resolve(opts.orders)
                    : fetchAllRecords(CFG().ORDER_APP_ID, 'order by order_date asc', orderFields)),
            opts.analyzed
                ? Promise.resolve(null)
                : (opts.products
                    ? Promise.resolve(opts.products)
                    : fetchAllRecords(CFG().PRODUCT_APP_ID, 'order by ' + pf.itemCode + ' asc', productFields)),
            opts.deliveredManageNos
                ? Promise.resolve(null)
                : fetchAllRecords(CFG().DELIVERY_APP_ID, 'order by レコード番号 asc', deliveryFields),
        ]);

        const lookup = opts.analyzed ? null : buildProductLookup(productRecords);
        const analyzed = [];
        const conflicts = [];
        const customerOptions = new Map();
        const kimonoOptions = new Set();

        if (Array.isArray(opts.analyzed)) {
            opts.analyzed.forEach((order) => {
                if (!order?.manageNo || !order.orderDate) {
                    return;
                }
                analyzed.push(order);
                if (order.isConflict
                    && order.orderDate >= fiscal.startDate
                    && order.orderDate <= fiscal.endDate) {
                    conflicts.push({
                        manageNo: order.manageNo,
                        orderDate: order.orderDate,
                        customerCode: order.customerCode,
                        customerName: order.customerName,
                        kimonoType: order.kimonoType,
                        tailorCategories: (order.tailorCategories || []).slice(),
                        orderTotal: order.orderTotal,
                        tailorAmount: order.tailorAmount,
                        addonAmount: order.addonAmount,
                    });
                }
                if (order.isTailorKimono) {
                    customerOptions.set(
                        order.customerCode || '（未設定）',
                        order.customerName || order.customerCode || '（未設定）'
                    );
                    kimonoOptions.add(order.kimonoType || '—');
                }
            });
        } else {
            (orderRecords || []).forEach((record) => {
                if (!isAggregationActive(record)) {
                    return;
                }
                const order = analyzeOrder(record, lookup);
                if (!order.manageNo || !order.orderDate) {
                    return;
                }
                analyzed.push(order);
                if (order.isConflict
                    && order.orderDate >= fiscal.startDate
                    && order.orderDate <= fiscal.endDate) {
                    conflicts.push({
                        manageNo: order.manageNo,
                        orderDate: order.orderDate,
                        customerCode: order.customerCode,
                        customerName: order.customerName,
                        kimonoType: order.kimonoType,
                        tailorCategories: order.tailorCategories.slice(),
                        orderTotal: order.orderTotal,
                        tailorAmount: order.tailorAmount,
                        addonAmount: order.addonAmount,
                    });
                }
                if (order.isTailorKimono) {
                    customerOptions.set(
                        order.customerCode || '（未設定）',
                        order.customerName || order.customerCode || '（未設定）'
                    );
                    kimonoOptions.add(order.kimonoType || '—');
                }
            });
        }

        const filters = {
            route: routeFilter,
            customerCode: customerFilter,
            kimonoType: kimonoFilter,
        };

        const monthBuckets = new Map();
        fiscal.months.forEach((m) => monthBuckets.set(m.key, emptyMonthMetrics()));

        analyzed.forEach((order) => {
            if (order.orderDate < fiscal.startDate || order.orderDate > fiscal.endDate) {
                return;
            }
            if (!matchesFilters(order, filters)) {
                return;
            }
            const key = order.orderDate.slice(0, 7);
            if (!monthBuckets.has(key)) {
                return;
            }
            addOrderToMonth(monthBuckets.get(key), order);
        });

        const series = buildMonthSeries(fiscal, monthBuckets, asOf, dataStart, routeFilter);

        let selectedMonthKey = opts.selectedMonthKey;
        if (!selectedMonthKey || !monthBuckets.has(selectedMonthKey)) {
            const ready = [...series].reverse().find((row) => row.status === 'ready');
            selectedMonthKey = ready ? ready.key : fiscal.months[0].key;
        }

        const selectedIndex = fiscal.months.findIndex((m) => m.key === selectedMonthKey);
        const selectedMetrics = monthBuckets.get(selectedMonthKey) || emptyMonthMetrics();
        const previousKey = selectedIndex > 0 ? fiscal.months[selectedIndex - 1].key : null;
        const previousMetrics = previousKey ? monthBuckets.get(previousKey) : null;

        const selectedSeriesRow = series.find((row) => row.key === selectedMonthKey);

        const avgOrder = selectedMetrics.tailorKimono > 0
            ? selectedMetrics.orderTotal / selectedMetrics.tailorKimono
            : null;
        const avgTailor = selectedMetrics.tailorKimono > 0 && selectedMetrics.inseparableCount === 0
            ? selectedMetrics.tailorAmount / selectedMetrics.tailorKimono
            : null;

        /* 受注残（フィルタ適用後の仕立着物） */
        let delivered = opts.deliveredManageNos || null;
        if (!delivered) {
            delivered = new Set();
            (deliveryRecords || []).forEach((record) => {
                if (!isAggregationActive(record)) {
                    return;
                }
                const table = record[df.detailTable];
                const rows = Array.isArray(table?.value) ? table.value : [];
                rows.forEach((row) => {
                    const manageNo = String(row?.value?.[df.manageNo]?.value ?? '').trim();
                    if (manageNo) {
                        delivered.add(manageNo);
                    }
                });
            });
        }

        const openOrders = analyzed.filter((order) => {
            if (!matchesFilters(order, filters)) {
                return false;
            }
            return order.manageNo && !delivered.has(order.manageNo);
        });

        const yearReady = series.filter((row) => row.status === 'ready');
        const yearTotalKimono = yearReady.reduce((sum, row) => sum + (row.filteredKimono || 0), 0);
        const yearOverseas = yearReady.reduce((sum, row) => sum + (row.overseasKimono || 0), 0);
        const yearDomestic = yearReady.reduce((sum, row) => sum + (row.domesticKimono || 0), 0);
        const yearObi = yearReady.reduce((sum, row) => sum + (row.obiKimono || 0), 0);

        const filteredConflicts = conflicts.filter((row) => {
            if (filters.customerCode && filters.customerCode !== 'ALL'
                && row.customerCode !== filters.customerCode) {
                return false;
            }
            if (filters.kimonoType && filters.kimonoType !== 'ALL'
                && row.kimonoType !== filters.kimonoType) {
                return false;
            }
            return true;
        });

        return {
            version: VERSION,
            asOfDate: asOf,
            dataStartDate: dataStart,
            fiscal,
            fiscalYears: fiscalYears.map((y) => ({
                startYear: y.startYear,
                label: y.label,
            })),
            filters: {
                route: routeFilter,
                customerCode: customerFilter,
                kimonoType: kimonoFilter,
                selectedMonthKey,
            },
            filterOptions: {
                customers: [...customerOptions.entries()]
                    .map(([code, name]) => ({ customerCode: code, customerName: name }))
                    .sort((a, b) => a.customerName.localeCompare(b.customerName, 'ja')),
                kimonoTypes: [...kimonoOptions].sort((a, b) => a.localeCompare(b, 'ja')),
            },
            series,
            yearTotalKimono,
            yearTotals: {
                overseasKimono: yearOverseas,
                domesticKimono: yearDomestic,
                obiKimono: yearObi,
                tailorKimono: yearOverseas + yearDomestic + yearObi,
                conflictCount: filteredConflicts.length,
            },
            selectedMonth: {
                key: selectedMonthKey,
                label: selectedSeriesRow ? selectedSeriesRow.label : selectedMonthKey,
                status: selectedSeriesRow ? selectedSeriesRow.status : 'ready',
                overseasKimono: selectedMetrics.overseasKimono,
                domesticKimono: selectedMetrics.domesticKimono,
                obiKimono: selectedMetrics.obiKimono,
                tailorKimono: selectedMetrics.tailorKimono,
                filteredKimono: filterRouteCount(selectedMetrics, routeFilter),
                orderTotal: selectedMetrics.orderTotal,
                tailorAmount: selectedMetrics.tailorAmount,
                addonAmount: selectedMetrics.addonAmount,
                inseparableCount: selectedMetrics.inseparableCount,
                amountSeparable: selectedMetrics.inseparableCount === 0,
                avgOrderUnitPrice: avgOrder,
                avgTailorUnitPrice: avgTailor,
            },
            kimonoTypes: finalizeTypeMap(selectedMetrics.byKimonoType),
            customerRanking: buildCustomerRanking(selectedMetrics, previousMetrics, routeFilter),
            customerMatrix: buildCustomerMatrix(fiscal, monthBuckets, asOf, dataStart, routeFilter),
            conflicts: filteredConflicts.slice(0, 200),
            conflictCount: filteredConflicts.length,
            backlog: {
                openKimono: openOrders.length,
                orders: openOrders.slice(0, 200).map((order) => ({
                    manageNo: order.manageNo,
                    orderDate: order.orderDate,
                    customerCode: order.customerCode,
                    customerName: order.customerName,
                    kimonoType: order.kimonoType,
                    route: order.route,
                })),
            },
            meta: {
                orderRecordCount: opts.analyzed
                    ? analyzed.length
                    : (orderRecords || []).length,
                analyzedCount: analyzed.length,
                tailorKimonoInFiscal: analyzed.filter((o) => (
                    o.isTailorKimono
                    && o.orderDate >= fiscal.startDate
                    && o.orderDate <= fiscal.endDate
                )).length,
                conflictCountInFiscal: conflicts.length,
                notes: [
                    '枚数は distinct manage_no（着物単位）。qty合計ではない。',
                    '追加加工は仕立て枚数に数えない。',
                    '仕立て分類は海外仕立／国内仕立／帯仕立。複数同居は競合として報告し枚数に含めない。',
                    '金額は明細中分類で仕立/追加を分離。未解決は分離不可。',
                    '前年同月比較はデータ不足のため非表示。',
                ],
            },
        };
    };

    const parseMonthKey = (key) => {
        const text = String(key || '');
        const year = Number(text.slice(0, 4));
        const month = Number(text.slice(5, 7));
        return { year, month, key: `${year}-${pad2(month)}` };
    };

    const shiftMonthKey = (key, deltaMonths) => {
        const { year, month } = parseMonthKey(key);
        const index = year * 12 + (month - 1) + Number(deltaMonths || 0);
        const nextYear = Math.floor(index / 12);
        const nextMonth = (index % 12) + 1;
        return `${nextYear}-${pad2(nextMonth)}`;
    };

    const listMonthKeysEnding = (endKey, count) => {
        const n = Math.max(1, Number(count) || 1);
        const keys = [];
        for (let i = n - 1; i >= 0; i -= 1) {
            keys.push(shiftMonthKey(endKey, -i));
        }
        return keys;
    };

    /**
     * 当月は未完了として除外し、直前の完了月を返す。
     */
    const lastCompletedMonthKey = (asOfYmd) => {
        const asOf = normalizeYmd(asOfYmd) || todayYmdJst();
        return shiftMonthKey(asOf.slice(0, 7), -1);
    };

    const buildComparisonWindows = (asOfYmd, recentEndMonthKey, dataStartYmd) => {
        const asOf = normalizeYmd(asOfYmd) || todayYmdJst();
        const dataStart = normalizeYmd(dataStartYmd) || M().DATA_START_DATE || '2026-03-24';
        const declineCfg = M().DECLINE || {};
        const windowMonths = Number(declineCfg.WINDOW_MONTHS) || 3;
        const trendMonths = Number(declineCfg.TREND_MONTHS) || 12;
        const completed = lastCompletedMonthKey(asOf);
        let recentEnd = recentEndMonthKey ? String(recentEndMonthKey).slice(0, 7) : completed;
        if (recentEnd > completed) {
            recentEnd = completed;
        }
        const recentKeys = listMonthKeysEnding(recentEnd, windowMonths);
        const priorEnd = shiftMonthKey(recentKeys[0], -1);
        const priorKeys = listMonthKeysEnding(priorEnd, windowMonths);
        const trendKeys = listMonthKeysEnding(recentEnd, trendMonths);
        const priorStart = `${priorKeys[0]}-01`;
        const insufficient = priorStart < dataStart;
        const optionEnd = completed;
        const optionStart = shiftMonthKey(dataStart.slice(0, 7), 2);
        const recentEndOptions = [];
        let cursor = optionStart;
        while (cursor <= optionEnd) {
            recentEndOptions.push({
                key: cursor,
                label: `${Number(cursor.slice(0, 4))}年${Number(cursor.slice(5, 7))}月`,
            });
            cursor = shiftMonthKey(cursor, 1);
        }
        return {
            asOfDate: asOf,
            dataStartDate: dataStart,
            recentEndMonthKey: recentEnd,
            recentMonthKeys: recentKeys,
            priorMonthKeys: priorKeys,
            trendMonthKeys: trendKeys,
            recentLabel: `${recentKeys[0]}〜${recentKeys[recentKeys.length - 1]}`,
            priorLabel: `${priorKeys[0]}〜${priorKeys[priorKeys.length - 1]}`,
            insufficientComparison: insufficient,
            recentEndOptions,
            windowMonths,
            trendMonths,
        };
    };

    const orderMatchesRoute = (order, routeFilter) => {
        if (!order || !order.isTailorKimono) {
            return false;
        }
        if (!routeFilter || routeFilter === 'all') {
            return true;
        }
        return order.route === routeFilter;
    };

    const emptyRouteCounts = () => ({
        overseasKimono: 0,
        domesticKimono: 0,
        obiKimono: 0,
        tailorKimono: 0,
        orderTotal: 0,
    });

    const addRouteCount = (bucket, order) => {
        if (!order || !order.isTailorKimono) {
            return;
        }
        if (order.route === 'overseas') {
            bucket.overseasKimono += 1;
        } else if (order.route === 'domestic') {
            bucket.domesticKimono += 1;
        } else if (order.route === 'obi') {
            bucket.obiKimono += 1;
        }
        bucket.tailorKimono += 1;
        bucket.orderTotal += order.orderTotal || 0;
    };

    const routeCountValue = (bucket, routeFilter) => {
        if (routeFilter === 'overseas') {
            return bucket.overseasKimono;
        }
        if (routeFilter === 'domestic') {
            return bucket.domesticKimono;
        }
        if (routeFilter === 'obi') {
            return bucket.obiKimono;
        }
        return bucket.tailorKimono;
    };

    const classifyDeclineStatus = (priorCount, recentCount, thresholds) => {
        const majorPct = Number(thresholds?.majorDeclinePct);
        const declinePct = Number(thresholds?.declinePct);
        const growthPct = Number(thresholds?.growthPct);
        const major = Number.isFinite(majorPct) ? majorPct : 50;
        const mild = Number.isFinite(declinePct) ? declinePct : 20;
        const growth = Number.isFinite(growthPct) ? growthPct : 20;

        if (priorCount <= 0) {
            if (recentCount > 0) {
                return { status: 'up', rate: null };
            }
            return { status: 'stable', rate: null };
        }
        if (recentCount === 0) {
            return { status: 'stopped', rate: -1 };
        }
        const rate = (recentCount - priorCount) / priorCount;
        if (rate <= -(major / 100)) {
            return { status: 'major_down', rate };
        }
        if (rate <= -(mild / 100)) {
            return { status: 'down', rate };
        }
        if (rate >= (growth / 100)) {
            return { status: 'up', rate };
        }
        return { status: 'stable', rate };
    };

    const buildCustomerMasterLookup = (customerRecords) => {
        const cf = F().customer || { customerCode: 'customer_code', customerName: 'customer_name' };
        const byCode = new Map();
        (customerRecords || []).forEach((record) => {
            const code = String(getFieldValue(record, cf.customerCode)).trim();
            const name = String(getFieldValue(record, cf.customerName)).trim();
            if (code) {
                byCode.set(code, name || code);
            }
        });
        return byCode;
    };

    /**
     * 月次・減少分析で共用する受注解析ソース。
     */
    const prepareMonthlySource = async (options) => {
        assertDeps();
        const opts = options || {};
        const of = F().order;
        const pf = F().product;
        const cf = F().customer || { customerCode: 'customer_code', customerName: 'customer_name' };
        const orderFields = [
            of.manageNo, of.orderDate, of.customerCode, of.customerName,
            of.kimonoType, of.kimonoSpec, of.detailTable, of.aggregationStatus,
        ];
        const productFields = [pf.itemCode, pf.itemName, pf.subcategory];
        const customerFields = [cf.customerCode, cf.customerName];

        const [orderRecords, productRecords, customerRecords] = await Promise.all([
            opts.orders
                ? Promise.resolve(opts.orders)
                : fetchAllRecords(CFG().ORDER_APP_ID, 'order by order_date asc', orderFields),
            opts.products
                ? Promise.resolve(opts.products)
                : fetchAllRecords(CFG().PRODUCT_APP_ID, 'order by ' + pf.itemCode + ' asc', productFields),
            opts.customers
                ? Promise.resolve(opts.customers)
                : (CFG().CUSTOMER_APP_ID
                    ? fetchAllRecords(CFG().CUSTOMER_APP_ID, 'order by ' + cf.customerCode + ' asc', customerFields)
                    : Promise.resolve([])),
        ]);

        const lookup = buildProductLookup(productRecords);
        const customerMaster = buildCustomerMasterLookup(customerRecords);
        const byManage = new Map();
        const conflicts = [];

        (orderRecords || []).forEach((record) => {
            if (!isAggregationActive(record)) {
                return;
            }
            const order = analyzeOrder(record, lookup);
            if (!order.manageNo || !order.orderDate) {
                return;
            }
            if (customerMaster.has(order.customerCode)) {
                order.customerName = customerMaster.get(order.customerCode);
            }
            const existing = byManage.get(order.manageNo);
            if (!existing || order.orderDate >= existing.orderDate) {
                byManage.set(order.manageNo, order);
            }
        });

        const analyzed = [...byManage.values()];
        analyzed.forEach((order) => {
            if (order.isConflict) {
                conflicts.push({
                    manageNo: order.manageNo,
                    orderDate: order.orderDate,
                    customerCode: order.customerCode,
                    customerName: order.customerName,
                    kimonoType: order.kimonoType,
                    tailorCategories: (order.tailorCategories || []).slice(),
                    orderTotal: order.orderTotal,
                });
            }
        });

        return {
            analyzed,
            conflicts,
            customerMaster,
            productLookup: lookup,
            orderRecordCount: (orderRecords || []).length,
            productRecordCount: (productRecords || []).length,
            customerRecordCount: (customerRecords || []).length,
        };
    };

    /**
     * 受注減少得意先レポート
     */
    const buildDeclineReport = async (options) => {
        assertDeps();
        const opts = options || {};
        const asOf = normalizeYmd(opts.asOfDate) || todayYmdJst();
        const dataStart = M().DATA_START_DATE || '2026-03-24';
        const declineCfg = M().DECLINE || {};
        const windows = buildComparisonWindows(asOf, opts.recentEndMonthKey, dataStart);
        const routeFilter = opts.route || 'all';
        const searchText = String(opts.search || '').trim().toLowerCase();
        const statusFilter = opts.statusFilter || 'all';
        const sortBy = opts.sortBy || 'delta';
        const thresholds = {
            majorDeclinePct: opts.majorDeclinePct ?? declineCfg.DEFAULT_MAJOR_DECLINE_PCT ?? 50,
            declinePct: opts.declinePct ?? declineCfg.DEFAULT_DECLINE_PCT ?? 20,
            growthPct: opts.growthPct ?? declineCfg.DEFAULT_GROWTH_PCT ?? 20,
        };

        const source = opts.analyzed
            ? {
                analyzed: opts.analyzed,
                conflicts: opts.conflicts || [],
                customerMaster: opts.customerMaster || new Map(),
                orderRecordCount: opts.orderRecordCount || (opts.analyzed || []).length,
            }
            : await prepareMonthlySource(opts);

        const recentSet = new Set(windows.recentMonthKeys);
        const priorSet = new Set(windows.priorMonthKeys);
        const trendSet = new Set(windows.trendMonthKeys);
        const customers = new Map();

        const ensure = (code, name) => {
            const key = code || '（未設定）';
            if (!customers.has(key)) {
                customers.set(key, {
                    customerCode: key,
                    customerName: name || key,
                    prior: emptyRouteCounts(),
                    recent: emptyRouteCounts(),
                    trend: Object.fromEntries(windows.trendMonthKeys.map((k) => [k, emptyRouteCounts()])),
                    lastOrderDate: '',
                    conflictCount: 0,
                    manageNos: new Set(),
                });
            }
            const row = customers.get(key);
            if (name && (!row.customerName || row.customerName === key)) {
                row.customerName = name;
            }
            return row;
        };

        (source.analyzed || []).forEach((order) => {
            if (!order.manageNo) {
                return;
            }
            const monthKey = order.orderDate.slice(0, 7);
            const row = ensure(order.customerCode, order.customerName);
            if (order.isConflict) {
                if (recentSet.has(monthKey) || priorSet.has(monthKey) || trendSet.has(monthKey)) {
                    row.conflictCount += 1;
                }
                return;
            }
            if (!order.isTailorKimono) {
                return;
            }
            if (order.orderDate > row.lastOrderDate) {
                row.lastOrderDate = order.orderDate;
            }
            if (!orderMatchesRoute(order, routeFilter)) {
                return;
            }
            if (row.manageNos.has(order.manageNo)) {
                return;
            }
            row.manageNos.add(order.manageNo);
            if (priorSet.has(monthKey)) {
                addRouteCount(row.prior, order);
            }
            if (recentSet.has(monthKey)) {
                addRouteCount(row.recent, order);
            }
            if (trendSet.has(monthKey)) {
                addRouteCount(row.trend[monthKey], order);
            }
        });

        const rows = [...customers.values()].map((row) => {
            const priorCount = routeCountValue(row.prior, routeFilter);
            const recentCount = routeCountValue(row.recent, routeFilter);
            const classified = classifyDeclineStatus(priorCount, recentCount, thresholds);
            const delta = recentCount - priorCount;
            const trend = windows.trendMonthKeys.map((key) => ({
                key,
                label: `${Number(key.slice(5, 7))}月`,
                overseasKimono: row.trend[key].overseasKimono,
                domesticKimono: row.trend[key].domesticKimono,
                obiKimono: row.trend[key].obiKimono,
                tailorKimono: row.trend[key].tailorKimono,
                filteredKimono: routeCountValue(row.trend[key], routeFilter),
                orderTotal: row.trend[key].orderTotal,
            }));
            return {
                customerCode: row.customerCode,
                customerName: row.customerName,
                priorCount,
                recentCount,
                delta,
                rate: classified.rate,
                status: classified.status,
                recentAmount: row.recent.orderTotal,
                lastOrderDate: row.lastOrderDate || null,
                conflictCount: row.conflictCount,
                priorBreakdown: { ...row.prior },
                recentBreakdown: { ...row.recent },
                trend,
                orderAppQuery: `customer_code = "${String(row.customerCode).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
            };
        }).filter((row) => {
            if (row.priorCount === 0 && row.recentCount === 0 && row.conflictCount === 0) {
                return false;
            }
            if (searchText) {
                const hay = `${row.customerCode} ${row.customerName}`.toLowerCase();
                if (hay.indexOf(searchText) < 0) {
                    return false;
                }
            }
            if (statusFilter && statusFilter !== 'all' && row.status !== statusFilter) {
                return false;
            }
            return true;
        });

        const statusRank = {
            stopped: 0,
            major_down: 1,
            down: 2,
            stable: 3,
            up: 4,
        };

        rows.sort((a, b) => {
            if (sortBy === 'rate') {
                const ar = a.rate === null ? 999 : a.rate;
                const br = b.rate === null ? 999 : b.rate;
                return ar - br || a.delta - b.delta || a.customerCode.localeCompare(b.customerCode, 'ja');
            }
            if (sortBy === 'amount') {
                return b.recentAmount - a.recentAmount || a.delta - b.delta;
            }
            if (sortBy === 'status') {
                return (statusRank[a.status] - statusRank[b.status]) || a.delta - b.delta;
            }
            return a.delta - b.delta || (a.rate === null ? 1 : a.rate) - (b.rate === null ? 1 : b.rate);
        });

        const summary = {
            totalCustomers: rows.length,
            stopped: rows.filter((r) => r.status === 'stopped').length,
            majorDown: rows.filter((r) => r.status === 'major_down').length,
            down: rows.filter((r) => r.status === 'down').length,
            stable: rows.filter((r) => r.status === 'stable').length,
            up: rows.filter((r) => r.status === 'up').length,
        };

        const windowConflicts = (source.conflicts || []).filter((c) => {
            const key = String(c.orderDate || '').slice(0, 7);
            return recentSet.has(key) || priorSet.has(key);
        });

        return {
            version: VERSION,
            asOfDate: asOf,
            dataStartDate: dataStart,
            windows,
            filters: {
                route: routeFilter,
                search: opts.search || '',
                statusFilter,
                sortBy,
                recentEndMonthKey: windows.recentEndMonthKey,
                thresholds,
            },
            summary,
            rows,
            conflicts: windowConflicts,
            conflictCount: windowConflicts.length,
            meta: {
                orderRecordCount: source.orderRecordCount || 0,
                analyzedCount: (source.analyzed || []).length,
                notes: [
                    '直近完了月を終点とする3か月 vs その前3か月。',
                    '当月（未完了月）は基本比較に含めない。',
                    '比較前0枚の増減率は算出しない。',
                    '分類競合は仕立て枚数に含めず別表示。',
                    '顧客コード基準。名称はApp8顧客マスタを優先。',
                ],
            },
        };
    };

    /* テスト用に公開 */
    window.CAYANAS_BusinessDashboardMonthly = {
        VERSION,
        todayYmdJst,
        normalizeSubcategory,
        classifyKimonoRoute,
        classifyTailorRouteDetail,
        analyzeOrder,
        fiscalYearRange,
        listFiscalYears,
        monthStatus,
        buildProductLookup,
        buildMonthlyReport,
        shiftMonthKey,
        listMonthKeysEnding,
        lastCompletedMonthKey,
        buildComparisonWindows,
        classifyDeclineStatus,
        buildCustomerMasterLookup,
        prepareMonthlySource,
        buildDeclineReport,
    };

}());
