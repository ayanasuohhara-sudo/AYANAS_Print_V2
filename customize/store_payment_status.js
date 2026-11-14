(function () {
  'use strict';

  /**
   * A550 店舗入金状況（App16 正本）
   * - 金額・入金日はスマレジ。kintone は状況ラベルのみ。
   * - App21 / App35 / 法人フローは対象外。
   */

  const VERSION = '1.1.0';
  const FIELD_CODE = 'store_payment_status';
  const FIELD_LABEL = '入金状況';
  const STORE_CUSTOMER_CODE = 'A550';

  /** App92 未入金／一部入金の引き取り確認文（承認確定） */
  const SMAREGI_CONFIRM_MESSAGE = 'スマレジで残金の支払いを確認しましたか？';

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

  /** 未入金／一部入金（入金済み以外）→ スマレジ確認ダイアログ対象 */
  const needsSmaregiResidualConfirm = (raw) => !isFullyPaid(raw);

  /** @deprecated 名称互換。未入金／一部入金はハードブロックしない（確認ダイアログへ） */
  const isPickupBlockedStatus = (raw) => needsSmaregiResidualConfirm(raw);

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
      return '一部入金です。スマレジで残金の支払いを確認してから引き取り完了してください。';
    }
    return '未入金です。スマレジで残金の支払いを確認してから引き取り完了してください。';
  };

  /**
   * 一括引き取り用: 未入金／一部入金の対象を明示した確認文。
   * 「確認済み」でも入金状況は自動変更しない（呼び出し側の責務）。
   */
  const buildSmaregiConfirmMessage = (rows) => {
    const list = (rows || []).map((row) => {
      const manageNo = norm(row && (row.manageNo || row.manage_no));
      const st = normalizeStatus(
        row && (row.paymentState || row.storePaymentStatus || row.paymentStatus)
      ) || STATUS.unpaid;
      return manageNo ? (manageNo + '（' + st + '）') : st;
    }).filter(Boolean);
    const header = list.length
      ? ('以下は未入金または一部入金です。\n' + list.join('\n') + '\n\n')
      : '';
    return header + SMAREGI_CONFIRM_MESSAGE;
  };

  /**
   * ゲート用: App16 入金状況。App97 残額は見ない。
   * - 入金済み → OK
   * - 未入金／一部入金 + スマレジ確認済み → OK（入金状況は変更しない）
   * - 未入金／一部入金 + 管理者例外 → OK
   * - それ以外 → needs_smaregi_confirm
   *
   * @param {string} paymentStatus
   * @param {boolean|object} unpaidHandoverApprovedOrOpts
   * @param {boolean} [smaregiResidualConfirmed]
   */
  const evaluatePaymentForPickup = (
    paymentStatus,
    unpaidHandoverApprovedOrOpts,
    smaregiResidualConfirmed
  ) => {
    const status = normalizeStatus(paymentStatus) || STATUS.unpaid;
    let unpaidHandoverApproved = false;
    let smaregiConfirmed = !!smaregiResidualConfirmed;
    if (
      unpaidHandoverApprovedOrOpts
      && typeof unpaidHandoverApprovedOrOpts === 'object'
    ) {
      unpaidHandoverApproved = !!unpaidHandoverApprovedOrOpts.unpaidHandoverApproved;
      if (unpaidHandoverApprovedOrOpts.smaregiResidualConfirmed != null) {
        smaregiConfirmed = !!unpaidHandoverApprovedOrOpts.smaregiResidualConfirmed;
      }
    } else {
      unpaidHandoverApproved = !!unpaidHandoverApprovedOrOpts;
    }

    if (isFullyPaid(status)) {
      return { ok: true, status: status };
    }
    if (unpaidHandoverApproved) {
      return { ok: true, status: status, exception: true };
    }
    if (smaregiConfirmed) {
      return { ok: true, status: status, smaregiConfirmed: true };
    }
    return {
      ok: false,
      status: status,
      code: 'needs_smaregi_confirm',
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
    SMAREGI_CONFIRM_MESSAGE: SMAREGI_CONFIRM_MESSAGE,
    norm: norm,
    readValue: readValue,
    isStoreCustomer: isStoreCustomer,
    normalizeStatus: normalizeStatus,
    isKnownStatus: isKnownStatus,
    isFullyPaid: isFullyPaid,
    needsSmaregiResidualConfirm: needsSmaregiResidualConfirm,
    isPickupBlockedStatus: isPickupBlockedStatus,
    suggestFromBalanceState: suggestFromBalanceState,
    unpaidReason: unpaidReason,
    buildSmaregiConfirmMessage: buildSmaregiConfirmMessage,
    evaluatePaymentForPickup: evaluatePaymentForPickup,
  };
}());
