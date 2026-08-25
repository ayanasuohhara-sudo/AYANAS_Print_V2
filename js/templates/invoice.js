(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * templates/invoice.js
     *
     * 請求書の HTML 文字列を生成する（請求書作成 App 35 向け）。
     */

    const INVOICE_TEMPLATE_VERSION = '35';
    const DETAILS_PER_PAGE_FIRST = 18;
    const DETAILS_PER_PAGE_NEXT = 24;

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

    const formatBillingPeriodLabel = (header) => {

        const from = String(header.billing_from ?? '').trim();
        const to = String(header.billing_to ?? '').trim();

        if (from && to) {
            return `${Format.formatDate(from)}～${Format.formatDate(to)}`;
        }

        const legacy = String(header.billing_period ?? '').trim();

        if (!legacy) {
            return '';
        }

        return legacy.replace(
            /(\d{4}-\d{2}-\d{2}|\d{4}\/\d{2}\/\d{2})/g,
            (date) => Format.formatDate(date)
        );

    };

    const buildCustomerPanelHtml = (header) => {

        const postal = formatPostal(header.customer_postal_code);
        const address = String(header.customer_address ?? '').trim();
        const customerCode = String(header.customer_code ?? '').trim();
        const billingPeriod = formatBillingPeriodLabel(header);

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

    const resolveSummaryAmounts = (summary) => {

        const subtotal = summary.subtotal ?? summary.totalAmount ?? 0;
        const tax = summary.tax ?? 0;
        const total = summary.total || (subtotal + tax);
        const carryOver = summary.carryOver ?? 0;
        const paymentAmount = summary.paymentAmount ?? 0;
        const currentBillingAmount = summary.currentBillingAmount
            ?? summary.invoiceAmount
            ?? summary.monthlyBillingAmount
            ?? total;

        return {
            carryOver,
            paymentAmount,
            subtotal,
            tax,
            total,
            currentBillingAmount,
        };

    };

    const buildBillingMetaBarHtml = (header) => {

        const closingDate = String(header.closing_date ?? '').trim();
        const billingPeriod = formatBillingPeriodLabel(header);

        if (!closingDate && !billingPeriod) {
            return '';
        }

        return `

<div class="invoice-billing-meta">
    <table class="invoice-summary invoice-billing-meta__table">
        <thead>
            <tr>
                <th>締日</th>
                <th>ご請求対象期間</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>${esc(closingDate)}</td>
                <td>${esc(billingPeriod)}</td>
            </tr>
        </tbody>
    </table>
</div>`;

    };

    const buildAmountOverviewHtml = (summary) => {

        const amounts = resolveSummaryAmounts(summary);

        return `

<div class="invoice-amount-overview">
    <table class="invoice-summary invoice-summary--overview">
        <thead>
            <tr>
                <th>前回請求額</th>
                <th>今回入金額</th>
                <th>小計</th>
                <th>消費税</th>
                <th>税込み合計</th>
                <th class="invoice-amount-overview__current-head">今回ご請求金額</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td class="num">${esc(Format.formatMoney(amounts.carryOver))}</td>
                <td class="num">${esc(Format.formatMoney(amounts.paymentAmount))}</td>
                <td class="num">${esc(Format.formatMoney(amounts.subtotal))}</td>
                <td class="num">${esc(Format.formatMoney(amounts.tax))}</td>
                <td class="num">${esc(Format.formatMoney(amounts.total))}</td>
                <td class="num invoice-amount-overview__current">${esc(Format.formatMoney(amounts.currentBillingAmount))}</td>
            </tr>
        </tbody>
    </table>
</div>`;

    };

    const buildPage1FooterHtml = (summary) => {

        const amounts = resolveSummaryAmounts(summary);
        const [firstLine, secondLine, thirdLine] = INVOICE_BANK_LINES;

        return `

<table class="invoice-page1-footer-table">
    <colgroup>
        <col class="invoice-page1-footer__col-bank-label">
        <col class="invoice-page1-footer__col-bank-account">
        <col class="invoice-page1-footer__col-total-label">
        <col class="invoice-page1-footer__col-total-value">
    </colgroup>
    <tbody>
        <tr class="invoice-page1-footer__row">
            <th class="invoice-bank-info__label" rowspan="3">振込先</th>
            <td class="invoice-bank-info__account">${esc(firstLine)}</td>
            <th class="invoice-page1-totals__label">税抜合計</th>
            <td class="num invoice-page1-totals__value">${esc(Format.formatMoney(amounts.subtotal))}</td>
        </tr>
        <tr class="invoice-page1-footer__row">
            <td class="invoice-bank-info__account">${esc(secondLine)}</td>
            <th class="invoice-page1-totals__label">消費税（10％）</th>
            <td class="num invoice-page1-totals__value">${esc(Format.formatMoney(amounts.tax))}</td>
        </tr>
        <tr class="invoice-page1-footer__row invoice-summary__total">
            <td class="invoice-bank-info__account">${esc(thirdLine)}</td>
            <th class="invoice-page1-totals__label">税込合計</th>
            <td class="num invoice-page1-totals__value">${esc(Format.formatMoney(amounts.total))}</td>
        </tr>
    </tbody>
</table>`;

    };

    const buildInvoiceDetailPages = (details) => {

        const pages = [];

        if (!Array.isArray(details) || details.length === 0) {
            pages.push(Core.Report.padPageDetails([], DETAILS_PER_PAGE_FIRST));
            return pages;
        }

        pages.push(Core.Report.padPageDetails(
            details.slice(0, DETAILS_PER_PAGE_FIRST),
            DETAILS_PER_PAGE_FIRST
        ));

        let index = DETAILS_PER_PAGE_FIRST;

        while (index < details.length) {

            const chunk = details.slice(index, index + DETAILS_PER_PAGE_NEXT);

            pages.push(Core.Report.padPageDetails(chunk, DETAILS_PER_PAGE_NEXT));
            index += DETAILS_PER_PAGE_NEXT;

        }

        return pages;

    };

    const buildPageHtml = (header, pageDetails, summary, layout, options = {}) => {

        const {
            pageNumber = 1,
            totalPages = 1,
        } = options;

        const windowAddressHtml = '';
        const isPage1 = pageNumber === 1;

        return `
    ${windowAddressHtml}
    ${buildHeaderHtml(header, layout, { pageNumber, totalPages })}
    ${isPage1 ? buildBillingMetaBarHtml(header) : ''}
    ${isPage1 ? buildAmountOverviewHtml(summary) : ''}
    ${buildDetailTableHtml(pageDetails)}
    ${isPage1 ? buildPage1FooterHtml(summary) : ''}
    ${buildPageNoHtml(pageNumber, totalPages)}`;

    };

    const InvoiceTemplate = TemplateInterface.create('InvoiceTemplate', (data, config = {}, layout = {}) => {

        console.info(`[AYANAS Print V3] invoice template v${INVOICE_TEMPLATE_VERSION}`);

        if (typeof Format === 'undefined') {
            throw new Error('Format モジュールが読み込まれていません。');
        }

        Validation.assertDetailReportData(data);

        const { header, details, summary } = data;
        const detailPages = buildInvoiceDetailPages(details);
        const totalPages = detailPages.length;
        const pagesHtml = detailPages.map((pageDetails, index) => (
            `<div class="page">${buildPageHtml(
                header,
                pageDetails,
                summary,
                layout,
                {
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
