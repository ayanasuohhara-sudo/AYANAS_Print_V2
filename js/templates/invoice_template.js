(() => {
    'use strict';

    const InvoiceTemplate = TemplateInterface.create('InvoiceTemplate', () => {
        throw new Error('請求書テンプレートは未実装です。');
    });

    window.InvoiceTemplate = InvoiceTemplate;

})();
