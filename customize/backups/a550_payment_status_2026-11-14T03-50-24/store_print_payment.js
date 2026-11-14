(() => {
    'use strict';

    /**
     * 店舗帳票用 — App97 残高照会（表示・集計のみ。更新しない）
     * store_payment_engine.getOrderBalance と同型の税込計算。
     */

    const StorePrintPayment = {};

    const STORE_CUSTOMER_CODE = 'A550';
    const ORDER_APP_ID = 16;
    const PCM_APP_ID = 96;
    const PAYMENT_APP_ID = 97;
    const ID_PATTERN = /^P\d{6}$/;
    const TAX_RATE = 0.1;
    const PAYMENT_STATUS_CANCELLED = '取消';
    const HEADER = {
        paymentStatus: 'payment_status',
        lines: 'store_payment_lines',
        personalCustomerId: 'personal_customer_id',
    };
    const LINE = {
        orderRecordId: 'order_record_id',
        allocatedAmount: 'allocated_amount',
    };
    const PCM_FIELDS = {
        personalCustomerId: 'personal_customer_id',
        customerName: 'customer_name',
        customerKana: 'customer_kana',
        phone: 'phone',
        mobilePhone: 'mobile_phone',
    };

    const escapeQuery = (value) => String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

    const toNumber = (value) => {
        if (value === null || value === undefined || value === '') {
            return 0;
        }
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    };

    const readValue = (record, code) => {
        const field = record && record[code];
        if (!field || field.value === null || field.value === undefined) {
            return '';
        }
        return String(field.value).trim();
    };

    const isValidPersonalCustomerId = (value) => ID_PATTERN.test(String(value ?? '').trim());

    const isStoreCustomerCode = (value) => String(value ?? '').trim() === STORE_CUSTOMER_CODE;

    const calcInclusiveFromExclusive = (exTax) => {
        const exclusive = Math.round(toNumber(exTax));
        const tax = Math.round(exclusive * TAX_RATE);
        return {
            exclusive: exclusive,
            tax: tax,
            inclusive: exclusive + tax,
        };
    };

    const sumDetailExclusive = (orderRecord) => {
        const table = orderRecord && orderRecord.detail_table;
        const rows = (table && table.value) || [];
        let sum = 0;
        rows.forEach((row) => {
            sum += toNumber(row.value && row.value.amount && row.value.amount.value);
        });
        return Math.round(sum);
    };

    const sumAllocatedForOrder = (paymentRecords, orderRecordId) => {
        const target = String(orderRecordId ?? '');
        let sum = 0;
        (paymentRecords || []).forEach((rec) => {
            const status = readValue(rec, HEADER.paymentStatus);
            if (status === PAYMENT_STATUS_CANCELLED) {
                return;
            }
            const lines = (rec[HEADER.lines] && rec[HEADER.lines].value) || [];
            lines.forEach((row) => {
                const oid = String(
                    row.value
                    && row.value[LINE.orderRecordId]
                    && row.value[LINE.orderRecordId].value
                );
                if (oid !== target) {
                    return;
                }
                sum += toNumber(
                    row.value
                    && row.value[LINE.allocatedAmount]
                    && row.value[LINE.allocatedAmount].value
                );
            });
        });
        return Math.round(sum * 100) / 100;
    };

    const buildBalance = (billedInclusive, paid) => {
        const billed = Math.round(toNumber(billedInclusive) * 100) / 100;
        const paidAmt = Math.round(toNumber(paid) * 100) / 100;
        const balance = Math.round((billed - paidAmt) * 100) / 100;
        let state = '未入金';
        if (paidAmt > billed + 0.0001) {
            state = '過剰入金';
        } else if (balance <= 0 && billed > 0) {
            state = '入金済';
        } else if (paidAmt > 0) {
            state = '一部入金';
        } else if (billed <= 0) {
            state = '金額なし';
        }
        return {
            billedInclusive: billed,
            paid: paidAmt,
            balance: balance,
            state: state,
        };
    };

    const getOrderBalance = (orderRecord, paymentRecords) => {
        const billed = calcInclusiveFromExclusive(sumDetailExclusive(orderRecord));
        const paid = sumAllocatedForOrder(
            paymentRecords,
            orderRecord && orderRecord.$id && orderRecord.$id.value
        );
        return Object.assign(
            {
                exclusive: billed.exclusive,
                tax: billed.tax,
            },
            buildBalance(billed.inclusive, paid)
        );
    };

    const getBalanceFromExclusive = (exclusive, paid) => {
        const billed = calcInclusiveFromExclusive(exclusive);
        return Object.assign(
            {
                exclusive: billed.exclusive,
                tax: billed.tax,
            },
            buildBalance(billed.inclusive, paid)
        );
    };

    const kintoneApi = (path, method, body) => {
        if (typeof kintone === 'undefined' || typeof kintone.api !== 'function') {
            return Promise.reject(new Error('kintone API が利用できません。'));
        }
        return new Promise((resolve, reject) => {
            kintone.api(path, method, body, resolve, reject);
        });
    };

    const fetchRecords = async (app, query, fields) => {
        const body = { app: app, query: query };
        if (fields && fields.length) {
            body.fields = fields;
        }
        const resp = await kintoneApi(kintone.api.url('/k/v1/records.json', true), 'GET', body);
        return resp.records || [];
    };

    const fetchPcmById = async (personalCustomerId) => {
        const id = String(personalCustomerId ?? '').trim();
        if (!isValidPersonalCustomerId(id)) {
            return null;
        }
        const query = PCM_FIELDS.personalCustomerId + ' = "' + escapeQuery(id) + '" limit 1';
        const rows = await fetchRecords(PCM_APP_ID, query, [
            '$id',
            PCM_FIELDS.personalCustomerId,
            PCM_FIELDS.customerName,
            PCM_FIELDS.customerKana,
            PCM_FIELDS.phone,
            PCM_FIELDS.mobilePhone,
        ]);
        return rows[0] || null;
    };

    const fetchPaymentsByCustomer = async (personalCustomerId) => {
        const id = String(personalCustomerId ?? '').trim();
        if (!isValidPersonalCustomerId(id)) {
            return [];
        }
        const query = HEADER.personalCustomerId + ' = "' + escapeQuery(id) + '"'
            + ' and ' + HEADER.paymentStatus + ' not in ("' + escapeQuery(PAYMENT_STATUS_CANCELLED) + '")'
            + ' order by payment_date desc limit 500';
        return fetchRecords(PAYMENT_APP_ID, query, null);
    };

    const fetchOrdersByManageNos = async (manageNos) => {
        const list = (manageNos || []).map((m) => String(m ?? '').trim()).filter(Boolean);
        if (!list.length) {
            return [];
        }
        const unique = Array.from(new Set(list));
        const chunks = [];
        for (let i = 0; i < unique.length; i += 20) {
            chunks.push(unique.slice(i, i + 20));
        }
        const all = [];
        for (let c = 0; c < chunks.length; c += 1) {
            const part = chunks[c];
            const query = 'manage_no in (' + part.map((m) => '"' + escapeQuery(m) + '"').join(',') + ')';
            const rows = await fetchRecords(ORDER_APP_ID, query, [
                '$id',
                'manage_no',
                'customer_code',
                'personal_customer_id',
                'client_name',
                'kimono_type',
                'kimono_spec',
                'detail_table',
            ]);
            all.push(...rows);
        }
        return all;
    };

    /**
     * App16 受注レコード → 店舗受注表用データ拡張（印刷直前）
     */
    const enrichStoreOrderData = async (reportData, orderRecord) => {
        const data = reportData || { header: {}, details: [], summary: {} };
        const header = Object.assign({}, data.header);
        const record = orderRecord || {};
        const personalCustomerId = readValue(record, 'personal_customer_id')
            || String(header.personal_customer_id || '').trim();
        header.personal_customer_id = personalCustomerId;
        header.customer_code = readValue(record, 'customer_code') || header.customer_code;

        let pcmName = '';
        let pcmPhone = '';
        let balance = getOrderBalance(record, []);
        let paymentNote = '';

        try {
            if (isValidPersonalCustomerId(personalCustomerId)) {
                const pcm = await fetchPcmById(personalCustomerId);
                if (pcm) {
                    pcmName = readValue(pcm, PCM_FIELDS.customerName);
                    pcmPhone = readValue(pcm, PCM_FIELDS.mobilePhone)
                        || readValue(pcm, PCM_FIELDS.phone);
                }
                const payments = await fetchPaymentsByCustomer(personalCustomerId);
                balance = getOrderBalance(record, payments);
            } else {
                paymentNote = 'PCM未設定のため入金状況を取得できません';
                balance = getOrderBalance(record, []);
            }
        } catch (error) {
            paymentNote = '入金状況の取得に失敗しました';
            console.error('[store_print_payment] enrichStoreOrderData', error);
        }

        if (pcmName) {
            header.pcm_customer_name = pcmName;
            header.client_name = pcmName;
        }
        header.pcm_phone = pcmPhone;
        header.payment_state = balance.state;
        header.payment_billed_inclusive = balance.billedInclusive;
        header.payment_paid = balance.paid;
        header.payment_balance = balance.balance;
        header.payment_exclusive = balance.exclusive;
        header.payment_tax = balance.tax;
        header.payment_note = paymentNote;

        return {
            header: header,
            details: data.details || [],
            summary: Object.assign({}, data.summary, {
                payment_state: balance.state,
                billedInclusive: balance.billedInclusive,
                paid: balance.paid,
                balance: balance.balance,
            }),
        };
    };

    /**
     * App19 納品書 → 店舗納品書用（明細ごと入金＋フッタ合算）
     */
    const enrichStoreDeliveryData = async (reportData) => {
        const data = reportData || { header: {}, details: [], summary: {} };
        const header = Object.assign({}, data.header);
        const details = Array.isArray(data.details) ? data.details.slice() : [];
        const manageNos = details
            .map((d) => String(d.manage_no || '').trim())
            .filter(Boolean);
        const uniqueManageNos = Array.from(new Set(manageNos));

        let orders = [];
        let payments = [];
        let personalCustomerId = '';
        let pcmName = '';
        let paymentNote = '';

        try {
            orders = await fetchOrdersByManageNos(uniqueManageNos);
            const pcmSet = new Set();
            orders.forEach((order) => {
                const pcm = readValue(order, 'personal_customer_id');
                if (pcm) {
                    pcmSet.add(pcm);
                }
            });
            if (pcmSet.size > 1) {
                paymentNote = '明細に複数のPCM顧客が含まれています';
            }
            personalCustomerId = pcmSet.size === 1 ? Array.from(pcmSet)[0] : '';
            if (isValidPersonalCustomerId(personalCustomerId)) {
                const pcm = await fetchPcmById(personalCustomerId);
                if (pcm) {
                    pcmName = readValue(pcm, PCM_FIELDS.customerName);
                }
                payments = await fetchPaymentsByCustomer(personalCustomerId);
            } else if (!paymentNote) {
                paymentNote = 'PCM未設定のため入金状況を一部取得できません';
            }
        } catch (error) {
            paymentNote = '入金状況の取得に失敗しました';
            console.error('[store_print_payment] enrichStoreDeliveryData', error);
        }

        const orderByManageNo = {};
        orders.forEach((order) => {
            orderByManageNo[readValue(order, 'manage_no')] = order;
        });

        let sumBilled = 0;
        let sumPaid = 0;
        let sumBalance = 0;
        let sumExclusive = 0;

        const enrichedDetails = details.map((detail) => {
            const manageNo = String(detail.manage_no || '').trim();
            const order = orderByManageNo[manageNo];
            let balance;
            if (order) {
                balance = getOrderBalance(order, payments);
            } else {
                balance = getBalanceFromExclusive(detail.amount, 0);
                balance.state = '不明';
            }
            sumExclusive += balance.exclusive;
            sumBilled += balance.billedInclusive;
            sumPaid += balance.paid;
            sumBalance += balance.balance;
            return Object.assign({}, detail, {
                payment_state: balance.state,
                payment_billed_inclusive: balance.billedInclusive,
                payment_paid: balance.paid,
                payment_balance: balance.balance,
                order_record_id: order && order.$id ? String(order.$id.value) : '',
            });
        });

        header.personal_customer_id = personalCustomerId;
        if (pcmName) {
            header.pcm_customer_name = pcmName;
            header.general_client_name = pcmName;
        }
        header.payment_note = paymentNote;
        header.payment_state = sumBalance <= 0.0001 && sumBilled > 0
            ? '入金済'
            : (sumPaid > 0 ? (sumBalance > 0 ? '一部入金' : '入金済') : '未入金');

        return {
            header: header,
            details: enrichedDetails,
            summary: Object.assign({}, data.summary, {
                exclusive: Math.round(sumExclusive * 100) / 100,
                tax: Math.round((sumBilled - sumExclusive) * 100) / 100,
                billedInclusive: Math.round(sumBilled * 100) / 100,
                paid: Math.round(sumPaid * 100) / 100,
                balance: Math.round(sumBalance * 100) / 100,
                payment_state: header.payment_state,
            }),
        };
    };

    StorePrintPayment.STORE_CUSTOMER_CODE = STORE_CUSTOMER_CODE;
    StorePrintPayment.PCM_APP_ID = PCM_APP_ID;
    StorePrintPayment.PAYMENT_APP_ID = PAYMENT_APP_ID;
    StorePrintPayment.TAX_RATE = TAX_RATE;
    StorePrintPayment.isValidPersonalCustomerId = isValidPersonalCustomerId;
    StorePrintPayment.isStoreCustomerCode = isStoreCustomerCode;
    StorePrintPayment.calcInclusiveFromExclusive = calcInclusiveFromExclusive;
    StorePrintPayment.getOrderBalance = getOrderBalance;
    StorePrintPayment.getBalanceFromExclusive = getBalanceFromExclusive;
    StorePrintPayment.sumAllocatedForOrder = sumAllocatedForOrder;
    StorePrintPayment.sumDetailExclusive = sumDetailExclusive;
    StorePrintPayment.buildBalance = buildBalance;
    StorePrintPayment.enrichStoreOrderData = enrichStoreOrderData;
    StorePrintPayment.enrichStoreDeliveryData = enrichStoreDeliveryData;
    StorePrintPayment.fetchPcmById = fetchPcmById;
    StorePrintPayment.fetchPaymentsByCustomer = fetchPaymentsByCustomer;
    StorePrintPayment.fetchOrdersByManageNos = fetchOrdersByManageNos;

    window.CAYANAS_StorePrintPayment = StorePrintPayment;
    window.StorePrintPayment = StorePrintPayment;

})();
