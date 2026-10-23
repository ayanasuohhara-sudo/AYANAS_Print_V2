(function () {
    'use strict';

    /**
     * 店舗納期カレンダー App92 — A550 抽出、中分類判定、KPI、月集計。
     * App16 / App13 は更新しない。item_name では分類しない。
     */

    const cfg = () => {

        if (typeof CAYANAS_STORE_DEADLINE === 'undefined') {
            throw new Error('CAYANAS_STORE_DEADLINE が未読込です。store_deadline_config.js を先に登録してください。');
        }

        return CAYANAS_STORE_DEADLINE;

    };

    const pad2 = (value) => String(value).padStart(2, '0');

    const ymd = (year, month, day) => (
        year + '-' + pad2(month) + '-' + pad2(day)
    );

    const escapeQueryValue = (value) => String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

    const quote = (value) => '"' + escapeQueryValue(value) + '"';

    const readValue = (record, code) => {

        const field = record?.[code];

        if (!field || field.value === null || field.value === undefined) {
            return '';
        }

        return String(field.value).trim();

    };

    const emptyCounts = () => {
        const counts = {};

        cfg().CATEGORIES.forEach((category) => {
            counts[category.key] = 0;
        });

        return counts;
    };

    const categoryByKey = (key) => (
        cfg().CATEGORIES.find((category) => category.key === key) || null
    );

    const monthBounds = (year, month) => {

        const y = Number(year);
        const m = Number(month);
        const last = new Date(y, m, 0).getDate();

        return {
            year: y,
            month: m,
            start: ymd(y, m, 1),
            end: ymd(y, m, last),
            label: y + '年' + m + '月',
        };

    };

    const shiftMonth = (year, month, delta) => {

        const date = new Date(Number(year), Number(month) - 1 + Number(delta), 1);

        return {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
        };

    };

    const todayParts = (date) => {

        const current = date instanceof Date ? date : new Date();

        return {
            year: current.getFullYear(),
            month: current.getMonth() + 1,
            day: current.getDate(),
            ymd: ymd(current.getFullYear(), current.getMonth() + 1, current.getDate()),
        };

    };

    const addDaysYmd = (ymdText, delta) => {

        const parts = String(ymdText ?? '').split('-');

        if (parts.length !== 3) {
            return '';
        }

        const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));

        date.setDate(date.getDate() + Number(delta));

        return ymd(date.getFullYear(), date.getMonth() + 1, date.getDate());

    };

    const weekdayIndexMonday = (year, month, day) => {

        const jsDay = new Date(Number(year), Number(month) - 1, Number(day)).getDay();

        return (jsDay + 6) % 7;

    };

    const buildCalendarWeeks = (year, month) => {

        const bounds = monthBounds(year, month);
        const last = Number(bounds.end.slice(8, 10));
        const lead = weekdayIndexMonday(bounds.year, bounds.month, 1);
        const cells = [];

        for (let index = 0; index < lead; index += 1) {
            cells.push(null);
        }

        for (let day = 1; day <= last; day += 1) {
            const index = weekdayIndexMonday(bounds.year, bounds.month, day);

            cells.push({
                ymd: ymd(bounds.year, bounds.month, day),
                day: day,
                weekdayIndex: index,
                isSaturday: index === 5,
                isSunday: index === 6,
            });
        }

        while (cells.length % 7 !== 0) {
            cells.push(null);
        }

        const weeks = [];

        for (let index = 0; index < cells.length; index += 7) {
            weeks.push(cells.slice(index, index + 7));
        }

        return weeks;

    };

    const storeCustomerClause = () => (
        cfg().FIELDS.customerCode + ' = ' + quote(cfg().STORE_CUSTOMER_CODE)
    );

    const buildMonthQuery = (year, month) => {

        const bounds = monthBounds(year, month);
        const field = cfg().FIELDS.deadline;

        return storeCustomerClause()
            + ' and ' + field + ' >= ' + quote(bounds.start)
            + ' and ' + field + ' <= ' + quote(bounds.end)
            + ' order by ' + field + ' asc';

    };

    const notDeliveredClause = () => (
        cfg().FIELDS.deliveryStatus + ' not in (' + quote(cfg().DELIVERY_DONE) + ')'
    );

    const buildOverdueQuery = (todayYmd) => (
        storeCustomerClause()
        + ' and ' + cfg().FIELDS.deadline + ' < ' + quote(todayYmd)
        + ' and ' + notDeliveredClause()
        + ' order by ' + cfg().FIELDS.deadline + ' asc'
    );

    const buildWithin7Query = (todayYmd) => {
        const end = addDaysYmd(todayYmd, 7);

        return storeCustomerClause()
            + ' and ' + cfg().FIELDS.deadline + ' >= ' + quote(todayYmd)
            + ' and ' + cfg().FIELDS.deadline + ' <= ' + quote(end)
            + ' and ' + notDeliveredClause()
            + ' order by ' + cfg().FIELDS.deadline + ' asc';
    };

    /*
     * process_status は App16 上で = 演算子が使えない（GAIA_IQ03）。
     * 完了判定はクエリに含めず、取得後に isReadyForPickup で絞り込む。
     */
    const buildReadyQuery = () => (
        storeCustomerClause()
        + ' and ' + cfg().FIELDS.deliveryStatus + ' in (' + quote(cfg().DELIVERY_WAITING) + ')'
        + ' order by ' + cfg().FIELDS.manageNo + ' asc'
    );

    /**
     * KPI用の一括取得。納期超過〜7日以内＋納品待ちを1クエリで取る。
     * 完了・納品待ちの process_status 条件はクライアント側。
     */
    const buildKpiPoolQuery = (todayYmd) => {
        const end = addDaysYmd(todayYmd, 7);

        return storeCustomerClause()
            + ' and (('
            + notDeliveredClause()
            + ' and ' + cfg().FIELDS.deadline + ' <= ' + quote(end)
            + ') or ('
            + cfg().FIELDS.deliveryStatus + ' in (' + quote(cfg().DELIVERY_WAITING) + ')'
            + ')) order by ' + cfg().FIELDS.deadline + ' asc';
    };

    const isCancelled = (record) => {

        const field = record?.[cfg().FIELDS.aggregationStatus];
        const value = field ? field.value : undefined;

        return value === cfg().AGGREGATION_CANCELLED;

    };

    const isStoreCustomer = (record) => (
        readValue(record, cfg().FIELDS.customerCode) === cfg().STORE_CUSTOMER_CODE
    );

    const isDelivered = (record) => (
        readValue(record, cfg().FIELDS.deliveryStatus) === cfg().DELIVERY_DONE
    );

    const isReadyForPickup = (record) => (
        readValue(record, cfg().FIELDS.processStatus) === cfg().PROCESS_DONE
        && readValue(record, cfg().FIELDS.deliveryStatus) === cfg().DELIVERY_WAITING
    );

    const detailRows = (record) => {

        const table = record?.[cfg().FIELDS.detailTable];

        return Array.isArray(table?.value) ? table.value : [];

    };

    const joinProcessing = (record) => {

        const names = [];

        detailRows(record).forEach((row) => {

            const name = String(row?.value?.[cfg().FIELDS.itemName]?.value ?? '').trim();

            if (name) {
                names.push(name);
            }

        });

        return names.join(cfg().PROCESSING_SEPARATOR);

    };

    const subcategoriesForRecord = (record, subcategoryByCode) => {

        const found = [];
        const seen = new Set();
        const map = subcategoryByCode instanceof Map ? subcategoryByCode : new Map();

        detailRows(record).forEach((row) => {

            const code = String(row?.value?.[cfg().FIELDS.itemCode]?.value ?? '').trim();

            if (!code || !map.has(code)) {
                return;
            }

            const subcategory = String(map.get(code) ?? '').trim();

            if (!subcategory || seen.has(subcategory)) {
                return;
            }

            seen.add(subcategory);
            found.push(subcategory);

        });

        return found;

    };

    const pickPriorityCategoryKey = (keys) => {

        const matched = new Set(Array.isArray(keys) ? keys : []);
        const priority = Array.isArray(cfg().CATEGORY_PRIORITY)
            ? cfg().CATEGORY_PRIORITY
            : [];

        for (let index = 0; index < priority.length; index += 1) {
            const key = priority[index];

            if (matched.has(key)) {
                return key;
            }
        }

        return '';

    };

    const matchingCategoryKeys = (record, subcategoryByCode) => {

        const subs = new Set(subcategoriesForRecord(record, subcategoryByCode));
        const matched = cfg().CATEGORIES
            .filter((category) => category.subcategories.some((name) => subs.has(name)))
            .map((category) => category.key);
        const chosen = pickPriorityCategoryKey(matched);

        return chosen ? [chosen] : [];

    };

    const categoryLabel = (keys) => (
        (Array.isArray(keys) ? keys : [])
            .map((key) => categoryByKey(key)?.label || '')
            .filter(Boolean)
            .join(cfg().CATEGORY_SEPARATOR)
    );

    const collectItemCodes = (records) => {

        const codes = [];
        const seen = new Set();

        (Array.isArray(records) ? records : []).forEach((record) => {

            detailRows(record).forEach((row) => {

                const code = String(row?.value?.[cfg().FIELDS.itemCode]?.value ?? '').trim();

                if (!code || seen.has(code)) {
                    return;
                }

                seen.add(code);
                codes.push(code);

            });

        });

        return codes;

    };

    const chunkItemCodes = (codes) => {

        const size = cfg().PRODUCT_BATCH;
        const chunks = [];

        for (let index = 0; index < codes.length; index += size) {
            chunks.push(codes.slice(index, index + size));
        }

        return chunks;

    };

    const buildProductQuery = (codes) => {

        const list = (Array.isArray(codes) ? codes : [])
            .map((code) => String(code ?? '').trim())
            .filter(Boolean)
            .map((code) => quote(code));

        if (!list.length) {
            return '';
        }

        const field = cfg().FIELDS.productCode;

        return field + ' in (' + list.join(', ') + ') order by ' + field + ' asc';

    };

    const buildSubcategoryMap = (productRecords) => {

        const map = new Map();

        (Array.isArray(productRecords) ? productRecords : []).forEach((record) => {

            const code = readValue(record, cfg().FIELDS.productCode);

            if (!code || map.has(code)) {
                return;
            }

            map.set(code, readValue(record, cfg().FIELDS.subcategory));

        });

        return map;

    };

    const compareManageNo = (left, right) => {

        const leftText = String(left ?? '');
        const rightText = String(right ?? '');

        if (leftText === rightText) {
            return 0;
        }

        if (!leftText) {
            return 1;
        }

        if (!rightText) {
            return -1;
        }

        return leftText.localeCompare(rightText, 'ja', { numeric: true });

    };

    const toDetailRow = (record, subcategoryByCode) => {

        const F = cfg().FIELDS;
        const categoryKeys = matchingCategoryKeys(record, subcategoryByCode);
        const deadline = readValue(record, F.deadline).slice(0, 10);

        return {
            recordId: readValue(record, F.id),
            manageNo: readValue(record, F.manageNo),
            deadline: deadline,
            customerCode: readValue(record, F.customerCode),
            customerName: readValue(record, F.customerName),
            clientName: readValue(record, F.clientName),
            kimonoType: readValue(record, F.kimonoType),
            kimonoSpec: readValue(record, F.kimonoSpec),
            processing: joinProcessing(record),
            categoryKeys: categoryKeys,
            categoriesLabel: categoryLabel(categoryKeys),
            processStatus: readValue(record, F.processStatus),
            workStatus: readValue(record, F.workStatus),
            locationStatus: readValue(record, F.locationStatus),
            deliveryStatus: readValue(record, F.deliveryStatus),
            duplicate: false,
        };

    };

    /**
     * 店舗カレンダー: 納品済は除外（今後対応すべき商品を優先）。
     */
    const aggregateMonth = (records, subcategoryByCode, year, month, options) => {

        const bounds = monthBounds(year, month);
        const excludeDelivered = !options || options.excludeDelivered !== false;
        const groups = new Map();

        (Array.isArray(records) ? records : []).forEach((record) => {

            if (!isStoreCustomer(record)) {
                return;
            }

            if (isCancelled(record)) {
                return;
            }

            if (excludeDelivered && isDelivered(record)) {
                return;
            }

            const row = toDetailRow(record, subcategoryByCode);

            if (!row.deadline || row.deadline < bounds.start || row.deadline > bounds.end) {
                return;
            }

            const groupKey = row.deadline + '\t' + (row.manageNo || ('id:' + row.recordId));
            const group = groups.get(groupKey) || [];

            group.push(row);
            groups.set(groupKey, group);

        });

        const days = {};

        groups.forEach((groupRows) => {

            const deadline = groupRows[0].deadline;

            if (!days[deadline]) {
                days[deadline] = {
                    counts: emptyCounts(),
                    rows: [],
                };
            }

            const union = new Set();

            groupRows.forEach((row) => {
                row.categoryKeys.forEach((key) => union.add(key));
            });

            const chosenKey = pickPriorityCategoryKey([...union]);
            const chosenKeys = chosenKey ? [chosenKey] : [];

            if (chosenKey) {
                days[deadline].counts[chosenKey] += 1;
            } else {
                days[deadline].counts.uncategorized = Number(days[deadline].counts.uncategorized || 0) + 1;
            }

            const duplicate = groupRows.length > 1 && Boolean(groupRows[0].manageNo);

            groupRows.forEach((row) => {
                days[deadline].rows.push({
                    ...row,
                    categoryKeys: chosenKeys,
                    categoriesLabel: categoryLabel(chosenKeys),
                    duplicate: duplicate,
                });
            });

        });

        Object.keys(days).forEach((date) => {
            days[date].rows.sort((left, right) => (
                compareManageNo(left.manageNo, right.manageNo)
                || compareManageNo(left.recordId, right.recordId)
            ));
        });

        return {
            year: bounds.year,
            month: bounds.month,
            start: bounds.start,
            end: bounds.end,
            label: bounds.label,
            days: days,
        };

    };

    const dedupeByManageNo = (rows) => {

        const seen = new Set();
        const out = [];

        (Array.isArray(rows) ? rows : []).forEach((row) => {

            const key = row.manageNo || ('id:' + row.recordId);

            if (seen.has(key)) {
                return;
            }

            seen.add(key);
            out.push(row);

        });

        return out;

    };

    const deadlineFlags = (deadline, todayYmd) => {

        const d = String(deadline ?? '').slice(0, 10);
        const flags = {
            overdue: false,
            today: false,
            within7: false,
        };

        if (!d || !todayYmd) {
            return flags;
        }

        const end = addDaysYmd(todayYmd, 7);

        if (d < todayYmd) {
            flags.overdue = true;
        }

        if (d === todayYmd) {
            flags.today = true;
        }

        if (d >= todayYmd && d <= end) {
            flags.within7 = true;
        }

        return flags;

    };

    /**
     * KPI 用行を組み立て。取消・他顧客は除外。
     * ready は納期空欄可。deadline 系は納品済除外。
     */
    const buildKpiModel = (records, subcategoryByCode, todayYmd) => {

        const buckets = {
            overdue: [],
            today: [],
            within7: [],
            ready: [],
        };

        (Array.isArray(records) ? records : []).forEach((record) => {

            if (!isStoreCustomer(record)) {
                return;
            }

            if (isCancelled(record)) {
                return;
            }

            const row = toDetailRow(record, subcategoryByCode);
            const flags = deadlineFlags(row.deadline, todayYmd);

            if (isReadyForPickup(record)) {
                buckets.ready.push(row);
            }

            if (isDelivered(record)) {
                return;
            }

            if (!row.deadline) {
                return;
            }

            if (flags.overdue) {
                buckets.overdue.push(row);
            }

            if (flags.today) {
                buckets.today.push(row);
            }

            if (flags.within7) {
                buckets.within7.push(row);
            }

        });

        const counts = {};
        const lists = {};

        Object.keys(buckets).forEach((key) => {
            const unique = dedupeByManageNo(buckets[key]).sort((left, right) => (
                compareManageNo(left.deadline, right.deadline)
                || compareManageNo(left.manageNo, right.manageNo)
                || compareManageNo(left.recordId, right.recordId)
            ));

            lists[key] = unique;
            counts[key] = unique.length;
        });

        return {
            today: todayYmd,
            counts: counts,
            lists: lists,
        };

    };

    const dayCounts = (model, date) => (
        model?.days?.[date]?.counts || emptyCounts()
    );

    const dayRows = (model, date) => (
        model?.days?.[date]?.rows ? model.days[date].rows.slice() : []
    );

    const visibleCountLines = (counts) => {
        const lines = cfg().CATEGORIES
            .filter((category) => Number(counts?.[category.key] || 0) > 0)
            .map((category) => ({
                key: category.key,
                label: category.shortLabel,
                count: counts[category.key],
            }));

        if (Number(counts?.uncategorized || 0) > 0) {
            lines.push({
                key: 'uncategorized',
                label: cfg().MESSAGES.uncategorized,
                count: counts.uncategorized,
            });
        }

        return lines;
    };

    const detailGroups = (model, date) => {
        const rows = dayRows(model, date);
        const counts = dayCounts(model, date);
        const groups = cfg().CATEGORIES
            .filter((category) => Number(counts?.[category.key] || 0) > 0)
            .map((category) => ({
                key: category.key,
                label: category.label,
                count: counts[category.key],
                rows: rows.filter((row) => (
                    Array.isArray(row.categoryKeys)
                    && row.categoryKeys.indexOf(category.key) !== -1
                )),
            }));

        const uncategorized = rows.filter((row) => (
            !Array.isArray(row.categoryKeys) || row.categoryKeys.length === 0
        ));

        if (uncategorized.length) {
            const unique = [];
            const seen = new Set();

            uncategorized.forEach((row) => {
                const key = row.manageNo || ('id:' + row.recordId);

                if (seen.has(key)) {
                    return;
                }

                seen.add(key);
                unique.push(row);
            });

            groups.push({
                key: 'uncategorized',
                label: cfg().MESSAGES.uncategorized,
                count: unique.length,
                rows: uncategorized,
            });
        }

        return groups;
    };

    const formatLongDate = (date) => {

        const parts = String(date ?? '').split('-');

        if (parts.length !== 3) {
            return '';
        }

        return Number(parts[0]) + '年' + Number(parts[1]) + '月' + Number(parts[2]) + '日';

    };

    const detailCountText = (count) => (
        cfg().MESSAGES.detailPrefix + count + cfg().MESSAGES.detailSuffix
    );

    const orderDetailPath = (recordId) => (
        '/k/' + cfg().ORDER_APP_ID + '/show#record=' + encodeURIComponent(String(recordId ?? ''))
    );

    const orderFetchFields = () => {

        const F = cfg().FIELDS;

        return [
            F.id,
            F.manageNo,
            F.deadline,
            F.customerCode,
            F.customerName,
            F.clientName,
            F.kimonoType,
            F.kimonoSpec,
            F.processStatus,
            F.workStatus,
            F.locationStatus,
            F.deliveryStatus,
            F.aggregationStatus,
            F.detailTable,
        ];

    };

    const productFetchFields = () => ([
        cfg().FIELDS.productCode,
        cfg().FIELDS.subcategory,
    ]);

    const fetchAllPages = async (baseQuery, fetchPage) => {

        const limit = cfg().PAGE_LIMIT;
        const maxOffset = cfg().MAX_OFFSET;
        const all = [];
        let offset = 0;
        let truncated = false;

        while (true) {

            const query = baseQuery + ' limit ' + limit + ' offset ' + offset;
            const records = await fetchPage(query);
            const list = Array.isArray(records) ? records : [];

            all.push(...list);

            if (list.length < limit) {
                break;
            }

            if (offset >= maxOffset) {
                truncated = true;
                break;
            }

            offset += limit;

        }

        return {
            records: all,
            truncated: truncated,
        };

    };

    window.CAYANAS_StoreDeadlineEngine = {
        escapeQueryValue,
        monthBounds,
        shiftMonth,
        todayParts,
        addDaysYmd,
        weekdayIndexMonday,
        buildCalendarWeeks,
        buildMonthQuery,
        buildOverdueQuery,
        buildWithin7Query,
        buildReadyQuery,
        buildKpiPoolQuery,
        isCancelled,
        isStoreCustomer,
        isDelivered,
        isReadyForPickup,
        joinProcessing,
        subcategoriesForRecord,
        pickPriorityCategoryKey,
        matchingCategoryKeys,
        categoryLabel,
        collectItemCodes,
        chunkItemCodes,
        buildProductQuery,
        buildSubcategoryMap,
        aggregateMonth,
        deadlineFlags,
        buildKpiModel,
        dayCounts,
        dayRows,
        visibleCountLines,
        detailGroups,
        formatLongDate,
        detailCountText,
        orderDetailPath,
        orderFetchFields,
        productFetchFields,
        fetchAllPages,
    };

}());
