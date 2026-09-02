(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * layout.js
     *
     * 帳票判定・テンプレート動的読込・レイアウト解決。
     */

    const Layout = {};

    const DELIVERY_APP_ID = 19;
    const INVOICE_APP_ID = 35;
    const ORDER_APP_ID = 16;
    const OVERSEAS_OUTBOUND_APP_ID = 28;

    const DEFAULT_COMPANY = {
        name: '株式会社ayanasu',
        postalCode: '〒631-0078',
        address: '奈良県奈良市富雄元町1-13-41',
        tel: 'TEL 0742-47-8390',
        fax: 'FAX 0742-47-8391',
    };

    const INVOICE_COMPANY = {
        name: '株式会社ayanasu',
        postalCode: '〒631-0078',
        address: '奈良県奈良市富雄元町1-13-41',
        tel: 'TEL 0742-47-8390',
        fax: 'FAX 0742-47-8391',
        bankInfo: '三菱UFJ銀行 奈良支店 普通 1234567 カ）アヤナス',
        invoiceRegistrationNo: 'T7150001017765',
        sealImage: 'image/company-seal.png',
        sealOpacity: 0.65,
    };

    /** @type {Map<string, object>} */
    const reports = new Map();

    /** @type {Map<number, string>} */
    const appIdToReportType = new Map();

    /** @type {Map<string, object>} */
    const templateCache = new Map();

    let defaultReportType = 'order';

    const normalizeAppId = (appId) => {

        if (appId === null || appId === undefined || appId === '') {
            return null;
        }

        const normalized = Number(appId);

        return Number.isNaN(normalized) ? null : normalized;

    };

    const normalizeBarcodeField = (barcodeField) => {

        if (typeof barcodeField !== 'string' || barcodeField === '') {
            return 'header.manage_no';
        }

        if (barcodeField.includes('.')) {
            return barcodeField;
        }

        return `header.${barcodeField}`;

    };

    const registerReport = (definition) => {

        reports.set(definition.reportType, definition);

        if (definition.default === true) {
            defaultReportType = definition.reportType;
        }

        (definition.appIds ?? []).forEach((appId) => {
            const normalizedAppId = normalizeAppId(appId);

            if (normalizedAppId !== null) {
                appIdToReportType.set(normalizedAppId, definition.reportType);
            }
        });

    };

    registerReport({
        reportType: 'order',
        title: '受注票',
        templatePath: 'js/templates/order.js',
        templateGlobal: 'OrderTemplate',
        pageClass: 'report-order',
        barcodeField: 'manage_no',
        paperSize: 'A4',
        orientation: 'landscape',
        buttonLabel: '受注票印刷',
        default: true,
        definition: OrderDefinition,
    });

    registerReport({
        reportType: 'overseas_outbound_detail',
        title: '出庫明細表',
        templatePath: 'js/templates/overseas_outbound_detail.js',
        templateGlobal: 'OverseasOutboundDetailTemplate',
        pageClass: 'report-overseas-outbound-detail',
        barcodeField: '',
        paperSize: 'A4',
        orientation: 'landscape',
        buttonLabel: '出庫明細表',
        appIds: [OVERSEAS_OUTBOUND_APP_ID],
        configDefaults: {
            barcode_type: 'CODE39',
            barcode_visible: '0',
            page_margin: '0',
        },
        definition: {},
    });

    registerReport({
        reportType: 'order_detail',
        title: '受注明細表',
        templatePath: 'js/templates/order_detail.js',
        templateGlobal: 'OrderDetailTemplate',
        pageClass: 'report-order-detail',
        barcodeField: 'manage_no',
        paperSize: 'A4',
        orientation: 'landscape',
        buttonLabel: '受注明細表',
        appIds: [ORDER_APP_ID],
        configDefaults: {
            barcode_type: 'CODE39',
            barcode_visible: '1',
            page_margin: '0',
        },
        definition: {},
    });

    registerReport({
        reportType: 'delivery',
        title: '納品書',
        templatePath: 'js/templates/delivery.js',
        templateGlobal: 'DeliveryTemplate',
        pageClass: 'report-delivery',
        barcodeField: 'barcode_manage_no',
        paperSize: 'A4',
        orientation: 'landscape',
        buttonLabel: '納品書印刷',
        appIds: [DELIVERY_APP_ID],
        company: { ...DEFAULT_COMPANY },
        configDefaults: {
            barcode_type: 'CODE39',
            barcode_visible: '0',
        },
        definition: DeliveryDefinition,
    });

    registerReport({
        reportType: 'invoice',
        title: '請求書',
        templatePath: 'js/templates/invoice.js',
        templateGlobal: 'InvoiceTemplate',
        pageClass: 'report-invoice',
        barcodeField: 'invoice_no',
        paperSize: 'A4',
        orientation: 'portrait',
        buttonLabel: '請求書印刷',
        appIds: [INVOICE_APP_ID],
        company: { ...INVOICE_COMPANY },
        configDefaults: {
            barcode_type: 'CODE39',
            barcode_visible: '0',
        },
        definition: InvoiceDefinition,
    });

    registerReport({
        reportType: 'matsuba_summary_invoice',
        title: '合計請求書',
        templatePath: 'js/templates/matsuba_summary_invoice.js',
        templateGlobal: 'MatsubaSummaryInvoiceTemplate',
        pageClass: 'report-matsuba-summary',
        barcodeField: '',
        paperSize: 'A4',
        orientation: 'portrait',
        buttonLabel: '松葉 合計請求書',
        company: { ...INVOICE_COMPANY },
        configDefaults: {
            barcode_type: 'CODE39',
            barcode_visible: '0',
            page_margin: '0',
        },
        definition: {},
    });

    registerReport({
        reportType: 'estimate',
        title: '見積書',
        templatePath: 'js/templates/estimate.js',
        templateGlobal: 'EstimateTemplate',
        pageClass: 'report-estimate',
        barcodeField: 'manage_no',
        paperSize: 'A4',
        orientation: 'portrait',
        buttonLabel: '見積書印刷',
        definition: {},
    });

    registerReport({
        reportType: 'invoice_export',
        title: 'インボイス',
        templatePath: 'js/templates/estimate.js',
        templateGlobal: 'InvoiceExportTemplate',
        pageClass: 'report-invoice-export',
        barcodeField: 'invoice_no',
        paperSize: 'A4',
        orientation: 'portrait',
        buttonLabel: 'インボイス印刷',
        definition: {},
    });

    registerReport({
        reportType: 'purchase',
        title: '外注伝票',
        templatePath: 'js/templates/estimate.js',
        templateGlobal: 'PurchaseTemplate',
        pageClass: 'report-purchase',
        barcodeField: 'manage_no',
        paperSize: 'A4',
        orientation: 'portrait',
        buttonLabel: '外注伝票印刷',
        definition: {},
    });

    registerReport({
        reportType: 'work_order',
        title: '加工依頼書',
        templatePath: 'js/templates/estimate.js',
        templateGlobal: 'WorkOrderTemplate',
        pageClass: 'report-work-order',
        barcodeField: 'manage_no',
        paperSize: 'A4',
        orientation: 'portrait',
        buttonLabel: '加工依頼書印刷',
        definition: {},
    });

    const ReportRegistry = {
        resolveReportType: (appId) => {
            const normalizedAppId = normalizeAppId(appId);

            if (normalizedAppId !== null && appIdToReportType.has(normalizedAppId)) {
                return appIdToReportType.get(normalizedAppId);
            }

            return defaultReportType;
        },
        get: (reportType) => {
            const definition = reports.get(reportType);

            if (!definition) {
                throw new Error(`ReportRegistry.get: 帳票が登録されていません。（${reportType}）`);
            }

            return definition;
        },
    };

    window.ReportRegistry = ReportRegistry;

    const getCurrentAppId = () => {

        try {

            if (typeof kintone === 'undefined' || typeof kintone.app?.getId !== 'function') {
                return null;
            }

            return kintone.app.getId();

        } catch (error) {
            return null;
        }

    };

    Layout.loadTemplate = async (reportType) => {

        if (templateCache.has(reportType)) {
            return templateCache.get(reportType);
        }

        const definition = ReportRegistry.get(reportType);
        const globalName = definition.templateGlobal;

        if (window[globalName] && typeof window[globalName].render === 'function') {
            templateCache.set(reportType, window[globalName]);
            return window[globalName];
        }

        await Preview.loadScript(definition.templatePath);

        if (!window[globalName] || typeof window[globalName].render !== 'function') {
            throw new Error(`Layout.loadTemplate: ${globalName} の読込に失敗しました。`);
        }

        templateCache.set(reportType, window[globalName]);

        return window[globalName];

    };

    const buildLayout = (registryDefinition, template, printOptions = {}) => {

        const definition = registryDefinition.definition ?? {};

        const layout = {
            reportType: registryDefinition.reportType,
            title: registryDefinition.title ?? definition.title,
            template,
            pageClass: registryDefinition.pageClass ?? definition.pageClass,
            barcodeField: normalizeBarcodeField(
                registryDefinition.barcodeField ?? definition.barcodeField
            ),
            paperSize: registryDefinition.paperSize ?? definition.paper,
            orientation: registryDefinition.orientation ?? definition.orientation,
            definition,
        };

        if (registryDefinition.company) {
            layout.company = registryDefinition.company;
        } else if (definition.company) {
            layout.company = definition.company;
        }

        if (registryDefinition.configDefaults) {
            layout.configDefaults = registryDefinition.configDefaults;
        }

        if (registryDefinition.reportType === 'invoice') {
            layout.invoiceLayout = typeof InvoiceLayout !== 'undefined'
                ? InvoiceLayout.resolve({
                    invoiceLayout: printOptions.invoiceLayout,
                    customerInvoiceLayout: printOptions.customerInvoiceLayout,
                })
                : 'normal';
            layout.carryOverMode = printOptions.carryOverMode === 'none' ? 'none' : 'with_carry';
        }

        return layout;

    };

    Layout.getButtonLabel = () => {

        const reportType = ReportRegistry.resolveReportType(getCurrentAppId());
        const definition = ReportRegistry.get(reportType);

        return definition.buttonLabel ?? `${definition.title}印刷`;

    };

    Layout.resolve = async (data, config, printOptions = {}) => {

        Validation.assertObject(data, '帳票データ');
        Validation.assertObject(config, 'プラグイン設定');

        const reportType = typeof printOptions.reportType === 'string' && printOptions.reportType !== ''
            ? printOptions.reportType
            : ReportRegistry.resolveReportType(getCurrentAppId());
        const registryDefinition = ReportRegistry.get(reportType);
        const template = await Layout.loadTemplate(reportType);

        if (reportType === 'invoice'
            && typeof InvoiceLayout !== 'undefined'
            && InvoiceLayout.isWindowEnvelope(printOptions.invoiceLayout
                || printOptions.customerInvoiceLayout)) {

            await Preview.loadScript('js/templates/invoice_window.js');

        }

        return buildLayout(registryDefinition, template, printOptions);

    };

    window.Layout = Layout;

})();
