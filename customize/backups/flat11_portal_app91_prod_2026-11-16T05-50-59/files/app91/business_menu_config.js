(function () {
    'use strict';

    /**
     * AYANASU 業務メニュー — 11項目フラット構成（共通 TOP = App91）
     *
     * - ホーム: 11ボタンを一覧表示（直接アプリ or サブメニュー）
     * - URL: /k/91/ または /k/91/?cat={masters|deadline|…}
     * - 旧 cat（store / factory 等）は CATEGORY_ALIASES でホームへ吸収
     * - App85 等の削除済み入庫アプリには接続しない
     * - 店舗・工場ポータル内部は変更しない（各1ボタンで App87 / App90）
     */

    const BUSINESS_MENU_VERSION = '3.0.0';

    const CAYANAS_BUSINESS_MENU = {
        VERSION: BUSINESS_MENU_VERSION,

        /** 「AYANASU 業務メニュー」アプリID */
        BUSINESS_MENU_APP_ID: 91,

        TITLE: 'AYANASU 業務メニュー',
        LEAD: 'よく使う業務へ直接移動します。店舗・工場の詳細メニューは各ポータルから。',
        /** 共通ハブナビを使う（TOP / 店舗 / 工場） */
        USE_HUB_NAV: true,

        QUERY_KEY: 'cat',
        /** ホーム（11項目グリッド） */
        DEFAULT_CATEGORY: 'home',

        /**
         * 旧6分類・旧8分類 URL 互換 → ホーム or サブへ
         */
        CATEGORY_ALIASES: {
            store: 'home',
            factory: 'home',
            outsourcing: 'home',
            finance: 'home',
            schedule: 'deadline',
            order: 'home',
            logistics: 'home',
            billing: 'home',
            work: 'home',
            customer_schedule: 'deadline',
            analytics: 'home',
            masters: 'masters',
            deadline: 'deadline',
            home: 'home',
        },

        /**
         * ホームに並べる11項目（表示順固定）。
         * mode:
         *   - direct … アプリへ直接遷移（home グリッドの href）
         *   - menu   … ?cat=id でサブ一覧
         */
        MENU_ITEMS: [
            {
                id: 'order',
                label: '受注登録',
                shortLabel: '受注登録',
                icon: 'order',
                mode: 'direct',
                directAppId: 16,
            },
            {
                id: 'outsource_out',
                label: '外注出庫',
                shortLabel: '外注出庫',
                icon: 'outsource',
                mode: 'direct',
                directAppId: 27,
            },
            {
                id: 'wasai_out',
                label: '和裁士出庫',
                shortLabel: '和裁士出庫',
                icon: 'wasai',
                mode: 'direct',
                directAppId: 74,
            },
            {
                id: 'inbound',
                label: '外注入庫',
                shortLabel: '外注入庫',
                icon: 'inbound',
                mode: 'direct',
                directAppId: 78,
            },
            {
                id: 'overseas_out',
                label: '海外出庫',
                shortLabel: '海外出庫',
                icon: 'overseas',
                mode: 'direct',
                directAppId: 28,
            },
            {
                id: 'delivery',
                label: '納品書作成',
                shortLabel: '納品書',
                icon: 'delivery',
                mode: 'direct',
                directAppId: 19,
            },
            {
                id: 'invoice',
                label: '請求書作成',
                shortLabel: '請求書',
                icon: 'invoice',
                mode: 'direct',
                directAppId: 35,
            },
            {
                id: 'deadline',
                label: '納期',
                shortLabel: '納期',
                icon: 'calendar',
                mode: 'menu',
                /**
                 * 推奨: App89 納期負荷カレンダーを主入口。
                 * App94 は納期・納品の横断スケジュール、App98 は和裁士入庫予定。
                 */
                items: [
                    {
                        appId: 89,
                        label: '納期負荷カレンダー',
                        icon: 'calendar',
                        note: '推奨・日次の納期負荷',
                    },
                    {
                        appId: 94,
                        label: '納期・納品スケジュール管理',
                        icon: 'schedule',
                        note: '顧客別・横断スケジュール',
                    },
                    {
                        appId: 98,
                        label: '和裁士別仕事予定カレンダー',
                        icon: 'wasai',
                        note: '和裁士入庫予定',
                    },
                ],
            },
            {
                id: 'store',
                label: '店舗',
                shortLabel: '店舗',
                icon: 'store',
                mode: 'direct',
                directAppId: 87,
            },
            {
                id: 'factory',
                label: '工場',
                shortLabel: '工場',
                icon: 'work',
                mode: 'direct',
                directAppId: 90,
            },
            {
                id: 'masters',
                label: 'マスタ',
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

        /**
         * CATEGORIES は desktop / 旧テスト互換用。
         * home + menu サブ（deadline / masters）を含む。
         */
        get CATEGORIES() {
            const home = {
                id: 'home',
                label: '業務メニュー',
                shortLabel: 'ホーム',
                icon: 'list',
                mode: 'home',
                items: this.MENU_ITEMS,
            };
            const menus = (this.MENU_ITEMS || []).filter((item) => item.mode === 'menu');
            return [home].concat(menus);
        },

        MESSAGES: {
            noAppId: '業務メニューのアプリIDが未設定です。business_menu_config.js の BUSINESS_MENU_APP_ID を設定してください。',
            soonBody: 'このメニューは準備中です。アプリ完成後にリンクを設定します。',
            backHome: '業務メニューへ戻る',
            deadlineLead: '納期関連アプリです。通常の日次確認は「納期負荷カレンダー」を推奨します。',
            mastersLead: 'マスタ一覧です。',
        },
    };

    window.CAYANAS_BUSINESS_MENU = CAYANAS_BUSINESS_MENU;
    window.CAYANAS_BUSINESS_MENU_VERSION = BUSINESS_MENU_VERSION;

}());
