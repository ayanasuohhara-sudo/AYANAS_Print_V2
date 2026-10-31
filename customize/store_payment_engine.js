(function() {
  'use strict';

  /**
   * 店舗入金 S1 — 税込計算・残額・バリデーション（UI 非依存）
   */

  const cfg = () => {
    if (typeof window.CAYANAS_StorePayment === 'undefined') {
      throw new Error('[store_payment_engine] store_payment_config.js を先に読み込んでください。');
    }
    return window.CAYANAS_StorePayment;
  };

  const escapeQuery = (value) => String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  const readValue = (record, code) => {
    const field = record && record[code];
    if (!field || field.value === null || field.value === undefined) {
      return '';
    }
    return String(field.value).trim();
  };

  const toNumber = (value) => {
    if (value === null || value === undefined || value === '') {
      return 0;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const isValidPersonalCustomerId = (value) => cfg().ID_PATTERN.test(String(value ?? '').trim());

  /**
   * 税端数処理。TAX_ROUNDING: round | floor | ceil
   * 印刷 core.js は Math.round(subtotal * 0.1)。
   */
  const roundTaxYen = (exTax, roundingMode, rate) => {
    const ex = toNumber(exTax);
    const r = rate == null ? cfg().TAX_RATE : Number(rate);
    const raw = ex * r;
    const mode = roundingMode || cfg().TAX_ROUNDING;
    if (mode === 'floor') {
      return Math.floor(raw);
    }
    if (mode === 'ceil') {
      return Math.ceil(raw);
    }
    return Math.round(raw);
  };

  const calcInclusiveFromExclusive = (exTax, roundingMode, rate) => {
    const ex = Math.round(toNumber(exTax));
    const tax = roundTaxYen(ex, roundingMode, rate);
    return {
      exclusive: ex,
      tax: tax,
      inclusive: ex + tax,
    };
  };

  const sumDetailExclusive = (orderRecord) => {
    const C = cfg();
    const table = orderRecord && orderRecord[C.ORDER_FIELDS.detailTable];
    const rows = (table && table.value) || [];
    let sum = 0;
    rows.forEach(function(row) {
      sum += toNumber(row.value && row.value[C.ORDER_FIELDS.detailAmount] && row.value[C.ORDER_FIELDS.detailAmount].value);
    });
    return Math.round(sum);
  };

  const getOrderBilledInclusive = (orderRecord) => {
    const ex = sumDetailExclusive(orderRecord);
    return calcInclusiveFromExclusive(ex);
  };

  /**
   * 有効入金の充当合計（返金はマイナスとして加算）。取消は除外。
   * @param {Array} paymentRecords S1 records
   * @param {string|number} orderRecordId
   */
  const sumAllocatedForOrder = (paymentRecords, orderRecordId) => {
    const C = cfg();
    const HF = C.HEADER_FIELDS;
    const LF = C.LINE_FIELDS;
    const target = String(orderRecordId);
    let sum = 0;

    (paymentRecords || []).forEach(function(rec) {
      const status = readValue(rec, HF.paymentStatus);
      if (status === C.PAYMENT_STATUS.cancelled) {
        return;
      }
      const lines = (rec[HF.lines] && rec[HF.lines].value) || [];
      lines.forEach(function(row) {
        const oid = String(row.value && row.value[LF.orderRecordId] && row.value[LF.orderRecordId].value);
        if (oid !== target) {
          return;
        }
        sum += toNumber(row.value && row.value[LF.allocatedAmount] && row.value[LF.allocatedAmount].value);
      });
    });

    return Math.round(sum * 100) / 100;
  };

  const getOrderBalance = (orderRecord, paymentRecords) => {
    const billed = getOrderBilledInclusive(orderRecord);
    const paid = sumAllocatedForOrder(paymentRecords, orderRecord.$id && orderRecord.$id.value);
    const balance = Math.round((billed.inclusive - paid) * 100) / 100;
    let state = '未入金';
    if (paid > billed.inclusive + 0.0001) {
      state = '過剰入金';
    } else if (balance <= 0 && billed.inclusive > 0) {
      state = '入金済';
    } else if (paid > 0) {
      state = '一部入金';
    }
    return {
      exclusive: billed.exclusive,
      tax: billed.tax,
      billedInclusive: billed.inclusive,
      paid: paid,
      balance: balance,
      state: state,
    };
  };

  /**
   * 一部入金のまま引き取り可能か。原則禁止。管理者承認フラグのみ例外。
   */
  const canPickupWithBalance = (balanceInfo, unpaidHandoverApproved) => {
    if (!balanceInfo) {
      return { ok: false, reason: '残高情報がありません。' };
    }
    if (balanceInfo.balance <= 0) {
      return { ok: true };
    }
    if (unpaidHandoverApproved) {
      return { ok: true, exception: true };
    }
    return {
      ok: false,
      reason: '一部入金のため引き取りできません。全額入金するか、管理者承認（未収入金引き渡し）が必要です。',
    };
  };

  const validatePaymentDraft = (draft) => {
    const C = cfg();
    const errors = [];
    const d = draft || {};

    if (!isValidPersonalCustomerId(d.personalCustomerId)) {
      errors.push('個人顧客IDが不正です。');
    }
    if (!d.transactionId) {
      errors.push('transaction_id が必要です。');
    }
    if (!d.paymentDate) {
      errors.push('入金日が必要です。');
    }

    const lines = d.lines || [];
    if (lines.length === 0) {
      errors.push('充当明細がありません。');
    }

    let allocSum = 0;
    lines.forEach(function(line, index) {
      if (String(line.personalCustomerIdLine || '') !== String(d.personalCustomerId || '')) {
        errors.push('明細' + (index + 1) + ': 個人顧客IDがヘッダと一致しません。');
      }
      if (!line.orderRecordId) {
        errors.push('明細' + (index + 1) + ': App16レコードIDが必要です。');
      }
      const alloc = toNumber(line.allocatedAmount);
      allocSum += alloc;

      if (d.recordKind === C.RECORD_KIND.payment) {
        if (alloc <= 0) {
          errors.push('明細' + (index + 1) + ': 入金の充当額は正の金額にしてください。');
        }
        const maxAlloc = toNumber(line.billedInTax) - toNumber(line.previouslyPaidAmount);
        if (alloc > maxAlloc + 0.0001) {
          errors.push('明細' + (index + 1) + ': 過剰充当です（残額 ' + maxAlloc + '）。');
        }
        if (maxAlloc <= 0) {
          errors.push('明細' + (index + 1) + ': 入金済みのため再入金できません。');
        }
      }

      if (d.recordKind === C.RECORD_KIND.refund) {
        if (alloc >= 0) {
          errors.push('明細' + (index + 1) + ': 返金の充当額はマイナスにしてください。');
        }
        if (!d.relatedRefundOf) {
          errors.push('返金は元入金番号（related_refund_of）が必須です。');
        }
      }
    });

    allocSum = Math.round(allocSum * 100) / 100;
    const headerAmount = toNumber(d.paymentAmount);
    if (Math.abs(allocSum - headerAmount) > 0.0001) {
      errors.push('入金額と明細充当合計が一致しません（入金 ' + headerAmount + ' / 充当 ' + allocSum + '）。');
    }

    if (d.recordKind === C.RECORD_KIND.payment && headerAmount <= 0) {
      errors.push('入金額は正の金額にしてください。');
    }
    if (d.recordKind === C.RECORD_KIND.refund && headerAmount >= 0) {
      errors.push('返金額はマイナスにしてください。');
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      allocationSum: allocSum,
    };
  };

  const detectBilledDrift = (line, currentOrderRecord) => {
    const current = getOrderBilledInclusive(currentOrderRecord);
    const snap = toNumber(line && line.billedInTax);
    const drift = Math.round((current.inclusive - snap) * 100) / 100;
    return {
      snapshotInclusive: snap,
      currentInclusive: current.inclusive,
      drift: drift,
      changed: Math.abs(drift) > 0.0001,
    };
  };

  const createTransactionId = () => {
    const rand = Math.random().toString(36).slice(2, 10);
    return 'STP-' + Date.now() + '-' + rand;
  };

  window.CAYANAS_StorePayment_Engine = {
    readValue: readValue,
    toNumber: toNumber,
    isValidPersonalCustomerId: isValidPersonalCustomerId,
    roundTaxYen: roundTaxYen,
    calcInclusiveFromExclusive: calcInclusiveFromExclusive,
    sumDetailExclusive: sumDetailExclusive,
    getOrderBilledInclusive: getOrderBilledInclusive,
    sumAllocatedForOrder: sumAllocatedForOrder,
    getOrderBalance: getOrderBalance,
    canPickupWithBalance: canPickupWithBalance,
    validatePaymentDraft: validatePaymentDraft,
    detectBilledDrift: detectBilledDrift,
    createTransactionId: createTransactionId,
    escapeQuery: escapeQuery,
  };
}());
