(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * monthly_billing.js
     *
     * 月次請求処理 Version 1.0
     * 締日ごとに未請求納品書を customer_code 単位で請求書へ一括作成する。
     * V1.0: 納品管理アプリへの請求済更新は行わない。
     */

    const MonthlyBilling = {};

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
        };

        customerRecords.forEach((record) => {

            const code = String(getFieldValue(record, customerFields.customerCode) ?? '').trim();

            if (!code) {
                return;
            }

            map.set(code, {
                customer_code: code,
                customer_name: String(getFieldValue(record, customerFields.customerName) ?? '').trim(),
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
     * 月次請求処理を実行する
     * @param {{ closingYm: string, closingDate: string }} params
     */
    MonthlyBilling.run = async ({ closingYm, closingDate }) => {

        const period = InvoiceCreate.resolveClosingPeriod(closingYm, closingDate);

        if (period.adHoc) {
            throw new Error('都度払いは月次請求処理の対象外です。請求書画面から個別に作成してください。');
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
        const skippedCustomerCount = deliveries.length - eligibleDeliveries.length;

        if (groups.size === 0) {
            throw new Error(InvoiceCreate.NO_DATA_MESSAGE);
        }

        const invoiceDate = InvoiceCreate.formatToday();
        const created = [];
        const errors = [];

        for (const [customerCode, customerDeliveries] of groups) {

            try {

                const customer = customerMap.get(customerCode);
                const customerName = customer?.customer_name
                    || String(getFieldValue(customerDeliveries[0], 'customer_name') ?? '').trim();
                const { details } = InvoiceCreate.buildInvoiceDetails(customerDeliveries);
                const summary = InvoiceCreate.calculateSummary(details);

                if (details.length === 0) {
                    errors.push({
                        customerCode,
                        message: '請求対象の明細がありません。',
                    });
                    continue;
                }

                const invoiceNo = await InvoiceCreate.generateNextInvoiceNo(invoiceDate);
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
                });

                const recordId = await createInvoiceRecord(recordPayload);

                created.push({
                    recordId,
                    customerCode,
                    customerName,
                    invoiceNo,
                    deliveryCount: customerDeliveries.length,
                    itemCount: summary.item_count,
                    total: summary.total,
                });

            } catch (error) {

                errors.push({
                    customerCode,
                    message: error?.message || String(error),
                });

            }

        }

        if (created.length === 0 && errors.length > 0) {
            throw new Error(errors.map((item) => `${item.customerCode}: ${item.message}`).join('\n'));
        }

        return {
            period,
            deliveryCount: eligibleDeliveries.length,
            customerCount: groups.size,
            skippedDeliveryCount: skippedCustomerCount,
            created,
            errors,
        };

    };

    MonthlyBilling.getMonthlyClosingLabels = () => (
        InvoiceCreate.CLOSING_EXECUTION_LABELS.filter((label) => label !== AD_HOC_LABEL)
    );

    MonthlyBilling.AD_HOC_LABEL = AD_HOC_LABEL;

    window.MonthlyBilling = MonthlyBilling;

})();
