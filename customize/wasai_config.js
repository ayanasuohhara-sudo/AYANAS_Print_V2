(function() {
  'use strict';

  /**
   * 和裁士管理（W1/W2/W3）共通定数・ユーティリティ
   * WASAI_JS_VERSION: 1.0.0
   */

  const WASAI_JS_VERSION = '1.0.2';

  const APP = {
    order: 16,
    product: 13,
    wasaiMaster: 73,
    wasaiOutbound: 74,
    wasaiPayment: 75,
    outsourceOutbound: 27,
    overseasOutbound: 28,
  };

  const F = {
    wasaiCode: 'wasai_code',
    wasaiName: 'wasai_name',
    tradeName: 'trade_name',
    registrationStatus: 'registration_status',
    shipDate: '日ship_date',
    returnDate: 'return_date',
    outboundStatus: 'outbound_status',
    barcodeInput: 'barcode_input',
    outboundLines: 'wasai_outbound_lines',
    paymentSnapshots: 'wasai_payment_item_snapshots',
    paymentStatementNo: 'payment_statement_no',
    paymentStatementLines: 'payment_statement_lines',
    periodFrom: 'period_from',
    periodTo: 'period_to',
    paymentDueDate: 'payment_due_date',
    paymentTotal: 'payment_total',
    paymentDate: 'payment_date',
    paymentStatus: 'payment_status',
    confirmedAt: 'confirmed_at',
    inboundPeriodYm: 'inbound_period_ym',
  };

  const LINE = {
    manageNo: 'manage_no',
    orderRecordId: 'order_record_id',
    customerCode: 'customer_code',
    customerName: 'customer_name',
    clientName: 'client_name',
    kimonoTypeCode: 'kimono_type_code',
    kimonoType: 'kimono_type',
    kimonoSpec: 'kimono_spec',
    deadline: 'deadline',
    processingSummary: 'processing_summary',
    lineStatus: 'line_status',
    billingStatus: 'billing_status',
    paymentStatementNo: 'payment_statement_no',
    inboundDate: 'inbound_date',
    inspectionDate: 'inspection_date',
    inspectionResult: 'inspection_result',
    reworkNote: 'rework_note',
    eligibleLineCount: 'eligible_line_coun',
    transactionPrice: 'transaction_price',
    paymentRate: 'payment_rate',
    basePaymentAmount: 'base_payment_amount',
    adjustmentAmount: 'adjustment_amount',
    paymentAmount: 'payment_amount',
    outboundLineKey: 'outbound_line_key',
    orderDetailRowId: 'order_detail_row_id',
    itemCode: 'item_code',
    itemName: 'item_name',
    subcategory: 'subcategory',
    lineBasePaymentAmount: 'line_base_payment_amount',
    snapshotManageNo: 'manage_no_0',
    snapshotTransactionPrice: 'transaction_price_0',
    snapshotPaymentRate: 'payment_rate_0',
    outboundRecordId: 'outbound_record_id',
    outboundLineId: 'outbound_line_id',
    linePaymentAmount: 'line_payment_amount',
  };

  const ORDER = {
    manageNo: 'manage_no',
    customerCode: 'customer_code',
    customerName: 'customer_name',
    clientName: 'client_name',
    kimonoTypeCode: 'kimono_type_code',
    kimonoType: 'kimono_type',
    kimonoSpec: 'kimono_spec',
    deadline: 'deadline',
    detailTable: 'detail_table',
    processStatus: 'process_status',
    locationStatus: 'location_status',
    wasaiInDate: 'wasai_in_date',
  };

  const ELIGIBLE_SUBCATEGORIES = ['国内仕立', '修理'];
  const A550_CUSTOMER_CODE = 'A550';
  const PAYMENT_RATE_DEFAULT = 0.7;
  const PAYMENT_RATE_A550 = 0.65;

  const LINE_STATUS = {
    outbound: '出庫中',
    inbound: '入庫済',
    inspectionOk: '検品OK',
    rework: '再加工',
    hold: '保留',
    payTarget: '支払対象',
    billed: '計上済',
    paid: '支払済',
  };

  const BILLING_STATUS = {
    unbilled: '未計上',
    drafting: '明細作成中',
    billed: '計上済',
    paid: '支払済',
  };

  const INSPECTION = {
    ok: 'OK',
    rework: '再加工',
    hold: '保留',
    ng: '検品NG',
  };

  const ORDER_WASAI_PROCESS = '和裁士作業中';
  const ORDER_WASAI_LOCATION = '和裁士';
  const ORDER_WASAI_RETURN_PROCESS = '和裁士戻り';
  const ORDER_HQ_LOCATION = '本社';

  const OUTBOUND_HEADER_STATUS = '出庫確定';

  const PAYMENT_STATUS = {
    drafting: '作成中',
    confirmed: '確定',
    paid: '支払済',
    cancel: '取消',
  };

  const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const escapeQueryValue = (value) => String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  /** ドロップダウン・ステータス等（= 不可のフィールド） */
  const queryInSingle = (fieldCode, value) => (
    fieldCode + ' in ("' + escapeQueryValue(value) + '")'
  );

  const formatKintoneError = (err) => {
    let message = err?.message || String(err);

    if (err?.errors && typeof err.errors === 'object') {
      const lines = [];

      Object.keys(err.errors).forEach(function(key) {
        const entry = err.errors[key];
        const detail = entry?.messages ? entry.messages.join(', ') : String(entry);
        lines.push(key + ': ' + detail);
      });

      if (lines.length > 0) {
        message += '\n\n' + lines.join('\n');
      }
    }

    return message;
  };

  /** REST API の DROP_DOWN / SINGLE_SELECT: options は配列または { 選択肢名: { label, index } } */
  const getDropdownOptionEntries = (fieldProp) => {
    if (!fieldProp || !fieldProp.options) {
      return [];
    }

    const opts = fieldProp.options;

    if (Array.isArray(opts)) {
      return opts.map(function(option) {
        const name = option.name || option.label || '';

        return name ? { name: name, label: option.label || name } : null;
      }).filter(Boolean);
    }

    if (typeof opts === 'object') {
      return Object.keys(opts).map(function(name) {
        const entry = opts[name] || {};

        return {
          name: name,
          label: entry.label || name,
        };
      });
    }

    return [];
  };

  const getDropdownOptionNames = (fieldProp) => {
    return getDropdownOptionEntries(fieldProp).map(function(entry) {
      return entry.name;
    }).filter(Boolean);
  };

  /**
   * @param {boolean} [strictOnlyPreferred] true のとき、preferred に無い値は返さない（先頭選択肢にもフォールバックしない）
   */
  const pickDropdownValue = (fieldProp, preferredValues, fallback, strictOnlyPreferred) => {
    const entries = getDropdownOptionEntries(fieldProp);
    const names = entries.map(function(entry) {
      return entry.name;
    });

    if (!fieldProp || entries.length === 0) {
      if (strictOnlyPreferred) {
        return fallback ?? '';
      }

      return fallback || preferredValues[0] || '';
    }

    for (let i = 0; i < preferredValues.length; i += 1) {
      const preferred = preferredValues[i];

      for (let j = 0; j < entries.length; j += 1) {
        const entry = entries[j];

        if (entry.name === preferred || entry.label === preferred) {
          return entry.name;
        }
      }
    }

    if (strictOnlyPreferred) {
      return fallback ?? '';
    }

    return fallback || names[0] || '';
  };

  const getFieldValue = (record, fieldCode) => {
    const field = record?.[fieldCode];

    if (!field || field.value === null || field.value === undefined) {
      return '';
    }

    return field.value;
  };

  const expandManageNoCandidates = (manageNo) => {
    const normalized = String(manageNo ?? '').trim();

    if (normalized === '') {
      return [];
    }

    const candidates = [normalized];
    const withoutLeadingZeros = normalized.replace(/^0+(?=\d)/, '');

    if (withoutLeadingZeros !== '' && withoutLeadingZeros !== normalized) {
      candidates.push(withoutLeadingZeros);
    }

    if (/^\d+$/.test(normalized)) {
      const padded9 = normalized.padStart(9, '0');

      if (padded9 !== normalized && !candidates.includes(padded9)) {
        candidates.push(padded9);
      }
    }

    return candidates;
  };

  const fetchRecords = async (appId, query) => {
    const resp = await kintone.api(
      kintone.api.url('/k/v1/records.json', true),
      'GET',
      { app: appId, query: query }
    );

    return resp.records ?? [];
  };

  const fetchOrderByManageNo = async (manageNo) => {
    const candidates = expandManageNoCandidates(manageNo);

    for (let i = 0; i < candidates.length; i += 1) {
      const records = await fetchRecords(
        APP.order,
        ORDER.manageNo + ' = "' + escapeQueryValue(candidates[i]) + '" limit 1'
      );

      if (records[0]) {
        return records[0];
      }
    }

    return null;
  };

  const fetchProduct = async (itemCode, itemName) => {
    const code = String(itemCode ?? '').trim();

    if (code !== '') {
      const byCode = await fetchRecords(
        APP.product,
        'item_code = "' + escapeQueryValue(code) + '" limit 1'
      );

      if (byCode[0]) {
        return byCode[0];
      }
    }

    const name = String(itemName ?? '').trim();

    if (name === '') {
      return null;
    }

    const byName = await fetchRecords(
      APP.product,
      'item_name = "' + escapeQueryValue(name) + '" limit 1'
    );

    return byName[0] ?? null;
  };

  const getProductSubcategory = (product) => (
    String(getFieldValue(product, 'subcategory') ?? '').trim()
  );

  const isEligibleSubcategory = (subcategory) => (
    ELIGIBLE_SUBCATEGORIES.indexOf(subcategory) >= 0
  );

  const getPaymentRate = (customerCode) => (
    String(customerCode ?? '').trim() === A550_CUSTOMER_CODE
      ? PAYMENT_RATE_A550
      : PAYMENT_RATE_DEFAULT
  );

  const getLineTransactionPrice = (detailRow) => {
    const rowValue = detailRow?.value ?? detailRow ?? {};
    const amount = toNumber(rowValue.amount?.value ?? rowValue.amount);
    const unitPrice = toNumber(rowValue.unit_price?.value ?? rowValue.unit_price);
    const qty = toNumber(rowValue.qty?.value ?? rowValue.qty) || 1;

    if (amount > 0) {
      return amount;
    }

    return unitPrice * qty;
  };

  const getDetailTableRows = (orderRecord) => {
    const table = orderRecord?.[ORDER.detailTable];

    if (!table || !Array.isArray(table.value)) {
      return [];
    }

    return table.value;
  };

  const buildEligiblePaymentItems = async (orderRecord) => {
    const rows = getDetailTableRows(orderRecord);
    const items = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const itemCode = String(getFieldValue(row.value, 'item_code') ?? '').trim();
      const itemName = String(getFieldValue(row.value, 'item_name') ?? '').trim();

      if (!itemName && !itemCode) {
        continue;
      }

      const product = await fetchProduct(itemCode, itemName);
      const subcategory = getProductSubcategory(product);

      if (!isEligibleSubcategory(subcategory)) {
        continue;
      }

      const transactionPrice = getLineTransactionPrice(row);
      const paymentRate = getPaymentRate(getFieldValue(orderRecord, ORDER.customerCode));
      const lineBasePaymentAmount = transactionPrice * paymentRate;

      items.push({
        orderDetailRowId: String(row.id ?? ''),
        itemCode: itemCode || String(getFieldValue(product, 'item_code') ?? '').trim(),
        itemName: itemName || String(getFieldValue(product, 'item_name') ?? '').trim(),
        subcategory: subcategory,
        transactionPrice: transactionPrice,
        paymentRate: paymentRate,
        lineBasePaymentAmount: lineBasePaymentAmount,
      });
    }

    return items;
  };

  const sumField = (items, key) => items.reduce((sum, item) => sum + toNumber(item[key]), 0);

  const lastDayOfMonth = (year, monthIndex0) => new Date(year, monthIndex0 + 1, 0);

  const formatDateYmd = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');

    return y + '-' + m + '-' + d;
  };

  /** 入庫月（YYYY-MM）→ 支払予定日（翌月末） */
  const paymentDueDateForInboundYm = (ym) => {
    const parts = String(ym ?? '').split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);

    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return '';
    }

    return formatDateYmd(new Date(year, month, 0));
  };

  const inboundPeriodBounds = (ym) => {
    const parts = String(ym ?? '').split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);

    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return { from: '', to: '' };
    }

    const from = formatDateYmd(new Date(year, month - 1, 1));
    const to = formatDateYmd(lastDayOfMonth(year, month - 1));

    return { from: from, to: to };
  };

  let orderFormProperties = null;

  const loadOrderFormProperties = async () => {
    if (orderFormProperties) {
      return orderFormProperties;
    }

    const resp = await kintone.api(
      kintone.api.url('/k/v1/app/form/fields.json', true),
      'GET',
      { app: APP.order }
    );

    orderFormProperties = resp.properties || {};
    return orderFormProperties;
  };

  /**
   * @param {'outbound'|'inbound'} mode
   * @returns {Promise<{skipped: boolean, message?: string}>}
   */
  const updateOrderForWasai = async (orderRecord, mode, inboundDateYmd) => {
    const properties = await loadOrderFormProperties();
    const processField = properties[ORDER.processStatus];
    const locationField = properties[ORDER.locationStatus];

    const processCandidates = mode === 'outbound'
      ? [ORDER_WASAI_PROCESS, '和裁士作業中']
      : [ORDER_WASAI_RETURN_PROCESS, '和裁士戻り', '外注戻り'];
    const locationCandidates = mode === 'outbound'
      ? [ORDER_WASAI_LOCATION, '和裁士']
      : [ORDER_HQ_LOCATION, '本社'];

    const processValue = pickDropdownValue(processField, processCandidates, '', true);
    const locationValue = pickDropdownValue(locationField, locationCandidates, '', true);

    if (!processValue || !locationValue) {
      return {
        skipped: true,
        message:
          'App16の選択肢に '
          + processCandidates[0] + ' / ' + locationCandidates[0]
          + ' がありません。受注明細は更新していません（App74出庫は登録済み）。',
      };
    }

    const record = {
      [ORDER.processStatus]: { value: processValue },
      [ORDER.locationStatus]: { value: locationValue },
    };

    if (mode === 'inbound' && inboundDateYmd && properties[ORDER.wasaiInDate]) {
      record[ORDER.wasaiInDate] = { value: inboundDateYmd };
    }

    try {
      await kintone.api(
        kintone.api.url('/k/v1/record.json', true),
        'PUT',
        {
          app: APP.order,
          id: orderRecord.$id.value,
          record: record,
        }
      );
    } catch (err) {
      const detail = formatKintoneError(err);

      if (detail.indexOf('選択肢') >= 0 || detail.indexOf(ORDER.wasaiInDate) >= 0) {
        if (mode === 'inbound' && record[ORDER.wasaiInDate]) {
          delete record[ORDER.wasaiInDate];

          try {
            await kintone.api(
              kintone.api.url('/k/v1/record.json', true),
              'PUT',
              {
                app: APP.order,
                id: orderRecord.$id.value,
                record: {
                  [ORDER.processStatus]: record[ORDER.processStatus],
                  [ORDER.locationStatus]: record[ORDER.locationStatus],
                },
              }
            );

            return { skipped: false };
          } catch (retryErr) {
            const retryDetail = formatKintoneError(retryErr);

            if (retryDetail.indexOf('選択肢') >= 0) {
              return {
                skipped: true,
                message:
                  'App16の工程・保管場所を更新できませんでした（選択肢不一致）。\n' + retryDetail,
              };
            }

            throw retryErr;
          }
        }

        return {
          skipped: true,
          message:
            'App16の工程・保管場所を更新できませんでした（選択肢不一致）。'
            + ' App74出庫は登録済みの可能性があります。\n' + detail,
        };
      }

      throw err;
    }

    return { skipped: false };
  };

  window.CAYANAS_Wasai = {
    VERSION: WASAI_JS_VERSION,
    APP: APP,
    F: F,
    LINE: LINE,
    ORDER: ORDER,
    ELIGIBLE_SUBCATEGORIES: ELIGIBLE_SUBCATEGORIES,
    LINE_STATUS: LINE_STATUS,
    BILLING_STATUS: BILLING_STATUS,
    INSPECTION: INSPECTION,
    PAYMENT_STATUS: PAYMENT_STATUS,
    ORDER_WASAI_PROCESS: ORDER_WASAI_PROCESS,
    ORDER_WASAI_LOCATION: ORDER_WASAI_LOCATION,
    OUTBOUND_HEADER_STATUS: OUTBOUND_HEADER_STATUS,
    toNumber: toNumber,
    escapeQueryValue: escapeQueryValue,
    queryInSingle: queryInSingle,
    formatKintoneError: formatKintoneError,
    getDropdownOptionNames: getDropdownOptionNames,
    pickDropdownValue: pickDropdownValue,
    getFieldValue: getFieldValue,
    expandManageNoCandidates: expandManageNoCandidates,
    fetchRecords: fetchRecords,
    fetchOrderByManageNo: fetchOrderByManageNo,
    fetchProduct: fetchProduct,
    buildEligiblePaymentItems: buildEligiblePaymentItems,
    getPaymentRate: getPaymentRate,
    getLineTransactionPrice: getLineTransactionPrice,
    sumField: sumField,
    paymentDueDateForInboundYm: paymentDueDateForInboundYm,
    inboundPeriodBounds: inboundPeriodBounds,
    isEligibleSubcategory: isEligibleSubcategory,
    updateOrderForWasai: updateOrderForWasai,
    loadOrderFormProperties: loadOrderFormProperties,
  };

})();
