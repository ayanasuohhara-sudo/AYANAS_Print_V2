(function () {
    'use strict';

    /**
     * AYANASU 標準ポータル — 業務バナー定義。
     * 登録先: kintoneシステム管理 → JavaScript / CSSでカスタマイズ（全体・PC用）
     *
     * 01–02: 店舗／工場ハブ（先頭）
     * 03–08: App91 の6分類
     */

    const PORTAL_BUSINESS_BANNERS_VERSION = '2.0.0';

    const CAYANAS_PORTAL_BUSINESS_BANNERS = {
        VERSION: PORTAL_BUSINESS_BANNERS_VERSION,
        TITLE: 'AYANASU 業務メニュー',
        LEAD: '業務内容を選んでください（店舗・工場を先頭に配置）',
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
                id: 'store_portal',
                no: '01',
                label: '店舗ポータル',
                mode: 'direct',
                appId: 87,
                hub: true,
            },
            {
                id: 'factory_portal',
                no: '02',
                label: '工場ポータル',
                mode: 'direct',
                appId: 90,
                hub: true,
            },
            {
                id: 'store',
                no: '03',
                label: '店舗業務',
                mode: 'menu',
                cat: 'store',
            },
            {
                id: 'factory',
                no: '04',
                label: '工場業務',
                mode: 'menu',
                cat: 'factory',
            },
            {
                id: 'outsourcing',
                no: '05',
                label: '外注管理',
                mode: 'menu',
                cat: 'outsourcing',
            },
            {
                id: 'finance',
                no: '06',
                label: '売上・経理',
                mode: 'menu',
                cat: 'finance',
            },
            {
                id: 'schedule',
                no: '07',
                label: '予定・納期',
                mode: 'menu',
                cat: 'schedule',
            },
            {
                id: 'masters',
                no: '08',
                label: 'マスタ・設定',
                mode: 'menu',
                cat: 'masters',
            },
        ],
    };

    window.CAYANAS_PORTAL_BUSINESS_BANNERS = CAYANAS_PORTAL_BUSINESS_BANNERS;
    window.CAYANAS_PORTAL_BUSINESS_BANNERS_VERSION = PORTAL_BUSINESS_BANNERS_VERSION;

}());
