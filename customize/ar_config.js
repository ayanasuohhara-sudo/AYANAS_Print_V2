(function () {
    'use strict';

    /**
     * 売掛管理 App 22 — 定数
     * AR_ENGINE_VERSION: 1.0.3
     */

    const AR_ENGINE_VERSION = '1.0.3';

    const CAYANAS_AR = {
        AR_APP_ID: 22,
        INVOICE_APP_ID: 35,
        PAYMENT_APP_ID: 21,
        /** 残高ゼロ判定 */
        OPEN_EPSILON: 0.0001,
        /** App 35 追加参照（PaymentCreateV2.INVOICE_FIELDS 外） */
        INVOICE_EXTRA: {
            customerName: 'customer_name',
            paymentDueDate: 'payment_due_date',
        },
        PAYMENT_RECORD_STATUS_CANCEL: '取消',
        PAYMENT_RECORD_STATUS_ACTIVE: '有効',
        UI: {
            title: '売掛管理',
            reload: '再読込',
            loading: '集計中…',
            errorPrefix: '売掛データの取得に失敗しました。',
            filterAll: 'すべて',
            filterOver30: '30日超',
            filterOver60: '60日超',
            filterOver90: '90日超',
            filterOpenOnly: '残高あり',
            searchPlaceholder: '取引先コード・名称',
            registerPayment: '入金登録',
            paymentHistoryLoading: '入金履歴を読み込み中...',
            paymentHistoryEmpty: '入金履歴はありません',
            paymentHistoryError: '入金履歴を取得できませんでした',
            paymentHistoryTitle: '入金履歴',
            paymentHistoryMismatch: '※請求内訳の合計と入金履歴の合計が一致しません。',
        },
        /** App 21 新規画面 URL（payment_desktop.js applyUrlSeedParams と同一） */
        PAYMENT_CREATE_QUERY: {
            customerCode: 'customer_code',
            invoiceNo: 'invoice_no',
        },
    };

    window.CAYANAS_AR = CAYANAS_AR;
    window.CAYANAS_AR_VERSION = AR_ENGINE_VERSION;

}());
