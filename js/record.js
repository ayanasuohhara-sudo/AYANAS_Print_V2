(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * record.js
     *
     * kintone レコードから帳票用データを取得する。
     * HTML 生成・DOM 操作・Format.js の利用は行わない。
     */

    const Record = {};

    const DELIVERY_APP_ID = 19;
    const INVOICE_APP_ID = 35;
    const CUSTOMER_APP_ID = 8;

    const CUSTOMER_ADDRESS_FIELDS = [
        'post_no',
        'prefecture',
        'city',
        'address',
        'building',
    ];

    /** 受注票（App 16）ヘッダーフィールド */
    const ORDER_HEADER_FIELDS = [
        'manage_no',
        'order_date',
        'deadline',
        'customer_code',
        'customer_name',
        'client_name',
        'slip_no',
        'in_charge',
        'kimono_type',
        'kimono_spec',
    ];

    /** 海外用受注表（App 16・右半分） */
    const OVERSEAS_ORDER_HEADER_FIELDS = [
        'overseas_color',
        'overseas_pattern',
        'overseas_embroidery',
        'overseas_tailoring',
        'overseas_mat_seiden',
        'overseas_weave_chirimen',
        'overseas_acc_douura',
        'overseas_mat_kasen',
        'overseas_weave_hiraori',
        'overseas_acc_eriura',
        'overseas_mat_asu',
        'overseas_weave_ayaori',
        'overseas_acc_hgake',
        'overseas_mat_wata',
        'overseas_weave_shaori',
        'overseas_acc_hiyoku',
        'overseas_weave_tsumugi',
        'overseas_acc_sefuse',
        'overseas_acc_haneri',
        'overseas_acc_erinuno',
        'overseas_acc_erishin',
        'overseas_acc_emon',
        'overseas_acc_iseshiki',
        'overseas_acc_kataura',
    ];

    /** 受注票（App 16）明細フィールド */
    const ORDER_DETAIL_FIELDS = {
        string: ['item_code', 'item_name'],
        number: ['unit_price', 'qty', 'amount'],
    };

    /** 受注票（App 16）明細テーブル */
    const ORDER_DETAIL_TABLE_CODE = 'detail_table';

    /**
     * 納品管理（App 19）フィールドマッピング
     * kintone フィールドコード → 帳票データキー
     */
    const DELIVERY_HEADER_MAP = {
        delivery_no: 'delivery_no',
        delivery_date: 'delivery_date',
        customer_name: 'customer_name',
        customer_code: 'customer_code',
    };

    /** 請求書（App 35）ヘッダーフィールド */
    const INVOICE_HEADER_FIELDS = [
        'invoice_no',
        'invoice_date',
        'closing_date',
        'billing_from',
        'billing_to',
        'customer_code',
        'customer_name',
        'due_date',
        'remarks',
        'item_count',
        'qty_total',
        'subtotal',
        'tax',
        'total',
        'carry_over',
        'invoice_amount',
        'payment_amount',
    ];

    /** 請求書（App 35）明細テーブル */
    const INVOICE_DETAIL_TABLE_CODE = 'invoice_detail';

    /** 請求書（App 35）明細フィールド */
    const INVOICE_DETAIL_FIELDS = {
        string: [
            'delivery_no',
            'delivery_date',
            'manage_no',
            'client_name',
            'kimono_type',
            'kimono_spec',
            'item_name',
            'slip_no',
            'in_charge',
        ],
        number: ['qty', 'unit_price', 'amount'],
    };

    /** 納品管理（App 19）明細テーブル */
    const DELIVERY_DETAIL_TABLE_CODE = 'delivery_detail';

    /** 納品管理（App 19）明細フィールド */
    const DELIVERY_DETAIL_FIELDS = {
        string: [
            'manage_no',
            'client_name',
            'item_name',
            'kimono_type',
            'kimono_spec',
            'slip_no',
            'in_charge',
        ],
        number: ['qty', 'unit_price', 'amount'],
    };

    const getFieldValue = (fields, fieldCode) => {

        if (!fields || typeof fields !== 'object') {
            return '';
        }

        const field = fields[fieldCode];

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

        if (Number.isNaN(number)) {
            throw new Error(`数値に変換できません。（${value}）`);
        }

        return number;

    };

    const normalizeAppId = (appId) => {

        if (appId === null || appId === undefined || appId === '') {
            return null;
        }

        const normalized = Number(appId);

        return Number.isNaN(normalized) ? null : normalized;

    };

    const getCurrentRecord = (record) => {

        if (record && typeof record === 'object') {
            return record;
        }

        const current = kintone.app.record.get();

        if (!current || !current.record) {
            throw new Error('レコードを取得できません。');
        }

        return current.record;

    };

    const getRecordId = (record) => {

        const id = record?.$id?.value;

        if (id === null || id === undefined || id === '') {
            return null;
        }

        const normalized = Number(id);

        return Number.isNaN(normalized) || normalized <= 0 ? null : normalized;

    };

    const fetchInvoiceRecordFromApi = async (recordId) => {

        const response = await kintone.api(
            kintone.api.url('/k/v1/record', true),
            'GET',
            {
                app: INVOICE_APP_ID,
                id: recordId,
            }
        );

        if (!response?.record) {
            throw new Error('請求書レコードを取得できません。');
        }

        return response.record;

    };

    const resolveInvoiceRecordForPrint = async (record) => {

        const sourceRecord = getCurrentRecord(record);
        const recordId = getRecordId(sourceRecord);

        if (!recordId) {
            return sourceRecord;
        }

        try {
            return await fetchInvoiceRecordFromApi(recordId);
        } catch (error) {

            console.warn('[AYANAS Print] billing_from / billing_to 取得のため API 再取得に失敗しました。', error);

            return sourceRecord;

        }

    };

    const buildOrderHeader = (record) => {

        const header = {};

        [...ORDER_HEADER_FIELDS, ...OVERSEAS_ORDER_HEADER_FIELDS].forEach((fieldCode) => {
            header[fieldCode] = getFieldValue(record, fieldCode);
        });

        return header;

    };

    const buildDeliveryHeader = (record) => {

        const header = {};

        Object.entries(DELIVERY_HEADER_MAP).forEach(([dataKey, fieldCode]) => {
            header[dataKey] = getFieldValue(record, fieldCode);
        });

        return header;

    };

    const buildDetailRow = (row, detailFields) => {

        const rowFields = row?.value ?? {};
        const detail = {};

        detailFields.string.forEach((fieldCode) => {
            detail[fieldCode] = getFieldValue(rowFields, fieldCode);
        });

        detailFields.number.forEach((fieldCode) => {
            detail[fieldCode] = toNumber(getFieldValue(rowFields, fieldCode));
        });

        return detail;

    };

    const isEmptyDeliveryDetailRow = (detail) => {

        const itemName = String(detail.item_name ?? '').trim();

        if (itemName !== '') {
            return false;
        }

        if (detail.qty !== 0) {
            return false;
        }

        if (detail.amount !== 0) {
            return false;
        }

        return true;

    };

    const countUniqueDeliveryManageNos = (details) => {

        const manageNos = new Set();

        details.forEach((detail) => {

            const manageNo = String(detail.manage_no ?? '').trim();

            if (manageNo !== '') {
                manageNos.add(manageNo);
            }

        });

        return manageNos.size;

    };

    const buildDeliveryDetails = (record) => {

        const tableField = record[DELIVERY_DETAIL_TABLE_CODE];
        const rows = Array.isArray(tableField?.value) ? tableField.value : [];

        const details = [];
        let totalQty = 0;
        let totalAmount = 0;

        rows.forEach((row) => {

            const detail = buildDetailRow(row, DELIVERY_DETAIL_FIELDS);

            if (isEmptyDeliveryDetailRow(detail)) {
                return;
            }

            detail.rowNo = details.length + 1;

            totalQty += detail.qty;
            totalAmount += detail.amount;

            details.push(detail);

        });

        const deliveryPointCount = countUniqueDeliveryManageNos(details);

        return {
            details,
            summary: {
                count: deliveryPointCount,
                totalCount: deliveryPointCount,
                totalQty,
                totalAmount,
            },
        };

    };

    const buildDetails = (record, tableCode, detailFields) => {

        const tableField = record[tableCode];
        const rows = Array.isArray(tableField?.value) ? tableField.value : [];

        const details = [];
        let totalQty = 0;
        let totalAmount = 0;

        rows.forEach((row, index) => {

            const detail = buildDetailRow(row, detailFields);

            detail.rowNo = index + 1;

            totalQty += detail.qty;
            totalAmount += detail.amount;

            details.push(detail);

        });

        return {
            details,
            summary: {
                count: details.length,
                totalCount: details.length,
                totalQty,
                totalAmount,
            },
        };

    };

    const buildOrderReportData = (record) => {

        const { details, summary } = buildDetails(
            record,
            ORDER_DETAIL_TABLE_CODE,
            ORDER_DETAIL_FIELDS
        );

        return {
            header: buildOrderHeader(record),
            details,
            summary,
        };

    };

    const isEmptyInvoiceDetailRow = (detail) => {

        const deliveryNo = String(detail.delivery_no ?? '').trim();
        const itemName = String(detail.item_name ?? '').trim();

        if (deliveryNo !== '') {
            return false;
        }

        if (itemName !== '') {
            return false;
        }

        if (detail.qty !== 0) {
            return false;
        }

        if (detail.amount !== 0) {
            return false;
        }

        return true;

    };

    const getFirstFieldValue = (record, fieldCodes) => {

        const codes = Array.isArray(fieldCodes) ? fieldCodes : [fieldCodes];

        for (const fieldCode of codes) {

            const value = String(getFieldValue(record, fieldCode) ?? '').trim();

            if (value) {
                return value;
            }

        }

        return '';

    };

    const escapeQueryValue = (value) => String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

    const kintoneApi = (path, method, body) => new Promise((resolve, reject) => {
        kintone.api(path, method, body, resolve, reject);
    });

    const fetchCustomerRecord = async (customerCode) => {

        const code = String(customerCode ?? '').trim();

        if (!code) {
            return null;
        }

        const query = `customer_code = "${escapeQueryValue(code)}" limit 1`;
        const response = await kintoneApi(
            kintone.api.url('/k/v1/records', true),
            'GET',
            {
                app: CUSTOMER_APP_ID,
                query,
                fields: ['customer_code', ...CUSTOMER_ADDRESS_FIELDS],
            }
        );

        return response.records?.[0] ?? null;

    };

    const buildCustomerAddressFromMaster = (customerRecord) => {

        if (!customerRecord) {
            return {
                customer_postal_code: '',
                customer_address: '',
            };
        }

        const postNo = String(getFieldValue(customerRecord, 'post_no') ?? '').trim();
        const prefecture = String(getFieldValue(customerRecord, 'prefecture') ?? '').trim();
        const city = String(getFieldValue(customerRecord, 'city') ?? '').trim();
        const address = String(getFieldValue(customerRecord, 'address') ?? '').trim();
        const building = String(getFieldValue(customerRecord, 'building') ?? '').trim();
        const addressLine = [prefecture, city, address, building]
            .filter((part) => part !== '')
            .join('');

        return {
            customer_postal_code: postNo,
            customer_post_no: postNo,
            customer_prefecture: prefecture,
            customer_city: city,
            customer_address_line: address,
            customer_building: building,
            customer_address: addressLine,
        };

    };

    const enrichInvoiceHeaderWithCustomerMaster = async (header) => {

        const customerRecord = await fetchCustomerRecord(header.customer_code);

        if (!customerRecord) {
            return header;
        }

        const masterAddress = buildCustomerAddressFromMaster(customerRecord);

        if (masterAddress.customer_postal_code) {
            header.customer_postal_code = masterAddress.customer_postal_code;
        }

        if (masterAddress.customer_address) {
            header.customer_address = masterAddress.customer_address;
        }

        header.customer_post_no = masterAddress.customer_post_no;
        header.customer_prefecture = masterAddress.customer_prefecture;
        header.customer_city = masterAddress.customer_city;
        header.customer_address_line = masterAddress.customer_address_line;
        header.customer_building = masterAddress.customer_building;

        return header;

    };

    const buildInvoiceHeader = (record, details) => {

        const header = {};

        INVOICE_HEADER_FIELDS.forEach((fieldCode) => {
            header[fieldCode] = getFieldValue(record, fieldCode);
        });

        const billingFrom = String(header.billing_from ?? '').trim();
        const billingTo = String(header.billing_to ?? '').trim();

        header.billing_period = billingFrom && billingTo
            ? `${billingFrom} ～ ${billingTo}`
            : '';

        header.customer_postal_code = getFirstFieldValue(record, [
            'customer_postal_code',
            'postal_code',
            'zip_code',
        ]);

        header.customer_address = getFirstFieldValue(record, [
            'customer_address',
            'address',
        ]);

        const inCharge = details
            .map((detail) => String(detail.in_charge ?? '').trim())
            .find((value) => value !== '') ?? '';

        header.in_charge = inCharge;

        return header;

    };

    const buildInvoiceDetails = (record) => {

        const tableField = record[INVOICE_DETAIL_TABLE_CODE];
        const rows = Array.isArray(tableField?.value) ? tableField.value : [];

        const details = [];

        rows.forEach((row) => {

            const detail = buildDetailRow(row, INVOICE_DETAIL_FIELDS);

            if (isEmptyInvoiceDetailRow(detail)) {
                return;
            }

            details.push(detail);

        });

        return details;

    };

    const buildInvoiceSummary = (record, details) => {

        const itemCount = toNumber(getFieldValue(record, 'item_count'));
        const qtyTotal = toNumber(getFieldValue(record, 'qty_total'));
        const subtotal = toNumber(getFieldValue(record, 'subtotal'));
        const tax = toNumber(getFieldValue(record, 'tax'));
        const total = toNumber(getFieldValue(record, 'total'));
        const carryOver = toNumber(getFieldValue(record, 'carry_over'));
        const paymentAmount = toNumber(getFieldValue(record, 'payment_amount'));
        const invoiceAmount = toNumber(getFieldValue(record, 'invoice_amount'));
        const resolvedSubtotal = subtotal || details.reduce((sum, detail) => sum + detail.amount, 0);
        const resolvedTotal = total || (resolvedSubtotal + tax);
        const currentBillingAmount = invoiceAmount || resolvedTotal;

        return {
            totalCount: itemCount || details.length,
            totalQty: qtyTotal || details.reduce((sum, detail) => sum + detail.qty, 0),
            subtotal: resolvedSubtotal,
            tax,
            total: resolvedTotal,
            carryOver,
            paymentAmount,
            invoiceAmount: currentBillingAmount,
            currentBillingAmount,
            monthlyBillingAmount: currentBillingAmount,
            totalAmount: resolvedSubtotal,
        };

    };

    const buildInvoiceReportData = (record) => {

        const details = buildInvoiceDetails(record);
        const header = buildInvoiceHeader(record, details);
        const summary = buildInvoiceSummary(record, details);

        return {
            header,
            details,
            summary,
        };

    };

    const buildDeliveryReportData = (record) => {

        const { details, summary } = buildDeliveryDetails(record);

        const header = buildDeliveryHeader(record);

        if (details.length > 0 && details[0].manage_no) {
            header.barcode_manage_no = details[0].manage_no;
        }

        return {
            header,
            details,
            summary,
        };

    };

    const wrapRecordError = (error, methodName) => {

        if (error instanceof Error && (
            error.message === 'レコードを取得できません。'
            || error.message.startsWith('数値に変換できません。')
            || error.message.includes('未実装')
        )) {
            throw error;
        }

        const message = error instanceof Error ? error.message : '不明なエラー';

        throw new Error(`${methodName}: データ取得に失敗しました。（${message}）`);

    };

    /**
     * 受注票データを取得する
     * @returns {Object} 帳票データ
     */
    Record.getOrderData = (record) => {

        try {

            return buildOrderReportData(getCurrentRecord(record));

        } catch (error) {

            wrapRecordError(error, 'Record.getOrderData');

        }

    };

    /**
     * 一般客帳票の宛名（明細 client_name）を判定する
     * @param {Array<Object>} details - 明細
     * @param {string} multipleMessage - 複数名時の警告文
     * @returns {{ ok: true, clientName: string } | { ok: false, message: string }}
     */
    const resolveGeneralClientRecipient = (details, multipleMessage) => {

        const names = new Set();

        (Array.isArray(details) ? details : []).forEach((detail) => {

            const name = String(detail?.client_name ?? '').trim();

            if (name !== '') {
                names.add(name);
            }

        });

        if (names.size === 0) {
            return {
                ok: false,
                message: 'お客様名が入力されていません。',
            };
        }

        if (names.size > 1) {
            return {
                ok: false,
                message: multipleMessage,
            };
        }

        return {
            ok: true,
            clientName: names.values().next().value,
        };

    };

    /**
     * 一般客納品書の宛名（delivery_detail.client_name）を判定する
     * @param {Array<Object>} details - 納品明細
     * @returns {{ ok: true, clientName: string } | { ok: false, message: string }}
     */
    Record.resolveGeneralDeliveryRecipient = (details) => (
        resolveGeneralClientRecipient(
            details,
            '複数のお客様名が含まれています。一般客納品書を確認してください。'
        )
    );

    /**
     * 一般客請求書の宛名（invoice_detail.client_name）を判定する
     * @param {Array<Object>} details - 請求明細
     * @returns {{ ok: true, clientName: string } | { ok: false, message: string }}
     */
    Record.resolveGeneralInvoiceRecipient = (details) => (
        resolveGeneralClientRecipient(
            details,
            '複数のお客様名が含まれています。一般客請求書を確認してください。'
        )
    );

    /**
     * 納品書データを取得する
     * @returns {Object} 帳票データ
     */
    Record.getDeliveryData = (record) => {

        try {

            const data = buildDeliveryReportData(getCurrentRecord(record));

            console.log(data.details);

            return data;

        } catch (error) {

            wrapRecordError(error, 'Record.getDeliveryData');

        }

    };

    /**
     * 請求書データを取得する
     * @returns {Object} 帳票データ
     */
    Record.getInvoiceData = (record) => {

        try {

            return buildInvoiceReportData(getCurrentRecord(record));

        } catch (error) {

            wrapRecordError(error, 'Record.getInvoiceData');

        }

    };

    Record.getInvoiceDataAsync = async (record) => {

        try {

            const sourceRecord = await resolveInvoiceRecordForPrint(record);
            const data = buildInvoiceReportData(sourceRecord);

            data.header = await enrichInvoiceHeaderWithCustomerMaster(data.header);

            return data;

        } catch (error) {

            wrapRecordError(error, 'Record.getInvoiceDataAsync');

        }

    };

    /**
     * 見積書データを取得する
     * @returns {Object} 帳票データ
     */
    Record.getEstimateData = () => {
        throw new Error('Record.getEstimateData: 見積書データ取得は未実装です。');
    };

    /**
     * インボイスデータを取得する
     * @returns {Object} 帳票データ
     */
    Record.getInvoiceExportData = () => {
        throw new Error('Record.getInvoiceExportData: インボイスデータ取得は未実装です。');
    };

    /**
     * 外注伝票データを取得する
     * @returns {Object} 帳票データ
     */
    Record.getPurchaseData = () => {
        throw new Error('Record.getPurchaseData: 外注伝票データ取得は未実装です。');
    };

    /**
     * ラベルデータを取得する
     * @returns {Object} 帳票データ
     */
    Record.getLabelData = () => {
        throw new Error('Record.getLabelData: ラベルデータ取得は未実装です。');
    };

    /**
     * 現在のアプリに応じた帳票データを取得する
     * @returns {Object} 帳票データ
     */
    Record.get = async (record) => {

        try {

            const appId = normalizeAppId(
                typeof kintone !== 'undefined' && typeof kintone.app?.getId === 'function'
                    ? kintone.app.getId()
                    : null
            );

            if (appId === DELIVERY_APP_ID) {
                return Record.getDeliveryData(record);
            }

            if (appId === INVOICE_APP_ID) {
                return Record.getInvoiceDataAsync(record);
            }

            return Record.getOrderData(record);

        } catch (error) {

            wrapRecordError(error, 'Record.get');

        }

    };

    window.Record = Record;

})();
