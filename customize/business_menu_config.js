(function () {
    'use strict';

    /**
     * AYANAS 業務メニュー — 8分類リンク定義（一元管理）。
     *
     * - URL: /k/{BUSINESS_MENU_APP_ID}/?cat={categoryId}
     * - cat 未指定・不正時は DEFAULT_CATEGORY を表示（エラーにしない）
     * - BUSINESS_MENU_APP_ID が 0 のときは画面を出さない（アプリ作成後に設定）
     * - レコードは保存しない。業務アプリへの遷移のみ
     */

    const BUSINESS_MENU_VERSION = '1.0.1';

    const CAYANAS_BUSINESS_MENU = {
        VERSION: BUSINESS_MENU_VERSION,

        /** 「AYANAS 業務メニュー」アプリID。0 のときは起動しない */
        BUSINESS_MENU_APP_ID: 91,

        TITLE: 'AYANAS 業務メニュー',
        LEAD: '業務内容からアプリを選んで移動します。',
        TOP_LABEL: 'AYANAS TOPへ戻る',
        TOP_HASH: '#/portal',

        /** URLパラメータ名 */
        QUERY_KEY: 'cat',

        /** cat 未指定・不正時の初期分類 */
        DEFAULT_CATEGORY: 'order',

        /**
         * 8分類（表示順どおり）。
         * mode:
         *   menu   — このアプリ内で items を表示
         *   direct — ポータル／ナビから既存アプリへ直接（items なし）
         *   soon   — 準備中（クリック不可）
         * path 省略時は一覧 /k/{appId}/ 。例: 'edit' → /k/{appId}/edit
         */
        CATEGORIES: [
            {
                id: 'order',
                label: '受注登録・検索',
                shortLabel: '受注',
                icon: 'order',
                mode: 'menu',
                items: [
                    { appId: 16, label: '受注登録・明細一覧', icon: 'order' },
                    { appId: 88, label: '受注検索', icon: 'search' },
                ],
            },
            {
                id: 'logistics',
                label: '出庫・入庫',
                shortLabel: '出庫入庫',
                icon: 'logistics',
                mode: 'menu',
                items: [
                    { appId: 27, label: '外注出庫', icon: 'outsource' },
                    { appId: 28, label: '海外外注出庫', icon: 'overseas' },
                    { appId: 74, label: '和裁士出庫', icon: 'wasai' },
                    { appId: 78, label: '外注入庫', icon: 'inbound' },
                    { appId: 34, label: '社内移動入庫、保管場所登録', icon: 'move' },
                ],
            },
            {
                id: 'billing',
                label: '納品書・請求書・入金',
                shortLabel: '納品請求',
                icon: 'billing',
                mode: 'menu',
                items: [
                    { appId: 19, label: '納品書作成', icon: 'delivery' },
                    { appId: 35, label: '請求書作成', icon: 'invoice' },
                    { appId: 21, label: '入金登録', icon: 'payment', path: 'edit' },
                    { appId: 21, label: '入金一覧', icon: 'paymentList' },
                    { appId: 22, label: '売掛一覧', icon: 'ar' },
                ],
            },
            {
                id: 'work',
                label: '作業進捗・完了登録',
                shortLabel: '作業進捗',
                icon: 'work',
                mode: 'menu',
                items: [
                    { appId: 86, label: '工場作業状況', icon: 'status' },
                    { appId: 87, label: '店舗作業状況', icon: 'store' },
                    { appId: 84, label: '作業状況登録', icon: 'work' },
                    { appId: 30, label: '仕上げ完了登録', icon: 'complete' },
                ],
            },
            {
                id: 'deadline',
                label: '納期・作業負荷状況',
                shortLabel: '納期負荷',
                icon: 'calendar',
                mode: 'direct',
                directAppId: 89,
            },
            {
                id: 'customer_schedule',
                label: '納期・納品スケジュール管理',
                shortLabel: '納期納品',
                icon: 'schedule',
                mode: 'direct',
                directAppId: 94,
            },
            {
                id: 'analytics',
                label: '各種データ・集計',
                shortLabel: 'データ集計',
                icon: 'analytics',
                mode: 'menu',
                items: [
                    { appId: 82, label: '業務ダッシュボード', icon: 'dashboard' },
                    { appId: 75, label: '和裁士支払明細', icon: 'wasaiPay' },
                ],
            },
            {
                id: 'masters',
                label: 'マスタ登録',
                shortLabel: 'マスタ',
                icon: 'masters',
                mode: 'menu',
                items: [
                    { appId: 8, label: '顧客マスタ', icon: 'customer' },
                    { appId: 11, label: '着物種類マスタ', icon: 'kimono' },
                    { appId: 13, label: '商品マスタ', icon: 'product' },
                    { appId: 14, label: '価格マスタ', icon: 'price' },
                    { appId: 23, label: '外注加工マスタ', icon: 'process' },
                    { appId: 26, label: '外注先マスタ', icon: 'vendor' },
                    { appId: 73, label: '和裁士マスタ', icon: 'wasai' },
                    /* 店舗顧客マスタはアプリ完成後にここに追加 */
                ],
            },
        ],

        MESSAGES: {
            noAppId: '業務メニューのアプリIDが未設定です。business_menu_config.js の BUSINESS_MENU_APP_ID を設定してください。',
            soonBody: 'このメニューは準備中です。アプリ完成後にリンクを設定します。',
        },
    };

    window.CAYANAS_BUSINESS_MENU = CAYANAS_BUSINESS_MENU;
    window.CAYANAS_BUSINESS_MENU_VERSION = BUSINESS_MENU_VERSION;

}());
