(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * payment_create.js
     *
     * 入金管理 App: 請求書作成アプリ（App 35）と連携し入金を管理する。
     */

    const PaymentCreate = {};

    const PAYMENT_APP_ID = 36;
    const INVOICE_APP_ID = 35;

    const PAYMENT_FIELDS = {
        paymentNo: 'payment_no',
        paymentDate: 'payment_date',
        invoiceNo: 'invoice_no',
        customerCode: 'customer_code',
        customerName: 'customer_name',
        paymentMethod: 'payment_method',
        bankName: 'bank_name',
        paymentAmount: 'payment_amount',
        fee: 'fee',
        receivedAmount: 'received_amount',
        remarks: 'remarks',
        detailTable: 'payment_detail',
    };

    const PAYMENT_DETAIL_FIELDS = {
        invoiceNo: 'invoice_no',
        invoiceDate: 'invoice_date',
        invoiceAmount: 'invoice_amount',
        currentPayment: 'current_payment',
        accountsReceivable: 'accounts_receivable',
    };

    const kintoneApi = (path, method, body) => new Promise((resolve, reject) => {
        kintone.api(path, method, body, resolve, reject);
    });

    const escapeQueryValue = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const getFieldValue = (fields, fieldCode) => {

        const field = fields?.[fieldCode];

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

    PaymentCreate.calculateReceivedAmount = (paymentAmount, fee) => (
        toNumber(paymentAmount) - toNumber(fee)
    );

    PaymentCreate.calculateDetailReceivable = (invoiceAmount, previouslyPaid, currentPayment) => (
        toNumber(invoiceAmount) - toNumber(previouslyPaid) - toNumber(currentPayment)
    );

    PaymentCreate.toPaymentDetailFieldValue = (detail) => ({
        value: [{
            value: {
                [PAYMENT_DETAIL_FIELDS.invoiceNo]: { value: detail.invoice_no },
                [PAYMENT_DETAIL_FIELDS.invoiceDate]: { value: detail.invoice_date },
                [PAYMENT_DETAIL_FIELDS.invoiceAmount]: { value: detail.invoice_amount },
                [PAYMENT_DETAIL_FIELDS.currentPayment]: { value: detail.current_payment },
                [PAYMENT_DETAIL_FIELDS.accountsReceivable]: { value: detail.accounts_receivable },
            },
        }],
    });

    PaymentCreate.buildPaymentDetail = (invoiceRecord, currentPayment = 0) => {

        const invoiceFields = getInvoiceFields();
        const invoiceNo = getFieldValue(invoiceRecord, invoiceFields.invoiceNo);
        const invoiceDate = getFieldValue(invoiceRecord, invoiceFields.invoiceDate);
        const invoiceAmount = InvoiceCreate.getTaxInclusiveInvoiceAmount(invoiceRecord);
        const previouslyPaid = toNumber(getFieldValue(invoiceRecord, invoiceFields.paymentAmount));
        const current = toNumber(currentPayment);
        const accountsReceivable = PaymentCreate.calculateDetailReceivable(
            invoiceAmount,
            previouslyPaid,
            current
        );

        return {
            invoice_no: invoiceNo,
            invoice_date: invoiceDate,
            invoice_amount: invoiceAmount,
            current_payment: current,
            accounts_receivable: accountsReceivable,
        };

    };

    PaymentCreate.loadInvoiceForPayment = async (invoiceNo, currentPayment = 0) => {

        const invoiceRecord = await InvoiceCreate.fetchInvoiceByNo(invoiceNo);
        const invoiceFields = getInvoiceFields();
        const detail = PaymentCreate.buildPaymentDetail(invoiceRecord, currentPayment);

        return {
            header: {
                invoice_no: detail.invoice_no,
                customer_code: getFieldValue(invoiceRecord, invoiceFields.customerCode),
                customer_name: getFieldValue(invoiceRecord, invoiceFields.customerName),
            },
            detail,
            invoiceRecord,
        };

    };

    PaymentCreate.fetchPaymentsByInvoiceNo = async (invoiceNo) => {

        const normalized = String(invoiceNo ?? '').trim();

        if (!normalized) {
            return [];
        }

        const query = [
            `${PAYMENT_FIELDS.invoiceNo} = "${escapeQueryValue(normalized)}"`,
            `order by ${PAYMENT_FIELDS.paymentDate} asc, ${PAYMENT_FIELDS.paymentNo} asc`,
        ].join(' ');

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
                    fields: [
                        PAYMENT_FIELDS.paymentDate,
                        PAYMENT_FIELDS.paymentAmount,
                    ],
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

    PaymentCreate.summarizePayments = (paymentRecords) => {

        let totalPaid = 0;
        let lastPaymentDate = '';

        paymentRecords.forEach((record) => {

            totalPaid += toNumber(getFieldValue(record, PAYMENT_FIELDS.paymentAmount));

            const paymentDate = String(getFieldValue(record, PAYMENT_FIELDS.paymentDate) ?? '').trim();

            if (paymentDate && paymentDate >= lastPaymentDate) {
                lastPaymentDate = paymentDate;
            }

        });

        return {
            totalPaid,
            lastPaymentDate,
        };

    };

    PaymentCreate.buildInvoicePaymentUpdate = (invoiceRecord, paymentSummary) => {

        const invoiceFields = getInvoiceFields();
        const invoiceAmount = InvoiceCreate.getTaxInclusiveInvoiceAmount(invoiceRecord);
        const totalPaid = toNumber(paymentSummary.totalPaid);
        const accountsReceivable = InvoiceCreate.calculateAccountsReceivable(invoiceAmount, totalPaid);
        const paymentStatus = InvoiceCreate.derivePaymentStatus(totalPaid, invoiceAmount);
        const collectionStatus = InvoiceCreate.deriveCollectionStatus(accountsReceivable, totalPaid);
        const dueDate = getFieldValue(invoiceRecord, invoiceFields.dueDate);

        return {
            [invoiceFields.paymentAmount]: { value: totalPaid },
            [invoiceFields.paymentBalance]: { value: accountsReceivable },
            [invoiceFields.accountsReceivable]: { value: accountsReceivable },
            [invoiceFields.paymentStatus]: { value: paymentStatus },
            [invoiceFields.collectionStatus]: { value: collectionStatus },
            [invoiceFields.lastPaymentDate]: { value: paymentSummary.lastPaymentDate || null },
            [invoiceFields.paymentDate]: { value: paymentSummary.lastPaymentDate || null },
            [invoiceFields.overdueDays]: {
                value: InvoiceCreate.calculateOverdueDays(dueDate, formatToday()),
            },
        };

    };

    const formatToday = () => {

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;

    };

    PaymentCreate.syncInvoicePayment = async (invoiceNo) => {

        const normalized = String(invoiceNo ?? '').trim();

        if (!normalized) {
            throw new Error('請求番号（invoice_no）がありません。');
        }

        const invoiceRecord = await InvoiceCreate.fetchInvoiceByNo(normalized);
        const invoiceId = Number(invoiceRecord.$id?.value);

        if (Number.isNaN(invoiceId) || invoiceId <= 0) {
            throw new Error('請求書レコード ID を取得できません。');
        }

        const paymentRecords = await PaymentCreate.fetchPaymentsByInvoiceNo(normalized);
        const paymentSummary = PaymentCreate.summarizePayments(paymentRecords);
        const updateRecord = PaymentCreate.buildInvoicePaymentUpdate(invoiceRecord, paymentSummary);

        await kintoneApi(
            kintone.api.url('/k/v1/record', true),
            'PUT',
            {
                app: INVOICE_APP_ID,
                id: invoiceId,
                record: updateRecord,
            }
        );

        return {
            invoiceNo: normalized,
            totalPaid: paymentSummary.totalPaid,
            accountsReceivable: toNumber(updateRecord[getInvoiceFields().accountsReceivable].value),
            paymentStatus: updateRecord[getInvoiceFields().paymentStatus].value,
        };

    };

    PaymentCreate.getPaymentAppId = () => PAYMENT_APP_ID;

    PaymentCreate.PAYMENT_FIELDS = PAYMENT_FIELDS;

    PaymentCreate.PAYMENT_DETAIL_FIELDS = PAYMENT_DETAIL_FIELDS;

    window.PaymentCreate = PaymentCreate;

})();
