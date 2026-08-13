(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * invoice_create.js
     *
     * 請求書作成 App 35: 締日・請求締年月・請求先コードに基づき
     * 納品書を集計し、請求明細・税計算・請求済フラグ更新を行う。
     */

    const InvoiceCreate = {};

    const DELIVERY_APP_ID = 19;
    const INVOICE_APP_ID = 35;
    const TAX_RATE = 0.10;
    const INVOICE_FLAG_VALUE = '請求済';

    const DELIVERY_FIELDS = {
        deliveryNo: 'delivery_no',
        deliveryDate: 'delivery_date',
        customerCode: 'customer_code',
        customerName: 'customer_name',
        invoiceFlag: 'invoice_flag',
        detailTable: 'delivery_detail',
    };

    const DELIVERY_DETAIL_FIELDS = {
        manageNo: 'manage_no',
        clientName: 'client_name',
        itemName: 'item_name',
        kimonoType: 'kimono_type',
        kimonoSpec: 'kimono_spec',
        qty: 'qty',
        unitPrice: 'unit_price',
        amount: 'amount',
    };

    const INVOICE_FIELDS = {
        invoiceNo: 'invoice_no',
        invoiceDate: 'invoice_date',
        closingDate: 'closing_date',
        dueDate: 'due_date',
        customerCode: 'customer_code',
        customerName: 'customer_name',
        inCharge: 'in_charge',
        invoiceStatus: 'invoice_status',
        carryOver: 'carry_over',
        paymentAmount: 'payment_amount',
        invoiceAmount: 'invoice_amount',
        balance: 'balance',
        remarks: 'remarks',
        closingYm: 'closing_ym',
        paymentStatus: 'payment_status',
        itemCount: 'item_count',
        qtyTotal: 'qty_total',
        subtotal: 'subtotal',
        tax: 'tax',
        total: 'total',
        detailTable: 'invoice_detail',
    };

    const INVOICE_DETAIL_FIELDS = {
        deliveryNo: 'delivery_no',
        deliveryDate: 'delivery_date',
        manageNo: 'manage_no',
        clientName: 'client_name',
        kimonoType: 'kimono_type',
        kimonoSpec: 'kimono_spec',
        itemName: 'item_name',
        qty: 'qty',
        unitPrice: 'unit_price',
        amount: 'amount',
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

        if (Number.isNaN(number)) {
            return 0;
        }

        return number;

    };

    const pad2 = (value) => String(value).padStart(2, '0');

    const formatDate = (year, month, day) => `${year}-${pad2(month)}-${pad2(day)}`;

    const parseClosingYm = (closingYm) => {

        const normalized = String(closingYm ?? '').trim();
        const match = normalized.match(/^(\d{4})-(\d{1,2})$/);

        if (!match) {
            throw new Error('請求締年月（closing_ym）を YYYY-MM 形式で入力してください。');
        }

        const year = Number(match[1]);
        const month = Number(match[2]);

        if (month < 1 || month > 12) {
            throw new Error('請求締年月（closing_ym）の月が不正です。');
        }

        return { year, month };

    };

    const getLastDayOfMonth = (year, month) => new Date(year, month, 0).getDate();

    /** 締日ドロップダウン選択肢 */
    const CLOSING_DATE_LABELS = [
        '10日',
        '15日',
        '20日',
        '30日',
        '月末',
        '都度払い',
        '10.20.月末',
    ];

    const normalizeClosingLabel = (label) => String(label ?? '')
        .trim()
        .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0));

    const parseReferenceDay = (referenceDate, year, month) => {

        const normalized = String(referenceDate ?? '').trim();

        if (!normalized) {
            return getLastDayOfMonth(year, month);
        }

        const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);

        if (!match) {
            return getLastDayOfMonth(year, month);
        }

        const refYear = Number(match[1]);
        const refMonth = Number(match[2]);
        const refDay = Number(match[3]);

        if (refYear === year && refMonth === month) {
            return refDay;
        }

        return getLastDayOfMonth(year, month);

    };

    const clampDayToMonth = (year, month, day) => Math.min(day, getLastDayOfMonth(year, month));

    const resolveFixedDayPeriod = (year, month, day) => {

        const lastDay = getLastDayOfMonth(year, month);
        const clampedDay = Math.min(Math.max(day, 1), lastDay);

        return {
            periodStart: formatDate(year, month, 1),
            periodEnd: formatDate(year, month, clampedDay),
        };

    };

    const resolveMultiClosingPeriod = (year, month, referenceDay) => {

        const lastDay = getLastDayOfMonth(year, month);

        if (referenceDay <= 10) {
            return {
                periodStart: formatDate(year, month, 1),
                periodEnd: formatDate(year, month, clampDayToMonth(year, month, 10)),
            };
        }

        if (referenceDay <= 20) {
            return {
                periodStart: formatDate(year, month, 11),
                periodEnd: formatDate(year, month, clampDayToMonth(year, month, 20)),
            };
        }

        return {
            periodStart: formatDate(year, month, 21),
            periodEnd: formatDate(year, month, lastDay),
        };

    };

    /**
     * 締日ドロップダウンと請求締年月から集計期間を算出する
     * @param {string} closingYm - YYYY-MM
     * @param {string} closingDateLabel - 締日（10日/15日/20日/30日/月末/都度払い/10.20.月末）
     * @param {string} [referenceDate] - 基準日（10.20.月末 の区間判定に invoice_date を使用）
     * @returns {{ periodStart: string|null, periodEnd: string|null, closingYm: string, adHoc: boolean }}
     */
    InvoiceCreate.resolveClosingPeriod = (closingYm, closingDateLabel, referenceDate) => {

        const { year, month } = parseClosingYm(closingYm);
        const label = normalizeClosingLabel(closingDateLabel);

        if (!label) {
            throw new Error('締日（closing_date）を選択してください。');
        }

        const closingYmFormatted = `${year}-${pad2(month)}`;

        if (label === '都度払い') {
            return {
                periodStart: null,
                periodEnd: null,
                closingYm: closingYmFormatted,
                adHoc: true,
            };
        }

        if (label === '月末') {
            const lastDay = getLastDayOfMonth(year, month);

            return {
                periodStart: formatDate(year, month, 1),
                periodEnd: formatDate(year, month, lastDay),
                closingYm: closingYmFormatted,
                adHoc: false,
            };
        }

        if (label === '10.20.月末') {
            const referenceDay = parseReferenceDay(referenceDate, year, month);
            const period = resolveMultiClosingPeriod(year, month, referenceDay);

            return {
                ...period,
                closingYm: closingYmFormatted,
                adHoc: false,
            };
        }

        const dayMatch = label.match(/^(\d{1,2})日?$/);

        if (dayMatch) {
            const period = resolveFixedDayPeriod(year, month, Number(dayMatch[1]));

            return {
                ...period,
                closingYm: closingYmFormatted,
                adHoc: false,
            };
        }

        throw new Error(
            `締日（closing_date）が不正です。選択肢: ${CLOSING_DATE_LABELS.join(' / ')}`
        );

    };

    InvoiceCreate.CLOSING_DATE_LABELS = CLOSING_DATE_LABELS;

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
     * 請求締年月・締日・請求先コードで未請求の納品書を取得する
     */
    InvoiceCreate.fetchDeliveries = async ({ closingYm, closingDate, customerCode, referenceDate }) => {

        const code = String(customerCode ?? '').trim();

        if (!code) {
            throw new Error('請求先コード（customer_code）を入力してください。');
        }

        const period = InvoiceCreate.resolveClosingPeriod(closingYm, closingDate, referenceDate);

        const conditions = [
            `${DELIVERY_FIELDS.customerCode} = "${escapeQueryValue(code)}"`,
            `${DELIVERY_FIELDS.invoiceFlag} not in ("${INVOICE_FLAG_VALUE}")`,
        ];

        if (!period.adHoc) {
            conditions.push(
                `${DELIVERY_FIELDS.deliveryDate} >= "${escapeQueryValue(period.periodStart)}"`,
                `${DELIVERY_FIELDS.deliveryDate} <= "${escapeQueryValue(period.periodEnd)}"`
            );
        } else {
            const { year, month } = parseClosingYm(closingYm);
            const ymStart = formatDate(year, month, 1);
            const ymEnd = formatDate(year, month, getLastDayOfMonth(year, month));

            conditions.push(
                `${DELIVERY_FIELDS.deliveryDate} >= "${escapeQueryValue(ymStart)}"`,
                `${DELIVERY_FIELDS.deliveryDate} <= "${escapeQueryValue(ymEnd)}"`
            );
        }

        const query = [
            ...conditions,
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

    InvoiceCreate.buildInvoiceDetails = (deliveryRecords) => {

        const details = [];
        const deliveryRecordIds = [];
        const deliveryNos = [];

        deliveryRecords.forEach((deliveryRecord) => {

            const deliveryId = Number(deliveryRecord.$id?.value);
            const deliveryNo = getFieldValue(deliveryRecord, DELIVERY_FIELDS.deliveryNo);
            const deliveryDate = getFieldValue(deliveryRecord, DELIVERY_FIELDS.deliveryDate);

            if (!Number.isNaN(deliveryId)) {
                deliveryRecordIds.push(deliveryId);
            }

            if (deliveryNo) {
                deliveryNos.push(deliveryNo);
            }

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
                    manage_no: getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.manageNo),
                    client_name: getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.clientName),
                    kimono_type: getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.kimonoType),
                    kimono_spec: getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.kimonoSpec),
                    item_name: getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.itemName),
                    qty: toNumber(getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.qty)),
                    unit_price: toNumber(getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.unitPrice)),
                    amount: toNumber(getFieldValue(rowFields, DELIVERY_DETAIL_FIELDS.amount)),
                });

            });

        });

        return {
            details,
            deliveryRecordIds: [...new Set(deliveryRecordIds)],
            deliveryNos: [...new Set(deliveryNos)],
        };

    };

    InvoiceCreate.calculateSummary = (details) => {

        const subtotal = details.reduce((sum, detail) => sum + toNumber(detail.amount), 0);
        const qtyTotal = details.reduce((sum, detail) => sum + toNumber(detail.qty), 0);
        const tax = Math.round(subtotal * TAX_RATE);
        const total = subtotal + tax;

        return {
            item_count: details.length,
            qty_total: qtyTotal,
            subtotal,
            tax,
            total,
            count: details.length,
        };

    };

    InvoiceCreate.toInvoiceDetailFieldValue = (details) => ({
        value: details.map((detail) => ({
            value: {
                [INVOICE_DETAIL_FIELDS.deliveryNo]: { value: detail.delivery_no },
                [INVOICE_DETAIL_FIELDS.deliveryDate]: { value: detail.delivery_date },
                [INVOICE_DETAIL_FIELDS.manageNo]: { value: detail.manage_no },
                [INVOICE_DETAIL_FIELDS.clientName]: { value: detail.client_name },
                [INVOICE_DETAIL_FIELDS.kimonoType]: { value: detail.kimono_type },
                [INVOICE_DETAIL_FIELDS.kimonoSpec]: { value: detail.kimono_spec },
                [INVOICE_DETAIL_FIELDS.itemName]: { value: detail.item_name },
                [INVOICE_DETAIL_FIELDS.qty]: { value: detail.qty },
                [INVOICE_DETAIL_FIELDS.unitPrice]: { value: detail.unit_price },
                [INVOICE_DETAIL_FIELDS.amount]: { value: detail.amount },
            },
        })),
    });

    InvoiceCreate.buildInvoiceData = async ({ closingYm, closingDate, customerCode, referenceDate }) => {

        const period = InvoiceCreate.resolveClosingPeriod(closingYm, closingDate, referenceDate);
        const deliveries = await InvoiceCreate.fetchDeliveries({
            closingYm: period.closingYm,
            closingDate,
            customerCode,
            referenceDate,
        });

        const periodLabel = period.adHoc
            ? `${period.closingYm}（都度払い）`
            : `${period.periodStart} ～ ${period.periodEnd}`;

        if (deliveries.length === 0) {
            throw new Error(`対象の未請求納品書が見つかりません。（${periodLabel}）`);
        }

        const { details, deliveryRecordIds, deliveryNos } = InvoiceCreate.buildInvoiceDetails(deliveries);
        const summary = InvoiceCreate.calculateSummary(details);

        if (details.length === 0) {
            throw new Error('請求対象の明細がありません。');
        }

        const customerName = getFieldValue(deliveries[0], DELIVERY_FIELDS.customerName);

        return {
            header: {
                closing_date: closingDate,
                closing_ym: period.closingYm,
                customer_code: customerCode,
                customer_name: customerName,
                period_start: period.periodStart,
                period_end: period.periodEnd,
                period_label: periodLabel,
            },
            details,
            summary,
            deliveryRecordIds,
            deliveryNos,
            deliveryCount: deliveries.length,
        };

    };

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

    InvoiceCreate.collectDeliveryNosFromRecord = (record) => {

        const table = record?.[INVOICE_FIELDS.detailTable];
        const rows = Array.isArray(table?.value) ? table.value : [];
        const nos = [];

        rows.forEach((row) => {

            const deliveryNo = String(
                getFieldValue(row?.value, INVOICE_DETAIL_FIELDS.deliveryNo) ?? ''
            ).trim();

            if (deliveryNo) {
                nos.push(deliveryNo);
            }

        });

        return [...new Set(nos)];

    };

    InvoiceCreate.fetchDeliveryIdsByNos = async (deliveryNos) => {

        const uniqueNos = [...new Set(
            deliveryNos
                .map((no) => String(no ?? '').trim())
                .filter((no) => no !== '')
        )];

        if (uniqueNos.length === 0) {
            return [];
        }

        const ids = [];
        const chunkSize = 100;

        for (let index = 0; index < uniqueNos.length; index += chunkSize) {

            const chunk = uniqueNos.slice(index, index + chunkSize);
            const inClause = chunk.map((no) => `"${escapeQueryValue(no)}"`).join(', ');
            const query = `${DELIVERY_FIELDS.deliveryNo} in (${inClause})`;

            const response = await kintoneApi(
                kintone.api.url('/k/v1/records', true),
                'GET',
                {
                    app: DELIVERY_APP_ID,
                    query,
                    fields: ['$id', DELIVERY_FIELDS.deliveryNo],
                }
            );

            response.records.forEach((record) => {

                const id = Number(record.$id?.value);

                if (!Number.isNaN(id)) {
                    ids.push(id);
                }

            });

        }

        return [...new Set(ids)];

    };

    InvoiceCreate.resolveDeliveryIdsForRecord = async (record, fallbackIds = []) => {

        if (fallbackIds.length > 0) {
            return fallbackIds;
        }

        const deliveryNos = InvoiceCreate.collectDeliveryNosFromRecord(record);

        return InvoiceCreate.fetchDeliveryIdsByNos(deliveryNos);

    };

    InvoiceCreate.getInvoiceAppId = () => INVOICE_APP_ID;

    InvoiceCreate.getDeliveryAppId = () => DELIVERY_APP_ID;

    InvoiceCreate.INVOICE_FIELDS = INVOICE_FIELDS;

    InvoiceCreate.INVOICE_DETAIL_FIELDS = INVOICE_DETAIL_FIELDS;

    window.InvoiceCreate = InvoiceCreate;

})();
