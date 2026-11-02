(function () {
    'use strict';

    /**
     * 受注検索 — クエリ生成、取消除外、加工内容連結、並び順、ふりがな候補。
     * App16 は更新しない（検索画面）。正本更新は order_client_kana_*。
     */

    const cfg = () => {

        if (typeof CAYANAS_ORDER_SEARCH === 'undefined') {
            throw new Error('CAYANAS_ORDER_SEARCH が未読込です。order_search_config.js を先に登録してください。');
        }

        return CAYANAS_ORDER_SEARCH;

    };

    const kana = () => {

        if (typeof CAYANAS_KanaNormalize === 'undefined') {
            return null;
        }

        return CAYANAS_KanaNormalize;

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
        const kn = kana();

        return {
            customerCode: String(source.customerCode ?? '').trim(),
            customerName: String(source.customerName ?? '').trim(),
            clientName: String(source.clientName ?? '').trim(),
            clientNameKana: String(source.clientNameKana ?? '').trim(),
            clientNameKanaKey: kn
                ? kn.normalizeKanaKey(source.clientNameKana)
                : String(source.clientNameKana ?? '').trim(),
            slipNo: String(source.slipNo ?? '').trim(),
            manageNo: String(source.manageNo ?? '').trim(),
            kimonoType: String(source.kimonoType ?? '').trim(),
            orderDateFrom: String(source.orderDateFrom ?? '').trim(),
            orderDateTo: String(source.orderDateTo ?? '').trim(),
            includeDelivered: source.includeDelivered === true,
            excludeA550: source.excludeA550 === true,
        };

    };

    const hasTextCondition = (criteria) => Boolean(
        criteria.customerCode
        || criteria.customerName
        || criteria.clientName
        || criteria.clientNameKana
        || criteria.slipNo
        || criteria.manageNo
        || criteria.kimonoType
        || criteria.orderDateFrom
        || criteria.orderDateTo
    );

    const quote = (value) => '"' + escapeQueryValue(value) + '"';

    /**
     * kintone サーバ側クエリ。
     * ふりがな未登録を除外しない: kana 条件は OR で漢字氏名にも当てる場合のみ追加。
     * かなのみのとき client_name_kana like。空欄レコードは漢字・他条件で拾う。
     */
    const buildSearchRequest = (input) => {

        const criteria = normalizeInput(input);
        const messages = cfg().MESSAGES;

        if (!hasTextCondition(criteria)) {
            return {
                ok: false,
                message: messages.needCondition,
                query: '',
                criteria,
            };
        }

        const F = cfg().FIELDS;
        const parts = [];
        const kn = kana();

        if (criteria.customerCode) {
            parts.push(F.customerCode + ' = ' + quote(criteria.customerCode));
        }

        if (criteria.excludeA550) {
            parts.push(F.customerCode + ' != ' + quote(cfg().STORE_CUSTOMER_CODE));
        }

        if (criteria.customerName) {
            parts.push(F.customerName + ' like ' + quote(criteria.customerName));
        }

        if (criteria.clientName) {
            parts.push(F.clientName + ' like ' + quote(criteria.clientName));
        }

        if (criteria.clientNameKana) {
            // ふりがな欄に漢字が入った場合（電話時の誤入力・漢字氏名の代用）は
            // client_name にも OR して、かな未登録の過去データを落とさない。
            parts.push(buildKanaClause(F, criteria.clientNameKana, kn));
        }

        if (criteria.slipNo) {
            parts.push(F.slipNo + ' like ' + quote(criteria.slipNo));
        }

        if (criteria.manageNo) {
            parts.push(F.manageNo + ' = ' + quote(criteria.manageNo));
        }

        if (criteria.kimonoType) {
            parts.push(F.kimonoType + ' like ' + quote(criteria.kimonoType));
        }

        if (criteria.orderDateFrom) {
            parts.push(F.orderDate + ' >= ' + quote(criteria.orderDateFrom));
        }

        if (criteria.orderDateTo) {
            parts.push(F.orderDate + ' <= ' + quote(criteria.orderDateTo));
        }

        if (!criteria.includeDelivered) {
            parts.push(
                '(' + F.deliveryStatus + ' not in (' + quote(cfg().DELIVERY_DONE) + ')'
                + ' or ' + F.deliveryStatus + ' in (""))'
            );
        }

        return {
            ok: true,
            message: '',
            query: parts.join(' and '),
            criteria,
        };

    };

    const toHalfSafe = (value) => {

        const kn = kana();

        if (!kn) {
            return String(value ?? '');
        }

        return kn.toHalfWidthAscii(value);

    };

    const kanaSearchToken = (raw, kn) => {

        const text = String(raw ?? '');

        if (kn) {
            return kn.toHiragana(toHalfSafe(text)).replace(/\s+/g, '');
        }

        return text.replace(/\s+/g, '');

    };

    const isKanjiHeavyKanaInput = (raw, kn) => Boolean(kn && kn.hasKanjiChars(raw));

    /**
     * かな条件。漢字混じり入力時は client_name を OR（過渡期の未登録救済）。
     */
    const buildKanaClause = (F, raw, kn) => {

        const token = kanaSearchToken(raw, kn);

        if (isKanjiHeavyKanaInput(raw, kn)) {
            return '('
                + F.clientNameKana + ' like ' + quote(token)
                + ' or '
                + F.clientName + ' like ' + quote(String(raw).trim())
                + ')';
        }

        return F.clientNameKana + ' like ' + quote(token);

    };

    /**
     * サーバクエリ後のクライアント側ふりがな再フィルタ（正規化ゆれ吸収）。
     * kana 条件が無いときは全件通過。
     * 漢字混じり入力は client_name 一致も残す（空かなの過去データを落とさない）。
     */
    const filterRowsByKana = (rows, criteria) => {

        const kn = kana();
        const list = Array.isArray(rows) ? rows : [];

        if (!criteria || !criteria.clientNameKana || !kn) {
            return list;
        }

        const raw = criteria.clientNameKana;
        const allowKanjiName = isKanjiHeavyKanaInput(raw, kn);
        const nameNeedle = String(raw).trim();

        return list.filter((row) => {

            if (kn.matchesKana(row.clientNameKana, raw, 'partial')) {
                return true;
            }

            if (allowKanjiName && nameNeedle && String(row.clientName || '').indexOf(nameNeedle) !== -1) {
                return true;
            }

            return false;

        });

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
            clientNameKana: readValue(record, F.clientNameKana),
            clientNameKanaStatus: readValue(record, F.clientNameKanaStatus),
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

    const orderEditPath = (recordId) => (
        '/k/' + cfg().ORDER_APP_ID + '/show#record=' + encodeURIComponent(String(recordId ?? ''))
        + '&mode=edit'
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
            F.clientNameKana,
            F.clientNameKanaStatus,
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

        return { records: all, truncated, fetched: all.length };

    };

    const clearedInput = () => ({
        customerCode: '',
        customerName: '',
        clientName: '',
        clientNameKana: '',
        slipNo: '',
        manageNo: '',
        kimonoType: '',
        orderDateFrom: '',
        orderDateTo: '',
        includeDelivered: false,
        excludeA550: false,
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

    const resultCountText = (count, meta) => {

        const messages = cfg().MESSAGES;
        let text = messages.resultPrefix + count + messages.resultSuffix;

        if (meta && meta.truncated) {
            text += '（'
                + messages.truncatedPrefix
                + cfg().DISPLAY_LIMIT
                + messages.truncatedMid
                + cfg().MAX_OFFSET
                + messages.truncatedSuffix
                + '）';
        }

        return text;

    };

    /**
     * 予測候補用クエリ（法人コード任意＋かな like）。debounce 側で呼ぶ。
     */
    const buildSuggestRequest = (input) => {

        const criteria = normalizeInput(input);
        const kn = kana();
        const key = criteria.clientNameKanaKey || (kn ? kn.normalizeKanaKey(criteria.clientNameKana) : '');

        if (!key || key.length < cfg().SUGGEST_MIN_CHARS) {
            return { ok: false, query: '', key: '' };
        }

        const F = cfg().FIELDS;
        const parts = [];

        if (criteria.customerCode) {
            parts.push(F.customerCode + ' = ' + quote(criteria.customerCode));
        }

        if (criteria.excludeA550) {
            parts.push(F.customerCode + ' != ' + quote(cfg().STORE_CUSTOMER_CODE));
        }

        parts.push(buildKanaClause(F, criteria.clientNameKana, kn));

        return {
            ok: true,
            query: parts.join(' and ') + ' order by order_date desc limit ' + cfg().SUGGEST_FETCH_LIMIT,
            key,
            criteria,
        };

    };

    /**
     * 同音異字を氏名単位でまとめた候補。
     */
    const buildSuggestItems = (records, queryKana) => {

        const kn = kana();
        const rows = buildRows(records);
        const allowKanjiName = isKanjiHeavyKanaInput(queryKana, kn);
        const nameNeedle = String(queryKana || '').trim();
        const filtered = rows.filter((row) => {

            if (row.clientNameKana && (!kn || kn.matchesKana(row.clientNameKana, queryKana, 'partial'))) {
                return true;
            }

            if (allowKanjiName && nameNeedle && String(row.clientName || '').indexOf(nameNeedle) !== -1) {
                return true;
            }

            return false;

        });

        const map = new Map();

        filtered.forEach((row) => {

            const status = row.clientNameKanaStatus || '';
            const key = [
                row.customerCode,
                row.clientName,
                kn ? kn.normalizeKanaKey(row.clientNameKana || row.clientName) : (row.clientNameKana || row.clientName),
            ].join('\u0001');

            if (!map.has(key)) {
                map.set(key, {
                    customerCode: row.customerCode,
                    customerName: row.customerName,
                    clientName: row.clientName,
                    clientNameKana: row.clientNameKana,
                    clientNameKanaStatus: status,
                    unconfirmed: !row.clientNameKana || status !== cfg().KANA_STATUS.confirmed,
                    kimonoTypes: new Set(),
                    count: 0,
                    latestOrderDate: row.orderDate,
                    sampleRecordId: row.recordId,
                });
            }

            const item = map.get(key);

            item.count += 1;

            if (row.kimonoType) {
                item.kimonoTypes.add(row.kimonoType);
            }

            if (row.orderDate && row.orderDate > item.latestOrderDate) {
                item.latestOrderDate = row.orderDate;
                item.sampleRecordId = row.recordId;
            }

        });

        return Array.from(map.values())
            .map((item) => ({
                customerCode: item.customerCode,
                customerName: item.customerName,
                clientName: item.clientName,
                clientNameKana: item.clientNameKana,
                clientNameKanaStatus: item.clientNameKanaStatus,
                unconfirmed: item.unconfirmed,
                kimonoTypes: Array.from(item.kimonoTypes),
                count: item.count,
                latestOrderDate: item.latestOrderDate,
                sampleRecordId: item.sampleRecordId,
            }))
            .sort((a, b) => String(b.latestOrderDate).localeCompare(String(a.latestOrderDate)))
            .slice(0, cfg().SUGGEST_DISPLAY_LIMIT);

    };

    const applyDisplayLimit = (rows) => {

        const list = Array.isArray(rows) ? rows : [];
        const limit = cfg().DISPLAY_LIMIT;

        if (list.length <= limit) {
            return { rows: list, truncated: false };
        }

        return { rows: list.slice(0, limit), truncated: true };

    };

    window.CAYANAS_OrderSearchEngine = {
        escapeQueryValue,
        normalizeInput,
        hasTextCondition,
        buildSearchRequest,
        filterRowsByKana,
        isCancelled,
        joinProcessing,
        compareRows,
        buildRows,
        orderDetailPath,
        orderEditPath,
        fetchFields,
        fetchAllPages,
        clearedInput,
        isSearchEnterKey,
        resultCountText,
        buildSuggestRequest,
        buildSuggestItems,
        applyDisplayLimit,
    };

}());
