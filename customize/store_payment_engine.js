(function() {
  'use strict';

  /**
   * 店舗入金 S1 — 税込計算・残額・バリデーション・会計/引き取り/日次照合（UI 非依存）
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

  const normalizeBarcode = (value) => {
    let text = String(value ?? '').replace(/[\r\n\t]/g, '').trim();
    const wrapped = text.match(/^\*(.+)\*$/);
    if (wrapped) {
      text = wrapped[1].trim();
    }
    return text;
  };

  const todayYmd = (date) => {
    const d = date instanceof Date ? date : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  };

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

  const joinItemNames = (orderRecord) => {
    const C = cfg();
    const table = orderRecord && orderRecord[C.ORDER_FIELDS.detailTable];
    const rows = (table && table.value) || [];
    const names = [];
    rows.forEach(function(row) {
      const name = String(row.value && row.value[C.ORDER_FIELDS.detailItemName] && row.value[C.ORDER_FIELDS.detailItemName].value || '').trim();
      if (name) {
        names.push(name);
      }
    });
    return names.join(' / ');
  };

  const getOrderBilledInclusive = (orderRecord) => {
    const ex = sumDetailExclusive(orderRecord);
    return calcInclusiveFromExclusive(ex);
  };

  /**
   * 有効入金の充当合計（返金はマイナスとして加算）。取消は除外。
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

    const seenOrderIds = new Set();
    let allocSum = 0;
    lines.forEach(function(line, index) {
      if (String(line.personalCustomerIdLine || '') !== String(d.personalCustomerId || '')) {
        errors.push('明細' + (index + 1) + ': 個人顧客IDがヘッダと一致しません。');
      }
      if (!line.orderRecordId) {
        errors.push('明細' + (index + 1) + ': App16レコードIDが必要です。');
      }
      const oid = String(line.orderRecordId || '');
      if (oid && seenOrderIds.has(oid)) {
        errors.push('明細' + (index + 1) + ': 同一受注の重複充当です。');
      }
      if (oid) {
        seenOrderIds.add(oid);
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

  const buildManageNoQuery = (manageNo) => {
    const C = cfg();
    const mn = normalizeBarcode(manageNo);
    if (!mn) {
      return '';
    }
    return C.ORDER_FIELDS.manageNo + ' = "' + escapeQuery(mn) + '"'
      + ' and ' + C.ORDER_FIELDS.customerCode + ' = "' + escapeQuery(C.STORE_CUSTOMER_CODE) + '"';
  };

  const buildOpenOrdersByCustomerQuery = (personalCustomerId) => {
    const C = cfg();
    const id = String(personalCustomerId ?? '').trim();
    if (!isValidPersonalCustomerId(id)) {
      return '';
    }
    return C.ORDER_FIELDS.personalCustomerId + ' = "' + escapeQuery(id) + '"'
      + ' and ' + C.ORDER_FIELDS.customerCode + ' = "' + escapeQuery(C.STORE_CUSTOMER_CODE) + '"'
      + ' and (' + C.ORDER_FIELDS.deliveryStatus + ' not in ("' + escapeQuery(C.DELIVERY.done) + '")'
      + ' or ' + C.ORDER_FIELDS.deliveryStatus + ' in (""))'
      + ' order by ' + C.ORDER_FIELDS.manageNo + ' asc limit ' + C.UI.pageLimit;
  };

  const buildPcmIdQuery = (personalCustomerId) => {
    const C = cfg();
    const id = String(personalCustomerId ?? '').trim();
    if (!isValidPersonalCustomerId(id)) {
      return '';
    }
    return C.PCM_FIELDS.personalCustomerId + ' = "' + escapeQuery(id) + '" limit 1';
  };

  const buildPcmSearchQuery = (criteria) => {
    const C = cfg();
    const F = C.PCM_FIELDS;
    const c = criteria || {};
    const parts = [];
    const id = String(c.personalCustomerId ?? '').trim();
    if (id) {
      if (isValidPersonalCustomerId(id)) {
        parts.push(F.personalCustomerId + ' = "' + escapeQuery(id) + '"');
      } else {
        parts.push(F.personalCustomerId + ' like "' + escapeQuery(id) + '"');
      }
    }
    const name = String(c.customerName ?? '').trim();
    if (name) {
      parts.push(F.customerName + ' like "' + escapeQuery(name) + '"');
    }
    const phone = String(c.phone ?? '').trim();
    if (phone) {
      parts.push('('
        + F.phone + ' like "' + escapeQuery(phone) + '"'
        + ' or '
        + F.mobilePhone + ' like "' + escapeQuery(phone) + '"'
        + ')');
    }
    if (parts.length === 0) {
      return '';
    }
    return '(' + parts.join(' or ') + ') order by ' + F.personalCustomerId + ' asc limit 50';
  };

  const buildPaymentsByOrderIdsQuery = (orderRecordIds) => {
    const C = cfg();
    const ids = (orderRecordIds || [])
      .map(function(id) { return String(id).trim(); })
      .filter(Boolean);
    if (ids.length === 0) {
      return '';
    }
    const unique = Array.from(new Set(ids));
    // サブテーブル条件は kintone ではヘッダ検索にし、クライアントで絞り込むため
    // personal_customer 単位取得の補助として日付なし全件は重い。呼び出し側で顧客単位取得を推奨。
    return C.HEADER_FIELDS.paymentStatus + ' not in ("' + escapeQuery(C.PAYMENT_STATUS.cancelled) + '")'
      + ' order by ' + C.HEADER_FIELDS.paymentDate + ' desc limit 500';
  };

  const buildPaymentsByCustomerQuery = (personalCustomerId) => {
    const C = cfg();
    const id = String(personalCustomerId ?? '').trim();
    if (!isValidPersonalCustomerId(id)) {
      return '';
    }
    return C.HEADER_FIELDS.personalCustomerId + ' = "' + escapeQuery(id) + '"'
      + ' order by ' + C.HEADER_FIELDS.paymentDate + ' desc, レコード番号 desc limit 200';
  };

  const buildPaymentsByDateQuery = (paymentDate) => {
    const C = cfg();
    const d = String(paymentDate ?? '').trim();
    if (!d) {
      return '';
    }
    return C.HEADER_FIELDS.paymentDate + ' = "' + escapeQuery(d) + '"'
      + ' and ' + C.HEADER_FIELDS.recordKind + ' in ("' + escapeQuery(C.RECORD_KIND.payment) + '")'
      + ' and ' + C.HEADER_FIELDS.paymentStatus + ' in ("' + escapeQuery(C.PAYMENT_STATUS.active) + '")'
      + ' order by ' + C.HEADER_FIELDS.storePaymentNo + ' asc limit 500';
  };

  /**
   * App16 + S1 から画面行を組み立て。氏名だけでは確定しない。
   */
  const buildOrderAccountingRow = (orderRecord, paymentRecords) => {
    const C = cfg();
    const F = C.ORDER_FIELDS;
    const balance = getOrderBalance(orderRecord, paymentRecords);
    const recordId = readValue(orderRecord, '$id') || (orderRecord.$id && orderRecord.$id.value);
    return {
      orderRecordId: String(recordId),
      revision: readValue(orderRecord, F.revision) || (orderRecord.$revision && orderRecord.$revision.value) || '',
      manageNo: readValue(orderRecord, F.manageNo),
      personalCustomerId: readValue(orderRecord, F.personalCustomerId),
      clientName: readValue(orderRecord, F.clientName),
      kimonoType: readValue(orderRecord, F.kimonoType),
      itemNames: joinItemNames(orderRecord),
      processStatus: readValue(orderRecord, F.processStatus),
      locationStatus: readValue(orderRecord, F.locationStatus),
      deliveryStatus: readValue(orderRecord, F.deliveryStatus),
      deliveryNo: readValue(orderRecord, F.deliveryNo),
      exclusive: balance.exclusive,
      tax: balance.tax,
      billedInclusive: balance.billedInclusive,
      paid: balance.paid,
      balance: balance.balance,
      state: balance.state,
      selectable: balance.balance > 0.0001,
      pickupEligible: balance.balance <= 0.0001
        && readValue(orderRecord, F.deliveryStatus) !== C.DELIVERY.done,
    };
  };

  const buildAllocationLinesFromSelection = (rows, allocationMode) => {
    const mode = allocationMode || 'full_balance';
    const lines = [];
    let sum = 0;
    (rows || []).forEach(function(row) {
      if (!row || !row.selectable) {
        return;
      }
      let alloc = mode === 'custom'
        ? toNumber(row.allocateAmount)
        : toNumber(row.balance);
      if (alloc <= 0) {
        return;
      }
      const previously = toNumber(row.paid);
      const billed = toNumber(row.billedInclusive);
      const balanceAfter = Math.round((billed - previously - alloc) * 100) / 100;
      lines.push({
        orderRecordId: String(row.orderRecordId),
        manageNo: row.manageNo,
        personalCustomerIdLine: row.personalCustomerId,
        kimonoTypeSnapshot: row.kimonoType || '',
        billedExTax: row.exclusive,
        billedInTax: billed,
        previouslyPaidAmount: previously,
        allocatedAmount: alloc,
        balanceAfterLine: balanceAfter,
        lineNote: '',
      });
      sum += alloc;
    });
    return {
      lines: lines,
      paymentAmount: Math.round(sum * 100) / 100,
    };
  };

  const buildKintonePaymentRecord = (draft, meta) => {
    const C = cfg();
    const HF = C.HEADER_FIELDS;
    const LF = C.LINE_FIELDS;
    const d = draft || {};
    const m = meta || {};
    const lines = (d.lines || []).map(function(line) {
      return {
        value: {
          [LF.orderRecordId]: { value: String(line.orderRecordId) },
          [LF.manageNo]: { value: String(line.manageNo || '') },
          [LF.personalCustomerIdLine]: { value: String(line.personalCustomerIdLine || '') },
          [LF.kimonoTypeSnapshot]: { value: String(line.kimonoTypeSnapshot || '') },
          [LF.billedExTax]: { value: String(line.billedExTax) },
          [LF.billedInTax]: { value: String(line.billedInTax) },
          [LF.previouslyPaidAmount]: { value: String(line.previouslyPaidAmount) },
          [LF.allocatedAmount]: { value: String(line.allocatedAmount) },
          [LF.balanceAfterLine]: { value: String(line.balanceAfterLine) },
          [LF.lineNote]: { value: String(line.lineNote || '') },
        },
      };
    });

    const record = {
      [HF.storePaymentNo]: { value: String(m.storePaymentNo || d.storePaymentNo || '') },
      [HF.personalCustomerId]: { value: String(d.personalCustomerId || '') },
      [HF.clientNameSnapshot]: { value: String(d.clientNameSnapshot || '') },
      [HF.paymentDate]: { value: String(d.paymentDate || '') },
      [HF.paymentAmount]: { value: String(d.paymentAmount) },
      [HF.paymentMethod]: { value: String(d.paymentMethod || C.PAYMENT_METHOD.cash) },
      [HF.posTransactionId]: { value: String(d.posTransactionId || '') },
      [HF.transactionId]: { value: String(d.transactionId || '') },
      [HF.paymentStatus]: { value: C.PAYMENT_STATUS.active },
      [HF.paymentChannel]: { value: String(d.paymentChannel || C.PAYMENT_CHANNEL.store) },
      [HF.paymentTiming]: { value: String(d.paymentTiming || '') },
      [HF.recordKind]: { value: String(d.recordKind || C.RECORD_KIND.payment) },
      [HF.relatedRefundOf]: { value: String(d.relatedRefundOf || '') },
      [HF.notes]: { value: String(d.notes || '') },
      [HF.lines]: { value: lines },
    };

    if (m.paymentStaffCodes && m.paymentStaffCodes.length) {
      record[HF.paymentStaff] = {
        value: m.paymentStaffCodes.map(function(code) {
          return { code: code };
        }),
      };
    }

    return record;
  };

  /**
   * 引き取り完了 PUT。location/process/work は変更しない（App92 在庫整合・法人と分離）。
   */
  const buildPickupPutRecord = (deliveryDate) => {
    const C = cfg();
    const F = C.ORDER_FIELDS;
    const record = {
      [F.deliveryStatus]: { value: C.DELIVERY.done },
    };
    const date = String(deliveryDate || todayYmd()).trim();
    if (date) {
      record[F.deliveryDate] = { value: date };
    }
    return record;
  };

  const isPickupAlreadyDone = (orderRecord) => {
    const C = cfg();
    return readValue(orderRecord, C.ORDER_FIELDS.deliveryStatus) === C.DELIVERY.done;
  };

  /**
   * 日次照合: S1 有効入金合計 vs スマレジ手入力（または CSV 合算）。
   */
  const summarizeDailyPayments = (paymentRecords) => {
    const C = cfg();
    const HF = C.HEADER_FIELDS;
    let total = 0;
    let count = 0;
    const byMethod = {};
    const rows = [];

    (paymentRecords || []).forEach(function(rec) {
      const status = readValue(rec, HF.paymentStatus);
      const kind = readValue(rec, HF.recordKind);
      if (status !== C.PAYMENT_STATUS.active) {
        return;
      }
      if (kind && kind !== C.RECORD_KIND.payment) {
        return;
      }
      const amount = toNumber(readValue(rec, HF.paymentAmount));
      const method = readValue(rec, HF.paymentMethod) || '(未設定)';
      total += amount;
      count += 1;
      byMethod[method] = Math.round(((byMethod[method] || 0) + amount) * 100) / 100;
      rows.push({
        storePaymentNo: readValue(rec, HF.storePaymentNo),
        personalCustomerId: readValue(rec, HF.personalCustomerId),
        paymentAmount: amount,
        paymentMethod: method,
        posTransactionId: readValue(rec, HF.posTransactionId),
        transactionId: readValue(rec, HF.transactionId),
      });
    });

    return {
      count: count,
      total: Math.round(total * 100) / 100,
      byMethod: byMethod,
      rows: rows,
    };
  };

  const compareDailyReconcile = (s1Summary, smaregiAmount) => {
    const s1 = toNumber(s1Summary && s1Summary.total);
    const pos = toNumber(smaregiAmount);
    const diff = Math.round((s1 - pos) * 100) / 100;
    return {
      s1Total: s1,
      smaregiTotal: pos,
      diff: diff,
      matched: Math.abs(diff) < 0.0001,
    };
  };

  window.CAYANAS_StorePayment_Engine = {
    readValue: readValue,
    toNumber: toNumber,
    isValidPersonalCustomerId: isValidPersonalCustomerId,
    normalizeBarcode: normalizeBarcode,
    todayYmd: todayYmd,
    roundTaxYen: roundTaxYen,
    calcInclusiveFromExclusive: calcInclusiveFromExclusive,
    sumDetailExclusive: sumDetailExclusive,
    joinItemNames: joinItemNames,
    getOrderBilledInclusive: getOrderBilledInclusive,
    sumAllocatedForOrder: sumAllocatedForOrder,
    getOrderBalance: getOrderBalance,
    canPickupWithBalance: canPickupWithBalance,
    validatePaymentDraft: validatePaymentDraft,
    detectBilledDrift: detectBilledDrift,
    createTransactionId: createTransactionId,
    escapeQuery: escapeQuery,
    buildManageNoQuery: buildManageNoQuery,
    buildOpenOrdersByCustomerQuery: buildOpenOrdersByCustomerQuery,
    buildPcmIdQuery: buildPcmIdQuery,
    buildPcmSearchQuery: buildPcmSearchQuery,
    buildPaymentsByOrderIdsQuery: buildPaymentsByOrderIdsQuery,
    buildPaymentsByCustomerQuery: buildPaymentsByCustomerQuery,
    buildPaymentsByDateQuery: buildPaymentsByDateQuery,
    buildOrderAccountingRow: buildOrderAccountingRow,
    buildAllocationLinesFromSelection: buildAllocationLinesFromSelection,
    buildKintonePaymentRecord: buildKintonePaymentRecord,
    buildPickupPutRecord: buildPickupPutRecord,
    isPickupAlreadyDone: isPickupAlreadyDone,
    summarizeDailyPayments: summarizeDailyPayments,
    compareDailyReconcile: compareDailyReconcile,
  };
}());
