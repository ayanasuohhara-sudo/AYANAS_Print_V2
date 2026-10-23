(function () {
    'use strict';

    /**
     * AYANAS 工場ポータル App90 — メニュー定義。
     * レコードは保存しない。リンク先アプリへ同一タブで遷移するだけ。
     * FACTORY_MENU_APP_ID が 0 のときは画面を出さない。
     */

    const FACTORY_MENU_VERSION = '1.1.0';

    const CAYANAS_FACTORY_MENU = {
        VERSION: FACTORY_MENU_VERSION,
        /** 工場ポータルアプリ（App90）。0 のときは起動しない */
        FACTORY_MENU_APP_ID: 90,
        TITLE: 'AYANAS 工場ポータル',
        LEAD: '工場の日常業務で使うアプリへ移動します。',
        /**
         * メニュー追加・削除・並び替えはこの配列だけ編集する。
         * appId を画面には出さない。icon は desktop 側の定義キー。
         * path 省略時は一覧（/k/{appId}/）。例: 'edit' → /k/{appId}/edit
         */
        SECTIONS: [
            {
                id: 'factory',
                label: '工場管理',
                size: 'large',
                items: [
                    { appId: 86, label: '工場作業状況ポータル', icon: 'status' },
                    { appId: 89, label: '納期負荷カレンダー', icon: 'calendar' },
                    { appId: 88, label: '受注検索', icon: 'search' },
                ],
            },
            {
                id: 'daily',
                label: '受注・日常業務',
                size: 'normal',
                items: [
                    { appId: 16, label: '受注登録', icon: 'order', path: 'edit' },
                    { appId: 16, label: '受注明細', icon: 'order' },
                    { appId: 30, label: '仕上げ完了登録', icon: 'complete' },
                    { appId: 84, label: '作業状況登録', icon: 'work' },
                    { appId: 78, label: '外注入庫', icon: 'inbound' },
                    { appId: 27, label: '国内外注出庫', icon: 'outsource' },
                    { appId: 74, label: '国内和裁士出庫', icon: 'wasai' },
                    { appId: 34, label: '社内入庫登録・保管場所移動', icon: 'move' },
                ],
            },
            {
                id: 'billing',
                label: '納品・請求',
                size: 'wide',
                items: [
                    { appId: 19, label: '納品書作成', icon: 'delivery' },
                    { appId: 35, label: '請求書作成', icon: 'invoice' },
                ],
            },
        ],
        MESSAGES: {
            noAppId: '工場ポータルのアプリIDが未設定です。factory_menu_config.js の FACTORY_MENU_APP_ID を設定してください。',
        },
    };

    window.CAYANAS_FACTORY_MENU = CAYANAS_FACTORY_MENU;
    window.CAYANAS_FACTORY_MENU_VERSION = FACTORY_MENU_VERSION;

}());
