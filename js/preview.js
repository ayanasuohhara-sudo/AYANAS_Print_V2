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

    /** プラグインリソースの基準 URL */
    let pluginBaseUrl = '';

    /**
     * Preview モジュールを初期化する
     * @param {string} baseUrl - プラグイン script の URL
     * @throws {Error} baseUrl が不正な場合
     */
    Preview.initialize = (baseUrl) => {

        if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
            throw new Error('pluginBaseUrl が不正です。');
        }

        pluginBaseUrl = baseUrl;

    };

    /**
     * pluginBaseUrl の初期化を確認する
     * @throws {Error} 未初期化の場合
     */
    const assertPluginBaseUrlInitialized = () => {

        if (!pluginBaseUrl) {
            throw new Error('pluginBaseUrl が初期化されていません');
        }

    };

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
     * kintone が読み込んだプラグイン script の URL を取得する
     * @returns {string} desktop.js または preview.js の URL
     * @throws {Error} 取得に失敗した場合
     */
    const getPluginBaseUrl = () => {

        if (pluginBaseUrl) {
            return pluginBaseUrl;
        }

        const scriptSelectors = [
            'script[src*="js/desktop.js"]',
            'script[src*="js/preview.js"]',
        ];

        for (const selector of scriptSelectors) {

            const script = document.querySelector(selector);

            if (script?.src) {
                return script.src;
            }

        }

        throw new Error('プラグイン script URL を取得できません。');

    };

    /** manifest 読み込み済み script（URL 差し替えの基準） */
    const PLUGIN_ENTRY_FILES = [
        'js/desktop.js',
        'js/preview.js',
    ];

    /**
     * DOM 上に読み込み済みのプラグインリソース URL を探す
     * @param {string} filePath - プラグイン内ファイルパス
     * @returns {string|null} リソース URL
     */
    const findLoadedPluginResourceUrl = (filePath) => {

        const normalizedPath = filePath.replace(/^\//, '');

        for (const link of document.querySelectorAll('link[href]')) {

            if (link.href.includes(normalizedPath)) {
                return link.href;
            }

        }

        for (const script of document.querySelectorAll('script[src]')) {

            if (script.src.includes(normalizedPath)) {
                return script.src;
            }

        }

        return null;

    };

    /**
     * download.do 形式のプラグインリソース URL を生成する
     * @param {string} filePath - プラグイン内ファイルパス
     * @param {string} baseScriptUrl - 基準 script URL
     * @returns {string|null} リソース URL
     */
    const buildDownloadDoResourceUrl = (filePath, baseScriptUrl) => {

        if (!baseScriptUrl.includes('download.do')) {
            return null;
        }

        const normalizedPath = filePath.replace(/^\//, '');
        const resourceUrl = new URL(baseScriptUrl);
        const pluginId = resourceUrl.searchParams.get('pluginId');

        if (!pluginId) {
            return null;
        }

        resourceUrl.searchParams.set('pluginId', pluginId);
        resourceUrl.searchParams.delete('contentId');
        resourceUrl.searchParams.set('file', normalizedPath);

        return resourceUrl.href;

    };

    /**
     * プラグインリソースの URL を取得する
     * kintone が manifest 経由で読み込んだ script URL を基準に file を差し替える
     * @param {string} filePath - プラグイン内ファイルパス
     * @returns {string} リソース URL
     * @throws {Error} URL を取得できない場合
     */
    const getPluginResourceUrl = (filePath) => {

        const normalizedPath = filePath.replace(/^\//, '');
        const baseScriptUrl = getPluginBaseUrl();

        const loadedUrl = findLoadedPluginResourceUrl(normalizedPath);

        if (loadedUrl) {
            return loadedUrl;
        }

        const downloadDoUrl = buildDownloadDoResourceUrl(normalizedPath, baseScriptUrl);

        if (downloadDoUrl) {
            return downloadDoUrl;
        }

        const resourceUrl = new URL(baseScriptUrl);

        if (resourceUrl.searchParams.has('file')) {
            resourceUrl.searchParams.set('file', normalizedPath);
            return resourceUrl.href;
        }

        for (const entryFile of PLUGIN_ENTRY_FILES) {

            const entryPattern = entryFile.replace('/', '\\/');

            if (new RegExp(`${entryPattern}(?=[?#]|$)`).test(baseScriptUrl)) {
                return baseScriptUrl.replace(
                    new RegExp(`${entryPattern}(?=[?#]|$)`),
                    normalizedPath
                );
            }

        }

        throw new Error(`プラグインリソース URL を生成できません。（${normalizedPath}）`);

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

        const barcodeType = config.barcode_type === 'CODE128' ? 'CODE128' : 'CODE39';

        if (!isBarcodeVisible(config)) {

            return `

<script>
(function () {
${buildButtonScriptHtml()}
})();
<\/script>`;

        }

        const jsBarcodeUrl = getPluginResourceUrl(JSBARCODE_PATH);
        const barcodeJsUrl = getPluginResourceUrl(BARCODE_JS_PATH);

        return `

<script>
(function () {

    console.log('[1] preview script start');

    var barcodeValue = ${JSON.stringify(barcodeValue)};
    var barcodeType = ${JSON.stringify(barcodeType)};
    var jsBarcodeUrl = ${JSON.stringify(jsBarcodeUrl)};
    var barcodeJsUrl = ${JSON.stringify(barcodeJsUrl)};

    function initButtons() {
${buildButtonScriptHtml()}
    }

    function drawBarcode() {

        console.log(document.getElementById('barcode'));
        console.log(document.getElementById('barcode')?.outerHTML);

        console.log('[4] drawBarcode');

        if (typeof window.JsBarcode !== 'function') {
            return;
        }

        if (!window.Barcode || typeof window.Barcode.draw !== 'function') {
            return;
        }

        if (!barcodeValue) {
            return;
        }

        var svg = document.getElementById('barcode');

        if (!svg) {
            return;
        }

        try {

            console.log(window.JsBarcode);
            console.log(window.Barcode);

            window.Barcode.draw(svg, barcodeValue, { barcode_type: barcodeType });

            console.log(document.getElementById('barcode').outerHTML);

            console.log('[5] Barcode.draw finished');

        } catch (error) {

            console.error(error);

            alert(
                'バーコード描画エラー\\n\\n'
                + String(error)
            );

        }

    }

    function loadBarcodeJs() {

        var script = document.createElement('script');

        script.src = barcodeJsUrl;

        script.onload = function () {

            console.log('[3] Barcode module loaded');

            drawBarcode();
            initButtons();

        };

        script.onerror = function () {
            console.error('barcode.js の読み込みに失敗しました。', barcodeJsUrl);
            initButtons();
        };

        document.head.appendChild(script);

    }

    function loadJsBarcode() {

        var script = document.createElement('script');

        script.src = jsBarcodeUrl;

        script.onload = function () {

            console.log('[2] JsBarcode loaded');

            loadBarcodeJs();

        };

        script.onerror = function () {
            console.error('JsBarcode.all.min.js の読み込みに失敗しました。', jsBarcodeUrl);
            initButtons();
        };

        document.head.appendChild(script);

    }

    loadJsBarcode();

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

        const printCssUrl = getPluginResourceUrl(PRINT_CSS_PATH);
        const jsBarcodeUrl = getPluginResourceUrl(JSBARCODE_PATH);
        const barcodeJsUrl = getPluginResourceUrl(BARCODE_JS_PATH);

        console.log('[AYANAS Print] print.css', printCssUrl);
        console.log('[AYANAS Print] JsBarcode.all.min.js', jsBarcodeUrl);
        console.log('[AYANAS Print] barcode.js', barcodeJsUrl);

        html = html.replace(
            '<div class="page">',
            `<div class="${getPageClassName(config)}">`
        );

        html = html.replace(
            '</head>',
            `<link rel="stylesheet" href="${printCssUrl}">\n`
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

            assertPluginBaseUrlInitialized();
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
                || error.message.includes('pluginBaseUrl')
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
