(() => {
    'use strict';

    /**
     * 店舗納品書（A550専用）— A4縦・複数点まとめ・改ページ対応
     */

    const DETAILS_PER_PAGE = 12;

    const esc = (value) => Format.escapeHtml(value);

    const money = (value) => {
        if (typeof Format.formatMoney === 'function') {
            return Format.formatMoney(value);
        }
        return String(value ?? '');
    };

    const toSafeNumber = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    };

    const paymentClass = (state) => {
        const s = String(state ?? '');
        if (s === '入金済') {
            return 'is-paid';
        }
        if (s === '一部入金') {
            return 'is-partial';
        }
        if (s === '未入金') {
            return 'is-unpaid';
        }
        return 'is-unknown';
    };

    const formatCustomer = (header) => {
        const name = String(
            header.pcm_customer_name
            || header.general_client_name
            || header.customer_name
            || ''
        ).trim();
        return name ? `${name} 様` : '—';
    };

    const buildHeaderHtml = (header, pageNumber, totalPages) => `
<header class="store-delivery-header">
  <div class="store-delivery-header__left">
    <p class="store-delivery-eyebrow">A550 店舗</p>
    <h1 class="store-delivery-title">納 品 書</h1>
    <p class="store-delivery-customer">${esc(formatCustomer(header))}</p>
    <p class="store-delivery-pcm">PCM：${esc(header.personal_customer_id || '—')}</p>
  </div>
  <div class="store-delivery-header__right">
    <p>納品番号：${esc(header.delivery_no || '—')}</p>
    <p>納品日：${esc(Format.formatDate(header.delivery_date))}</p>
    <p class="store-delivery-page">${pageNumber} / ${totalPages}</p>
  </div>
</header>`;

    const buildDetailRowHtml = (detail) => {
        if (!detail) {
            return '<tr class="store-delivery-row store-delivery-row--empty"><td colspan="6"></td></tr>';
        }
        const state = detail.payment_state || '—';
        return (
            '<tr class="store-delivery-row">'
            + `<td>${esc(detail._showManageNo ? detail.manage_no : '')}</td>`
            + `<td>${esc(detail.kimono_type || '')}<br><span class="store-delivery-sub">${esc(detail.kimono_spec || '')}</span></td>`
            + `<td>${esc(detail.item_name || '')}</td>`
            + `<td class="num">${esc(money(detail.amount))}</td>`
            + `<td class="store-delivery-pay ${paymentClass(state)}">${esc(state)}</td>`
            + `<td class="num">${esc(money(detail.payment_balance))}</td>`
            + '</tr>'
        );
    };

    const buildTableHtml = (details) => `
<table class="store-delivery-table">
  <thead>
    <tr>
      <th>管理番号</th>
      <th>商品</th>
      <th>加工内容</th>
      <th>金額</th>
      <th>入金状態</th>
      <th>残額</th>
    </tr>
  </thead>
  <tbody>
    ${details.map((d) => buildDetailRowHtml(d)).join('')}
  </tbody>
</table>`;

    const buildSummaryHtml = (summary, header) => {
        const billed = summary.billedInclusive ?? 0;
        const paid = summary.paid ?? 0;
        const balance = summary.balance ?? 0;
        const exclusive = summary.exclusive ?? summary.totalAmount ?? 0;
        const tax = summary.tax ?? Math.round(toSafeNumber(exclusive) * 0.1);
        const state = summary.payment_state || header.payment_state || '—';

        return `
<footer class="store-delivery-footer">
  <table class="store-delivery-summary">
    <thead>
      <tr>
        <th>点数</th>
        <th>税抜合計</th>
        <th>税</th>
        <th>税込合計</th>
        <th>入金額</th>
        <th>未入金残</th>
        <th>状態</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${esc(String(summary.totalCount ?? summary.count ?? 0))}</td>
        <td>${esc(money(exclusive))}</td>
        <td>${esc(money(tax))}</td>
        <td>${esc(money(billed))}</td>
        <td>${esc(money(paid))}</td>
        <td>${esc(money(balance))}</td>
        <td class="${paymentClass(state)}">${esc(state)}</td>
      </tr>
    </tbody>
  </table>
  ${header.payment_note ? `<p class="store-delivery-note">${esc(header.payment_note)}</p>` : ''}
  <p class="store-delivery-note">本紙に含まれない商品の納品状態は変更していません。印刷のみでは App16 を更新しません。</p>
</footer>`;
    };

    const StoreDeliveryTemplate = TemplateInterface.create('StoreDeliveryTemplate', (data, config = {}, layout = {}) => {
        void config;

        if (typeof Format === 'undefined') {
            throw new Error('Format モジュールが読み込まれていません。');
        }

        Validation.assertDetailReportData(data);

        const header = data.header || {};
        const summary = data.summary || {};
        const details = Core.Report.annotateManageNoVisibility(data.details || []);
        const pages = Core.Report.buildDetailPages(details, DETAILS_PER_PAGE);
        const totalPages = pages.length;

        const pagesHtml = pages.map((pageDetails, index) => {
            const isLast = index === totalPages - 1;
            return (
                `<div class="page store-delivery-page">`
                + buildHeaderHtml(header, index + 1, totalPages)
                + buildTableHtml(pageDetails)
                + (isLast ? buildSummaryHtml(summary, header) : '')
                + `</div>`
            );
        }).join('\n');

        return Common.buildDocumentHtml({
            title: '店舗納品書',
            bodyClass: Common.getBodyClass(layout),
            content: pagesHtml,
            multiPage: true,
        });
    });

    window.StoreDeliveryTemplate = StoreDeliveryTemplate;
    window.CAYANAS_StoreDeliveryTemplateMeta = {
        DETAILS_PER_PAGE: DETAILS_PER_PAGE,
    };

})();
