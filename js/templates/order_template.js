(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * templates/order_template.js
     */

    const buildHeaderHtml = (header, config = {}) => {

        const barcodeHtml = Common.isBarcodeVisible(config)
            ? `<div class="barcode">
    <svg id="barcode" class="barcode"></svg>
</div>`
            : '';

        return `
${barcodeHtml}
<table class="header">
    <tr>
        <th>管理番号</th>
        <td>${Common.esc(header.manage_no)}</td>
        <th>受注日</th>
        <td>${Common.esc(Format.formatDate(header.order_date))}</td>
    </tr>
    <tr>
        <th>納期</th>
        <td>${Common.esc(Format.formatDate(header.deadline))}</td>
        <th>顧客コード</th>
        <td>${Common.esc(header.customer_code)}</td>
    </tr>
    <tr>
        <th>顧客名</th>
        <td colspan="3">${Common.esc(header.customer_name)}</td>
    </tr>
    <tr>
        <th>お客様名</th>
        <td colspan="3">${Common.esc(header.client_name)}</td>
    </tr>
    <tr>
        <th>伝票番号</th>
        <td>${Common.esc(header.slip_no)}</td>
        <th>担当</th>
        <td>${Common.esc(header.in_charge)}</td>
    </tr>
    <tr>
        <th>着物種類</th>
        <td>${Common.esc(header.kimono_type)}</td>
        <th>仕様</th>
        <td>${Common.esc(header.kimono_spec)}</td>
    </tr>
</table>`;

    };

    const buildDetailRowsHtml = (details) => {

        if (details.length === 0) {
            return '<tr><td colspan="6">明細はありません</td></tr>';
        }

        return details.map((detail) => (
            `<tr>`
            + `<td>${Common.esc(detail.rowNo)}</td>`
            + `<td>${Common.esc(detail.item_code)}</td>`
            + `<td>${Common.esc(detail.item_name)}</td>`
            + `<td>${Common.esc(Format.formatMoney(detail.unit_price))}</td>`
            + `<td>${Common.esc(detail.qty)}</td>`
            + `<td>${Common.esc(Format.formatMoney(detail.amount))}</td>`
            + `</tr>`
        )).join('');

    };

    const buildDetailTableHtml = (details) => `

<table class="detail-table">
    <thead>
        <tr>
            <th>No</th>
            <th>商品コード</th>
            <th>商品名</th>
            <th>単価</th>
            <th>数量</th>
            <th>金額</th>
        </tr>
    </thead>
    <tbody>
${buildDetailRowsHtml(details)}
    </tbody>
    <tfoot>
        <tr>
            <th colspan="6">合計</th>
        </tr>
    </tfoot>
</table>`;

    const buildSummaryHtml = (summary) => {

        const count = summary.totalCount ?? summary.count ?? 0;

        return `
<table class="summary">
    <tbody>
        <tr>
            <th>点数</th>
            <td>${Common.esc(count)}</td>
            <th>数量合計</th>
            <td>${Common.esc(summary.totalQty)}</td>
            <th>金額合計</th>
            <td>${Common.esc(Format.formatMoney(summary.totalAmount))}</td>
        </tr>
    </tbody>
</table>`;

    };

    const OrderTemplate = TemplateInterface.create('OrderTemplate', (data, config = {}, layout = {}) => {

        Common.assertFormatLoaded();
        Validation.assertDetailReportData(data);

        const { header, details, summary } = data;
        const reportTitle = Common.getTitle(layout, config, '受注票');

        return Common.buildDocumentHtml({
            title: reportTitle,
            bodyClass: Common.getBodyClass(layout),
            content: `
    <h1>${Common.esc(reportTitle)}</h1>
    ${buildHeaderHtml(header, config)}
    ${buildDetailTableHtml(details)}
    ${buildSummaryHtml(summary)}`,
        });

    });

    window.OrderTemplate = OrderTemplate;

})();
