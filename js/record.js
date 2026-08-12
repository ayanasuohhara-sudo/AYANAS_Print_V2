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

    const HEADER_FIELDS = [
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

    const DETAIL_FIELDS = {
        string: ['item_code', 'item_name'],
        number: ['unit_price', 'qty', 'amount'],
    };

    const DETAIL_TABLE_CODE = 'detail_table';

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

    const buildHeader = (record) => {

        const header = {};

        HEADER_FIELDS.forEach((fieldCode) => {
            header[fieldCode] = getFieldValue(record, fieldCode);
        });

        return header;

    };

    const buildDetailRow = (row) => {

        const rowFields = row?.value ?? {};
        const detail = {};

        DETAIL_FIELDS.string.forEach((fieldCode) => {
            detail[fieldCode] = getFieldValue(rowFields, fieldCode);
        });

        DETAIL_FIELDS.number.forEach((fieldCode) => {
            detail[fieldCode] = toNumber(getFieldValue(rowFields, fieldCode));
        });

        return detail;

    };

    const buildDetails = (record) => {

        const tableField = record[DETAIL_TABLE_CODE];
        const rows = Array.isArray(tableField?.value) ? tableField.value : [];

        const details = [];
        let totalQty = 0;
        let totalAmount = 0;

        rows.forEach((row, index) => {

            const detail = buildDetailRow(row);

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

    const buildStandardReportData = (record) => {

        const { details, summary } = buildDetails(record);

        return {
            header: buildHeader(record),
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

            return buildStandardReportData(getCurrentRecord());

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

            return buildStandardReportData(getCurrentRecord());

        } catch (error) {

            wrapRecordError(error, 'Record.getDeliveryData');

        }

    };

    /**
     * 請求書データを取得する
     * @returns {Object} 帳票データ
     */
    Record.getInvoiceData = () => {
        throw new Error('Record.getInvoiceData: 請求書データ取得は未実装です。');
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

            return Record.getOrderData();

        } catch (error) {

            wrapRecordError(error, 'Record.get');

        }

    };

    window.Record = Record;

})();
