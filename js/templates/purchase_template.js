(() => {
    'use strict';

    const PurchaseTemplate = TemplateInterface.create('PurchaseTemplate', () => {
        throw new Error('外注伝票テンプレートは未実装です。');
    });

    window.PurchaseTemplate = PurchaseTemplate;

})();
