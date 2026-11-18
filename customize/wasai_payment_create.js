(function() {
  'use strict';

  /**
   * 和裁士支払明細 App 75 — 作成・確定ロジック
   * 依存: wasai_config.js
   */

  if (!window.CAYANAS_Wasai) {
    console.error('[wasai_payment_create] wasai_config.js を先に読み込んでください。');
    return;
  }

  const W = window.CAYANAS_Wasai;

  const PAYMENT_DETAIL = {
    outboundRecordId: W.LINE.outboundRecordId,
    outboundLineId: W.LINE.outboundLineId,
    manageNo: W.LINE.manageNo,
    inboundDate: W.LINE.inboundDate,
    customerName: W.LINE.customerName,
    clientName: W.LINE.clientName,
    kimonoType: W.LINE.kimonoType,
    processingSummary: W.LINE.processingSummary,
    transactionPrice: W.LINE.transactionPrice,
    paymentRate: W.LINE.paymentRate,
    basePaymentAmount: W.LINE.basePaymentAmount,
    adjustmentAmount: W.LINE.adjustmentAmount,
    linePaymentAmount: W.LINE.linePaymentAmount,
    eligibleLineCount: W.LINE.eligibleLineCount,
  };

  const EXCLUDED_INSPECTION = [
    W.INSPECTION.rework,
    W.INSPECTION.hold,
    W.INSPECTION.ng,
  ];

  /** App75 実フォーム照合（period_fro 等の誤記含む） */
  const PAYMENT_HEADER_FIELD_CANDIDATES = {
    paymentStatementNo: ['payment_statement_no'],
    wasaiCode: ['wasai_code'],
    wasaiName: ['wasai_name'],
    tradeName: ['trade_name'],
    periodFrom: ['period_fro', 'period_from'],
    periodTo: ['period_to'],
    inboundPeriodYm: ['inbound_period_ym'],
    paymentDueDate: ['payment_due_date'],
    paymentTotal: ['payment_total'],
    paymentStatus: ['payment_status'],
    paymentStatementLines: ['payment_statement_lines'],
  };

  let paymentFormProperties = null;

  const loadPaymentFormProperties = async () => {
    if (paymentFormProperties) {
      return paymentFormProperties;
    }

    const resp = await kintone.api(
      kintone.api.url('/k/v1/app/form/fields.json', true),
      'GET',
      { app: W.APP.wasaiPayment }
    );

    paymentFormProperties = resp.properties || {};
    return paymentFormProperties;
  };

  const resolvePaymentFieldCode = (properties, logicalKey) => {
    const candidates = PAYMENT_HEADER_FIELD_CANDIDATES[logicalKey];

    if (!candidates) {
      return W.F[logicalKey] || logicalKey;
    }

    for (let i = 0; i < candidates.length; i += 1) {
      if (properties[candidates[i]]) {
        return candidates[i];
      }
    }

    return candidates[0];
  };

  const buildPaymentPostRecord = async (headerValues, detailRows) => {
    const properties = await loadPaymentFormProperties();
    const record = {};

    Object.keys(headerValues).forEach(function(logicalKey) {
      const fieldCode = resolvePaymentFieldCode(properties, logicalKey);
      const fieldProp = properties[fieldCode];

      if (!fieldProp) {
        return;
      }

      let scalar = headerValues[logicalKey];

      if (scalar === null || scalar === undefined || scalar === '') {
        return;
      }

      if (fieldProp.type === 'DROP_DOWN' || fieldProp.type === 'RADIO_BUTTON') {
        scalar = W.pickDropdownValue(fieldProp, [String(scalar)], String(scalar));
      } else {
        scalar = String(scalar);
      }

      record[fieldCode] = { value: scalar };
    });

    const linesCode = resolvePaymentFieldCode(properties, 'paymentStatementLines');
    const linesProp = properties[linesCode];

    if (linesProp && Array.isArray(detailRows) && detailRows.length > 0) {
      record[linesCode] = { value: detailRows };
    }

    return record;
  };

  const flattenPayableLines = (records) => {
    const result = [];

    records.forEach(function(rec) {
      const table = rec[W.F.outboundLines];

      if (!table || !Array.isArray(table.value)) {
        return;
      }

      table.value.forEach(function(row) {
        result.push({
          outboundRecord: rec,
          outboundRecordId: String(rec.$id.value),
          lineRow: row,
          lineId: String(row.id),
          wasaiCode: String(W.getFieldValue(rec, W.F.wasaiCode) ?? '').trim(),
          manageNo: String(W.getFieldValue(row.value, W.LINE.manageNo) ?? '').trim(),
          inboundDate: String(W.getFieldValue(row.value, W.LINE.inboundDate) ?? '').trim(),
          lineStatus: String(W.getFieldValue(row.value, W.LINE.lineStatus) ?? '').trim(),
          billingStatus: String(W.getFieldValue(row.value, W.LINE.billingStatus) ?? '').trim(),
          inspectionResult: String(W.getFieldValue(row.value, W.LINE.inspectionResult) ?? '').trim(),
          paymentStatementNo: String(W.getFieldValue(row.value, W.LINE.paymentStatementNo) ?? '').trim(),
          lineValues: row.value,
        });
      });
    });

    return result;
  };

  const isPayableLine = (entry, wasaiCode, periodFrom, periodTo) => {
    if (entry.wasaiCode !== wasaiCode) {
      return false;
    }

    if (entry.billingStatus !== W.BILLING_STATUS.unbilled) {
      return false;
    }

    if (entry.paymentStatementNo !== '') {
      return false;
    }

    if (entry.inboundDate === '') {
      return false;
    }

    if (entry.inboundDate < periodFrom || entry.inboundDate > periodTo) {
      return false;
    }

    if (EXCLUDED_INSPECTION.indexOf(entry.inspectionResult) >= 0) {
      return false;
    }

    const okStatus = entry.lineStatus === W.LINE_STATUS.payTarget
      || entry.lineStatus === W.LINE_STATUS.inspectionOk;

    if (!okStatus) {
      return false;
    }

    return true;
  };

  const generatePaymentStatementNo = () => {
    const now = new Date();
    const ymd = now.getFullYear()
      + String(now.getMonth() + 1).padStart(2, '0')
      + String(now.getDate()).padStart(2, '0');

    return 'WP-' + ymd + '-' + String(Date.now()).slice(-6);
  };

  const buildPaymentDetailRow = (entry) => ({
    value: {
      [PAYMENT_DETAIL.outboundRecordId]: { value: entry.outboundRecordId },
      [PAYMENT_DETAIL.outboundLineId]: { value: entry.lineId },
      [PAYMENT_DETAIL.manageNo]: { value: entry.manageNo },
      [PAYMENT_DETAIL.inboundDate]: { value: entry.inboundDate },
      [PAYMENT_DETAIL.customerName]: { value: W.getFieldValue(entry.lineValues, W.LINE.customerName) },
      [PAYMENT_DETAIL.clientName]: { value: W.getFieldValue(entry.lineValues, W.LINE.clientName) },
      [PAYMENT_DETAIL.kimonoType]: { value: W.getFieldValue(entry.lineValues, W.LINE.kimonoType) },
      [PAYMENT_DETAIL.processingSummary]: { value: W.getFieldValue(entry.lineValues, W.LINE.processingSummary) },
      [PAYMENT_DETAIL.transactionPrice]: { value: W.getFieldValue(entry.lineValues, W.LINE.transactionPrice) },
      [PAYMENT_DETAIL.paymentRate]: { value: W.getFieldValue(entry.lineValues, W.LINE.paymentRate) },
      [PAYMENT_DETAIL.basePaymentAmount]: { value: W.getFieldValue(entry.lineValues, W.LINE.basePaymentAmount) },
      [PAYMENT_DETAIL.adjustmentAmount]: { value: W.getFieldValue(entry.lineValues, W.LINE.adjustmentAmount) },
      [PAYMENT_DETAIL.linePaymentAmount]: { value: String(getLinePaymentAmount(entry.lineValues)) },
      [PAYMENT_DETAIL.eligibleLineCount]: { value: W.getFieldValue(entry.lineValues, W.LINE.eligibleLineCount) },
    },
  });

  const getLinePaymentAmount = (lineValues) => {
    const paymentAmount = W.getFieldValue(lineValues, W.LINE.paymentAmount);

    if (paymentAmount !== '' && paymentAmount !== null && paymentAmount !== undefined) {
      return W.toNumber(paymentAmount);
    }

    return W.toNumber(W.getFieldValue(lineValues, W.LINE.basePaymentAmount));
  };

  const sumPaymentTotal = (entries) => entries.reduce(function(sum, entry) {
    return sum + getLinePaymentAmount(entry.lineValues);
  }, 0);

  const markOutboundLines = async (entries, patch, paymentStatementNo) => {
    const byRecord = new Map();

    entries.forEach(function(entry) {
      if (!byRecord.has(entry.outboundRecordId)) {
        byRecord.set(entry.outboundRecordId, {
          record: entry.outboundRecord,
          lineIds: new Set(),
        });
      }

      byRecord.get(entry.outboundRecordId).lineIds.add(entry.lineId);
    });

    const tasks = [];

    byRecord.forEach(function(bundle, recordId) {
      const table = bundle.record[W.F.outboundLines];
      const linePatch = Object.assign({}, patch);

      if (paymentStatementNo !== undefined && paymentStatementNo !== null) {
        linePatch[W.LINE.paymentStatementNo] = paymentStatementNo;
      }

      const rows = table.value.map(function(row) {
        if (!bundle.lineIds.has(String(row.id))) {
          return { id: row.id, value: {} };
        }

        const value = {};

        Object.keys(linePatch).forEach(function(key) {
          value[key] = { value: linePatch[key] };
        });

        return { id: row.id, value: value };
      });

      tasks.push(kintone.api(
        kintone.api.url('/k/v1/record.json', true),
        'PUT',
        {
          app: W.APP.wasaiOutbound,
          id: recordId,
          record: {
            [W.F.outboundLines]: { value: rows },
          },
        }
      ));
    });

    await Promise.all(tasks);
  };

  /**
   * @param {string} wasaiCode
   * @param {string} inboundYm YYYY-MM
   */
  const fetchPayableLines = async (wasaiCode, inboundYm) => {
    const bounds = W.inboundPeriodBounds(inboundYm);
    const records = await W.fetchRecords(
      W.APP.wasaiOutbound,
      W.F.wasaiCode + ' = "' + W.escapeQueryValue(wasaiCode) + '" order by $id desc limit 500'
    );

    const flat = flattenPayableLines(records);

    return flat.filter(function(entry) {
      return isPayableLine(entry, wasaiCode, bounds.from, bounds.to);
    });
  };

  const createPaymentStatement = async (wasaiCode, inboundYm, wasaiName, tradeName) => {
    const bounds = W.inboundPeriodBounds(inboundYm);
    const payable = await fetchPayableLines(wasaiCode, inboundYm);

    if (payable.length === 0) {
      throw new Error('対象となる出庫明細がありません。');
    }

    const paymentStatementNo = generatePaymentStatementNo();
    const paymentTotal = sumPaymentTotal(payable);
    const dueDate = W.paymentDueDateForInboundYm(inboundYm);

    const postRecord = await buildPaymentPostRecord({
      paymentStatementNo: paymentStatementNo,
      wasaiCode: wasaiCode,
      wasaiName: wasaiName || '',
      tradeName: tradeName || '',
      periodFrom: bounds.from,
      periodTo: bounds.to,
      inboundPeriodYm: inboundYm,
      paymentDueDate: dueDate,
      paymentTotal: String(paymentTotal),
      paymentStatus: W.PAYMENT_STATUS.drafting,
    }, payable.map(buildPaymentDetailRow));

    if (Object.keys(postRecord).length === 0) {
      throw new Error('App75にPOST可能なフィールドがありません。フォーム設定を確認してください。');
    }

    const resp = await kintone.api(
      kintone.api.url('/k/v1/record.json', true),
      'POST',
      {
        app: W.APP.wasaiPayment,
        record: postRecord,
      }
    );

    await markOutboundLines(payable, {
      [W.LINE.billingStatus]: W.BILLING_STATUS.drafting,
    });

    return {
      recordId: resp.id,
      paymentStatementNo: paymentStatementNo,
      count: payable.length,
      paymentTotal: paymentTotal,
    };
  };

  const confirmPaymentStatement = async (paymentRecordId) => {
    const resp = await kintone.api(
      kintone.api.url('/k/v1/record.json', true),
      'GET',
      { app: W.APP.wasaiPayment, id: paymentRecordId }
    );

    const record = resp.record;
    const status = String(W.getFieldValue(record, W.F.paymentStatus) ?? '').trim();

    if (status !== W.PAYMENT_STATUS.drafting) {
      throw new Error('「作成中」の明細のみ確定できます。');
    }

    const paymentStatementNo = String(W.getFieldValue(record, W.F.paymentStatementNo) ?? '').trim();
    const detailTable = record[W.F.paymentStatementLines];
    const entries = [];

    if (detailTable && Array.isArray(detailTable.value)) {
      const outboundRecords = await W.fetchRecords(
        W.APP.wasaiOutbound,
        'order by $id desc limit 500'
      );
      const flat = flattenPayableLines(outboundRecords);

      detailTable.value.forEach(function(detailRow) {
        const outboundRecordId = String(W.getFieldValue(detailRow.value, PAYMENT_DETAIL.outboundRecordId) ?? '').trim();
        const outboundLineId = String(W.getFieldValue(detailRow.value, PAYMENT_DETAIL.outboundLineId) ?? '').trim();

        const match = flat.find(function(entry) {
          return entry.outboundRecordId === outboundRecordId
            && entry.lineId === outboundLineId;
        });

        if (match) {
          entries.push(match);
        }
      });
    }

    await markOutboundLines(entries, {
      [W.LINE.billingStatus]: W.BILLING_STATUS.billed,
      [W.LINE.lineStatus]: W.LINE_STATUS.billed,
    }, paymentStatementNo);

    const now = new Date();
    const confirmedAt = now.toISOString();

    await kintone.api(
      kintone.api.url('/k/v1/record.json', true),
      'PUT',
      {
        app: W.APP.wasaiPayment,
        id: paymentRecordId,
        record: {
          [W.F.paymentStatus]: { value: W.PAYMENT_STATUS.confirmed },
          [W.F.confirmedAt]: { value: confirmedAt },
        },
      }
    );
  };

  const cancelPaymentStatement = async (paymentRecordId) => {
    const resp = await kintone.api(
      kintone.api.url('/k/v1/record.json', true),
      'GET',
      { app: W.APP.wasaiPayment, id: paymentRecordId }
    );

    const record = resp.record;
    const status = String(W.getFieldValue(record, W.F.paymentStatus) ?? '').trim();

    if (status !== W.PAYMENT_STATUS.drafting && status !== W.PAYMENT_STATUS.confirmed) {
      throw new Error('取消できる状態ではありません。');
    }

    const detailTable = record[W.F.paymentStatementLines];
    const outboundRecords = await W.fetchRecords(
      W.APP.wasaiOutbound,
      'order by $id desc limit 500'
    );
    const flat = flattenPayableLines(outboundRecords);
    const entries = [];

    if (detailTable && Array.isArray(detailTable.value)) {
      detailTable.value.forEach(function(detailRow) {
        const outboundRecordId = String(W.getFieldValue(detailRow.value, PAYMENT_DETAIL.outboundRecordId) ?? '').trim();
        const outboundLineId = String(W.getFieldValue(detailRow.value, PAYMENT_DETAIL.outboundLineId) ?? '').trim();

        const match = flat.find(function(entry) {
          return entry.outboundRecordId === outboundRecordId
            && entry.lineId === outboundLineId;
        });

        if (match) {
          entries.push(match);
        }
      });
    }

    await markOutboundLines(entries, {
      [W.LINE.billingStatus]: W.BILLING_STATUS.unbilled,
      [W.LINE.lineStatus]: W.LINE_STATUS.inspectionOk,
      [W.LINE.paymentStatementNo]: '',
    }, '');

    await kintone.api(
      kintone.api.url('/k/v1/record.json', true),
      'PUT',
      {
        app: W.APP.wasaiPayment,
        id: paymentRecordId,
        record: {
          [W.F.paymentStatus]: { value: W.PAYMENT_STATUS.cancel },
        },
      }
    );
  };

  const markPaymentPaid = async (paymentRecordId, paymentDate) => {
    const resp = await kintone.api(
      kintone.api.url('/k/v1/record.json', true),
      'GET',
      { app: W.APP.wasaiPayment, id: paymentRecordId }
    );

    const record = resp.record;
    const status = String(W.getFieldValue(record, W.F.paymentStatus) ?? '').trim();

    if (status !== W.PAYMENT_STATUS.confirmed) {
      throw new Error('「確定」状態の明細のみ支払済にできます。');
    }

    const paymentStatementNo = String(W.getFieldValue(record, W.F.paymentStatementNo) ?? '').trim();
    const detailTable = record[W.F.paymentStatementLines];
    const outboundRecords = await W.fetchRecords(
      W.APP.wasaiOutbound,
      'order by $id desc limit 500'
    );
    const flat = flattenPayableLines(outboundRecords);
    const entries = [];

    if (detailTable && Array.isArray(detailTable.value)) {
      detailTable.value.forEach(function(detailRow) {
        const outboundRecordId = String(W.getFieldValue(detailRow.value, PAYMENT_DETAIL.outboundRecordId) ?? '').trim();
        const outboundLineId = String(W.getFieldValue(detailRow.value, PAYMENT_DETAIL.outboundLineId) ?? '').trim();

        const match = flat.find(function(entry) {
          return entry.outboundRecordId === outboundRecordId
            && entry.lineId === outboundLineId;
        });

        if (match) {
          entries.push(match);
        }
      });
    }

    await markOutboundLines(entries, {
      [W.LINE.billingStatus]: W.BILLING_STATUS.paid,
      [W.LINE.lineStatus]: W.LINE_STATUS.paid,
    }, paymentStatementNo);

    await kintone.api(
      kintone.api.url('/k/v1/record.json', true),
      'PUT',
      {
        app: W.APP.wasaiPayment,
        id: paymentRecordId,
        record: {
          [W.F.paymentStatus]: { value: W.PAYMENT_STATUS.paid },
          [W.F.paymentDate]: { value: paymentDate || '' },
        },
      }
    );
  };

  window.CAYANAS_WasaiPayment = {
    fetchPayableLines: fetchPayableLines,
    createPaymentStatement: createPaymentStatement,
    confirmPaymentStatement: confirmPaymentStatement,
    cancelPaymentStatement: cancelPaymentStatement,
    markPaymentPaid: markPaymentPaid,
  };

})();
