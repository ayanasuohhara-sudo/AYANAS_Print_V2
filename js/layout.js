(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * layout.js
     */

    const Layout = {};

    const DELIVERY_APP_ID = 19;

    const DELIVERY_COMPANY = {
        name: '株式会社ayanas',
        address: '〒000-0000 東京都',
        tel: 'TEL 00-0000-0000',
        fax: 'FAX 00-0000-0000',
        registrationNo: '登録番号 T0000000000000',
    };

    const REPORT_REGISTRY = [
        {
            reportType: 'delivery',
            title: '納品書',
            template: () => DeliveryTemplate,
            pageClass: 'report-delivery',
            barcodeField: 'header.manage_no',
            paperSize: 'A4',
            orientation: 'landscape',
            buttonLabel: '納品書印刷',
            appIds: [DELIVERY_APP_ID],
            company: { ...DELIVERY_COMPANY },
            configDefaults: {
                barcode_type: 'CODE39',
                barcode_visible: '1',
            },
        },
        {
            reportType: 'order',
            title: '受注票',
            template: () => OrderTemplate,
            pageClass: 'report-order',
            barcodeField: 'header.manage_no',
            paperSize: 'A4',
            orientation: 'landscape',
            buttonLabel: '受注票印刷',
            appIds: null,
        },
    ];

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

    const resolveDefinition = () => {

        const appId = getCurrentAppId();

        const matched = REPORT_REGISTRY.find((definition) => (
            Array.isArray(definition.appIds) && definition.appIds.includes(appId)
        ));

        if (matched) {
            return matched;
        }

        return REPORT_REGISTRY.find((definition) => definition.appIds === null);

    };

    const buildLayout = (definition) => {

        Validation.assertModule(definition.template(), definition.title);

        const layout = {
            reportType: definition.reportType,
            title: definition.title,
            template: definition.template(),
            pageClass: definition.pageClass,
            barcodeField: definition.barcodeField,
            paperSize: definition.paperSize,
            orientation: definition.orientation,
        };

        if (definition.company) {
            layout.company = definition.company;
        }

        if (definition.configDefaults) {
            layout.configDefaults = definition.configDefaults;
        }

        return layout;

    };

    Layout.getButtonLabel = () => resolveDefinition().buttonLabel;

    Layout.resolve = (data, config) => {

        Validation.assertObject(data, '帳票データ');
        Validation.assertObject(config, 'プラグイン設定');

        return buildLayout(resolveDefinition());

    };

    window.Layout = Layout;

})();
