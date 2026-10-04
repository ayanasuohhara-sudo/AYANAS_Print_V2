(function () {
    'use strict';

    /**
     * アプリリンクバナー — リンク定義
     * 環境に合わせて appId / label を編集してください。
     * tone は app_nav_banner.css の色クラス（例: blue, teal）
     */

    const APP_NAV_BANNER_VERSION = '1.1.3';

    window.CAYANAS_APP_NAV = {
        VERSION: APP_NAV_BANNER_VERSION,
        highlightCurrent: true,
        title: 'AYANASU',
        /** 日常業務で使うアプリのみ（マスタ類は載せない） */
        groups: [
            {
                label: '経営',
                links: [
                    { appId: 82, label: '業務ダッシュボード', tone: 'violet' },
                    { appId: 22, label: '売掛管理', tone: 'indigo' },
                ],
            },
            {
                label: '受注・納品',
                links: [
                    { appId: 16, label: '受注登録', tone: 'blue' },
                    { appId: 19, label: '納品書', tone: 'teal' },
                    { appId: 34, label: '社内入庫', tone: 'green' },
                    { appId: 84, label: '社内作業登録', tone: 'slate' },
                    { appId: 30, label: '検品・仕上げ完了', tone: 'amber' },
                ],
            },
            {
                label: '請求・入金',
                links: [
                    { appId: 35, label: '請求書', tone: 'orange' },
                    { appId: 21, label: '入金', tone: 'rose' },
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
            label: 'TOPメニューへ戻る',
            hash: '#/portal',
        },
    };

}());
