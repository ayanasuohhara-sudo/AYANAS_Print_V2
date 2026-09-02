(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * preview.js
     *
     * 帳票 HTML を別ウィンドウでプレビュー表示する。
     * 帳票種類は Layout.resolve() に委譲する。
     */

    const Preview = {};

    const PREVIEW_WINDOW_FEATURES = 'width=1200,height=900';
    const PRINT_CSS_PATH = 'css/print.css';
    const JSBARCODE_PATH = 'lib/JsBarcode.all.min.js';
    const BARCODE_JS_PATH = 'js/barcode.js';

    let pluginBaseUrl = '';
    let cachedPluginId = '';

    const parsePluginIdFromUrl = (url) => {

        if (typeof url !== 'string' || url.trim() === '') {
            return '';
        }

        try {
            return String(new URL(url).searchParams.get('pluginId') ?? '').trim();
        } catch (error) {
            return '';
        }

    };

    const findPrintPluginScriptUrl = () => {

        const scripts = Array.from(document.querySelectorAll('script[src*="download.do"]'));

        for (let index = scripts.length - 1; index >= 0; index -= 1) {

            const src = scripts[index]?.src ?? '';

            if (!src.includes('type=DESKTOP_JS')) {
                continue;
            }

            const pluginId = parsePluginIdFromUrl(src);

            if (pluginId) {
                return src;
            }

        }

        return '';

    };

    const DEFAULT_CONFIG = {
        report_title: '受注票',
        barcode_type: 'CODE39',
        barcode_visible: '1',
        print_orientation: 'landscape',
        paper_size: 'A4',
    };

    const PLUGIN_JS_FILES = [
        'lib/JsBarcode.all.min.js',
        'js/core.js',
        'js/invoice_layout.js',
        'js/record.js',
        'js/layout.js',
        'js/barcode.js',
        'js/preview.js',
        'js/company-seal-data.js',
        'js/templates/order.js',
        'js/templates/order_detail.js',
        'js/templates/overseas_outbound_detail.js',
        'js/templates/overseas_outbound_sheet.js',
        'js/templates/delivery.js',
        'js/templates/invoice.js',
        'js/templates/invoice_window.js',
        'js/templates/estimate.js',
        'js/overseas_outbound_service.js',
        'js/overseas_outbound_index.js',
        'js/desktop.js',
    ];

    const PLUGIN_CSS_FILES = [
        'css/print.css',
    ];

    Preview.initialize = (baseUrl) => {

        if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
            throw new Error('pluginBaseUrl が不正です。');
        }

        pluginBaseUrl = baseUrl;
        cachedPluginId = parsePluginIdFromUrl(baseUrl);

        if (!cachedPluginId) {
            cachedPluginId = parsePluginIdFromUrl(findPrintPluginScriptUrl());
        }

        console.log('pluginId', cachedPluginId);

        if (typeof Core !== 'undefined' && typeof Core.setPrintPluginId === 'function') {
            Core.setPrintPluginId(cachedPluginId);
        }

    };

    const assertPluginBaseUrlInitialized = () => {

        if (!pluginBaseUrl) {
            throw new Error('pluginBaseUrl が初期化されていません');
        }

    };

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
        config.paper_size = saved.paper_size === 'A5' ? 'A5' : 'A4';

        return config;

    };

    const loadPluginConfig = () => {

        try {

            if (typeof kintone === 'undefined') {
                return { ...DEFAULT_CONFIG };
            }

            const pluginId = getPluginId();

            if (pluginId && kintone.plugin?.app?.getConfig) {
                return normalizeConfig(kintone.plugin.app.getConfig(pluginId));
            }

            if (!kintone.plugin?.app?.getConfig || !kintone.$PLUGIN_ID) {
                return { ...DEFAULT_CONFIG };
            }

            return normalizeConfig(kintone.plugin.app.getConfig(kintone.$PLUGIN_ID));

        } catch (error) {

            console.error('[AYANAS Print]', error);

            return { ...DEFAULT_CONFIG };

        }

    };

    const assertLayoutLoaded = () => {

        Validation.assertModule(Layout, 'Layout', 'resolve');

    };

    const buildPreviewConfig = (config, layout) => Common.mergeConfig(
        config,
        {
            report_title: layout.title ?? config.report_title,
            paper_size: layout.paperSize ?? config.paper_size,
            print_orientation: layout.orientation ?? config.print_orientation,
        },
        layout.configDefaults ?? {}
    );

    const getPluginId = () => {

        if (cachedPluginId) {
            return cachedPluginId;
        }

        if (pluginBaseUrl) {
            cachedPluginId = parsePluginIdFromUrl(pluginBaseUrl);

            if (cachedPluginId) {
                return cachedPluginId;
            }

        }

        const scriptUrl = findPrintPluginScriptUrl();

        if (scriptUrl) {
            cachedPluginId = parsePluginIdFromUrl(scriptUrl);

            if (cachedPluginId) {
                return cachedPluginId;
            }

        }

        for (const script of document.querySelectorAll('script[src*="download.do"]')) {

            const pluginId = parsePluginIdFromUrl(script.src);

            if (pluginId) {
                cachedPluginId = pluginId;
                return pluginId;
            }

        }

        return null;

    };

    const getLoadedPluginResourceUrls = (downloadType) => {

        const pluginId = getPluginId();
        const isCss = downloadType === 'DESKTOP_CSS';
        const selector = isCss ? 'link[href*="download.do"]' : 'script[src*="download.do"]';
        const attribute = isCss ? 'href' : 'src';

        return Array.from(document.querySelectorAll(selector))
            .map((element) => element[attribute])
            .filter((url) => url.includes(downloadType) && (!pluginId || url.includes(pluginId)));

    };

    const getManifestMappedResourceUrl = (filePath, manifestFiles, downloadType) => {

        const normalizedPath = filePath.replace(/^\//, '');
        const fileIndex = manifestFiles.indexOf(normalizedPath);

        if (fileIndex < 0) {
            return null;
        }

        const resourceUrls = getLoadedPluginResourceUrls(downloadType);

        return resourceUrls[fileIndex] ?? null;

    };

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

    Preview.getPluginAssetUrl = (relativePath) => {

        const normalizedPath = String(relativePath ?? '').replace(/^\//, '').trim();

        if (normalizedPath === '') {
            return '';
        }

        if (/^(https?:|data:)/i.test(normalizedPath)) {
            return normalizedPath;
        }

        const pluginId = getPluginId();

        if (!pluginId) {
            return '';
        }

        if (typeof kintone !== 'undefined' && typeof kintone.api?.url === 'function') {
            return kintone.api.url(`/k/plugin/${pluginId}/${normalizedPath}`, true);
        }

        return '';

    };

    const loadScriptFromUrl = (scriptUrl, relativePath) => new Promise((resolve, reject) => {

        const existing = Array.from(document.querySelectorAll('script[src]'))
            .find((element) => element.src === scriptUrl);

        if (existing) {
            resolve();
            return;
        }

        const script = document.createElement('script');

        script.type = 'text/javascript';
        script.src = scriptUrl;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`スクリプトの読み込みに失敗しました。（${relativePath}）`));
        document.head.appendChild(script);

    });

    Preview.loadScript = (relativePath) => {

        const normalizedPath = String(relativePath ?? '').replace(/^\//, '');

        if (normalizedPath === '') {
            return Promise.reject(new Error('テンプレートパスが指定されていません。'));
        }

        const pluginId = getPluginId();
        const currentUrl = pluginId && typeof kintone !== 'undefined' && typeof kintone.api?.url === 'function'
            ? kintone.api.url(`/k/plugin/${pluginId}/${normalizedPath}`, true)
            : `/k/plugin/{pluginId}/${normalizedPath}.json`;

        const fixedUrl = getManifestMappedResourceUrl(
            normalizedPath,
            PLUGIN_JS_FILES,
            'DESKTOP_JS'
        );

        console.log('Current URL', currentUrl);
        console.log('Fixed URL', fixedUrl || '(manifest 未登録)');

        if (!fixedUrl) {
            return Promise.reject(new Error(`プラグインリソース URL を取得できません。（${normalizedPath}）`));
        }

        return loadScriptFromUrl(fixedUrl, normalizedPath);

    };

    const getBarcodeValue = (data, layout) => {

        const fieldPath = layout.barcodeField || 'header.manage_no';
        const value = Common.getValueByPath(data, fieldPath);

        return value === null || value === undefined ? '' : String(value);

    };

    const buildPreviewButtonsHtml = () => `

<div class="buttons">
    <button type="button" id="ayanas-print-btn">印刷</button>
    <button type="button" id="ayanas-close-btn">閉じる</button>
</div>`;

    const buildButtonScriptBody = () => `

    function runPrint() {
        var savedTitle = document.title;
        document.title = ' ';
        var restoreTitle = function () {
            document.title = savedTitle;
            window.removeEventListener('afterprint', restoreTitle);
        };
        window.addEventListener('afterprint', restoreTitle);
        window.print();
    }

    document.getElementById('ayanas-print-btn').addEventListener('click', runPrint);

    document.getElementById('ayanas-close-btn').addEventListener('click', function () {
        window.close();
    });`;

    const getBarcodeDrawOptions = (layout, barcodeType) => {

        if (layout.reportType === 'order_detail') {
            return {
                barcode_type: barcodeType,
                format: barcodeType,
                height: 70,
                width: 2.5,
                margin: 12,
                displayValue: false,
                textAlign: 'center',
                background: '#ffffff',
                lineColor: '#000000',
            };
        }

        return { barcode_type: barcodeType };

    };

    const buildScriptHtml = (barcodeValue, config = {}, resourceUrls = {}, layout = {}) => {

        const barcodeType = Barcode.resolveFormat(config);
        const barcodeDrawOptions = getBarcodeDrawOptions(layout, barcodeType);

        if (config.barcode_visible === '0') {

            return `

<script>
(function () {
${buildButtonScriptBody()}
})();
<\/script>`;

        }

        const jsBarcodeUrl = resourceUrls.jsBarcodeUrl;
        const barcodeJsUrl = resourceUrls.barcodeJsUrl;

        return `

<script>
(function () {

    var barcodeValue = ${JSON.stringify(barcodeValue)};
    var barcodeType = ${JSON.stringify(barcodeType)};
    var barcodeDrawOptions = ${JSON.stringify(barcodeDrawOptions)};
    var jsBarcodeUrl = ${JSON.stringify(jsBarcodeUrl)};
    var barcodeJsUrl = ${JSON.stringify(barcodeJsUrl)};

    function initButtons() {
${buildButtonScriptBody()}
    }

    function drawBarcode() {

        if (typeof window.JsBarcode !== 'function') {
            return;
        }

        if (!window.Barcode || typeof window.Barcode.draw !== 'function') {
            return;
        }

        if (!barcodeValue) {
            initButtons();
            return;
        }

        var svg = document.getElementById('barcode');

        if (!svg) {
            initButtons();
            return;
        }

        try {
            window.Barcode.draw(svg, barcodeValue, barcodeDrawOptions);
        } catch (error) {
            console.error(error);
            alert('バーコード描画エラー\\n\\n' + String(error));
        }

    }

    function loadBarcodeJs() {

        var script = document.createElement('script');
        script.src = barcodeJsUrl;
        script.onload = function () {
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

    const buildPreviewHtml = (data, config, layout) => {

        const previewConfig = buildPreviewConfig(config, layout);

        if (layout.reportType === 'delivery'
            || layout.reportType === 'invoice'
            || layout.reportType === 'matsuba_summary_invoice') {
            previewConfig.print_orientation = 'portrait';
            previewConfig.paper_size = 'A4';
        }

        if (layout.reportType === 'order_detail') {
            previewConfig.print_orientation = 'landscape';
            previewConfig.paper_size = 'A4';
            previewConfig.page_margin = '0';
            previewConfig.barcode_visible = '1';
        }

        if (layout.reportType === 'overseas_outbound_detail'
            || layout.reportType === 'overseas_outbound_sheet') {
            previewConfig.print_orientation = 'landscape';
            previewConfig.paper_size = 'A4';
            previewConfig.page_margin = '0';
            previewConfig.barcode_visible = '0';
        }

        if (layout.reportType === 'invoice' && layout.invoiceLayout === 'window_envelope') {
            previewConfig.print_orientation = 'portrait';
            previewConfig.paper_size = 'A4';
        }

        const barcodeValue = getBarcodeValue(data, layout);
        let html = layout.template.render(data, previewConfig, layout);

        const printCssUrl = getPluginResourceUrl(PRINT_CSS_PATH);
        const jsBarcodeUrl = getPluginResourceUrl(JSBARCODE_PATH);
        const barcodeJsUrl = getPluginResourceUrl(BARCODE_JS_PATH);
        const invoiceLayoutStyle = layout.reportType === 'invoice'
            && typeof InvoiceLayout !== 'undefined'
            ? InvoiceLayout.getCssVariables()
            : '';

        html = html.split('<div class="page">').join(`<div class="${Dom.getPageClassName(previewConfig)}">`);

        if (layout.reportType === 'delivery'
            || layout.reportType === 'invoice'
            || layout.reportType === 'matsuba_summary_invoice') {
            html = html.replace(/<title>[^<]*<\/title>/i, '<title> </title>');
        }

        if (layout.reportType === 'order_detail'
            || layout.reportType === 'overseas_outbound_detail'
            || layout.reportType === 'overseas_outbound_sheet') {
            html = html.replace(/<title>[^<]*<\/title>/i, '<title> </title>');
        }

        html = html.replace(
            '</head>',
            `<link rel="stylesheet" href="${printCssUrl}">\n`
            + `${Dom.buildPrintStyleHtml(previewConfig)}\n`
            + (invoiceLayoutStyle ? `<style>:root{${invoiceLayoutStyle}}</style>\n` : '')
            + `</head>`
        );

        html = html.replace(
            '</body>',
            `${buildPreviewButtonsHtml()}\n`
            + `${buildScriptHtml(barcodeValue, previewConfig, { jsBarcodeUrl, barcodeJsUrl }, layout)}\n</body>`
        );

        return html;

    };

    Preview.open = async (data, printOptions = {}) => {

        try {

            assertPluginBaseUrlInitialized();
            assertLayoutLoaded();
            Validation.assertReportData(data);

            const pluginId = getPluginId();

            console.log('pluginId', pluginId);

            if (!pluginId) {
                throw new Error('プラグイン ID を取得できません。');
            }

            if (typeof Core !== 'undefined' && typeof Core.setPrintPluginId === 'function') {
                Core.setPrintPluginId(pluginId);
            }

            const config = loadPluginConfig();
            const layout = await Layout.resolve(data, config, printOptions);

            Validation.assertLayout(layout);

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
                error.message.includes('Layout')
                || error.message.includes('テンプレート')
                || error.message.includes('帳票データ')
                || error.message.includes('header')
                || error.message.includes('印刷ウィンドウ')
                || error.message.includes('pluginBaseUrl')
            )) {
                throw error;
            }

            const message = error instanceof Error ? error.message : '不明なエラー';

            throw new Error(`Preview.open: プレビュー表示に失敗しました。（${message}）`);

        }

    };

    window.Preview = Preview;

})();
