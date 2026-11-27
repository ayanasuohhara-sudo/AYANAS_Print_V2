(function () {
    'use strict';

    /**
     * AYANASU 業務メニュー — 6分類（共通 TOP = App91）
     *
     * - URL: /k/{BUSINESS_MENU_APP_ID}/?cat={categoryId}
     * - 旧 cat（order 等）は CATEGORY_ALIASES で新分類へ吸収
     * - App92/97 は店舗ポータル（App87）側。App95/99 は非掲載
     * - 表示名は App87 / App90 と揃える（正式名称ベース）
     */

    const BUSINESS_MENU_VERSION = '2.0.0';

    const CAYANAS_BUSINESS_MENU = {
        VERSION: BUSINESS_MENU_VERSION,

        /** 「AYANASU 業務メニュー」アプリID */
        BUSINESS_MENU_APP_ID: 91,

        TITLE: 'AYANASU 業務メニュー',
        LEAD: '業務内容からアプリを選びます。店舗専用の納期・引き取りは店舗ポータルから。',
        /** 共通ハブナビを使う（portal TOP リンクはハブに統合） */
        USE_HUB_NAV: true,

        QUERY_KEY: 'cat',
        DEFAULT_CATEGORY: 'store',

        /**
         * 旧8分類 URL 互換
         */
        CATEGORY_ALIASES: {
            order: 'store',
            logistics: 'outsourcing',
            billing: 'finance',
            work: 'factory',
            deadline: 'schedule',
            customer_schedule: 'schedule',
            analytics: 'finance',
            masters: 'masters',
        },

        /**
         * 6分類（表示順）。mode: menu | direct | soon
         * path 省略時は一覧 /k/{appId}/
         */
        CATEGORIES: [
            {
                id: 'store',
                label: '店舗業務',
                shortLabel: '店舗',
                icon: 'store',
                mode: 'menu',
                items: [
                    { appId: 87, label: '店舗ポータル', icon: 'store' },
                    { appId: 16, label: '受注明細管理', icon: 'order' },
                    { appId: 88, label: '受注検索', icon: 'search' },
                    { appId: 96, label: '個人顧客マスタ', icon: 'customer' },
                ],
            },
            {
                id: 'factory',
                label: '工場業務',
                shortLabel: '工場',
                icon: 'work',
                mode: 'menu',
                items: [
                    { appId: 90, label: '工場ポータル', icon: 'status' },
                    { appId: 86, label: '工場作業状況ポータル', icon: 'status' },
                    { appId: 16, label: '受注明細管理', icon: 'order' },
                    { appId: 88, label: '受注検索', icon: 'search' },
                    { appId: 84, label: '社内作業登録', icon: 'work' },
                    { appId: 30, label: '仕上げ完了登録', icon: 'complete' },
                    { appId: 34, label: '社内入庫登録', icon: 'move' },
                    { appId: 98, label: '和裁士別仕事予定カレンダー', icon: 'wasai' },
                ],
            },
            {
                id: 'outsourcing',
                label: '外注管理',
                shortLabel: '外注',
                icon: 'logistics',
                mode: 'menu',
                items: [
                    { appId: 27, label: '外注出庫', icon: 'outsource' },
                    { appId: 28, label: '海外外注出庫', icon: 'overseas' },
                    { appId: 74, label: '和裁士出庫', icon: 'wasai' },
                    { appId: 78, label: '外注入庫', icon: 'inbound' },
                    { appId: 26, label: '外注先マスタ', icon: 'vendor' },
                    { appId: 23, label: '外注加工マスタ', icon: 'process' },
                ],
            },
            {
                id: 'finance',
                label: '売上・経理',
                shortLabel: '経理',
                icon: 'billing',
                mode: 'menu',
                items: [
                    { appId: 19, label: '納品書作成', icon: 'delivery' },
                    { appId: 35, label: '請求書作成', icon: 'invoice' },
                    { appId: 21, label: '入金管理（登録）', icon: 'payment', path: 'edit' },
                    { appId: 21, label: '入金管理（一覧）', icon: 'paymentList' },
                    { appId: 22, label: '売掛一覧', icon: 'ar' },
                    { appId: 75, label: '和裁士支払明細', icon: 'wasaiPay' },
                    { appId: 82, label: '業務ダッシュボード', icon: 'dashboard' },
                ],
            },
            {
                id: 'schedule',
                label: '予定・納期',
                shortLabel: '予定納期',
                icon: 'calendar',
                mode: 'menu',
                items: [
                    { appId: 89, label: '納期負荷カレンダー', icon: 'calendar' },
                    { appId: 94, label: '納期・納品スケジュール管理', icon: 'schedule' },
                    { appId: 98, label: '和裁士別仕事予定カレンダー', icon: 'wasai' },
                ],
            },
            {
                id: 'masters',
                label: 'マスタ・設定',
                shortLabel: 'マスタ',
                icon: 'masters',
                mode: 'menu',
                items: [
                    { appId: 8, label: '顧客マスタ', icon: 'customer' },
                    { appId: 96, label: '個人顧客マスタ', icon: 'customer' },
                    { appId: 11, label: '着物種類マスタ', icon: 'kimono' },
                    { appId: 13, label: '商品マスタ', icon: 'product' },
                    { appId: 14, label: '価格マスタ', icon: 'price' },
                    { appId: 73, label: '和裁士マスタ', icon: 'wasai' },
                    { appId: 23, label: '外注加工マスタ', icon: 'process' },
                    { appId: 26, label: '外注先マスタ', icon: 'vendor' },
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
