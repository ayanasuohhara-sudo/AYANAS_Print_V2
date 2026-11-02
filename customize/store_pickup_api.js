(function () {
  'use strict';

  /**
   * 店舗引き取り API（App92 / App97 共用）
   * 入金登録は行わない。残高照会は StorePayment Engine を参照。
   */

  const pickup = () => {
    if (typeof window.CAYANAS_StorePickup === 'undefined') {
      throw new Error('[store_pickup_api] store_pickup_shared.js を先に読み込んでください。');
    }
    return window.CAYANAS_StorePickup;
  };

  const paymentCfg = () => {
    if (typeof window.CAYANAS_StorePayment === 'undefined') {
      throw new Error('[store_pickup_api] store_payment_config.js を先に読み込んでください。');
    }
    return window.CAYANAS_StorePayment;
  };

  const paymentEngine = () => {
    if (typeof window.CAYANAS_StorePayment_Engine === 'undefined') {
      throw new Error('[store_pickup_api] store_payment_engine.js を先に読み込んでください。');
    }
    return window.CAYANAS_StorePayment_Engine;
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

  const orderFields = () => {
    const C = paymentCfg();
    const F = C.ORDER_FIELDS;
    return [
      '$id',
      '$revision',
      F.personalCustomerId,
      F.customerCode,
      F.clientName,
      F.manageNo,
      F.kimonoType,
      F.kimonoSpec,
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
    const C = paymentCfg();
    const E = paymentEngine();
    const code = E.normalizeBarcode(manageNo);
    if (!code) {
      return { ok: false, error: '管理番号が空です。', orders: [] };
    }
    const query = C.ORDER_FIELDS.manageNo + ' = "' + E.escapeQuery(code) + '"'
      + ' and ' + C.ORDER_FIELDS.customerCode + ' = "' + E.escapeQuery(C.STORE_CUSTOMER_CODE) + '"'
      + ' limit 5';
    const orders = await fetchRecords(C.ORDER_APP_ID, query, orderFields());
    if (orders.length === 0) {
      return { ok: false, error: 'A550の受注が見つかりません: ' + code, orders: [] };
    }
    if (orders.length > 1) {
      return {
        ok: false,
        error: '管理番号が重複しています: ' + code,
        orders: orders,
      };
    }
    return { ok: true, orders: orders, manageNo: code };
  };

  const fetchPaymentsByCustomer = async (personalCustomerId) => {
    const C = paymentCfg();
    const E = paymentEngine();
    const id = String(personalCustomerId ?? '').trim();
    if (!E.isValidPersonalCustomerId(id)) {
      return [];
    }
    const query = E.buildPaymentsByCustomerQuery(id);
    return fetchRecords(C.STORE_PAYMENT_APP_ID, query, null);
  };

  const fetchPcmById = async (personalCustomerId) => {
    const C = paymentCfg();
    const E = paymentEngine();
    const id = String(personalCustomerId ?? '').trim();
    if (!E.isValidPersonalCustomerId(id)) {
      return null;
    }
    const query = E.buildPcmIdQuery(id);
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

  const buildPickupCandidate = (order, payments) => {
    const P = pickup();
    const E = paymentEngine();
    const C = paymentCfg();
    const F = C.ORDER_FIELDS;
    const balance = E.getOrderBalance(order, payments);
    const gate = P.evaluatePickupGate(order, {
      balanceInfo: balance,
      requirePaid: true,
      unpaidHandoverApproved: false,
    });
    const kimonoType = E.readValue(order, F.kimonoType);
    const kimonoSpec = F.kimonoSpec ? E.readValue(order, F.kimonoSpec) : '';
    const productName = [kimonoType, kimonoSpec].filter(Boolean).join('　');
    return {
      orderRecordId: String((order.$id && order.$id.value) || ''),
      revision: String((order.$revision && order.$revision.value) || ''),
      manageNo: E.readValue(order, F.manageNo),
      personalCustomerId: E.readValue(order, F.personalCustomerId),
      clientName: E.readValue(order, F.clientName),
      productName: productName,
      kimonoType: kimonoType,
      kimonoSpec: kimonoSpec,
      itemNames: E.joinItemNames(order),
      processStatus: E.readValue(order, F.processStatus),
      locationStatus: E.readValue(order, F.locationStatus),
      deliveryStatus: E.readValue(order, F.deliveryStatus),
      deliveryNo: E.readValue(order, F.deliveryNo),
      balance: balance,
      paymentState: balance.state,
      unpaidBalance: balance.balance,
      paid: balance.balance <= 0.0001,
      pickupGate: gate,
      canComplete: !!(gate.ok && !gate.alreadyDone && balance.balance <= 0.0001),
      guideToApp97: !!(balance.balance > 0.0001),
    };
  };

  /**
   * バーコード → 引き取り候補＋残高
   */
  const loadPickupByBarcode = async (barcode) => {
    const E = paymentEngine();
    const found = await fetchOrderByManageNo(barcode);
    if (!found.ok) {
      return found;
    }
    const order = found.orders[0];
    const personalCustomerId = E.readValue(order, paymentCfg().ORDER_FIELDS.personalCustomerId);
    if (!E.isValidPersonalCustomerId(personalCustomerId)) {
      return {
        ok: false,
        error: 'この受注に個人顧客IDがありません。PCM 連携後に入金・引き取りしてください。',
        orders: found.orders,
      };
    }
    const pcm = await fetchPcmById(personalCustomerId);
    const payments = await fetchPaymentsByCustomer(personalCustomerId);
    const candidate = buildPickupCandidate(order, payments);
    return {
      ok: true,
      personalCustomerId: personalCustomerId,
      clientName: pcm
        ? E.readValue(pcm, paymentCfg().PCM_FIELDS.customerName)
        : candidate.clientName,
      candidate: candidate,
      payments: payments,
    };
  };

  /**
   * 入金確認後の引き取り完了。delivery_status=納品済 のみ更新。
   */
  const completePickup = async (orderRecordId, options) => {
    const P = pickup();
    const C = paymentCfg();
    const E = paymentEngine();
    const opts = options || {};
    const id = String(orderRecordId ?? '').trim();
    if (!id) {
      return { ok: false, error: '受注IDが必要です。' };
    }

    const got = await api('/k/v1/record.json', 'GET', { app: C.ORDER_APP_ID, id: id });
    const order = got.record;

    if (P.isPickupAlreadyDone(order)) {
      return { ok: true, alreadyDone: true };
    }

    const personalCustomerId = E.readValue(order, C.ORDER_FIELDS.personalCustomerId);
    const payments = await fetchPaymentsByCustomer(personalCustomerId);
    const balance = E.getOrderBalance(order, payments);

    const gate = P.evaluatePickupGate(order, {
      balanceInfo: balance,
      requirePaid: opts.requirePaid !== false,
      unpaidHandoverApproved: !!opts.unpaidHandoverApproved,
      expectedPersonalCustomerId: opts.expectedPersonalCustomerId || '',
      acceptLegacyWaiting: opts.acceptLegacyWaiting,
    });

    if (gate.alreadyDone) {
      return { ok: true, alreadyDone: true, balance: balance };
    }

    if (!gate.ok) {
      return { ok: false, error: gate.reason, code: gate.code, balance: balance };
    }

    const putRecord = P.buildPickupPutRecord();
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
      if (P.isPickupAlreadyDone(again.record)) {
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

  window.CAYANAS_StorePickup_Api = {
    fetchOrderByManageNo: fetchOrderByManageNo,
    fetchPaymentsByCustomer: fetchPaymentsByCustomer,
    loadPickupByBarcode: loadPickupByBarcode,
    buildPickupCandidate: buildPickupCandidate,
    completePickup: completePickup,
  };
}());
