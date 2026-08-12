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

    /** プラグイン設定のデフォルト値 */
    const DEFAULT_CONFIG = {
        report_title: '受注票',
        barcode_type: 'CODE39',
        barcode_visible: '1',
        print_orientation: 'landscape',
        paper_size: 'A4',
    };

    /**
     * プラグイン設定を正規化する
     * @param {Object} saved - 保存済み設定
     * @returns {Object} 正規化済み設定
     */
    const normalizeConfig = (saved) => {

        const config = { ...DEFAULT_CONFIG };

        if (!saved || typeof saved !== 'object') {
            return config;
        }

        if (typeof saved.report_title === 'string' && saved.report_title.trim() !== '') {
            config.report_title = saved.report_title.trim();
        }

        config.barcode_type = saved.barcode_type === 'CODE128' ? 'CODE128' : 'CODE39';
        config.barcode_visible = saved.barcode_visible === '0' ? '0' : '1';
        config.print_orientation = saved.print_orientation === 'portrait' ? 'portrait' : 'landscape';
        config.paper_size = 'A4';

        return config;

    };

    /**
     * kintone からプラグイン設定を取得する
     * @returns {Object} プラグイン設定
     */
    const loadPluginConfig = () => {

        try {

            if (typeof kintone === 'undefined') {
                return { ...DEFAULT_CONFIG };
            }

            if (!kintone.plugin?.app?.getConfig || !kintone.$PLUGIN_ID) {
                return { ...DEFAULT_CONFIG };
            }

            const saved = kintone.plugin.app.getConfig(kintone.$PLUGIN_ID);

            return normalizeConfig(saved);

        } catch (error) {

            console.error('[AYANAS Print]', error);

            return { ...DEFAULT_CONFIG };

        }

    };

    /**
     * Layout モジュールの読み込みを確認する
     * @throws {Error} Layout が未読込の場合
     */
    const assertLayoutLoaded = () => {

        if (typeof Layout === 'undefined' || typeof Layout.resolve !== 'function') {
            throw new Error('Layout モジュールが読み込まれていません。');
        }

    };

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
            return `${window.location.origin}/k/plugin/${kintone.$PLUGIN_ID}/`;
        }

        throw new Error('プラグインリソース URL を取得できません。');

    };

    /**
     * プラグインリソースの URL を取得する
     * @param {string} filePath - プラグイン内ファイルパス
     * @returns {string} 絶対 URL
     * @throws {Error} URL を取得できない場合
     */
    const getPluginResourceUrl = (filePath) => {

        const normalizedPath = filePath.replace(/^\//, '');
        let baseUrl = getPluginBaseUrl();

        if (baseUrl.startsWith('/')) {
            baseUrl = `${window.location.origin}${baseUrl}`;
        }

        return `${baseUrl}${normalizedPath}`;

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
    const buildPrintStyleHtml = (config) => {

        const paperSize = config.paper_size === 'A5' ? 'A5' : 'A4';
        const orientation = config.print_orientation === 'portrait' ? 'portrait' : 'landscape';

        return `<style>@page { size: ${paperSize} ${orientation}; margin: 10mm; }</style>`;

    };

    /**
     * 用紙方向に応じた page クラス名を取得する
     * @param {Object} config - プラグイン設定
     * @returns {string} クラス名
     */
    const getPageClassName = (config) => (
        config.print_orientation === 'portrait' ? 'page page--portrait' : 'page page--landscape'
    );

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

    var jsBarcodeUrl = ${JSON.stringify(jsBarcodeUrl)};
    var barcodeJsUrl = ${JSON.stringify(barcodeJsUrl)};
    var barcodeValue = ${JSON.stringify(barcodeValue)};
    var barcodeType = ${JSON.stringify(barcodeType)};

    function initButtons() {
${buildButtonScriptHtml()}
    }

    function logBarcodeGlobals() {

        console.log('[AYANAS Print] window.Barcode', window.Barcode);
        console.log('[AYANAS Print] window.JsBarcode', window.JsBarcode);

    }

    function hasLocalBarcodeModule() {

        return typeof window.JsBarcode === 'function'
            && window.Barcode
            && typeof window.Barcode.draw === 'function';

    }

    function drawBarcode() {

        if (!barcodeValue) {
            return;
        }

        logBarcodeGlobals();

        var svg = document.getElementById('barcode');

        console.log(svg);
        console.log(svg && svg.tagName);
        console.log(svg instanceof SVGElement);

        if (!svg || String(svg.tagName).toLowerCase() !== 'svg') {
            return;
        }

        if (!hasLocalBarcodeModule()) {
            throw new Error('Barcode モジュールが読み込まれていません。');
        }

        var drawOptions = { format: barcodeType, barcode_type: barcodeType };

        window.Barcode.draw(svg, barcodeValue, drawOptions);

    }

    function loadScript(url) {

        return new Promise(function (resolve, reject) {

            var script = document.createElement('script');

            script.src = url;
            script.onload = function () {
                resolve();
            };
            script.onerror = function () {
                reject(new Error('スクリプトの読み込みに失敗しました。（' + url + '）'));
            };
            document.head.appendChild(script);

        });

    }

    function loadBarcodeModules() {

        if (typeof window.JsBarcode === 'function') {
            return loadScript(barcodeJsUrl);
        }

        return loadScript(jsBarcodeUrl).then(function () {
            return loadScript(barcodeJsUrl);
        });

    }

    function runPreview() {

        try {

            drawBarcode();

        } catch (error) {

            console.error(error);
            console.error(error.stack);

            alert(
                'バーコード描画エラー\\n\\n'
                + String(error)
                + '\\n\\n'
                + (error && error.stack ? error.stack : '')
            );

        }

        initButtons();

    }

    function start() {

        if (!hasLocalBarcodeModule()) {
            loadBarcodeModules()
                .then(function () {
                    runPreview();
                })
                .catch(function (error) {

                    console.error(error);
                    console.error(error.stack);

                    alert(
                        'バーコード読み込みエラー\\n\\n'
                        + String(error)
                        + '\\n\\n'
                        + (error && error.stack ? error.stack : '')
                    );
                    initButtons();

                });
            return;
        }

        runPreview();

    }

    if (document.readyState === 'complete') {
        start();
    } else {
        window.addEventListener('load', start);
    }

})();
<\/script>`;

    };

    /**
     * プレビュー用 HTML を組み立てる
     * @param {Object} data - 帳票データ
     * @returns {string} プレビュー HTML
     */
    const buildPreviewHtml = (data, config, layout) => {

        const barcodeValue = getBarcodeValue(data);
        let html = Template.render(data, config, layout);

        html = html.replace(
            '<div class="page">',
            `<div class="${getPageClassName(config)}">`
        );

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
     * @throws {Error} プレビュー表示に失敗した場合
     */
    Preview.open = (data) => {

        try {

            assertTemplateLoaded();
            assertLayoutLoaded();
            validateData(data);

            const config = loadPluginConfig();
            const layout = Layout.resolve(data, config);

            const printWindow = window.open('', '_blank', PREVIEW_WINDOW_FEATURES);

            if (!printWindow) {
                throw new Error('印刷ウィンドウを開けません。');
            }

            const html = buildPreviewHtml(data, config, layout);

            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();

        } catch (error) {

            if (error instanceof Error && (
                error.message.includes('Template')
                || error.message.includes('Layout')
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
