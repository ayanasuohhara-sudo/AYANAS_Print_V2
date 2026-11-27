(function () {
    'use strict';

    /**
     * 入金管理 App 21（V2）
     * payment_create.js — 充当集計・請求書 App 35 同期
     * PAYMENT_JS_VERSION: 2.0.16
     *
     * グローバル名 PaymentCreateV2（AYANAS Invoice プラグインの PaymentCreate と衝突しない）
     */

    const PAYMENT_JS_VERSION = '2.0.16';

    const PaymentCreateV2 = {};

    const PAYMENT_APP_ID = 21;
    const INVOICE_APP_ID = 35;

    const PAYMENT_FIELDS = {
        paymentNo: 'payment_no',
        paymentDate: 'payment_date',
        paymentMethod: 'payment_method',
        bankName: 'bank_name',
        bankReference: 'bank_reference',
        customerCode: 'customer_code',
        customerName: 'customer_name',
        clientName: 'client_name',
        paymentAmount: 'payment_amount',
        fee: 'fee',
        discountAmount: 'discount_amount',
        writeoffAmount: 'writeoff_amount',
        allocationTotal: 'allocation_total',
        allocationDiff: 'allocation_diff',
        displayLastInvoiceAmount: 'display_last_invoice_amount',
        displayCurrentBalance: 'display_current_balance',
        displayBalanceAfter: 'display_balance_after',
        paymentRecordStatus: 'payment_record_status',
        remarks: 'remarks',
        allocationTable: 'payment_allocation',
    };

    const ALLOCATION_FIELDS = {
        invoiceNo: 'invoice_no',
        invoiceRecordId: 'invoice_record_id',
        invoiceDate: 'invoice_date',
        invoiceAmount: 'invoice_amount',
        billingTargetAmount: 'billing_target_amount',
        paidTotalBefore: 'paid_total_before',
        discountTotalBefore: 'discount_total_before',
        balanceBefore: 'balance_before',
        allocationAmount: 'allocation_amount',
        cashAllocation: 'cash_allocation',
        feeAllocation: 'fee_allocation',
        discountAllocation: 'discount_allocation',
        balanceAfter: 'balance_after',
    };

    const INVOICE_FIELDS = {
        invoiceNo: 'invoice_no',
        invoiceDate: 'invoice_date',
        invoiceStatus: 'invoice_status',
        customerCode: 'customer_code',
        invoiceAmount: 'invoice_amount',
        total: 'total',
        paymentAmount: 'payment_amount',
        discountAmount: 'discount_amount',
        paymentBalance: 'payment_balance',
        paymentStatus: 'payment_status',
        accountsReceivable: 'accounts_receivable',
        collectionStatus: 'collection_status',
        paymentDate: 'payment_date',
        lastPaymentDate: 'last_payment_date',
        balance: 'balance',
        carryOver: 'carry_over',
        lastInvoiceAmount: 'last_invoice_amount',
        displayLastInvoiceAmount: 'display_last_invoice_amount',
    };

    const INVOICE_STATUS_BILLED = '請求済';
    /** 請求書 App 35 の dropdown（AYANAS Invoice: 未請求 / 請求済 / 取消）。「確定」は使わない */
    const INVOICE_STATUS_CANCEL = '取消';
    const INVOICE_STATUS_UNBILLED = '未請求';

    const BILLED_INVOICE_STATUSES = [
        INVOICE_STATUS_BILLED,
    ];

    const PAYMENT_STATUS_UNPAID = '未入金';
    const PAYMENT_STATUS_PARTIAL = '一部入金';
    const PAYMENT_STATUS_PAID = '入金済';

    const COLLECTION_UNCOLLECTED = '未回収';
    const COLLECTION_PARTIAL = '一部回収';
    const COLLECTION_COLLECTED = '回収済';

    const RECORD_STATUS_ACTIVE = '有効';
    const RECORD_STATUS_CANCEL = '取消';

    const toNumber = (value) => {

        if (value === null || value === undefined || value === '') {
            return 0;
        }

        const number = Number(value);

        return Number.isFinite(number) ? number : 0;

    };

    const escapeQueryValue = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const buildQuery = (conditions, options = {}) => {

        const { orderBy = '', limit = null } = options;
        let query = conditions.filter(Boolean).join(' and ');

        if (orderBy) {
            query += ` order by ${orderBy}`;
        }

        if (limit !== null && limit !== undefined) {
            query += ` limit ${limit}`;
        }

        return query;

    };

    const getFieldValue = (record, fieldCode) => {

        const field = record?.[fieldCode];

        if (!field || field.value === null || field.value === undefined) {
            return '';
        }

        return field.value;

    };

    const setNumberField = (record, fieldCode, value) => {

        const text = String(value);

        if (!record[fieldCode]) {
            record[fieldCode] = { type: 'DECIMAL', value: text };
            return;
        }

        record[fieldCode].value = text;

    };

    const fetchAllRecords = async (appId, query, fields) => {

        const all = [];
        let offset = 0;
        const limit = 500;

        while (true) {

            const chunkQuery = `${query} limit ${limit} offset ${offset}`;

            const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
                app: appId,
                query: chunkQuery,
                fields,
            });

            all.push(...response.records);

            if (response.records.length < limit) {
                break;
            }

            offset += limit;

        }

        return all;

    };

    PaymentCreateV2.getPaymentAppId = () => PAYMENT_APP_ID;
    PaymentCreateV2.getInvoiceAppId = () => INVOICE_APP_ID;
    PaymentCreateV2.PAYMENT_FIELDS = PAYMENT_FIELDS;
    PaymentCreateV2.ALLOCATION_FIELDS = ALLOCATION_FIELDS;
    PaymentCreateV2.INVOICE_FIELDS = INVOICE_FIELDS;

    PaymentCreateV2.buildBilledInvoiceStatusCondition = () => {

        const labels = BILLED_INVOICE_STATUSES
            .map((status) => `"${escapeQueryValue(status)}"`)
            .join(', ');

        return `${INVOICE_FIELDS.invoiceStatus} in (${labels})`;

    };

    PaymentCreateV2.getBillingTarget = (invoiceRecord) => {

        const invoiceAmount = toNumber(getFieldValue(invoiceRecord, INVOICE_FIELDS.invoiceAmount));
        const total = toNumber(getFieldValue(invoiceRecord, INVOICE_FIELDS.total));

        if (invoiceAmount !== 0) {
            return invoiceAmount;
        }

        return total;

    };

    PaymentCreateV2.derivePaymentStatus = (settledAmount, billingTarget) => {

        const settled = toNumber(settledAmount);
        const target = toNumber(billingTarget);

        if (target <= 0) {
            return settled > 0 ? PAYMENT_STATUS_PARTIAL : PAYMENT_STATUS_UNPAID;
        }

        if (settled <= 0) {
            return PAYMENT_STATUS_UNPAID;
        }

        if (settled >= target) {
            return PAYMENT_STATUS_PAID;
        }

        return PAYMENT_STATUS_PARTIAL;

    };

    PaymentCreateV2.deriveCollectionStatus = (openBalance, settledAmount) => {

        const open = toNumber(openBalance);
        const settled = toNumber(settledAmount);

        if (open <= 0) {
            return COLLECTION_COLLECTED;
        }

        if (settled > 0) {
            return COLLECTION_PARTIAL;
        }

        return COLLECTION_UNCOLLECTED;

    };

    const emptyTotals = () => ({
        cash: 0,
        fee: 0,
        discount: 0,
        allocation: 0,
    });

    const addRowTotals = (totals, rowValue) => {

        totals.cash += toNumber(rowValue?.[ALLOCATION_FIELDS.cashAllocation]?.value);
        totals.fee += toNumber(rowValue?.[ALLOCATION_FIELDS.feeAllocation]?.value);
        totals.discount += toNumber(rowValue?.[ALLOCATION_FIELDS.discountAllocation]?.value);
        totals.allocation += toNumber(rowValue?.[ALLOCATION_FIELDS.allocationAmount]?.value);

    };

    PaymentCreateV2.aggregateInvoiceFromPayments = (paymentRecords, invoiceNo, excludePaymentRecordId = null) => {

        const totals = emptyTotals();
        const normalizedInvoiceNo = String(invoiceNo ?? '').trim();

        if (!normalizedInvoiceNo) {
            return totals;
        }

        paymentRecords.forEach((paymentRecord) => {

            const paymentId = String(paymentRecord.$id?.value ?? '');

            if (excludePaymentRecordId !== null && paymentId === String(excludePaymentRecordId)) {
                return;
            }

            const status = String(getFieldValue(paymentRecord, PAYMENT_FIELDS.paymentRecordStatus) || RECORD_STATUS_ACTIVE).trim();

            if (status === RECORD_STATUS_CANCEL) {
                return;
            }

            const table = paymentRecord[PAYMENT_FIELDS.allocationTable];
            const rows = Array.isArray(table?.value) ? table.value : [];

            rows.forEach((row) => {

                const rowInvoiceNo = String(row?.value?.[ALLOCATION_FIELDS.invoiceNo]?.value ?? '').trim();

                if (rowInvoiceNo !== normalizedInvoiceNo) {
                    return;
                }

                addRowTotals(totals, row.value);

            });

        });

        return totals;

    };

    PaymentCreateV2.fetchAllActivePaymentRecords = async () => {

        const fields = [
            '$id',
            PAYMENT_FIELDS.paymentDate,
            PAYMENT_FIELDS.paymentRecordStatus,
            PAYMENT_FIELDS.customerCode,
            PAYMENT_FIELDS.allocationTable,
        ];

        return fetchAllRecords(PAYMENT_APP_ID, 'order by レコード番号 asc', fields);

    };

    PaymentCreateV2.fetchInvoiceRecordByNo = async (invoiceNo) => {

        const normalized = String(invoiceNo ?? '').trim();

        if (!normalized) {
            return null;
        }

        const query = `${INVOICE_FIELDS.invoiceNo} = "${escapeQueryValue(normalized)}" limit 1`;
        const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
            app: INVOICE_APP_ID,
            query,
            fields: [
                '$id',
                INVOICE_FIELDS.invoiceNo,
                INVOICE_FIELDS.invoiceDate,
                INVOICE_FIELDS.invoiceStatus,
                INVOICE_FIELDS.customerCode,
                INVOICE_FIELDS.invoiceAmount,
                INVOICE_FIELDS.total,
                INVOICE_FIELDS.carryOver,
            ],
        });

        return response.records[0] ?? null;

    };

    PaymentCreateV2.fetchBilledInvoicesForCustomer = async (customerCode) => {

        const code = String(customerCode ?? '').trim();

        if (!code) {
            return [];
        }

        const query = buildQuery([
            `${INVOICE_FIELDS.customerCode} = "${escapeQueryValue(code)}"`,
            PaymentCreateV2.buildBilledInvoiceStatusCondition(),
        ], {
            orderBy: 'invoice_date asc, invoice_no asc',
        });

        const fields = [
            '$id',
            INVOICE_FIELDS.invoiceNo,
            INVOICE_FIELDS.invoiceDate,
            INVOICE_FIELDS.invoiceAmount,
            INVOICE_FIELDS.total,
            INVOICE_FIELDS.paymentAmount,
            INVOICE_FIELDS.discountAmount,
            INVOICE_FIELDS.paymentStatus,
        ];

        return fetchAllRecords(INVOICE_APP_ID, query, fields);

    };

    PaymentCreateV2.computeInvoiceOpenBalance = (invoiceRecord, paymentRecords, excludePaymentRecordId = null) => {

        const invoiceNo = String(getFieldValue(invoiceRecord, INVOICE_FIELDS.invoiceNo)).trim();
        const target = PaymentCreateV2.getBillingTarget(invoiceRecord);
        const totals = PaymentCreateV2.aggregateInvoiceFromPayments(
            paymentRecords,
            invoiceNo,
            excludePaymentRecordId
        );
        const settled = totals.cash + totals.fee + totals.discount;

        return Math.max(target - settled, 0);

    };

    PaymentCreateV2.fetchOpenInvoicesForCustomer = async (customerCode, excludePaymentRecordId = null) => {

        const billed = await PaymentCreateV2.fetchBilledInvoicesForCustomer(customerCode);
        const paymentRecords = await PaymentCreateV2.fetchAllActivePaymentRecords();

        return billed.filter((invoiceRecord) => {

            const open = PaymentCreateV2.computeInvoiceOpenBalance(
                invoiceRecord,
                paymentRecords,
                excludePaymentRecordId
            );

            if (open > 0.0001) {
                return true;
            }

            const status = String(getFieldValue(invoiceRecord, INVOICE_FIELDS.paymentStatus)).trim();

            return status === PAYMENT_STATUS_UNPAID || status === PAYMENT_STATUS_PARTIAL || status === '';

        });

    };

    PaymentCreateV2.fetchLastBilledInvoiceForCustomer = async (customerCode, excludeInvoiceNo = '') => {

        const code = String(customerCode ?? '').trim();
        const exclude = String(excludeInvoiceNo ?? '').trim();

        if (!code) {
            return null;
        }

        const query = buildQuery([
            `${INVOICE_FIELDS.customerCode} = "${escapeQueryValue(code)}"`,
            PaymentCreateV2.buildBilledInvoiceStatusCondition(),
        ], {
            orderBy: 'invoice_date desc, invoice_no desc',
            limit: 20,
        });

        const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
            app: INVOICE_APP_ID,
            query,
            fields: [
                INVOICE_FIELDS.invoiceNo,
                INVOICE_FIELDS.invoiceDate,
                INVOICE_FIELDS.invoiceAmount,
                INVOICE_FIELDS.total,
            ],
        });

        const records = response.records ?? [];

        if (!exclude) {
            return records[0] ?? null;
        }

        return records.find((invoiceRecord) => (
            String(getFieldValue(invoiceRecord, INVOICE_FIELDS.invoiceNo)).trim() !== exclude
        )) ?? null;

    };

    /**
     * 前回請求額（App21 display_last_invoice_amount と同義）=
     * 請求済の最新1件の回収対象額。見つからない場合は App21 入金の表示値を参照。
     */
    PaymentCreateV2.fetchDisplayLastInvoiceAmountFromLatestPayment = async (customerCode) => {

        const code = String(customerCode ?? '').trim();

        if (!code) {
            return 0;
        }

        const query = buildQuery([
            `${PAYMENT_FIELDS.customerCode} = "${escapeQueryValue(code)}"`,
        ], {
            orderBy: 'payment_date desc, レコード番号 desc',
            limit: 30,
        });

        const records = await fetchAllRecords(PAYMENT_APP_ID, query, [
            PAYMENT_FIELDS.paymentDate,
            PAYMENT_FIELDS.paymentRecordStatus,
            PAYMENT_FIELDS.displayLastInvoiceAmount,
        ]);

        for (const paymentRecord of records) {

            const status = String(
                getFieldValue(paymentRecord, PAYMENT_FIELDS.paymentRecordStatus) || RECORD_STATUS_ACTIVE
            ).trim();

            if (status === RECORD_STATUS_CANCEL) {
                continue;
            }

            const amount = toNumber(getFieldValue(paymentRecord, PAYMENT_FIELDS.displayLastInvoiceAmount));

            if (amount > 0) {
                return amount;
            }

        }

        return 0;

    };

    PaymentCreateV2.resolveDisplayLastInvoiceAmount = async (customerCode, excludeInvoiceNo = '') => {

        const code = String(customerCode ?? '').trim();
        const exclude = String(excludeInvoiceNo ?? '').trim();

        if (!code) {
            return 0;
        }

        const lastBilled = await PaymentCreateV2.fetchLastBilledInvoiceForCustomer(code, exclude);

        if (lastBilled) {
            return PaymentCreateV2.getBillingTarget(lastBilled);
        }

        const fromPayment = await PaymentCreateV2.fetchDisplayLastInvoiceAmountFromLatestPayment(code);

        if (fromPayment > 0) {
            return fromPayment;
        }

        if (exclude) {

            const latestAny = await PaymentCreateV2.fetchLastBilledInvoiceForCustomer(code, '');

            if (latestAny) {
                return PaymentCreateV2.getBillingTarget(latestAny);
            }

        }

        return 0;

    };

    const sumSettledFromTotals = (totals) => (
        toNumber(totals.cash) + toNumber(totals.fee) + toNumber(totals.discount)
    );

    /**
     * 請求書再作成・取込時に App35 ヘッダーへ反映する残高・入金・前回請求を App21/35 から再集計する。
     * @param {string} customerCode
     * @param {{ excludeInvoiceNo?: string }} options 編集中の請求番号（自分自身を除外）
     */
    PaymentCreateV2.computeInvoiceHeaderRefresh = async (customerCode, options = {}) => {

        const code = String(customerCode ?? '').trim();
        const excludeInvoiceNo = String(options.excludeInvoiceNo ?? '').trim();
        const empty = {
            displayLastInvoiceAmount: 0,
            lastInvoiceAmount: 0,
            priorPaymentTotal: 0,
            paymentOnLastInvoice: 0,
            carryOverNet: 0,
        };

        if (!code) {
            return empty;
        }

        const [billedInvoices, paymentRecords, lastInvoice] = await Promise.all([
            PaymentCreateV2.fetchBilledInvoicesForCustomer(code),
            PaymentCreateV2.fetchAllActivePaymentRecords(),
            PaymentCreateV2.fetchLastBilledInvoiceForCustomer(code, excludeInvoiceNo),
        ]);

        let priorPaymentTotal = 0;
        let carryOverNet = 0;

        billedInvoices.forEach((invoiceRecord) => {

            const invoiceNo = String(getFieldValue(invoiceRecord, INVOICE_FIELDS.invoiceNo)).trim();

            if (excludeInvoiceNo && invoiceNo === excludeInvoiceNo) {
                return;
            }

            const totals = PaymentCreateV2.aggregateInvoiceFromPayments(
                paymentRecords,
                invoiceNo,
                null
            );

            priorPaymentTotal += sumSettledFromTotals(totals);
            carryOverNet += PaymentCreateV2.computeInvoiceOpenBalance(
                invoiceRecord,
                paymentRecords,
                null
            );

        });

        let paymentOnLastInvoice = 0;
        let lastInvoiceForPayment = lastInvoice;

        const displayLastInvoiceAmount = await PaymentCreateV2.resolveDisplayLastInvoiceAmount(
            code,
            excludeInvoiceNo
        );

        if (!lastInvoiceForPayment && displayLastInvoiceAmount > 0) {
            lastInvoiceForPayment = await PaymentCreateV2.fetchLastBilledInvoiceForCustomer(code, excludeInvoiceNo)
                ?? await PaymentCreateV2.fetchLastBilledInvoiceForCustomer(code, '');
        }

        const lastInvoiceNo = lastInvoiceForPayment
            ? String(getFieldValue(lastInvoiceForPayment, INVOICE_FIELDS.invoiceNo)).trim()
            : '';

        if (lastInvoiceNo) {

            const totals = PaymentCreateV2.aggregateInvoiceFromPayments(
                paymentRecords,
                lastInvoiceNo,
                null
            );

            paymentOnLastInvoice = sumSettledFromTotals(totals);

        }

        return {
            displayLastInvoiceAmount,
            lastInvoiceAmount: displayLastInvoiceAmount,
            priorPaymentTotal,
            paymentOnLastInvoice,
            carryOverNet,
        };

    };

    /** 請求後残高 = 前回請求残高 − 今回入金額 ＋ 今回請求額 */
    PaymentCreateV2.calculateInvoiceHeaderBalance = (carryOver, invoiceAmount, paymentAmount) => (
        toNumber(carryOver) - toNumber(paymentAmount) + toNumber(invoiceAmount)
    );

    /**
     * computeInvoiceHeaderRefresh の結果を請求書レコードへ反映。
     * carry_over … 直前「請求済」の税込請求額（印刷の前回請求額）
     * payment_amount … その請求への入金充当合計
     * balance … 前回請求残高 − 今回入金額 ＋ 今回請求額（kintone 計算式と同じ）
     */
    PaymentCreateV2.applyInvoiceHeaderRefreshToRecord = (record, refresh) => {

        const invoiceAmount = PaymentCreateV2.getBillingTarget(record);
        const displayAmount = toNumber(
            refresh?.displayLastInvoiceAmount ?? refresh?.lastInvoiceAmount
        );
        const carry = displayAmount;
        const paymentTotal = toNumber(refresh?.paymentOnLastInvoice);
        const balance = PaymentCreateV2.calculateInvoiceHeaderBalance(
            carry,
            invoiceAmount,
            paymentTotal
        );

        setNumberField(record, INVOICE_FIELDS.carryOver, carry);
        setNumberField(record, INVOICE_FIELDS.paymentAmount, paymentTotal);

        if (record[INVOICE_FIELDS.displayLastInvoiceAmount]) {
            setNumberField(record, INVOICE_FIELDS.displayLastInvoiceAmount, displayAmount);
        }

        if (record[INVOICE_FIELDS.lastInvoiceAmount]) {
            setNumberField(record, INVOICE_FIELDS.lastInvoiceAmount, displayAmount);
        }

        if (record[INVOICE_FIELDS.balance]) {
            setNumberField(record, INVOICE_FIELDS.balance, balance);
        }

        return {
            carryOver: carry,
            paymentAmount: paymentTotal,
            displayLastInvoiceAmount: displayAmount,
            lastInvoiceAmount: displayAmount,
            carryOverNet: toNumber(refresh?.carryOverNet),
            balance,
        };

    };

    PaymentCreateV2.refreshInvoiceHeaderFromPayments = async (record, options = {}) => {

        const customerCode = String(getFieldValue(record, INVOICE_FIELDS.customerCode)).trim();
        const excludeInvoiceNo = String(
            options.excludeInvoiceNo
            ?? getFieldValue(record, INVOICE_FIELDS.invoiceNo)
            ?? ''
        ).trim();

        const refresh = await PaymentCreateV2.computeInvoiceHeaderRefresh(customerCode, {
            excludeInvoiceNo,
        });

        return PaymentCreateV2.applyInvoiceHeaderRefreshToRecord(record, refresh);

    };

    PaymentCreateV2.computeWriteoffAmount = (record) => (
        toNumber(getFieldValue(record, PAYMENT_FIELDS.paymentAmount))
        + toNumber(getFieldValue(record, PAYMENT_FIELDS.fee))
        + toNumber(getFieldValue(record, PAYMENT_FIELDS.discountAmount))
    );

    PaymentCreateV2.sumAllocationAmount = (record) => {

        const table = record[PAYMENT_FIELDS.allocationTable];
        const rows = Array.isArray(table?.value) ? table.value : [];
        let sum = 0;

        rows.forEach((row) => {

            const invoiceNo = String(row?.value?.[ALLOCATION_FIELDS.invoiceNo]?.value ?? '').trim();
            const amount = toNumber(row?.value?.[ALLOCATION_FIELDS.allocationAmount]?.value);

            if (!invoiceNo || amount === 0) {
                return;
            }

            sum += amount;

        });

        return sum;

    };

    PaymentCreateV2.splitWriteoffToRows = (record) => {

        let cashPool = toNumber(getFieldValue(record, PAYMENT_FIELDS.paymentAmount));
        let feePool = toNumber(getFieldValue(record, PAYMENT_FIELDS.fee));
        let discountPool = toNumber(getFieldValue(record, PAYMENT_FIELDS.discountAmount));

        const table = record[PAYMENT_FIELDS.allocationTable];
        const rows = Array.isArray(table?.value) ? table.value : [];

        rows.forEach((row) => {

            const rowValue = row.value ?? {};
            let remaining = toNumber(rowValue[ALLOCATION_FIELDS.allocationAmount]?.value);

            const cash = Math.min(Math.max(remaining, 0), cashPool);
            remaining -= cash;
            cashPool -= cash;

            const feePart = Math.min(Math.max(remaining, 0), feePool);
            remaining -= feePart;
            feePool -= feePart;

            const discountPart = Math.min(Math.max(remaining, 0), discountPool);
            remaining -= discountPart;
            discountPool -= discountPart;

            rowValue[ALLOCATION_FIELDS.cashAllocation] = { type: 'NUMBER', value: String(cash) };
            rowValue[ALLOCATION_FIELDS.feeAllocation] = { type: 'NUMBER', value: String(feePart) };
            rowValue[ALLOCATION_FIELDS.discountAllocation] = { type: 'NUMBER', value: String(discountPart) };

            const balanceBefore = toNumber(rowValue[ALLOCATION_FIELDS.balanceBefore]?.value);
            const allocation = toNumber(rowValue[ALLOCATION_FIELDS.allocationAmount]?.value);

            rowValue[ALLOCATION_FIELDS.balanceAfter] = {
                type: 'NUMBER',
                value: String(Math.max(balanceBefore - allocation, 0)),
            };

        });

    };

    PaymentCreateV2.applyHeaderCalculations = (record) => {

        const writeoff = PaymentCreateV2.computeWriteoffAmount(record);
        const allocationTotal = PaymentCreateV2.sumAllocationAmount(record);
        const diff = writeoff - allocationTotal;
        const currentBalance = toNumber(getFieldValue(record, PAYMENT_FIELDS.displayCurrentBalance));

        setNumberField(record, PAYMENT_FIELDS.writeoffAmount, writeoff);
        setNumberField(record, PAYMENT_FIELDS.allocationTotal, allocationTotal);
        setNumberField(record, PAYMENT_FIELDS.allocationDiff, diff);
        setNumberField(record, PAYMENT_FIELDS.displayBalanceAfter, Math.max(currentBalance - writeoff, 0));

    };

    PaymentCreateV2.refreshRowSnapshots = async (record, excludePaymentRecordId = null) => {

        const paymentRecords = await PaymentCreateV2.fetchAllActivePaymentRecords();
        const table = record[PAYMENT_FIELDS.allocationTable];
        const rows = Array.isArray(table?.value) ? table.value : [];

        for (let index = 0; index < rows.length; index += 1) {

            const row = rows[index];
            const rowValue = row.value ?? {};
            const invoiceNo = String(rowValue[ALLOCATION_FIELDS.invoiceNo]?.value ?? '').trim();

            if (!invoiceNo) {
                continue;
            }

            const invoiceRecord = await PaymentCreateV2.fetchInvoiceRecordByNo(invoiceNo);
            const billingTarget = invoiceRecord
                ? PaymentCreateV2.getBillingTarget(invoiceRecord)
                : toNumber(rowValue[ALLOCATION_FIELDS.billingTargetAmount]?.value);

            const totals = PaymentCreateV2.aggregateInvoiceFromPayments(
                paymentRecords,
                invoiceNo,
                excludePaymentRecordId
            );

            const paidCash = totals.cash + totals.fee;
            const paidDiscount = totals.discount;

            rowValue[ALLOCATION_FIELDS.billingTargetAmount] = { type: 'NUMBER', value: String(billingTarget) };
            rowValue[ALLOCATION_FIELDS.paidTotalBefore] = { type: 'NUMBER', value: String(paidCash) };
            rowValue[ALLOCATION_FIELDS.discountTotalBefore] = { type: 'NUMBER', value: String(paidDiscount) };

            const balanceBefore = Math.max(billingTarget - paidCash - paidDiscount, 0);

            rowValue[ALLOCATION_FIELDS.balanceBefore] = { type: 'NUMBER', value: String(balanceBefore) };

            const allocation = toNumber(rowValue[ALLOCATION_FIELDS.allocationAmount]?.value);

            rowValue[ALLOCATION_FIELDS.balanceAfter] = {
                type: 'NUMBER',
                value: String(Math.max(balanceBefore - allocation, 0)),
            };

        }

    };

    PaymentCreateV2.refreshCustomerDisplayAmounts = async (record, excludePaymentRecordId = null) => {

        const customerCode = String(getFieldValue(record, PAYMENT_FIELDS.customerCode)).trim();

        if (!customerCode) {
            setNumberField(record, PAYMENT_FIELDS.displayLastInvoiceAmount, 0);
            setNumberField(record, PAYMENT_FIELDS.displayCurrentBalance, 0);
            setNumberField(record, PAYMENT_FIELDS.displayBalanceAfter, 0);
            return;
        }

        const displayAmount = await PaymentCreateV2.resolveDisplayLastInvoiceAmount(customerCode);

        setNumberField(record, PAYMENT_FIELDS.displayLastInvoiceAmount, displayAmount);

        const paymentRecords = await PaymentCreateV2.fetchAllActivePaymentRecords();
        const billedInvoices = await PaymentCreateV2.fetchBilledInvoicesForCustomer(customerCode);
        let openTotal = 0;

        billedInvoices.forEach((invoiceRecord) => {

            openTotal += PaymentCreateV2.computeInvoiceOpenBalance(
                invoiceRecord,
                paymentRecords,
                excludePaymentRecordId
            );

        });

        setNumberField(record, PAYMENT_FIELDS.displayCurrentBalance, openTotal);
        PaymentCreateV2.applyHeaderCalculations(record);

    };

    PaymentCreateV2.buildAllocationRowFromInvoice = (invoiceRecord, paymentRecords, excludePaymentRecordId) => {

        const invoiceNo = String(getFieldValue(invoiceRecord, INVOICE_FIELDS.invoiceNo)).trim();
        const billingTarget = PaymentCreateV2.getBillingTarget(invoiceRecord);
        const totals = PaymentCreateV2.aggregateInvoiceFromPayments(
            paymentRecords,
            invoiceNo,
            excludePaymentRecordId
        );
        const paidCash = totals.cash + totals.fee;
        const paidDiscount = totals.discount;
        const balanceBefore = Math.max(billingTarget - paidCash - paidDiscount, 0);

        return {
            value: {
                [ALLOCATION_FIELDS.invoiceNo]: {
                    type: 'SINGLE_LINE_TEXT',
                    value: invoiceNo,
                },
                [ALLOCATION_FIELDS.invoiceRecordId]: {
                    type: 'NUMBER',
                    value: String(invoiceRecord.$id.value),
                },
                [ALLOCATION_FIELDS.invoiceDate]: {
                    type: 'DATE',
                    value: getFieldValue(invoiceRecord, INVOICE_FIELDS.invoiceDate) || null,
                },
                [ALLOCATION_FIELDS.invoiceAmount]: {
                    type: 'NUMBER',
                    value: String(billingTarget),
                },
                [ALLOCATION_FIELDS.billingTargetAmount]: {
                    type: 'NUMBER',
                    value: String(billingTarget),
                },
                [ALLOCATION_FIELDS.paidTotalBefore]: {
                    type: 'NUMBER',
                    value: String(paidCash),
                },
                [ALLOCATION_FIELDS.discountTotalBefore]: {
                    type: 'NUMBER',
                    value: String(paidDiscount),
                },
                [ALLOCATION_FIELDS.balanceBefore]: {
                    type: 'NUMBER',
                    value: String(balanceBefore),
                },
                [ALLOCATION_FIELDS.allocationAmount]: {
                    type: 'NUMBER',
                    value: '',
                },
                [ALLOCATION_FIELDS.cashAllocation]: {
                    type: 'NUMBER',
                    value: '0',
                },
                [ALLOCATION_FIELDS.feeAllocation]: {
                    type: 'NUMBER',
                    value: '0',
                },
                [ALLOCATION_FIELDS.discountAllocation]: {
                    type: 'NUMBER',
                    value: '0',
                },
                [ALLOCATION_FIELDS.balanceAfter]: {
                    type: 'NUMBER',
                    value: String(balanceBefore),
                },
            },
        };

    };

    PaymentCreateV2.suggestAllocationAmounts = (record) => {

        let pool = PaymentCreateV2.computeWriteoffAmount(record);
        const table = record[PAYMENT_FIELDS.allocationTable];
        const rows = Array.isArray(table?.value) ? table.value : [];

        rows.forEach((row) => {

            const rowValue = row.value ?? {};
            const balanceBefore = toNumber(rowValue[ALLOCATION_FIELDS.balanceBefore]?.value);

            if (pool <= 0 || balanceBefore <= 0) {
                rowValue[ALLOCATION_FIELDS.allocationAmount] = { type: 'NUMBER', value: '0' };
                return;
            }

            const alloc = Math.min(balanceBefore, pool);

            pool -= alloc;
            rowValue[ALLOCATION_FIELDS.allocationAmount] = { type: 'NUMBER', value: String(alloc) };

        });

    };

    /**
     * 今回充当額が未入力（合計0）で今回消込額があるとき、明細へ充当案を入れる。
     * ユーザーが既に充当額を入れている場合は何もしない。
     */
    /**
     * 今回消込額（入金＋手数料＋値引き）と充当額合計を一致させる。
     * 手数料だけ後から載った場合など、部分充当が残っているときも再按分する。
     */
    PaymentCreateV2.syncAllocationAmountsWithWriteoff = (record) => {

        const writeoff = PaymentCreateV2.computeWriteoffAmount(record);

        if (writeoff <= 0) {
            return false;
        }

        const allocationTotal = PaymentCreateV2.sumAllocationAmount(record);
        const needsResuggest = Math.abs(writeoff - allocationTotal) > 0.0001;

        if (needsResuggest) {
            PaymentCreateV2.suggestAllocationAmounts(record);
        }

        PaymentCreateV2.splitWriteoffToRows(record);
        PaymentCreateV2.applyHeaderCalculations(record);

        return needsResuggest;

    };

    PaymentCreateV2.autoFillAllocationIfEmpty = (record) => {

        const writeoff = PaymentCreateV2.computeWriteoffAmount(record);

        if (writeoff <= 0) {
            return false;
        }

        if (PaymentCreateV2.sumAllocationAmount(record) > 0) {
            return PaymentCreateV2.syncAllocationAmountsWithWriteoff(record);
        }

        const table = record[PAYMENT_FIELDS.allocationTable];
        const rows = Array.isArray(table?.value) ? table.value : [];

        const hasOpenRow = rows.some((row) => {

            const rowValue = row?.value ?? {};
            const invoiceNo = String(rowValue[ALLOCATION_FIELDS.invoiceNo]?.value ?? '').trim();
            const balanceBefore = toNumber(rowValue[ALLOCATION_FIELDS.balanceBefore]?.value);

            return invoiceNo !== '' && balanceBefore > 0;

        });

        if (!hasOpenRow) {
            return false;
        }

        PaymentCreateV2.suggestAllocationAmounts(record);

        return true;

    };

    PaymentCreateV2.removeZeroAllocationRows = (record) => {

        const table = record[PAYMENT_FIELDS.allocationTable];

        if (!table || !Array.isArray(table.value)) {
            return;
        }

        table.value = table.value.filter((row) => {

            const invoiceNo = String(row?.value?.[ALLOCATION_FIELDS.invoiceNo]?.value ?? '').trim();
            const amount = toNumber(row?.value?.[ALLOCATION_FIELDS.allocationAmount]?.value);

            return invoiceNo !== '' && amount !== 0;

        });

    };

    PaymentCreateV2.validateRecord = (record) => {

        const errors = [];
        const customerCode = String(getFieldValue(record, PAYMENT_FIELDS.customerCode)).trim();
        const paymentDate = getFieldValue(record, PAYMENT_FIELDS.paymentDate);

        if (!customerCode) {
            errors.push('取引先コードを選択してください。');
        }

        if (!paymentDate) {
            errors.push('入金日を入力してください。');
        }

        const writeoff = PaymentCreateV2.computeWriteoffAmount(record);
        const allocationTotal = PaymentCreateV2.sumAllocationAmount(record);
        const diff = writeoff - allocationTotal;

        if (writeoff <= 0) {
            errors.push('今回入金額・手数料・値引きの合計（今回消込額）が 0 より大きい必要があります。');
        }

        if (Math.abs(diff) > 0.0001) {
            errors.push(`今回消込額（${writeoff}）と充当額合計（${allocationTotal}）が一致しません。差額: ${diff}`);
        }

        const table = record[PAYMENT_FIELDS.allocationTable];
        const rows = Array.isArray(table?.value) ? table.value : [];
        const invoiceNos = new Set();

        rows.forEach((row, index) => {

            const rowValue = row.value ?? {};
            const invoiceNo = String(rowValue[ALLOCATION_FIELDS.invoiceNo]?.value ?? '').trim();
            const allocation = toNumber(rowValue[ALLOCATION_FIELDS.allocationAmount]?.value);
            const balanceBefore = toNumber(rowValue[ALLOCATION_FIELDS.balanceBefore]?.value);

            if (!invoiceNo) {
                errors.push(`充当明細 ${index + 1} 行目: 請求番号が空です。`);
                return;
            }

            if (invoiceNos.has(invoiceNo)) {
                errors.push(`充当明細: 請求番号 ${invoiceNo} が重複しています。`);
            }

            invoiceNos.add(invoiceNo);

            if (allocation < 0) {
                errors.push(`充当明細 ${index + 1} 行目: 今回充当額がマイナスです。`);
            }

            if (allocation > balanceBefore + 0.0001) {
                errors.push(`充当明細 ${index + 1} 行目: 今回充当額が入金前残高を超えています。`);
            }

        });

        if (invoiceNos.size === 0) {
            errors.push('充当明細に今回充当額が 1 行以上必要です。');
        }

        return errors;

    };

    PaymentCreateV2.collectInvoiceNosFromRecord = (record) => {

        const table = record[PAYMENT_FIELDS.allocationTable];
        const rows = Array.isArray(table?.value) ? table.value : [];
        const set = new Set();

        rows.forEach((row) => {

            const invoiceNo = String(row?.value?.[ALLOCATION_FIELDS.invoiceNo]?.value ?? '').trim();

            if (invoiceNo) {
                set.add(invoiceNo);
            }

        });

        return [...set];

    };

    PaymentCreateV2.findLatestPaymentDateForInvoice = (paymentRecords, invoiceNo) => {

        let latest = '';

        paymentRecords.forEach((paymentRecord) => {

            const status = String(getFieldValue(paymentRecord, PAYMENT_FIELDS.paymentRecordStatus) || RECORD_STATUS_ACTIVE).trim();

            if (status === RECORD_STATUS_CANCEL) {
                return;
            }

            const table = paymentRecord[PAYMENT_FIELDS.allocationTable];
            const rows = Array.isArray(table?.value) ? table.value : [];
            let touches = false;

            rows.forEach((row) => {

                const rowInvoiceNo = String(row?.value?.[ALLOCATION_FIELDS.invoiceNo]?.value ?? '').trim();

                if (rowInvoiceNo === invoiceNo && toNumber(row?.value?.[ALLOCATION_FIELDS.allocationAmount]?.value) > 0) {
                    touches = true;
                }

            });

            if (!touches) {
                return;
            }

            const paymentDate = String(getFieldValue(paymentRecord, PAYMENT_FIELDS.paymentDate) ?? '');

            if (paymentDate > latest) {
                latest = paymentDate;
            }

        });

        return latest || null;

    };

    PaymentCreateV2.syncInvoiceByNo = async (invoiceNo, paymentRecords) => {

        const normalized = String(invoiceNo ?? '').trim();

        if (!normalized) {
            return;
        }

        const invoiceRecord = await PaymentCreateV2.fetchInvoiceRecordByNo(normalized);

        if (!invoiceRecord) {
            return;
        }

        const invoiceStatus = String(getFieldValue(invoiceRecord, INVOICE_FIELDS.invoiceStatus)).trim();

        if (invoiceStatus === INVOICE_STATUS_CANCEL || invoiceStatus === INVOICE_STATUS_UNBILLED) {
            return;
        }

        const billingTarget = PaymentCreateV2.getBillingTarget(invoiceRecord);
        const totals = PaymentCreateV2.aggregateInvoiceFromPayments(paymentRecords, normalized, null);
        const paidCash = totals.cash + totals.fee;
        const paidDiscount = totals.discount;
        const settled = paidCash + paidDiscount;
        const openBalance = Math.max(billingTarget - settled, 0);
        const carryOver = toNumber(getFieldValue(invoiceRecord, INVOICE_FIELDS.carryOver));
        const paymentStatus = PaymentCreateV2.derivePaymentStatus(settled, billingTarget);
        const collectionStatus = PaymentCreateV2.deriveCollectionStatus(openBalance, settled);
        const lastPaymentDate = PaymentCreateV2.findLatestPaymentDateForInvoice(paymentRecords, normalized);

        const recordBody = {
            [INVOICE_FIELDS.paymentAmount]: { value: String(paidCash) },
            [INVOICE_FIELDS.discountAmount]: { value: String(paidDiscount) },
            [INVOICE_FIELDS.paymentStatus]: { value: paymentStatus },
            [INVOICE_FIELDS.paymentBalance]: { value: String(openBalance) },
            [INVOICE_FIELDS.accountsReceivable]: { value: String(openBalance) },
            [INVOICE_FIELDS.collectionStatus]: { value: collectionStatus },
        };

        // balance は App 35 で計算フィールドのため API 更新しない（carryOver 等は kintone 側式）
        void carryOver;

        if (lastPaymentDate) {
            recordBody[INVOICE_FIELDS.paymentDate] = { value: lastPaymentDate };
            recordBody[INVOICE_FIELDS.lastPaymentDate] = { value: lastPaymentDate };
        }

        await kintone.api(kintone.api.url('/k/v1/record', true), 'PUT', {
            app: INVOICE_APP_ID,
            id: invoiceRecord.$id.value,
            record: recordBody,
        });

    };

    PaymentCreateV2.syncInvoicesForPaymentRecord = async (record, extraInvoiceNos = []) => {

        const paymentRecords = await PaymentCreateV2.fetchAllActivePaymentRecords();
        const invoiceNos = new Set([
            ...PaymentCreateV2.collectInvoiceNosFromRecord(record),
            ...extraInvoiceNos.map((no) => String(no ?? '').trim()).filter(Boolean),
        ]);

        for (const invoiceNo of invoiceNos) {
            await PaymentCreateV2.syncInvoiceByNo(invoiceNo, paymentRecords);
        }

    };

    PaymentCreateV2.generatePaymentNo = async (paymentDate) => {

        const date = paymentDate ? new Date(paymentDate) : new Date();
        const yy = String(date.getFullYear()).slice(-2);
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const prefix = `P${yy}${mm}-`;

        const query = `${PAYMENT_FIELDS.paymentNo} like "${escapeQueryValue(prefix)}" order by ${PAYMENT_FIELDS.paymentNo} desc limit 1`;
        const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
            app: PAYMENT_APP_ID,
            query,
            fields: [PAYMENT_FIELDS.paymentNo],
        });

        const last = response.records[0]?.[PAYMENT_FIELDS.paymentNo]?.value ?? '';
        const lastSeq = Number(String(last).slice(prefix.length));

        const nextSeq = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;

        return `${prefix}${String(nextSeq).padStart(3, '0')}`;

    };

    /**
     * REST API POST 用。ルックアップの自動コピーは使わず、キーと JS 計算値のみ送る。
     * （lookup:true はコピー元の「重複禁止」設定が無いと CB 系エラーになるため）
     */
    PaymentCreateV2.buildRestRecordBodyForCreate = (record) => {

        const headerLookupCopyOmit = new Set([
            PAYMENT_FIELDS.customerName,
            PAYMENT_FIELDS.clientName,
        ]);

        const rowLookupCopyOmit = new Set([
            ALLOCATION_FIELDS.invoiceRecordId,
            ALLOCATION_FIELDS.invoiceDate,
            ALLOCATION_FIELDS.invoiceAmount,
            ALLOCATION_FIELDS.billingTargetAmount,
        ]);

        const apiRecord = {};

        Object.entries(record).forEach(([fieldCode, field]) => {

            if (!field || typeof field !== 'object' || fieldCode.startsWith('$')) {
                return;
            }

            if (headerLookupCopyOmit.has(fieldCode)) {
                return;
            }

            if (fieldCode === PAYMENT_FIELDS.allocationTable || field.type === 'SUBTABLE') {

                const rows = Array.isArray(field.value) ? field.value : [];

                apiRecord[fieldCode] = {
                    value: rows.map((row) => {

                        const rowValue = row?.value ?? {};
                        const apiRow = {};

                        Object.entries(rowValue).forEach(([subCode, subField]) => {

                            if (!subField || typeof subField !== 'object' || rowLookupCopyOmit.has(subCode)) {
                                return;
                            }

                            apiRow[subCode] = { value: subField.value ?? '' };

                        });

                        return { value: apiRow };

                    }),
                };

                return;

            }

            apiRecord[fieldCode] = { value: field.value ?? '' };

        });

        return apiRecord;

    };

    PaymentCreateV2.createPaymentRecordViaApi = async (record) => {

        const errors = PaymentCreateV2.validateRecord(record);

        if (errors.length > 0) {
            throw new Error(errors.join('\n'));
        }

        const paymentDate = getFieldValue(record, PAYMENT_FIELDS.paymentDate);

        if (!String(getFieldValue(record, PAYMENT_FIELDS.paymentNo)).trim()) {
            record[PAYMENT_FIELDS.paymentNo] = {
                type: 'SINGLE_LINE_TEXT',
                value: await PaymentCreateV2.generatePaymentNo(paymentDate),
            };
        }

        if (!String(getFieldValue(record, PAYMENT_FIELDS.paymentRecordStatus)).trim()) {
            record[PAYMENT_FIELDS.paymentRecordStatus] = {
                type: 'DROP_DOWN',
                value: RECORD_STATUS_ACTIVE,
            };
        }

        const apiRecord = PaymentCreateV2.buildRestRecordBodyForCreate(record);

        const createResponse = await kintone.api(kintone.api.url('/k/v1/record', true), 'POST', {
            app: PAYMENT_APP_ID,
            record: apiRecord,
        });

        const savedResponse = await kintone.api(kintone.api.url('/k/v1/record', true), 'GET', {
            app: PAYMENT_APP_ID,
            id: createResponse.id,
        });

        await PaymentCreateV2.syncInvoicesForPaymentRecord(savedResponse.record);

        return {
            paymentNo: getFieldValue(savedResponse.record, PAYMENT_FIELDS.paymentNo),
            recordId: createResponse.id,
            record: savedResponse.record,
        };

    };

    PaymentCreateV2.findDuplicateWarning = async (record, recordId = null) => {

        const customerCode = String(getFieldValue(record, PAYMENT_FIELDS.customerCode)).trim();
        const paymentDate = getFieldValue(record, PAYMENT_FIELDS.paymentDate);
        const paymentAmount = toNumber(getFieldValue(record, PAYMENT_FIELDS.paymentAmount));

        if (!customerCode || !paymentDate || paymentAmount <= 0) {
            return null;
        }

        let query = [
            `${PAYMENT_FIELDS.customerCode} = "${escapeQueryValue(customerCode)}"`,
            `${PAYMENT_FIELDS.paymentDate} = "${escapeQueryValue(paymentDate)}"`,
            `${PAYMENT_FIELDS.paymentAmount} = ${paymentAmount}`,
            `${PAYMENT_FIELDS.paymentRecordStatus} in ("${RECORD_STATUS_ACTIVE}")`,
        ].join(' and ');

        if (recordId) {
            query += ` and レコード番号 != ${Number(recordId)}`;
        }

        query += ' limit 5';

        const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
            app: PAYMENT_APP_ID,
            query,
            fields: [PAYMENT_FIELDS.paymentNo, PAYMENT_FIELDS.bankReference],
        });

        if (response.records.length === 0) {
            return null;
        }

        const numbers = response.records
            .map((item) => item[PAYMENT_FIELDS.paymentNo]?.value)
            .filter(Boolean)
            .join(', ');

        return `同一取引先・同一入金日・同一入金額の入金が既にあります（${numbers}）。続けて保存しますか？`;

    };

    PaymentCreateV2.VERSION = PAYMENT_JS_VERSION;

    window.PaymentCreateV2 = PaymentCreateV2;

    console.info(`[PaymentCreateV2] loaded V2 ${PAYMENT_JS_VERSION}`);

}());
