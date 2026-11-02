(() => {
    'use strict';

    /**
     * 店舗受注表（A550専用）— A4縦・単票・1レコード1枚
     */

    const esc = (value) => Format.escapeHtml(value);

    const money = (value) => {
        if (typeof Format.formatMoney === 'function') {
            return Format.formatMoney(value);
        }
        return String(value ?? '');
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

    const buildProcessingHtml = (details) => {
        const rows = Array.isArray(details) ? details : [];
        if (!rows.length) {
            return '<p class="store-order-empty">加工内容なし</p>';
        }
        return (
            '<ul class="store-order-processing">'
            + rows.map((detail) => {
                const name = String(detail.item_name ?? '').trim();
                const amount = detail.amount;
                return (
                    '<li><span class="store-order-processing__name">'
                    + esc(name)
                    + '</span><span class="store-order-processing__amount">'
                    + esc(money(amount))
                    + '</span></li>'
                );
            }).join('')
            + '</ul>'
        );
    };

    const StoreOrderTemplate = TemplateInterface.create('StoreOrderTemplate', (data, config = {}, layout = {}) => {
        void config;
        void layout;

        if (typeof Format === 'undefined') {
            throw new Error('Format モジュールが読み込まれていません。');
        }

        Validation.assertDetailReportData(data);

        const header = data.header || {};
        const details = data.details || [];
        const manageNo = String(header.manage_no ?? '').trim();
        const clientName = String(header.pcm_customer_name || header.client_name || '').trim();
        const paymentState = String(header.payment_state || '—');

        const content = `
<div class="page store-order-page">
  <header class="store-order-header">
    <div class="store-order-header__left">
      <p class="store-order-eyebrow">A550 店舗</p>
      <h1 class="store-order-title">店舗受注表</h1>
      <p class="store-order-manage">管理番号：<strong>${esc(manageNo)}</strong></p>
    </div>
    <div class="store-order-header__right">
      <div class="store-order-barcode">
        <svg class="barcode"></svg>
        <p class="store-order-barcode__value">${esc(manageNo)}</p>
      </div>
    </div>
  </header>

  <section class="store-order-section">
    <h2 class="store-order-section__title">お客様</h2>
    <dl class="store-order-dl">
      <div><dt>お名前</dt><dd>${esc(clientName || '—')} 様</dd></div>
      <div><dt>PCM</dt><dd>${esc(header.personal_customer_id || '—')}</dd></div>
      <div><dt>電話</dt><dd>${esc(header.pcm_phone || '—')}</dd></div>
      <div><dt>顧客コード</dt><dd>${esc(header.customer_code || 'A550')}</dd></div>
    </dl>
  </section>

  <section class="store-order-section">
    <h2 class="store-order-section__title">商品・納期</h2>
    <dl class="store-order-dl">
      <div><dt>着物種類</dt><dd>${esc(header.kimono_type || '—')}</dd></div>
      <div><dt>仕様</dt><dd>${esc(header.kimono_spec || '—')}</dd></div>
      <div><dt>納期</dt><dd>${esc(Format.formatDate(header.deadline))}</dd></div>
      <div><dt>受注日</dt><dd>${esc(Format.formatDate(header.order_date))}</dd></div>
    </dl>
  </section>

  <section class="store-order-section">
    <h2 class="store-order-section__title">加工内容</h2>
    ${buildProcessingHtml(details)}
  </section>

  <section class="store-order-section store-order-section--payment">
    <h2 class="store-order-section__title">入金状況（App97・印刷時点）</h2>
    <p class="store-order-payment-state ${paymentClass(paymentState)}">${esc(paymentState)}</p>
    <table class="store-order-payment-table">
      <thead>
        <tr><th>税抜</th><th>税</th><th>税込</th><th>入金額</th><th>残額</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>${esc(money(header.payment_exclusive))}</td>
          <td>${esc(money(header.payment_tax))}</td>
          <td>${esc(money(header.payment_billed_inclusive))}</td>
          <td>${esc(money(header.payment_paid))}</td>
          <td>${esc(money(header.payment_balance))}</td>
        </tr>
      </tbody>
    </table>
    ${header.payment_note ? `<p class="store-order-note">${esc(header.payment_note)}</p>` : ''}
  </section>

  <footer class="store-order-footer">
    <p>作業・保管・引き取り管理用（印刷のみ・状態は更新しません）</p>
    <div class="store-order-checks">
      <span>□ 受付</span><span>□ 作業中</span><span>□ 店舗保管</span><span>□ 引取済</span>
    </div>
  </footer>
</div>`;

        return Common.buildDocumentHtml({
            title: '店舗受注表',
            bodyClass: Common.getBodyClass(layout),
            content: content,
        });
    });

    window.StoreOrderTemplate = StoreOrderTemplate;

})();
