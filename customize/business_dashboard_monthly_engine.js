(function () {
    'use strict';

    /**
     * App82 経営月次 — 8月起算12か月集計（読取専用）
     * CAYANAS_BusinessDashboardMonthly
     */

    const VERSION = '1.0.0';

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

    /**
     * @returns {'overseas'|'domestic'|'other'}
     */
    const classifyKimonoRoute = (subcategories) => {
        const set = new Set((subcategories || []).map(normalizeSubcategory).filter(Boolean));
        const overseas = M().OVERSEAS_SUBCATEGORY || '海外仕立';
        const domestic = M().DOMESTIC_SUBCATEGORIES || ['国内仕立', '帯仕立'];
        if (set.has(overseas)) {
            return 'overseas';
        }
        for (let i = 0; i < domestic.length; i += 1) {
            if (set.has(domestic[i])) {
                return 'domestic';
            }
        }
        return 'other';
    };

    const isTailorSubcategory = (sub) => {
        const list = M().TAILOR_SUBCATEGORIES || ['海外仕立', '国内仕立', '帯仕立'];
        return list.indexOf(normalizeSubcategory(sub)) >= 0;
    };

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

        const route = classifyKimonoRoute(subs);

        return {
            manageNo,
            orderDate,
            customerCode,
            customerName,
            kimonoType,
            kimonoSpec,
            route,
            orderTotal,
            tailorAmount,
            addonAmount,
            unresolvedAmount,
            amountSeparable: !hasUnresolved,
            isTailorKimono: route === 'overseas' || route === 'domestic',
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
                tailorKimono: 0,
            });
        }
        return map.get(key);
    };

    const addOrderToMonth = (bucket, order) => {
        if (!order.manageNo || !order.isTailorKimono) {
            return;
        }
        if (order.route === 'overseas') {
            bucket.overseasKimono += 1;
        } else if (order.route === 'domestic') {
            bucket.domesticKimono += 1;
        }
        bucket.tailorKimono += 1;
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
            if (order.route === 'overseas') {
                cust.overseasKimono += 1;
            } else {
                cust.domesticKimono += 1;
            }
            cust.tailorKimono += 1;
        }
        cust.orderTotal += order.orderTotal;
        if (order.amountSeparable) {
            cust.tailorAmount += order.tailorAmount;
            cust.addonAmount += order.addonAmount;
        } else {
            cust.inseparableCount += 1;
        }

        const typeRow = ensureType(bucket.byKimonoType, order.kimonoType);
        if (order.route === 'overseas') {
            typeRow.overseasKimono += 1;
        } else {
            typeRow.domesticKimono += 1;
        }
        typeRow.tailorKimono += 1;
    };

    const finalizeCustomerMap = (map) => (
        [...map.values()].map((row) => ({
            customerCode: row.customerCode,
            customerName: row.customerName,
            overseasKimono: row.overseasKimono,
            domesticKimono: row.domesticKimono,
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
        return metrics.tailorKimono;
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
                const value = routeFilter === 'overseas'
                    ? row.overseasKimono
                    : routeFilter === 'domestic'
                        ? row.domesticKimono
                        : row.tailorKimono;
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
            const currentCount = routeFilter === 'overseas'
                ? row.overseasKimono
                : routeFilter === 'domestic'
                    ? row.domesticKimono
                    : row.tailorKimono;
            const prevCount = prev
                ? (routeFilter === 'overseas'
                    ? prev.overseasKimono
                    : routeFilter === 'domestic'
                        ? prev.domesticKimono
                        : prev.tailorKimono)
                : 0;
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
     *   route?: 'all'|'overseas'|'domestic',
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
            opts.orders
                ? Promise.resolve(opts.orders)
                : fetchAllRecords(CFG().ORDER_APP_ID, 'order by order_date asc', orderFields),
            opts.products
                ? Promise.resolve(opts.products)
                : fetchAllRecords(CFG().PRODUCT_APP_ID, 'order by ' + pf.itemCode + ' asc', productFields),
            opts.deliveredManageNos
                ? Promise.resolve(null)
                : fetchAllRecords(CFG().DELIVERY_APP_ID, 'order by レコード番号 asc', deliveryFields),
        ]);

        const lookup = buildProductLookup(productRecords);
        const analyzed = [];
        const customerOptions = new Map();
        const kimonoOptions = new Set();

        (orderRecords || []).forEach((record) => {
            if (!isAggregationActive(record)) {
                return;
            }
            const order = analyzeOrder(record, lookup);
            if (!order.manageNo || !order.orderDate) {
                return;
            }
            analyzed.push(order);
            if (order.isTailorKimono) {
                customerOptions.set(
                    order.customerCode || '（未設定）',
                    order.customerName || order.customerCode || '（未設定）'
                );
                kimonoOptions.add(order.kimonoType || '—');
            }
        });

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
            selectedMonth: {
                key: selectedMonthKey,
                label: selectedSeriesRow ? selectedSeriesRow.label : selectedMonthKey,
                status: selectedSeriesRow ? selectedSeriesRow.status : 'ready',
                overseasKimono: selectedMetrics.overseasKimono,
                domesticKimono: selectedMetrics.domesticKimono,
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
                orderRecordCount: (orderRecords || []).length,
                analyzedCount: analyzed.length,
                tailorKimonoInFiscal: analyzed.filter((o) => (
                    o.isTailorKimono
                    && o.orderDate >= fiscal.startDate
                    && o.orderDate <= fiscal.endDate
                )).length,
                notes: [
                    '枚数は distinct manage_no（着物単位）。qty合計ではない。',
                    '追加加工は仕立て枚数に数えない。',
                    '金額は明細中分類で仕立/追加を分離。未解決は分離不可。',
                    '前年同月比較はデータ不足のため非表示。',
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
        analyzeOrder,
        fiscalYearRange,
        listFiscalYears,
        monthStatus,
        buildProductLookup,
        buildMonthlyReport,
    };

}());
