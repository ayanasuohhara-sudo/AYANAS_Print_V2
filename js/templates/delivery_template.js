(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * templates/delivery_template.js
     *
     * 納品書の HTML 文字列を生成する（納品管理アプリ App ID: 19 向け）。
     * DOM 操作・印刷・Barcode 描画は行わない。
     */

    const DETAIL_COLUMN_COUNT = 7;

    const DEFAULT_COMPANY = {
        name: '株式会社ayanasu',
        postalCode: '〒631-0078',
        address: '奈良県奈良市富雄元町1-13-41',
        tel: 'TEL 0742-47-8390',
        fax: 'FAX 0742-47-8391',
    };

    const esc = (value) => Format.escapeHtml(value);

    const getCompanyInfo = (layout = {}) => {

        const source = layout.company ?? DEFAULT_COMPANY;

        return {
            name: source.name ?? DEFAULT_COMPANY.name,
            postalCode: source.postalCode ?? DEFAULT_COMPANY.postalCode,
            address: source.address ?? DEFAULT_COMPANY.address,
            tel: source.tel ?? DEFAULT_COMPANY.tel,
            fax: source.fax ?? DEFAULT_COMPANY.fax,
        };

    };

    const buildHeaderHtml = (header, layout) => {

        const company = getCompanyInfo(layout);

        return `
<header class="delivery-header">
    <div class="delivery-barcode">
        <svg id="barcode" class="barcode"></svg>
    </div>
    <h1 class="delivery-title">納 品 書</h1>
    <div class="delivery-header__doc">
        <p class="delivery-doc-item">納品番号：${esc(header.delivery_no)}</p>
        <p class="delivery-doc-item">納品日：${esc(Format.formatDate(header.delivery_date))}</p>
    </div>
    <dl class="delivery-meta">
        <div class="delivery-meta__item">
            <dt>取引先コード</dt>
            <dd>${esc(header.customer_code)}</dd>
        </div>
        <div class="delivery-meta__item delivery-meta__item--customer-name">
            <dt>取引先名</dt>
            <dd>${esc(header.customer_name)}</dd>
        </div>
    </dl>
    <div class="delivery-header__company">
        <p class="company-name">${esc(company.name)}</p>
        <p class="company-address">${esc(company.postalCode)} ${esc(company.address)}</p>
        <p class="company-contact">${esc(company.tel)}</p>
        <p class="company-contact">${esc(company.fax)}</p>
    </div>
</header>`;

    };

    const buildDetailRowsHtml = (details) => {

        if (details.length === 0) {
            return `<tr class="detail-row detail-row--primary"><td colspan="${DETAIL_COLUMN_COUNT}">明細はありません</td></tr>`;
        }

        return details.map((detail) => (
            `<tr class="detail-row detail-row--primary">`
            + `<td class="detail-cell--stack">${esc(detail.manage_no)}</td>`
            + `<td class="detail-cell--stack">${esc(detail.client_name)}</td>`
            + `<td class="detail-cell--stack">${esc(detail.item_name)}</td>`
            + `<td class="detail-cell--stack">${esc(detail.slip_no)}</td>`
            + `<td class="num detail-cell--merged" rowspan="2">${esc(Format.formatMoney(detail.unit_price))}</td>`
            + `<td class="num detail-cell--merged" rowspan="2">${esc(detail.qty)}</td>`
            + `<td class="num detail-cell--merged" rowspan="2">${esc(Format.formatMoney(detail.amount))}</td>`
            + `</tr>`
            + `<tr class="detail-row detail-row--secondary">`
            + `<td class="detail-cell--stack detail-cell--kimono">${esc(detail.kimono_type)}</td>`
            + `<td class="detail-cell--stack detail-cell--spec">${esc(detail.kimono_spec)}</td>`
            + `<td class="detail-cell--stack"></td>`
            + `<td class="detail-cell--stack">${esc(detail.in_charge)}</td>`
            + `</tr>`
        )).join('');

    };

    const buildDetailTableHtml = (details) => `

<table class="delivery-detail-table">
    <thead>
        <tr class="detail-head">
            <th>管理番号</th>
            <th>お客様名</th>
            <th>加工内容</th>
            <th>伝票番号 / 係</th>
            <th>単価</th>
            <th>数量</th>
            <th>金額</th>
        </tr>
    </thead>
    <tbody>
${buildDetailRowsHtml(details)}
    </tbody>
</table>`;

    const buildSummaryHtml = (summary) => {

        if (typeof Format.formatNumber !== 'function') {
            Format.formatNumber = Format.formatMoney;
        }

        const subtotal = summary.totalAmount ?? 0;
        const tax = Math.round(subtotal * 0.10);
        const total = subtotal + tax;

        return `
<footer class="delivery-footer delivery-footer--totals">
    <table class="delivery-summary delivery-summary--totals">
        <tbody>
            <tr>
                <th>税抜合計</th>
                <td>${esc(Format.formatNumber(subtotal))}</td>
            </tr>
            <tr>
                <th>消費税（10％）</th>
                <td>${esc(Format.formatNumber(tax))}</td>
            </tr>
            <tr class="delivery-summary__total">
                <th>税込合計</th>
                <td>${esc(Format.formatNumber(total))}</td>
            </tr>
        </tbody>
    </table>
</footer>`;

    };

    const DeliveryTemplate = TemplateInterface.create('DeliveryTemplate', (data, config = {}, layout = {}) => {

        if (typeof Format === 'undefined') {
            throw new Error('Format モジュールが読み込まれていません。');
        }

        Validation.assertDetailReportData(data);

        const { header, details, summary } = data;

        return Common.buildDocumentHtml({
            title: '納品書',
            bodyClass: Common.getBodyClass(layout),
            content: `
    ${buildHeaderHtml(header, layout)}
    ${buildDetailTableHtml(details)}
    ${buildSummaryHtml(summary)}`,
        });

    });

    window.DeliveryTemplate = DeliveryTemplate;

})();
