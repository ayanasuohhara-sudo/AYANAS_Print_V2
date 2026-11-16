(function () {
    'use strict';

    /**
     * AYANASU 標準ポータル — 業務バナー定義（11項目フラット）。
     * 登録先: kintoneシステム管理 → JavaScript / CSSでカスタマイズ（全体・PC用）
     *
     * App91 業務メニューと同じ11項目・同じ順序。
     * 店舗・工場は各1件（重複なし）。外注入庫は App78。
     */

    const PORTAL_BUSINESS_BANNERS_VERSION = '3.0.0';

    const CAYANAS_PORTAL_BUSINESS_BANNERS = {
        VERSION: PORTAL_BUSINESS_BANNERS_VERSION,
        TITLE: 'AYANASU 業務メニュー',
        LEAD: 'よく使う業務へ直接移動します。店舗・工場の詳細は各ポータルから。',
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
                id: 'order',
                no: '01',
                label: '受注登録',
                mode: 'direct',
                appId: 16,
            },
            {
                id: 'outsource_out',
                no: '02',
                label: '外注出庫',
                mode: 'direct',
                appId: 27,
            },
            {
                id: 'wasai_out',
                no: '03',
                label: '和裁士出庫',
                mode: 'direct',
                appId: 74,
            },
            {
                id: 'inbound',
                no: '04',
                label: '外注入庫',
                mode: 'direct',
                appId: 78,
            },
            {
                id: 'overseas_out',
                no: '05',
                label: '海外出庫',
                mode: 'direct',
                appId: 28,
            },
            {
                id: 'delivery',
                no: '06',
                label: '納品書作成',
                mode: 'direct',
                appId: 19,
            },
            {
                id: 'invoice',
                no: '07',
                label: '請求書作成',
                mode: 'direct',
                appId: 35,
            },
            {
                id: 'deadline',
                no: '08',
                label: '納期',
                mode: 'menu',
                cat: 'deadline',
            },
            {
                id: 'store',
                no: '09',
                label: '店舗',
                mode: 'direct',
                appId: 87,
                hub: true,
            },
            {
                id: 'factory',
                no: '10',
                label: '工場',
                mode: 'direct',
                appId: 90,
                hub: true,
            },
            {
                id: 'masters',
                no: '11',
                label: 'マスタ',
                mode: 'menu',
                cat: 'masters',
            },
        ],
    };

    window.CAYANAS_PORTAL_BUSINESS_BANNERS = CAYANAS_PORTAL_BUSINESS_BANNERS;
    window.CAYANAS_PORTAL_BUSINESS_BANNERS_VERSION = PORTAL_BUSINESS_BANNERS_VERSION;

}());
