(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * matsuba_summary_invoice.js
     *
     * 株式会社松葉向け「合計請求書」のデータ取得・集計。
     * 個別請求書（App 35）の確定金額を参照する集計・印刷専用処理。
     *
     * 禁止: kintone レコードの作成・更新（POST / PUT / DELETE）、
     * 請求済ステータス変更、納品書更新、入金状態変更。
     */

    const MatsubaSummaryInvoice = {};

    const INVOICE_APP_ID = 35;
    const CUSTOMER_APP_ID = 8;

    const CUSTOMER_CODES = ['M070', 'M074', 'M078', 'M079'];
    const ADDRESSEE = '株式会社松葉　御中';
    const CANCELLED_STATUS = '取消';
    const TAX_RATE = 0.10;

    const FIELDS = {
        customerCode: 'customer_code',
        customerName: 'customer_name',
        billingFrom: 'billing_from',
        billingTo: 'billing_to',
        subtotal: 'subtotal',
        tax: 'tax',
        total: 'total',
        invoiceStatus: 'invoice_status',
        invoiceNo: 'invoice_no',
    };

    const INVOICE_FETCH_FIELDS = [
        FIELDS.customerCode,
        FIELDS.customerName,
        FIELDS.billingFrom,
        FIELDS.billingTo,
        FIELDS.subtotal,
        FIELDS.tax,
        FIELDS.total,
        FIELDS.invoiceStatus,
        FIELDS.invoiceNo,
    ];

    const RECORDS_LIMIT = 500;
    const MAX_OFFSET = 10000;

    const escapeQueryValue = (value) => String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

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

        if (Number.isNaN(number)) {
            return 0;
        }

        return number;

    };

    const normalizeDateValue = (value) => {

        const text = String(value ?? '').trim();

        if (!text) {
            return '';
        }

        if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
            return text.slice(0, 10);
        }

        if (/^\d{4}\/\d{2}\/\d{2}/.test(text)) {
            return text.slice(0, 10).replace(/\//g, '-');
        }

        return text;

    };

    const isCancelledInvoice = (record) => (
        String(getFieldValue(record, FIELDS.invoiceStatus) ?? '').trim() === CANCELLED_STATUS
    );

    const kintoneApi = (path, method, body) => new Promise((resolve, reject) => {
        kintone.api(path, method, body, resolve, reject);
    });

    const fetchRecordsPage = async (appId, query, fields, offset = 0) => kintoneApi(
        kintone.api.url('/k/v1/records', true),
        'GET',
        {
            app: appId,
            query: `${query} limit ${RECORDS_LIMIT} offset ${offset}`,
            fields,
        }
    );

    const fetchAllRecords = async (appId, query, fields) => {

        const allRecords = [];
        let offset = 0;

        while (offset <= MAX_OFFSET) {

            const response = await fetchRecordsPage(appId, query, fields, offset);
            const records = Array.isArray(response.records) ? response.records : [];

            allRecords.push(...records);

            if (records.length < RECORDS_LIMIT) {
                break;
            }

            offset += RECORDS_LIMIT;

        }

        return allRecords;

    };

    const buildCustomerInQuery = () => CUSTOMER_CODES
        .map((code) => `"${escapeQueryValue(code)}"`)
        .join(', ');

    const fetchInvoicesForPeriod = async (billingFrom, billingTo) => {

        const from = escapeQueryValue(billingFrom);
        const to = escapeQueryValue(billingTo);
        const codes = buildCustomerInQuery();

        const withStatus = `${FIELDS.customerCode} in (${codes})`
            + ` and ${FIELDS.billingFrom} = "${from}"`
            + ` and ${FIELDS.billingTo} = "${to}"`
            + ` and ${FIELDS.invoiceStatus} not in ("${escapeQueryValue(CANCELLED_STATUS)}")`
            + ` order by ${FIELDS.customerCode} asc, $id asc`;

        try {
            return await fetchAllRecords(INVOICE_APP_ID, withStatus, INVOICE_FETCH_FIELDS);
        } catch (error) {

            console.warn('[AYANAS Print V3] 松葉合計請求書: invoice_status 条件付き取得に失敗。再取得します。', error);

            const withoutStatus = `${FIELDS.customerCode} in (${codes})`
                + ` and ${FIELDS.billingFrom} = "${from}"`
                + ` and ${FIELDS.billingTo} = "${to}"`
                + ` order by ${FIELDS.customerCode} asc, $id asc`;

            const records = await fetchAllRecords(INVOICE_APP_ID, withoutStatus, INVOICE_FETCH_FIELDS);

            return records.filter((record) => !isCancelledInvoice(record));

        }

    };

    const fetchCustomerNamesFromMaster = async () => {

        const names = new Map();
        const codes = buildCustomerInQuery();
        const query = `${FIELDS.customerCode} in (${codes})`;

        try {

            const records = await fetchAllRecords(
                CUSTOMER_APP_ID,
                query,
                [FIELDS.customerCode, FIELDS.customerName]
            );

            records.forEach((record) => {

                const code = String(getFieldValue(record, FIELDS.customerCode) ?? '').trim();
                const name = String(getFieldValue(record, FIELDS.customerName) ?? '').trim();

                if (code && name && !names.has(code)) {
                    names.set(code, name);
                }

            });

        } catch (error) {

            console.warn('[AYANAS Print V3] 松葉合計請求書: 顧客マスタからの顧客名取得に失敗しました。', error);

        }

        return names;

    };

    /**
     * 個別請求書に保存済みの確定金額を優先して合算する。
     * 総合計の消費税を小計総額から再計算しない（1円差異防止）。
     */
    const resolveInvoiceAmounts = (record) => {

        const storedSubtotal = getFieldValue(record, FIELDS.subtotal);
        const storedTax = getFieldValue(record, FIELDS.tax);
        const storedTotal = getFieldValue(record, FIELDS.total);

        const hasSubtotal = storedSubtotal !== '' && storedSubtotal !== null && storedSubtotal !== undefined;
        const hasTax = storedTax !== '' && storedTax !== null && storedTax !== undefined;
        const hasTotal = storedTotal !== '' && storedTotal !== null && storedTotal !== undefined;

        const subtotal = hasSubtotal ? toNumber(storedSubtotal) : 0;
        const tax = hasTax
            ? toNumber(storedTax)
            : (hasSubtotal ? Math.round(subtotal * TAX_RATE) : 0);
        const total = hasTotal
            ? toNumber(storedTotal)
            : (subtotal + tax);

        return { subtotal, tax, total };

    };

    const aggregateByCustomer = (invoiceRecords, masterNames) => {

        const rowsByCode = new Map();

        CUSTOMER_CODES.forEach((code) => {
            rowsByCode.set(code, {
                customer_code: code,
                customer_name: masterNames.get(code) || '',
                subtotal: 0,
                tax: 0,
                total: 0,
            });
        });

        invoiceRecords.forEach((record) => {

            const code = String(getFieldValue(record, FIELDS.customerCode) ?? '').trim();

            if (!rowsByCode.has(code)) {
                return;
            }

            const row = rowsByCode.get(code);
            const amounts = resolveInvoiceAmounts(record);
            const invoiceName = String(getFieldValue(record, FIELDS.customerName) ?? '').trim();

            if (invoiceName) {
                row.customer_name = invoiceName;
            }

            row.subtotal += amounts.subtotal;
            row.tax += amounts.tax;
            row.total += amounts.total;

        });

        return CUSTOMER_CODES.map((code) => rowsByCode.get(code));

    };

    const buildSummary = (rows) => {

        const subtotal = rows.reduce((sum, row) => sum + toNumber(row.subtotal), 0);
        const tax = rows.reduce((sum, row) => sum + toNumber(row.tax), 0);
        const total = rows.reduce((sum, row) => sum + toNumber(row.total), 0);

        return {
            subtotal,
            tax,
            total,
        };

    };

    MatsubaSummaryInvoice.CUSTOMER_CODES = CUSTOMER_CODES;
    MatsubaSummaryInvoice.ADDRESSEE = ADDRESSEE;
    MatsubaSummaryInvoice.APP_ID = INVOICE_APP_ID;
    MatsubaSummaryInvoice.REPORT_TYPE = 'matsuba_summary_invoice';

    MatsubaSummaryInvoice.validatePeriod = (billingFrom, billingTo) => {

        const from = normalizeDateValue(billingFrom);
        const to = normalizeDateValue(billingTo);

        if (!from) {
            throw new Error('請求対象期間（開始日）を入力してください。');
        }

        if (!to) {
            throw new Error('請求対象期間（終了日）を入力してください。');
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
            throw new Error('請求対象期間を YYYY-MM-DD 形式で入力してください。');
        }

        if (from > to) {
            throw new Error('請求対象期間が不正です。開始日は終了日以前にしてください。');
        }

        return { billingFrom: from, billingTo: to };

    };

    MatsubaSummaryInvoice.fetchReportData = async ({ billingFrom, billingTo } = {}) => {

        const period = MatsubaSummaryInvoice.validatePeriod(billingFrom, billingTo);
        const [invoiceRecords, masterNames] = await Promise.all([
            fetchInvoicesForPeriod(period.billingFrom, period.billingTo),
            fetchCustomerNamesFromMaster(),
        ]);

        const details = aggregateByCustomer(invoiceRecords, masterNames);
        const summary = buildSummary(details);

        return {
            header: {
                addressee: ADDRESSEE,
                billing_from: period.billingFrom,
                billing_to: period.billingTo,
                document_title: '合計請求書',
            },
            details,
            summary,
        };

    };

    window.MatsubaSummaryInvoice = MatsubaSummaryInvoice;

})();
