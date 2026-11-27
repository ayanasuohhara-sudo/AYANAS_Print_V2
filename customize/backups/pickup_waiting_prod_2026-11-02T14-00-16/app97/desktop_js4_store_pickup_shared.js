(function () {
  'use strict';

  /**
   * 店舗引き取り共通（UI / kintone 非依存）
   * - 引き取り待ち遷移判定
   * - 引き取り完了ゲート（A550 / 完了 / 店舗 / 引き取り待ち(+移行互換) / delivery_no / 入金済）
   * - PUT は delivery_status=納品済 のみ
   */

  const STORE_CUSTOMER_CODE = 'A550';
  const PROCESS_DONE = '完了';
  const LOCATION_STORE = '店舗';

  const DELIVERY = {
    none: '未納品',
    waiting: '納品待ち',
    pickupWaiting: '引き取り待ち',
    done: '納品済',
  };

  /** 移行期間: 旧「納品待ち」在庫も引き取り対象にする */
  const ACCEPT_LEGACY_WAITING = true;

  const norm = (value) => String(value ?? '').trim();

  const readValue = (record, code) => {
    if (!record) {
      return '';
    }
    if (Object.prototype.hasOwnProperty.call(record, code)
      && record[code]
      && typeof record[code] === 'object'
      && Object.prototype.hasOwnProperty.call(record[code], 'value')) {
      return norm(record[code].value);
    }
    return norm(record[code]);
  };

  const isStoreCustomerCode = (customerCode) => (
    norm(customerCode) === STORE_CUSTOMER_CODE
  );

  const isPickupAlreadyDone = (deliveryStatusOrRecord) => {
    if (deliveryStatusOrRecord && typeof deliveryStatusOrRecord === 'object') {
      return readValue(deliveryStatusOrRecord, 'delivery_status') === DELIVERY.done
        || readValue(deliveryStatusOrRecord, 'deliveryStatus') === DELIVERY.done;
    }
    return norm(deliveryStatusOrRecord) === DELIVERY.done;
  };

  /**
   * 引き取り対象ステータスか（移行互換含む）
   */
  const isPickupEligibleDeliveryStatus = (deliveryStatus, options) => {
    const status = norm(deliveryStatus);
    const acceptLegacy = options && options.acceptLegacyWaiting === false
      ? false
      : ACCEPT_LEGACY_WAITING;
    if (status === DELIVERY.pickupWaiting) {
      return true;
    }
    if (acceptLegacy && status === DELIVERY.waiting) {
      return true;
    }
    return false;
  };

  /**
   * A550 で「引き取り待ち」へ遷移すべきか。
   * 想定スナップショット（更新後の値）で判定する。
   */
  const shouldSetPickupWaiting = (snapshot) => {
    const s = snapshot || {};
    const customerCode = norm(s.customerCode);
    const processStatus = norm(s.processStatus);
    const locationStatus = norm(s.locationStatus);
    const deliveryStatus = norm(s.deliveryStatus);
    const deliveryNo = norm(s.deliveryNo);

    if (!isStoreCustomerCode(customerCode)) {
      return false;
    }
    if (processStatus !== PROCESS_DONE) {
      return false;
    }
    if (locationStatus !== LOCATION_STORE) {
      return false;
    }
    if (!deliveryNo) {
      return false;
    }
    if (deliveryStatus === DELIVERY.done) {
      return false;
    }
    return true;
  };

  /**
   * App19 店舗同期の目標 delivery_status
   */
  const resolveStoreDeliveryStatusAfterSlip = (orderSnapshot, deliveryNo) => {
    const processStatus = norm(orderSnapshot && orderSnapshot.processStatus);
    const locationStatus = norm(orderSnapshot && orderSnapshot.locationStatus);
    const deliveryStatus = norm(orderSnapshot && orderSnapshot.deliveryStatus);
    const customerCode = norm(
      orderSnapshot && (orderSnapshot.customerCode || STORE_CUSTOMER_CODE)
    );
    const number = norm(deliveryNo) || norm(orderSnapshot && orderSnapshot.deliveryNo);

    if (shouldSetPickupWaiting({
      customerCode: customerCode,
      processStatus: processStatus,
      locationStatus: locationStatus,
      deliveryStatus: deliveryStatus,
      deliveryNo: number,
    })) {
      return DELIVERY.pickupWaiting;
    }
    return DELIVERY.waiting;
  };

  /**
   * App34 入庫 PUT に載せる delivery_status（不要なら null）
   */
  const resolveInboundDeliveryStatusPatch = (dest, orderSnapshot) => {
    const s = orderSnapshot || {};
    const nextLocation = norm(dest);
    if (nextLocation !== LOCATION_STORE) {
      return null;
    }
    if (!shouldSetPickupWaiting({
      customerCode: s.customerCode,
      processStatus: s.processStatus,
      locationStatus: nextLocation,
      deliveryStatus: s.deliveryStatus,
      deliveryNo: s.deliveryNo,
    })) {
      return null;
    }
    if (norm(s.deliveryStatus) === DELIVERY.pickupWaiting) {
      return null;
    }
    return DELIVERY.pickupWaiting;
  };

  /**
   * 引き取り完了 PUT（delivery_status のみ）
   */
  const buildPickupPutRecord = () => ({
    delivery_status: { value: DELIVERY.done },
  });

  /**
   * @returns {{ ok: boolean, reason?: string, code?: string, alreadyDone?: boolean }}
   */
  const evaluatePickupGate = (orderRecord, options) => {
    const opts = options || {};
    const fieldMap = opts.fields || {
      customerCode: 'customer_code',
      processStatus: 'process_status',
      locationStatus: 'location_status',
      deliveryStatus: 'delivery_status',
      deliveryNo: 'delivery_no',
      personalCustomerId: 'personal_customer_id',
      manageNo: 'manage_no',
    };

    const customerCode = readValue(orderRecord, fieldMap.customerCode);
    const processStatus = readValue(orderRecord, fieldMap.processStatus);
    const locationStatus = readValue(orderRecord, fieldMap.locationStatus);
    const deliveryStatus = readValue(orderRecord, fieldMap.deliveryStatus);
    const deliveryNo = readValue(orderRecord, fieldMap.deliveryNo);
    const personalCustomerId = readValue(orderRecord, fieldMap.personalCustomerId);

    if (deliveryStatus === DELIVERY.done) {
      return { ok: true, alreadyDone: true, code: 'already_done' };
    }

    if (!isStoreCustomerCode(customerCode)) {
      return {
        ok: false,
        code: 'not_store_customer',
        reason: 'A550（店舗）の商品のみ引き取りできます。',
      };
    }

    if (processStatus !== PROCESS_DONE) {
      return {
        ok: false,
        code: 'process_not_done',
        reason: '工程が完了していないため引き取りできません。',
      };
    }

    if (locationStatus !== LOCATION_STORE) {
      return {
        ok: false,
        code: 'not_at_store',
        reason: '現物が店舗にないため引き取りできません。',
      };
    }

    if (!deliveryNo) {
      return {
        ok: false,
        code: 'no_delivery_no',
        reason: '納品書番号が未登録のため引き取りできません。',
      };
    }

    if (!isPickupEligibleDeliveryStatus(deliveryStatus, opts)) {
      return {
        ok: false,
        code: 'bad_delivery_status',
        reason: '納品状態が「引き取り待ち」（移行中は「納品待ち」）ではありません。',
      };
    }

    const expectedPcm = norm(opts.expectedPersonalCustomerId);
    if (expectedPcm) {
      if (!personalCustomerId) {
        return {
          ok: false,
          code: 'missing_pcm',
          reason: '個人顧客IDがありません。',
        };
      }
      if (personalCustomerId !== expectedPcm) {
        return {
          ok: false,
          code: 'pcm_mismatch',
          reason: '別のお客様の商品が混在しています。',
        };
      }
    }

    if (opts.requirePaid !== false) {
      const balance = opts.balanceInfo;
      if (!balance) {
        return {
          ok: false,
          code: 'no_balance',
          reason: '入金状況を確認できません。',
        };
      }
      const unpaidApproved = !!opts.unpaidHandoverApproved;
      if (balance.balance > 0.0001 && !unpaidApproved) {
        const state = balance.state || '未入金';
        return {
          ok: false,
          code: 'unpaid',
          reason: state === '一部入金'
            ? '一部入金のため引き取りできません。App97で残額を入金してください。'
            : '未入金のため引き取りできません。App97で入金してください。',
          balance: balance,
        };
      }
    }

    return { ok: true };
  };

  /**
   * カートへ追加できるか（同一 PCM）
   */
  const canAddToPickupCart = (cart, candidate) => {
    const items = (cart && cart.items) || [];
    const pcm = norm(candidate && candidate.personalCustomerId);
    const manageNo = norm(candidate && candidate.manageNo);
    const orderRecordId = norm(candidate && candidate.orderRecordId);

    if (!manageNo || !orderRecordId) {
      return { ok: false, reason: '管理番号または受注IDが不正です。' };
    }

    if (!pcm) {
      return { ok: false, reason: '個人顧客IDがありません。' };
    }

    for (let i = 0; i < items.length; i += 1) {
      const row = items[i];
      if (norm(row.orderRecordId) === orderRecordId || norm(row.manageNo) === manageNo) {
        return { ok: false, reason: '同じ管理番号は既に追加済みです。', code: 'duplicate' };
      }
      if (norm(row.personalCustomerId) !== pcm) {
        return {
          ok: false,
          reason: '別のお客様の商品は同時に処理できません。',
          code: 'pcm_mismatch',
        };
      }
    }

    return { ok: true };
  };

  window.CAYANAS_StorePickup = {
    VERSION: '1.0.0',
    STORE_CUSTOMER_CODE: STORE_CUSTOMER_CODE,
    PROCESS_DONE: PROCESS_DONE,
    LOCATION_STORE: LOCATION_STORE,
    DELIVERY: DELIVERY,
    ACCEPT_LEGACY_WAITING: ACCEPT_LEGACY_WAITING,
    norm: norm,
    readValue: readValue,
    isStoreCustomerCode: isStoreCustomerCode,
    isPickupAlreadyDone: isPickupAlreadyDone,
    isPickupEligibleDeliveryStatus: isPickupEligibleDeliveryStatus,
    shouldSetPickupWaiting: shouldSetPickupWaiting,
    resolveStoreDeliveryStatusAfterSlip: resolveStoreDeliveryStatusAfterSlip,
    resolveInboundDeliveryStatusPatch: resolveInboundDeliveryStatusPatch,
    buildPickupPutRecord: buildPickupPutRecord,
    evaluatePickupGate: evaluatePickupGate,
    canAddToPickupCart: canAddToPickupCart,
  };
}());
