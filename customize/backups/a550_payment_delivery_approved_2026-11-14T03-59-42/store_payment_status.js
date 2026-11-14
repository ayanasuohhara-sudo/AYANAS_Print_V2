(function () {
  'use strict';

  /**
   * A550 店舗入金状況（App16 正本）
   * - 金額・入金日はスマレジ。kintone は状況ラベルのみ。
   * - App21 / App35 / 法人フローは対象外。
   */

  const VERSION = '1.0.0';
  const FIELD_CODE = 'store_payment_status';
  const FIELD_LABEL = '入金状況';
  const STORE_CUSTOMER_CODE = 'A550';

  const STATUS = {
    unpaid: '未入金',
    partial: '一部入金',
    paid: '入金済み',
  };

  /** App97 計算値・旧印字との互換 */
  const PAID_ALIASES = [STATUS.paid, '入金済'];

  const ALL = [STATUS.unpaid, STATUS.partial, STATUS.paid];

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

  const isStoreCustomer = (customerCode) => norm(customerCode) === STORE_CUSTOMER_CODE;

  const normalizeStatus = (raw) => {
    const s = norm(raw);
    if (!s) {
      return STATUS.unpaid;
    }
    if (PAID_ALIASES.indexOf(s) >= 0) {
      return STATUS.paid;
    }
    if (s === STATUS.partial) {
      return STATUS.partial;
    }
    if (s === STATUS.unpaid) {
      return STATUS.unpaid;
    }
    return '';
  };

  const isKnownStatus = (raw) => normalizeStatus(raw) !== '';

  const isFullyPaid = (raw) => normalizeStatus(raw) === STATUS.paid;

  const isPickupBlockedStatus = (raw) => !isFullyPaid(raw);

  /**
   * App97 getOrderBalance.state → App16 候補値
   * （一括更新は別承認。調査・提案用）
   */
  const suggestFromBalanceState = (balanceState, balanceAmount, paidAmount) => {
    const state = norm(balanceState);
    const bal = Number(balanceAmount);
    const paid = Number(paidAmount);
    if (state === '過剰入金' || state === '入金済' || state === STATUS.paid) {
      return STATUS.paid;
    }
    if (Number.isFinite(bal) && bal <= 0.0001 && Number.isFinite(paid) && paid > 0) {
      return STATUS.paid;
    }
    if (state === STATUS.partial || (Number.isFinite(paid) && paid > 0.0001
      && Number.isFinite(bal) && bal > 0.0001)) {
      return STATUS.partial;
    }
    if (state === STATUS.unpaid || state === '金額なし' || state === '') {
      return STATUS.unpaid;
    }
    return '';
  };

  const unpaidReason = (raw) => {
    const s = normalizeStatus(raw) || STATUS.unpaid;
    if (s === STATUS.partial) {
      return '一部入金のため納品・引き取りできません。店舗受注一覧で「入金済み」に更新してください。';
    }
    return '未入金のため納品・引き取りできません。店舗受注一覧で「入金済み」に更新してください。';
  };

  /**
   * ゲート用: App16 入金状況を優先。空欄は未入金。
   * unpaidHandoverApproved は既存の管理者例外。
   */
  const evaluatePaymentForPickup = (paymentStatus, unpaidHandoverApproved) => {
    const status = normalizeStatus(paymentStatus) || STATUS.unpaid;
    if (isFullyPaid(status)) {
      return { ok: true, status: status };
    }
    if (unpaidHandoverApproved) {
      return { ok: true, status: status, exception: true };
    }
    return {
      ok: false,
      status: status,
      code: 'unpaid',
      reason: unpaidReason(status),
    };
  };

  window.CAYANAS_StorePaymentStatus = {
    VERSION: VERSION,
    FIELD_CODE: FIELD_CODE,
    FIELD_LABEL: FIELD_LABEL,
    STORE_CUSTOMER_CODE: STORE_CUSTOMER_CODE,
    STATUS: STATUS,
    ALL: ALL,
    PAID_ALIASES: PAID_ALIASES,
    norm: norm,
    readValue: readValue,
    isStoreCustomer: isStoreCustomer,
    normalizeStatus: normalizeStatus,
    isKnownStatus: isKnownStatus,
    isFullyPaid: isFullyPaid,
    isPickupBlockedStatus: isPickupBlockedStatus,
    suggestFromBalanceState: suggestFromBalanceState,
    unpaidReason: unpaidReason,
    evaluatePaymentForPickup: evaluatePaymentForPickup,
  };
}());
