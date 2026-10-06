(function () {
    'use strict';

    /**
     * 受注検索 — クエリ生成、取消除外、加工内容連結、並び順。
     * App16 は更新しない。
     */

    const cfg = () => {

        if (typeof CAYANAS_ORDER_SEARCH === 'undefined') {
            throw new Error('CAYANAS_ORDER_SEARCH が未読込です。order_search_config.js を先に登録してください。');
        }

        return CAYANAS_ORDER_SEARCH;

    };

    const escapeQueryValue = (value) => String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

    const readValue = (record, code) => {

        const field = record?.[code];

        if (!field || field.value === null || field.value === undefined) {
            return '';
        }

        return String(field.value).trim();

    };

    const normalizeInput = (input) => {

        const source = input || {};

        return {
            customerCode: String(source.customerCode ?? '').trim(),
            customerName: String(source.customerName ?? '').trim(),
            clientName: String(source.clientName ?? '').trim(),
            slipNo: String(source.slipNo ?? '').trim(),
            manageNo: String(source.manageNo ?? '').trim(),
            includeDelivered: source.includeDelivered === true,
        };

    };

    const hasTextCondition = (criteria) => Boolean(
        criteria.customerCode
        || criteria.customerName
        || criteria.clientName
        || criteria.slipNo
        || criteria.manageNo
    );

    const quote = (value) => '"' + escapeQueryValue(value) + '"';

    const buildSearchRequest = (input) => {

        const criteria = normalizeInput(input);
        const messages = cfg().MESSAGES;

        if (!hasTextCondition(criteria)) {
            return {
                ok: false,
                message: messages.needCondition,
                query: '',
            };
        }

        const F = cfg().FIELDS;
        const parts = [];

        if (criteria.customerCode) {
            parts.push(F.customerCode + ' = ' + quote(criteria.customerCode));
        }

        if (criteria.customerName) {
            parts.push(F.customerName + ' like ' + quote(criteria.customerName));
        }

        if (criteria.clientName) {
            parts.push(F.clientName + ' like ' + quote(criteria.clientName));
        }

        if (criteria.slipNo) {
            parts.push(F.slipNo + ' like ' + quote(criteria.slipNo));
        }

        if (criteria.manageNo) {
            parts.push(F.manageNo + ' = ' + quote(criteria.manageNo));
        }

        if (!criteria.includeDelivered) {
            // ドロップダウンは != が使えず 400 になる。未選択は not in に含まれないので空欄も残す。
            parts.push(
                '(' + F.deliveryStatus + ' not in (' + quote(cfg().DELIVERY_DONE) + ')'
                + ' or ' + F.deliveryStatus + ' in (""))'
            );
        }

        return {
            ok: true,
            message: '',
            query: parts.join(' and '),
        };

    };

    const isCancelled = (record) => {

        const field = record?.[cfg().FIELDS.aggregationStatus];
        const value = field ? field.value : undefined;

        return value === cfg().AGGREGATION_CANCELLED;

    };

    const joinProcessing = (record) => {

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

        return names.join(cfg().PROCESSING_SEPARATOR);

    };

    const compareManageNoDesc = (left, right) => {

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

        return rightText.localeCompare(leftText, 'ja', { numeric: true });

    };

    const compareRows = (left, right) => {

        const leftHas = Boolean(left.deadline);
        const rightHas = Boolean(right.deadline);

        if (leftHas !== rightHas) {
            return leftHas ? -1 : 1;
        }

        if (left.deadline !== right.deadline) {
            return left.deadline < right.deadline ? -1 : 1;
        }

        return compareManageNoDesc(left.manageNo, right.manageNo);

    };

    const toRow = (record) => {

        const F = cfg().FIELDS;

        return {
            recordId: readValue(record, F.id),
            manageNo: readValue(record, F.manageNo),
            deadline: readValue(record, F.deadline).slice(0, 10),
            orderDate: readValue(record, F.orderDate).slice(0, 10),
            customerCode: readValue(record, F.customerCode),
            customerName: readValue(record, F.customerName),
            clientName: readValue(record, F.clientName),
            slipNo: readValue(record, F.slipNo),
            kimonoType: readValue(record, F.kimonoType),
            kimonoSpec: readValue(record, F.kimonoSpec),
            processing: joinProcessing(record),
            processStatus: readValue(record, F.processStatus),
            workStatus: readValue(record, F.workStatus),
            locationStatus: readValue(record, F.locationStatus),
            deliveryStatus: readValue(record, F.deliveryStatus),
            duplicate: false,
        };

    };

    const buildRows = (records) => {

        const rows = (Array.isArray(records) ? records : [])
            .filter((record) => !isCancelled(record))
            .map(toRow);
        const counts = new Map();

        rows.forEach((row) => {

            if (!row.manageNo) {
                return;
            }

            counts.set(row.manageNo, (counts.get(row.manageNo) || 0) + 1);

        });

        rows.forEach((row) => {
            row.duplicate = Boolean(row.manageNo) && counts.get(row.manageNo) > 1;
        });

        rows.sort(compareRows);

        return rows;

    };

    const orderDetailPath = (recordId) => (
        '/k/' + cfg().ORDER_APP_ID + '/show#record=' + encodeURIComponent(String(recordId ?? ''))
    );

    const fetchFields = () => {

        const F = cfg().FIELDS;

        return [
            F.id,
            F.manageNo,
            F.orderDate,
            F.deadline,
            F.customerCode,
            F.customerName,
            F.clientName,
            F.slipNo,
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

    const fetchAllPages = async (baseQuery, fetchPage) => {

        const limit = cfg().PAGE_LIMIT;
        const maxOffset = cfg().MAX_OFFSET;
        const all = [];
        let offset = 0;

        while (true) {

            const query = baseQuery + ' limit ' + limit + ' offset ' + offset;
            const records = await fetchPage(query);
            const list = Array.isArray(records) ? records : [];

            all.push(...list);

            if (list.length < limit) {
                break;
            }

            if (offset >= maxOffset) {
                break;
            }

            offset += limit;

        }

        return all;

    };

    const clearedInput = () => ({
        customerCode: '',
        customerName: '',
        clientName: '',
        slipNo: '',
        manageNo: '',
        includeDelivered: false,
    });

    const isSearchEnterKey = (event) => {

        if (!event || event.key !== 'Enter') {
            return false;
        }

        if (event.isComposing || event.keyCode === 229) {
            return false;
        }

        return true;

    };

    const resultCountText = (count) => {

        const messages = cfg().MESSAGES;

        return messages.resultPrefix + count + messages.resultSuffix;

    };

    window.CAYANAS_OrderSearchEngine = {
        escapeQueryValue,
        normalizeInput,
        hasTextCondition,
        buildSearchRequest,
        isCancelled,
        joinProcessing,
        compareRows,
        buildRows,
        orderDetailPath,
        fetchFields,
        fetchAllPages,
        clearedInput,
        isSearchEnterKey,
        resultCountText,
    };

}());
