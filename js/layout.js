(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * layout.js
     */

    const Layout = {};

    const REPORT_DEFINITIONS = {
        order: OrderDefinition,
        delivery: DeliveryDefinition,
        invoice: InvoiceDefinition,
    };

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

    const normalizeBarcodeField = (barcodeField) => {

        if (typeof barcodeField !== 'string' || barcodeField === '') {
            return 'header.manage_no';
        }

        if (barcodeField.includes('.')) {
            return barcodeField;
        }

        return `header.${barcodeField}`;

    };

    const getReportDefinition = (reportType) => {

        const definition = REPORT_DEFINITIONS[reportType];

        if (!definition) {
            throw new Error(`Layout: 帳票定義が見つかりません。（${reportType}）`);
        }

        return definition;

    };

    const buildLayout = (registryDefinition) => {

        const definition = getReportDefinition(registryDefinition.reportType);

        const layout = {
            reportType: registryDefinition.reportType,
            title: definition.title,
            template: registryDefinition.template,
            pageClass: definition.pageClass,
            barcodeField: normalizeBarcodeField(definition.barcodeField),
            paperSize: definition.paper,
            orientation: definition.orientation,
            definition,
        };

        if (definition.company) {
            layout.company = definition.company;
        } else if (registryDefinition.company) {
            layout.company = registryDefinition.company;
        }

        if (registryDefinition.configDefaults) {
            layout.configDefaults = registryDefinition.configDefaults;
        }

        return layout;

    };

    Layout.getButtonLabel = () => {

        const reportType = ReportRegistry.resolveReportType(getCurrentAppId());
        const definition = ReportRegistry.get(reportType);

        return definition.buttonLabel ?? `${getReportDefinition(reportType).title}印刷`;

    };

    Layout.resolve = (data, config) => {

        Validation.assertObject(data, '帳票データ');
        Validation.assertObject(config, 'プラグイン設定');

        const reportType = ReportRegistry.resolveReportType(getCurrentAppId());

        return buildLayout(ReportRegistry.get(reportType));

    };

    window.Layout = Layout;

})();
