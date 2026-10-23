(function () {
    'use strict';

    /**
     * AYANAS 標準ポータル — 8分類バナー定義。
     * 登録先: kintoneシステム管理 → JavaScript / CSSでカスタマイズ（全体・PC用）
     * App91 / App90 / 共通ナビのファイルは変更しない。
     */

    const PORTAL_BUSINESS_BANNERS_VERSION = '1.0.0';

    const CAYANAS_PORTAL_BUSINESS_BANNERS = {
        VERSION: PORTAL_BUSINESS_BANNERS_VERSION,
        TITLE: 'AYANAS 業務メニュー',
        LEAD: '業務内容を選んでください',
        ROOT_ID: 'ayanas-portal-business-banners',
        STYLE_ID: 'ayanas-portal-business-banners-style',
        BUSINESS_MENU_APP_ID: 91,
        QUERY_KEY: 'cat',
        /**
         * mode:
         *   menu   — App91 ?cat=
         *   direct — 既存アプリへ直接
         *   soon   — 準備中（クリック不可）
         */
        CATEGORIES: [
            {
                id: 'order',
                no: '01',
                label: '受注登録・検索',
                mode: 'menu',
                cat: 'order',
            },
            {
                id: 'logistics',
                no: '02',
                label: '出庫・入庫',
                mode: 'menu',
                cat: 'logistics',
            },
            {
                id: 'billing',
                no: '03',
                label: '納品書・請求書・入金',
                mode: 'menu',
                cat: 'billing',
            },
            {
                id: 'work',
                no: '04',
                label: '作業進捗・完了登録',
                mode: 'menu',
                cat: 'work',
            },
            {
                id: 'deadline',
                no: '05',
                label: '納期・作業負荷状況',
                mode: 'direct',
                appId: 89,
            },
            {
                id: 'customer_schedule',
                no: '06',
                label: '得意先別納期スケジュール',
                mode: 'soon',
                soonLabel: '準備中',
            },
            {
                id: 'analytics',
                no: '07',
                label: '各種データ・集計',
                mode: 'menu',
                cat: 'analytics',
            },
            {
                id: 'masters',
                no: '08',
                label: 'マスタ登録',
                mode: 'menu',
                cat: 'masters',
            },
        ],
    };

    window.CAYANAS_PORTAL_BUSINESS_BANNERS = CAYANAS_PORTAL_BUSINESS_BANNERS;
    window.CAYANAS_PORTAL_BUSINESS_BANNERS_VERSION = PORTAL_BUSINESS_BANNERS_VERSION;

}());
