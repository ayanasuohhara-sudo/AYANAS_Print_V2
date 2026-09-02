(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * templates/matsuba_summary_invoice.js
     *
     * 株式会社松葉向け「合計請求書」の HTML 生成。
     * 顧客コード単位の集計表。印刷専用（レコード更新なし）。
     */

    const DEFAULT_COMPANY = {
        name: '株式会社ayanasu',
        postalCode: '〒631-0078',
        address: '奈良県奈良市富雄元町1-13-41',
        tel: 'TEL 0742-47-8390',
        fax: 'FAX 0742-47-8391',
        invoiceRegistrationNo: 'T7150001017765',
    };

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
            invoiceRegistrationNo: source.invoiceRegistrationNo ?? DEFAULT_COMPANY.invoiceRegistrationNo,
            sealImageUrl: resolveSealImageUrl(source.sealImage, config),
            sealOpacity: Number(source.sealOpacity ?? 0.65),
        };

    };

    const formatYen = (value) => `${Format.formatMoney(value)}円`;

    const formatBillingPeriodLabel = (header) => {

        const from = String(header.billing_from ?? '').trim();
        const to = String(header.billing_to ?? '').trim();

        if (from && to) {
            return `${Format.formatDate(from)} ～ ${Format.formatDate(to)}`;
        }

        return '';

    };

    const buildCompanyHtml = (company) => {

        const registrationNo = String(company.invoiceRegistrationNo ?? '').trim();
        const sealImageUrl = String(company.sealImageUrl ?? '').trim();
        const sealOpacity = Number.isFinite(company.sealOpacity) ? company.sealOpacity : 0.65;
        const sealHtml = sealImageUrl
            ? `<img class="matsuba-summary__company-seal" src="${esc(sealImageUrl)}" alt="" style="opacity:${sealOpacity}">`
            : '';

        return `
            <div class="matsuba-summary__company">
                ${sealHtml}
                <p class="matsuba-summary__company-name">${esc(company.name)}</p>
                ${registrationNo ? `<p class="matsuba-summary__company-reg">登録番号 ${esc(registrationNo)}</p>` : ''}
                <p class="matsuba-summary__company-line">${esc(company.postalCode)}</p>
                <p class="matsuba-summary__company-line">${esc(company.address)}</p>
                <p class="matsuba-summary__company-line">${esc(company.tel)}</p>
                <p class="matsuba-summary__company-line">${esc(company.fax)}</p>
            </div>`;

    };

    const buildDetailRowsHtml = (details) => (Array.isArray(details) ? details : []).map((row) => `
                <tr>
                    <td class="matsuba-summary__col-code">${esc(row.customer_code)}</td>
                    <td class="matsuba-summary__col-name">${esc(row.customer_name)}</td>
                    <td class="num matsuba-summary__col-amount">${esc(formatYen(row.subtotal))}</td>
                    <td class="num matsuba-summary__col-amount">${esc(formatYen(row.tax))}</td>
                    <td class="num matsuba-summary__col-amount">${esc(formatYen(row.total))}</td>
                </tr>`).join('');

    const buildTableHtml = (details) => `
        <table class="matsuba-summary__table">
            <thead>
                <tr>
                    <th>顧客コード</th>
                    <th>顧客名</th>
                    <th>小計</th>
                    <th>消費税</th>
                    <th>税込合計</th>
                </tr>
            </thead>
            <tbody>
                ${buildDetailRowsHtml(details)}
            </tbody>
        </table>`;

    const buildTotalsHtml = (summary) => `
        <table class="matsuba-summary__totals">
            <tbody>
                <tr>
                    <th>小計合計</th>
                    <td class="num">${esc(formatYen(summary.subtotal))}</td>
                </tr>
                <tr>
                    <th>消費税10%</th>
                    <td class="num">${esc(formatYen(summary.tax))}</td>
                </tr>
                <tr class="matsuba-summary__totals-grand">
                    <th>税込合計</th>
                    <td class="num">${esc(formatYen(summary.total))}</td>
                </tr>
            </tbody>
        </table>`;

    const MatsubaSummaryInvoiceTemplate = TemplateInterface.create(
        'MatsubaSummaryInvoiceTemplate',
        (data, config = {}, layout = {}) => {

            if (typeof Format === 'undefined') {
                throw new Error('Format モジュールが読み込まれていません。');
            }

            Validation.assertDetailReportData(data);

            const { header, details, summary } = data;
            const company = getCompanyInfo(layout, config);
            const periodLabel = formatBillingPeriodLabel(header);
            const addressee = String(header.addressee ?? '').trim();

            const content = `
<header class="matsuba-summary__header">
    <div class="matsuba-summary__header-left">
        <p class="matsuba-summary__addressee">${esc(addressee)}</p>
        ${periodLabel ? `<p class="matsuba-summary__period">請求対象期間：${esc(periodLabel)}</p>` : ''}
    </div>
    <div class="matsuba-summary__header-right">
        <h1 class="matsuba-summary__title">合計請求書</h1>
        ${buildCompanyHtml(company)}
    </div>
</header>
${buildTableHtml(details)}
${buildTotalsHtml(summary)}`;

            return Common.buildDocumentHtml({
                title: '合計請求書',
                bodyClass: Common.getBodyClass(layout),
                content,
                multiPage: false,
            });

        }
    );

    window.MatsubaSummaryInvoiceTemplate = MatsubaSummaryInvoiceTemplate;

})();
