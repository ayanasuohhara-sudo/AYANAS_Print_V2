(function() {
  'use strict';

  /**
   * App16 受注明細 × PCM（個人顧客マスタ）連携 — 定数
   * A550（店舗）のときのみ個人顧客選択を有効化する。
   */

  const ORDER_PCM_VERSION = '1.0.0';

  const ORDER_APP_ID = 16;
  const PCM_APP_ID = 96;
  const STORE_CUSTOMER_CODE = 'A550';

  const ID_PATTERN = /^P\d{6}$/;

  const ORDER_FIELDS = {
    customerCode: 'customer_code',
    customerName: 'customer_name',
    clientName: 'client_name',
    manageNo: 'manage_no',
    personalCustomerId: 'personal_customer_id',
    orderDate: 'order_date',
    deadline: 'deadline',
    kimonoType: 'kimono_type',
    detailTable: 'detail_table',
    detailItemName: 'item_name',
    processStatus: 'process_status',
    locationStatus: 'location_status',
    deliveryStatus: 'delivery_status',
  };

  const PCM_FIELDS = {
    personalCustomerId: 'personal_customer_id',
    customerName: 'customer_name',
    customerKana: 'customer_kana',
    phone: 'phone',
    mobilePhone: 'mobile_phone',
  };

  const SPACE_IDS = [
    'pcm_customer_search_space',
    'customer_search_space',
  ];

  const UI = {
    panelId: 'order-pcm-search-panel',
    statusId: 'order-pcm-status',
    resultsId: 'order-pcm-results',
    selectedId: 'order-pcm-selected',
  };

  window.CAYANAS_OrderPcm = {
    VERSION: ORDER_PCM_VERSION,
    ORDER_APP_ID: ORDER_APP_ID,
    PCM_APP_ID: PCM_APP_ID,
    STORE_CUSTOMER_CODE: STORE_CUSTOMER_CODE,
    ID_PATTERN: ID_PATTERN,
    ORDER_FIELDS: ORDER_FIELDS,
    PCM_FIELDS: PCM_FIELDS,
    SPACE_IDS: SPACE_IDS,
    UI: UI,
  };
}());
