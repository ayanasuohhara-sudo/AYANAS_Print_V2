(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * core.js
     *
     * 共通コアモジュール（Format / Validation / Common / Dom / TemplateInterface /
     * 帳票定義 / Core ユーティリティ）を 1 ファイルに集約。
     */

    const Core = {};

    Core.VERSION = '3.0.0';

    // -------------------------------------------------------------------------
    // Format (from js/format.js)
    // -------------------------------------------------------------------------

    const Format = {};

    Format.isEmpty = (value) => {

        try {

            if (value === null || value === undefined) {
                return true;
            }

            if (typeof value === 'string') {
                return value.trim() === '';
            }

            if (Array.isArray(value)) {
                return value.length === 0;
            }

            if (typeof value === 'object') {
                return Object.keys(value).length === 0;
            }

            return false;

        } catch (error) {

            const message = error instanceof Error
                ? error.message
                : '不明なエラー';

            throw new Error(`isEmpty: 判定に失敗しました。（${message}）`);

        }

    };

    Format.escapeHtml = (value) => {

        try {

            if (Format.isEmpty(value)) {
                return '';
            }

            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');

        } catch (error) {

            if (error instanceof Error && error.message.startsWith('isEmpty:')) {
                throw error;
            }

            const message = error instanceof Error
                ? error.message
                : '不明なエラー';

            throw new Error(`escapeHtml: 変換に失敗しました。（${message}）`);

        }

    };

    Format.formatMoney = (value) => {

        try {

            if (Format.isEmpty(value)) {
                return '0';
            }

            const number = Number(value);

            if (Number.isNaN(number)) {
                throw new Error(`数値に変換できません。（${value}）`);
            }

            return number.toLocaleString('ja-JP');

        } catch (error) {

            if (error instanceof Error && error.message.startsWith('isEmpty:')) {
                throw error;
            }

            const message = error instanceof Error
                ? error.message
                : '不明なエラー';

            throw new Error(`formatMoney: 変換に失敗しました。（${message}）`);

        }

    };

    Format.formatDate = (value) => {

        try {

            if (Format.isEmpty(value)) {
                return '';
            }

            const text = String(value).trim();

            if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
                return text.replace(/-/g, '/');
            }

            if (/^\d{4}\/\d{2}\/\d{2}$/.test(text)) {
                return text;
            }

            if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
                return text.slice(0, 10).replace(/-/g, '/');
            }

            throw new Error(`日付形式が不正です。（${text}）`);

        } catch (error) {

            if (error instanceof Error && error.message.startsWith('isEmpty:')) {
                throw error;
            }

            const message = error instanceof Error
                ? error.message
                : '不明なエラー';

            throw new Error(`formatDate: 変換に失敗しました。（${message}）`);

        }

    };

    // -------------------------------------------------------------------------
    // Validation (from js/utils/validation.js)
    // -------------------------------------------------------------------------

    const Validation = {};

    Validation.assertModule = (moduleRef, moduleName, methodName = 'render') => {

        if (!moduleRef || typeof moduleRef[methodName] !== 'function') {
            throw new Error(`${moduleName} が読み込まれていません。`);
        }

    };

    Validation.assertObject = (value, name) => {

        if (!value || typeof value !== 'object') {
            throw new Error(`${name} が指定されていません。`);
        }

    };

    Validation.assertReportData = (data) => {

        Validation.assertObject(data, '帳票データ');
        Validation.assertObject(data.header, 'header');

    };

    Validation.assertDetailReportData = (data) => {

        Validation.assertReportData(data);

        if (!Array.isArray(data.details)) {
            throw new Error('details が不正です。');
        }

        if (!data.summary || typeof data.summary !== 'object') {
            throw new Error('summary が不正です。');
        }

    };

    Validation.assertLayout = (layout) => {

        Validation.assertObject(layout, 'レイアウト情報');
        Validation.assertModule(layout.template, 'テンプレート');

    };

    // -------------------------------------------------------------------------
    // Common (from js/utils/common.js)
    // -------------------------------------------------------------------------

    const Common = {};

    Common.assertFormatLoaded = () => {

        if (typeof Format === 'undefined') {
            throw new Error('Format モジュールが読み込まれていません。');
        }

        if (typeof Format.escapeHtml !== 'function') {
            throw new Error('Format.escapeHtml が利用できません。');
        }

        if (typeof Format.formatMoney !== 'function') {
            throw new Error('Format.formatMoney が利用できません。');
        }

        if (typeof Format.formatDate !== 'function') {
            throw new Error('Format.formatDate が利用できません。');
        }

    };

    Common.esc = (value) => Format.escapeHtml(value);

    Common.getValueByPath = (source, path) => {

        if (!source || typeof source !== 'object' || typeof path !== 'string' || path === '') {
            return '';
        }

        return path.split('.').reduce((current, key) => {

            if (current === null || current === undefined) {
                return '';
            }

            return current[key];

        }, source);

    };

    Common.getTitle = (layout = {}, config = {}, fallback = '') => {

        if (typeof layout.title === 'string' && layout.title.trim() !== '') {
            return layout.title.trim();
        }

        const title = config.report_title;

        if (typeof title === 'string' && title.trim() !== '') {
            return title.trim();
        }

        return fallback;

    };

    Common.getBodyClass = (layout = {}) => {

        const classes = [];

        if (typeof layout.pageClass === 'string' && layout.pageClass.trim() !== '') {
            classes.push(layout.pageClass.trim());
        } else {
            classes.push(`report-${layout.reportType || 'order'}`);
        }

        if (layout.invoiceLayout === 'window_envelope') {
            classes.push('report-invoice--window-envelope');
        }

        return classes.join(' ');

    };

    Common.isBarcodeVisible = (config = {}) => config.barcode_visible !== '0';

    Common.buildDocumentHtml = ({ title, bodyClass, content, multiPage = false }) => {

        const safeTitle = Common.esc(title);
        const safeBodyClass = Common.esc(bodyClass);
        const bodyInner = multiPage
            ? content
            : `<div class="page">\n${content}\n</div>`;

        return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${safeTitle}</title>
</head>
<body class="${safeBodyClass}">
${bodyInner}
</body>
</html>`;

    };

    Common.mergeConfig = (...sources) => Object.assign({}, ...sources);

    // -------------------------------------------------------------------------
    // Dom (from js/utils/dom.js)
    // -------------------------------------------------------------------------

    const Dom = {};

    Dom.buildButtonsHtml = () => `

    <div class="buttons">
        <button type="button" id="ayanas-print-btn">印刷</button>
        <button type="button" id="ayanas-close-btn">閉じる</button>
    </div>`;

    Dom.buildPrintStyleHtml = (config = {}) => {

        const paperSize = config.paper_size === 'A5' ? 'A5' : 'A4';
        const orientation = config.print_orientation === 'portrait' ? 'portrait' : 'landscape';
        const margin = orientation === 'portrait' ? '0' : '10mm';

        return `<style>@page { size: ${paperSize} ${orientation}; margin: ${margin}; }</style>`;

    };

    Dom.getPageClassName = (config = {}) => {

        const paperClass = config.paper_size === 'A5' ? 'page--a5' : 'page--a4';
        const orientationClass = config.print_orientation === 'portrait'
            ? 'page--portrait'
            : 'page--landscape';

        return `page ${paperClass} ${orientationClass}`;

    };

    Dom.buildButtonScriptBody = () => `

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

    // -------------------------------------------------------------------------
    // TemplateInterface (from js/templates/template_interface.js)
    // -------------------------------------------------------------------------

    const TemplateInterface = {};

    TemplateInterface.assertHtmlString = (html, templateName) => {

        if (typeof html !== 'string') {
            throw new Error(`${templateName}.render: 戻り値は HTML 文字列である必要があります。`);
        }

        return html;

    };

    TemplateInterface.create = (templateName, renderBody) => {

        const template = {};

        template.render = (data, config = {}, layout = {}) => {

            try {

                const html = renderBody(data, config, layout);

                return TemplateInterface.assertHtmlString(html, templateName);

            } catch (error) {

                if (error instanceof Error && error.message.includes('戻り値は HTML 文字列')) {
                    throw error;
                }

                const message = error instanceof Error ? error.message : '不明なエラー';

                throw new Error(`${templateName}.render: HTML 生成に失敗しました。（${message}）`);

            }

        };

        return template;

    };

    // -------------------------------------------------------------------------
    // Report definitions (from js/reports/definitions.js)
    // -------------------------------------------------------------------------

    const OrderDefinition = {
        title: '受注票',
        paper: 'A4',
        orientation: 'landscape',
        barcodeField: 'manage_no',
        pageClass: 'report-order',
        header: {
            showBarcodeFromConfig: true,
            rows: [
                {
                    cells: [
                        { label: '管理番号', field: 'manage_no' },
                        { label: '受注日', field: 'order_date', format: 'date' },
                    ],
                },
                {
                    cells: [
                        { label: '納期', field: 'deadline', format: 'date' },
                        { label: '顧客コード', field: 'customer_code' },
                    ],
                },
                {
                    cells: [
                        { label: '顧客名', field: 'customer_name', colspan: 3 },
                    ],
                },
                {
                    cells: [
                        { label: 'お客様名', field: 'client_name', colspan: 3 },
                    ],
                },
                {
                    cells: [
                        { label: '伝票番号', field: 'slip_no' },
                        { label: '担当', field: 'in_charge' },
                    ],
                },
                {
                    cells: [
                        { label: '着物種類', field: 'kimono_type' },
                        { label: '仕様', field: 'kimono_spec' },
                    ],
                },
            ],
        },
        columns: [
            { field: 'rowNo', title: 'No', width: 40 },
            { field: 'item_code', title: '商品コード', width: 80 },
            { field: 'item_name', title: '商品名', width: 140 },
            { field: 'unit_price', title: '単価', width: 80, format: 'money' },
            { field: 'qty', title: '数量', width: 60 },
            { field: 'amount', title: '金額', width: 80, format: 'money' },
        ],
        detailTable: {
            tableClass: 'detail-table',
            emptyColspan: 6,
            emptyMessage: '明細はありません',
            footerLabel: '合計',
        },
        summary: {
            tableClass: 'summary',
            rows: [
                {
                    cells: [
                        { label: '点数', field: 'totalCount', source: 'summary' },
                        { label: '数量合計', field: 'totalQty', source: 'summary' },
                        { label: '金額合計', field: 'totalAmount', source: 'summary', format: 'money' },
                    ],
                },
            ],
        },
    };

    const DeliveryDefinition = {
        title: '納品書',
        paper: 'A4',
        orientation: 'landscape',
        barcodeField: 'manage_no',
        pageClass: 'report-delivery',
        header: {
            displayTitle: '納 品 書',
            showBarcode: true,
            meta: [
                { label: '納品番号', field: 'manage_no' },
                { label: '納品日', field: 'deadline', format: 'date' },
            ],
        },
        company: {
            name: '株式会社ayanasu',
            postalCode: '〒631-0078',
            address: '奈良県奈良市富雄元町1-13-41',
            tel: 'TEL 0742-47-8390',
            fax: 'FAX 0742-47-8391',
        },
        detailTables: [
            {
                rowClass: 'detail-row detail-row--primary',
                headClass: 'detail-head detail-head--primary',
                columns: [
                    { field: 'manage_no', title: '管理番号', source: 'header', width: 80 },
                    { field: 'client_name', title: 'お客様名', source: 'header', width: 140 },
                    { field: 'item_name', title: '加工内容', source: 'detail', width: 140 },
                    { field: 'unit_price', title: '単価', source: 'detail', width: 80, format: 'money', className: 'num' },
                    { field: 'qty', title: '数量', source: 'detail', width: 60, className: 'num' },
                    { field: 'amount', title: '金額', source: 'detail', width: 80, format: 'money', className: 'num' },
                ],
            },
            {
                rowClass: 'detail-row detail-row--secondary',
                headClass: 'detail-head detail-head--secondary',
                columns: [
                    { field: 'kimono_type', title: '着物種類', source: 'header', width: 80 },
                    { field: 'kimono_spec', title: '仕様', source: 'header', width: 80 },
                    { field: 'item_code', title: '商品コード', source: 'detail', width: 80 },
                    { field: 'slip_no', title: '得意先伝票番号', source: 'header', width: 80 },
                    { field: 'in_charge', title: '担当者', source: 'header', width: 80, colspan: 2 },
                ],
            },
        ],
        detailTable: {
            tableClass: 'delivery-detail-table',
            emptyColspan: 6,
            emptyMessage: '明細はありません',
        },
        summary: {
            tableClass: 'delivery-summary',
            wrapperClass: 'delivery-footer',
            type: 'tax',
            taxRate: 0.1,
            totalRowClass: 'delivery-summary__total',
            items: [
                { label: '点数', field: 'totalCount', source: 'summary' },
                { label: '数量合計', field: 'totalQty', source: 'summary' },
                { label: '税抜', field: 'totalAmount', source: 'summary', format: 'money', role: 'subtotal' },
                { label: '消費税', field: 'tax', role: 'tax', format: 'money' },
                { label: '税込', field: 'total', role: 'total', format: 'money' },
            ],
        },
    };

    const InvoiceDefinition = {
        title: '請求書',
        paper: 'A4',
        orientation: 'portrait',
        barcodeField: 'invoice_no',
        pageClass: 'report-invoice',
        header: {
            displayTitle: '請 求 書',
            showBarcode: true,
            meta: [
                { label: '請求番号', field: 'invoice_no' },
                { label: '請求日', field: 'invoice_date', format: 'date' },
                { label: '請求先コード', field: 'customer_code' },
                { label: '請求先名', field: 'customer_name' },
                { label: '担当者', field: 'in_charge' },
                { label: '支払期限', field: 'due_date', format: 'date' },
            ],
        },
        company: {
            name: '株式会社AYANAS',
            postalCode: '〒631-0078',
            address: '奈良県奈良市富雄元町1-13-41',
            tel: 'TEL 0742-47-8390',
            fax: 'FAX 0742-47-8391',
        },
        summary: {
            items: [
                { label: '点数', field: 'totalCount', source: 'summary' },
                { label: '数量合計', field: 'totalQty', source: 'summary' },
                { label: '税抜合計', field: 'subtotal', source: 'summary', format: 'money' },
                { label: '消費税', field: 'tax', source: 'summary', format: 'money' },
                { label: '税込合計', field: 'total', source: 'summary', format: 'money' },
            ],
        },
    };

    // -------------------------------------------------------------------------
    // Core.Report – shared report helpers
    // -------------------------------------------------------------------------

    Core.Report = {
        DETAILS_PER_PAGE: 20,
        EMPTY_DETAIL: null,

        padPageDetails(pageDetails, size) {

            const padded = pageDetails.slice(0, size);

            while (padded.length < size) {
                padded.push(Core.Report.EMPTY_DETAIL);
            }

            return padded;

        },

        buildDetailPages(details, size) {

            const totalPages = Math.max(1, Math.ceil(details.length / size));
            const pages = [];

            for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
                const start = pageIndex * size;
                const pageDetails = details.slice(start, start + size);

                pages.push(Core.Report.padPageDetails(pageDetails, size));
            }

            return pages;

        },

        getCompanyInfo(layout = {}, defaultCompany = {}) {

            const source = layout.company ?? defaultCompany;

            return {
                name: source.name ?? defaultCompany.name,
                postalCode: source.postalCode ?? defaultCompany.postalCode,
                address: source.address ?? defaultCompany.address,
                tel: source.tel ?? defaultCompany.tel,
                fax: source.fax ?? defaultCompany.fax,
            };

        },

        formatCustomerName(name) {
            return `${String(name ?? '').trim()}様`;
        },

        calcTaxFromSubtotal(subtotal, rate = 0.1) {
            return Math.round(Number(subtotal) * rate);
        },

        buildBarcodeHtml(id = 'barcode') {
            return `<svg id="${id}" class="barcode"></svg>`;
        },

        buildCompanyBlockHtml(company, escFn) {

            const esc = typeof escFn === 'function' ? escFn : Format.escapeHtml;

            return `<p class="company-name">${esc(company.name)}</p>
                <p class="company-address">${esc(company.postalCode)} ${esc(company.address)}</p>
                <p class="company-contact">${esc(company.tel)}</p>
                <p class="company-contact">${esc(company.fax)}</p>`;

        },

        buildPageMetaHtml(pageNumber, totalPages) {
            return `<p class="page-no">${pageNumber} / ${totalPages}</p>`;
        },

    };

    // -------------------------------------------------------------------------
    // Core script loading
    // -------------------------------------------------------------------------

    let printPluginId = '';

    Core.setPrintPluginId = (pluginId) => {

        printPluginId = String(pluginId ?? '').trim();

    };

    Core.getPrintPluginId = () => printPluginId;

    Core.getPluginContentsUrl = (relativePath) => {

        if (typeof Preview !== 'undefined' && typeof Preview.loadScript === 'function') {

            const normalizedPath = String(relativePath).replace(/^\//, '');

            throw new Error(
                `静的リソース URL は download.do 経由で解決してください。（${normalizedPath}）`
            );

        }

        throw new Error('Preview モジュールが読み込まれていません。');

    };

    Core.loadScript = (relativePath) => {

        if (typeof Preview !== 'undefined' && typeof Preview.loadScript === 'function') {
            return Preview.loadScript(relativePath);
        }

        throw new Error('Preview.loadScript が利用できません。');

    };

    Core.loadScripts = async (paths) => {

        for (const relativePath of paths) {
            await Core.loadScript(relativePath);
        }

    };

    // -------------------------------------------------------------------------
    // Global exports (backward compatible)
    // -------------------------------------------------------------------------

    window.Core = Core;
    window.Format = Format;
    window.Validation = Validation;
    window.Common = Common;
    window.Dom = Dom;
    window.TemplateInterface = TemplateInterface;
    window.OrderDefinition = OrderDefinition;
    window.DeliveryDefinition = DeliveryDefinition;
    window.InvoiceDefinition = InvoiceDefinition;

})();
