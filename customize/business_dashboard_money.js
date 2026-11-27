(function () {
    'use strict';

    /**
     * 業務ダッシュボード App 82 — ④お金（売掛・入金）
     * CAYANAS_AREngine / CAYANAS_AR / PaymentCreateV2 に依存（App 22 の ar_desktop は使わない）
     */

    const state = {
        expandedCustomers: new Set(),
        expandedInvoices: new Set(),
        activeFilter: 'open',
        searchText: '',
        paymentHistoryCache: new Map(),
        paymentHistoryInflight: new Map(),
        paymentReturnReloadPending: false,
        paymentFocusBound: false,
    };

    const ui = () => CAYANAS_BUSINESS_DASHBOARD.UI;
    const arUi = () => (typeof CAYANAS_AR !== 'undefined' ? CAYANAS_AR.UI : {});

    const formatYen = (value) => Math.round(Number(value) || 0).toLocaleString('ja-JP');

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const formatDate = (ymd) => {

        const s = String(ymd ?? '').trim();

        return s === '' ? '—' : s;

    };

    const eps = () => (typeof CAYANAS_AR !== 'undefined' ? CAYANAS_AR.OPEN_EPSILON : 0.0001);

    const invoiceDetailUrl = (recordId) => {

        if (!recordId || typeof CAYANAS_AR === 'undefined') {
            return '#';
        }

        return `${location.origin}/k/${CAYANAS_AR.INVOICE_APP_ID}/show#record=${recordId}`;

    };

    const buildPaymentRegistrationUrl = (customerCode, invoiceNo) => {

        if (typeof CAYANAS_AR === 'undefined') {
            return '#';
        }

        const q = CAYANAS_AR.PAYMENT_CREATE_QUERY;
        const params = new URLSearchParams();

        params.set(q.customerCode, String(customerCode ?? '').trim());
        params.set(q.invoiceNo, String(invoiceNo ?? '').trim());

        return `${location.origin}/k/${CAYANAS_AR.PAYMENT_APP_ID}/edit?${params.toString()}`;

    };

    const arAppUrl = () => {

        if (typeof CAYANAS_AR === 'undefined') {
            return '#';
        }

        return `${location.origin}/k/${CAYANAS_AR.AR_APP_ID}/`;

    };

    const deriveInvoiceCollectionStatus = (inv) => {

        const open = Number(inv.open) || 0;
        const settled = Number(inv.settled) || 0;

        if (open <= eps()) {
            return '入金済';
        }

        if (settled <= eps()) {
            return '未入金';
        }

        return '一部入金';

    };

    const openInvoicesForBreakdown = (customer) => (
        (customer.invoices || []).filter((inv) => inv.isOpen)
    );

    const invoiceHistoryKey = (customerCode, invoiceNo) => (
        `${String(customerCode ?? '').trim()}|${String(invoiceNo ?? '').trim()}`
    );

    const matchesFilter = (customer) => {

        const hasOverdue = (minDays) => (
            customer.openBalanceTotal > eps()
            && customer.invoices.some((inv) => inv.overdueDays >= minDays)
        );

        if (state.activeFilter === '30' && !hasOverdue(30)) {
            return false;
        }

        if (state.activeFilter === '60' && !hasOverdue(60)) {
            return false;
        }

        if (state.activeFilter === '90' && !hasOverdue(90)) {
            return false;
        }

        if (state.activeFilter === 'open' && customer.openBalanceTotal <= eps()) {
            return false;
        }

        const q = state.searchText.trim().toLowerCase();

        if (!q) {
            return true;
        }

        const code = String(customer.customerCode ?? '').toLowerCase();
        const name = String(customer.customerName ?? '').toLowerCase();

        return code.includes(q) || name.includes(q);

    };

    const renderPaymentHistoryContent = (cacheKey, inv) => {

        const u = arUi();
        const entry = state.paymentHistoryCache.get(cacheKey);

        if (!entry || entry.status === 'loading') {
            return `<p class="ayanas-bd-money-history__msg">${escapeHtml(u.paymentHistoryLoading || '読込中…')}</p>`;
        }

        if (entry.status === 'error') {
            return `<p class="ayanas-bd-money-history__msg ayanas-bd-money-history__msg--err">${escapeHtml(u.paymentHistoryError || '取得失敗')}</p>`;
        }

        if (!entry.rows || entry.rows.length === 0) {
            return `<p class="ayanas-bd-money-history__msg">${escapeHtml(u.paymentHistoryEmpty || '履歴なし')}</p>`;
        }

        const body = entry.rows.map((row) => `
<tr>
  <td>${formatDate(row.paymentDate)}</td>
  <td class="num">${formatYen(row.cash)}</td>
  <td class="num">${formatYen(row.fee)}</td>
  <td class="num">${formatYen(row.discount)}</td>
  <td class="num">${formatYen(row.writeoff)}</td>
  <td>${escapeHtml(row.paymentMethod || '—')}</td>
</tr>`).join('');

        const mismatch = inv && entry.consistent === false
            ? `<p class="ayanas-bd-money-history__warn">${escapeHtml(u.paymentHistoryMismatch || '')}</p>`
            : '';

        return `
${mismatch}
<table class="ayanas-bd-table ayanas-bd-table--nested">
  <thead>
    <tr>
      <th>入金日</th>
      <th>入金額</th>
      <th>手数料</th>
      <th>値引</th>
      <th>消込額</th>
      <th>入金方法</th>
    </tr>
  </thead>
  <tbody>${body}</tbody>
</table>`;

    };

    const renderInvoiceBreakdownBlock = (customer) => {

        const openList = openInvoicesForBreakdown(customer);
        const customerCode = customer.customerCode;
        const u = arUi();

        if (openList.length === 0) {
            return `
<tr class="ayanas-bd-row--nested">
  <td colspan="10">
    <div class="ayanas-bd-nested"><p class="ayanas-bd-muted">未回収の請求はありません。</p></div>
  </td>
</tr>`;
        }

        const bodyRows = openList.map((inv) => {
            const status = deriveInvoiceCollectionStatus(inv);
            const canRegister = status === '未入金' || status === '一部入金';
            const registerCell = canRegister
                ? `<a class="ayanas-bd-money-link" href="${escapeHtml(buildPaymentRegistrationUrl(inv.customerCode, inv.invoiceNo))}" target="_blank" rel="noopener" data-bd-ar-payment-register="1">${escapeHtml(u.registerPayment || '入金登録')}</a>`
                : '';

            const cacheKey = invoiceHistoryKey(customerCode, inv.invoiceNo);
            const historyExpanded = state.expandedInvoices.has(cacheKey);
            const historyToggle = historyExpanded ? '▼' : '▶';

            let html = `
<tr>
  <td class="ayanas-bd-toggle-cell">
    <button type="button" class="ayanas-bd-toggle" data-bd-ar-invoice="${escapeHtml(cacheKey)}" data-customer-code="${escapeHtml(customerCode)}" data-invoice-no="${escapeHtml(inv.invoiceNo)}" aria-expanded="${historyExpanded ? 'true' : 'false'}">${historyToggle}</button>
  </td>
  <td><a class="ayanas-bd-money-link" href="${invoiceDetailUrl(inv.recordId)}" target="_blank" rel="noopener">${escapeHtml(inv.invoiceNo)}</a></td>
  <td>${formatDate(inv.invoiceDate)}</td>
  <td class="num">${formatYen(inv.billingTarget)}</td>
  <td class="num">${formatYen(inv.open)}</td>
  <td>${formatDate(inv.dueBase)}</td>
  <td class="num">${inv.overdueDays}</td>
  <td>${escapeHtml(status)}</td>
  <td>${registerCell}</td>
</tr>`;

            if (historyExpanded) {
                html += `
<tr class="ayanas-bd-row--nested">
  <td colspan="9">
    <div class="ayanas-bd-nested">
      <div class="ayanas-bd-nested__title">${escapeHtml(u.paymentHistoryTitle || '入金履歴')}</div>
      ${renderPaymentHistoryContent(cacheKey, inv)}
    </div>
  </td>
</tr>`;
            }

            return html;

        }).join('');

        return `
<tr class="ayanas-bd-row--nested">
  <td colspan="10">
    <div class="ayanas-bd-nested">
      <div class="ayanas-bd-nested__title">請求別内訳（未回収）</div>
      <table class="ayanas-bd-table ayanas-bd-table--nested">
        <thead>
          <tr>
            <th></th>
            <th>請求番号</th>
            <th>請求日</th>
            <th>請求金額</th>
            <th>残高</th>
            <th>支払期日</th>
            <th>超過日数</th>
            <th>状況</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  </td>
</tr>`;

    };

    const renderSummaryCards = (summary) => {

        const s = summary || {};

        return `
<div class="ayanas-bd-money-cards">
  <div class="ayanas-bd-money-card"><div class="ayanas-bd-money-card__label">売掛残高合計</div><div class="ayanas-bd-money-card__value">${formatYen(s.openBalanceTotal)}</div></div>
  <div class="ayanas-bd-money-card"><div class="ayanas-bd-money-card__label">30日超</div><div class="ayanas-bd-money-card__value">${formatYen(s.over30)}</div></div>
  <div class="ayanas-bd-money-card"><div class="ayanas-bd-money-card__label">60日超</div><div class="ayanas-bd-money-card__value">${formatYen(s.over60)}</div></div>
  <div class="ayanas-bd-money-card"><div class="ayanas-bd-money-card__label">90日超</div><div class="ayanas-bd-money-card__value">${formatYen(s.over90)}</div></div>
  <div class="ayanas-bd-money-card"><div class="ayanas-bd-money-card__label">今月入金額</div><div class="ayanas-bd-money-card__value">${formatYen(s.monthCashIn)}</div></div>
  <div class="ayanas-bd-money-card"><div class="ayanas-bd-money-card__label">今月入金予定額</div><div class="ayanas-bd-money-card__value">${formatYen(s.monthScheduled)}</div></div>
</div>`;

    };

    const renderCustomerTable = (customers) => {

        const rows = (customers || []).filter(matchesFilter).map((customer) => {

            const expanded = state.expandedCustomers.has(customer.customerCode);
            const toggle = expanded ? '▼' : '▶';

            let html = `
<tr>
  <td class="ayanas-bd-toggle-cell">
    <button type="button" class="ayanas-bd-toggle" data-bd-ar-customer="${escapeHtml(customer.customerCode)}" aria-expanded="${expanded ? 'true' : 'false'}">${toggle}</button>
  </td>
  <td>${escapeHtml(customer.customerCode)}</td>
  <td>${escapeHtml(customer.customerName || '—')}</td>
  <td class="num">${formatYen(customer.openBalanceTotal)}</td>
  <td class="num">${formatYen(customer.uncollectedBillingTotal)}</td>
  <td>${formatDate(customer.oldestOpenDueBase)}</td>
  <td class="num">${customer.oldestOpenOverdueDays || 0}</td>
  <td>${formatDate(customer.lastPaymentDate)}</td>
  <td class="num">${customer.unpaidCount}</td>
  <td class="num">${customer.partialCount}</td>
</tr>`;

            if (expanded) {
                html += renderInvoiceBreakdownBlock(customer);
            }

            return html;

        }).join('');

        if (!rows) {
            return '<p class="ayanas-bd-muted">表示対象の取引先がありません。</p>';
        }

        return `
<table class="ayanas-bd-table">
  <thead>
    <tr>
      <th></th>
      <th>取引先コード</th>
      <th>取引先名</th>
      <th>売掛残高</th>
      <th>未回収請求額</th>
      <th>支払期日</th>
      <th>超過日数</th>
      <th>最終入金日</th>
      <th>未入金件</th>
      <th>一部入金件</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;

    };

    const renderToolbar = () => {

        const u = arUi();
        const btn = (id, label) => (
            `<button type="button" class="ayanas-bd-btn ayanas-bd-btn--seg${state.activeFilter === id ? ' is-active' : ''}" data-bd-ar-filter="${id}">${escapeHtml(label)}</button>`
        );

        return `
<div class="ayanas-bd-money-toolbar">
  ${btn('all', u.filterAll || 'すべて')}
  ${btn('open', u.filterOpenOnly || '残高あり')}
  ${btn('30', u.filterOver30 || '30日超')}
  ${btn('60', u.filterOver60 || '60日超')}
  ${btn('90', u.filterOver90 || '90日超')}
  <input type="search" class="ayanas-bd-money-search" id="ayanas-bd-ar-search" placeholder="${escapeHtml(u.searchPlaceholder || '取引先コード・名称')}" value="${escapeHtml(state.searchText)}">
</div>`;

    };

    const renderSection = (report) => {

        const u = ui();
        const arReport = report?.ar;
        const arError = report?.arError;

        if (typeof CAYANAS_AREngine === 'undefined' || typeof CAYANAS_AR === 'undefined') {
            return `
<section class="ayanas-bd-section ayanas-bd-section--money">
  <h2 class="ayanas-bd-section__title">${escapeHtml(u.sectionMoney)}</h2>
  <p class="ayanas-bd-error">${escapeHtml(u.moneyDepsMissing)}</p>
</section>`;
        }

        if (arError) {
            return `
<section class="ayanas-bd-section ayanas-bd-section--money">
  <h2 class="ayanas-bd-section__title">${escapeHtml(u.sectionMoney)}</h2>
  <p class="ayanas-bd-error">${escapeHtml(u.moneyErrorPrefix)} ${escapeHtml(arError.message || String(arError))}</p>
</section>`;
        }

        if (!arReport) {
            return '';
        }

        const summary = arReport.summary || {};
        const asOf = summary.asOfDate || '—';

        return `
<section class="ayanas-bd-section ayanas-bd-section--money">
  <h2 class="ayanas-bd-section__title">${escapeHtml(u.sectionMoney)}</h2>
  <p class="ayanas-bd-note ayanas-bd-note--muted">${escapeHtml(u.moneyBasisNote)} 基準日: ${escapeHtml(asOf)} / 今月: ${escapeHtml(summary.monthLabel || '—')}</p>
  <p class="ayanas-bd-note ayanas-bd-note--muted">${escapeHtml(u.moneySourceNote)} <a class="ayanas-bd-money-link" href="${escapeHtml(arAppUrl())}" target="_blank" rel="noopener">${escapeHtml(u.moneyFullArLink)}</a></p>
  ${renderSummaryCards(summary)}
  ${renderToolbar()}
  ${renderCustomerTable(arReport.customers)}
</section>`;

    };

    const historyTotalsMatchInvoice = (historyTotals, inv) => (
        Math.abs(historyTotals.cash - inv.cash) <= eps()
        && Math.abs(historyTotals.fee - inv.fee) <= eps()
        && Math.abs(historyTotals.discount - inv.discount) <= eps()
        && Math.abs(historyTotals.writeoff - inv.settled) <= eps()
    );

    const findOpenInvoice = (arReport, customerCode, invoiceNo) => {

        const customer = arReport?.customers?.find((row) => row.customerCode === customerCode);

        return (customer?.invoices || []).find((inv) => inv.invoiceNo === invoiceNo && inv.isOpen) ?? null;

    };

    const ensurePaymentHistoryLoaded = async (cacheKey, customerCode, invoiceNo, arReport) => {

        const cached = state.paymentHistoryCache.get(cacheKey);

        if (cached?.status === 'loaded') {
            return;
        }

        if (state.paymentHistoryInflight.has(cacheKey)) {
            await state.paymentHistoryInflight.get(cacheKey);
            return;
        }

        state.paymentHistoryCache.set(cacheKey, { status: 'loading' });

        const loadPromise = (async () => {

            try {

                const result = await CAYANAS_AREngine.fetchPaymentHistoryForInvoice(invoiceNo, customerCode);
                const inv = findOpenInvoice(arReport, customerCode, invoiceNo);
                const consistent = inv ? historyTotalsMatchInvoice(result.totals, inv) : true;

                state.paymentHistoryCache.set(cacheKey, {
                    status: 'loaded',
                    rows: result.rows,
                    totals: result.totals,
                    consistent,
                });

            } catch (error) {

                state.paymentHistoryCache.set(cacheKey, { status: 'error', error });

            }

        })();

        state.paymentHistoryInflight.set(cacheKey, loadPromise);

        try {
            await loadPromise;
        } finally {
            state.paymentHistoryInflight.delete(cacheKey);
        }

    };

    const ensurePaymentReturnReload = (onReload) => {

        if (state.paymentFocusBound) {
            return;
        }

        state.paymentFocusBound = true;

        window.addEventListener('focus', () => {

            if (!state.paymentReturnReloadPending) {
                return;
            }

            state.paymentReturnReloadPending = false;
            state.paymentHistoryCache.clear();
            onReload();

        });

    };

    const bindEvents = (root, ctx) => {

        const { rerender, reloadAll, arReport } = ctx;

        ensurePaymentReturnReload(reloadAll);

        root.querySelectorAll('[data-bd-ar-filter]').forEach((button) => {

            button.addEventListener('click', () => {

                state.activeFilter = button.getAttribute('data-bd-ar-filter') || 'all';
                rerender();

            });

        });

        const search = root.querySelector('#ayanas-bd-ar-search');

        if (search) {
            search.addEventListener('input', () => {

                state.searchText = search.value;
                rerender();

            });
        }

        root.querySelectorAll('[data-bd-ar-customer]').forEach((button) => {

            button.addEventListener('click', (event) => {

                event.stopPropagation();
                const code = button.getAttribute('data-bd-ar-customer') || '';

                if (state.expandedCustomers.has(code)) {
                    state.expandedCustomers.delete(code);
                } else {
                    state.expandedCustomers.add(code);
                }

                rerender();

            });

        });

        root.querySelectorAll('[data-bd-ar-invoice]').forEach((button) => {

            button.addEventListener('click', async (event) => {

                event.stopPropagation();
                const cacheKey = button.getAttribute('data-bd-ar-invoice') || '';
                const customerCode = button.getAttribute('data-customer-code') || '';
                const invoiceNo = button.getAttribute('data-invoice-no') || '';

                if (state.expandedInvoices.has(cacheKey)) {
                    state.expandedInvoices.delete(cacheKey);
                    rerender();
                    return;
                }

                state.expandedInvoices.add(cacheKey);
                rerender();
                await ensurePaymentHistoryLoaded(cacheKey, customerCode, invoiceNo, arReport);
                rerender();

            });

        });

        root.querySelectorAll('[data-bd-ar-payment-register]').forEach((link) => {

            link.addEventListener('click', () => {

                state.paymentReturnReloadPending = true;

            });

        });

    };

    const clearCachesOnReload = () => {

        state.paymentHistoryCache.clear();
        state.paymentHistoryInflight.clear();

    };

    window.CAYANAS_BusinessDashboardMoney = {
        renderSection,
        bindEvents,
        clearCachesOnReload,
    };

}());
