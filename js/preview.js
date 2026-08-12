(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * preview.js
     *
     * Template.render() で取得した HTML を別ウィンドウでプレビュー表示する。
     * Record.get() は呼び出さない。
     */

    const Preview = {};

    /** プレビューウィンドウのサイズ */
    const PREVIEW_WINDOW_FEATURES = 'width=1200,height=900';

    /** print.css のパス */
    const PRINT_CSS_PATH = 'css/print.css';

    /** JsBarcode ライブラリのパス */
    const JSBARCODE_PATH = 'lib/JsBarcode.all.min.js';

    /** barcode.js のパス */
    const BARCODE_JS_PATH = 'js/barcode.js';

    /**
     * Template モジュールの読み込みを確認する
     * @throws {Error} Template が未読込の場合
     */
    const assertTemplateLoaded = () => {

        if (typeof Template === 'undefined') {
            throw new Error('Template モジュールが読み込まれていません。');
        }

        if (typeof Template.render !== 'function') {
            throw new Error('Template.render が利用できません。');
        }

    };

    /**
     * 帳票データの妥当性を検証する
     * @param {*} data - 帳票データ
     * @throws {Error} データが不正な場合
     */
    const validateData = (data) => {

        if (!data || typeof data !== 'object') {
            throw new Error('帳票データが指定されていません。');
        }

        if (!data.header || typeof data.header !== 'object') {
            throw new Error('header が不正です。');
        }

    };

    /**
     * プラグインベース URL を取得する
     * @returns {string} ベース URL（末尾スラッシュ付き）
     * @throws {Error} ベース URL を取得できない場合
     */
    const getPluginBaseUrl = () => {

        const scriptSelectors = [
            'script[src*="js/preview.js"]',
            'script[src*="js/desktop.js"]',
            'script[src*="/plugin/"]',
        ];

        for (const selector of scriptSelectors) {

            const script = document.querySelector(selector);

            if (!script?.src) {
                continue;
            }

            const matched = script.src.match(/^(.*\/plugin\/[^/]+\/)/);

            if (matched) {
                return matched[1];
            }

        }

        if (typeof kintone !== 'undefined' && kintone.$PLUGIN_ID) {
            return `/k/plugin/${kintone.$PLUGIN_ID}/`;
        }

        throw new Error('プラグインリソース URL を取得できません。');

    };

    /**
     * プラグインリソースの URL を取得する
     * @param {string} filePath - プラグイン内ファイルパス
     * @returns {string} リソース URL
     * @throws {Error} URL を取得できない場合
     */
    const getPluginResourceUrl = (filePath) => {

        const normalizedPath = filePath.replace(/^\//, '');

        return `${getPluginBaseUrl()}${normalizedPath}`;

    };

    /**
     * バーコード描画用文字列を取得する
     * @param {Object} data - 帳票データ
     * @returns {string} バーコード値
     */
    const getBarcodeValue = (data) => String(data.header.manage_no ?? '');

    /**
     * 印刷・閉じるボタン HTML を生成する
     * @returns {string} ボタン HTML
     */
    const buildButtonsHtml = () => `

    <div class="buttons">
        <button type="button" id="ayanas-print-btn">印刷</button>
        <button type="button" id="ayanas-close-btn">閉じる</button>
    </div>`;

    /**
     * バーコード表示有無を判定する
     * @param {Object} config - プラグイン設定
     * @returns {boolean} 表示する場合 true
     */
    const isBarcodeVisible = (config) => config.barcode_visible !== '0';

    /**
     * 印刷用 @page スタイル HTML を生成する
     * @param {Object} config - プラグイン設定
     * @returns {string} スタイル HTML
     */
    const buildPrintStyleHtml = (config = {}) => {

        const paperSize = config.paper_size === 'A5' ? 'A5' : 'A4';
        const orientation = config.print_orientation === 'portrait' ? 'portrait' : 'landscape';

        return `<style>@page { size: ${paperSize} ${orientation}; margin: 10mm; }</style>`;

    };

    /**
     * 印刷・閉じるボタンのイベント登録スクリプト
     * @returns {string} スクリプト HTML
     */
    const buildButtonScriptHtml = () => `

    document.getElementById('ayanas-print-btn').addEventListener('click', function () {
        window.print();
    });

    document.getElementById('ayanas-close-btn').addEventListener('click', function () {
        window.close();
    });`;

    /**
     * プレビュー用スクリプト HTML を生成する
     * @param {string} barcodeValue - バーコード値
     * @param {Object} config - プラグイン設定
     * @returns {string} スクリプト HTML
     */
    const buildScriptHtml = (barcodeValue, config = {}) => {

        const jsBarcodeUrl = getPluginResourceUrl(JSBARCODE_PATH);
        const barcodeJsUrl = getPluginResourceUrl(BARCODE_JS_PATH);
        const barcodeType = config.barcode_type === 'CODE128' ? 'CODE128' : 'CODE39';
        const drawEnabled = isBarcodeVisible(config);

        if (!drawEnabled) {

            return `

<script>
(function () {
${buildButtonScriptHtml()}
})();
<\/script>`;

        }

        return `

<script src="${jsBarcodeUrl}"><\/script>
<script src="${barcodeJsUrl}"><\/script>
<script>
(function () {

    var barcodeValue = ${JSON.stringify(barcodeValue)};
    var barcodeType = ${JSON.stringify(barcodeType)};

    function initButtons() {
${buildButtonScriptHtml()}
    }

    function applyOpenerGlobals() {

        if (!window.opener) {
            return false;
        }

        if (typeof window.opener.JsBarcode === 'function') {
            window.JsBarcode = window.opener.JsBarcode;
        }

        if (window.opener.Barcode && typeof window.opener.Barcode.draw === 'function') {
            window.Barcode = window.opener.Barcode;
        }

        return typeof window.JsBarcode === 'function'
            && window.Barcode
            && typeof window.Barcode.draw === 'function';

    }

    function assertBarcodeGlobals() {

        if (typeof window.JsBarcode !== 'function') {
            throw new Error('JsBarcode ライブラリが読み込まれていません。');
        }

        if (typeof window.Barcode === 'undefined' || typeof window.Barcode.draw !== 'function') {
            throw new Error('Barcode モジュールが読み込まれていません。');
        }

    }

    function drawBarcode() {

        if (!barcodeValue) {
            return;
        }

        assertBarcodeGlobals();

        var svg = document.getElementById('barcode');

        window.Barcode.draw(svg, barcodeValue, { format: barcodeType });

    }

    function onPreviewReady() {

        try {

            if (!applyOpenerGlobals()) {
                assertBarcodeGlobals();
            }

            drawBarcode();

        } catch (error) {

            console.error('[AYANAS Print]', error);

            var message = error instanceof Error
                ? error.message
                : '不明なエラーが発生しました。';

            alert('バーコード描画エラー\\n\\n' + message);

        }

        initButtons();

    }

    if (document.readyState === 'complete') {
        onPreviewReady();
    } else {
        window.addEventListener('load', onPreviewReady);
    }

})();
<\/script>`;

    };

    /**
     * プレビュー用 HTML を組み立てる
     * @param {Object} data - 帳票データ
     * @returns {string} プレビュー HTML
     */
    const buildPreviewHtml = (data, config = {}) => {

        const barcodeValue = getBarcodeValue(data);
        let html = Template.render(data, config);

        html = html.replace(
            '</head>',
            `<link rel="stylesheet" href="${getPluginResourceUrl(PRINT_CSS_PATH)}">\n`
            + `${buildPrintStyleHtml(config)}\n</head>`
        );

        html = html.replace(
            /<\/div>\s*<\/body>/,
            `${buildButtonsHtml()}\n</div>\n</body>`
        );

        html = html.replace(
            '</body>',
            `${buildScriptHtml(barcodeValue, config)}\n</body>`
        );

        return html;

    };

    /**
     * 印刷プレビューを別ウィンドウで開く
     * @param {{
     *   header: Object,
     *   details: Array<Object>,
     *   summary: Object
     * }} data - 帳票データ
     * @param {Object} [config={}] - プラグイン設定
     * @throws {Error} プレビュー表示に失敗した場合
     */
    Preview.open = (data, config = {}) => {

        try {

            assertTemplateLoaded();
            validateData(data);

            const printWindow = window.open('', '_blank', PREVIEW_WINDOW_FEATURES);

            if (!printWindow) {
                throw new Error('印刷ウィンドウを開けません。');
            }

            const html = buildPreviewHtml(data, config);

            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();

        } catch (error) {

            if (error instanceof Error && (
                error.message.includes('Template')
                || error.message.includes('帳票データ')
                || error.message.includes('header')
                || error.message.includes('印刷ウィンドウ')
                || error.message.includes('kintone')
                || error.message.includes('プラグインリソース URL')
            )) {
                throw error;
            }

            const message = error instanceof Error
                ? error.message
                : '不明なエラー';

            throw new Error(`Preview.open: プレビュー表示に失敗しました。（${message}）`);

        }

    };

    window.Preview = Preview;

})();
