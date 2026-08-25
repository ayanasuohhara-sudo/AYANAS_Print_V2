(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * templates/invoice.js
     *
     * 請求書の HTML 文字列を生成する（請求書作成 App 35 向け）。
     */

    const DETAILS_PER_PAGE = 12;

    const DEFAULT_COMPANY = {
        name: '株式会社ayanasu',
        postalCode: '〒631-0078',
        address: '奈良県奈良市富雄元町1-13-41',
        tel: 'TEL 0742-47-8390',
        fax: 'FAX 0742-47-8391',
        invoiceRegistrationNo: 'T7150001017765',
    };

    const INVOICE_BANK_LINES = [
        '三井住友銀行\u3000奈良支店\u3000普通\u30001591678',
        '三菱UFJ銀行\u3000富雄出張所\u3000普通\u30000083302',
        'ゆうちょ銀行\u3000四五八\u3000普通\u30002155204',
    ];

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

    const formatKimonoSubHtml = (type, spec) => {

        const kimonoType = String(type ?? '').trim();
        const kimonoSpec = String(spec ?? '').trim();

        if (kimonoType && kimonoSpec) {
            return `<span class="detail-kimono-type">${esc(kimonoType)}</span>`
                + `<span class="detail-kimono-spec">${esc(kimonoSpec)}</span>`;
        }

        return esc(kimonoType || kimonoSpec);

    };

    const formatCustomerName = (name) => `${String(name ?? '').trim()}様`;

    const resolveCustomerNameFontSize = (name) => {

        const length = formatCustomerName(name).length;

        if (length <= 14) {
            return '10pt';
        }

        if (length <= 18) {
            return '9pt';
        }

        if (length <= 22) {
            return '8pt';
        }

        if (length <= 28) {
            return '7pt';
        }

        if (length <= 34) {
            return '6.5pt';
        }

        return '6pt';

    };

    const buildCustomerNameHtml = (name) => {

        const customerName = formatCustomerName(name);
        const fontSize = resolveCustomerNameFontSize(name);

        return `<p class="invoice-customer-panel__name" style="font-size:${fontSize}">${esc(customerName)}</p>`;

    };

    const formatPostal = (value) => {

        const raw = String(value ?? '').trim();

        if (!raw) {
            return '';
        }

        return raw.startsWith('〒') ? raw : `〒${raw}`;

    };

    const buildCustomerPanelHtml = (header) => {

        const postal = formatPostal(header.customer_postal_code);
        const address = String(header.customer_address ?? '').trim();
        const customerCode = String(header.customer_code ?? '').trim();
        const billingPeriod = String(header.billing_period ?? '').trim();

        return `
            <div class="invoice-customer-panel">
                ${postal ? `<p class="invoice-customer-panel__postal">${esc(postal)}</p>` : ''}
                ${address ? `<p class="invoice-customer-panel__address">${esc(address)}</p>` : ''}
                ${buildCustomerNameHtml(header.customer_name)}
                ${customerCode ? `<p class="invoice-customer-panel__code">お得意様コード：${esc(customerCode)}</p>` : ''}
                ${billingPeriod ? `<p class="invoice-customer-panel__period">請求対象期間：${esc(billingPeriod)}</p>` : ''}
            </div>`;

    };

    const buildCustomerPanelBriefHtml = (header) => {

        const customerCode = String(header.customer_code ?? '').trim();

        return `
            <div class="invoice-customer-panel invoice-customer-panel--brief">
                ${buildCustomerNameHtml(header.customer_name)}
                ${customerCode ? `<p class="invoice-customer-panel__code">お得意様コード：${esc(customerCode)}</p>` : ''}
            </div>`;

    };

    const buildCompanyHtml = (company) => {

        const registrationNo = String(company.invoiceRegistrationNo ?? '').trim();

        return `

            <div class="invoice-header__company">
                <p class="company-name">${esc(company.name)}</p>
                ${registrationNo ? `<p class="company-registration">登録番号：${esc(registrationNo)}</p>` : ''}
                <p class="company-address">${esc(company.postalCode)} ${esc(company.address)}</p>
                <p class="company-contact">${esc(company.tel)}</p>
                <p class="company-contact">${esc(company.fax)}</p>
            </div>`;

    };

    const buildBankInfoHtml = () => {

        const [firstLine, ...restLines] = INVOICE_BANK_LINES;
        const restRowsHtml = restLines.map((line) => (
            `<tr><td class="invoice-bank-info__account">${esc(line)}</td></tr>`
        )).join('');

        return `

<table class="invoice-bank-info">
    <tbody>
        <tr>
            <th class="invoice-bank-info__label" rowspan="${INVOICE_BANK_LINES.length}">振込先</th>
            <td class="invoice-bank-info__account">${esc(firstLine)}</td>
        </tr>
        ${restRowsHtml}
    </tbody>
</table>`;

    };

    const buildPageNoHtml = (pageNumber, totalPages) => (
        `<p class="invoice-page-no">${pageNumber} / ${totalPages}</p>`
    );

    const buildHeaderHtml = (header, layout, pageMeta = {}) => {

        const company = getCompanyInfo(layout);
        const pageNumber = pageMeta.pageNumber ?? 1;
        const showFullAddressee = pageNumber === 1;
        const showBriefAddressee = pageNumber > 1;
        const showCompany = pageNumber === 1;

        return `
<header class="invoice-header${showFullAddressee ? '' : ' invoice-header--continued'}">
    <div class="invoice-header__left">
        ${showFullAddressee ? buildCustomerPanelHtml(header) : ''}
        ${showBriefAddressee ? buildCustomerPanelBriefHtml(header) : ''}
    </div>
    <div class="invoice-header__right">
        <div class="invoice-header__info">
            <h1 class="invoice-title">請 求 書</h1>
            <div class="invoice-header__doc">
                <p class="invoice-doc-item">請求番号：${esc(header.invoice_no)}</p>
                <p class="invoice-doc-item">請求日：${esc(Format.formatDate(header.invoice_date))}</p>
            </div>
            ${showCompany ? buildCompanyHtml(company) : ''}
        </div>
    </div>
</header>`;

    };

    const buildEmptyDetailPairHtml = () => (
        `<tr class="detail-row detail-row--primary detail-row--empty">`
        + `<td class="detail-cell--stack"></td>`
        + `<td class="detail-cell--stack"></td>`
        + `<td class="detail-cell--stack"></td>`
        + `<td class="detail-cell--stack"></td>`
        + `<td class="num detail-cell--merged" rowspan="2"></td>`
        + `<td class="num detail-cell--merged" rowspan="2"></td>`
        + `<td class="num detail-cell--merged" rowspan="2"></td>`
        + `</tr>`
        + `<tr class="detail-row detail-row--secondary detail-row--empty">`
        + `<td class="detail-cell--stack detail-cell--delivery-no"></td>`
        + `<td class="detail-cell--stack detail-cell--manage-no"></td>`
        + `<td class="detail-cell--stack detail-cell--item-sub"></td>`
        + `<td class="detail-cell--stack"></td>`
        + `</tr>`
    );

    const buildDetailPairHtml = (detail) => {

        if (!detail) {
            return buildEmptyDetailPairHtml();
        }

        return `<tr class="detail-row detail-row--primary">`
            + `<td class="detail-cell--stack">${esc(Format.formatDate(detail.delivery_date))}</td>`
            + `<td class="detail-cell--stack">${esc(detail.client_name)}</td>`
            + `<td class="detail-cell--stack">${esc(detail.item_name)}</td>`
            + `<td class="detail-cell--stack">${esc(detail.slip_no)}</td>`
            + `<td class="num detail-cell--merged" rowspan="2">${esc(Format.formatMoney(detail.unit_price))}</td>`
            + `<td class="num detail-cell--merged" rowspan="2">${esc(detail.qty)}</td>`
            + `<td class="num detail-cell--merged" rowspan="2">${esc(Format.formatMoney(detail.amount))}</td>`
            + `</tr>`
            + `<tr class="detail-row detail-row--secondary">`
            + `<td class="detail-cell--stack detail-cell--delivery-no">${esc(detail.delivery_no)}</td>`
            + `<td class="detail-cell--stack detail-cell--manage-no">${esc(detail.manage_no)}</td>`
            + `<td class="detail-cell--stack detail-cell--item-sub">${formatKimonoSubHtml(detail.kimono_type, detail.kimono_spec)}</td>`
            + `<td class="detail-cell--stack">${esc(detail.in_charge)}</td>`
            + `</tr>`;

    };

    const buildDetailRowsHtml = (details) => details.map((detail) => buildDetailPairHtml(detail)).join('');

    const buildDetailTableHtml = (details) => `

<table class="invoice-detail-table">
    <thead>
        <tr class="detail-head">
            <th>納品日</th>
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

        const subtotal = summary.subtotal ?? summary.totalAmount ?? 0;
        const tax = summary.tax ?? 0;
        const total = summary.total || (subtotal + tax);

        return `

<footer class="invoice-footer invoice-footer--totals">
    <table class="invoice-summary invoice-summary--totals">
        <tbody>
            <tr>
                <th>税抜合計</th>
                <td colspan="3">${esc(Format.formatMoney(subtotal))}</td>
            </tr>
            <tr>
                <th>消費税（10％）</th>
                <td colspan="3">${esc(Format.formatMoney(tax))}</td>
            </tr>
            <tr class="invoice-summary__total">
                <th>税込合計</th>
                <td colspan="3">${esc(Format.formatMoney(total))}</td>
            </tr>
        </tbody>
    </table>
</footer>`;

    };

    const buildPageHtml = (header, pageDetails, summary, layout, options = {}) => {

        const {
            showSummary = false,
            pageNumber = 1,
            totalPages = 1,
        } = options;

        const windowAddressHtml = '';
        const showPage1BankInfo = pageNumber === 1;

        return `
    ${windowAddressHtml}
    ${buildHeaderHtml(header, layout, { pageNumber, totalPages })}
    ${buildDetailTableHtml(pageDetails)}
    ${showPage1BankInfo ? buildBankInfoHtml() : ''}
    ${showSummary ? buildSummaryHtml(summary) : ''}
    ${buildPageNoHtml(pageNumber, totalPages)}`;

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
