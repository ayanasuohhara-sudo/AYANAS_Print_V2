(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * bulk_invoice_create.js
     *
     * 請求書一括作成 Version 1.0
     * 締日ごとに未請求納品書を customer_code 単位で請求書へ一括作成する。
     * V1.0: 納品管理アプリへの請求済更新は行わない。
     */

    const BulkInvoiceCreate = {};

    const INVOICE_APP_ID = 35;
    const AD_HOC_LABEL = '都度払い';

    const kintoneApi = (path, method, body) => new Promise((resolve, reject) => {
        kintone.api(path, method, body, resolve, reject);
    });

    const getFieldValue = (fields, fieldCode) => {

        const field = fields?.[fieldCode];

        if (!field || field.value === null || field.value === undefined) {
            return '';
        }

        return field.value;

    };

    const buildCustomerMap = (customerRecords) => {

        const map = new Map();
        const customerFields = {
            customerCode: 'customer_code',
            customerName: 'customer_name',
            paymentTerms: 'payment_terms',
        };

        customerRecords.forEach((record) => {

            const code = String(getFieldValue(record, customerFields.customerCode) ?? '').trim();

            if (!code) {
                return;
            }

            map.set(code, {
                customer_code: code,
                customer_name: String(getFieldValue(record, customerFields.customerName) ?? '').trim(),
                payment_terms: String(getFieldValue(record, customerFields.paymentTerms) ?? '').trim(),
            });

        });

        return map;

    };

    const createInvoiceRecord = async (recordPayload) => {

        const response = await kintoneApi(
            kintone.api.url('/k/v1/record', true),
            'POST',
            {
                app: INVOICE_APP_ID,
                record: recordPayload,
            }
        );

        return response.id;

    };

    /**
     * 請求書一括作成を実行する
     * @param {{ closingYm: string, closingDate: string }} params
     */
    BulkInvoiceCreate.run = async ({ closingYm, closingDate }) => {

        const period = InvoiceCreate.resolveClosingPeriod(closingYm, closingDate);
        let historyId = null;
        let batchNo = '';

        const startHistory = async () => {

            if (typeof BatchHistory === 'undefined') {
                return;
            }

            const started = await BatchHistory.start({
                closingDay: period.executionLabel,
                billingFrom: period.periodStart || '',
                billingTo: period.periodEnd || '',
                executedBy: BatchHistory.getExecutorName(),
            });

            historyId = started.recordId;
            batchNo = started.batchNo;

        };

        const finishHistory = async ({
            invoiceCount,
            deliveryCount,
            totalAmount,
            status,
        }) => {

            if (!historyId || typeof BatchHistory === 'undefined') {
                return;
            }

            await BatchHistory.complete(historyId, {
                invoiceCount,
                deliveryCount,
                totalAmount,
                status,
            });

        };

        try {

            await startHistory();

            if (period.adHoc) {
                throw new Error('都度払いは一括作成の対象外です。請求書画面から個別に作成してください。');
            }

            const targetClosingDays = InvoiceCreate.getExecutionTargetClosingDays(closingDate);
            const [deliveries, customers] = await Promise.all([
                InvoiceCreate.fetchAllUninvoicedDeliveriesInPeriod({
                    billingFrom: period.periodStart,
                    billingTo: period.periodEnd,
                }),
                InvoiceCreate.fetchCustomersByClosingDays(targetClosingDays),
            ]);

            const customerMap = buildCustomerMap(customers);
            const eligibleDeliveries = deliveries.filter((record) => {

                const code = String(getFieldValue(record, 'customer_code') ?? '').trim();

                return code !== '' && customerMap.has(code);

            });

            const groups = InvoiceCreate.groupDeliveriesByCustomerCode(eligibleDeliveries);

            if (groups.size === 0) {
                throw new Error(InvoiceCreate.NO_DATA_MESSAGE);
            }

            const invoiceDate = InvoiceCreate.formatToday();
            const created = [];
            const errors = [];

            for (const [customerCode, customerDeliveries] of groups) {

                const customer = customerMap.get(customerCode);
                const customerName = customer?.customer_name
                    || String(getFieldValue(customerDeliveries[0], 'customer_name') ?? '').trim();

                try {

                    const { details } = InvoiceCreate.buildInvoiceDetails(customerDeliveries);
                    const summary = InvoiceCreate.calculateSummary(details);

                    if (details.length === 0) {
                        errors.push({
                            customerCode,
                            customerName,
                            message: '請求対象の明細がありません。',
                        });
                        continue;
                    }

                    const invoiceNo = await InvoiceCreate.generateUniqueInvoiceNo(invoiceDate);
                    const dueDate = InvoiceCreate.calculateDueDate(
                        invoiceDate,
                        customer?.payment_terms ?? ''
                    );
                    const recordPayload = InvoiceCreate.buildMonthlyInvoiceRecord({
                        customerCode,
                        customerName,
                        closingYm: period.closingYm,
                        closingDate: period.executionLabel,
                        billingFrom: period.periodStart,
                        billingTo: period.periodEnd,
                        details,
                        summary,
                        invoiceDate,
                        invoiceNo,
                        dueDate,
                    });

                    const recordId = await createInvoiceRecord(recordPayload);

                    created.push({
                        recordId,
                        customerCode,
                        customerName,
                        invoiceNo,
                        deliveryCount: customerDeliveries.length,
                        itemCount: summary.item_count,
                        subtotal: summary.subtotal,
                        tax: summary.tax,
                        total: summary.total,
                    });

                } catch (error) {

                    errors.push({
                        customerCode,
                        customerName,
                        message: error?.message || String(error),
                    });

                }

            }

            const totalAmount = created.reduce((sum, item) => sum + item.total, 0);
            const status = typeof BatchHistory !== 'undefined'
                ? BatchHistory.determineStatus(created.length, errors.length)
                : (errors.length === 0 ? '成功' : '一部失敗');

            await finishHistory({
                invoiceCount: created.length,
                deliveryCount: eligibleDeliveries.length,
                totalAmount,
                status,
            });

            if (created.length === 0 && errors.length > 0) {
                throw new Error(errors.map((item) => (
                    `${item.customerCode} ${item.customerName}: ${item.message}`
                )).join('\n'));
            }

            return {
                period,
                batchNo,
                historyId,
                createdCount: created.length,
                deliveryCount: eligibleDeliveries.length,
                totalAmount,
                customerCount: groups.size,
                created,
                errors,
                status,
            };

        } catch (error) {

            if (historyId && typeof BatchHistory !== 'undefined') {
                try {
                    await BatchHistory.fail(historyId);
                } catch (historyError) {
                    console.error('[AYANAS Bulk Invoice Create] 履歴更新失敗', historyError);
                }
            }

            throw error;

        }

    };

    BulkInvoiceCreate.getClosingLabels = () => (
        InvoiceCreate.CLOSING_EXECUTION_LABELS.filter((label) => label !== AD_HOC_LABEL)
    );

    BulkInvoiceCreate.AD_HOC_LABEL = AD_HOC_LABEL;

    window.BulkInvoiceCreate = BulkInvoiceCreate;

    /** @deprecated BulkInvoiceCreate を使用 */
    window.MonthlyBilling = BulkInvoiceCreate;

})();
