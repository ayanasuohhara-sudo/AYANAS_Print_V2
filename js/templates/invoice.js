(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * templates/invoice.js
     *
     * 請求書の HTML 文字列を生成する（請求書作成 App 35 向け）。
     */

    const DETAILS_PER_PAGE = Core.Report.DETAILS_PER_PAGE;

    const DEFAULT_COMPANY = {
        name: '株式会社AYANAS',
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
            bankInfo: source.bankInfo ?? '',
            invoiceRegistrationNo: source.invoiceRegistrationNo ?? '',
        };

    };

    const formatCustomerName = (name) => `${String(name ?? '').trim()}様`;

    const buildHeaderHtml = (header, layout, pageMeta = {}) => {

        const company = getCompanyInfo(layout);
        const pageNumber = pageMeta.pageNumber ?? 1;
        const totalPages = pageMeta.totalPages ?? 1;
        const showBarcode = pageNumber === 1;
        const infoClass = showBarcode
            ? 'invoice-header__info'
            : 'invoice-header__info invoice-header__info--no-barcode';

        return `
<header class="invoice-header">
    ${showBarcode ? `<div class="invoice-barcode">
        <svg id="barcode" class="barcode"></svg>
    </div>` : ''}
    <div class="invoice-header__left">
        <h1 class="invoice-title">請 求 書</h1>
        <dl class="invoice-meta">
            <div class="invoice-meta__item">
                <dt>請求先コード</dt>
                <dd>${esc(header.customer_code)}</dd>
            </div>
            <div class="invoice-meta__item">
                <dt>担当者</dt>
                <dd>${esc(header.in_charge)}</dd>
            </div>
        </dl>
        <p class="invoice-customer-name">${esc(formatCustomerName(header.customer_name))}</p>
        <p class="invoice-due-date">支払期限：${esc(Format.formatDate(header.due_date))}</p>
    </div>
    <div class="invoice-header__right">
        <div class="${infoClass}">
            <div class="invoice-header__doc">
                <p class="invoice-page-no">${pageNumber} / ${totalPages}</p>
                <p class="invoice-doc-item">請求番号：${esc(header.invoice_no)}</p>
                <p class="invoice-doc-item">請求日：${esc(Format.formatDate(header.invoice_date))}</p>
                <p class="invoice-doc-item">請求期間：${esc(header.billing_period)}</p>
            </div>
            <div class="invoice-header__company">
                <p class="company-name">${esc(company.name)}</p>
                <p class="company-address">${esc(company.postalCode)} ${esc(company.address)}</p>
                <p class="company-contact">${esc(company.tel)}</p>
                <p class="company-contact">${esc(company.fax)}</p>
            </div>
        </div>
    </div>
</header>`;

    };

    const buildEmptyDetailRowHtml = () => (
        '<tr class="invoice-detail-row invoice-detail-row--empty">'
        + '<td></td><td></td><td></td><td></td><td></td>'
        + '<td></td><td></td><td class="num"></td><td class="num"></td><td class="num"></td>'
        + '</tr>'
    );

    const buildDetailRowHtml = (detail) => {

        if (!detail) {
            return buildEmptyDetailRowHtml();
        }

        return `<tr class="invoice-detail-row">`
            + `<td>${esc(Format.formatDate(detail.delivery_date))}</td>`
            + `<td>${esc(detail.delivery_no)}</td>`
            + `<td>${esc(detail.manage_no)}</td>`
            + `<td>${esc(detail.client_name)}</td>`
            + `<td>${esc(detail.kimono_type)}</td>`
            + `<td>${esc(detail.kimono_spec)}</td>`
            + `<td>${esc(detail.item_name)}</td>`
            + `<td class="num">${esc(detail.qty)}</td>`
            + `<td class="num">${esc(Format.formatMoney(detail.unit_price))}</td>`
            + `<td class="num">${esc(Format.formatMoney(detail.amount))}</td>`
            + `</tr>`;

    };

    const buildDetailRowsHtml = (details) => details.map((detail) => buildDetailRowHtml(detail)).join('');

    const buildDetailTableHtml = (details) => `

<table class="invoice-detail-table">
    <thead>
        <tr class="invoice-detail-head">
            <th>納品日</th>
            <th>納品番号</th>
            <th>管理番号</th>
            <th>お客様名</th>
            <th>着物種類</th>
            <th>仕様</th>
            <th>加工内容</th>
            <th>数量</th>
            <th>単価</th>
            <th>金額</th>
        </tr>
    </thead>
    <tbody>
${buildDetailRowsHtml(details)}
    </tbody>
</table>`;

    const buildSummaryHtml = (summary) => `

<footer class="invoice-footer invoice-footer--totals">
    <table class="invoice-summary invoice-summary--totals">
        <tbody>
            <tr>
                <th>点数</th>
                <td>${esc(summary.totalCount ?? 0)}</td>
                <th>数量合計</th>
                <td>${esc(summary.totalQty ?? 0)}</td>
            </tr>
            <tr>
                <th>税抜合計</th>
                <td>${esc(Format.formatMoney(summary.subtotal ?? summary.totalAmount ?? 0))}</td>
                <th>消費税（10％）</th>
                <td>${esc(Format.formatMoney(summary.tax ?? 0))}</td>
            </tr>
            <tr class="invoice-summary__total">
                <th>税込合計</th>
                <td colspan="3">${esc(Format.formatMoney(summary.total ?? 0))}</td>
            </tr>
        </tbody>
    </table>
</footer>`;

    const buildFooterExtrasHtml = (header, layout = {}) => {

        const company = getCompanyInfo(layout);
        const remarks = String(header.remarks ?? '').trim();
        const bankInfo = String(company.bankInfo ?? '').trim();
        const invoiceRegistrationNo = String(company.invoiceRegistrationNo ?? '').trim();

        return `

<footer class="invoice-footer invoice-footer--extras">
    <div class="invoice-footer__section">
        <p class="invoice-footer__label">備考</p>
        <p class="invoice-footer__text">${esc(remarks)}</p>
    </div>
    <div class="invoice-footer__section">
        <p class="invoice-footer__label">振込先</p>
        <p class="invoice-footer__text">${esc(bankInfo)}</p>
    </div>
    <div class="invoice-footer__section">
        <p class="invoice-footer__label">インボイス登録番号</p>
        <p class="invoice-footer__text">${esc(invoiceRegistrationNo)}</p>
    </div>
</footer>`;

    };

    const buildPageHtml = (header, pageDetails, summary, layout, options = {}) => {

        const {
            showSummary = false,
            pageNumber = 1,
            totalPages = 1,
        } = options;

        const isWindowEnvelope = layout.invoiceLayout === 'window_envelope';
        const windowAddressHtml = isWindowEnvelope
            && pageNumber === 1
            && typeof InvoiceWindowTemplate !== 'undefined'
            ? InvoiceWindowTemplate.buildAddressHtml(header)
            : '';

        return `
    ${windowAddressHtml}
    ${buildHeaderHtml(header, layout, { pageNumber, totalPages })}
    ${buildDetailTableHtml(pageDetails)}
    ${showSummary ? buildSummaryHtml(summary) : ''}
    ${showSummary ? buildFooterExtrasHtml(header, layout) : ''}`;

    };

    const InvoiceTemplate = TemplateInterface.create('InvoiceTemplate', (data, config = {}, layout = {}) => {

        if (typeof Format === 'undefined') {
            throw new Error('Format モジュールが読み込まれていません。');
        }

        Validation.assertDetailReportData(data);

        const { header, details, summary } = data;
        const detailPages = Core.Report.buildDetailPages(details, DETAILS_PER_PAGE);
        const totalPages = detailPages.length;
        const pagesHtml = detailPages.map((pageDetails, index) => (
            `<div class="page">${buildPageHtml(
                header,
                pageDetails,
                summary,
                layout,
                {
                    showSummary: index === totalPages - 1,
                    pageNumber: index + 1,
                    totalPages,
                }
            )}
</div>`
        )).join('\n');

        return Common.buildDocumentHtml({
            title: '請求書',
            bodyClass: Common.getBodyClass(layout),
            content: pagesHtml,
            multiPage: true,
        });

    });

    window.InvoiceTemplate = InvoiceTemplate;

})();
