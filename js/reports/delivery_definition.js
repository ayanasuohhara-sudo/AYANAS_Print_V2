(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * reports/delivery_definition.js
     */

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
            name: '株式会社ayanas',
            address: '〒000-0000 東京都',
            tel: 'TEL 00-0000-0000',
            fax: 'FAX 00-0000-0000',
            registrationNo: '登録番号 T0000000000000',
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

    window.DeliveryDefinition = DeliveryDefinition;

})();
