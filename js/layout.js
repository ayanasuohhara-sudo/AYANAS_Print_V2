(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * layout.js
     *
     * 帳票種類を判定する。
     * HTML 生成・印刷・kintone API は使用しない。
     */

    const Layout = {};

    /** Version 1.0: 受注票レイアウト定義 */
    const ORDER_LAYOUT = {
        reportType: 'order',
        templateName: 'order',
        pageClass: 'report-order',
    };

    /**
     * 帳票種類を判定する
     * @param {Object} data - 帳票データ
     * @param {Object} config - プラグイン設定
     * @returns {{
     *   reportType: string,
     *   templateName: string,
     *   pageClass: string
     * }} レイアウト情報
     */
    Layout.resolve = (data, config) => {

        if (!data || typeof data !== 'object') {
            throw new Error('帳票データが指定されていません。');
        }

        if (!config || typeof config !== 'object') {
            throw new Error('プラグイン設定が指定されていません。');
        }

        // Version 1.0: 受注票のみ
        return { ...ORDER_LAYOUT };

    };

    window.Layout = Layout;

})();
