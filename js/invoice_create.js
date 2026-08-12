(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * invoice_create.js
     *
     * 請求書作成: 締日・取引先コードに基づき納品書を集計し、
     * 請求明細・税計算・請求済フラグ更新を行う。
     * 印刷処理は行わない。
     */

    const InvoiceCreate = {};

    /** 納品管理アプリ App ID */
    const DELIVERY_APP_ID = 19;

    /** 請求書作成アプリ App ID */
    const INVOICE_APP_ID = 35;

    const TAX_RATE = 0.10;

    /** 納品管理（App 19）フィールド */
    const DELIVERY_FIELDS = {
        deliveryNo: 'delivery_no',
        deliveryDate: 'delivery_date',
        customerCode: 'customer_code',
        customerName: 'customer_name',
        invoiceFlag: 'invoice_flag',
        detailTable: 'delivery_detail',
    };

    /** 納品明細フィールド */
    const DELIVERY_DETAIL_FIELDS = {
        manageNo: 'manage_no',
        clientName: 'client_name',
        itemName: 'item_name',
        kimonoType: 'kimono_type',
        kimonoSpec: 'kimono_spec',
        slipNo: 'slip_no',
        inCharge: 'in_charge',
        qty: 'qty',
        unitPrice: 'unit_price',
        amount: 'amount',
    };

    /** 請求書作成アプリ フィールド */
    const INVOICE_FIELDS = {
        closingDate: 'closing_date',
        customerCode: 'customer_code',
        customerName: 'customer_name',
        subtotal: 'subtotal',
        tax: 'tax',
        total: 'total',
        detailTable: 'invoice_detail',
    };

    /** 請求明細フィールド */
    const INVOICE_DETAIL_FIELDS = {
        deliveryNo: 'delivery_no',
        deliveryDate: 'delivery_date',
        sourceDeliveryId: 'source_delivery_id',
        manageNo: 'manage_no',
        clientName: 'client_name',
        itemName: 'item_name',
        kimonoType: 'kimono_type',
        kimonoSpec: 'kimono_spec',
        slipNo: 'slip_no',
        inCharge: 'in_charge',
        qty: 'qty',
        unitPrice: 'unit_price',
        amount: 'amount',
    };

    const INVOICE_FLAG_VALUE = '請求済';

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

        if (Number.isNaN(number)) {
            return 0;
        }

        return number;

    };

    const isEmptyDeliveryDetailRow = (rowFields) => {

        const itemName = String(getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.itemName) ?? '').trim();

        if (itemName !== '') {
            return false;
        }

        if (toNumber(getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.qty)) !== 0) {
            return false;
        }

        if (toNumber(getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.amount)) !== 0) {
            return false;
        }

        return true;

    };

    const isInvoicedDelivery = (record) => {

        const flagValue = getFieldValue(record, DELIVERY_FIELDS.invoiceFlag);

        if (Array.isArray(flagValue)) {
            return flagValue.includes(INVOICE_FLAG_VALUE);
        }

        return String(flagValue) === INVOICE_FLAG_VALUE;

    };

    /**
     * 締日・取引先コードで未請求の納品書を取得する
     * @param {string} closingDate - 締日 (YYYY-MM-DD)
     * @param {string} customerCode - 取引先コード
     * @returns {Promise<Array>} 納品レコード配列
     */
    InvoiceCreate.fetchDeliveries = async (closingDate, customerCode) => {

        const code = String(customerCode ?? '').trim();
        const date = String(closingDate ?? '').trim();

        if (!code) {
            throw new Error('取引先コードを入力してください。');
        }

        if (!date) {
            throw new Error('締日を入力してください。');
        }

        const query = [
            `${DELIVERY_FIELDS.customerCode} = "${escapeQueryValue(code)}"`,
            `${DELIVERY_FIELDS.deliveryDate} <= "${escapeQueryValue(date)}"`,
            `${DELIVERY_FIELDS.invoiceFlag} not in ("${INVOICE_FLAG_VALUE}")`,
            'order by delivery_date asc, delivery_no asc',
        ].join(' and ');

        const records = [];
        const limit = 500;
        let offset = 0;

        while (true) {

            const response = await kintoneApi(
                kintone.api.url('/k/v1/records', true),
                'GET',
                {
                    app: DELIVERY_APP_ID,
                    query: `${query} limit ${limit} offset ${offset}`,
                }
            );

            records.push(...response.records);

            if (response.records.length < limit) {
                break;
            }

            offset += limit;

        }

        return records.filter((record) => !isInvoicedDelivery(record));

    };

    /**
     * 納品書レコードから請求明細行を生成する
     * @param {Array} deliveryRecords - 納品レコード
     * @returns {{ details: Array, deliveryRecordIds: Array<number> }}
     */
    InvoiceCreate.buildInvoiceDetails = (deliveryRecords) => {

        const details = [];
        const deliveryRecordIds = [];

        deliveryRecords.forEach((deliveryRecord) => {

            const deliveryId = Number(deliveryRecord.$id?.value);

            if (!Number.isNaN(deliveryId)) {
                deliveryRecordIds.push(deliveryId);
            }

            const deliveryNo = getFieldValue(deliveryRecord, DELIVERY_FIELDS.deliveryNo);
            const deliveryDate = getFieldValue(deliveryRecord, DELIVERY_FIELDS.deliveryDate);
            const table = deliveryRecord[DELIVERY_FIELDS.detailTable];
            const rows = Array.isArray(table?.value) ? table.value : [];

            rows.forEach((row) => {

                const rowFields = row?.value ?? {};

                if (isEmptyDeliveryDetailRow(rowFields)) {
                    return;
                }

                details.push({
                    delivery_no: deliveryNo,
                    delivery_date: deliveryDate,
                    source_delivery_id: deliveryId,
                    manage_no: getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.manageNo),
                    client_name: getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.clientName),
                    item_name: getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.itemName),
                    kimono_type: getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.kimonoType),
                    kimono_spec: getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.kimonoSpec),
                    slip_no: getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.slipNo),
                    in_charge: getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.inCharge),
                    qty: toNumber(getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.qty)),
                    unit_price: toNumber(getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.unitPrice)),
                    amount: toNumber(getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.amount)),
                });

            });

        });

        return {
            details,
            deliveryRecordIds: [...new Set(deliveryRecordIds)],
        };

    };

    /**
     * 請求明細から税抜・消費税・税込を計算する
     * @param {Array} details - 請求明細
     * @returns {{ subtotal: number, tax: number, total: number, count: number }}
     */
    InvoiceCreate.calculateSummary = (details) => {

        const subtotal = details.reduce((sum, detail) => sum + toNumber(detail.amount), 0);
        const tax = Math.round(subtotal * TAX_RATE);
        const total = subtotal + tax;

        return {
            subtotal,
            tax,
            total,
            count: details.length,
        };

    };

    /**
     * kintone サブテーブル形式の請求明細を生成する
     * @param {Array} details - 請求明細
     * @returns {{ value: Array }}
     */
    InvoiceCreate.toInvoiceDetailFieldValue = (details) => ({
        value: details.map((detail) => ({
            value: {
                [INVOICE_DETAIL_FIELDS.deliveryNo]: { value: detail.delivery_no },
                [INVOICE_DETAIL_FIELDS.deliveryDate]: { value: detail.delivery_date },
                [INVOICE_DETAIL_FIELDS.sourceDeliveryId]: { value: detail.source_delivery_id },
                [INVOICE_DETAIL_FIELDS.manageNo]: { value: detail.manage_no },
                [INVOICE_DETAIL_FIELDS.clientName]: { value: detail.client_name },
                [INVOICE_DETAIL_FIELDS.itemName]: { value: detail.item_name },
                [INVOICE_DETAIL_FIELDS.kimonoType]: { value: detail.kimono_type },
                [INVOICE_DETAIL_FIELDS.kimonoSpec]: { value: detail.kimono_spec },
                [INVOICE_DETAIL_FIELDS.slipNo]: { value: detail.slip_no },
                [INVOICE_DETAIL_FIELDS.inCharge]: { value: detail.in_charge },
                [INVOICE_DETAIL_FIELDS.qty]: { value: detail.qty },
                [INVOICE_DETAIL_FIELDS.unitPrice]: { value: detail.unit_price },
                [INVOICE_DETAIL_FIELDS.amount]: { value: detail.amount },
            },
        })),
    });

    /**
     * 締日・取引先コードから請求データを作成する
     * @param {Object} params
     * @param {string} params.closingDate - 締日
     * @param {string} params.customerCode - 取引先コード
     * @returns {Promise<Object>} 請求データ
     */
    InvoiceCreate.buildInvoiceData = async ({ closingDate, customerCode }) => {

        const deliveries = await InvoiceCreate.fetchDeliveries(closingDate, customerCode);

        if (deliveries.length === 0) {
            throw new Error('対象の未請求納品書が見つかりません。');
        }

        const { details, deliveryRecordIds } = InvoiceCreate.buildInvoiceDetails(deliveries);
        const summary = InvoiceCreate.calculateSummary(details);

        if (details.length === 0) {
            throw new Error('請求対象の明細がありません。');
        }

        const customerName = getFieldValue(deliveries[0], DELIVERY_FIELDS.customerName);

        return {
            header: {
                closing_date: closingDate,
                customer_code: customerCode,
                customer_name: customerName,
            },
            details,
            summary,
            deliveryRecordIds,
            deliveryCount: deliveries.length,
        };

    };

    /**
     * 請求済フラグを納品書へ一括更新する
     * @param {Array<number>} deliveryRecordIds - 納品レコード ID
     * @returns {Promise<number>} 更新件数
     */
    InvoiceCreate.markDeliveriesAsInvoiced = async (deliveryRecordIds) => {

        const uniqueIds = [...new Set(
            deliveryRecordIds
                .map((id) => Number(id))
                .filter((id) => !Number.isNaN(id) && id > 0)
        )];

        if (uniqueIds.length === 0) {
            return 0;
        }

        const chunkSize = 100;
        let updatedCount = 0;

        for (let index = 0; index < uniqueIds.length; index += chunkSize) {

            const chunk = uniqueIds.slice(index, index + chunkSize);
            const records = chunk.map((id) => ({
                id,
                record: {
                    [DELIVERY_FIELDS.invoiceFlag]: {
                        value: [INVOICE_FLAG_VALUE],
                    },
                },
            }));

            await kintoneApi(
                kintone.api.url('/k/v1/records', true),
                'PUT',
                {
                    app: DELIVERY_APP_ID,
                    records,
                }
            );

            updatedCount += chunk.length;

        }

        return updatedCount;

    };

    /**
     * 請求明細サブテーブルから納品レコード ID を収集する
     * @param {Object} record - 請求レコード
     * @returns {Array<number>}
     */
    InvoiceCreate.collectDeliveryIdsFromRecord = (record) => {

        const table = record?.[INVOICE_FIELDS.detailTable];
        const rows = Array.isArray(table?.value) ? table.value : [];
        const ids = [];

        rows.forEach((row) => {

            const id = toNumber(getFieldValue(row?.value, INVOICE_DETAIL_FIELDS.sourceDeliveryId));

            if (id > 0) {
                ids.push(id);
            }

        });

        return [...new Set(ids)];

    };

    InvoiceCreate.getInvoiceAppId = () => INVOICE_APP_ID;

    InvoiceCreate.getDeliveryAppId = () => DELIVERY_APP_ID;

    InvoiceCreate.INVOICE_FIELDS = INVOICE_FIELDS;

    InvoiceCreate.INVOICE_DETAIL_FIELDS = INVOICE_DETAIL_FIELDS;

    window.InvoiceCreate = InvoiceCreate;

})();
