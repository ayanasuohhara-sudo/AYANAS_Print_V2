(function () {
    'use strict';

    /**
     * アプリリンクバナー — リンク定義
     * 各アプリから業務ハブへ戻れるようにする。
     * tone は app_nav_banner.css の色クラス（例: blue, teal）
     */

    const APP_NAV_BANNER_VERSION = '1.3.0';

    window.CAYANAS_APP_NAV = {
        VERSION: APP_NAV_BANNER_VERSION,
        highlightCurrent: true,
        title: 'AYANASU',
        /**
         * 共通ハブ（App91/87/90 と同ラベル）
         * 独立業務画面（App16 等）の上部に表示。ACL は変更しない。
         */
        hubLinks: [
            { appId: 91, label: 'TOP', tone: 'amber' },
            { appId: 87, label: '店舗', tone: 'teal' },
            { appId: 90, label: '工場', tone: 'slate' },
        ],
        /** 日常業務で使うアプリのみ（マスタ類は載せない） */
        groups: [
            {
                label: '経営',
                links: [
                    { appId: 82, label: '業務ダッシュボード', tone: 'violet' },
                    { appId: 22, label: '売掛一覧', tone: 'indigo' },
                ],
            },
            {
                label: '受注・納品',
                links: [
                    { appId: 16, label: '受注明細管理', tone: 'blue' },
                    { appId: 88, label: '受注検索', tone: 'sky' },
                    { appId: 19, label: '納品書作成', tone: 'teal' },
                    { appId: 34, label: '社内入庫登録', tone: 'green' },
                    { appId: 84, label: '社内作業登録', tone: 'slate' },
                    { appId: 30, label: '仕上げ完了登録', tone: 'amber' },
                ],
            },
            {
                label: '請求・入金',
                links: [
                    { appId: 35, label: '請求書作成', tone: 'orange' },
                    { appId: 21, label: '入金管理', tone: 'rose' },
                ],
            },
            {
                label: '物流',
                links: [
                    { appId: 78, label: '外注入庫', tone: 'cyan' },
                    { appId: 27, label: '外注出庫', tone: 'sky' },
                    { appId: 28, label: '海外外注出庫', tone: 'purple' },
                    { appId: 74, label: '和裁士出庫', tone: 'lime' },
                    { appId: 75, label: '和裁士支払明細', tone: 'fuchsia' },
                ],
            },
        ],
        portalLink: {
            label: 'ポータルTOPへ戻る',
            hash: '#/portal',
        },
    };

}());
