(function () {
  'use strict';

  /**
   * 外注追加加工の登録漏れ防止 — 定数
   * App27 保存後の App16 自動追加 / App19 納品時の照合
   * VERSION: 1.0.0
   */

  const OUTSOURCE_EXTRA_PROCESS_VERSION = '1.0.0';

  const APP = {
    product: 13,
    price: 14,
    order: 16,
    delivery: 19,
    outsourceOutbound: 27,
    /** 外注加工マスタ（正）。App23は使わない */
    outsourceProcessing: 95,
  };

  const F27 = {
    detailTable: 'outsource_detail',
    detailManageNo: 'manage_no',
    processingTable: 'processing_details_0',
    processingCode: 'processing_code',
    processingDetails: 'processing_details',
    status: 'ドロップダウン_0',
    statusAlt: 'outsourcing_status',
    companyCode: 'outsource_company_code',
    companyName: 'outsource_company',
  };

  const F95 = {
    processingCode: 'outsource_company_code',
    processingName: 'processing_details',
  };

  const F13 = {
    itemCode: 'item_code',
    itemName: 'item_name',
    subcategory: 'subcategory',
  };

  const F14 = {
    customerCode: 'customer_code',
    kimonoTypeCode: 'kimono_type_code',
    itemCode: 'item_code',
    kimonoSpec: 'kimono_spec',
    unitPrice: 'unit_price',
    priceKey: 'price_key',
  };

  const F16 = {
    manageNo: 'manage_no',
    customerCode: 'customer_code',
    kimonoTypeCode: 'kimono_type_code',
    kimonoSpec: 'kimono_spec',
    detailTable: 'detail_table',
    itemCode: 'item_code',
    itemName: 'item_name',
    unitPrice: 'unit_price',
    qty: 'qty',
    amount: 'amount',
  };

  const F19 = {
    deliveryDetail: 'delivery_detail',
    manageNo: 'manage_no',
  };

  /** App27 伝票状況がこれに一致するとき照合・自動追加の対象外 */
  const CANCEL_STATUS_VALUES = ['取消', 'キャンセル'];

  window.CAYANAS_OutsourceExtraProcess = {
    VERSION: OUTSOURCE_EXTRA_PROCESS_VERSION,
    APP: APP,
    F27: F27,
    F95: F95,
    F13: F13,
    F14: F14,
    F16: F16,
    F19: F19,
    CANCEL_STATUS_VALUES: CANCEL_STATUS_VALUES,
  };

})();
