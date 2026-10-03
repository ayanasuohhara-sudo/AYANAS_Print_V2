(function () {
    'use strict';

    /**
     * 売掛管理 — App 35 + App 21 読取集計（PaymentCreateV2 再利用）
     */

    const assertDeps = () => {

        if (typeof PaymentCreateV2 === 'undefined') {
            throw new Error('PaymentCreateV2 が未読込です。payment_create.js を先に登録してください。');
        }

        if (typeof CAYANAS_AR === 'undefined') {
            throw new Error('CAYANAS_AR が未読込です。ar_config.js を先に登録してください。');
        }

    };

    const EPS = () => CAYANAS_AR.OPEN_EPSILON;

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

        return Number.isFinite(number) ? number : 0;

    };

    const escapeQueryValue = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const todayYmdJst = () => (
        new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
    );

    const currentMonthRangeJst = () => {

        const today = todayYmdJst();
        const ym = today.slice(0, 7);
        const start = `${ym}-01`;
        const parts = ym.split('-').map(Number);
        const lastDay = new Date(parts[0], parts[1], 0).getDate();

        return {
            start,
            end: `${ym}-${String(lastDay).padStart(2, '0')}`,
            ym,
        };

    };

    const normalizeYmd = (value) => String(value ?? '').trim().slice(0, 10);

    const diffOverdueDays = (todayYmd, baseYmd) => {

        const base = normalizeYmd(baseYmd);
        const today = normalizeYmd(todayYmd);

        if (!base || !today) {
            return 0;
        }

        if (today <= base) {
            return 0;
        }

        const t = Date.parse(`${today}T00:00:00+09:00`);
        const b = Date.parse(`${base}T00:00:00+09:00`);

        if (Number.isNaN(t) || Number.isNaN(b)) {
            return 0;
        }

        return Math.floor((t - b) / 86400000);

    };

    const resolveDueBaseDate = (invoiceRecord, invoiceFields, extra) => {

        const due = normalizeYmd(getFieldValue(invoiceRecord, extra.paymentDueDate));

        if (due) {
            return due;
        }

        return normalizeYmd(getFieldValue(invoiceRecord, invoiceFields.invoiceDate));

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

    const fetchAllBilledInvoices = async () => {

        const IF = PaymentCreateV2.INVOICE_FIELDS;
        const extra = CAYANAS_AR.INVOICE_EXTRA;
        const query = `${PaymentCreateV2.buildBilledInvoiceStatusCondition()} order by ${IF.customerCode} asc, ${IF.invoiceDate} asc, ${IF.invoiceNo} asc`;
        const fields = [
            '$id',
            IF.invoiceNo,
            IF.invoiceDate,
            IF.invoiceStatus,
            IF.customerCode,
            IF.invoiceAmount,
            IF.total,
            IF.paymentStatus,
            extra.customerName,
            extra.paymentDueDate,
        ];

        return fetchAllRecords(CAYANAS_AR.INVOICE_APP_ID, query, fields);

    };

    const fetchAllPaymentsForAr = async () => {

        const PF = PaymentCreateV2.PAYMENT_FIELDS;
        const query = 'order by レコード番号 asc';
        const fields = [
            '$id',
            PF.paymentDate,
            PF.paymentAmount,
            PF.paymentRecordStatus,
            PF.customerCode,
            PF.allocationTable,
        ];

        return fetchAllRecords(CAYANAS_AR.PAYMENT_APP_ID, query, fields);

    };

    const isActivePayment = (paymentRecord) => {

        const PF = PaymentCreateV2.PAYMENT_FIELDS;
        const status = String(getFieldValue(paymentRecord, PF.paymentRecordStatus) || CAYANAS_AR.PAYMENT_RECORD_STATUS_ACTIVE).trim();

        return status !== CAYANAS_AR.PAYMENT_RECORD_STATUS_CANCEL;

    };

    const buildInvoiceMetrics = (invoiceRecord, paymentRecords, todayYmd) => {

        const IF = PaymentCreateV2.INVOICE_FIELDS;
        const extra = CAYANAS_AR.INVOICE_EXTRA;
        const invoiceNo = String(getFieldValue(invoiceRecord, IF.invoiceNo)).trim();
        const target = PaymentCreateV2.getBillingTarget(invoiceRecord);
        const totals = PaymentCreateV2.aggregateInvoiceFromPayments(paymentRecords, invoiceNo);
        const settled = totals.cash + totals.fee + totals.discount;
        const open = PaymentCreateV2.computeInvoiceOpenBalance(invoiceRecord, paymentRecords);
        const dueBase = resolveDueBaseDate(invoiceRecord, IF, extra);
        const overdueDays = diffOverdueDays(todayYmd, dueBase);
        const paymentStatus = PaymentCreateV2.derivePaymentStatus(settled, target);

        return {
            recordId: String(invoiceRecord.$id?.value ?? ''),
            invoiceNo,
            invoiceDate: normalizeYmd(getFieldValue(invoiceRecord, IF.invoiceDate)),
            customerCode: String(getFieldValue(invoiceRecord, IF.customerCode)).trim(),
            customerName: String(getFieldValue(invoiceRecord, extra.customerName)).trim(),
            billingTarget: target,
            cash: totals.cash,
            fee: totals.fee,
            discount: totals.discount,
            settled,
            open,
            dueBase,
            paymentDueDate: normalizeYmd(getFieldValue(invoiceRecord, extra.paymentDueDate)),
            overdueDays,
            paymentStatus,
            isOpen: open > EPS(),
            isUnpaid: open > EPS() && settled <= EPS(),
            isPartial: open > EPS() && settled > EPS(),
        };

    };

    const buildCustomerRows = (invoiceMetrics, paymentRecords) => {

        const PF = PaymentCreateV2.PAYMENT_FIELDS;
        const byCustomer = new Map();

        invoiceMetrics.forEach((inv) => {

            const code = inv.customerCode;

            if (!code) {
                return;
            }

            if (!byCustomer.has(code)) {
                byCustomer.set(code, {
                    customerCode: code,
                    customerName: inv.customerName,
                    uncollectedBillingTotal: 0,
                    cashTotal: 0,
                    feeTotal: 0,
                    discountTotal: 0,
                    settledTotal: 0,
                    openBalanceTotal: 0,
                    oldestOpenInvoiceDate: '',
                    oldestOpenDueBase: '',
                    oldestOpenOverdueDays: 0,
                    unpaidCount: 0,
                    partialCount: 0,
                    nextPaymentDueDate: '',
                    invoices: [],
                });
            }

            const row = byCustomer.get(code);

            if (!row.customerName && inv.customerName) {
                row.customerName = inv.customerName;
            }

            row.cashTotal += inv.cash;
            row.feeTotal += inv.fee;
            row.discountTotal += inv.discount;
            row.settledTotal += inv.settled;
            row.openBalanceTotal += inv.open;

            if (inv.isOpen) {
                row.uncollectedBillingTotal += inv.billingTarget;
                row.invoices.push(inv);

                if (inv.isUnpaid) {
                    row.unpaidCount += 1;
                }

                if (inv.isPartial) {
                    row.partialCount += 1;
                }

                if (inv.paymentDueDate) {
                    if (!row.nextPaymentDueDate || inv.paymentDueDate < row.nextPaymentDueDate) {
                        row.nextPaymentDueDate = inv.paymentDueDate;
                    }
                }

                if (!row.oldestOpenInvoiceDate || inv.invoiceDate < row.oldestOpenInvoiceDate) {
                    row.oldestOpenInvoiceDate = inv.invoiceDate;
                    row.oldestOpenDueBase = inv.dueBase;
                    row.oldestOpenOverdueDays = inv.overdueDays;
                }
            }

        });

        byCustomer.forEach((row) => {

            row.invoices.sort((a, b) => {

                if (a.invoiceDate !== b.invoiceDate) {
                    return a.invoiceDate < b.invoiceDate ? -1 : 1;
                }

                return a.invoiceNo < b.invoiceNo ? -1 : 1;

            });

            let lastPaymentDate = '';

            paymentRecords.forEach((payment) => {

                if (!isActivePayment(payment)) {
                    return;
                }

                const pCode = String(getFieldValue(payment, PF.customerCode)).trim();

                if (pCode !== row.customerCode) {
                    return;
                }

                const pDate = normalizeYmd(getFieldValue(payment, PF.paymentDate));

                if (pDate && (!lastPaymentDate || pDate > lastPaymentDate)) {
                    lastPaymentDate = pDate;
                }

            });

            row.lastPaymentDate = lastPaymentDate;

        });

        return [...byCustomer.values()].sort((a, b) => {

            if (a.customerCode < b.customerCode) {
                return -1;
            }

            if (a.customerCode > b.customerCode) {
                return 1;
            }

            return 0;

        });

    };

    const allocationTotalsForInvoiceOnPayment = (paymentRecord, invoiceNo) => {

        const PF = PaymentCreateV2.PAYMENT_FIELDS;
        const AF = PaymentCreateV2.ALLOCATION_FIELDS;
        const normalized = String(invoiceNo ?? '').trim();
        const totals = { cash: 0, fee: 0, discount: 0, allocation: 0 };
        const table = paymentRecord[PF.allocationTable];
        const rows = Array.isArray(table?.value) ? table.value : [];

        rows.forEach((row) => {

            const rowInvoiceNo = String(row?.value?.[AF.invoiceNo]?.value ?? '').trim();

            if (rowInvoiceNo !== normalized) {
                return;
            }

            const rowValue = row.value ?? {};

            totals.cash += toNumber(rowValue[AF.cashAllocation]?.value);
            totals.fee += toNumber(rowValue[AF.feeAllocation]?.value);
            totals.discount += toNumber(rowValue[AF.discountAllocation]?.value);
            totals.allocation += toNumber(rowValue[AF.allocationAmount]?.value);

        });

        return totals;

    };

    const buildPaymentHistoryRows = (paymentRecords, invoiceNo) => {

        const PF = PaymentCreateV2.PAYMENT_FIELDS;
        const rows = [];

        paymentRecords.forEach((paymentRecord) => {

            if (!isActivePayment(paymentRecord)) {
                return;
            }

            const alloc = allocationTotalsForInvoiceOnPayment(paymentRecord, invoiceNo);
            const writeoff = alloc.cash + alloc.fee + alloc.discount;

            if (writeoff <= EPS() && alloc.allocation <= EPS()) {
                return;
            }

            rows.push({
                recordId: String(paymentRecord.$id?.value ?? ''),
                paymentDate: normalizeYmd(getFieldValue(paymentRecord, PF.paymentDate)),
                cash: alloc.cash,
                fee: alloc.fee,
                discount: alloc.discount,
                writeoff: writeoff > 0 ? writeoff : alloc.allocation,
                paymentMethod: String(getFieldValue(paymentRecord, PF.paymentMethod) ?? '').trim(),
            });

        });

        rows.sort((a, b) => {

            if (a.paymentDate < b.paymentDate) {
                return -1;
            }

            if (a.paymentDate > b.paymentDate) {
                return 1;
            }

            const idA = Number(a.recordId) || 0;
            const idB = Number(b.recordId) || 0;

            return idA - idB;

        });

        return rows;

    };

    const sumPaymentHistoryRows = (rows) => {

        const totals = { cash: 0, fee: 0, discount: 0, writeoff: 0 };

        rows.forEach((row) => {

            totals.cash += row.cash;
            totals.fee += row.fee;
            totals.discount += row.discount;
            totals.writeoff += row.writeoff;

        });

        return totals;

    };

    const fetchPaymentHistoryForInvoice = async (invoiceNo, customerCode = '') => {

        assertDeps();

        const PF = PaymentCreateV2.PAYMENT_FIELDS;
        const AF = PaymentCreateV2.ALLOCATION_FIELDS;
        const normalized = String(invoiceNo ?? '').trim();

        if (!normalized) {
            return { rows: [], totals: sumPaymentHistoryRows([]) };
        }

        const conditions = [`${PF.allocationTable}.${AF.invoiceNo} = "${escapeQueryValue(normalized)}"`];
        const code = String(customerCode ?? '').trim();

        if (code) {
            conditions.unshift(`${PF.customerCode} = "${escapeQueryValue(code)}"`);
        }

        const query = `${conditions.join(' and ')} order by ${PF.paymentDate} asc, レコード番号 asc`;
        const fields = [
            '$id',
            PF.paymentDate,
            PF.paymentMethod,
            PF.paymentRecordStatus,
            PF.customerCode,
            PF.allocationTable,
        ];

        const paymentRecords = await fetchAllRecords(CAYANAS_AR.PAYMENT_APP_ID, query, fields);
        const rows = buildPaymentHistoryRows(paymentRecords, normalized);

        return {
            rows,
            totals: sumPaymentHistoryRows(rows),
        };

    };

    const buildCompanySummary = (invoiceMetrics, paymentRecords, todayYmd) => {

        const PF = PaymentCreateV2.PAYMENT_FIELDS;
        const month = currentMonthRangeJst();
        let openBalanceTotal = 0;
        let over30 = 0;
        let over60 = 0;
        let over90 = 0;
        let monthScheduled = 0;

        invoiceMetrics.forEach((inv) => {

            openBalanceTotal += inv.open;

            if (inv.open <= EPS()) {
                return;
            }

            if (inv.overdueDays >= 30) {
                over30 += inv.open;
            }

            if (inv.overdueDays >= 60) {
                over60 += inv.open;
            }

            if (inv.overdueDays >= 90) {
                over90 += inv.open;
            }

            const due = inv.paymentDueDate;

            if (due && due >= month.start && due <= month.end) {
                monthScheduled += inv.open;
            }

        });

        let monthCashIn = 0;

        paymentRecords.forEach((payment) => {

            if (!isActivePayment(payment)) {
                return;
            }

            const pDate = normalizeYmd(getFieldValue(payment, PF.paymentDate));

            if (!pDate || pDate < month.start || pDate > month.end) {
                return;
            }

            monthCashIn += toNumber(getFieldValue(payment, PF.paymentAmount));

        });

        return {
            openBalanceTotal,
            over30,
            over60,
            over90,
            monthCashIn,
            monthScheduled,
            monthLabel: month.ym,
            asOfDate: todayYmd,
        };

    };

    const AREngine = {

        buildReport: async () => {

            assertDeps();

            const todayYmd = todayYmdJst();
            const [invoices, payments] = await Promise.all([
                fetchAllBilledInvoices(),
                fetchAllPaymentsForAr(),
            ]);

            const invoiceMetrics = invoices.map((record) => (
                buildInvoiceMetrics(record, payments, todayYmd)
            ));

            const customers = buildCustomerRows(invoiceMetrics, payments);
            const summary = buildCompanySummary(invoiceMetrics, payments, todayYmd);

            return {
                summary,
                customers,
                generatedAt: new Date().toISOString(),
            };

        },

        fetchPaymentHistoryForInvoice,

    };

    window.CAYANAS_AREngine = AREngine;

}());
