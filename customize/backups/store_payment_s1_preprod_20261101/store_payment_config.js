(function() {
  'use strict';

  /**
   * 店舗入金管理 S1 — 定数
   * App97「店舗入金管理」。本番 JS カスタマイズ反映は別途承認後。
   *
   * 税込計算（ロック）:
   *   ex = Σ App16.detail_table.amount（税抜・受注単位）
   *   tax = Math.round(ex * 0.10)   // 印刷プラグイン core.js / delivery と同型
   *   in  = ex + tax
   * スマレジ: 当面 API なし。会計後に S1 手入力。日次照合は手入力/CSV 想定。
   */

  const STORE_PAYMENT_VERSION = '1.1.0-s1';

  /** @type {number} 店舗入金管理 App ID */
  const STORE_PAYMENT_APP_ID = 97;

  const ORDER_APP_ID = 16;
  const PCM_APP_ID = 96;
  const STORE_CUSTOMER_CODE = 'A550';

  const TAX_RATE = 0.1;
  /** 'round' | 'floor' | 'ceil' — 既定は印刷同型の round。スマレジ実機と差があれば切替 */
  const TAX_ROUNDING = 'round';

  const ID_PATTERN = /^P\d{6}$/;

  const PAYMENT_STATUS = {
    active: '有効',
    cancelled: '取消',
    refunded: '返金済',
  };

  const PAYMENT_CHANNEL = {
    store: '店舗',
    web: 'WEB',
    migrate: '移行',
  };

  const PAYMENT_TIMING = {
    intake: '受付時',
    pickup: '引き取り時',
    other: 'その他',
  };

  const PAYMENT_METHOD = {
    cash: '現金',
    card: 'クレジットカード',
    other: 'その他',
  };

  const RECORD_KIND = {
    payment: '入金',
    refund: '返金',
  };

  const DELIVERY = {
    waiting: '納品待ち',
    done: '納品済',
    none: '未納品',
  };

  const LOCATION = {
    store: '店舗',
  };

  const HEADER_FIELDS = {
    storePaymentNo: 'store_payment_no',
    personalCustomerId: 'personal_customer_id',
    clientNameSnapshot: 'client_name_snapshot',
    paymentDate: 'payment_date',
    paymentAmount: 'payment_amount',
    paymentMethod: 'payment_method',
    posTransactionId: 'pos_transaction_id',
    paymentStaff: 'payment_staff',
    transactionId: 'transaction_id',
    paymentStatus: 'payment_status',
    paymentChannel: 'payment_channel',
    paymentTiming: 'payment_timing',
    recordKind: 'record_kind',
    relatedRefundOf: 'related_refund_of',
    cancelReason: 'cancel_reason',
    cancelDatetime: 'cancel_datetime',
    unpaidHandoverApproved: 'unpaid_handover_approved',
    notes: 'notes',
    lines: 'store_payment_lines',
  };

  const LINE_FIELDS = {
    orderRecordId: 'order_record_id',
    manageNo: 'manage_no',
    personalCustomerIdLine: 'personal_customer_id_line',
    kimonoTypeSnapshot: 'kimono_type_snapshot',
    billedExTax: 'billed_ex_tax',
    billedInTax: 'billed_amount',
    allocatedAmount: 'allocated_amount',
    previouslyPaidAmount: 'previously_paid_amount',
    balanceAfterLine: 'balance_after_line',
    lineNote: 'line_note',
  };

  const ORDER_FIELDS = {
    personalCustomerId: 'personal_customer_id',
    customerCode: 'customer_code',
    clientName: 'client_name',
    manageNo: 'manage_no',
    kimonoType: 'kimono_type',
    detailTable: 'detail_table',
    detailAmount: 'amount',
    detailItemName: 'item_name',
    deliveryStatus: 'delivery_status',
    processStatus: 'process_status',
    locationStatus: 'location_status',
    workStatus: 'work_status',
    deliveryNo: 'delivery_no',
    deliveryDate: 'delivery_date',
    revision: '$revision',
  };

  const PCM_FIELDS = {
    personalCustomerId: 'personal_customer_id',
    customerName: 'customer_name',
    customerKana: 'customer_kana',
    phone: 'phone',
    mobilePhone: 'mobile_phone',
  };

  const NUMBERING = {
    prefix: 'SP',
    pad: 6,
  };

  const UI = {
    rootId: 'stp-s1-accounting-root',
    pageLimit: 100,
  };

  window.CAYANAS_StorePayment = {
    VERSION: STORE_PAYMENT_VERSION,
    STORE_PAYMENT_APP_ID: STORE_PAYMENT_APP_ID,
    ORDER_APP_ID: ORDER_APP_ID,
    PCM_APP_ID: PCM_APP_ID,
    STORE_CUSTOMER_CODE: STORE_CUSTOMER_CODE,
    TAX_RATE: TAX_RATE,
    TAX_ROUNDING: TAX_ROUNDING,
    ID_PATTERN: ID_PATTERN,
    PAYMENT_STATUS: PAYMENT_STATUS,
    PAYMENT_CHANNEL: PAYMENT_CHANNEL,
    PAYMENT_TIMING: PAYMENT_TIMING,
    PAYMENT_METHOD: PAYMENT_METHOD,
    RECORD_KIND: RECORD_KIND,
    DELIVERY: DELIVERY,
    LOCATION: LOCATION,
    HEADER_FIELDS: HEADER_FIELDS,
    LINE_FIELDS: LINE_FIELDS,
    ORDER_FIELDS: ORDER_FIELDS,
    PCM_FIELDS: PCM_FIELDS,
    NUMBERING: NUMBERING,
    UI: UI,
  };
}());
