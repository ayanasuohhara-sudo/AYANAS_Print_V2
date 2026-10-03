(function () {
    'use strict';

    /**
     * 業務ダッシュボード — App16 / App19 / App13 読取集計
     */

    const assertDeps = () => {

        if (typeof CAYANAS_BUSINESS_DASHBOARD === 'undefined') {
            throw new Error('CAYANAS_BUSINESS_DASHBOARD が未読込です。business_dashboard_config.js を先に登録してください。');
        }

    };

    const CFG = () => CAYANAS_BUSINESS_DASHBOARD;
    const F = () => CFG().FIELDS;

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

    const escapeQueryValue = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const normalizeYmd = (value) => String(value ?? '').trim().slice(0, 10);

    const dateInRange = (ymd, start, end) => {

        const d = normalizeYmd(ymd);

        return d !== '' && d >= start && d <= end;

    };

    const resolveWasaiShipDate = (record, shipDateFields) => {

        for (let index = 0; index < shipDateFields.length; index += 1) {

            const value = normalizeYmd(getFieldValue(record, shipDateFields[index]));

            if (value) {
                return value;
            }

        }

        return '';

    };

    const resolveOverseasManageNo = (record, cfg) => {

        let manageNo = String(getFieldValue(record, cfg.overseasManageNo)).trim();

        if (manageNo) {
            return manageNo;
        }

        const table = record[cfg.detailsTable];
        const rows = Array.isArray(table?.value) ? table.value : [];

        for (let index = 0; index < rows.length; index += 1) {

            manageNo = String(rows[index]?.value?.[cfg.detailManageNo]?.value ?? '').trim();

            if (manageNo) {
                return manageNo;
            }

        }

        return String(getFieldValue(record, cfg.manageNo)).trim();

    };

    const fetchLogisticsInboundCache = async () => {

        const L = CFG().LOGISTICS;
        const inboundRollupQuery = 'order by レコード番号 asc';

        const [inbound27, inbound74] = await Promise.all([
            fetchAllRecords(L.outsource.appId, inboundRollupQuery, [L.outsource.detailTable]),
            fetchAllRecords(L.wasai.appId, inboundRollupQuery, [L.wasai.linesTable]),
        ]);

        return { inbound27, inbound74 };

    };

    const buildLogisticsMetrics = async (period, inboundCache) => {

        const start = period.orderStart;
        const end = period.orderEnd;
        const L = CFG().LOGISTICS;

        const emptyRoute = () => ({ outbound: 0, inbound: 0 });

        const result = {
            overseas: emptyRoute(),
            wasai: emptyRoute(),
            outsource: emptyRoute(),
        };

        const o27 = L.outsource;
        const outbound27Query = `${o27.shipDate} >= "${escapeQueryValue(start)}" and ${o27.shipDate} <= "${escapeQueryValue(end)}" order by レコード番号 asc`;

        const o28 = L.overseas;
        const outbound28Query = `${o28.shipDate} >= "${escapeQueryValue(start)}" and ${o28.shipDate} <= "${escapeQueryValue(end)}" order by レコード番号 asc`;
        const inbound28Query = `${o28.inboundDate} >= "${escapeQueryValue(start)}" and ${o28.inboundDate} <= "${escapeQueryValue(end)}" order by レコード番号 asc`;

        const o74 = L.wasai;
        const shipField = o74.shipDateFields[0];
        const outbound74Query = `${shipField} >= "${escapeQueryValue(start)}" and ${shipField} <= "${escapeQueryValue(end)}" order by レコード番号 asc`;
        const inboundRollupQuery = 'order by レコード番号 asc';
        const inbound27Promise = inboundCache?.inbound27
            ? Promise.resolve(inboundCache.inbound27)
            : fetchAllRecords(o27.appId, inboundRollupQuery, [o27.detailTable]);
        const inbound74Promise = inboundCache?.inbound74
            ? Promise.resolve(inboundCache.inbound74)
            : fetchAllRecords(o74.appId, inboundRollupQuery, [o74.linesTable]);
        const [
            outbound27,
            inbound27,
            outbound28,
            inbound28,
            outbound74,
            inbound74,
        ] = await Promise.all([
            fetchAllRecords(o27.appId, outbound27Query, [o27.shipDate, o27.detailTable]),
            inbound27Promise,
            fetchAllRecords(o28.appId, outbound28Query, [o28.shipDate, o28.overseasManageNo, o28.manageNo, o28.detailsTable]),
            fetchAllRecords(o28.appId, inbound28Query, [o28.inboundDate, o28.overseasManageNo, o28.manageNo, o28.detailsTable]),
            fetchAllRecords(o74.appId, outbound74Query, [...o74.shipDateFields, o74.linesTable]),
            inbound74Promise,
        ]);

        const outbound27Set = new Set();

        outbound27.forEach((record) => {

            const rows = record[o27.detailTable]?.value ?? [];

            rows.forEach((row) => {

                const manageNo = String(row?.value?.[o27.detailManageNo]?.value ?? '').trim();

                if (manageNo) {
                    outbound27Set.add(manageNo);
                }

            });

        });

        const inbound27Set = new Set();

        inbound27.forEach((record) => {

            const rows = record[o27.detailTable]?.value ?? [];

            rows.forEach((row) => {

                const rowValue = row?.value ?? {};
                const manageNo = String(rowValue[o27.detailManageNo]?.value ?? '').trim();
                const lineIn = normalizeYmd(rowValue[o27.lineInDate]?.value);

                if (manageNo && dateInRange(lineIn, start, end)) {
                    inbound27Set.add(manageNo);
                }

            });

        });

        const outbound28Set = new Set();

        outbound28.forEach((record) => {

            const manageNo = resolveOverseasManageNo(record, o28);

            if (manageNo) {
                outbound28Set.add(manageNo);
            }

        });

        const inbound28Set = new Set();

        inbound28.forEach((record) => {

            const inbound = normalizeYmd(getFieldValue(record, o28.inboundDate));

            if (!dateInRange(inbound, start, end)) {
                return;
            }

            const manageNo = resolveOverseasManageNo(record, o28);

            if (manageNo) {
                inbound28Set.add(manageNo);
            }

        });

        const outbound74Set = new Set();

        outbound74.forEach((record) => {

            const ship = resolveWasaiShipDate(record, o74.shipDateFields);

            if (!dateInRange(ship, start, end)) {
                return;
            }

            const rows = record[o74.linesTable]?.value ?? [];

            rows.forEach((row) => {

                const manageNo = String(row?.value?.[o74.lineManageNo]?.value ?? '').trim();

                if (manageNo) {
                    outbound74Set.add(manageNo);
                }

            });

        });

        const inbound74Set = new Set();

        inbound74.forEach((record) => {

            const rows = record[o74.linesTable]?.value ?? [];

            rows.forEach((row) => {

                const rowValue = row?.value ?? {};
                const manageNo = String(rowValue[o74.lineManageNo]?.value ?? '').trim();
                const inbound = normalizeYmd(rowValue[o74.lineInboundDate]?.value);

                if (manageNo && dateInRange(inbound, start, end)) {
                    inbound74Set.add(manageNo);
                }

            });

        });

        result.outsource = { outbound: outbound27Set.size, inbound: inbound27Set.size };
        result.overseas = { outbound: outbound28Set.size, inbound: inbound28Set.size };
        result.wasai = { outbound: outbound74Set.size, inbound: inbound74Set.size };

        return result;

    };

    const emptySegmentMetrics = () => ({
        orderKimono: 0,
        deliveryKimono: 0,
        orderPoints: 0,
        deliveryPoints: 0,
        orderAmount: 0,
        deliveryAmount: 0,
    });

    const cloneSegmentMetrics = (source) => ({
        orderKimono: source.orderKimono,
        deliveryKimono: source.deliveryKimono,
        orderPoints: source.orderPoints,
        deliveryPoints: source.deliveryPoints,
        orderAmount: source.orderAmount,
        deliveryAmount: source.deliveryAmount,
    });

    const addSegmentMetrics = (target, delta) => {

        target.orderKimono += delta.orderKimono;
        target.deliveryKimono += delta.deliveryKimono;
        target.orderPoints += delta.orderPoints;
        target.deliveryPoints += delta.deliveryPoints;
        target.orderAmount += delta.orderAmount;
        target.deliveryAmount += delta.deliveryAmount;

    };

    const sumSegmentsToTotal = (honsha, ayanas) => ({
        orderKimono: honsha.orderKimono + ayanas.orderKimono,
        deliveryKimono: honsha.deliveryKimono + ayanas.deliveryKimono,
        orderPoints: honsha.orderPoints + ayanas.orderPoints,
        deliveryPoints: honsha.deliveryPoints + ayanas.deliveryPoints,
        orderAmount: honsha.orderAmount + ayanas.orderAmount,
        deliveryAmount: honsha.deliveryAmount + ayanas.deliveryAmount,
    });

    const segmentKeyForCustomer = (customerCode) => (
        String(customerCode ?? '').trim() === CFG().A550_CUSTOMER_CODE ? 'ayanas' : 'honsha'
    );

    const fetchAllRecords = async (appId, query, fields) => {

        const all = [];
        let offset = 0;
        const limit = 500;

        while (true) {

            const chunkQuery = `${query} limit ${limit} offset ${offset}`;

            const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
                app: appId,
                query: chunkQuery,
                fields,
            });

            all.push(...response.records);

            if (response.records.length < limit) {
                break;
            }

            offset += limit;

        }

        return all;

    };

    const parseYmdParts = (ymd) => {

        const parts = String(ymd ?? '').trim().split('-').map(Number);

        if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) {
            return null;
        }

        return { y: parts[0], m: parts[1], d: parts[2] };

    };

    const formatYmd = (date) => {

        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');

        return `${y}-${m}-${d}`;

    };

    const addDays = (ymd, days) => {

        const parts = parseYmdParts(ymd);

        if (!parts) {
            return ymd;
        }

        const date = new Date(parts.y, parts.m - 1, parts.d);

        date.setDate(date.getDate() + days);

        return formatYmd(date);

    };

    const monthRange = (year, monthIndex0) => {

        const start = formatYmd(new Date(year, monthIndex0, 1));
        const end = formatYmd(new Date(year, monthIndex0 + 1, 0));

        return { start, end };

    };

    const resolvePeriod = (preset, customStart, customEnd) => {

        const today = todayYmdJst();
        const parts = parseYmdParts(today);

        let start = today;
        let end = today;
        let label = CFG().UI.periodToday;

        if (preset === 'yesterday') {

            start = addDays(today, -1);
            end = start;
            label = CFG().UI.periodYesterday;

        } else if (preset === 'this_month' && parts) {

            const range = monthRange(parts.y, parts.m - 1);

            start = range.start;
            end = range.end;
            label = CFG().UI.periodThisMonth;

        } else if (preset === 'last_month' && parts) {

            const range = monthRange(parts.y, parts.m - 2);

            start = range.start;
            end = range.end;
            label = CFG().UI.periodLastMonth;

        } else if (preset === 'custom') {

            start = String(customStart ?? '').trim() || today;
            end = String(customEnd ?? '').trim() || start;
            label = `${start} 〜 ${end}`;

        } else if (preset === 'fiscal_year' && parts) {

            // 今年度 = 6/1 〜 翌5/31（JST）
            const fyStartYear = parts.m >= 6 ? parts.y : parts.y - 1;
            const rangeStart = formatYmd(new Date(fyStartYear, 5, 1));
            const rangeEnd = formatYmd(new Date(fyStartYear + 1, 4, 31));

            start = rangeStart;
            end = rangeEnd;
            label = CFG().UI.periodFiscalYear;

        }

        if (start > end) {
            const swap = start;

            start = end;
            end = swap;
        }

        return {
            preset,
            label,
            orderStart: start,
            orderEnd: end,
            deliveryStart: start,
            deliveryEnd: end,
        };

    };

    const buildProductLookup = (productRecords) => {

        const pf = F().product;
        const byCode = new Map();
        const byName = new Map();
        const subcategorySet = new Set();

        productRecords.forEach((record) => {

            const code = String(getFieldValue(record, pf.itemCode)).trim();
            const name = String(getFieldValue(record, pf.itemName)).trim();
            const subcategory = String(getFieldValue(record, pf.subcategory)).trim();

            if (subcategory) {
                subcategorySet.add(subcategory);
            }

            if (code) {
                byCode.set(code, subcategory);
            }

            if (name && !byName.has(name)) {
                byName.set(name, subcategory);
            }

        });

        return {
            byCode,
            byName,
            subcategories: [...subcategorySet].sort((a, b) => a.localeCompare(b, 'ja')),
        };

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

    const lineQty = (rawQty, qtyStats) => {

        const qty = toNumber(rawQty);
        const effective = qty > 0 ? qty : 1;

        if (effective !== 1) {
            qtyStats.nonOneLineCount += 1;
        }

        qtyStats.totalLines += 1;

        return effective;

    };

    const isEmptyOrderDetail = (rowValue) => {

        const of = F().order;
        const itemCode = String(rowValue?.[of.itemCode]?.value ?? '').trim();
        const itemName = String(rowValue?.[of.itemName]?.value ?? '').trim();
        const amount = toNumber(rowValue?.[of.amount]?.value);

        if (itemCode === '' && itemName === '') {
            return true;
        }

        return itemName === '' && amount === 0;

    };

    const isEmptyDeliveryDetail = (rowValue) => {

        const df = F().delivery;
        const itemName = String(rowValue?.[df.itemName]?.value ?? '').trim();
        const amount = toNumber(rowValue?.[df.amount]?.value);

        if (itemName === '') {
            return amount === 0;
        }

        return false;

    };

    const classifyKimonoRouteBucket = (subcategoriesOnOrder, sekkaiNames) => {

        const subs = new Set(subcategoriesOnOrder.map((s) => String(s ?? '').trim()).filter(Boolean));

        if (subs.has('海外仕立')) {
            return 'overseas';
        }

        if (subs.has('国内仕立') || subs.has('帯仕立')) {
            return 'domestic';
        }

        for (let index = 0; index < sekkaiNames.length; index += 1) {

            if (subs.has(sekkaiNames[index])) {
                return 'sekkai';
            }

        }

        return 'other';

    };

    const createKimonoTypeSpecBucket = () => ({

        overseas: new Set(),
        domestic: new Set(),
        sekkai: new Set(),
        other: new Set(),

    });

    const ensureKimonoTypeSpecRow = (map, kimonoType, kimonoSpec) => {

        const type = String(kimonoType ?? '').trim() || '—';
        const spec = String(kimonoSpec ?? '').trim() || '—';
        const key = `${type}\t${spec}`;

        if (!map.has(key)) {
            map.set(key, {
                kimonoType: type,
                kimonoSpec: spec,
                buckets: createKimonoTypeSpecBucket(),
            });
        }

        return map.get(key);

    };

    const finalizeKimonoTypeSpecMap = (map) => (
        [...map.values()].map((row) => ({
            kimonoType: row.kimonoType,
            kimonoSpec: row.kimonoSpec,
            total: row.buckets.overseas.size
                + row.buckets.domestic.size
                + row.buckets.sekkai.size
                + row.buckets.other.size,
            overseas: row.buckets.overseas.size,
            domestic: row.buckets.domestic.size,
            sekkai: row.buckets.sekkai.size,
            other: row.buckets.other.size,
        })).sort((a, b) => {

            if (b.total !== a.total) {
                return b.total - a.total;
            }

            if (a.kimonoType < b.kimonoType) {
                return -1;
            }

            if (a.kimonoType > b.kimonoType) {
                return 1;
            }

            return a.kimonoSpec.localeCompare(b.kimonoSpec, 'ja');

        })
    );

    const mapA550ProcessingLabel = (subcategory, knownLabels) => {

        const sub = String(subcategory ?? '').trim();

        if (!sub) {
            return 'その他';
        }

        if (knownLabels.indexOf(sub) >= 0) {
            return sub;
        }

        return 'その他';

    };

    const mapPipelineProcessingLabel = (subcategory) => {

        const labels = CFG().PIPELINE_PROCESSING_LABELS.filter((l) => l !== 'その他');

        return mapA550ProcessingLabel(subcategory, labels);

    };

    const createPipelineSegment = (processingLabels) => {

        const byProcessing = {};

        processingLabels.forEach((name) => {

            byProcessing[name] = { name, kimonoSet: new Set(), points: 0 };

        });

        return {
            summary: {
                openKimono: 0,
                openPoints: 0,
                openAmount: 0,
                overdueKimono: 0,
                within7Kimono: 0,
                thisMonthKimono: 0,
            },
            byProcess: new Map(),
            byLocation: new Map(),
            byProcessing,
        };

    };

    const finalizePipelineBreakdown = (map) => (
        [...map.entries()]
            .map(([name, set]) => ({ name, kimono: set.size }))
            .sort((a, b) => {

                if (b.kimono !== a.kimono) {
                    return b.kimono - a.kimono;
                }

                return a.name.localeCompare(b.name, 'ja');

            })
    );

    const finalizePipelineSegment = (segment, processingLabels) => {

        const processing = processingLabels.map((name) => {

            const row = segment.byProcessing[name];

            return {
                name,
                kimono: row.kimonoSet.size,
                points: row.points,
            };

        });

        return {
            summary: { ...segment.summary },
            byProcessStatus: finalizePipelineBreakdown(segment.byProcess),
            byLocationStatus: finalizePipelineBreakdown(segment.byLocation),
            byProcessing: processing,
        };

    };

    const buildPipelineMetrics = async (productLookup) => {

        const of = F().order;
        const df = F().delivery;
        const emptyStatus = CFG().UI.emptyStatusLabel;
        const processingLabels = CFG().PIPELINE_PROCESSING_LABELS;
        const today = todayYmdJst();
        const todayPlus7 = addDays(today, 7);
        const parts = parseYmdParts(today);
        const thisMonth = parts ? monthRange(parts.y, parts.m - 1) : { start: today, end: today };

        const orderFields = [
            of.manageNo,
            of.orderDate,
            of.deadline,
            of.customerCode,
            of.customerName,
            of.kimonoType,
            of.kimonoSpec,
            of.processStatus,
            of.locationStatus,
            of.detailTable,
            of.itemCode,
            of.itemName,
            of.qty,
            of.amount,
        ];

        const deliveryFields = [df.detailTable];

        const [allOrders, allDeliveries] = await Promise.all([
            fetchAllRecords(CFG().ORDER_APP_ID, 'order by レコード番号 asc', orderFields),
            fetchAllRecords(CFG().DELIVERY_APP_ID, 'order by レコード番号 asc', deliveryFields),
        ]);

        const deliveredManageNos = new Set();

        allDeliveries.forEach((record) => {

            const table = record[df.detailTable];
            const rows = Array.isArray(table?.value) ? table.value : [];

            rows.forEach((row) => {

                const manageNo = String(row?.value?.[df.manageNo]?.value ?? '').trim();

                if (manageNo) {
                    deliveredManageNos.add(manageNo);
                }

            });

        });

        const groups = new Map();
        const processValuesSeen = new Set();
        const locationValuesSeen = new Set();
        const app16ManageNos = new Set();
        const pipelineQtyStats = { totalLines: 0, nonOneLineCount: 0 };

        const recordPointsAndAmount = (record) => {

            let points = 0;
            let amount = 0;
            const table = record[of.detailTable];
            const rows = Array.isArray(table?.value) ? table.value : [];

            rows.forEach((row) => {

                const rowValue = row?.value ?? {};

                if (isEmptyOrderDetail(rowValue)) {
                    return;
                }

                points += lineQty(rowValue[of.qty]?.value, pipelineQtyStats);
                amount += toNumber(rowValue[of.amount]?.value);

            });

            return { points, amount };

        };

        allOrders.forEach((record) => {

            const manageNo = String(getFieldValue(record, of.manageNo)).trim();

            if (!manageNo) {
                return;
            }

            app16ManageNos.add(manageNo);

            const recordId = Number(record.$id?.value ?? 0);
            const totals = recordPointsAndAmount(record);
            let group = groups.get(manageNo);

            if (!group) {
                group = {
                    manageNo,
                    records: [],
                    points: 0,
                    amount: 0,
                    maxRecordId: 0,
                    displayRecord: record,
                };
                groups.set(manageNo, group);
            }

            group.records.push(record);
            group.points += totals.points;
            group.amount += totals.amount;

            if (recordId >= group.maxRecordId) {
                group.maxRecordId = recordId;
                group.displayRecord = record;
            }

        });

        const segments = {
            honsha: createPipelineSegment(processingLabels),
            ayanas: createPipelineSegment(processingLabels),
        };

        const openOrders = [];

        const bumpProcess = (segmentState, statusName, manageNo) => {

            const key = statusName || emptyStatus;

            if (!segmentState.byProcess.has(key)) {
                segmentState.byProcess.set(key, new Set());
            }

            segmentState.byProcess.get(key).add(manageNo);

        };

        const bumpLocation = (segmentState, statusName, manageNo) => {

            const key = statusName || emptyStatus;

            if (!segmentState.byLocation.has(key)) {
                segmentState.byLocation.set(key, new Set());
            }

            segmentState.byLocation.get(key).add(manageNo);

        };

        const deadlineFlags = (deadlineYmd) => {

            const d = normalizeYmd(deadlineYmd);
            const flags = { overdue: false, within7: false, thisMonth: false };

            if (!d) {
                return flags;
            }

            if (d < today) {
                flags.overdue = true;
            }

            if (d >= today && d <= todayPlus7) {
                flags.within7 = true;
            }

            if (d >= thisMonth.start && d <= thisMonth.end) {
                flags.thisMonth = true;
            }

            return flags;

        };

        groups.forEach((group) => {

            if (deliveredManageNos.has(group.manageNo)) {
                return;
            }

            const display = group.displayRecord;
            const customerCode = String(getFieldValue(display, of.customerCode)).trim();
            const segmentKey = segmentKeyForCustomer(customerCode);
            const segmentState = segments[segmentKey];
            const processStatus = String(getFieldValue(display, of.processStatus)).trim();
            const locationStatus = String(getFieldValue(display, of.locationStatus)).trim();
            const deadline = normalizeYmd(getFieldValue(display, of.deadline));
            const flags = deadlineFlags(deadline);

            if (processStatus) {
                processValuesSeen.add(processStatus);
            }

            if (locationStatus) {
                locationValuesSeen.add(locationStatus);
            }

            segmentState.summary.openKimono += 1;
            segmentState.summary.openPoints += group.points;
            segmentState.summary.openAmount += group.amount;

            if (flags.overdue) {
                segmentState.summary.overdueKimono += 1;
            }

            if (flags.within7) {
                segmentState.summary.within7Kimono += 1;
            }

            if (flags.thisMonth) {
                segmentState.summary.thisMonthKimono += 1;
            }

            bumpProcess(segmentState, processStatus, group.manageNo);
            bumpLocation(segmentState, locationStatus, group.manageNo);

            const processingCategories = new Set();

            group.records.forEach((record) => {

                const table = record[of.detailTable];
                const rows = Array.isArray(table?.value) ? table.value : [];

                rows.forEach((row) => {

                    const rowValue = row?.value ?? {};

                    if (isEmptyOrderDetail(rowValue)) {
                        return;
                    }

                    const itemCode = rowValue[of.itemCode]?.value;
                    const itemName = rowValue[of.itemName]?.value;
                    const subcategory = resolveSubcategory(itemCode, itemName, productLookup);
                    const label = mapPipelineProcessingLabel(subcategory);
                    const bucket = segmentState.byProcessing[label];
                    const qty = lineQty(rowValue[of.qty]?.value, pipelineQtyStats);

                    bucket.kimonoSet.add(group.manageNo);
                    bucket.points += qty;
                    processingCategories.add(label);

                });

            });

            openOrders.push({
                manageNo: group.manageNo,
                customerCode,
                customerName: String(getFieldValue(display, of.customerName)).trim(),
                kimonoType: String(getFieldValue(display, of.kimonoType)).trim(),
                kimonoSpec: String(getFieldValue(display, of.kimonoSpec)).trim(),
                orderDate: normalizeYmd(getFieldValue(display, of.orderDate)),
                deadline,
                processStatus: processStatus || emptyStatus,
                locationStatus: locationStatus || emptyStatus,
                segment: segmentKey,
                openPoints: group.points,
                processingCategories: [...processingCategories],
                deadlineFlags: flags,
            });

        });

        openOrders.sort((a, b) => {

            if (a.deadline && b.deadline && a.deadline !== b.deadline) {
                return a.deadline.localeCompare(b.deadline);
            }

            if (a.deadline && !b.deadline) {
                return -1;
            }

            if (!a.deadline && b.deadline) {
                return 1;
            }

            return a.manageNo.localeCompare(b.manageNo, 'ja');

        });

        const honshaOut = finalizePipelineSegment(segments.honsha, processingLabels);
        const ayanasOut = finalizePipelineSegment(segments.ayanas, processingLabels);

        const sumSummary = (left, right) => ({
            openKimono: left.openKimono + right.openKimono,
            openPoints: left.openPoints + right.openPoints,
            openAmount: left.openAmount + right.openAmount,
            overdueKimono: left.overdueKimono + right.overdueKimono,
            within7Kimono: left.within7Kimono + right.within7Kimono,
            thisMonthKimono: left.thisMonthKimono + right.thisMonthKimono,
        });

        const mergeBreakdown = (leftRows, rightRows) => {

            const map = new Map();

            leftRows.forEach((row) => map.set(row.name, row.kimono));
            rightRows.forEach((row) => {

                map.set(row.name, (map.get(row.name) || 0) + row.kimono);

            });

            return [...map.entries()]
                .map(([name, kimono]) => ({ name, kimono }))
                .sort((a, b) => {

                    if (b.kimono !== a.kimono) {
                        return b.kimono - a.kimono;
                    }

                    return a.name.localeCompare(b.name, 'ja');

                });

        };

        const mergeProcessing = (leftRows, rightRows) => processingLabels.map((name) => {

            const left = leftRows.find((row) => row.name === name) || { kimono: 0, points: 0 };
            const right = rightRows.find((row) => row.name === name) || { kimono: 0, points: 0 };

            return {
                name,
                kimono: left.kimono + right.kimono,
                points: left.points + right.points,
            };

        });

        return {
            asOfDate: today,
            honsha: honshaOut,
            ayanas: ayanasOut,
            total: {
                summary: sumSummary(honshaOut.summary, ayanasOut.summary),
                byProcessStatus: mergeBreakdown(honshaOut.byProcessStatus, ayanasOut.byProcessStatus),
                byLocationStatus: mergeBreakdown(honshaOut.byLocationStatus, ayanasOut.byLocationStatus),
                byProcessing: mergeProcessing(honshaOut.byProcessing, ayanasOut.byProcessing),
            },
            openOrders,
            meta: {
                definition: 'App16 distinct manage_no − App19 delivery_detail distinct manage_no',
                app16RecordCount: allOrders.length,
                app16DistinctManageNo: app16ManageNos.size,
                app19DeliveredDistinctManageNo: deliveredManageNos.size,
                openManageNoCount: openOrders.length,
                processStatusValuesSeen: [...processValuesSeen].sort((a, b) => a.localeCompare(b, 'ja')),
                locationStatusValuesSeen: [...locationValuesSeen].sort((a, b) => a.localeCompare(b, 'ja')),
                templateExportNote: '_tmp_app16_export の template.json には process_status / location_status の選択肢定義がありません。工程・保管場所の行ラベルは集計時の App16 実値です。',
                pipelineQtyStats,
            },
        };

    };

    const classifyOverviewBucket = (subcategoriesOnOrder) => {

        const subs = new Set(subcategoriesOnOrder.map((s) => String(s ?? '').trim()).filter(Boolean));

        if (subs.has('海外仕立')) {
            return 'overseas';
        }

        if (subs.has('国内仕立')) {
            return 'domestic';
        }

        if (subs.has('帯仕立')) {
            return 'obi';
        }

        const sekkaiNames = CFG().SEKKAI_SUBCATEGORIES;

        for (let index = 0; index < sekkaiNames.length; index += 1) {

            if (subs.has(sekkaiNames[index])) {
                return 'sekkai';
            }

        }

        if (subs.has('修理')) {
            return 'repair';
        }

        return 'other';

    };

    const emptyOverviewCategoryCounts = () => {

        const row = {};

        CFG().OVERVIEW_CATEGORY_COLUMNS.forEach((col) => {

            row[col.id] = 0;

        });

        return row;

    };

    const computeOverviewPeriodSnapshot = (orders, deliveries, productLookup, logistics, pipeline) => {

        const of = F().order;
        const df = F().delivery;
        const categoryIds = CFG().OVERVIEW_CATEGORY_COLUMNS.map((col) => col.id);

        const makeSegment = () => ({
            orderKimono: 0,
            orderAmount: 0,
            deliveryKimono: 0,
            deliveryAmount: 0,
            wipKimono: 0,
            wipAmount: 0,
            logistics: {
                overseasOut: logistics.overseas.outbound,
                overseasIn: logistics.overseas.inbound,
                wasaiOut: logistics.wasai.outbound,
                wasaiIn: logistics.wasai.inbound,
                outsourceOut: logistics.outsource.outbound,
                outsourceIn: logistics.outsource.inbound,
            },
            orderCategories: emptyOverviewCategoryCounts(),
            deliveryCategories: emptyOverviewCategoryCounts(),
        });

        const segments = {
            honsha: makeSegment(),
            ayanas: makeSegment(),
            total: makeSegment(),
        };

        const orderKimonoAll = {
            honsha: new Set(),
            ayanas: new Set(),
        };

        const deliveryKimonoAll = {
            honsha: new Set(),
            ayanas: new Set(),
        };

        const orderKimonoByCategory = {
            honsha: new Map(),
            ayanas: new Map(),
        };

        const deliveryKimonoByCategory = {
            honsha: new Map(),
            ayanas: new Map(),
        };

        categoryIds.forEach((id) => {

            orderKimonoByCategory.honsha.set(id, new Set());
            orderKimonoByCategory.ayanas.set(id, new Set());
            deliveryKimonoByCategory.honsha.set(id, new Set());
            deliveryKimonoByCategory.ayanas.set(id, new Set());

        });

        const orderQtyStats = { totalLines: 0, nonOneLineCount: 0 };
        const deliveryQtyStats = { totalLines: 0, nonOneLineCount: 0 };

        orders.forEach((record) => {

            const manageNo = String(getFieldValue(record, of.manageNo)).trim();
            const customerCode = String(getFieldValue(record, of.customerCode)).trim();
            const segmentKey = segmentKeyForCustomer(customerCode);
            const table = record[of.detailTable];
            const rows = Array.isArray(table?.value) ? table.value : [];
            const subcategoriesOnOrder = [];
            let orderAmount = 0;

            rows.forEach((row) => {

                const rowValue = row?.value ?? {};

                if (isEmptyOrderDetail(rowValue)) {
                    return;
                }

                const itemCode = rowValue[of.itemCode]?.value;
                const itemName = rowValue[of.itemName]?.value;
                const subcategory = resolveSubcategory(itemCode, itemName, productLookup);

                if (subcategory) {
                    subcategoriesOnOrder.push(subcategory);
                }

                orderAmount += toNumber(rowValue[of.amount]?.value);
                lineQty(rowValue[of.qty]?.value, orderQtyStats);

            });

            if (!manageNo) {
                return;
            }

            segments[segmentKey].orderAmount += orderAmount;
            segments.total.orderAmount += orderAmount;
            orderKimonoAll[segmentKey].add(manageNo);

            const bucket = classifyOverviewBucket(subcategoriesOnOrder);

            orderKimonoByCategory[segmentKey].get(bucket).add(manageNo);

        });

        deliveries.forEach((record) => {

            const customerCode = String(getFieldValue(record, df.customerCode)).trim();
            const segmentKey = segmentKeyForCustomer(customerCode);
            const table = record[df.detailTable];
            const rows = Array.isArray(table?.value) ? table.value : [];

            rows.forEach((row) => {

                const rowValue = row?.value ?? {};

                if (isEmptyDeliveryDetail(rowValue)) {
                    return;
                }

                const manageNo = String(rowValue[df.manageNo]?.value ?? '').trim();
                const itemName = rowValue[df.itemName]?.value;
                const subcategory = resolveSubcategory('', itemName, productLookup);
                const amount = toNumber(rowValue[df.amount]?.value);
                const bucket = classifyOverviewBucket(subcategory ? [subcategory] : []);

                segments[segmentKey].deliveryAmount += amount;
                segments.total.deliveryAmount += amount;
                lineQty(rowValue[df.qty]?.value, deliveryQtyStats);

                if (manageNo) {
                    deliveryKimonoAll[segmentKey].add(manageNo);
                    deliveryKimonoByCategory[segmentKey].get(bucket).add(manageNo);
                }

            });

        });

        ['honsha', 'ayanas'].forEach((segmentKey) => {

            categoryIds.forEach((id) => {

                segments[segmentKey].orderCategories[id] = orderKimonoByCategory[segmentKey].get(id).size;
                segments[segmentKey].deliveryCategories[id] = deliveryKimonoByCategory[segmentKey].get(id).size;

            });

            segments[segmentKey].orderKimono = orderKimonoAll[segmentKey].size;
            segments[segmentKey].deliveryKimono = deliveryKimonoAll[segmentKey].size;

            segments[segmentKey].wipKimono = pipeline[segmentKey].summary.openKimono;
            segments[segmentKey].wipAmount = pipeline[segmentKey].summary.openAmount;

        });

        categoryIds.forEach((id) => {

            segments.total.orderCategories[id] = segments.honsha.orderCategories[id]
                + segments.ayanas.orderCategories[id];
            segments.total.deliveryCategories[id] = segments.honsha.deliveryCategories[id]
                + segments.ayanas.deliveryCategories[id];

        });

        segments.total.orderKimono = orderKimonoAll.honsha.size + orderKimonoAll.ayanas.size;
        segments.total.deliveryKimono = deliveryKimonoAll.honsha.size + deliveryKimonoAll.ayanas.size;
        segments.total.wipKimono = segments.honsha.wipKimono + segments.ayanas.wipKimono;
        segments.total.wipAmount = segments.honsha.wipAmount + segments.ayanas.wipAmount;

        segments.total.logistics = { ...segments.honsha.logistics };

        return segments;

    };

    const buildOverviewMetrics = async (productLookup, pipeline, inboundCache) => {

        const of = F().order;
        const df = F().delivery;
        const periodDefs = [
            { key: 'today', preset: 'today' },
            { key: 'this_month', preset: 'this_month' },
            { key: 'fiscal_year', preset: 'fiscal_year' },
        ];

        const snapshots = {};

        await Promise.all(periodDefs.map(async (def) => {

            const period = resolvePeriod(def.preset);
            const orderQuery = `${of.orderDate} >= "${escapeQueryValue(period.orderStart)}" and ${of.orderDate} <= "${escapeQueryValue(period.orderEnd)}" order by ${of.orderDate} asc, レコード番号 asc`;
            const deliveryQuery = `${df.deliveryDate} >= "${escapeQueryValue(period.deliveryStart)}" and ${df.deliveryDate} <= "${escapeQueryValue(period.deliveryEnd)}" order by ${df.deliveryDate} asc, レコード番号 asc`;
            const orderFields = [
                of.manageNo,
                of.customerCode,
                of.detailTable,
                of.itemCode,
                of.itemName,
                of.qty,
                of.amount,
            ];
            const deliveryFields = [
                df.customerCode,
                df.detailTable,
                df.manageNo,
                df.itemName,
                df.qty,
                df.amount,
            ];

            const [orders, deliveries, logistics] = await Promise.all([
                fetchAllRecords(CFG().ORDER_APP_ID, orderQuery, orderFields),
                fetchAllRecords(CFG().DELIVERY_APP_ID, deliveryQuery, deliveryFields),
                buildLogisticsMetrics(period, inboundCache),
            ]);

            snapshots[def.key] = {
                period,
                segments: computeOverviewPeriodSnapshot(orders, deliveries, productLookup, logistics, pipeline),
            };

        }));

        return {
            periodRows: periodDefs.map((def) => def.key),
            snapshots,
            wipNote: '在庫残数・在庫金額＝受注残（App16−App19）の着物枚数・明細税抜金額。期間行ごとに同じ時点値です。',
            logisticsNote: '出庫・入庫は全社合計（取引先別未分割）。全体行に表示します。',
        };

    };

    const buildReport = async (options) => {

        assertDeps();

        const preset = options?.preset ?? 'today';
        const period = resolvePeriod(preset, options?.customStart, options?.customEnd);
        const of = F().order;
        const df = F().delivery;

        const orderQuery = `${of.orderDate} >= "${escapeQueryValue(period.orderStart)}" and ${of.orderDate} <= "${escapeQueryValue(period.orderEnd)}" order by ${of.orderDate} asc, レコード番号 asc`;
        const deliveryQuery = `${df.deliveryDate} >= "${escapeQueryValue(period.deliveryStart)}" and ${df.deliveryDate} <= "${escapeQueryValue(period.deliveryEnd)}" order by ${df.deliveryDate} asc, レコード番号 asc`;

        const orderFields = [
            of.manageNo,
            of.orderDate,
            of.customerCode,
            of.customerName,
            of.kimonoType,
            of.kimonoSpec,
            of.detailTable,
        ];

        const deliveryFields = [
            df.deliveryDate,
            df.customerCode,
            df.customerName,
            df.detailTable,
        ];

        const productFields = [
            F().product.itemCode,
            F().product.itemName,
            F().product.subcategory,
        ];

        const [orders, deliveries, products] = await Promise.all([
            fetchAllRecords(CFG().ORDER_APP_ID, orderQuery, orderFields),
            fetchAllRecords(CFG().DELIVERY_APP_ID, deliveryQuery, deliveryFields),
            fetchAllRecords(CFG().PRODUCT_APP_ID, 'order by ' + F().product.itemCode + ' asc', productFields),
        ]);

        const productLookup = buildProductLookup(products);
        const orderQtyStats = { totalLines: 0, nonOneLineCount: 0 };
        const deliveryQtyStats = { totalLines: 0, nonOneLineCount: 0 };

        const summary = {
            honsha: emptySegmentMetrics(),
            ayanas: emptySegmentMetrics(),
            total: emptySegmentMetrics(),
        };

        const orderKimonoSets = {
            honsha: new Set(),
            ayanas: new Set(),
        };

        const deliveryKimonoSets = {
            honsha: new Set(),
            ayanas: new Set(),
        };

        const tailoringNames = CFG().TAILORING_SUBCATEGORIES;
        const sekkaiNames = CFG().SEKKAI_SUBCATEGORIES;
        const a550Labels = CFG().A550_PROCESSING_LABELS;

        const tailoring = tailoringNames.map((name) => ({
            name,
            honsha: {
                orderKimono: 0,
                orderAmount: 0,
                deliveryKimono: 0,
                deliveryAmount: 0,
                orderKimonoSet: new Set(),
                deliveryKimonoSet: new Set(),
            },
            ayanas: {
                orderKimono: 0,
                orderAmount: 0,
                deliveryKimono: 0,
                deliveryAmount: 0,
                orderKimonoSet: new Set(),
                deliveryKimonoSet: new Set(),
            },
            kimonoSpecRows: new Map(),
        }));

        const sekkai = sekkaiNames.map((name) => ({
            name,
            honsha: { orderPoints: 0, deliveryPoints: 0, deliveryAmount: 0, orderAmount: 0 },
            ayanas: { orderPoints: 0, deliveryPoints: 0, deliveryAmount: 0, orderAmount: 0 },
        }));

        const a550Processing = a550Labels.map((name) => ({
            name,
            orderPoints: 0,
            deliveryPoints: 0,
            orderAmount: 0,
            deliveryAmount: 0,
        }));

        const customersMap = new Map();
        const kimonoTypeSpecMaps = {
            honsha: new Map(),
            ayanas: new Map(),
            total: new Map(),
        };

        const getTailoringBucket = (subcategory) => (
            tailoring.find((row) => row.name === subcategory) ?? null
        );

        const getSekkaiBucket = (subcategory) => (
            sekkai.find((row) => row.name === subcategory) ?? null
        );

        const getA550Bucket = (subcategory) => {

            const label = mapA550ProcessingLabel(subcategory, a550Labels.filter((l) => l !== 'その他'));

            return a550Processing.find((row) => row.name === label) ?? a550Processing[a550Processing.length - 1];

        };

        const ensureCustomer = (code, name) => {

            const key = String(code ?? '').trim();

            if (!key || key === CFG().A550_CUSTOMER_CODE) {
                return null;
            }

            if (!customersMap.has(key)) {
                customersMap.set(key, {
                    customerCode: key,
                    customerName: String(name ?? '').trim(),
                    orderKimonoSet: new Set(),
                    orderPoints: 0,
                    orderAmount: 0,
                    kimonoSpecMap: new Map(),
                    processingPoints: new Map(),
                });
            }

            const row = customersMap.get(key);

            if (!row.customerName && name) {
                row.customerName = String(name).trim();
            }

            return row;

        };

        const addKimonoSpec = (map, kimonoType, kimonoSpec, manageNo) => {

            const type = String(kimonoType ?? '').trim() || '—';
            const spec = String(kimonoSpec ?? '').trim() || '—';
            const key = `${type}\t${spec}`;

            if (!map.has(key)) {
                map.set(key, {
                    kimonoType: type,
                    kimonoSpec: spec,
                    manageNos: new Set(),
                });
            }

            map.get(key).manageNos.add(manageNo);

        };

        orders.forEach((record) => {

            const manageNo = String(getFieldValue(record, of.manageNo)).trim();
            const customerCode = String(getFieldValue(record, of.customerCode)).trim();
            const segment = segmentKeyForCustomer(customerCode);
            const kimonoType = getFieldValue(record, of.kimonoType);
            const kimonoSpec = getFieldValue(record, of.kimonoSpec);

            if (manageNo) {
                orderKimonoSets[segment].add(manageNo);
            }

            const customerRow = ensureCustomer(customerCode, getFieldValue(record, of.customerName));

            if (customerRow && manageNo) {
                customerRow.orderKimonoSet.add(manageNo);
                addKimonoSpec(customerRow.kimonoSpecMap, kimonoType, kimonoSpec, manageNo);
            }

            const table = record[of.detailTable];
            const rows = Array.isArray(table?.value) ? table.value : [];
            const subcategoriesOnOrder = [];

            rows.forEach((row) => {

                const rowValue = row?.value ?? {};

                if (isEmptyOrderDetail(rowValue)) {
                    return;
                }

                const itemCode = rowValue[of.itemCode]?.value;
                const itemName = rowValue[of.itemName]?.value;
                const subcategory = resolveSubcategory(itemCode, itemName, productLookup);

                if (subcategory) {
                    subcategoriesOnOrder.push(subcategory);
                }
                const points = lineQty(rowValue[of.qty]?.value, orderQtyStats);
                const amount = toNumber(rowValue[of.amount]?.value);

                summary[segment].orderPoints += points;
                summary[segment].orderAmount += amount;

                if (segment === 'ayanas') {
                    const bucket = getA550Bucket(subcategory);

                    bucket.orderPoints += points;
                    bucket.orderAmount += amount;
                }

                if (customerRow) {
                    customerRow.orderPoints += points;
                    customerRow.orderAmount += amount;

                    const procKey = subcategory || '（中分類未設定）';
                    const prev = customerRow.processingPoints.get(procKey) || 0;

                    customerRow.processingPoints.set(procKey, prev + points);
                }

                const tailor = getTailoringBucket(subcategory);

                if (tailor && manageNo) {
                    tailor[segment].orderAmount += amount;
                    tailor[segment].orderKimonoSet.add(manageNo);
                    addKimonoSpec(tailor.kimonoSpecRows, kimonoType, kimonoSpec, manageNo);
                }

                const sek = getSekkaiBucket(subcategory);

                if (sek) {
                    sek[segment].orderPoints += points;
                    sek[segment].orderAmount += amount;
                }

            });

            if (manageNo) {

                const routeBucket = classifyKimonoRouteBucket(subcategoriesOnOrder, sekkaiNames);
                const segmentsToUpdate = segment === 'ayanas'
                    ? ['ayanas', 'total']
                    : ['honsha', 'total'];

                segmentsToUpdate.forEach((segKey) => {

                    const specRow = ensureKimonoTypeSpecRow(
                        kimonoTypeSpecMaps[segKey],
                        kimonoType,
                        kimonoSpec
                    );

                    specRow.buckets[routeBucket].add(manageNo);

                });

            }

        });

        deliveries.forEach((record) => {

            const customerCode = String(getFieldValue(record, df.customerCode)).trim();
            const segment = segmentKeyForCustomer(customerCode);
            const table = record[df.detailTable];
            const rows = Array.isArray(table?.value) ? table.value : [];

            rows.forEach((row) => {

                const rowValue = row?.value ?? {};

                if (isEmptyDeliveryDetail(rowValue)) {
                    return;
                }

                const manageNo = String(rowValue[df.manageNo]?.value ?? '').trim();
                const itemName = rowValue[df.itemName]?.value;
                const subcategory = resolveSubcategory('', itemName, productLookup);
                const points = lineQty(rowValue[df.qty]?.value, deliveryQtyStats);
                const amount = toNumber(rowValue[df.amount]?.value);
                const kimonoType = rowValue[df.kimonoType]?.value;
                const kimonoSpec = rowValue[df.kimonoSpec]?.value;

                if (manageNo) {
                    deliveryKimonoSets[segment].add(manageNo);
                }

                summary[segment].deliveryPoints += points;
                summary[segment].deliveryAmount += amount;

                if (segment === 'ayanas') {
                    const bucket = getA550Bucket(subcategory);

                    bucket.deliveryPoints += points;
                    bucket.deliveryAmount += amount;
                }

                const tailor = getTailoringBucket(subcategory);

                if (tailor && manageNo) {
                    tailor[segment].deliveryAmount += amount;
                    tailor[segment].deliveryKimonoSet.add(manageNo);
                }

                const sek = getSekkaiBucket(subcategory);

                if (sek) {
                    sek[segment].deliveryPoints += points;
                    sek[segment].deliveryAmount += amount;
                }

            });

        });

        summary.honsha.orderKimono = orderKimonoSets.honsha.size;
        summary.ayanas.orderKimono = orderKimonoSets.ayanas.size;
        summary.honsha.deliveryKimono = deliveryKimonoSets.honsha.size;
        summary.ayanas.deliveryKimono = deliveryKimonoSets.ayanas.size;
        summary.total = sumSegmentsToTotal(summary.honsha, summary.ayanas);

        const finalizeTailoring = (row) => {

            ['honsha', 'ayanas'].forEach((seg) => {

                row[seg].orderKimono = row[seg].orderKimonoSet.size;
                row[seg].deliveryKimono = row[seg].deliveryKimonoSet.size;
                delete row[seg].orderKimonoSet;
                delete row[seg].deliveryKimonoSet;

            });

            const specRows = [...row.kimonoSpecRows.values()].map((entry) => ({
                kimonoType: entry.kimonoType,
                kimonoSpec: entry.kimonoSpec,
                orderKimono: entry.manageNos.size,
            })).sort((a, b) => {

                if (a.kimonoType < b.kimonoType) {
                    return -1;
                }

                if (a.kimonoType > b.kimonoType) {
                    return 1;
                }

                return a.kimonoSpec.localeCompare(b.kimonoSpec, 'ja');

            });

            delete row.kimonoSpecRows;

            return {
                name: row.name,
                honsha: {
                    orderKimono: row.honsha.orderKimono,
                    orderAmount: row.honsha.orderAmount,
                    deliveryKimono: row.honsha.deliveryKimono,
                    deliveryAmount: row.honsha.deliveryAmount,
                },
                ayanas: {
                    orderKimono: row.ayanas.orderKimono,
                    orderAmount: row.ayanas.orderAmount,
                    deliveryKimono: row.ayanas.deliveryKimono,
                    deliveryAmount: row.ayanas.deliveryAmount,
                },
                total: {
                    orderKimono: row.honsha.orderKimono + row.ayanas.orderKimono,
                    orderAmount: row.honsha.orderAmount + row.ayanas.orderAmount,
                    deliveryKimono: row.honsha.deliveryKimono + row.ayanas.deliveryKimono,
                    deliveryAmount: row.honsha.deliveryAmount + row.ayanas.deliveryAmount,
                },
                kimonoSpecRows: specRows,
            };

        };

        const tailoringOut = tailoring.map(finalizeTailoring);

        const sekkaiOut = sekkai.map((row) => ({
            name: row.name,
            honsha: { ...row.honsha },
            ayanas: { ...row.ayanas },
            total: {
                orderPoints: row.honsha.orderPoints + row.ayanas.orderPoints,
                deliveryPoints: row.honsha.deliveryPoints + row.ayanas.deliveryPoints,
                deliveryAmount: row.honsha.deliveryAmount + row.ayanas.deliveryAmount,
                orderAmount: row.honsha.orderAmount + row.ayanas.orderAmount,
            },
        }));

        const inboundCache = await fetchLogisticsInboundCache();

        const [logistics, pipeline] = await Promise.all([
            buildLogisticsMetrics(period, inboundCache),
            buildPipelineMetrics(productLookup),
        ]);

        const overview = await buildOverviewMetrics(productLookup, pipeline, inboundCache);

        const customers = [...customersMap.values()].map((row) => ({
            customerCode: row.customerCode,
            customerName: row.customerName,
            orderKimono: row.orderKimonoSet.size,
            orderPoints: row.orderPoints,
            orderAmount: row.orderAmount,
            kimonoSpecRows: [...row.kimonoSpecMap.values()].map((entry) => ({
                kimonoType: entry.kimonoType,
                kimonoSpec: entry.kimonoSpec,
                orderKimono: entry.manageNos.size,
            })).sort((a, b) => a.kimonoType.localeCompare(b.kimonoType, 'ja')),
            processingPoints: [...row.processingPoints.entries()]
                .map(([name, points]) => ({ name, points }))
                .sort((a, b) => b.points - a.points),
        })).sort((a, b) => b.orderKimono - a.orderKimono);

        const buildAuditSamples = (orderRecords, lookup, maxSamples) => {

            const ofields = F().order;
            const sorted = [...orderRecords].sort((left, right) => {

                const leftRows = left[ofields.detailTable]?.value?.length ?? 0;
                const rightRows = right[ofields.detailTable]?.value?.length ?? 0;

                return rightRows - leftRows;

            });

            return sorted.slice(0, maxSamples).map((record) => {

                const manageNo = String(getFieldValue(record, ofields.manageNo)).trim();
                const table = record[ofields.detailTable];
                const rows = Array.isArray(table?.value) ? table.value : [];
                const lines = [];
                let processingPoints = 0;

                rows.forEach((row) => {

                    const rowValue = row?.value ?? {};

                    if (isEmptyOrderDetail(rowValue)) {
                        return;
                    }

                    const itemCode = rowValue[ofields.itemCode]?.value;
                    const itemName = rowValue[ofields.itemName]?.value;
                    const qtyRaw = rowValue[ofields.qty]?.value;
                    const qty = lineQty(qtyRaw, { totalLines: 0, nonOneLineCount: 0 });
                    const amount = toNumber(rowValue[ofields.amount]?.value);
                    const subcategory = resolveSubcategory(itemCode, itemName, lookup);

                    processingPoints += qty;

                    lines.push({
                        itemCode: String(itemCode ?? '').trim(),
                        itemName: String(itemName ?? '').trim(),
                        qty: toNumber(qtyRaw) || qty,
                        effectiveQty: qty,
                        amount,
                        subcategory: subcategory || '（未設定）',
                    });

                });

                return {
                    manageNo,
                    kimonoType: String(getFieldValue(record, ofields.kimonoType)).trim(),
                    kimonoSpec: String(getFieldValue(record, ofields.kimonoSpec)).trim(),
                    customerCode: String(getFieldValue(record, ofields.customerCode)).trim(),
                    orderKimonoUnits: manageNo ? 1 : 0,
                    processingPointsFromDetails: processingPoints,
                    lines,
                };

            });

        };

        return {
            period,
            generatedAt: new Date().toISOString(),
            meta: {
                productSubcategories: productLookup.subcategories,
                orderQtyStats,
                deliveryQtyStats,
                cancelExclusion: false,
                cancelNote: 'App16/App19 の取消判定は未確定のため、V1 では除外条件を設けていません。',
                audit: {
                    orderRecordCount: orders.length,
                    deliveryRecordCount: deliveries.length,
                    honsha: cloneSegmentMetrics(summary.honsha),
                    ayanas: cloneSegmentMetrics(summary.ayanas),
                    total: cloneSegmentMetrics(summary.total),
                    manageNoSamples: buildAuditSamples(orders, productLookup, 3),
                },
            },
            summary,
            logistics,
            tailoring: tailoringOut,
            kimonoTypeSpec: {
                honsha: finalizeKimonoTypeSpecMap(kimonoTypeSpecMaps.honsha),
                ayanas: finalizeKimonoTypeSpecMap(kimonoTypeSpecMaps.ayanas),
                total: finalizeKimonoTypeSpecMap(kimonoTypeSpecMaps.total),
            },
            sekkai: sekkaiOut,
            customers,
            a550: {
                summary: cloneSegmentMetrics(summary.ayanas),
                processing: a550Processing,
            },
            pipeline,
            overview,
        };

    };

    const buildTodayAudit = async () => {

        const report = await buildReport({ preset: 'today' });

        return report.meta?.audit ?? null;

    };

    window.CAYANAS_BusinessDashboardEngine = {
        resolvePeriod,
        buildReport,
        buildTodayAudit,
    };

}());
