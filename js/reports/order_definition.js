(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * reports/order_definition.js
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

    window.OrderDefinition = OrderDefinition;

})();
