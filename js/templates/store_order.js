(() => {
    'use strict';

    /**
     * 店舗受注表（A550専用）— A4縦・1点1枚・上下2段（作業指示＋切り取り完了登録票）
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

    const primaryItemName = (details) => {
        const rows = Array.isArray(details) ? details : [];
        const names = [];
        rows.forEach((detail) => {
            const name = String(detail && detail.item_name != null ? detail.item_name : '').trim();
            if (name && names.indexOf(name) === -1) {
                names.push(name);
            }
        });
        return names.join(' / ');
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

    const buildWorkChecksHtml = () => (
        '<div class="store-order-checks">'
        + '<span>□ 下洗い済み</span>'
        + '<span>□ しみ抜き済み</span>'
        + '<span>□ 修理済み</span>'
        + '</div>'
    );

    const buildBarcodeHtml = (manageNo, extraClass) => (
        '<div class="store-order-barcode'
        + (extraClass ? ' ' + extraClass : '')
        + '">'
        + '<svg class="barcode store-order-barcode__svg" data-barcode-value="'
        + esc(manageNo)
        + '"></svg>'
        + '<p class="store-order-barcode__value">'
        + esc(manageNo)
        + '</p>'
        + '</div>'
    );

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
        const kimonoType = String(header.kimono_type || '').trim();
        const kimonoSpec = String(header.kimono_spec || '').trim();
        const itemName = primaryItemName(details);
        const paymentState = String(header.payment_state || '—');

        const content = `
<div class="page store-order-page">
  <section class="store-order-upper">
    <header class="store-order-header">
      <div class="store-order-header__left">
        <p class="store-order-eyebrow">A550 店舗</p>
        <h1 class="store-order-title">店舗受注表</h1>
        <p class="store-order-manage">管理番号：<strong>${esc(manageNo)}</strong></p>
      </div>
      <div class="store-order-header__right">
        ${buildBarcodeHtml(manageNo, 'store-order-barcode--upper')}
      </div>
    </header>

    <section class="store-order-section store-order-section--compact">
      <h2 class="store-order-section__title">作業指示・現物管理</h2>
      <dl class="store-order-dl">
        <div><dt>お客様氏名</dt><dd>${esc(clientName || '—')} 様</dd></div>
        <div><dt>商品名</dt><dd>${esc(itemName || '—')}</dd></div>
        <div><dt>着物種類名</dt><dd>${esc(kimonoType || '—')}</dd></div>
        <div><dt>着物仕様</dt><dd>${esc(kimonoSpec || '—')}</dd></div>
        <div><dt>受注日</dt><dd>${esc(Format.formatDate(header.order_date))}</dd></div>
        <div><dt>納期</dt><dd>${esc(Format.formatDate(header.deadline))}</dd></div>
      </dl>
    </section>

    <section class="store-order-section store-order-section--compact">
      <h2 class="store-order-section__title">加工内容</h2>
      ${buildProcessingHtml(details)}
    </section>

    <section class="store-order-section store-order-section--payment store-order-section--compact">
      <h2 class="store-order-section__title">金額・入金（App97・印刷時点）</h2>
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

    <div class="store-order-work-checks">
      <p class="store-order-work-checks__label">作業チェック</p>
      ${buildWorkChecksHtml()}
    </div>
  </section>

  <div class="store-order-cut" aria-hidden="true">
    <span class="store-order-cut__label">✂ ここから下を切り取り（仕上げ完了登録票）</span>
  </div>

  <section class="store-order-lower">
    <header class="store-order-lower__header">
      <div class="store-order-lower__titles">
        <h2 class="store-order-lower__title">仕上げ完了登録票</h2>
        <p class="store-order-manage">管理番号：<strong>${esc(manageNo)}</strong></p>
        <p class="store-order-lower__hint">切り取って App30 完了登録で連続読取</p>
      </div>
      ${buildBarcodeHtml(manageNo, 'store-order-barcode--lower')}
    </header>
    <dl class="store-order-dl store-order-dl--ticket">
      <div><dt>お客様氏名</dt><dd>${esc(clientName || '—')} 様</dd></div>
      <div><dt>商品名</dt><dd>${esc(itemName || '—')}</dd></div>
      <div><dt>着物種類名</dt><dd>${esc(kimonoType || '—')}</dd></div>
    </dl>
    ${buildWorkChecksHtml()}
  </section>
</div>`;

        return Common.buildDocumentHtml({
            title: '店舗受注表',
            bodyClass: Common.getBodyClass(layout),
            content: content,
        });
    });

    window.StoreOrderTemplate = StoreOrderTemplate;

})();
