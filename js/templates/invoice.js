(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * templates/invoice.js
     *
     * 請求書の HTML 文字列を生成する（請求書作成 App 35 向け）。
     */

    const INVOICE_TEMPLATE_VERSION = '65';
    /**
     * 法人向け基準スロット数。
     * 行高を確保しつつ余白が余らないよう、A4に収まる上限付近まで増やす。
     */
    const DETAILS_PER_PAGE_FIRST = 15;
    /** 繰越ありは締日表と金額2段があるため、1ページ目の明細を2スロット減らす */
    const DETAILS_PER_PAGE_FIRST_CARRY = 13;
    const DETAILS_PER_PAGE_NEXT = 24;
    const DETAILS_PER_PAGE_FIRST_MIN = 11;
    /** 一般客は行高を広げるため、1ページあたりの明細を抑える */
    const DETAILS_PER_PAGE_FIRST_GENERAL = 9;
    const DETAILS_PER_PAGE_NEXT_GENERAL = 12;
    const DETAILS_PER_PAGE_FIRST_MIN_GENERAL = 7;
    const FIRST_PAGE_DETAIL_CUSTOMER_REDUCTION = {};
    /** 折り返し見積: 列ごとのおおよその1行あたり文字数（和文） */
    const WRAP_CHARS = {
        clientName: 16,
        itemName: 18,
        slipNo: 10,
        generalClientName: 14,
        generalItemName: 16,
    };

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

    const resolveSealImageUrl = (sealImage, config = {}) => {

        const configDataUrl = String(config.company_seal_data_url ?? '').trim();

        if (configDataUrl.startsWith('data:')) {
            return configDataUrl;
        }

        if (typeof window.CompanySealDataUrl === 'string' && window.CompanySealDataUrl.startsWith('data:')) {
            return window.CompanySealDataUrl;
        }

        const path = String(sealImage ?? '').trim();

        if (!path) {
            return '';
        }

        if (/^(https?:|data:)/i.test(path)) {
            return path;
        }

        return '';

    };

    const getCompanyInfo = (layout = {}, config = {}) => {

        const source = layout.company ?? DEFAULT_COMPANY;

        return {
            name: source.name ?? DEFAULT_COMPANY.name,
            postalCode: source.postalCode ?? DEFAULT_COMPANY.postalCode,
            address: source.address ?? DEFAULT_COMPANY.address,
            tel: source.tel ?? DEFAULT_COMPANY.tel,
            fax: source.fax ?? DEFAULT_COMPANY.fax,
            bankInfo: source.bankInfo ?? '',
            invoiceRegistrationNo: source.invoiceRegistrationNo ?? '',
            sealImageUrl: resolveSealImageUrl(source.sealImage, config),
            sealOpacity: Number(source.sealOpacity ?? 0.65),
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

    const formatGeneralCustomerName = (name) => `${String(name ?? '').trim()} 様`;

    const resolveCustomerNameFontSize = (name) => {

        const length = formatCustomerName(name).length;

        if (length <= 14) {
            return '12pt';
        }

        if (length <= 18) {
            return '11pt';
        }

        if (length <= 22) {
            return '10pt';
        }

        if (length <= 28) {
            return '9pt';
        }

        if (length <= 34) {
            return '8.5pt';
        }

        return '8pt';

    };

    const resolveGeneralCustomerNameFontSize = (name) => {

        const length = formatGeneralCustomerName(name).length;

        if (length <= 12) {
            return '16pt';
        }

        if (length <= 16) {
            return '14pt';
        }

        if (length <= 20) {
            return '12pt';
        }

        if (length <= 26) {
            return '11pt';
        }

        if (length <= 34) {
            return '10pt';
        }

        return '9pt';

    };

    const buildCustomerNameHtml = (name, options = {}) => {

        const isGeneral = options.general === true;
        const customerName = isGeneral
            ? formatGeneralCustomerName(name)
            : formatCustomerName(name);

        if (isGeneral) {
            const fontSize = resolveGeneralCustomerNameFontSize(name);

            return `<p class="invoice-customer-panel__name invoice-customer-panel__name--general" style="font-size:${fontSize}">${esc(customerName)}</p>`;
        }

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

    const buildGeneralCustomerCodeHtml = (header) => {

        const customerCode = String(header.customer_code ?? '').trim();

        if (!customerCode) {
            return '';
        }

        return `<p class="invoice-customer-panel__code invoice-customer-panel__code--general">顧客コード：${esc(customerCode)}</p>`;

    };

    const buildCustomerPanelHtml = (header, layout = {}) => {

        if (layout.recipientMode === 'general') {
            return `
            <div class="invoice-customer-panel invoice-customer-panel--general">
                ${buildCustomerNameHtml(header.general_client_name, { general: true })}
                ${buildGeneralCustomerCodeHtml(header)}
            </div>`;
        }

        const postal = formatPostal(header.customer_postal_code);
        const address = String(header.customer_address ?? '').trim();
        const customerCode = String(header.customer_code ?? '').trim();

        return `
            <div class="invoice-customer-panel">
                ${postal ? `<p class="invoice-customer-panel__postal">${esc(postal)}</p>` : ''}
                ${address ? `<p class="invoice-customer-panel__address">${esc(address)}</p>` : ''}
                ${buildCustomerNameHtml(header.customer_name)}
                ${customerCode ? `<p class="invoice-customer-panel__code">お得意様コード：${esc(customerCode)}</p>` : ''}
            </div>`;

    };

    const buildCustomerPanelBriefHtml = (header, layout = {}) => {

        if (layout.recipientMode === 'general') {
            return `
            <div class="invoice-customer-panel invoice-customer-panel--brief invoice-customer-panel--general">
                ${buildCustomerNameHtml(header.general_client_name, { general: true })}
                ${buildGeneralCustomerCodeHtml(header)}
            </div>`;
        }

        const customerCode = String(header.customer_code ?? '').trim();

        return `
            <div class="invoice-customer-panel invoice-customer-panel--brief">
                ${buildCustomerNameHtml(header.customer_name)}
                ${customerCode ? `<p class="invoice-customer-panel__code">お得意様コード：${esc(customerCode)}</p>` : ''}
            </div>`;

    };

    const buildCompanyHtml = (company) => {

        const registrationNo = String(company.invoiceRegistrationNo ?? '').trim();
        const sealImageUrl = String(company.sealImageUrl ?? '').trim();
        const sealOpacity = Number.isFinite(company.sealOpacity) ? company.sealOpacity : 0.65;
        const sealHtml = sealImageUrl
            ? `<img class="invoice-header__company-seal" src="${esc(sealImageUrl)}" alt="" style="opacity:${sealOpacity}">`
            : '';

        return `

            <div class="invoice-header__company">
                ${sealHtml}
                <div class="invoice-header__company-body">
                    <p class="company-name">${esc(company.name)}</p>
                    ${registrationNo ? `<p class="company-registration">登録番号：${esc(registrationNo)}</p>` : ''}
                    <p class="company-postal">${esc(company.postalCode)}</p>
                    <p class="company-address">${esc(company.address)}</p>
                    <p class="company-contact">${esc(company.tel)}</p>
                    <p class="company-contact">${esc(company.fax)}</p>
                </div>
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

    const buildHeaderHtml = (header, layout, pageMeta = {}, config = {}) => {

        const company = getCompanyInfo(layout, config);
        const pageNumber = pageMeta.pageNumber ?? 1;
        const showFullAddressee = pageNumber === 1;
        const showBriefAddressee = pageNumber > 1;
        const showCompany = pageNumber === 1;

        return `
<header class="invoice-header${showFullAddressee ? '' : ' invoice-header--continued'}">
    <div class="invoice-header__left">
        ${showFullAddressee ? buildCustomerPanelHtml(header, layout) : ''}
        ${showBriefAddressee ? buildCustomerPanelBriefHtml(header, layout) : ''}
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

    const buildEmptyDetailPairHtml = (options = {}) => {

        const isGeneral = options.general === true;

        if (isGeneral) {
            const spacer = '<span class="detail-row-spacer" aria-hidden="true"></span>';
            const spacerPair = '<span class="detail-row-spacer detail-row-spacer--pair" aria-hidden="true"></span>';

            return `<tr class="detail-row detail-row--primary detail-row--empty">`
                + `<td class="detail-cell--stack">${spacer}</td>`
                + `<td class="detail-cell--merged detail-cell--client-name" rowspan="2">${spacerPair}</td>`
                + `<td class="detail-cell--stack">${spacer}</td>`
                + `<td class="detail-cell--stack detail-cell--slip-no">${spacer}</td>`
                + `<td class="num detail-cell--merged" rowspan="2">${spacerPair}</td>`
                + `<td class="num detail-cell--merged" rowspan="2">${spacerPair}</td>`
                + `<td class="num detail-cell--merged" rowspan="2">${spacerPair}</td>`
                + `</tr>`
                + `<tr class="detail-row detail-row--secondary detail-row--empty">`
                + `<td class="detail-cell--stack detail-cell--delivery-no">${spacer}</td>`
                + `<td class="detail-cell--stack detail-cell--item-sub">${spacer}</td>`
                + `<td class="detail-cell--stack detail-cell--slip-no">${spacer}</td>`
                + `</tr>`;
        }

        // 空セルだと行高が潰れて罫線が消えるため、スペーサで高さを確保する
        const spacer = '<span class="detail-row-spacer" aria-hidden="true"></span>';
        const spacerPair = '<span class="detail-row-spacer detail-row-spacer--pair" aria-hidden="true"></span>';

        return `<tr class="detail-row detail-row--primary detail-row--empty">`
            + `<td class="detail-cell--stack">${spacer}</td>`
            + `<td class="detail-cell--stack detail-cell--client-name">${spacer}</td>`
            + `<td class="detail-cell--stack">${spacer}</td>`
            + `<td class="detail-cell--stack detail-cell--slip-no">${spacer}</td>`
            + `<td class="num detail-cell--merged" rowspan="2">${spacerPair}</td>`
            + `<td class="num detail-cell--merged" rowspan="2">${spacerPair}</td>`
            + `<td class="num detail-cell--merged" rowspan="2">${spacerPair}</td>`
            + `</tr>`
            + `<tr class="detail-row detail-row--secondary detail-row--empty">`
            + `<td class="detail-cell--stack detail-cell--delivery-no">${spacer}</td>`
            + `<td class="detail-cell--stack detail-cell--manage-no">${spacer}</td>`
            + `<td class="detail-cell--stack detail-cell--item-sub">${spacer}</td>`
            + `<td class="detail-cell--stack detail-cell--slip-no">${spacer}</td>`
            + `</tr>`;

    };

    const buildDetailPairHtml = (detail, options = {}) => {

        const isGeneral = options.general === true;

        if (!detail) {
            return buildEmptyDetailPairHtml(options);
        }

        const wrapUnits = Math.max(1, Math.min(3, Number(detail._slotUnits) || 1));
        const wrapClass = wrapUnits > 1 ? ` detail-row--wrap-${wrapUnits}` : '';

        if (isGeneral) {
            const manageText = detail._showManageNo
                ? String(detail.manage_no ?? '').trim()
                : '';
            const deliverySecondary = manageText
                ? `${esc(detail.delivery_no)}<span class="detail-manage-inline">${esc(manageText)}</span>`
                : esc(detail.delivery_no);

            return `<tr class="detail-row detail-row--primary${wrapClass}">`
                + `<td class="detail-cell--stack">${esc(Format.formatDate(detail.delivery_date))}</td>`
                + `<td class="detail-cell--merged detail-cell--client-name" rowspan="2">${esc(detail.client_name)}</td>`
                + `<td class="detail-cell--stack detail-cell--item-name">${esc(detail.item_name)}</td>`
                + `<td class="detail-cell--stack detail-cell--slip-no">${esc(detail.slip_no)}</td>`
                + `<td class="num detail-cell--merged" rowspan="2">${esc(Format.formatMoney(detail.unit_price))}</td>`
                + `<td class="num detail-cell--merged" rowspan="2">${esc(detail.qty)}</td>`
                + `<td class="num detail-cell--merged" rowspan="2">${esc(Format.formatMoney(detail.amount))}</td>`
                + `</tr>`
                + `<tr class="detail-row detail-row--secondary${wrapClass}">`
                + `<td class="detail-cell--stack detail-cell--delivery-no">${deliverySecondary}</td>`
                + `<td class="detail-cell--stack detail-cell--item-sub">${formatKimonoSubHtml(detail.kimono_type, detail.kimono_spec)}</td>`
                + `<td class="detail-cell--stack detail-cell--slip-no">${esc(detail.in_charge)}</td>`
                + `</tr>`;
        }

        return `<tr class="detail-row detail-row--primary${wrapClass}">`
            + `<td class="detail-cell--stack">${esc(Format.formatDate(detail.delivery_date))}</td>`
            + `<td class="detail-cell--stack detail-cell--client-name">${esc(detail.client_name)}</td>`
            + `<td class="detail-cell--stack detail-cell--item-name">${esc(detail.item_name)}</td>`
            + `<td class="detail-cell--stack detail-cell--slip-no">${esc(detail.slip_no)}</td>`
            + `<td class="num detail-cell--merged" rowspan="2">${esc(Format.formatMoney(detail.unit_price))}</td>`
            + `<td class="num detail-cell--merged" rowspan="2">${esc(detail.qty)}</td>`
            + `<td class="num detail-cell--merged" rowspan="2">${esc(Format.formatMoney(detail.amount))}</td>`
            + `</tr>`
            + `<tr class="detail-row detail-row--secondary${wrapClass}">`
            + `<td class="detail-cell--stack detail-cell--delivery-no">${esc(detail.delivery_no)}</td>`
            + `<td class="detail-cell--stack detail-cell--manage-no">${esc(detail._showManageNo ? detail.manage_no : '')}</td>`
            + `<td class="detail-cell--stack detail-cell--item-sub">${formatKimonoSubHtml(detail.kimono_type, detail.kimono_spec)}</td>`
            + `<td class="detail-cell--stack detail-cell--slip-no">${esc(detail.in_charge)}</td>`
            + `</tr>`;

    };

    const buildDetailRowsHtml = (details, options = {}) => (
        details.map((detail) => buildDetailPairHtml(detail, options)).join('')
    );

    const buildDetailTableHtml = (details, options = {}) => `

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
${buildDetailRowsHtml(details, options)}
    </tbody>
</table>`;

    const resolveSummaryAmounts = (summary, options = {}) => {

        const { includeCarryForwardInCurrentBilling = false } = options;

        const subtotal = summary.subtotal ?? summary.totalAmount ?? 0;
        const tax = summary.tax ?? 0;
        const total = summary.total || (subtotal + tax);
        const carryOver = summary.carryOver ?? 0;
        const paymentAmount = summary.paymentAmount ?? 0;

        const carryForwardAmount = carryOver - paymentAmount;
        const adjustmentAmount = toNumber(summary.adjustmentAmount ?? summary.discountAmount);

        let currentBillingAmount = summary.currentBillingAmount
            ?? summary.invoiceAmount
            ?? summary.monthlyBillingAmount
            ?? total;

        if (includeCarryForwardInCurrentBilling) {
            currentBillingAmount = carryForwardAmount + total - adjustmentAmount;
        }

        return {
            carryOver,
            paymentAmount,
            carryForwardAmount,
            adjustmentAmount,
            subtotal,
            tax,
            total,
            currentBillingAmount,
        };

    };

    const toNumber = (value) => {

        if (value === null || value === undefined || value === '') {
            return 0;
        }

        const number = Number(value);

        return Number.isFinite(number) ? number : 0;

    };

    const formatClosingDateLabel = (value) => {

        const text = String(value ?? '').trim();

        if (!text) {
            return '';
        }

        if (/^\d{4}-\d{2}-\d{2}/.test(text) || /^\d{4}\/\d{2}\/\d{2}/.test(text)) {
            return Format.formatDate(text.slice(0, 10));
        }

        return text;

    };

    const buildBillingMetaBarHtml = (header) => {

        const closingDate = formatClosingDateLabel(header.closing_date);
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

    const buildAmountOverviewHtml = (summary, layout = {}) => {

        const showCarryOver = layout.carryOverMode !== 'none'
            && layout.recipientMode !== 'general';

        const amounts = resolveSummaryAmounts(summary, {
            includeCarryForwardInCurrentBilling: showCarryOver,
        });

        if (showCarryOver) {

            const carryCell = (label, value, modifier = '') => `
                <td class="invoice-carry-cell${modifier}">
                    <div class="invoice-carry-cell__label">${esc(label)}</div>
                    <div class="invoice-carry-cell__value">${esc(Format.formatMoney(value))}</div>
                </td>`;

            return `

<div class="invoice-amount-overview">
    <table class="invoice-summary invoice-summary--overview invoice-summary--overview-carry-combined">
        <tbody>
            <tr>
                ${carryCell('前回御請求額', amounts.carryOver)}
                ${carryCell('御入金額', amounts.paymentAmount)}
                ${carryCell('繰越額', amounts.carryForwardAmount)}
                ${carryCell('調整額', amounts.adjustmentAmount)}
            </tr>
            <tr>
                ${carryCell('当月小計', amounts.subtotal)}
                ${carryCell('消費税', amounts.tax)}
                ${carryCell('税込金額', amounts.total)}
                ${carryCell('今回御請求額', amounts.currentBillingAmount, ' invoice-carry-cell--current')}
            </tr>
        </tbody>
    </table>
</div>`;

        }

        return `

<div class="invoice-amount-overview invoice-amount-overview--no-carry">
    <table class="invoice-summary invoice-summary--overview">
        <thead>
            <tr>
                <th>小計</th>
                <th>消費税</th>
                <th>税込合計</th>
                <th class="invoice-amount-overview__current-head">今回ご請求金額</th>
            </tr>
        </thead>
        <tbody>
            <tr>
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

    const usesCarryOverLayout = (layout = {}) => (
        layout.carryOverMode !== 'none'
        && layout.recipientMode !== 'general'
    );

    const estimateHeaderDetailReduction = (header = {}) => {

        const address = String(header.customer_address ?? '').trim();
        const name = String(header.customer_name ?? '').trim();
        let reduction = 0;

        if (address.length > 42) {
            reduction += 1;
        }

        if (address.length > 84) {
            reduction += 1;
        }

        if (name.length > 28) {
            reduction += 1;
        }

        return reduction;

    };

    const resolveFirstPageDetailCapacity = (layout, header) => {

        const isGeneral = layout.recipientMode === 'general';
        let capacity = isGeneral
            ? DETAILS_PER_PAGE_FIRST_GENERAL
            : (usesCarryOverLayout(layout)
                ? DETAILS_PER_PAGE_FIRST_CARRY
                : DETAILS_PER_PAGE_FIRST);

        if (!isGeneral) {
            capacity -= estimateHeaderDetailReduction(header);

            const customerCode = String(header?.customer_code ?? '').trim().toUpperCase();
            const customerReduction = FIRST_PAGE_DETAIL_CUSTOMER_REDUCTION[customerCode] ?? 0;

            capacity -= customerReduction;
        }

        const minCapacity = isGeneral
            ? DETAILS_PER_PAGE_FIRST_MIN_GENERAL
            : DETAILS_PER_PAGE_FIRST_MIN;

        return Math.max(minCapacity, capacity);

    };

    const estimateTextLines = (value, charsPerLine) => {

        const text = String(value ?? '').trim();

        if (!text) {
            return 1;
        }

        const perLine = Math.max(1, charsPerLine);

        return Math.max(1, Math.ceil(text.length / perLine));

    };

    /**
     * 明細1件が占めるスロット数を見積もる。
     * 長い文字は折り返しで行高が増えるため、空白行スロットを減らしてページに収める。
     */
    const estimateDetailSlotUnits = (detail, isGeneral = false) => {

        if (!detail) {
            return 1;
        }

        if (isGeneral) {
            const lines = Math.max(
                estimateTextLines(detail.client_name ?? detail.general_client_name, WRAP_CHARS.generalClientName),
                estimateTextLines(detail.item_name, WRAP_CHARS.generalItemName),
                estimateTextLines(detail.slip_no, WRAP_CHARS.slipNo),
                1
            );

            return Math.min(3, lines);
        }

        const lines = Math.max(
            estimateTextLines(detail.client_name, WRAP_CHARS.clientName),
            estimateTextLines(detail.item_name, WRAP_CHARS.itemName),
            estimateTextLines(detail.slip_no, WRAP_CHARS.slipNo),
            1
        );

        return Math.min(3, lines);

    };

    const annotateDetailSlotUnits = (details, isGeneral) => (
        (Array.isArray(details) ? details : []).map((detail) => {

            if (!detail) {
                return detail;
            }

            const units = estimateDetailSlotUnits(detail, isGeneral);

            return {
                ...detail,
                _slotUnits: units,
            };

        })
    );

    const padPageWithSlotBudget = (pageDetails, capacity) => {

        const used = pageDetails.reduce((sum, detail) => {

            if (!detail) {
                return sum + 1;
            }

            return sum + Math.max(1, Number(detail._slotUnits) || 1);

        }, 0);
        const remaining = Math.max(0, capacity - used);
        const padded = pageDetails.slice();

        for (let index = 0; index < remaining; index += 1) {
            padded.push(Core.Report.EMPTY_DETAIL);
        }

        return padded;

    };

    /**
     * スロット予算ベースで改ページする。
     * - 明細1件は分割しない
     * - 長い明細は複数スロット消費 → その分空白行を減らす
     * - 空白行は同一ページ内の余りスロットを埋めるだけ（空白ページは作らない）
     */
    const buildInvoiceDetailPages = (details, layout = {}, header = {}) => {

        const isGeneral = layout.recipientMode === 'general';
        const firstPageSize = resolveFirstPageDetailCapacity(layout, header);
        const nextPageSize = isGeneral
            ? DETAILS_PER_PAGE_NEXT_GENERAL
            : DETAILS_PER_PAGE_NEXT;
        const annotated = annotateDetailSlotUnits(details, isGeneral);
        const pages = [];

        if (annotated.length === 0) {
            pages.push(padPageWithSlotBudget([], firstPageSize));
            return pages;
        }

        let page = [];
        let used = 0;
        let capacity = firstPageSize;

        annotated.forEach((detail) => {

            const units = Math.max(1, Number(detail._slotUnits) || 1);

            if (page.length > 0 && used + units > capacity) {
                pages.push(padPageWithSlotBudget(page, capacity));
                page = [];
                used = 0;
                capacity = nextPageSize;
            }

            page.push(detail);
            used += units;

        });

        if (page.length > 0 || pages.length === 0) {
            pages.push(padPageWithSlotBudget(page, capacity));
        }

        return pages;

    };

    const buildPageHtml = (header, pageDetails, summary, layout, options = {}, config = {}) => {

        const {
            pageNumber = 1,
            totalPages = 1,
        } = options;

        const windowAddressHtml = '';
        const isPage1 = pageNumber === 1;
        const detailOptions = {
            general: layout.recipientMode === 'general',
        };

        return `
    ${windowAddressHtml}
    ${buildHeaderHtml(header, layout, { pageNumber, totalPages }, config)}
    ${isPage1 ? buildBillingMetaBarHtml(header) : ''}
    ${isPage1 ? buildAmountOverviewHtml(summary, layout) : ''}
    ${buildDetailTableHtml(pageDetails, detailOptions)}
    ${isPage1 ? buildPage1FooterHtml(summary) : ''}
    ${buildPageNoHtml(pageNumber, totalPages)}`;

    };

    const InvoiceTemplate = TemplateInterface.create('InvoiceTemplate', (data, config = {}, layout = {}) => {

        console.info(`[AYANAS Print V3] invoice template v${INVOICE_TEMPLATE_VERSION}`);

        if (typeof Format === 'undefined') {
            throw new Error('Format モジュールが読み込まれていません。');
        }

        Validation.assertDetailReportData(data);

        const { header, summary } = data;
        const details = Core.Report.annotateManageNoVisibility(data.details);
        const detailPages = buildInvoiceDetailPages(details, layout, header);
        const totalPages = detailPages.length;
        const carryFirstPage = usesCarryOverLayout(layout);
        const pagesHtml = detailPages.map((pageDetails, index) => {
            const pageClasses = ['page'];
            const isLast = index === totalPages - 1;

            if (index === 0) {
                pageClasses.push('page--invoice-first');

                if (carryFirstPage) {
                    pageClasses.push('page--invoice-carry-first');
                }
            }

            if (isLast) {
                pageClasses.push('page--invoice-last');
            }

            return `<div class="${pageClasses.join(' ')}">${buildPageHtml(
                header,
                pageDetails,
                summary,
                layout,
                {
                    pageNumber: index + 1,
                    totalPages,
                },
                config
            )}
</div>`;
        }).join('\n');

        return Common.buildDocumentHtml({
            title: '請求書',
            bodyClass: Common.getBodyClass(layout),
            content: pagesHtml,
            multiPage: true,
        });

    });

    window.InvoiceTemplate = InvoiceTemplate;

})();
