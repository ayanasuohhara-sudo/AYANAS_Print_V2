(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * templates/stub_templates.js
     *
     * 未実装帳票テンプレートのスタブ（manifest desktop/js 上限対応）。
     */

    window.EstimateTemplate = TemplateInterface.create('EstimateTemplate', () => {
        throw new Error('見積書テンプレートは未実装です。');
    });

    window.InvoiceExportTemplate = TemplateInterface.create('InvoiceExportTemplate', () => {
        throw new Error('インボイステンプレートは未実装です。');
    });

    window.PurchaseTemplate = TemplateInterface.create('PurchaseTemplate', () => {
        throw new Error('外注伝票テンプレートは未実装です。');
    });

    window.LabelTemplate = TemplateInterface.create('LabelTemplate', () => {
        throw new Error('ラベルテンプレートは未実装です。');
    });

})();
