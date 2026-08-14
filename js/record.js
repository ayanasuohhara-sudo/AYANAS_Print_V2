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

    const getCurrentRecord = () => {

        const current = kintone.app.record.get();

        if (!current || !current.record) {
            throw new Error('レコードを取得できません。');
        }

        return current.record;

    };

    const buildOrderHeader = (record) => {

        const header = {};

        ORDER_HEADER_FIELDS.forEach((fieldCode) => {
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

        return {
            totalCount: itemCount || details.length,
            totalQty: qtyTotal || details.reduce((sum, detail) => sum + detail.qty, 0),
            subtotal: subtotal || details.reduce((sum, detail) => sum + detail.amount, 0),
            tax,
            total,
            totalAmount: subtotal || details.reduce((sum, detail) => sum + detail.amount, 0),
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
    Record.getOrderData = () => {

        try {

            return buildOrderReportData(getCurrentRecord());

        } catch (error) {

            wrapRecordError(error, 'Record.getOrderData');

        }

    };

    /**
     * 納品書データを取得する
     * @returns {Object} 帳票データ
     */
    Record.getDeliveryData = () => {

        try {

            const data = buildDeliveryReportData(getCurrentRecord());

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
    Record.getInvoiceData = () => {

        try {

            return buildInvoiceReportData(getCurrentRecord());

        } catch (error) {

            wrapRecordError(error, 'Record.getInvoiceData');

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
    Record.get = () => {

        try {

            const appId = typeof kintone !== 'undefined' && typeof kintone.app?.getId === 'function'
                ? kintone.app.getId()
                : null;

            if (appId === DELIVERY_APP_ID) {
                return Record.getDeliveryData();
            }

            if (appId === INVOICE_APP_ID) {
                return Record.getInvoiceData();
            }

            return Record.getOrderData();

        } catch (error) {

            wrapRecordError(error, 'Record.get');

        }

    };

    window.Record = Record;

})();
