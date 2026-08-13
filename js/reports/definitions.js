(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * reports/definitions.js
     *
     * 帳票定義（受注票・納品書・請求書）を1ファイルに集約。
     * kintone プラグイン manifest desktop/js 上限（30件）対応。
     */

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

    window.OrderDefinition = OrderDefinition;
    window.DeliveryDefinition = DeliveryDefinition;
    window.InvoiceDefinition = InvoiceDefinition;

})();
