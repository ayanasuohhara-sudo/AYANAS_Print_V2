(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * utils/dom.js
     *
     * プレビュー画面向け HTML 断片生成。
     * kintone 画面上の DOM 操作は行わない。
     */

    const Dom = {};

    /**
     * 印刷・閉じるボタン HTML を生成する
     * @returns {string} ボタン HTML
     */
    Dom.buildButtonsHtml = () => `

    <div class="buttons">
        <button type="button" id="ayanas-print-btn">印刷</button>
        <button type="button" id="ayanas-close-btn">閉じる</button>
    </div>`;

    /**
     * 印刷用 @page スタイル HTML を生成する
     * @param {Object} config - プラグイン設定
     * @returns {string} スタイル HTML
     */
    Dom.buildPrintStyleHtml = (config = {}) => {

        const paperSize = config.paper_size === 'A5' ? 'A5' : 'A4';
        const orientation = config.print_orientation === 'portrait' ? 'portrait' : 'landscape';

        return `<style>@page { size: ${paperSize} ${orientation}; margin: 10mm; }</style>`;

    };

    /**
     * 用紙サイズに応じた page クラス名を取得する
     * @param {Object} config - プラグイン設定
     * @returns {string} クラス名
     */
    Dom.getPageClassName = (config = {}) => {

        const paperClass = config.paper_size === 'A5' ? 'page--a5' : 'page--a4';
        const orientationClass = config.print_orientation === 'portrait'
            ? 'page--portrait'
            : 'page--landscape';

        return `page ${paperClass} ${orientationClass}`;

    };

    /**
     * 印刷・閉じるボタンのイベント登録スクリプト
     * @returns {string} スクリプト本文
     */
    Dom.buildButtonScriptBody = () => `

    document.getElementById('ayanas-print-btn').addEventListener('click', function () {
        window.print();
    });

    document.getElementById('ayanas-close-btn').addEventListener('click', function () {
        window.close();
    });`;

    window.Dom = Dom;

})();
