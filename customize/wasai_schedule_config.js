(function () {
  'use strict';

  /**
   * 和裁士別仕事予定カレンダー — 定数（第2段階）
   * App73/74/78 は参照のみ。出庫・入庫・受注の処理は変更しない。
   * App73.monthly_capacity を表示する（変更は App73 画面で行う）。
   * HOST_APP_ID はホスト App 作成後に設定する（未設定のあいだはマウントしない）。
   */

  const WASAI_SCHEDULE_VERSION = '1.1.0';

  const CAYANAS_WASAI_SCHEDULE = {
    VERSION: WASAI_SCHEDULE_VERSION,
    /** 本番ホスト App 作成後に数値を入れる。null のあいだは index に出さない */
    HOST_APP_ID: null,
    WASAI_MASTER_APP_ID: 73,
    WASAI_OUTBOUND_APP_ID: 74,
    INBOUND_APP_ID: 78,
    ORDER_APP_ID: 16,
    /** 第3段階で予定 App を追加するときの受け皿（未使用） */
    PLAN_APP_ID: null,
    PAGE_LIMIT: 500,
    MAX_OFFSET: 10000,
    WEEKDAY_LABELS: ['月', '火', '水', '木', '金', '土', '日'],
    OUTBOUND_STATUS_CONFIRMED: '出庫確定',
    OUTBOUND_STATUS_CANCEL: '取消',
    INBOUND_STATUS_CONFIRMED: '入庫確定',
    INBOUND_ROUTE_WASAI: '和裁士',
    REGISTRATION_ACTIVE: '有効',
    /**
     * 本番マスタは registration_statu（末尾 s 欠落）。
     * 将来の正しいコードも併記して両方読む。
     */
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
    WORK_KIND: {
      outbound: 'outbound',
      returned: 'returned',
      rework: 'rework',
    },
    WORK_KIND_LABEL: {
      outbound: '出庫中',
      returned: '返却済',
      rework: '再加工',
    },
    MESSAGES: {
      loading: '読み込み中…',
      failed: '読み込みに失敗しました。再度お試しください。',
      selectWasai: '和裁士を選択してください。',
      emptyMaster: '有効な和裁士がマスタにありません。',
      emptyDay: 'この日の仕事はありません。',
      truncated: '表示月の出庫が取得上限を超えたため、一部だけ表示しています。',
      hostUnset: 'ホスト App ID が未設定です。デプロイ手順を確認してください。',
      detailPrefix: '明細 ',
      detailSuffix: '件',
      pieceSuffix: '枚',
      capacityLabel: '月間処理可能',
      capacityUnset: '未設定',
      capacityEditHint: '変更は和裁士マスタ（App73）で行います',
    },
    FIELDS: {
      id: '$id',
      wasaiCode: 'wasai_code',
      wasaiName: 'wasai_name',
      tradeName: 'trade_name',
      /** App73 数値。空は未設定（0 とは区別） */
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
    },
  };

  window.CAYANAS_WASAI_SCHEDULE = CAYANAS_WASAI_SCHEDULE;
  window.CAYANAS_WASAI_SCHEDULE_VERSION = WASAI_SCHEDULE_VERSION;

}());
