(function () {
    'use strict';

    /**
     * AYANAS 標準ポータル — 業務バナー定義。
     * 登録先: kintoneシステム管理 → JavaScript / CSSでカスタマイズ（全体・PC用）
     *
     * 01–02: 工場／店舗の業務ポータル（直接遷移）
     * 03–10: 従来の8分類（App91 ?cat= または直接アプリ）
     */

    const PORTAL_BUSINESS_BANNERS_VERSION = '1.1.0';

    const CAYANAS_PORTAL_BUSINESS_BANNERS = {
        VERSION: PORTAL_BUSINESS_BANNERS_VERSION,
        TITLE: 'AYANAS 業務メニュー',
        LEAD: '工場・店舗ポータル、または業務内容を選んでください',
        ROOT_ID: 'ayanas-portal-business-banners',
        STYLE_ID: 'ayanas-portal-business-banners-style',
        BUSINESS_MENU_APP_ID: 91,
        FACTORY_MENU_APP_ID: 90,
        STORE_PORTAL_APP_ID: 87,
        QUERY_KEY: 'cat',
        /**
         * mode:
         *   menu   — App91 ?cat=
         *   direct — 既存アプリへ直接
         *   soon   — 準備中（クリック不可）
         */
        CATEGORIES: [
            {
                id: 'factory_portal',
                no: '01',
                label: '工場ポータル（業務）',
                mode: 'direct',
                appId: 90,
                hub: true,
            },
            {
                id: 'store_portal',
                no: '02',
                label: '店舗ポータル（業務）',
                mode: 'direct',
                appId: 87,
                hub: true,
            },
            {
                id: 'order',
                no: '03',
                label: '受注登録・検索',
                mode: 'menu',
                cat: 'order',
            },
            {
                id: 'logistics',
                no: '04',
                label: '出庫・入庫',
                mode: 'menu',
                cat: 'logistics',
            },
            {
                id: 'billing',
                no: '05',
                label: '納品書・請求書・入金',
                mode: 'menu',
                cat: 'billing',
            },
            {
                id: 'work',
                no: '06',
                label: '作業進捗・完了登録',
                mode: 'menu',
                cat: 'work',
            },
            {
                id: 'deadline',
                no: '07',
                label: '納期・作業負荷状況',
                mode: 'direct',
                appId: 89,
            },
            {
                id: 'customer_schedule',
                no: '08',
                label: '納期・納品スケジュール管理',
                mode: 'direct',
                appId: 94,
            },
            {
                id: 'analytics',
                no: '09',
                label: '各種データ・集計',
                mode: 'menu',
                cat: 'analytics',
            },
            {
                id: 'masters',
                no: '10',
                label: 'マスタ登録',
                mode: 'menu',
                cat: 'masters',
            },
        ],
    };

    window.CAYANAS_PORTAL_BUSINESS_BANNERS = CAYANAS_PORTAL_BUSINESS_BANNERS;
    window.CAYANAS_PORTAL_BUSINESS_BANNERS_VERSION = PORTAL_BUSINESS_BANNERS_VERSION;

}());
