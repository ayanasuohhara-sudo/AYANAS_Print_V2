(() => {
    'use strict';

    /**
     * 店舗受注表（A550専用）
     * 構成は受注明細表（order_detail）と同じ A4横・左右2面。
     * 追加: 作業チェック3項目、入金状態（入金済／未入金）。
     */

    const STORE_ORDER_TEMPLATE_VERSION = '147';

    const esc = (value) => Format.escapeHtml(value);

    const money = (value) => {
        if (typeof Format.formatMoney === 'function') {
            return Format.formatMoney(value);
        }
        return String(value ?? '');
    };

    /** 表示用は入金済 / 未入金のみ（一部入金は未入金扱い） */
    const toBinaryPaymentState = (state, balance) => {
        const s = String(state ?? '').trim();
        if (s === '入金済') {
            return '入金済';
        }
        if (s === '未入金' || s === '一部入金') {
            return '未入金';
        }
        const bal = Number(balance);
        if (Number.isFinite(bal) && bal <= 0.0001 && s !== '') {
            return '入金済';
        }
        return '未入金';
    };

    const paymentClass = (state) => {
        if (state === '入金済') {
            return 'is-paid';
        }
        if (state === '未入金') {
            return 'is-unpaid';
        }
        return 'is-unknown';
    };

    const normalizeHeaderForOrderDetail = (header) => {
        const h = Object.assign({}, header || {});
        const pcmName = String(h.pcm_customer_name || h.client_name || '').trim();
        if (pcmName) {
            h.client_name = pcmName;
            if (!String(h.customer_name || '').trim()) {
                h.customer_name = pcmName;
            }
        }
        if (!String(h.customer_code || '').trim() && h.personal_customer_id) {
            h.customer_code = String(h.personal_customer_id).trim();
        }
        return h;
    };

    const normalizeDetailsForOrderDetail = (details) => {
        const rows = Array.isArray(details) ? details : [];
        return rows.map((detail) => {
            const row = Object.assign({}, detail || {});
            if (
                (row.unit_price === null || row.unit_price === undefined || row.unit_price === '')
                && row.amount !== null
                && row.amount !== undefined
                && row.amount !== ''
            ) {
                row.unit_price = row.amount;
            }
            return row;
        });
    };

    const buildWorkChecksHtml = () => (
        '<div class="store-order-checks">'
        + '<p class="store-order-checks__label">作業チェック</p>'
        + '<div class="store-order-checks__items">'
        + '<span>□ 下洗い済み</span>'
        + '<span>□ しみ抜き済み</span>'
        + '<span>□ 修理済み</span>'
        + '</div>'
        + '</div>'
    );

    const buildPaymentBlockHtml = (header, paymentState) => (
        '<div class="store-order-payment">'
        + '<div class="store-order-payment__head">'
        + '<span class="store-order-payment__label">入金状態</span>'
        + `<span class="store-order-payment__state ${paymentClass(paymentState)}">${esc(paymentState)}</span>`
        + '</div>'
        + '<table class="store-order-payment-table">'
        + '<thead><tr><th>税抜</th><th>税</th><th>税込</th><th>入金額</th><th>残額</th></tr></thead>'
        + '<tbody><tr>'
        + `<td>${esc(money(header.payment_exclusive))}</td>`
        + `<td>${esc(money(header.payment_tax))}</td>`
        + `<td>${esc(money(header.payment_billed_inclusive))}</td>`
        + `<td>${esc(money(header.payment_paid))}</td>`
        + `<td>${esc(money(header.payment_balance))}</td>`
        + '</tr></tbody></table>'
        + (header.payment_note
            ? `<p class="store-order-note">${esc(header.payment_note)}</p>`
            : '')
        + '</div>'
    );

    const buildStoreSheetHtml = (header, details, manageNo, side, paymentState) => {
        const isLeft = side === 'left';
        const sleeveTagHtml = isLeft
            ? OrderDetailShared.buildSleeveTagTableHtml(header)
            : '';
        const leftBottomHtml = isLeft
            ? OrderDetailShared.buildLeftBottomBlockHtml(header, manageNo)
            : '';

        return `
<div class="order-detail-sheet order-detail-sheet--${esc(side)} store-order-sheet">
    <h1 class="order-detail-title">店舗受注表</h1>
    ${OrderDetailShared.buildTableHtml(header, details)}
    ${buildPaymentBlockHtml(header, paymentState)}
    ${buildWorkChecksHtml()}
    ${OrderDetailShared.buildBarcodeHtml(manageNo, side)}
    ${sleeveTagHtml}
    ${leftBottomHtml}
</div>`;
    };

    const StoreOrderTemplate = TemplateInterface.create('StoreOrderTemplate', (data, config = {}, layout = {}) => {
        void config;

        console.info(`[AYANAS Print] store order template v${STORE_ORDER_TEMPLATE_VERSION}`);

        if (typeof Format === 'undefined') {
            throw new Error('Format モジュールが読み込まれていません。');
        }

        if (typeof OrderDetailShared === 'undefined') {
            throw new Error('OrderDetailShared モジュールが読み込まれていません。');
        }

        Validation.assertDetailReportData(data);

        const header = normalizeHeaderForOrderDetail(data.header || {});
        const details = normalizeDetailsForOrderDetail(data.details || []);
        const manageNo = String(header.manage_no ?? '').trim();
        const paymentState = toBinaryPaymentState(header.payment_state, header.payment_balance);

        return Common.buildDocumentHtml({
            title: '店舗受注表',
            bodyClass: Common.getBodyClass(layout),
            content: `
<div class="order-detail-page store-order-page">
    ${buildStoreSheetHtml(header, details, manageNo, 'left', paymentState)}
    ${buildStoreSheetHtml(header, details, manageNo, 'right', paymentState)}
</div>`,
        });
    });

    window.StoreOrderTemplate = StoreOrderTemplate;

})();
