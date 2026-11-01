(function() {
  'use strict';

  /**
   * 店舗入金 S1 — kintone API ラッパ（登録・検索・引き取り）
   * 本番カスタマイズ反映は別途承認後。
   */

  const cfg = () => {
    if (typeof window.CAYANAS_StorePayment === 'undefined') {
      throw new Error('[store_payment_api] store_payment_config.js を先に読み込んでください。');
    }
    return window.CAYANAS_StorePayment;
  };

  const engine = () => {
    if (typeof window.CAYANAS_StorePayment_Engine === 'undefined') {
      throw new Error('[store_payment_api] store_payment_engine.js を先に読み込んでください。');
    }
    return window.CAYANAS_StorePayment_Engine;
  };

  const numbering = () => {
    if (typeof window.CAYANAS_StorePayment_Numbering === 'undefined') {
      throw new Error('[store_payment_api] store_payment_numbering.js を先に読み込んでください。');
    }
    return window.CAYANAS_StorePayment_Numbering;
  };

  const api = (path, method, body) => kintone.api(kintone.api.url(path, true), method, body);

  const fetchRecords = async (app, query, fields) => {
    const body = { app: app, query: query };
    if (fields && fields.length) {
      body.fields = fields;
    }
    const resp = await api('/k/v1/records.json', 'GET', body);
    return resp.records || [];
  };

  const findPaymentsByTransactionId = async (transactionId) => {
    const C = cfg();
    const E = engine();
    const tid = String(transactionId ?? '').trim();
    if (!tid) {
      return [];
    }
    const query = C.HEADER_FIELDS.transactionId + ' = "' + E.escapeQuery(tid) + '" limit 5';
    return fetchRecords(C.STORE_PAYMENT_APP_ID, query, [
      '$id',
      C.HEADER_FIELDS.storePaymentNo,
      C.HEADER_FIELDS.transactionId,
      C.HEADER_FIELDS.paymentStatus,
      C.HEADER_FIELDS.paymentAmount,
    ]);
  };

  const searchPcm = async (criteria) => {
    const C = cfg();
    const E = engine();
    const query = E.buildPcmSearchQuery(criteria);
    if (!query) {
      return [];
    }
    return fetchRecords(C.PCM_APP_ID, query, [
      '$id',
      C.PCM_FIELDS.personalCustomerId,
      C.PCM_FIELDS.customerName,
      C.PCM_FIELDS.customerKana,
      C.PCM_FIELDS.phone,
      C.PCM_FIELDS.mobilePhone,
    ]);
  };

  const fetchPcmById = async (personalCustomerId) => {
    const C = cfg();
    const E = engine();
    const query = E.buildPcmIdQuery(personalCustomerId);
    if (!query) {
      return null;
    }
    const rows = await fetchRecords(C.PCM_APP_ID, query, [
      '$id',
      C.PCM_FIELDS.personalCustomerId,
      C.PCM_FIELDS.customerName,
      C.PCM_FIELDS.customerKana,
      C.PCM_FIELDS.phone,
      C.PCM_FIELDS.mobilePhone,
    ]);
    return rows[0] || null;
  };

  const orderFields = () => {
    const C = cfg();
    const F = C.ORDER_FIELDS;
    return [
      '$id',
      '$revision',
      F.personalCustomerId,
      F.customerCode,
      F.clientName,
      F.manageNo,
      F.kimonoType,
      F.detailTable,
      F.deliveryStatus,
      F.processStatus,
      F.locationStatus,
      F.workStatus,
      F.deliveryNo,
      F.deliveryDate,
    ];
  };

  const fetchOrderByManageNo = async (manageNo) => {
    const C = cfg();
    const E = engine();
    const query = E.buildManageNoQuery(manageNo);
    if (!query) {
      return { ok: false, error: '管理番号が空です。', orders: [] };
    }
    const orders = await fetchRecords(C.ORDER_APP_ID, query, orderFields());
    if (orders.length === 0) {
      return { ok: false, error: 'A550 の受注が見つかりません。', orders: [] };
    }
    if (orders.length > 1) {
      return { ok: false, error: 'manage_no が重複しています。', orders: orders };
    }
    return { ok: true, orders: orders };
  };

  const fetchOpenOrdersByCustomer = async (personalCustomerId) => {
    const C = cfg();
    const E = engine();
    const query = E.buildOpenOrdersByCustomerQuery(personalCustomerId);
    if (!query) {
      return [];
    }
    return fetchRecords(C.ORDER_APP_ID, query, orderFields());
  };

  const fetchPaymentsByCustomer = async (personalCustomerId) => {
    const C = cfg();
    const E = engine();
    const query = E.buildPaymentsByCustomerQuery(personalCustomerId);
    if (!query) {
      return [];
    }
    return fetchRecords(C.STORE_PAYMENT_APP_ID, query, null);
  };

  const fetchPaymentsByDate = async (paymentDate) => {
    const C = cfg();
    const E = engine();
    const query = E.buildPaymentsByDateQuery(paymentDate);
    if (!query) {
      return [];
    }
    return fetchRecords(C.STORE_PAYMENT_APP_ID, query, null);
  };

  const buildAccountingRows = (orders, payments) => {
    const E = engine();
    return (orders || []).map(function(order) {
      return E.buildOrderAccountingRow(order, payments);
    });
  };

  /**
   * バーコード → 当該受注 + 同一個人の未精算一覧
   */
  const loadByBarcode = async (barcode) => {
    const E = engine();
    const manageNo = E.normalizeBarcode(barcode);
    const found = await fetchOrderByManageNo(manageNo);
    if (!found.ok) {
      return found;
    }
    const order = found.orders[0];
    const personalCustomerId = E.readValue(order, cfg().ORDER_FIELDS.personalCustomerId);
    if (!E.isValidPersonalCustomerId(personalCustomerId)) {
      return {
        ok: false,
        error: 'この受注に個人顧客IDがありません。PCM 連携後に入金してください。',
        orders: found.orders,
      };
    }
    const pcm = await fetchPcmById(personalCustomerId);
    const openOrders = await fetchOpenOrdersByCustomer(personalCustomerId);
    const payments = await fetchPaymentsByCustomer(personalCustomerId);
    const rows = buildAccountingRows(openOrders, payments);
    const focusId = E.readValue(order, '$id') || (order.$id && order.$id.value);
    return {
      ok: true,
      personalCustomerId: personalCustomerId,
      clientName: pcm
        ? E.readValue(pcm, cfg().PCM_FIELDS.customerName)
        : E.readValue(order, cfg().ORDER_FIELDS.clientName),
      focusOrderRecordId: String(focusId),
      rows: rows,
      payments: payments,
    };
  };

  const loadByPersonalCustomerId = async (personalCustomerId) => {
    const E = engine();
    const id = String(personalCustomerId ?? '').trim();
    if (!E.isValidPersonalCustomerId(id)) {
      return { ok: false, error: '個人顧客IDが不正です。', rows: [] };
    }
    const pcm = await fetchPcmById(id);
    if (!pcm) {
      return { ok: false, error: 'PCM に個人顧客が見つかりません。', rows: [] };
    }
    const openOrders = await fetchOpenOrdersByCustomer(id);
    const payments = await fetchPaymentsByCustomer(id);
    return {
      ok: true,
      personalCustomerId: id,
      clientName: E.readValue(pcm, cfg().PCM_FIELDS.customerName),
      focusOrderRecordId: '',
      rows: buildAccountingRows(openOrders, payments),
      payments: payments,
    };
  };

  /**
   * 入金登録。失敗時は App16 を更新しない。
   */
  const registerPayment = async (draft, options) => {
    const C = cfg();
    const E = engine();
    const opts = options || {};
    const validated = E.validatePaymentDraft(draft);
    if (!validated.ok) {
      return { ok: false, errors: validated.errors };
    }

    const existing = await findPaymentsByTransactionId(draft.transactionId);
    if (existing.length > 0) {
      return {
        ok: true,
        idempotent: true,
        recordId: existing[0].$id.value,
        storePaymentNo: E.readValue(existing[0], C.HEADER_FIELDS.storePaymentNo),
      };
    }

    // 保存直前に残額再検証
    const refreshedPayments = await fetchPaymentsByCustomer(draft.personalCustomerId);
    const recheckLines = [];
    for (let i = 0; i < draft.lines.length; i += 1) {
      const line = draft.lines[i];
      const orderResp = await api('/k/v1/record.json', 'GET', {
        app: C.ORDER_APP_ID,
        id: line.orderRecordId,
      });
      const order = orderResp.record;
      const bal = E.getOrderBalance(order, refreshedPayments);
      if (draft.recordKind === C.RECORD_KIND.payment) {
        if (bal.balance <= 0) {
          return { ok: false, errors: ['入金済みのため再入金できません: ' + line.manageNo] };
        }
        if (E.toNumber(line.allocatedAmount) > bal.balance + 0.0001) {
          return { ok: false, errors: ['残額が変動しました。再読込してください: ' + line.manageNo] };
        }
        const drift = E.detectBilledDrift(line, order);
        if (drift.changed && Math.abs(drift.drift) > 0) {
          // スナップショットと現在税込が違う場合は警告付きで拒否（過剰・不足の誤登録防止）
          return {
            ok: false,
            errors: [
              '請求額が変更されています（' + line.manageNo
              + ' スナップショット ' + drift.snapshotInclusive
              + ' / 現在 ' + drift.currentInclusive + '）。再読込してください。',
            ],
          };
        }
      }
      recheckLines.push(line);
    }

    let storePaymentNo = draft.storePaymentNo;
    if (!storePaymentNo) {
      storePaymentNo = await numbering().allocateNextStorePaymentNo();
    }

    const login = kintone.getLoginUser ? kintone.getLoginUser() : null;
    const record = E.buildKintonePaymentRecord(Object.assign({}, draft, {
      lines: recheckLines,
      storePaymentNo: storePaymentNo,
    }), {
      storePaymentNo: storePaymentNo,
      paymentStaffCodes: opts.paymentStaffCodes
        || (login && login.code ? [login.code] : []),
    });

    let createdId = '';
    try {
      const created = await api('/k/v1/record.json', 'POST', {
        app: C.STORE_PAYMENT_APP_ID,
        record: record,
      });
      createdId = String(created.id);
    } catch (err) {
      // unique 衝突 → 再取得して冪等成功扱い
      const again = await findPaymentsByTransactionId(draft.transactionId);
      if (again.length > 0) {
        return {
          ok: true,
          idempotent: true,
          recordId: again[0].$id.value,
          storePaymentNo: E.readValue(again[0], C.HEADER_FIELDS.storePaymentNo),
        };
      }
      return {
        ok: false,
        errors: [err && err.message ? err.message : String(err)],
      };
    }

    // 同時端末レース: POST 成功後に過剰充当なら当該入金を取消して失敗返却（App16 は未更新のまま）
    if (draft.recordKind === C.RECORD_KIND.payment) {
      try {
        const orders = [];
        for (let i = 0; i < draft.lines.length; i += 1) {
          const orderResp = await api('/k/v1/record.json', 'GET', {
            app: C.ORDER_APP_ID,
            id: draft.lines[i].orderRecordId,
          });
          orders.push(orderResp.record);
        }
        const afterPayments = await fetchPaymentsByCustomer(draft.personalCustomerId);
        const over = E.detectOverAllocation(orders, afterPayments);
        if (!over.ok) {
          const nowIso = new Date().toISOString();
          await api('/k/v1/record.json', 'PUT', {
            app: C.STORE_PAYMENT_APP_ID,
            id: createdId,
            record: {
              [C.HEADER_FIELDS.paymentStatus]: { value: C.PAYMENT_STATUS.cancelled },
              [C.HEADER_FIELDS.cancelReason]: {
                value: '同時入金による過剰充当を検出したため自動取消: '
                  + over.offenders.map(function(o) {
                    return (o.manageNo || o.orderRecordId) + ' paid=' + o.paid + '/' + o.billed;
                  }).join('; '),
              },
              [C.HEADER_FIELDS.cancelDatetime]: { value: nowIso },
            },
          });
          return {
            ok: false,
            errors: [
              '同時入金の競合で過剰充当になるため登録を取り消しました。画面を再読込して残額を確認してください。',
            ],
            cancelledRecordId: createdId,
            storePaymentNo: storePaymentNo,
          };
        }
      } catch (guardErr) {
        return {
          ok: false,
          errors: [
            '入金は作成されましたが過剰検査に失敗しました。入金番号 '
              + storePaymentNo
              + ' を確認し、過剰なら取消してください: '
              + (guardErr && guardErr.message ? guardErr.message : String(guardErr)),
          ],
          recordId: createdId,
          storePaymentNo: storePaymentNo,
          needsManualReview: true,
        };
      }
    }

    return {
      ok: true,
      recordId: createdId,
      storePaymentNo: storePaymentNo,
      transactionId: draft.transactionId,
    };
  };

  /**
   * 入金確認後の引き取り。入金失敗経路からは呼ばないこと。
   * 実装本体は store_pickup_api.js（共有）。未読込時のみレガシー経路。
   */
  const completePickup = async (orderRecordId, options) => {
    if (window.CAYANAS_StorePickup_Api
      && typeof window.CAYANAS_StorePickup_Api.completePickup === 'function') {
      return window.CAYANAS_StorePickup_Api.completePickup(orderRecordId, options);
    }

    const C = cfg();
    const E = engine();
    const P = window.CAYANAS_StorePickup;
    const opts = options || {};
    const id = String(orderRecordId ?? '').trim();
    if (!id) {
      return { ok: false, error: '受注IDが必要です。' };
    }

    const got = await api('/k/v1/record.json', 'GET', { app: C.ORDER_APP_ID, id: id });
    const order = got.record;
    if (E.isPickupAlreadyDone(order)) {
      return { ok: true, alreadyDone: true };
    }

    const personalCustomerId = E.readValue(order, C.ORDER_FIELDS.personalCustomerId);
    const payments = await fetchPaymentsByCustomer(personalCustomerId);
    const balance = E.getOrderBalance(order, payments);

    if (P && typeof P.evaluatePickupGate === 'function') {
      const gate = P.evaluatePickupGate(order, {
        balanceInfo: balance,
        unpaidHandoverApproved: !!opts.unpaidHandoverApproved,
        expectedPersonalCustomerId: opts.expectedPersonalCustomerId || '',
      });
      if (gate.alreadyDone) {
        return { ok: true, alreadyDone: true, balance: balance };
      }
      if (!gate.ok) {
        return { ok: false, error: gate.reason, code: gate.code, balance: balance };
      }
    } else {
      const gate = E.canPickupWithBalance(balance, !!opts.unpaidHandoverApproved);
      if (!gate.ok) {
        return { ok: false, error: gate.reason, balance: balance };
      }
    }

    const putRecord = E.buildPickupPutRecord();
    const revision = order.$revision && order.$revision.value;
    try {
      await api('/k/v1/record.json', 'PUT', {
        app: C.ORDER_APP_ID,
        id: id,
        record: putRecord,
        revision: revision,
      });
    } catch (err) {
      const again = await api('/k/v1/record.json', 'GET', { app: C.ORDER_APP_ID, id: id });
      if (E.isPickupAlreadyDone(again.record)) {
        return { ok: true, alreadyDone: true };
      }
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }

    return {
      ok: true,
      balance: balance,
      exception: !!opts.unpaidHandoverApproved && balance.balance > 0.0001,
    };
  };

  const loadDailyReconcile = async (paymentDate, smaregiAmount) => {
    const E = engine();
    const records = await fetchPaymentsByDate(paymentDate);
    const summary = E.summarizeDailyPayments(records);
    const compare = E.compareDailyReconcile(summary, smaregiAmount);
    return {
      ok: true,
      paymentDate: paymentDate,
      summary: summary,
      compare: compare,
    };
  };

  window.CAYANAS_StorePayment_Api = {
    searchPcm: searchPcm,
    fetchPcmById: fetchPcmById,
    fetchOrderByManageNo: fetchOrderByManageNo,
    fetchOpenOrdersByCustomer: fetchOpenOrdersByCustomer,
    fetchPaymentsByCustomer: fetchPaymentsByCustomer,
    fetchPaymentsByDate: fetchPaymentsByDate,
    buildAccountingRows: buildAccountingRows,
    loadByBarcode: loadByBarcode,
    loadByPersonalCustomerId: loadByPersonalCustomerId,
    findPaymentsByTransactionId: findPaymentsByTransactionId,
    registerPayment: registerPayment,
    completePickup: completePickup,
    loadDailyReconcile: loadDailyReconcile,
  };
}());
