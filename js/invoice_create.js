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
    const CUSTOMER_APP_ID = 17;
    const TAX_RATE = 0.10;
    const INVOICE_FLAG_VALUE = '請求済';
    const UNINVOICED_STATUS = '未請求';
    const NO_DATA_MESSAGE = '請求対象データがありません。';
    const INVOICE_STATUS_CREATING = '作成中';
    const INVOICE_STATUS_CONFIRMED = '確定';
    const INVOICE_STATUS_CANCELLED = '取消';
    const INVOICED_STATUS = '請求済';
    const INVOICED_IMPORT_ERROR = '請求済データは取り込めません。';
    const INVOICE_NO_IMPORT_ERROR = '請求番号が設定されたデータは取り込めません。';
    const INVOICE_VOID_BLOCKED_ERROR = '請求済のため取消できません。';
    const DELIVERY_INVOICE_STATUS_UNINVOICED = '未請求';
    const DELIVERY_INVOICE_STATUS_CREATING = '請求作成中';
    const DELIVERY_INVOICE_STATUS_INVOICED = '請求済';
    const INVOICE_COMPLETE_MESSAGE = '請求書を作成しました。';
    const INVOICE_CONFIRM_MESSAGE = '請求を確定しました。';
    const INVOICE_CONFIRM_DIALOG = '請求を確定します。\n\n納品書は請求済になります。\n\nよろしいですか？';
    const INVOICE_CANCEL_MESSAGE = '請求書を取り消しました。';
    const INVOICE_CANCEL_DIALOG = '請求書を取り消します。\n\n納品書は未請求へ戻ります。\n\nよろしいですか？';

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

    const CUSTOMER_FIELDS = {
        customerCode: 'customer_code',
        customerName: 'customer_name',
        closingDay: 'closing_day',
        paymentTerms: 'payment_terms',
    };

    /** 顧客管理 payment_terms 選択肢 */
    const PAYMENT_TERMS_LABELS = [
        '当月末払い',
        '翌月10日払い',
        '翌月15日払い',
        '翌月20日払い',
        '翌月25日払い',
        '翌月末払い',
        '翌々月10日払い',
        '都度払い',
    ];

    const DELIVERY_FIELDS = {
        deliveryNo: 'delivery_no',
        deliveryDate: 'delivery_date',
        customerCode: 'customer_code',
        customerName: 'customer_name',
        billingStatus: 'billing_status',
        invoiceStatus: 'invoice_status',
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

    const shiftMonth = (year, month, delta) => {

        const date = new Date(year, month - 1 + delta, 1);

        return {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
        };

    };

    const addDaysToDate = (year, month, day, delta) => {

        const date = new Date(year, month - 1, day);

        date.setDate(date.getDate() + delta);

        return {
            year: date.getFullYear(),
            month: date.getMonth() + 1,
            day: date.getDate(),
        };

    };

    /** 月次請求処理の締日選択肢（請求書 closing_date） */
    const CLOSING_EXECUTION_LABELS = [
        '10日締め',
        '15日締め',
        '20日締め',
        '30日締め',
        '月末締め',
        '都度払い',
    ];

    /** 顧客管理 closing_day 選択肢 */
    const CUSTOMER_CLOSING_DAY_LABELS = [
        '10日締め',
        '15日締め',
        '20日締め',
        '30日締め',
        '月末締め',
        '都度払い',
        '10・20・月末締め',
    ];

    const CLOSING_EXECUTION_TARGETS = {
        '10日締め': ['10日締め', '10・20・月末締め'],
        '15日締め': ['15日締め'],
        '20日締め': ['20日締め', '10・20・月末締め'],
        '30日締め': ['30日締め'],
        '月末締め': ['月末締め', '10・20・月末締め'],
        '都度払い': ['都度払い'],
    };

    const normalizeClosingLabel = (label) => String(label ?? '')
        .trim()
        .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
        .replace(/10\.20\.月末/g, '10・20・月末')
        .replace(/10\.20\.月末締め/g, '10・20・月末締め');

    const clampDayToMonth = (year, month, day) => Math.min(day, getLastDayOfMonth(year, month));

    const resolveTenClosingPeriod = (year, month) => {

        const prev = shiftMonth(year, month, -1);

        return {
            periodStart: formatDate(prev.year, prev.month, clampDayToMonth(prev.year, prev.month, 11)),
            periodEnd: formatDate(year, month, clampDayToMonth(year, month, 10)),
        };

    };

    const resolveFifteenClosingPeriod = (year, month) => {

        const prev = shiftMonth(year, month, -1);

        return {
            periodStart: formatDate(prev.year, prev.month, clampDayToMonth(prev.year, prev.month, 16)),
            periodEnd: formatDate(year, month, clampDayToMonth(year, month, 15)),
        };

    };

    const resolveTwentyClosingPeriod = (year, month) => ({
        periodStart: formatDate(year, month, clampDayToMonth(year, month, 11)),
        periodEnd: formatDate(year, month, clampDayToMonth(year, month, 20)),
    });

    const resolveThirtyClosingPeriod = (year, month) => {

        const prev = shiftMonth(year, month, -1);
        const prevClosingDay = clampDayToMonth(prev.year, prev.month, 30);
        const start = addDaysToDate(prev.year, prev.month, prevClosingDay, 1);

        return {
            periodStart: formatDate(start.year, start.month, start.day),
            periodEnd: formatDate(year, month, clampDayToMonth(year, month, 30)),
        };

    };

    const resolveMonthEndClosingPeriod = (year, month) => {

        const lastDay = getLastDayOfMonth(year, month);

        return {
            periodStart: formatDate(year, month, clampDayToMonth(year, month, 21)),
            periodEnd: formatDate(year, month, lastDay),
        };

    };

    /**
     * 月次請求処理の締日と請求締年月から請求期間を算出する
     * @param {string} closingYm - YYYY-MM（処理対象月）
     * @param {string} executionLabel - 10日締め / 15日締め / … / 都度払い
     */
    InvoiceCreate.resolveClosingPeriod = (closingYm, executionLabel) => {

        const { year, month } = parseClosingYm(closingYm);
        const label = normalizeClosingLabel(executionLabel);

        if (!label) {
            throw new Error('締日（closing_date）を選択してください。');
        }

        const closingYmFormatted = `${year}-${pad2(month)}`;

        if (label === '都度払い') {
            return {
                periodStart: null,
                periodEnd: null,
                closingYm: closingYmFormatted,
                executionLabel: label,
                adHoc: true,
                singleDelivery: true,
            };
        }

        let period;

        switch (label) {
            case '10日締め':
                period = resolveTenClosingPeriod(year, month);
                break;
            case '15日締め':
                period = resolveFifteenClosingPeriod(year, month);
                break;
            case '20日締め':
                period = resolveTwentyClosingPeriod(year, month);
                break;
            case '30日締め':
                period = resolveThirtyClosingPeriod(year, month);
                break;
            case '月末締め':
                period = resolveMonthEndClosingPeriod(year, month);
                break;
            default:
                throw new Error(
                    `締日（closing_date）が不正です。選択肢: ${CLOSING_EXECUTION_LABELS.join(' / ')}`
                );
        }

        return {
            ...period,
            closingYm: closingYmFormatted,
            executionLabel: label,
            adHoc: false,
            singleDelivery: false,
        };

    };

    InvoiceCreate.getExecutionTargetClosingDays = (executionLabel) => {

        const label = normalizeClosingLabel(executionLabel);

        return CLOSING_EXECUTION_TARGETS[label] || [];

    };

    InvoiceCreate.fetchCustomerByCode = async (customerCode) => {

        const code = String(customerCode ?? '').trim();

        if (!code) {
            throw new Error('請求先コード（customer_code）を入力してください。');
        }

        const query = `${CUSTOMER_FIELDS.customerCode} = "${escapeQueryValue(code)}" limit 1`;
        const response = await kintoneApi(
            kintone.api.url('/k/v1/records', true),
            'GET',
            {
                app: CUSTOMER_APP_ID,
                query,
                fields: [
                    CUSTOMER_FIELDS.customerCode,
                    CUSTOMER_FIELDS.customerName,
                    CUSTOMER_FIELDS.closingDay,
                    CUSTOMER_FIELDS.paymentTerms,
                ],
            }
        );

        if (response.records.length === 0) {
            throw new Error(`請求先コード ${code} の顧客が見つかりません。`);
        }

        return response.records[0];

    };

    InvoiceCreate.validateCustomerClosingDay = async (customerCode, executionLabel) => {

        const customer = await InvoiceCreate.fetchCustomerByCode(customerCode);
        const customerClosingDay = normalizeClosingLabel(
            getFieldValue(customer, CUSTOMER_FIELDS.closingDay)
        );
        const targets = InvoiceCreate.getExecutionTargetClosingDays(executionLabel).map(normalizeClosingLabel);

        if (!customerClosingDay) {
            throw new Error('顧客管理の締日（closing_day）が未設定です。');
        }

        if (!targets.includes(customerClosingDay)) {
            throw new Error(
                `この請求先は「${customerClosingDay}」のため、「${normalizeClosingLabel(executionLabel)}」処理の対象外です。`
            );
        }

        return {
            customer_code: getFieldValue(customer, CUSTOMER_FIELDS.customerCode),
            customer_name: getFieldValue(customer, CUSTOMER_FIELDS.customerName),
            closing_day: customerClosingDay,
        };

    };

    InvoiceCreate.CLOSING_EXECUTION_LABELS = CLOSING_EXECUTION_LABELS;
    InvoiceCreate.CUSTOMER_CLOSING_DAY_LABELS = CUSTOMER_CLOSING_DAY_LABELS;
    InvoiceCreate.CLOSING_DATE_LABELS = CLOSING_EXECUTION_LABELS;
    InvoiceCreate.PAYMENT_TERMS_LABELS = PAYMENT_TERMS_LABELS;

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

    const isInvoicedDeliveryLegacy = (record) => {

        const flagValue = getFieldValue(record, DELIVERY_FIELDS.invoiceFlag);

        if (Array.isArray(flagValue)) {
            return flagValue.includes(INVOICE_FLAG_VALUE);
        }

        return String(flagValue) === INVOICE_FLAG_VALUE;

    };

    const getDeliveryInvoiceStatus = (record) => {

        const status = String(getFieldValue(record, DELIVERY_FIELDS.invoiceStatus) ?? '').trim();

        if (status) {
            return status;
        }

        const billingStatus = String(getFieldValue(record, DELIVERY_FIELDS.billingStatus) ?? '').trim();

        if (billingStatus === DELIVERY_INVOICE_STATUS_INVOICED || billingStatus === INVOICED_STATUS) {
            return DELIVERY_INVOICE_STATUS_INVOICED;
        }

        if (billingStatus === DELIVERY_INVOICE_STATUS_UNINVOICED || billingStatus === UNINVOICED_STATUS) {
            return DELIVERY_INVOICE_STATUS_UNINVOICED;
        }

        if (isInvoicedDeliveryLegacy(record)) {
            return DELIVERY_INVOICE_STATUS_INVOICED;
        }

        return DELIVERY_INVOICE_STATUS_UNINVOICED;

    };

    const hasDeliveryInvoiceNo = (record) => (
        String(getFieldValue(record, DELIVERY_FIELDS.invoiceNo) ?? '').trim() !== ''
    );

    const isImportableDelivery = (record) => {

        if (getDeliveryInvoiceStatus(record) !== DELIVERY_INVOICE_STATUS_UNINVOICED) {
            return false;
        }

        return !hasDeliveryInvoiceNo(record);

    };

    const assertDeliveriesImportable = (deliveries) => {

        const records = Array.isArray(deliveries) ? deliveries : [];

        if (records.some((record) => getDeliveryInvoiceStatus(record) === DELIVERY_INVOICE_STATUS_INVOICED)) {
            throw new Error(INVOICED_IMPORT_ERROR);
        }

        if (records.some((record) => hasDeliveryInvoiceNo(record))) {
            throw new Error(INVOICE_NO_IMPORT_ERROR);
        }

        const blocked = records.filter((record) => !isImportableDelivery(record));

        if (blocked.length > 0) {
            throw new Error(INVOICED_IMPORT_ERROR);
        }

    };

    const isInvoicedDelivery = (record) => (
        getDeliveryInvoiceStatus(record) === DELIVERY_INVOICE_STATUS_INVOICED
    );

    const isUninvoicedDelivery = (record) => isImportableDelivery(record);

    /**
     * 請求先コード・請求対象期間で未請求の納品書を取得する（V1.0）
     */
    InvoiceCreate.fetchUninvoicedDeliveries = async ({
        customerCode,
        billingFrom,
        billingTo,
        singleDelivery = false,
    }) => {

        const code = String(customerCode ?? '').trim();
        const from = String(billingFrom ?? '').trim();
        const to = String(billingTo ?? '').trim();

        if (!code) {
            throw new Error('請求先コード（customer_code）を入力してください。');
        }

        const conditions = [
            `${DELIVERY_FIELDS.customerCode} = "${escapeQueryValue(code)}"`,
            `${DELIVERY_FIELDS.invoiceStatus} in ("${DELIVERY_INVOICE_STATUS_UNINVOICED}")`,
        ];

        if (from && to) {
            if (from > to) {
                throw new Error('請求対象期間が不正です。billing_from は billing_to 以前の日付にしてください。');
            }

            conditions.push(
                `${DELIVERY_FIELDS.deliveryDate} >= "${escapeQueryValue(from)}"`,
                `${DELIVERY_FIELDS.deliveryDate} <= "${escapeQueryValue(to)}"`
            );
        } else if (!singleDelivery) {
            throw new Error('請求対象期間（billing_from / billing_to）を入力してください。');
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

        const deliveries = records.filter((record) => isImportableDelivery(record));

        assertDeliveriesImportable(deliveries);

        if (singleDelivery && deliveries.length > 1) {
            return [deliveries[0]];
        }

        return deliveries;

    };

    /**
     * 請求対象期間内の未請求納品書を全件取得する（月次請求処理 V1.0）
     */
    InvoiceCreate.fetchAllUninvoicedDeliveriesInPeriod = async ({ billingFrom, billingTo }) => {

        const from = String(billingFrom ?? '').trim();
        const to = String(billingTo ?? '').trim();

        if (!from || !to) {
            throw new Error('請求対象期間（billing_from / billing_to）を入力してください。');
        }

        if (from > to) {
            throw new Error('請求対象期間が不正です。billing_from は billing_to 以前の日付にしてください。');
        }

        const conditions = [
            `${DELIVERY_FIELDS.invoiceStatus} in ("${DELIVERY_INVOICE_STATUS_UNINVOICED}")`,
            `${DELIVERY_FIELDS.deliveryDate} >= "${escapeQueryValue(from)}"`,
            `${DELIVERY_FIELDS.deliveryDate} <= "${escapeQueryValue(to)}"`,
        ];

        const query = [
            ...conditions,
            'order by customer_code asc, delivery_date asc, delivery_no asc',
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

        const deliveries = records.filter((record) => isImportableDelivery(record));

        assertDeliveriesImportable(deliveries);

        return deliveries;

    };

    /**
     * 締日種別に一致する顧客を取得する（月次請求処理 V1.0）
     */
    InvoiceCreate.fetchCustomersByClosingDays = async (closingDays) => {

        const targets = [...new Set(
            (Array.isArray(closingDays) ? closingDays : [])
                .map((label) => normalizeClosingLabel(label))
                .filter((label) => label !== '')
        )];

        if (targets.length === 0) {
            return [];
        }

        const inClause = targets.map((label) => `"${escapeQueryValue(label)}"`).join(', ');
        const query = `${CUSTOMER_FIELDS.closingDay} in (${inClause}) order by ${CUSTOMER_FIELDS.customerCode} asc`;
        const records = [];
        const limit = 500;
        let offset = 0;

        while (true) {

            const response = await kintoneApi(
                kintone.api.url('/k/v1/records', true),
                'GET',
                {
                    app: CUSTOMER_APP_ID,
                    query: `${query} limit ${limit} offset ${offset}`,
                    fields: [
                        CUSTOMER_FIELDS.customerCode,
                        CUSTOMER_FIELDS.customerName,
                        CUSTOMER_FIELDS.closingDay,
                        CUSTOMER_FIELDS.paymentTerms,
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

    InvoiceCreate.groupDeliveriesByCustomerCode = (deliveryRecords) => {

        const groups = new Map();

        (Array.isArray(deliveryRecords) ? deliveryRecords : []).forEach((record) => {

            const code = String(getFieldValue(record, DELIVERY_FIELDS.customerCode) ?? '').trim();

            if (!code) {
                return;
            }

            if (!groups.has(code)) {
                groups.set(code, []);
            }

            groups.get(code).push(record);

        });

        return groups;

    };

    /**
     * 月次請求処理で kintone API に POST するレコード形式を組み立てる
     */
    InvoiceCreate.buildMonthlyInvoiceRecord = ({
        customerCode,
        customerName,
        closingYm,
        closingDate,
        billingFrom,
        billingTo,
        details,
        summary,
        invoiceDate,
        invoiceNo,
        dueDate,
    }) => {

        const total = toNumber(summary?.total);
        const carryOver = 0;
        const paymentAmount = 0;
        const balance = InvoiceCreate.calculateBalance(carryOver, total, paymentAmount);

        return {
            [INVOICE_FIELDS.customerCode]: { value: customerCode },
            [INVOICE_FIELDS.customerName]: { value: customerName },
            [INVOICE_FIELDS.closingYm]: { value: closingYm },
            [INVOICE_FIELDS.closingDate]: { value: closingDate },
            [INVOICE_FIELDS.billingFrom]: { value: billingFrom },
            [INVOICE_FIELDS.billingTo]: { value: billingTo },
            [INVOICE_FIELDS.detailTable]: InvoiceCreate.toInvoiceDetailFieldValue(details),
            [INVOICE_FIELDS.itemCount]: { value: summary.item_count },
            [INVOICE_FIELDS.qtyTotal]: { value: summary.qty_total },
            [INVOICE_FIELDS.subtotal]: { value: summary.subtotal },
            [INVOICE_FIELDS.tax]: { value: summary.tax },
            [INVOICE_FIELDS.total]: { value: total },
            [INVOICE_FIELDS.invoiceAmount]: { value: total },
            [INVOICE_FIELDS.invoiceStatus]: { value: INVOICE_STATUS_CREATING },
            [INVOICE_FIELDS.invoiceDate]: { value: invoiceDate },
            [INVOICE_FIELDS.invoiceNo]: { value: invoiceNo },
            [INVOICE_FIELDS.dueDate]: { value: dueDate },
            [INVOICE_FIELDS.carryOver]: { value: carryOver },
            [INVOICE_FIELDS.paymentAmount]: { value: paymentAmount },
            [INVOICE_FIELDS.balance]: { value: balance },
            [INVOICE_FIELDS.paymentStatus]: { value: PAYMENT_STATUS_UNPAID },
            [INVOICE_FIELDS.accountsReceivable]: { value: total },
            [INVOICE_FIELDS.collectionStatus]: { value: COLLECTION_STATUS_UNCOLLECTED },
        };

    };

    /**
     * 請求締年月・締日・請求先コードで未請求の納品書を取得する
     */
    InvoiceCreate.fetchDeliveries = async ({ closingYm, closingDate, customerCode }) => {

        const code = String(customerCode ?? '').trim();

        if (!code) {
            throw new Error('請求先コード（customer_code）を入力してください。');
        }

        const period = InvoiceCreate.resolveClosingPeriod(closingYm, closingDate);

        await InvoiceCreate.validateCustomerClosingDay(code, closingDate);

        const conditions = [
            `${DELIVERY_FIELDS.customerCode} = "${escapeQueryValue(code)}"`,
            `${DELIVERY_FIELDS.invoiceStatus} in ("${DELIVERY_INVOICE_STATUS_UNINVOICED}")`,
        ];

        if (!period.adHoc) {
            conditions.push(
                `${DELIVERY_FIELDS.deliveryDate} >= "${escapeQueryValue(period.periodStart)}"`,
                `${DELIVERY_FIELDS.deliveryDate} <= "${escapeQueryValue(period.periodEnd)}"`
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

        const deliveries = records.filter((record) => isImportableDelivery(record));

        assertDeliveriesImportable(deliveries);

        if (period.singleDelivery && deliveries.length > 1) {
            return [deliveries[0]];
        }

        return deliveries;

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

    InvoiceCreate.buildInvoiceData = async ({ closingYm, closingDate, customerCode }) => {

        const period = InvoiceCreate.resolveClosingPeriod(closingYm, closingDate);
        const customer = await InvoiceCreate.validateCustomerClosingDay(customerCode, closingDate);
        const deliveries = await InvoiceCreate.fetchDeliveries({
            closingYm: period.closingYm,
            closingDate,
            customerCode,
        });

        const periodLabel = period.adHoc
            ? `${period.executionLabel}（納品書1件）`
            : `${period.periodStart} ～ ${period.periodEnd}`;

        if (deliveries.length === 0) {
            throw new Error(`対象の未請求納品書が見つかりません。（${periodLabel}）`);
        }

        const { details, deliveryRecordIds, deliveryNos } = InvoiceCreate.buildInvoiceDetails(deliveries);
        const summary = InvoiceCreate.calculateSummary(details);

        if (details.length === 0) {
            throw new Error('請求対象の明細がありません。');
        }

        return {
            header: {
                closing_date: closingDate,
                closing_ym: period.closingYm,
                customer_code: customerCode,
                customer_name: customer.customer_name,
                billing_from: period.periodStart,
                billing_to: period.periodEnd,
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
    InvoiceCreate.importUninvoicedData = async ({
        customerCode,
        closingYm,
        closingDate,
        billingFrom,
        billingTo,
    }) => {

        let from = String(billingFrom ?? '').trim();
        let to = String(billingTo ?? '').trim();
        let singleDelivery = false;
        let periodLabel = '';
        let customerName = '';

        if (closingYm && closingDate) {

            const period = InvoiceCreate.resolveClosingPeriod(closingYm, closingDate);
            const customer = await InvoiceCreate.validateCustomerClosingDay(customerCode, closingDate);

            customerName = customer.customer_name;
            singleDelivery = period.singleDelivery;
            from = period.periodStart || '';
            to = period.periodEnd || '';
            periodLabel = period.adHoc
                ? `${period.executionLabel}（納品書1件）`
                : `${period.periodStart} ～ ${period.periodEnd}`;

        } else {

            if (!from || !to) {
                throw new Error('請求締年月・締日、または billing_from / billing_to を入力してください。');
            }

            periodLabel = `${from} ～ ${to}`;

        }

        const deliveries = await InvoiceCreate.fetchUninvoicedDeliveries({
            customerCode,
            billingFrom: from,
            billingTo: to,
            singleDelivery,
        });

        const { details, deliveryRecordIds, deliveryNos } = InvoiceCreate.buildInvoiceDetails(deliveries);
        const summary = InvoiceCreate.calculateSummary(details);

        if (deliveries.length === 0 || details.length === 0) {
            throw new Error(NO_DATA_MESSAGE);
        }

        if (!customerName) {
            customerName = getFieldValue(deliveries[0], DELIVERY_FIELDS.customerName);
        }

        console.log('[AYANAS Invoice] 未請求データ取込');
        console.log('取得件数:', summary.item_count);
        console.log('subtotal:', summary.subtotal);
        console.log('tax:', summary.tax);
        console.log('total:', summary.total);

        return {
            header: {
                customer_code: customerCode,
                customer_name: customerName,
                closing_ym: closingYm || '',
                closing_date: closingDate || '',
                billing_from: from,
                billing_to: to,
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
     * 請求番号が既に使用されているか確認する
     * @param {string} invoiceNo
     * @param {number|null} excludeRecordId - 編集時に自身のレコードを除外
     */
    InvoiceCreate.isInvoiceNoTaken = async (invoiceNo, excludeRecordId = null) => {

        const normalized = String(invoiceNo ?? '').trim();

        if (!normalized) {
            return false;
        }

        const query = `${INVOICE_FIELDS.invoiceNo} = "${escapeQueryValue(normalized)}" limit 1`;
        const response = await kintoneApi(
            kintone.api.url('/k/v1/records', true),
            'GET',
            {
                app: INVOICE_APP_ID,
                query,
                fields: ['$id', INVOICE_FIELDS.invoiceNo],
            }
        );

        if (response.records.length === 0) {
            return false;
        }

        if (excludeRecordId === null || excludeRecordId === undefined || excludeRecordId === '') {
            return true;
        }

        const excludeId = Number(excludeRecordId);

        return response.records.some((record) => Number(record.$id?.value) !== excludeId);

    };

    /**
     * 同一 YYMM  prefix の請求番号から最大連番を取得する
     */
    InvoiceCreate.fetchMaxInvoiceNoSequence = async (prefix) => {

        let maxSequence = 0;
        const limit = 500;
        let offset = 0;

        while (true) {

            const query = [
                `${INVOICE_FIELDS.invoiceNo} like "${escapeQueryValue(prefix)}-%"`,
                'order by invoice_no desc',
                `limit ${limit} offset ${offset}`,
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

            response.records.forEach((record) => {

                const invoiceNo = getFieldValue(record, INVOICE_FIELDS.invoiceNo);
                const sequence = parseInvoiceNoSequence(invoiceNo, prefix);

                if (sequence > maxSequence) {
                    maxSequence = sequence;
                }

            });

            if (response.records.length < limit) {
                break;
            }

            offset += limit;

        }

        return maxSequence;

    };

    /**
     * 請求番号を YYMM-001 形式で採番する
     * @param {string} invoiceDate - YYYY-MM-DD
     */
    InvoiceCreate.generateNextInvoiceNo = async (invoiceDate) => {

        const prefix = formatInvoiceNoPrefix(invoiceDate);
        const maxSequence = await InvoiceCreate.fetchMaxInvoiceNoSequence(prefix);

        return `${prefix}-${pad3(maxSequence + 1)}`;

    };

    const INVOICE_NO_MAX_RETRY = 10;

    /**
     * 重複確認付きで請求番号を採番する（保存直前の再採番用）
     */
    InvoiceCreate.generateUniqueInvoiceNo = async (invoiceDate, excludeRecordId = null) => {

        for (let attempt = 0; attempt < INVOICE_NO_MAX_RETRY; attempt += 1) {

            const invoiceNo = await InvoiceCreate.generateNextInvoiceNo(invoiceDate);
            const taken = await InvoiceCreate.isInvoiceNoTaken(invoiceNo, excludeRecordId);

            if (!taken) {
                return invoiceNo;
            }

        }

        throw new Error('請求番号の採番に失敗しました。再度保存してください。');

    };

    /**
     * 保存時に請求番号を自動採番する
     * - 新規: 常に採番（重複時は再採番）
     * - 編集: 既存番号がある場合は維持
     */
    InvoiceCreate.assignInvoiceNoForSave = async ({ record, recordId = null, isCreate = false }) => {

        const invoiceDate = String(getFieldValue(record, INVOICE_FIELDS.invoiceDate) ?? '').trim();
        const existingNo = String(getFieldValue(record, INVOICE_FIELDS.invoiceNo) ?? '').trim();

        if (!isCreate && existingNo) {
            return existingNo;
        }

        if (!invoiceDate) {
            throw new Error('請求日（invoice_date）を入力してください。');
        }

        if (!isCreate && !existingNo) {
            return InvoiceCreate.generateUniqueInvoiceNo(invoiceDate, recordId);
        }

        if (isCreate && existingNo) {
            const taken = await InvoiceCreate.isInvoiceNoTaken(existingNo, recordId);

            if (!taken) {
                return existingNo;
            }
        }

        return InvoiceCreate.generateUniqueInvoiceNo(invoiceDate, recordId);

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

    const parseInvoiceDate = (invoiceDate) => {

        const normalized = String(invoiceDate ?? '').trim();
        const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

        if (!match) {
            throw new Error('請求日（invoice_date）の形式が不正です。');
        }

        return {
            year: Number(match[1]),
            month: Number(match[2]),
            day: Number(match[3]),
        };

    };

    /**
     * 請求日と支払条件から支払期限（due_date）を算出する
     * @param {string} invoiceDate - YYYY-MM-DD
     * @param {string} paymentTerms - 顧客管理 payment_terms
     */
    InvoiceCreate.calculateDueDate = (invoiceDate, paymentTerms) => {

        const { year, month, day } = parseInvoiceDate(invoiceDate);
        const label = String(paymentTerms ?? '').trim();

        if (!label) {
            throw new Error('支払条件（payment_terms）が未設定です。');
        }

        switch (label) {
            case '当月末払い':
                return formatDate(year, month, getLastDayOfMonth(year, month));
            case '翌月10日払い': {
                const next = shiftMonth(year, month, 1);
                return formatDate(next.year, next.month, clampDayToMonth(next.year, next.month, 10));
            }
            case '翌月15日払い': {
                const next = shiftMonth(year, month, 1);
                return formatDate(next.year, next.month, clampDayToMonth(next.year, next.month, 15));
            }
            case '翌月20日払い': {
                const next = shiftMonth(year, month, 1);
                return formatDate(next.year, next.month, clampDayToMonth(next.year, next.month, 20));
            }
            case '翌月25日払い': {
                const next = shiftMonth(year, month, 1);
                return formatDate(next.year, next.month, clampDayToMonth(next.year, next.month, 25));
            }
            case '翌月末払い': {
                const next = shiftMonth(year, month, 1);
                return formatDate(next.year, next.month, getLastDayOfMonth(next.year, next.month));
            }
            case '翌々月10日払い': {
                const nextNext = shiftMonth(year, month, 2);
                return formatDate(nextNext.year, nextNext.month, clampDayToMonth(nextNext.year, nextNext.month, 10));
            }
            case '都度払い':
                return formatDate(year, month, day);
            default:
                throw new Error(
                    `支払条件（payment_terms）が不正です。選択肢: ${PAYMENT_TERMS_LABELS.join(' / ')}`
                );
        }

    };

    /**
     * 請求先コードから顧客の支払条件を取得し due_date を算出する
     */
    InvoiceCreate.resolveDueDateForCustomer = async (customerCode, invoiceDate) => {

        const customer = await InvoiceCreate.fetchCustomerByCode(customerCode);
        const paymentTerms = getFieldValue(customer, CUSTOMER_FIELDS.paymentTerms);

        return InvoiceCreate.calculateDueDate(invoiceDate, paymentTerms);

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

        const customerCode = String(getFieldValue(record, INVOICE_FIELDS.customerCode) ?? '').trim();

        if (!customerCode) {
            throw new Error('請求先コード（customer_code）を入力してください。');
        }

        const carryOver = toNumber(getFieldValue(record, INVOICE_FIELDS.carryOver));
        const paymentAmount = toNumber(getFieldValue(record, INVOICE_FIELDS.paymentAmount));
        const invoiceDate = formatToday();
        const dueDate = await InvoiceCreate.resolveDueDateForCustomer(customerCode, invoiceDate);
        const invoiceAmount = total;
        const balance = InvoiceCreate.calculateBalance(carryOver, invoiceAmount, paymentAmount);
        const closingYm = formatClosingYmFromDate(invoiceDate);

        return {
            [INVOICE_FIELDS.invoiceDate]: invoiceDate,
            [INVOICE_FIELDS.dueDate]: dueDate,
            [INVOICE_FIELDS.invoiceAmount]: invoiceAmount,
            [INVOICE_FIELDS.balance]: balance,
            [INVOICE_FIELDS.invoiceStatus]: INVOICE_STATUS_CREATING,
            [INVOICE_FIELDS.closingYm]: closingYm,
        };

    };

    InvoiceCreate.INVOICE_STATUS_CREATING = INVOICE_STATUS_CREATING;
    InvoiceCreate.INVOICE_STATUS_CONFIRMED = INVOICE_STATUS_CONFIRMED;
    InvoiceCreate.INVOICE_STATUS_CANCELLED = INVOICE_STATUS_CANCELLED;
    InvoiceCreate.INVOICE_COMPLETE_MESSAGE = INVOICE_COMPLETE_MESSAGE;
    InvoiceCreate.INVOICE_CONFIRM_MESSAGE = INVOICE_CONFIRM_MESSAGE;
    InvoiceCreate.INVOICE_CONFIRM_DIALOG = INVOICE_CONFIRM_DIALOG;
    InvoiceCreate.INVOICE_CANCEL_MESSAGE = INVOICE_CANCEL_MESSAGE;
    InvoiceCreate.INVOICE_CANCEL_DIALOG = INVOICE_CANCEL_DIALOG;
    InvoiceCreate.INVOICE_VOID_BLOCKED_ERROR = INVOICE_VOID_BLOCKED_ERROR;
    InvoiceCreate.INVOICED_IMPORT_ERROR = INVOICED_IMPORT_ERROR;
    InvoiceCreate.INVOICE_NO_IMPORT_ERROR = INVOICE_NO_IMPORT_ERROR;
    InvoiceCreate.DELIVERY_INVOICE_STATUS_UNINVOICED = DELIVERY_INVOICE_STATUS_UNINVOICED;
    InvoiceCreate.DELIVERY_INVOICE_STATUS_CREATING = DELIVERY_INVOICE_STATUS_CREATING;
    InvoiceCreate.DELIVERY_INVOICE_STATUS_INVOICED = DELIVERY_INVOICE_STATUS_INVOICED;

    const buildDeliveryConfirmUpdate = (invoiceNo, invoiceDate) => ({
        [DELIVERY_FIELDS.invoiceStatus]: { value: DELIVERY_INVOICE_STATUS_INVOICED },
        [DELIVERY_FIELDS.invoiceNo]: { value: invoiceNo },
        [DELIVERY_FIELDS.invoiceDate]: { value: invoiceDate },
    });

    const buildDeliveryCancelUpdate = () => ({
        [DELIVERY_FIELDS.invoiceStatus]: { value: DELIVERY_INVOICE_STATUS_UNINVOICED },
        [DELIVERY_FIELDS.invoiceNo]: { value: '' },
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
                    fields: [
                        '$id',
                        DELIVERY_FIELDS.deliveryNo,
                        DELIVERY_FIELDS.invoiceStatus,
                        DELIVERY_FIELDS.invoiceNo,
                    ],
                }
            );

            response.records.forEach((record) => {

                const deliveryNo = String(getFieldValue(record, DELIVERY_FIELDS.deliveryNo) ?? '').trim();
                const id = Number(record.$id?.value);

                if (deliveryNo && !Number.isNaN(id)) {
                    deliveryMap.set(deliveryNo, record);
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

    InvoiceCreate.validateDeliveriesForConfirm = (deliveryMap, invoiceNo) => {

        const conflicts = [];

        deliveryMap.forEach((record, deliveryNo) => {

            const status = getDeliveryInvoiceStatus(record);
            const existingNo = String(getFieldValue(record, DELIVERY_FIELDS.invoiceNo) ?? '').trim();

            if (status === DELIVERY_INVOICE_STATUS_INVOICED && existingNo && existingNo !== invoiceNo) {
                conflicts.push(deliveryNo);
            }

        });

        if (conflicts.length > 0) {
            throw new Error(
                `以下の納品書は既に別請求で確定済みです。\n\n${conflicts.join('\n')}`
            );
        }

    };

    const updateDeliveriesByMap = async ({ deliveryMap, updateRecord }) => {

        const failedNos = [];
        const entries = [...deliveryMap.entries()].map(([deliveryNo, record]) => ({
            deliveryNo,
            id: Number(record.$id?.value),
        })).filter(({ id }) => !Number.isNaN(id) && id > 0);
        const chunkSize = 100;

        for (let index = 0; index < entries.length; index += chunkSize) {

            const chunk = entries.slice(index, index + chunkSize);
            const records = chunk.map(({ deliveryNo, id }) => ({
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

    InvoiceCreate.updateDeliveriesOnConfirm = async ({ deliveryMap, invoiceNo, invoiceDate }) => {

        const updateRecord = buildDeliveryConfirmUpdate(invoiceNo, invoiceDate);

        return updateDeliveriesByMap({ deliveryMap, updateRecord });

    };

    InvoiceCreate.updateDeliveriesOnCancel = async ({ deliveryMap }) => {

        const updateRecord = buildDeliveryCancelUpdate();

        return updateDeliveriesByMap({ deliveryMap, updateRecord });

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

    const buildInvoiceVoidUpdate = () => ({
        [INVOICE_FIELDS.detailTable]: InvoiceCreate.toInvoiceDetailFieldValue([]),
        [INVOICE_FIELDS.itemCount]: { value: 0 },
        [INVOICE_FIELDS.qtyTotal]: { value: 0 },
        [INVOICE_FIELDS.subtotal]: { value: 0 },
        [INVOICE_FIELDS.tax]: { value: 0 },
        [INVOICE_FIELDS.total]: { value: 0 },
        [INVOICE_FIELDS.invoiceStatus]: { value: INVOICE_STATUS_CANCELLED },
    });

    InvoiceCreate.buildInvoiceVoidUpdate = buildInvoiceVoidUpdate;

    /**
     * 請求書取消・再発行: 作成中の請求書を取消し、納品書を未請求に戻す
     */
    InvoiceCreate.voidInvoice = async ({ record, recordId }) => {

        const id = Number(recordId);

        if (Number.isNaN(id) || id <= 0) {
            throw new Error('レコード ID を取得できません。保存後に再度お試しください。');
        }

        const invoiceStatus = String(getFieldValue(record, INVOICE_FIELDS.invoiceStatus) ?? '').trim();

        if (invoiceStatus === INVOICE_STATUS_CONFIRMED) {
            throw new Error(INVOICE_VOID_BLOCKED_ERROR);
        }

        if (invoiceStatus !== INVOICE_STATUS_CREATING) {
            throw new Error('作成中の請求書のみ取消できます。');
        }

        const deliveryNos = InvoiceCreate.collectDeliveryNosFromRecord(record);

        if (deliveryNos.length > 0) {

            const { deliveryMap, notFoundNos } = await InvoiceCreate.fetchDeliveryMapByNos(deliveryNos);
            const failedNos = await InvoiceCreate.updateDeliveriesOnCancel({ deliveryMap });
            const errorNos = [...new Set([...notFoundNos, ...failedNos])];

            if (errorNos.length > 0) {
                throw new Error(
                    `以下の納品書を更新できませんでした。\n\n${errorNos.join('\n')}`
                );
            }

        }

        await kintoneApi(
            kintone.api.url('/k/v1/record', true),
            'PUT',
            {
                app: INVOICE_APP_ID,
                id,
                record: buildInvoiceVoidUpdate(),
            }
        );

        return {
            updatedDeliveryCount: deliveryNos.length,
        };

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

        InvoiceCreate.validateDeliveriesForConfirm(deliveryMap, invoiceNo);

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
                    [DELIVERY_FIELDS.invoiceStatus]: { value: DELIVERY_INVOICE_STATUS_INVOICED },
                    [DELIVERY_FIELDS.invoiceNo]: { value: '' },
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

    InvoiceCreate.getCustomerAppId = () => CUSTOMER_APP_ID;

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

    InvoiceCreate.formatToday = formatToday;

    window.InvoiceCreate = InvoiceCreate;

})();
