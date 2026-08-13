(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * report_registry.js
     *
     * 帳票マスター。帳票の登録のみを行う。
     */

    const ReportRegistry = {};

    const DELIVERY_APP_ID = 19;

    const reports = new Map();
    const appIdToReportType = new Map();

    let defaultReportType = null;

    const REQUIRED_FIELDS = [
        'reportType',
        'title',
        'template',
        'pageClass',
        'barcodeField',
        'paperSize',
        'orientation',
    ];

    const normalizeBarcodeField = (barcodeField) => {

        if (typeof barcodeField !== 'string' || barcodeField === '') {
            return 'header.manage_no';
        }

        if (barcodeField.includes('.')) {
            return barcodeField;
        }

        return `header.${barcodeField}`;

    };

    const normalizeDefinition = (definition) => {

        const normalized = {
            ...definition,
            barcodeField: normalizeBarcodeField(definition.barcodeField),
        };

        if (typeof normalized.template === 'function' && typeof normalized.template.render !== 'function') {
            normalized.template = normalized.template();
        }

        return normalized;

    };

    const assertRegisterDefinition = (definition) => {

        Validation.assertObject(definition, '帳票定義');

        REQUIRED_FIELDS.forEach((fieldName) => {

            if (definition[fieldName] === undefined || definition[fieldName] === null || definition[fieldName] === '') {
                throw new Error(`ReportRegistry.register: ${fieldName} が指定されていません。`);
            }

        });

        Validation.assertModule(definition.template, definition.title);

        if (reports.has(definition.reportType)) {
            throw new Error(`ReportRegistry.register: reportType "${definition.reportType}" は既に登録されています。`);
        }

    };

    const bindAppIds = (reportType, appIds) => {

        if (!Array.isArray(appIds)) {
            return;
        }

        appIds.forEach((appId) => {

            if (appIdToReportType.has(appId)) {
                throw new Error(`ReportRegistry.register: appId ${appId} は既に登録されています。`);
            }

            appIdToReportType.set(appId, reportType);

        });

    };

    /**
     * 帳票を登録する
     * @param {Object} definition - 帳票定義
     */
    ReportRegistry.register = (definition) => {

        assertRegisterDefinition(definition);

        const normalized = normalizeDefinition(definition);

        reports.set(normalized.reportType, normalized);
        bindAppIds(normalized.reportType, definition.appIds);

        if (definition.default === true) {

            if (defaultReportType !== null) {
                throw new Error('ReportRegistry.register: デフォルト帳票は1件のみ登録できます。');
            }

            defaultReportType = normalized.reportType;

        }

    };

    /**
     * reportType から帳票定義を取得する
     * @param {string} reportType - 帳票種類
     * @returns {Object} 帳票定義
     */
    ReportRegistry.get = (reportType) => {

        const definition = reports.get(reportType);

        if (!definition) {
            throw new Error(`ReportRegistry.get: 帳票が登録されていません。（${reportType}）`);
        }

        return definition;

    };

    /**
     * 現在のアプリ ID から reportType を解決する
     * @param {number|null} appId - kintone アプリ ID
     * @returns {string} reportType
     */
    ReportRegistry.resolveReportType = (appId) => {

        if (appId !== null && appIdToReportType.has(appId)) {
            return appIdToReportType.get(appId);
        }

        if (defaultReportType !== null) {
            return defaultReportType;
        }

        throw new Error('ReportRegistry.resolveReportType: 帳票種類を解決できません。');

    };

    const DELIVERY_COMPANY = {
        name: '株式会社ayanasu',
        postalCode: '〒631-0078',
        address: '奈良県奈良市富雄元町1-13-41',
        tel: 'TEL 0742-47-8390',
        fax: 'FAX 0742-47-8391',
    };

    ReportRegistry.register({
        reportType: 'delivery',
        title: '納品書',
        template: DeliveryTemplate,
        pageClass: 'report-delivery',
        barcodeField: 'barcode_manage_no',
        paperSize: 'A4',
        orientation: 'landscape',
        buttonLabel: '納品書印刷',
        appIds: [DELIVERY_APP_ID],
        company: { ...DELIVERY_COMPANY },
        configDefaults: {
            barcode_type: 'CODE39',
            barcode_visible: '1',
        },
    });

    const INVOICE_APP_ID = 35;

    const INVOICE_COMPANY = {
        name: '株式会社AYANAS',
        postalCode: '〒631-0078',
        address: '奈良県奈良市富雄元町1-13-41',
        tel: 'TEL 0742-47-8390',
        fax: 'FAX 0742-47-8391',
    };

    ReportRegistry.register({
        reportType: 'invoice',
        title: '請求書',
        template: InvoiceTemplate,
        pageClass: 'report-invoice',
        barcodeField: 'invoice_no',
        paperSize: 'A4',
        orientation: 'portrait',
        buttonLabel: '請求書印刷',
        appIds: [INVOICE_APP_ID],
        company: { ...INVOICE_COMPANY },
        configDefaults: {
            barcode_type: 'CODE39',
            barcode_visible: '1',
        },
    });

    ReportRegistry.register({
        reportType: 'order',
        title: '受注票',
        template: OrderTemplate,
        pageClass: 'report-order',
        barcodeField: 'manage_no',
        paperSize: 'A4',
        orientation: 'landscape',
        buttonLabel: '受注票印刷',
        default: true,
    });

    window.ReportRegistry = ReportRegistry;

})();
