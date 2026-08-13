(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * receivable_create.js
     *
     * 売掛一覧: 請求書（App 35）・入金管理（App 36）からデータを取得し表示用に整形する。
     * V1.0: 読み取り専用。売掛一覧アプリからの更新は行わない。
     */

    const ReceivableCreate = {};

    const RECEIVABLE_APP_ID = 37;
    const INVOICE_APP_ID = 35;
    const PAYMENT_APP_ID = 36;

    /** キー項目・表示項目（売掛一覧アプリ Form 定義） */
    const RECEIVABLE_FIELDS = {
        customerCode: 'customer_code',
        customerName: 'customer_name',
        invoiceNo: 'invoice_no',
        invoiceDate: 'invoice_date',
        dueDate: 'due_date',
        invoiceAmount: 'invoice_amount',
        paymentTotal: 'payment_total',
        accountsReceivable: 'accounts_receivable',
        collectionStatus: 'collection_status',
        lastPaymentDate: 'last_payment_date',
        elapsedDays: 'elapsed_days',
        inCharge: 'in_charge',
    };

    const SORT_ORDERS = {
        customer: (rows) => [...rows].sort((a, b) => {
            const codeCompare = a.customer_code.localeCompare(b.customer_code, 'ja');

            if (codeCompare !== 0) {
                return codeCompare;
            }

            return b.invoice_date.localeCompare(a.invoice_date);
        }),
        invoiceDate: (rows) => [...rows].sort((a, b) => {
            const dateCompare = b.invoice_date.localeCompare(a.invoice_date);

            if (dateCompare !== 0) {
                return dateCompare;
            }

            return a.invoice_no.localeCompare(b.invoice_no, 'ja');
        }),
        accountsReceivable: (rows) => [...rows].sort((a, b) => {
            if (b.accounts_receivable !== a.accounts_receivable) {
                return b.accounts_receivable - a.accounts_receivable;
            }

            return b.invoice_date.localeCompare(a.invoice_date);
        }),
        dueDate: (rows) => [...rows].sort((a, b) => {
            const dueCompare = a.due_date.localeCompare(b.due_date);

            if (dueCompare !== 0) {
                return dueCompare;
            }

            return a.invoice_no.localeCompare(b.invoice_no, 'ja');
        }),
    };

    const kintoneApi = (path, method, body) => new Promise((resolve, reject) => {
        kintone.api(path, method, body, resolve, reject);
    });

    const getFieldValue = (record, fieldCode) => {

        const field = record?.[fieldCode];

        if (!field || field.value === null || field.value === undefined) {
            return '';
        }

        return field.value;

    };

    const toNumber = (value) => {

        if (value === null || value === '' || value === undefined) {
            return 0;
        }

        const number = Number(value);

        return Number.isNaN(number) ? 0 : number;

    };

    const getInvoiceFields = () => InvoiceCreate.INVOICE_FIELDS;

    const getPaymentFields = () => PaymentCreate.PAYMENT_FIELDS;

    const formatYearMonth = (date) => {

        const normalized = String(date ?? '').trim();
        const match = normalized.match(/^(\d{4})-(\d{2})/);

        if (match) {
            return `${match[1]}-${match[2]}`;
        }

        const now = new Date();

        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    };

    const getCurrentYearMonth = () => formatYearMonth(new Date().toISOString());

    const isOverdue = (row) => {

        if (row.collection_status === InvoiceCreate.COLLECTION_STATUS_COLLECTED) {
            return false;
        }

        return toNumber(row.elapsed_days) > 0;

    };

    ReceivableCreate.buildReceivableRow = (invoiceRecord) => {

        const invoiceFields = getInvoiceFields();
        const receivable = InvoiceCreate.computeReceivableDisplay(invoiceRecord);
        const invoiceAmount = InvoiceCreate.getTaxInclusiveInvoiceAmount(invoiceRecord);
        const paymentTotal = toNumber(getFieldValue(invoiceRecord, invoiceFields.paymentAmount));
        const dueDate = String(getFieldValue(invoiceRecord, invoiceFields.dueDate) ?? '').trim();
        const elapsedDays = dueDate
            ? InvoiceCreate.calculateOverdueDays(dueDate)
            : toNumber(receivable.overdue_days);

        return {
            customer_code: String(getFieldValue(invoiceRecord, invoiceFields.customerCode) ?? '').trim(),
            customer_name: String(getFieldValue(invoiceRecord, invoiceFields.customerName) ?? '').trim(),
            invoice_no: String(getFieldValue(invoiceRecord, invoiceFields.invoiceNo) ?? '').trim(),
            invoice_date: String(getFieldValue(invoiceRecord, invoiceFields.invoiceDate) ?? '').trim(),
            due_date: dueDate,
            invoice_amount: invoiceAmount,
            payment_total: paymentTotal,
            accounts_receivable: receivable.accounts_receivable,
            collection_status: receivable.collection_status,
            last_payment_date: String(receivable.last_payment_date ?? '').trim(),
            elapsed_days: elapsedDays,
            in_charge: String(getFieldValue(invoiceRecord, invoiceFields.inCharge) ?? '').trim(),
            invoice_record_id: Number(invoiceRecord.$id?.value),
        };

    };

    ReceivableCreate.fetchInvoiceRecords = async () => {

        const invoiceFields = getInvoiceFields();
        const fields = [
            invoiceFields.invoiceNo,
            invoiceFields.invoiceDate,
            invoiceFields.dueDate,
            invoiceFields.customerCode,
            invoiceFields.customerName,
            invoiceFields.inCharge,
            invoiceFields.invoiceAmount,
            invoiceFields.total,
            invoiceFields.paymentAmount,
            invoiceFields.accountsReceivable,
            invoiceFields.overdueDays,
            invoiceFields.collectionStatus,
            invoiceFields.lastPaymentDate,
        ];

        const query = [
            `${invoiceFields.invoiceNo} != ""`,
            `order by ${invoiceFields.invoiceDate} desc, ${invoiceFields.invoiceNo} asc`,
        ].join(' ');

        const records = [];
        const limit = 500;
        let offset = 0;

        while (true) {

            const response = await kintoneApi(
                kintone.api.url('/k/v1/records', true),
                'GET',
                {
                    app: INVOICE_APP_ID,
                    query: `${query} limit ${limit} offset ${offset}`,
                    fields,
                }
            );

            records.push(...response.records);

            if (response.records.length < limit) {
                break;
            }

            offset += limit;

        }

        return records;

    };

    ReceivableCreate.fetchMonthlyCollectionTotal = async (yearMonth = getCurrentYearMonth()) => {

        const paymentFields = getPaymentFields();
        const startDate = `${yearMonth}-01`;
        const [year, month] = yearMonth.split('-').map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;

        const query = [
            `${paymentFields.paymentDate} >= "${startDate}"`,
            `${paymentFields.paymentDate} <= "${endDate}"`,
        ].join(' and ');

        const records = [];
        const limit = 500;
        let offset = 0;

        while (true) {

            const response = await kintoneApi(
                kintone.api.url('/k/v1/records', true),
                'GET',
                {
                    app: PAYMENT_APP_ID,
                    query: `${query} limit ${limit} offset ${offset}`,
                    fields: [paymentFields.paymentAmount],
                }
            );

            records.push(...response.records);

            if (response.records.length < limit) {
                break;
            }

            offset += limit;

        }

        return records.reduce(
            (sum, record) => sum + toNumber(getFieldValue(record, paymentFields.paymentAmount)),
            0
        );

    };

    ReceivableCreate.fetchReceivableRows = async () => {

        const invoiceRecords = await ReceivableCreate.fetchInvoiceRecords();

        return invoiceRecords
            .map((record) => ReceivableCreate.buildReceivableRow(record))
            .filter((row) => row.invoice_no !== '');

    };

    ReceivableCreate.sortReceivableRows = (rows, sortId = 'invoiceDate') => {

        const sorter = SORT_ORDERS[sortId] || SORT_ORDERS.invoiceDate;

        return sorter(rows);

    };

    ReceivableCreate.calculateSummary = (rows, monthlyCollection = 0) => {

        let receivableTotal = 0;
        let uncollectedCount = 0;
        let overdueCount = 0;

        rows.forEach((row) => {

            receivableTotal += toNumber(row.accounts_receivable);

            if (row.collection_status === InvoiceCreate.COLLECTION_STATUS_UNCOLLECTED) {
                uncollectedCount += 1;
            }

            if (isOverdue(row)) {
                overdueCount += 1;
            }

        });

        return {
            receivableTotal,
            uncollectedCount,
            overdueCount,
            monthlyCollection,
        };

    };

    ReceivableCreate.isOverdue = isOverdue;

    ReceivableCreate.getReceivableAppId = () => RECEIVABLE_APP_ID;

    ReceivableCreate.RECEIVABLE_FIELDS = RECEIVABLE_FIELDS;

    ReceivableCreate.SORT_ORDERS = Object.keys(SORT_ORDERS);

    window.ReceivableCreate = ReceivableCreate;

})();
