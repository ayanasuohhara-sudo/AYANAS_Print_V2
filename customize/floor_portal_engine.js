(function () {
    'use strict';

    /**
     * 工場・店舗ポータル — 在庫抽出と絞り込み。
     * App16 の更新はしない。App82 の集計関数には依存しない。
     */

    const cfg = () => {

        if (typeof CAYANAS_FLOOR_PORTAL === 'undefined') {
            throw new Error('CAYANAS_FLOOR_PORTAL が未読込です。floor_portal_config.js を先に登録してください。');
        }

        return CAYANAS_FLOOR_PORTAL;

    };

    const readValue = (record, code) => {

        const field = record?.[code];

        if (!field || field.value === null || field.value === undefined) {
            return '';
        }

        return String(field.value).trim();

    };

    const normalizeYmd = (value) => String(value ?? '').trim().slice(0, 10);

    const todayYmdJst = (now) => {

        const date = now instanceof Date ? now : new Date();

        return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });

    };

    const parseYmdParts = (ymd) => {

        const parts = String(ymd ?? '').trim().split('-').map(Number);

        if (parts.length < 3 || parts.some((part) => !Number.isFinite(part))) {
            return null;
        }

        return { y: parts[0], m: parts[1], d: parts[2] };

    };

    const formatYmd = (date) => {

        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');

        return y + '-' + m + '-' + d;

    };

    const addDays = (ymd, days) => {

        const parts = parseYmdParts(ymd);

        if (!parts) {
            return '';
        }

        const date = new Date(parts.y, parts.m - 1, parts.d);

        date.setDate(date.getDate() + days);

        return formatYmd(date);

    };

    const monthRange = (year, monthIndex0) => ({
        start: formatYmd(new Date(year, monthIndex0, 1)),
        end: formatYmd(new Date(year, monthIndex0 + 1, 0)),
    });

    const isAggregationActive = (record) => {

        const rule = cfg().AGGREGATION;
        const value = record?.[rule.fieldCode]?.value;

        return String(value ?? '').trim() !== rule.cancelled;

    };

    const isDelivered = (record) => readValue(record, cfg().FIELDS.deliveryStatus) === cfg().DELIVERY.delivered;

    const locationForMode = (mode) => {

        const C = cfg();

        if (mode === C.MODE.factory) {
            return C.LOCATION.factory;
        }

        if (mode === C.MODE.store) {
            return C.LOCATION.store;
        }

        return '';

    };

    const workCardsForMode = (mode) => {

        const C = cfg();

        if (mode === C.MODE.store) {
            return C.STORE_WORK_CARDS.slice();
        }

        return C.FACTORY_WORK_CARDS.slice();

    };

    const resolveMode = (appId) => {

        const app = cfg().APP;
        const id = Number(appId);

        if (app.factoryPortal > 0 && id === app.factoryPortal) {
            return cfg().MODE.factory;
        }

        if (app.storePortal > 0 && id === app.storePortal) {
            return cfg().MODE.store;
        }

        return '';

    };

    const isStockRecord = (record, mode) => {

        const location = locationForMode(mode);

        if (!location) {
            return false;
        }

        if (readValue(record, cfg().FIELDS.locationStatus) !== location) {
            return false;
        }

        if (!isAggregationActive(record)) {
            return false;
        }

        if (isDelivered(record)) {
            return false;
        }

        return true;

    };

    const deadlineFlags = (deadline, today) => {

        const d = normalizeYmd(deadline);
        const flags = {
            overdue: false,
            today: false,
            within7: false,
            thisMonth: false,
        };

        if (!d || !today) {
            return flags;
        }

        const plus7 = addDays(today, 7);
        const parts = parseYmdParts(today);
        const month = parts ? monthRange(parts.y, parts.m - 1) : null;

        if (d < today) {
            flags.overdue = true;
        }

        if (d === today) {
            flags.today = true;
        }

        if (d >= today && d <= plus7) {
            flags.within7 = true;
        }

        if (month && d >= month.start && d <= month.end) {
            flags.thisMonth = true;
        }

        return flags;

    };

    const urgencyOf = (flags) => {

        if (flags.overdue) {
            return 'overdue';
        }

        if (flags.today) {
            return 'today';
        }

        if (flags.within7) {
            return 'within7';
        }

        return '';

    };

    const joinProcessingNames = (record) => {

        const F = cfg().FIELDS;
        const table = record?.[F.detailTable];
        const rows = Array.isArray(table?.value) ? table.value : [];
        const names = [];

        rows.forEach((row) => {

            const name = String(row?.value?.[F.itemName]?.value ?? '').trim();

            if (name) {
                names.push(name);
            }

        });

        return names.join('、');

    };

    const compareRows = (left, right) => {

        if (left.deadline && right.deadline && left.deadline !== right.deadline) {
            return left.deadline < right.deadline ? -1 : 1;
        }

        if (left.deadline && !right.deadline) {
            return -1;
        }

        if (!left.deadline && right.deadline) {
            return 1;
        }

        if (left.manageNo !== right.manageNo) {
            return left.manageNo < right.manageNo ? -1 : 1;
        }

        return String(left.recordId).localeCompare(String(right.recordId), 'ja');

    };

    const toRow = (record, today, duplicateManageNos) => {

        const F = cfg().FIELDS;
        const manageNo = readValue(record, F.manageNo);
        const deadline = normalizeYmd(readValue(record, F.deadline));
        const flags = deadlineFlags(deadline, today);

        return {
            recordId: readValue(record, F.id),
            manageNo,
            orderDate: normalizeYmd(readValue(record, F.orderDate)),
            deadline,
            customerName: readValue(record, F.customerName),
            clientName: readValue(record, F.clientName),
            kimonoType: readValue(record, F.kimonoType),
            kimonoSpec: readValue(record, F.kimonoSpec),
            processing: joinProcessingNames(record),
            processStatus: readValue(record, F.processStatus),
            workStatus: readValue(record, F.workStatus),
            deliveryStatus: readValue(record, F.deliveryStatus),
            locationStatus: readValue(record, F.locationStatus),
            duplicate: Boolean(manageNo) && duplicateManageNos.has(manageNo),
            deadlineFlags: flags,
            urgency: urgencyOf(flags),
        };

    };

    const countDistinct = (rows, predicate) => {

        const set = new Set();

        rows.forEach((row) => {

            if (!row.manageNo || !predicate(row)) {
                return;
            }

            set.add(row.manageNo);

        });

        return set.size;

    };

    const buildStock = (records, options) => {

        const mode = options?.mode;
        const today = options?.today || todayYmdJst();
        const source = Array.isArray(records) ? records : [];
        const stockRecords = source.filter((record) => isStockRecord(record, mode));
        const manageCounts = new Map();

        stockRecords.forEach((record) => {

            const manageNo = readValue(record, cfg().FIELDS.manageNo);

            if (!manageNo) {
                return;
            }

            manageCounts.set(manageNo, (manageCounts.get(manageNo) || 0) + 1);

        });

        const duplicateManageNos = new Set();

        manageCounts.forEach((count, manageNo) => {

            if (count > 1) {
                duplicateManageNos.add(manageNo);
            }

        });

        const rows = stockRecords
            .map((record) => toRow(record, today, duplicateManageNos))
            .sort(compareRows);

        const cards = workCardsForMode(mode);
        const work = {};

        cards.forEach((name) => {

            work[name] = countDistinct(rows, (row) => row.workStatus === name);

        });

        const kpis = {
            total: countDistinct(rows, () => true),
            work,
            other: countDistinct(rows, (row) => cards.indexOf(row.workStatus) === -1),
            deliveryWaiting: mode === cfg().MODE.store
                ? countDistinct(rows, (row) => row.deliveryStatus === cfg().DELIVERY.waiting)
                : null,
            deadline: {
                overdue: countDistinct(rows, (row) => row.deadlineFlags.overdue),
                today: countDistinct(rows, (row) => row.deadlineFlags.today),
                within7: countDistinct(rows, (row) => row.deadlineFlags.within7),
                thisMonth: countDistinct(rows, (row) => row.deadlineFlags.thisMonth),
            },
        };

        return {
            mode,
            today,
            location: locationForMode(mode),
            rows,
            duplicateManageNos: [...duplicateManageNos],
            kpis,
        };

    };

    const filterRows = (rows, filters) => {

        const mode = filters?.mode;
        const cards = workCardsForMode(mode);
        const workId = String(filters?.workId || '');
        const deadlineId = String(filters?.deadlineId || '');
        const query = String(filters?.query || '').trim().toLowerCase();
        const list = Array.isArray(rows) ? rows : [];

        return list.filter((row) => {

            if (workId === 'other' && cards.indexOf(row.workStatus) !== -1) {
                return false;
            }

            if (workId === 'deliveryWaiting' && row.deliveryStatus !== cfg().DELIVERY.waiting) {
                return false;
            }

            if (workId && workId !== 'other' && workId !== 'deliveryWaiting' && row.workStatus !== workId) {
                return false;
            }

            if (deadlineId && !row.deadlineFlags?.[deadlineId]) {
                return false;
            }

            if (query) {
                const haystack = [row.manageNo, row.customerName, row.clientName].join('\n').toLowerCase();

                if (haystack.indexOf(query) === -1) {
                    return false;
                }
            }

            return true;

        });

    };

    const describeLookup = (records) => {

        const C = cfg();
        const F = C.FIELDS;
        const list = Array.isArray(records) ? records : [];

        if (list.length === 0) {
            return C.UI.notFound;
        }

        const lines = list.map((record) => {

            const aggregation = readValue(record, F.aggregationStatus);
            const delivery = readValue(record, F.deliveryStatus);
            const location = readValue(record, F.locationStatus);
            const processStatus = readValue(record, F.processStatus);
            const bits = [];

            if (aggregation === C.AGGREGATION.cancelled) {
                bits.push('取消のため一覧に出ていません');
            } else if (delivery === C.DELIVERY.delivered) {
                bits.push('納品済のため一覧に出ていません');
            }

            if (location) {
                bits.push('現在、' + location + 'にあります');
            }

            if (processStatus) {
                bits.push('工程は' + processStatus + 'です');
            }

            return 'この商品は' + (bits.length ? bits.join('。') : '状態不明') + '。';

        });

        return C.UI.outsidePrefix + '\n' + lines.join('\n');

    };

    const shouldFetch = ({ visibilityState, cause }) => {

        if (cause === 'filter' || cause === 'search') {
            return false;
        }

        if (cause === 'interval' && visibilityState === 'hidden') {
            return false;
        }

        return cause === 'manual'
            || cause === 'initial'
            || cause === 'visible'
            || cause === 'interval';

    };

    const orderFetchFields = () => {

        const F = cfg().FIELDS;

        return [
            F.id,
            F.manageNo,
            F.orderDate,
            F.deadline,
            F.customerName,
            F.clientName,
            F.kimonoType,
            F.kimonoSpec,
            F.processStatus,
            F.locationStatus,
            F.workStatus,
            F.deliveryStatus,
            F.aggregationStatus,
            F.detailTable,
        ];

    };

    const escapeQueryValue = (value) => String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

    const buildLocationQuery = (mode) => {

        const F = cfg().FIELDS;
        const location = locationForMode(mode);

        return F.locationStatus + ' in ("' + escapeQueryValue(location) + '") order by レコード番号 asc';

    };

    const buildManageNoQuery = (manageNo) => {

        const F = cfg().FIELDS;

        return F.manageNo + ' = "' + escapeQueryValue(manageNo) + '" limit 20';

    };

    window.CAYANAS_FloorPortalEngine = {
        todayYmdJst,
        isAggregationActive,
        isStockRecord,
        deadlineFlags,
        joinProcessingNames,
        compareRows,
        buildStock,
        filterRows,
        describeLookup,
        shouldFetch,
        resolveMode,
        workCardsForMode,
        orderFetchFields,
        buildLocationQuery,
        buildManageNoQuery,
    };

}());
