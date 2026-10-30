(function() {
  'use strict';

  /**
   * 総合入庫 App78 — 共通定数
   * INBOUND_UNIFIED_VERSION: 1.2.4
   * 1.2.0: 外注入庫(App78)で和裁士入庫を確実に処理できるよう検出・ルート確定を強化
   * 1.2.1: 国内外注の再入庫 — App16.outsource_in_date では止めず、App27未入庫明細を正とする
   * 1.2.2: サブテーブル条件クエリ廃止（GAIA_IR02 400 回避）
   * 1.2.3: App74 outbound_status は DROP_DOWN のため in 演算子に修正
   * 1.2.4: 和裁士「出庫中」は入庫日があっても未入庫。エラー行ルートを受注から推定
   */

  const INBOUND_UNIFIED_VERSION = '1.2.4';

  const APP = {
    unified: 78,
    order: 16,
    outsourceOutbound: 27,
    overseasOutbound: 28,
    wasaiOutbound: 74,
  };

  const UF = {
    inboundBatchNo: 'inbound_batch_no',
    inboundDate: 'inbound_date',
    inboundOperator: 'inbound_operator',
    inboundStatus: 'inbound_status',
    barcodeInput: 'barcode_input',
    lineCount: 'line_count',
    successCount: 'success_count',
    errorCount: 'error_count',
    confirmedAt: 'confirmed_at',
    inboundRemarks: 'inbound_remarks',
    inboundLines: 'inbound_lines',
  };

  const UL = {
    manageNo: 'manage_no',
    inboundRoute: 'inbound_route',
    lineResult: 'line_result',
    errorMessage: 'error_message',
    orderRecordId: 'order_record_id',
    sourceOutboundApp: 'source_outbound_app',
    sourceOutboundRecordId: 'source_outbound_record_id',
    sourceOutboundLineId: 'source_outbound_line_id',
    customerCode: 'customer_code',
    customerName: 'customer_name',
    clientName: 'client_name',
    kimonoType: 'kimono_type',
    kimonoSpec: 'kimono_spec',
    processingSummary: 'processing_summary',
    outboundDate: 'outbound_date',
    destinationCode: 'destination_code',
    destinationName: 'destination_name',
    scheduledInboundDate: 'scheduled_inbound_date',
    scannedAt: 'scanned_at',
    appliedAt: 'applied_at',
  };

  const ORDER = {
    manageNo: 'manage_no',
    customerCode: 'customer_code',
    customerName: 'customer_name',
    clientName: 'client_name',
    kimonoType: 'kimono_type',
    kimonoSpec: 'kimono_spec',
    detailTable: 'detail_table',
    processStatus: 'process_status',
    locationStatus: 'location_status',
    outsourceInDate: 'outsource_in_date',
    overseasInDate: 'overseas_in_date',
    wasaiInDate: 'wasai_in_date',
    workStatus: 'work_status',
  };

  const ORDER_WORK = {
    finishInProgress: '仕上げ中',
  };

  const OUT27 = {
    detailTable: 'outsource_detail',
    detailManageNo: 'manage_no',
    lineInDate: 'line_in_date',
    companyCode: 'outsource_company_code',
    companyName: 'outsource_company',
    shipDate: 'ship_date',
    returnDate: 'return_date',
    headerStatus: 'outsourcing_status',
    headerStatusAlt: 'ドロップダウン_0',
  };

  const OUT28 = {
    manageNo: 'manage_no',
    overseasManageNo: 'overseas_manage_no',
    overseasInDate: 'overseas_in_date',
    overseasStatus: 'overseas_status',
    shipDate: 'ship_date',
    scheduledArrival: 'scheduled_arrival_date',
    cartonNo: 'carton_no',
    overseasDetails: 'overseas_details',
  };

  const OUT74 = {
    outboundLines: 'wasai_outbound_lines',
    outboundStatus: 'outbound_status',
    wasaiCode: 'wasai_code',
    wasaiName: 'wasai_name',
    shipDate: '日ship_date',
    shipDateAlt: 'ship_date',
    returnDate: 'return_date',
    lineManageNo: 'manage_no',
    lineInboundDate: 'inbound_date',
    lineStatus: 'line_status',
  };

  const INBOUND_STATUS = {
    draft: '下書き',
    confirmed: '入庫確定',
    cancel: '取消',
  };

  const LINE_RESULT = {
    waiting: '待機',
    success: '確定成功',
    error: 'エラー',
  };

  const ROUTE = {
    domestic: '国内外注',
    overseas: '海外外注',
    wasai: '和裁士',
  };

  const SOURCE_APP = {
    domestic: '外注出庫',
    overseas: '海外外注出庫',
    wasai: '和裁士出庫',
  };

  const ORDER_PROCESS = {
    outsourceActive: '外注中',
    overseasActive: '海外外注中',
    wasaiActive: '和裁士作業中',
    returnOutsource: '外注戻り',
    returnOverseas: '海外戻り',
    returnWasai: '和裁士戻り',
  };

  const ORDER_LOCATION = {
    outsource: '外注先',
    overseas: '海外',
    wasai: '和裁士',
    hq: '本社',
  };

  const OVERSEAS_STATUS_RETURNED = '全戻り';
  const OUT27_STATUS_INBOUND = '入庫';
  const WASAI_LINE_OUTBOUND = '出庫中';
  const WASAI_LINE_INBOUND = '入庫済';
  const WASAI_OUTBOUND_HEADER = '出庫確定';

  const escapeQueryValue = (value) => String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  const getFieldValue = (record, fieldCode) => {
    const field = record?.[fieldCode];

    if (!field || field.value === null || field.value === undefined) {
      return '';
    }

    return field.value;
  };

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

      if (padded9 !== normalized && candidates.indexOf(padded9) < 0) {
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

  const fetchRecord = async (appId, id) => {
    const resp = await kintone.api(
      kintone.api.url('/k/v1/record.json', true),
      'GET',
      { app: appId, id: id }
    );

    return resp.record;
  };

  const nowIso = () => new Date().toISOString();

  const nowDatetimeLocal = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');

    return d.getFullYear() + '-'
      + pad(d.getMonth() + 1) + '-'
      + pad(d.getDate()) + 'T'
      + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  };

  window.CAYANAS_InboundUnified = {
    VERSION: INBOUND_UNIFIED_VERSION,
    APP: APP,
    UF: UF,
    UL: UL,
    ORDER: ORDER,
    OUT27: OUT27,
    OUT28: OUT28,
    OUT74: OUT74,
    INBOUND_STATUS: INBOUND_STATUS,
    LINE_RESULT: LINE_RESULT,
    ROUTE: ROUTE,
    SOURCE_APP: SOURCE_APP,
    ORDER_PROCESS: ORDER_PROCESS,
    ORDER_WORK: ORDER_WORK,
    ORDER_LOCATION: ORDER_LOCATION,
    OVERSEAS_STATUS_RETURNED: OVERSEAS_STATUS_RETURNED,
    OUT27_STATUS_INBOUND: OUT27_STATUS_INBOUND,
    WASAI_LINE_OUTBOUND: WASAI_LINE_OUTBOUND,
    WASAI_LINE_INBOUND: WASAI_LINE_INBOUND,
    WASAI_OUTBOUND_HEADER: WASAI_OUTBOUND_HEADER,
    escapeQueryValue: escapeQueryValue,
    getFieldValue: getFieldValue,
    formatKintoneError: formatKintoneError,
    expandManageNoCandidates: expandManageNoCandidates,
    fetchRecords: fetchRecords,
    fetchRecord: fetchRecord,
    nowIso: nowIso,
    nowDatetimeLocal: nowDatetimeLocal,
  };

})();
