(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * master_list_service.js
     *
     * マスタ一覧印刷の定義と、各マスタの全件取得・帳票データ組み立て。
     */

    const MasterListRegistry = {};

    const DEFINITIONS = [
        {
            reportType: 'customer_list',
            appId: 8,
            buttonLabel: '顧客一覧印刷',
            documentTitle: '顧客マスタ一覧',
            codeLabel: '顧客コード',
            nameLabel: '顧客名',
            codeField: 'customer_code',
            nameField: 'customer_name',
            orderField: 'customer_code',
            filterNoteAll: '全件（顧客コード昇順）',
        },
        {
            reportType: 'product_list',
            appId: 13,
            buttonLabel: '商品一覧印刷',
            documentTitle: '商品マスタ一覧',
            codeLabel: '商品コード',
            nameLabel: '商品名',
            codeField: 'item_code',
            nameField: 'item_name',
            orderField: 'item_code',
            groupField: 'subcategory',
            groupLabel: '中分類',
            groupEmptyLabel: '（中分類未設定）',
            filterNoteAll: '中分類ごと（商品コード昇順）',
        },
        {
            reportType: 'kimono_type_list',
            appId: 11,
            buttonLabel: '着物種類一覧印刷',
            documentTitle: '着物種類マスタ一覧',
            codeLabel: '着物種類コード',
            nameLabel: '品名',
            codeField: 'kimono_type_code',
            nameField: 'kimono_type',
            orderField: 'kimono_type_code',
            filterNoteAll: '全件（着物種類コード昇順）',
        },
        {
            reportType: 'outsource_vendor_list',
            appId: 26,
            buttonLabel: '外注先一覧印刷',
            documentTitle: '外注先マスタ一覧',
            codeLabel: '外注先コード',
            nameLabel: '外注先名',
            codeField: 'outsource_company_code',
            nameField: 'outsource_company',
            orderField: 'outsource_company_code',
            filterNoteAll: '全件（外注先コード昇順）',
        },
        {
            reportType: 'outsource_processing_list',
            appId: 23,
            buttonLabel: '外注加工一覧印刷',
            documentTitle: '外注加工マスタ一覧',
            codeLabel: '加工コード',
            nameLabel: '加工内容',
            codeField: 'processing_code',
            nameField: 'processing_details',
            orderField: 'processing_code',
            filterNoteAll: '全件（加工コード昇順）',
        },
    ];

    const byReportType = new Map(DEFINITIONS.map((def) => [def.reportType, def]));
    const byAppId = new Map(DEFINITIONS.map((def) => [def.appId, def]));

    MasterListRegistry.getAll = () => DEFINITIONS.slice();

    MasterListRegistry.getByReportType = (reportType) => {

        const key = String(reportType ?? '').trim();

        if (!key || !byReportType.has(key)) {
            throw new Error(`マスタ一覧の帳票種別が不正です。（${key}）`);
        }

        return byReportType.get(key);

    };

    MasterListRegistry.getByAppId = (appId) => {

        const normalized = Number(appId);

        if (Number.isNaN(normalized)) {
            return null;
        }

        return byAppId.get(normalized) ?? null;

    };

    window.MasterListRegistry = MasterListRegistry;

    const MasterList = {};

    const RECORDS_LIMIT = 500;
    const MAX_OFFSET = 10000;

    const getFieldValue = (record, fieldCode) => {

        const field = record?.[fieldCode];

        if (!field || field.value === null || field.value === undefined) {
            return '';
        }

        return field.value;

    };

    const formatPrintedAt = () => {

        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');

        return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} `
            + `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    };

    MasterList.getListFilterCondition = () => {

        if (typeof kintone === 'undefined' || typeof kintone.app?.getQueryCondition !== 'function') {
            return '';
        }

        return String(kintone.app.getQueryCondition() ?? '').trim();

    };

    const buildRecordsQuery = (definition, listCondition) => {

        const codeField = String(definition.codeField).trim();
        const groupField = String(definition.groupField ?? '').trim();
        const orderParts = [];

        if (groupField !== '') {
            orderParts.push(`${groupField} asc`);
        }

        orderParts.push(`${String(definition.orderField ?? codeField).trim()} asc`);

        const order = `order by ${orderParts.join(', ')}`;
        const condition = String(listCondition ?? '').trim();

        if (condition === '') {
            return order;
        }

        return `${condition} ${order}`;

    };

    const fetchAllRecords = async (definition, listCondition) => {

        const baseQuery = buildRecordsQuery(definition, listCondition);
        const fields = [definition.codeField, definition.nameField];

        if (definition.groupField) {
            fields.push(definition.groupField);
        }
        const records = [];
        let offset = 0;

        while (offset <= MAX_OFFSET) {

            const query = `${baseQuery} limit ${RECORDS_LIMIT} offset ${offset}`;

            const response = await kintone.api(
                kintone.api.url('/k/v1/records', true),
                'GET',
                {
                    app: definition.appId,
                    query,
                    fields,
                }
            );

            records.push(...(response.records ?? []));

            if ((response.records ?? []).length < RECORDS_LIMIT) {
                break;
            }

            offset += RECORDS_LIMIT;

        }

        return records;

    };

    const mapRecordToRow = (record, definition) => {

        const row = {
            code: String(getFieldValue(record, definition.codeField) ?? '').trim(),
            name: String(getFieldValue(record, definition.nameField) ?? '').trim(),
        };

        if (definition.groupField) {
            const groupValue = String(getFieldValue(record, definition.groupField) ?? '').trim();
            const emptyLabel = String(definition.groupEmptyLabel ?? '（未設定）').trim();

            row.group_key = groupValue !== '' ? groupValue : emptyLabel;
        }

        return row;

    };

    MasterList.fetchReportData = async ({ reportType, listCondition } = {}) => {

        Validation.assertModule(MasterListRegistry, 'MasterListRegistry', 'getByReportType');

        const type = String(reportType ?? '').trim();

        if (type === '') {
            throw new Error('帳票種別（reportType）が指定されていません。');
        }

        const definition = MasterListRegistry.getByReportType(type);

        const condition = listCondition !== undefined
            ? String(listCondition ?? '').trim()
            : MasterList.getListFilterCondition();

        const records = await fetchAllRecords(definition, condition);
        const details = records
            .map((record) => mapRecordToRow(record, definition))
            .filter((row) => row.code !== '');

        const header = {
            document_title: definition.documentTitle,
            code_label: definition.codeLabel,
            name_label: definition.nameLabel,
            printed_at: formatPrintedAt(),
            filter_note: condition !== ''
                ? '一覧画面の絞り込み条件を反映しています。'
                : definition.filterNoteAll,
            record_count: details.length,
        };

        if (definition.groupField) {
            header.group_mode = true;
            header.group_label = String(definition.groupLabel ?? '分類').trim();
        }

        return {
            header,
            details,
            summary: {
                count: details.length,
            },
        };

    };

    window.MasterList = MasterList;

})();
