(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * reports/invoice_definition.js
     */

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

    window.InvoiceDefinition = InvoiceDefinition;

})();
