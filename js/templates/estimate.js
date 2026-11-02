(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * templates/estimate.js
     *
     * 見積書・インボイス・外注伝票・加工依頼書（将来）のスタブ。
     * manifest 非登録。layout.js から動的読込。
     */

    const createStub = (name, label) => TemplateInterface.create(name, () => {
        throw new Error(`${label}テンプレートは未実装です。`);
    });

    window.EstimateTemplate = createStub('EstimateTemplate', '見積書');
    window.InvoiceExportTemplate = createStub('InvoiceExportTemplate', 'インボイス');
    window.PurchaseTemplate = createStub('PurchaseTemplate', '外注伝票');
    window.WorkOrderTemplate = createStub('WorkOrderTemplate', '加工依頼書');

    /** 和裁士支払明細書（App 75）— manifest 30件制限のため本ファイルに同梱 */
    const WASAI_PAYMENT_STATEMENT_TEMPLATE_VERSION = '1';
    const WASAI_PAYMENT_DETAILS_PER_PAGE_FIRST = 16;
    const WASAI_PAYMENT_DETAILS_PER_PAGE_NEXT = 22;

    const wpsEsc = (value) => Format.escapeHtml(value);
    const wpsMoney = (value) => wpsEsc(Format.formatMoney(value));

    const wpsFormatRateCell = (value) => {
        const text = String(value ?? '').trim();

        if (text === '') {
            return '';
        }

        const num = Number(text);

        if (!Number.isNaN(num) && num > 0 && num <= 1) {
            return wpsEsc(String(Math.round(num * 1000) / 10) + '%');
        }

        return wpsEsc(text);
    };

    const wpsBuildDetailPages = (details) => {
        const pages = [];

        if (!Array.isArray(details) || details.length === 0) {
            pages.push([]);
            return pages;
        }

        pages.push(details.slice(0, WASAI_PAYMENT_DETAILS_PER_PAGE_FIRST));

        let index = WASAI_PAYMENT_DETAILS_PER_PAGE_FIRST;

        while (index < details.length) {
            pages.push(details.slice(index, index + WASAI_PAYMENT_DETAILS_PER_PAGE_NEXT));
            index += WASAI_PAYMENT_DETAILS_PER_PAGE_NEXT;
        }

        return pages;
    };

    const WasaiPaymentStatementTemplate = TemplateInterface.create(
        'WasaiPaymentStatementTemplate',
        (data, config = {}, layout = {}) => {

            console.info(`[AYANAS Print V3] wasai payment statement v${WASAI_PAYMENT_STATEMENT_TEMPLATE_VERSION}`);

            Validation.assertDetailReportData(data);

            const { header, summary, details } = data;
            const detailPages = wpsBuildDetailPages(details);
            const totalPages = detailPages.length;
            let printedRows = 0;

            const buildWpsHeaderHtml = (pageNumber) => {
                const pageLine = `<p class="wps-page-no">${pageNumber} / ${totalPages} ページ</p>`;

                if (pageNumber === 1) {
                    return `<header class="wps-header">
  <h1 class="wps-title">和裁士支払明細書</h1>
  <div class="wps-header-grid">
    <div class="wps-header-row"><span class="wps-label">和裁士氏名</span><span class="wps-value">${wpsEsc(header.wasai_name)}</span></div>
    <div class="wps-header-row"><span class="wps-label">対象期間</span><span class="wps-value">${wpsEsc(header.period_label)}</span></div>
    <div class="wps-header-row"><span class="wps-label">支払予定日</span><span class="wps-value">${wpsEsc(Format.formatDate(header.payment_due_date))}</span></div>
    <div class="wps-header-row"><span class="wps-label">発行日</span><span class="wps-value">${wpsEsc(Format.formatDate(header.issue_date))}</span></div>
  </div>
  <p class="wps-issuer">発行者：株式会社ayanasu</p>
  ${pageLine}
</header>`;
                }

                return `<header class="wps-header wps-header--continued">
  <h1 class="wps-title wps-title--continued">和裁士支払明細書</h1>
  <div class="wps-header-grid wps-header-grid--continued">
    <div class="wps-header-row"><span class="wps-label">和裁士氏名</span><span class="wps-value">${wpsEsc(header.wasai_name)}</span></div>
    <div class="wps-header-row"><span class="wps-label">対象期間</span><span class="wps-value">${wpsEsc(header.period_label)}</span></div>
  </div>
  ${pageLine}
</header>`;
            };

            const pagesHtml = detailPages.map((pageDetails, pageIndex) => {
                const pageNumber = pageIndex + 1;
                const isLast = pageNumber === totalPages;
                const rowsHtml = pageDetails.map((detail) => {
                    printedRows += 1;

                    return `<tr>
  <td class="wps-col-no">${wpsEsc(printedRows)}</td>
  <td class="wps-col-manage">${wpsEsc(detail.manage_no)}</td>
  <td class="wps-col-date">${wpsEsc(Format.formatDate(detail.inbound_date))}</td>
  <td class="wps-col-type">${wpsEsc(detail.kimono_type)}</td>
  <td class="wps-col-spec">${wpsEsc(detail.kimono_spec)}</td>
  <td class="wps-col-process">${wpsEsc(detail.processing_summary)}</td>
  <td class="wps-col-money wps-num">${wpsMoney(detail.transaction_price)}</td>
  <td class="wps-col-rate wps-num">${wpsFormatRateCell(detail.payment_rate)}</td>
  <td class="wps-col-money wps-num">${wpsMoney(detail.line_payment_amount)}</td>
</tr>`;
                }).join('\n');

                return `<div class="page page--wasai-payment page--a4 page--portrait${isLast ? ' page--wasai-payment-last' : ''}">
${buildWpsHeaderHtml(pageNumber)}
<table class="wps-table">
<thead>
  <tr>
    <th class="wps-col-no">No</th>
    <th class="wps-col-manage">管理番号</th>
    <th class="wps-col-date">入庫日</th>
    <th class="wps-col-type">着物種類</th>
    <th class="wps-col-spec">着物仕様</th>
    <th class="wps-col-process">加工内容</th>
    <th class="wps-col-money">取引価格</th>
    <th class="wps-col-rate">支払率</th>
    <th class="wps-col-money">支払金額</th>
  </tr>
</thead>
<tbody>
${rowsHtml}
</tbody>
</table>
${isLast ? `<section class="wps-summary"><table class="wps-summary-table"><tbody>
      <tr><th>明細件数</th><td>${wpsEsc(summary.line_count)} 件</td></tr>
      <tr><th>取引価格合計</th><td class="wps-num">${wpsMoney(summary.transaction_total)}</td></tr>
      <tr><th>支払金額合計</th><td class="wps-num">${wpsMoney(summary.payment_total)}</td></tr>
    </tbody></table></section>` : ''}
</div>`;
            }).join('\n');

            return Common.buildDocumentHtml({
                title: '和裁士支払明細書',
                bodyClass: Common.getBodyClass(layout),
                content: pagesHtml,
                multiPage: true,
            });

        }
    );

    window.WasaiPaymentStatementTemplate = WasaiPaymentStatementTemplate;

})();
