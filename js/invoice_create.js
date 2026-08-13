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
    const UNINVOICED_STATUS = '未請求';
    const NO_DATA_MESSAGE = '請求対象データがありません。';
    const INVOICE_STATUS_CREATING = '作成中';
    const INVOICE_STATUS_CONFIRMED = '確定';
    const INVOICED_STATUS = '請求済';
    const INVOICE_COMPLETE_MESSAGE = '請求書を作成しました。';
    const INVOICE_CONFIRM_MESSAGE = '請求を確定しました。';
    const INVOICE_CONFIRM_DIALOG = '請求を確定します。\n\n納品書は請求済になります。\n\nよろしいですか？';

    /** 入金状況（payment_status）選択肢 — フィールドコードは請求書印刷でも使用 */
    const PAYMENT_STATUS_LABELS = [
        '未入金',
        '一部入金',
        '入金済',
    ];

    const PAYMENT_STATUS_UNPAID = '未入金';
    const PAYMENT_STATUS_PARTIAL = '一部入金';
    const PAYMENT_STATUS_PAID = '入金済';

    /** 回収状況（collection_status）選択肢 */
    const COLLECTION_STATUS_LABELS = [
        '未回収',
        '一部回収',
        '回収済',
    ];

    const COLLECTION_STATUS_UNCOLLECTED = '未回収';
    const COLLECTION_STATUS_PARTIAL = '一部回収';
    const COLLECTION_STATUS_COLLECTED = '回収済';

    const DELIVERY_FIELDS = {
        deliveryNo: 'delivery_no',
        deliveryDate: 'delivery_date',
        customerCode: 'customer_code',
        customerName: 'customer_name',
        billingStatus: 'billing_status',
        invoiceNo: 'invoice_no',
        invoiceDate: 'invoice_date',
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
        paymentDueDate: 'payment_due_date',
        paymentDate: 'payment_date',
        paymentAmount: 'payment_amount',
        paymentBalance: 'payment_balance',
        paymentStatus: 'payment_status',
        paymentNote: 'payment_note',
        invoiceAmount: 'invoice_amount',
        balance: 'balance',
        remarks: 'remarks',
        closingYm: 'closing_ym',
        billingFrom: 'billing_from',
        billingTo: 'billing_to',
        itemCount: 'item_count',
        qtyTotal: 'qty_total',
        subtotal: 'subtotal',
        tax: 'tax',
        total: 'total',
        accountsReceivable: 'accounts_receivable',
        overdueDays: 'overdue_days',
        collectionStatus: 'collection_status',
        lastPaymentDate: 'last_payment_date',
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

    const isUninvoicedDelivery = (record) => {

        const status = String(getFieldValue(record, DELIVERY_FIELDS.billingStatus) ?? '').trim();

        if (status !== '') {
            return status === UNINVOICED_STATUS;
        }

        return !isInvoicedDelivery(record);

    };

    /**
     * 請求先コード・請求対象期間で未請求の納品書を取得する（V1.0）
     */
    InvoiceCreate.fetchUninvoicedDeliveries = async ({ customerCode, billingFrom, billingTo }) => {

        const code = String(customerCode ?? '').trim();
        const from = String(billingFrom ?? '').trim();
        const to = String(billingTo ?? '').trim();

        if (!code) {
            throw new Error('請求先コード（customer_code）を入力してください。');
        }

        if (!from || !to) {
            throw new Error('請求対象期間（billing_from / billing_to）を入力してください。');
        }

        if (from > to) {
            throw new Error('請求対象期間が不正です。billing_from は billing_to 以前の日付にしてください。');
        }

        const conditions = [
            `${DELIVERY_FIELDS.customerCode} = "${escapeQueryValue(code)}"`,
            `${DELIVERY_FIELDS.billingStatus} in ("${UNINVOICED_STATUS}")`,
            `${DELIVERY_FIELDS.deliveryDate} >= "${escapeQueryValue(from)}"`,
            `${DELIVERY_FIELDS.deliveryDate} <= "${escapeQueryValue(to)}"`,
        ];

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

        return records.filter((record) => isUninvoicedDelivery(record));

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
        value: (Array.isArray(details) ? details : []).map((detail) => ({
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

    /**
     * 未請求データ取込（V1.0: 納品書への書き戻しは行わない）
     */
    InvoiceCreate.importUninvoicedData = async ({ customerCode, billingFrom, billingTo }) => {

        const deliveries = await InvoiceCreate.fetchUninvoicedDeliveries({
            customerCode,
            billingFrom,
            billingTo,
        });

        const { details, deliveryRecordIds, deliveryNos } = InvoiceCreate.buildInvoiceDetails(deliveries);
        const summary = InvoiceCreate.calculateSummary(details);

        if (deliveries.length === 0 || details.length === 0) {
            throw new Error(NO_DATA_MESSAGE);
        }

        const customerName = getFieldValue(deliveries[0], DELIVERY_FIELDS.customerName);
        const periodLabel = `${billingFrom} ～ ${billingTo}`;

        console.log('[AYANAS Invoice] 未請求データ取込');
        console.log('取得件数:', summary.item_count);
        console.log('subtotal:', summary.subtotal);
        console.log('tax:', summary.tax);
        console.log('total:', summary.total);

        return {
            header: {
                customer_code: customerCode,
                customer_name: customerName,
                billing_from: billingFrom,
                billing_to: billingTo,
                period_label: periodLabel,
            },
            details,
            summary,
            deliveryRecordIds,
            deliveryNos,
            deliveryCount: deliveries.length,
        };

    };

    InvoiceCreate.NO_DATA_MESSAGE = NO_DATA_MESSAGE;

    const pad3 = (value) => String(value).padStart(3, '0');

    const formatToday = () => {

        const now = new Date();
        const year = now.getFullYear();
        const month = pad2(now.getMonth() + 1);
        const day = pad2(now.getDate());

        return `${year}-${month}-${day}`;

    };

    const formatClosingYmFromDate = (dateValue) => {

        const normalized = String(dateValue ?? '').trim();
        const match = normalized.match(/^(\d{4})-(\d{2})/);

        if (!match) {
            throw new Error('請求日（invoice_date）の形式が不正です。');
        }

        return `${match[1]}-${match[2]}`;

    };

    const formatInvoiceNoPrefix = (dateValue) => {

        const normalized = String(dateValue ?? '').trim();
        const match = normalized.match(/^(\d{4})-(\d{2})/);

        if (!match) {
            throw new Error('請求日（invoice_date）の形式が不正です。');
        }

        return `${match[1].slice(-2)}${match[2]}`;

    };

    const parseInvoiceNoSequence = (invoiceNo, prefix) => {

        const normalized = String(invoiceNo ?? '').trim();
        const pattern = new RegExp(`^${prefix}-(\\d{3})$`);
        const match = normalized.match(pattern);

        if (!match) {
            return 0;
        }

        return Number(match[1]);

    };

    /**
     * 請求番号を YYMM-001 形式で採番する
     * @param {string} invoiceDate - YYYY-MM-DD
     */
    InvoiceCreate.generateNextInvoiceNo = async (invoiceDate) => {

        const prefix = formatInvoiceNoPrefix(invoiceDate);
        const query = [
            `${INVOICE_FIELDS.invoiceNo} like "${escapeQueryValue(prefix)}-%"`,
            'order by invoice_no desc',
            'limit 500',
        ].join(' ');

        const response = await kintoneApi(
            kintone.api.url('/k/v1/records', true),
            'GET',
            {
                app: INVOICE_APP_ID,
                query,
                fields: [INVOICE_FIELDS.invoiceNo],
            }
        );

        let maxSequence = 0;

        response.records.forEach((record) => {

            const invoiceNo = getFieldValue(record, INVOICE_FIELDS.invoiceNo);
            const sequence = parseInvoiceNoSequence(invoiceNo, prefix);

            if (sequence > maxSequence) {
                maxSequence = sequence;
            }

        });

        return `${prefix}-${pad3(maxSequence + 1)}`;

    };

    InvoiceCreate.calculateBalance = (carryOver, invoiceAmount, paymentAmount) => (
        toNumber(carryOver) + toNumber(invoiceAmount) - toNumber(paymentAmount)
    );

    const hasInvoiceDetails = (record) => {

        const table = record?.[INVOICE_FIELDS.detailTable];
        const rows = Array.isArray(table?.value) ? table.value : [];

        return rows.some((row) => {

            const rowFields = row?.value ?? {};
            const deliveryNo = String(getFieldValue(rowFields, INVOICE_DETAIL_FIELDS.deliveryNo) ?? '').trim();
            const itemName = String(getFieldValue(rowFields, INVOICE_DETAIL_FIELDS.itemName) ?? '').trim();

            return deliveryNo !== '' || itemName !== '';

        });

    };

    /**
     * 請求書作成ボタン用: ヘッダー項目を組み立てる
     */
    InvoiceCreate.buildInvoiceCompletion = async (record) => {

        if (!hasInvoiceDetails(record)) {
            throw new Error('請求明細がありません。先に「未請求データ取込」を実行してください。');
        }

        const total = toNumber(getFieldValue(record, INVOICE_FIELDS.total));

        if (total === 0) {
            throw new Error('税込合計（total）が 0 です。請求明細を確認してください。');
        }

        const carryOver = toNumber(getFieldValue(record, INVOICE_FIELDS.carryOver));
        const paymentAmount = toNumber(getFieldValue(record, INVOICE_FIELDS.paymentAmount));
        const invoiceDate = formatToday();
        const invoiceNo = await InvoiceCreate.generateNextInvoiceNo(invoiceDate);
        const invoiceAmount = total;
        const balance = InvoiceCreate.calculateBalance(carryOver, invoiceAmount, paymentAmount);
        const closingYm = formatClosingYmFromDate(invoiceDate);

        return {
            [INVOICE_FIELDS.invoiceNo]: invoiceNo,
            [INVOICE_FIELDS.invoiceDate]: invoiceDate,
            [INVOICE_FIELDS.invoiceAmount]: invoiceAmount,
            [INVOICE_FIELDS.balance]: balance,
            [INVOICE_FIELDS.invoiceStatus]: INVOICE_STATUS_CREATING,
            [INVOICE_FIELDS.closingYm]: closingYm,
        };

    };

    InvoiceCreate.INVOICE_STATUS_CREATING = INVOICE_STATUS_CREATING;
    InvoiceCreate.INVOICE_STATUS_CONFIRMED = INVOICE_STATUS_CONFIRMED;
    InvoiceCreate.INVOICE_COMPLETE_MESSAGE = INVOICE_COMPLETE_MESSAGE;
    InvoiceCreate.INVOICE_CONFIRM_MESSAGE = INVOICE_CONFIRM_MESSAGE;
    InvoiceCreate.INVOICE_CONFIRM_DIALOG = INVOICE_CONFIRM_DIALOG;

    const buildDeliveryConfirmUpdate = (invoiceNo, invoiceDate) => ({
        [DELIVERY_FIELDS.billingStatus]: { value: INVOICED_STATUS },
        [DELIVERY_FIELDS.invoiceNo]: { value: invoiceNo },
        [DELIVERY_FIELDS.invoiceDate]: { value: invoiceDate },
    });

    InvoiceCreate.fetchDeliveryMapByNos = async (deliveryNos) => {

        const uniqueNos = [...new Set(
            deliveryNos
                .map((no) => String(no ?? '').trim())
                .filter((no) => no !== '')
        )];

        const deliveryMap = new Map();
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

                const deliveryNo = String(getFieldValue(record, DELIVERY_FIELDS.deliveryNo) ?? '').trim();
                const id = Number(record.$id?.value);

                if (deliveryNo && !Number.isNaN(id)) {
                    deliveryMap.set(deliveryNo, id);
                }

            });

        }

        const notFoundNos = uniqueNos.filter((no) => !deliveryMap.has(no));

        return {
            deliveryMap,
            notFoundNos,
        };

    };

    const updateDeliveryRecord = async (id, updateRecord) => {

        await kintoneApi(
            kintone.api.url('/k/v1/record', true),
            'PUT',
            {
                app: DELIVERY_APP_ID,
                id,
                record: updateRecord,
            }
        );

    };

    InvoiceCreate.updateDeliveriesOnConfirm = async ({ deliveryMap, invoiceNo, invoiceDate }) => {

        const updateRecord = buildDeliveryConfirmUpdate(invoiceNo, invoiceDate);
        const failedNos = [];
        const entries = [...deliveryMap.entries()];
        const chunkSize = 100;

        for (let index = 0; index < entries.length; index += chunkSize) {

            const chunk = entries.slice(index, index + chunkSize);
            const records = chunk.map(([deliveryNo, id]) => ({
                deliveryNo,
                id,
            }));

            try {

                await kintoneApi(
                    kintone.api.url('/k/v1/records', true),
                    'PUT',
                    {
                        app: DELIVERY_APP_ID,
                        records: records.map(({ id }) => ({
                            id,
                            record: updateRecord,
                        })),
                    }
                );

            } catch (batchError) {

                for (const { deliveryNo, id } of records) {

                    try {
                        await updateDeliveryRecord(id, updateRecord);
                    } catch (singleError) {
                        failedNos.push(deliveryNo);
                        console.error('[AYANAS Invoice]', deliveryNo, singleError);
                    }

                }

            }

        }

        return failedNos;

    };

    InvoiceCreate.updateInvoiceStatus = async (recordId, status) => {

        await kintoneApi(
            kintone.api.url('/k/v1/record', true),
            'PUT',
            {
                app: INVOICE_APP_ID,
                id: recordId,
                record: {
                    [INVOICE_FIELDS.invoiceStatus]: { value: status },
                },
            }
        );

    };

    /**
     * 請求確定: 納品管理を請求済に更新し、請求書を「確定」にする
     */
    InvoiceCreate.confirmInvoice = async ({ record, recordId }) => {

        const id = Number(recordId);

        if (Number.isNaN(id) || id <= 0) {
            throw new Error('レコード ID を取得できません。保存後に再度お試しください。');
        }

        const invoiceNo = String(getFieldValue(record, INVOICE_FIELDS.invoiceNo) ?? '').trim();
        const invoiceDate = String(getFieldValue(record, INVOICE_FIELDS.invoiceDate) ?? '').trim();
        const invoiceStatus = String(getFieldValue(record, INVOICE_FIELDS.invoiceStatus) ?? '').trim();

        if (!invoiceNo) {
            throw new Error('請求番号（invoice_no）が未設定です。');
        }

        if (!invoiceDate) {
            throw new Error('請求日（invoice_date）が未設定です。');
        }

        if (invoiceStatus === INVOICE_STATUS_CONFIRMED) {
            throw new Error('この請求書は既に確定済みです。');
        }

        const deliveryNos = InvoiceCreate.collectDeliveryNosFromRecord(record);

        if (deliveryNos.length === 0) {
            throw new Error('請求明細に納品番号がありません。');
        }

        const { deliveryMap, notFoundNos } = await InvoiceCreate.fetchDeliveryMapByNos(deliveryNos);
        const failedNos = await InvoiceCreate.updateDeliveriesOnConfirm({
            deliveryMap,
            invoiceNo,
            invoiceDate,
        });

        const errorNos = [...new Set([...notFoundNos, ...failedNos])];

        if (errorNos.length > 0) {
            throw new Error(
                `以下の納品書を更新できませんでした。\n\n${errorNos.join('\n')}`
            );
        }

        await InvoiceCreate.updateInvoiceStatus(id, INVOICE_STATUS_CONFIRMED);

        return {
            updatedDeliveryCount: deliveryMap.size,
            invoiceNo,
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

    InvoiceCreate.fetchInvoiceRecord = async (recordId) => {

        const id = Number(recordId);

        if (Number.isNaN(id) || id <= 0) {
            throw new Error('レコード ID を取得できません。');
        }

        const response = await kintoneApi(
            kintone.api.url('/k/v1/record', true),
            'GET',
            {
                app: INVOICE_APP_ID,
                id,
            }
        );

        return response.record;

    };

    InvoiceCreate.fetchInvoiceByNo = async (invoiceNo) => {

        const normalized = String(invoiceNo ?? '').trim();

        if (!normalized) {
            throw new Error('請求番号（invoice_no）を入力してください。');
        }

        const query = `${INVOICE_FIELDS.invoiceNo} = "${escapeQueryValue(normalized)}" limit 1`;
        const response = await kintoneApi(
            kintone.api.url('/k/v1/records', true),
            'GET',
            {
                app: INVOICE_APP_ID,
                query,
            }
        );

        if (response.records.length === 0) {
            throw new Error(`請求番号 ${normalized} の請求書が見つかりません。`);
        }

        return response.records[0];

    };

    /**
     * 入金状況（payment_status）を累計入金額から判定
     */
    InvoiceCreate.derivePaymentStatus = (totalPaid, invoiceAmount) => {

        const paid = toNumber(totalPaid);
        const amount = toNumber(invoiceAmount);

        if (paid <= 0) {
            return PAYMENT_STATUS_UNPAID;
        }

        if (paid >= amount) {
            return PAYMENT_STATUS_PAID;
        }

        return PAYMENT_STATUS_PARTIAL;

    };

    InvoiceCreate.getDeliveryAppId = () => DELIVERY_APP_ID;

    /**
     * 入金残高 = 請求額（invoice_amount）− 入金金額（payment_amount）
     * V1.0: 自動更新は行わない。入金管理アプリ連携時に使用。
     */
    InvoiceCreate.calculatePaymentBalance = (invoiceAmount, paymentAmount) => (
        toNumber(invoiceAmount) - toNumber(paymentAmount)
    );

    const parseDateOnly = (dateValue) => {

        const normalized = String(dateValue ?? '').trim();
        const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);

        if (!match) {
            return null;
        }

        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

    };

    InvoiceCreate.getTaxInclusiveInvoiceAmount = (recordOrInvoiceAmount, paymentAmountArg) => {

        if (recordOrInvoiceAmount && typeof recordOrInvoiceAmount === 'object') {
            const record = recordOrInvoiceAmount;
            const invoiceAmount = toNumber(getFieldValue(record, INVOICE_FIELDS.invoiceAmount));

            if (invoiceAmount !== 0) {
                return invoiceAmount;
            }

            return toNumber(getFieldValue(record, INVOICE_FIELDS.total));
        }

        return toNumber(recordOrInvoiceAmount);

    };

    /**
     * 売掛残高 = 税込請求額 − 入金金額
     * V1.0: 表示用。入金管理アプリ完成後にフィールドへ自動反映。
     */
    InvoiceCreate.calculateAccountsReceivable = (recordOrInvoiceAmount, paymentAmount) => {

        const taxInclusiveAmount = InvoiceCreate.getTaxInclusiveInvoiceAmount(recordOrInvoiceAmount);
        const paidAmount = recordOrInvoiceAmount && typeof recordOrInvoiceAmount === 'object'
            ? toNumber(getFieldValue(recordOrInvoiceAmount, INVOICE_FIELDS.paymentAmount))
            : toNumber(paymentAmount);

        return taxInclusiveAmount - paidAmount;

    };

    /**
     * 回収期限超過日数 = 今日 − 支払期限（超過していない場合は 0）
     */
    InvoiceCreate.calculateOverdueDays = (dueDate, referenceDate) => {

        const due = parseDateOnly(dueDate);
        const reference = parseDateOnly(referenceDate || formatToday());

        if (!due || !reference) {
            return 0;
        }

        const diffMs = reference.getTime() - due.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        return diffDays > 0 ? diffDays : 0;

    };

    /**
     * 回収状況を売掛残高・入金金額から判定（V1.0: 表示用）
     */
    InvoiceCreate.deriveCollectionStatus = (accountsReceivable, paymentAmount) => {

        const receivable = toNumber(accountsReceivable);
        const paid = toNumber(paymentAmount);

        if (receivable <= 0) {
            return COLLECTION_STATUS_COLLECTED;
        }

        if (paid > 0) {
            return COLLECTION_STATUS_PARTIAL;
        }

        return COLLECTION_STATUS_UNCOLLECTED;

    };

    /**
     * 売掛管理の表示用値をレコードから算出（V1.0）
     */
    InvoiceCreate.computeReceivableDisplay = (record) => {

        const storedReceivable = getFieldValue(record, INVOICE_FIELDS.accountsReceivable);
        const storedOverdueDays = getFieldValue(record, INVOICE_FIELDS.overdueDays);
        const storedCollectionStatus = String(getFieldValue(record, INVOICE_FIELDS.collectionStatus) ?? '').trim();
        const paymentAmount = toNumber(getFieldValue(record, INVOICE_FIELDS.paymentAmount));
        const dueDate = getFieldValue(record, INVOICE_FIELDS.dueDate);

        const accountsReceivable = storedReceivable !== '' && storedReceivable !== null && storedReceivable !== undefined
            ? toNumber(storedReceivable)
            : InvoiceCreate.calculateAccountsReceivable(record);

        const overdueDays = storedOverdueDays !== '' && storedOverdueDays !== null && storedOverdueDays !== undefined
            ? toNumber(storedOverdueDays)
            : InvoiceCreate.calculateOverdueDays(dueDate);

        const collectionStatus = storedCollectionStatus
            || InvoiceCreate.deriveCollectionStatus(accountsReceivable, paymentAmount);

        return {
            accounts_receivable: accountsReceivable,
            overdue_days: overdueDays,
            collection_status: collectionStatus,
            last_payment_date: getFieldValue(record, INVOICE_FIELDS.lastPaymentDate),
        };

    };

    InvoiceCreate.PAYMENT_STATUS_LABELS = PAYMENT_STATUS_LABELS;
    InvoiceCreate.PAYMENT_STATUS_UNPAID = PAYMENT_STATUS_UNPAID;
    InvoiceCreate.PAYMENT_STATUS_PARTIAL = PAYMENT_STATUS_PARTIAL;
    InvoiceCreate.PAYMENT_STATUS_PAID = PAYMENT_STATUS_PAID;

    InvoiceCreate.COLLECTION_STATUS_LABELS = COLLECTION_STATUS_LABELS;
    InvoiceCreate.COLLECTION_STATUS_UNCOLLECTED = COLLECTION_STATUS_UNCOLLECTED;
    InvoiceCreate.COLLECTION_STATUS_PARTIAL = COLLECTION_STATUS_PARTIAL;
    InvoiceCreate.COLLECTION_STATUS_COLLECTED = COLLECTION_STATUS_COLLECTED;

    InvoiceCreate.INVOICE_FIELDS = INVOICE_FIELDS;

    InvoiceCreate.INVOICE_DETAIL_FIELDS = INVOICE_DETAIL_FIELDS;

    window.InvoiceCreate = InvoiceCreate;

})();
