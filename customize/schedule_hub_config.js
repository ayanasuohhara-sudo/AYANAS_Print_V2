(function () {
  'use strict';

  /**
   * 納期・納品スケジュール管理 — 定数。
   * 正本は App16。表示専用。分類定義は App89 と同一。
   */

  const SCHEDULE_HUB_VERSION = '1.0.1';

  const CAYANAS_SCHEDULE_HUB = {
    VERSION: SCHEDULE_HUB_VERSION,
    /** ホストアプリ ID。kintone 採番後に設定。null のあいだは登録先アプリで動作 */
    HOST_APP_ID: 94,
    ORDER_APP_ID: 16,
    PRODUCT_APP_ID: 13,
    PAGE_LIMIT: 500,
    /** offset 方式の上限（kintone 制約）。超過時は $id / cursor へ切替 */
    MAX_OFFSET: 10000,
    PRODUCT_BATCH: 100,
    CURSOR_SIZE: 500,
    AGGREGATION_CANCELLED: '取消',
    DELIVERY_DONE: '納品済',
    DELIVERY_READY: '納品待ち',
    WORK_FINISH_IN_PROGRESS: '仕上げ中',
    LOCATION_HQ: '本社',
    PROCESS_RETURN_OUTSOURCE: '外注戻り',
    PROCESSING_SEPARATOR: ' / ',
    CATEGORY_SEPARATOR: ' / ',
    DEADLINE_UNSET_LABEL: '納期未設定',
    /**
     * App89 と同一。1 manage_no = 1分類の優先順。
     * 画面①対象は FINISH_CATEGORY_KEYS（wash 除外）。
     */
    CATEGORY_PRIORITY: [
      'overseas',
      'domestic',
      'obi',
      'repair',
      'wash',
    ],
    CATEGORIES: [
      {
        key: 'wash',
        label: '丸洗い・しみ',
        shortLabel: '丸洗い・しみ',
        subcategories: ['丸洗い', 'しみぬき'],
      },
      {
        key: 'overseas',
        label: '海外仕立',
        shortLabel: '海外仕立',
        subcategories: ['海外仕立'],
      },
      {
        key: 'domestic',
        label: '国内仕立',
        shortLabel: '国内仕立',
        subcategories: ['国内仕立'],
      },
      {
        key: 'repair',
        label: '修理',
        shortLabel: '修理',
        subcategories: ['修理・直し'],
      },
      {
        key: 'obi',
        label: '帯仕立',
        shortLabel: '帯仕立',
        subcategories: ['帯仕立'],
      },
    ],
    /** ①仕上げ予定・漏れ候補の対象分類（wash 除外） */
    FINISH_CATEGORY_KEYS: ['overseas', 'domestic', 'obi', 'repair'],
    WEEKDAY_LABELS: ['月', '火', '水', '木', '金', '土', '日'],
    NEAR_DAYS: 7,
    MESSAGES: {
      loading: '読み込み中…',
      failed: '読み込みに失敗しました。再度お試しください。',
      empty: '表示する案件はありません。',
      truncated: '取得上限のため一部のみ表示しています。再読込するか条件を絞ってください。',
      fetchStats: '取得 {count} 件 / API {calls} 回 / {ms} ms',
      readOnly: '表示専用（App16 は更新しません）',
      leakTitle: '仕上げ漏れ候補（外注戻り・本社・未仕上げ中）',
      unsetTitle: '納期未設定',
      customerPrompt: '顧客を選択するか、顧客コードを入力して検索してください。',
      productMapFailed: '商品分類（App13）の取得に失敗したため、分類判定が不完全です。件数は表示しますが仕上げ対象が欠ける可能性があります。',
      fetchAllFailed: '受注データの取得に失敗しました（cursor / IDページング / offset いずれも不可）。件数は表示しません。',
      permissionDenied: '閲覧権限が不足しています。App16（受注明細）または App13（商品マスタ）の権限を確認してください。',
    },
    TABS: [
      { id: 'finish', label: '① 仕上げ予定' },
      { id: 'customer', label: '② 顧客別納期' },
      { id: 'delivery', label: '③ 全体納品' },
    ],
    FIELDS: {
      id: '$id',
      manageNo: 'manage_no',
      slipNo: 'slip_no',
      deadline: 'deadline',
      customerCode: 'customer_code',
      customerName: 'customer_name',
      clientName: 'client_name',
      kimonoType: 'kimono_type',
      kimonoSpec: 'kimono_spec',
      processStatus: 'process_status',
      workStatus: 'work_status',
      locationStatus: 'location_status',
      deliveryStatus: 'delivery_status',
      aggregationStatus: 'aggregation_status',
      detailTable: 'detail_table',
      itemCode: 'item_code',
      itemName: 'item_name',
      productCode: 'item_code',
      subcategory: 'subcategory',
    },
  };

  window.CAYANAS_SCHEDULE_HUB = CAYANAS_SCHEDULE_HUB;
  window.CAYANAS_SCHEDULE_HUB_VERSION = SCHEDULE_HUB_VERSION;

}());
