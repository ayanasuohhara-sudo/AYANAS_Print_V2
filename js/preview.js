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

        const jsUrls = getLoadedPluginResourceUrls('DESKTOP_JS');
        const desktopIndex = PLUGIN_JS_FILES.indexOf('js/desktop.js');

        if (desktopIndex >= 0 && jsUrls[desktopIndex]) {
            return jsUrls[desktopIndex];
        }

        throw new Error('プラグイン script URL を取得できません。');

    };

    /** manifest.json desktop.js の読み込み順（contentId URL マッピング用） */
    const PLUGIN_JS_FILES = [
        'lib/JsBarcode.all.min.js',
        'js/format.js',
        'js/record.js',
        'js/template.js',
        'js/layout.js',
        'js/barcode.js',
        'js/preview.js',
        'js/desktop.js',
    ];

    /** manifest.json desktop.css の読み込み順（contentId URL マッピング用） */
    const PLUGIN_CSS_FILES = [
        'css/print.css',
    ];

    /**
     * 基準 script URL から pluginId を取得する
     * @returns {string|null} pluginId
     */
    const getPluginId = () => {

        if (pluginBaseUrl) {
            return new URL(pluginBaseUrl).searchParams.get('pluginId');
        }

        for (const script of document.querySelectorAll('script[src*="download.do"]')) {

            const pluginId = new URL(script.src).searchParams.get('pluginId');

            if (pluginId) {
                return pluginId;
            }

        }

        return null;

    };

    /**
     * kintone が manifest 経由で読み込んだリソース URL 一覧を取得する
     * @param {'DESKTOP_CSS'|'DESKTOP_JS'} downloadType - download.do の type
     * @returns {string[]} リソース URL 一覧（manifest 読み込み順）
     */
    const getLoadedPluginResourceUrls = (downloadType) => {

        const pluginId = getPluginId();
        const isCss = downloadType === 'DESKTOP_CSS';
        const selector = isCss ? 'link[href*="download.do"]' : 'script[src*="download.do"]';
        const attribute = isCss ? 'href' : 'src';

        return Array.from(document.querySelectorAll(selector))
            .map((element) => element[attribute])
            .filter((url) => url.includes(downloadType) && (!pluginId || url.includes(pluginId)));

    };

    /**
     * manifest 読み込み順からリソース URL を取得する
     * @param {string} filePath - プラグイン内ファイルパス
     * @param {string[]} manifestFiles - manifest ファイル一覧
     * @param {'DESKTOP_CSS'|'DESKTOP_JS'} downloadType - download.do の type
     * @returns {string|null} リソース URL
     */
    const getManifestMappedResourceUrl = (filePath, manifestFiles, downloadType) => {

        const normalizedPath = filePath.replace(/^\//, '');
        const fileIndex = manifestFiles.indexOf(normalizedPath);

        if (fileIndex < 0) {
            return null;
        }

        const resourceUrls = getLoadedPluginResourceUrls(downloadType);

        return resourceUrls[fileIndex] ?? null;

    };

    /**
     * プラグインリソースの URL を取得する
     * kintone が manifest 経由で割り当てた contentId URL を使用する
     * @param {string} filePath - プラグイン内ファイルパス
     * @returns {string} リソース URL
     * @throws {Error} URL を取得できない場合
     */
    const getPluginResourceUrl = (filePath) => {

        const normalizedPath = filePath.replace(/^\//, '');

        if (normalizedPath.endsWith('.css')) {

            const cssUrl = getManifestMappedResourceUrl(
                normalizedPath,
                PLUGIN_CSS_FILES,
                'DESKTOP_CSS'
            );

            if (cssUrl) {
                return cssUrl;
            }

        }

        if (normalizedPath.endsWith('.js')) {

            const jsUrl = getManifestMappedResourceUrl(
                normalizedPath,
                PLUGIN_JS_FILES,
                'DESKTOP_JS'
            );

            if (jsUrl) {
                return jsUrl;
            }

        }

        throw new Error(`プラグインリソース URL を取得できません。（${normalizedPath}）`);

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
