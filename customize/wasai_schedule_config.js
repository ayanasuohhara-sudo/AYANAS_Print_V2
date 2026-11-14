(function () {
  'use strict';

  /**
   * 和裁士別仕事予定カレンダー — 定数（第3段階ローカル）
   * App73/74/78 は参照のみ。出庫・入庫・受注の処理は変更しない。
   * PLAN_APP_ID は予定管理 App 作成後に設定（本番未作成のあいだは null）。
   */

  const WASAI_SCHEDULE_VERSION = '1.2.0';

  const CAYANAS_WASAI_SCHEDULE = {
    VERSION: WASAI_SCHEDULE_VERSION,
    HOST_APP_ID: 98,
    WASAI_MASTER_APP_ID: 73,
    WASAI_OUTBOUND_APP_ID: 74,
    INBOUND_APP_ID: 78,
    ORDER_APP_ID: 16,
    /** 第3段階: 本番作成後に設定。null のあいだは予定の読取・登録 UI を無効化 */
    PLAN_APP_ID: null,
    PAGE_LIMIT: 500,
    MAX_OFFSET: 10000,
    WEEKDAY_LABELS: ['月', '火', '水', '木', '金', '土', '日'],
    OUTBOUND_STATUS_CONFIRMED: '出庫確定',
    OUTBOUND_STATUS_CANCEL: '取消',
    INBOUND_STATUS_CONFIRMED: '入庫確定',
    INBOUND_ROUTE_WASAI: '和裁士',
    REGISTRATION_ACTIVE: '有効',
    REGISTRATION_STATUS_CODES: ['registration_statu', 'registration_status'],
    LINE_STATUS: {
      outbound: '出庫中',
      inbound: '入庫済',
      inspectionOk: '検品OK',
      payTarget: '支払対象',
      billed: '計上済',
      paid: '支払済',
      rework: '再加工',
    },
    PLAN_STATUS: {
      reserved: '予約',
      shipped: '出庫済',
      cancelled: '取消',
    },
    PLAN_SOURCE: {
      office: '事務所',
      self: '本人',
    },
    WORK_KIND: {
      outbound: 'outbound',
      returned: 'returned',
      rework: 'rework',
      planned: 'planned',
    },
    WORK_KIND_LABEL: {
      outbound: '出庫中',
      returned: '返却済',
      rework: '再加工',
      planned: '予約',
    },
    MESSAGES: {
      loading: '読み込み中…',
      failed: '読み込みに失敗しました。再度お試しください。',
      selectWasai: '和裁士を選択してください。',
      emptyMaster: '有効な和裁士がマスタにありません。',
      emptyDay: 'この日の仕事はありません。',
      truncated: '表示月の出庫が取得上限を超えたため、一部だけ表示しています。',
      hostUnset: 'ホスト App ID が未設定です。デプロイ手順を確認してください。',
      planAppUnset: '予定管理アプリ未設定のため、予約の登録はまだできません。',
      planDuplicate: '同じ管理番号の予約が既にあります。',
      planSaved: '予定を保存しました。',
      planCancelled: '予定を取消しました。',
      detailPrefix: '明細 ',
      detailSuffix: '件',
      pieceSuffix: '枚',
      capacityLabel: '月間処理可能',
      capacityUnset: '未設定',
      capacityEditHint: '変更は和裁士マスタ（App73）で行います',
      plannedLabel: '予約',
    },
    FIELDS: {
      id: '$id',
      wasaiCode: 'wasai_code',
      wasaiName: 'wasai_name',
      tradeName: 'trade_name',
      monthlyCapacity: 'monthly_capacity',
      shipDate: '日ship_date',
      returnDate: 'return_date',
      outboundStatus: 'outbound_status',
      outboundLines: 'wasai_outbound_lines',
      lineManageNo: 'manage_no',
      lineStatus: 'line_status',
      lineInboundDate: 'inbound_date',
      lineEligibleCount: 'eligible_line_coun',
      lineProcessing: 'processing_summary',
      lineDeadline: 'deadline',
      lineOrderRecordId: 'order_record_id',
      lineCustomerName: 'customer_name',
      lineClientName: 'client_name',
      inboundStatus: 'inbound_status',
      inboundDate: 'inbound_date',
      inboundLines: 'inbound_lines',
      inboundRoute: 'inbound_route',
      inboundManageNo: 'manage_no',
      inboundLineResult: 'line_result',
      sourceOutboundApp: 'source_outbound_app',
      planManageNo: 'manage_no',
      planItemSummary: 'item_summary',
      planPieceCount: 'piece_count',
      planStartDate: 'planned_start_date',
      planReturnDate: 'planned_return_date',
      planStatus: 'plan_status',
      planLinkedOutboundRecordId: 'linked_outbound_record_id',
      planLinkedOutboundLineId: 'linked_outbound_line_id',
      planSource: 'source',
      planNotes: 'notes',
    },
  };

  window.CAYANAS_WASAI_SCHEDULE = CAYANAS_WASAI_SCHEDULE;
  window.CAYANAS_WASAI_SCHEDULE_VERSION = WASAI_SCHEDULE_VERSION;

}());
