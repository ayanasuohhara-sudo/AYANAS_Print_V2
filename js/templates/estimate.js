(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * templates/estimate.js
     *
     * 見積書・インボイス・外注伝票・加工依頼書（将来）のスタブ。
     * manifest 非登録。layout.js から動的読込。
     */

    const createStub = (name, label) => TemplateInterface.create(name, () => {
        throw new Error(`${label}テンプレートは未実装です。`);
    });

    window.EstimateTemplate = createStub('EstimateTemplate', '見積書');
    window.InvoiceExportTemplate = createStub('InvoiceExportTemplate', 'インボイス');
    window.PurchaseTemplate = createStub('PurchaseTemplate', '外注伝票');
    window.WorkOrderTemplate = createStub('WorkOrderTemplate', '加工依頼書');

})();
