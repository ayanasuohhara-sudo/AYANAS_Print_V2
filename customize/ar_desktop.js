(function () {
    'use strict';

    /**
     * 売掛管理 App 22 — 一覧ダッシュボード
     */

    const ROOT_ID = 'ayanas-ar-dashboard-root';
    const BODY_CLASS = 'ayanas-ar-active';

    let expandedCustomers = new Set();
    let activeFilter = 'all';
    let searchText = '';
    let lastReport = null;
    let paymentReturnReloadPending = false;
    let paymentFocusBound = false;
    let expandedInvoices = new Set();
    const paymentHistoryCache = new Map();
    const paymentHistoryInflight = new Map();

    const isArApp = () => (
        typeof kintone !== 'undefined'
        && typeof kintone.app?.getId === 'function'
        && typeof CAYANAS_AR !== 'undefined'
        && kintone.app.getId() === CAYANAS_AR.AR_APP_ID
    );

    const formatYen = (value) => {

        const n = Number(value);

        if (!Number.isFinite(n)) {
            return '0';
        }

        return Math.round(n).toLocaleString('ja-JP');

    };

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const formatDate = (ymd) => {

        const s = String(ymd ?? '').trim();

        return s === '' ? '—' : s;

    };

    const getMountElement = () => {

        const header = kintone.app.getHeaderSpaceElement();

        if (header) {
            return header;
        }

        const contents = document.querySelector('.contents-gaia');

        return contents || document.body;

    };

    const ensureRoot = () => {

        let root = document.getElementById(ROOT_ID);

        if (root) {
            return root;
        }

        const mount = getMountElement();
        root = document.createElement('div');
        root.id = ROOT_ID;
        root.className = 'ayanas-ar-root';

        if (mount.firstChild) {
            mount.insertBefore(root, mount.firstChild);
        } else {
            mount.appendChild(root);
        }

        return root;

    };

    const invoiceDetailUrl = (recordId) => {

        if (!recordId) {
            return '#';
        }

        return `${location.origin}/k/${CAYANAS_AR.INVOICE_APP_ID}/show#record=${recordId}`;

    };

    const buildPaymentRegistrationUrl = (customerCode, invoiceNo) => {

        const q = CAYANAS_AR.PAYMENT_CREATE_QUERY;
        const params = new URLSearchParams();

        params.set(q.customerCode, String(customerCode ?? '').trim());
        params.set(q.invoiceNo, String(invoiceNo ?? '').trim());

        return `${location.origin}/k/${CAYANAS_AR.PAYMENT_APP_ID}/edit?${params.toString()}`;

    };

    const ensurePaymentReturnReload = () => {

        if (paymentFocusBound) {
            return;
        }

        paymentFocusBound = true;

        window.addEventListener('focus', () => {

            if (!paymentReturnReloadPending) {
                return;
            }

            paymentReturnReloadPending = false;

            const root = document.getElementById(ROOT_ID);

            if (root) {
                loadAndRender(root);
            }

        });

    };

    /** 請求別内訳の「状況」（展開行表示用。親集計は変更しない） */
    const deriveInvoiceCollectionStatus = (inv) => {

        const eps = CAYANAS_AR.OPEN_EPSILON;
        const open = Number(inv.open) || 0;
        const settled = Number(inv.settled) || 0;

        if (open <= eps) {
            return '入金済';
        }

        if (settled <= eps) {
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

    const findOpenInvoice = (customerCode, invoiceNo) => {

        const customer = lastReport?.customers?.find((row) => row.customerCode === customerCode);

        return (customer?.invoices || []).find((inv) => inv.invoiceNo === invoiceNo && inv.isOpen) ?? null;

    };

    const historyTotalsMatchInvoice = (historyTotals, inv) => {

        const eps = CAYANAS_AR.OPEN_EPSILON;

        return Math.abs(historyTotals.cash - inv.cash) <= eps
            && Math.abs(historyTotals.fee - inv.fee) <= eps
            && Math.abs(historyTotals.discount - inv.discount) <= eps
            && Math.abs(historyTotals.writeoff - inv.settled) <= eps;

    };

    const renderPaymentHistoryContent = (cacheKey, inv) => {

        const ui = CAYANAS_AR.UI;
        const entry = paymentHistoryCache.get(cacheKey);

        if (!entry || entry.status === 'loading') {
            return `<p class="ayanas-ar-payment-history__message">${escapeHtml(ui.paymentHistoryLoading)}</p>`;
        }

        if (entry.status === 'error') {
            return `<p class="ayanas-ar-payment-history__message ayanas-ar-payment-history__message--error">${escapeHtml(ui.paymentHistoryError)}</p>`;
        }

        if (!entry.rows || entry.rows.length === 0) {
            return `<p class="ayanas-ar-payment-history__message">${escapeHtml(ui.paymentHistoryEmpty)}</p>`;
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
            ? `<p class="ayanas-ar-payment-history__warn">${escapeHtml(ui.paymentHistoryMismatch)}</p>`
            : '';

        return `
${mismatch}
<table class="ayanas-ar-payment-history-table">
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

        if (openList.length === 0) {
            return `
<tr class="ayanas-ar-row--breakdown">
  <td colspan="16">
    <div class="ayanas-ar-breakdown">
      <p class="ayanas-ar-breakdown__empty">未回収の請求はありません。</p>
    </div>
  </td>
</tr>`;
        }

        const bodyRows = openList.map((inv) => {
            const status = deriveInvoiceCollectionStatus(inv);
            const statusClass = status === '未入金'
                ? 'ayanas-ar-status--unpaid'
                : (status === '一部入金' ? 'ayanas-ar-status--partial' : 'ayanas-ar-status--paid');

            const canRegister = status === '未入金' || status === '一部入金';
            const registerCell = canRegister
                ? `<a class="ayanas-ar-payment-register" href="${escapeHtml(buildPaymentRegistrationUrl(inv.customerCode, inv.invoiceNo))}" target="_blank" rel="noopener" data-ar-payment-register="1">${escapeHtml(CAYANAS_AR.UI.registerPayment)}</a>`
                : '';

            const cacheKey = invoiceHistoryKey(customerCode, inv.invoiceNo);
            const historyExpanded = expandedInvoices.has(cacheKey);
            const historyToggle = historyExpanded ? '▼' : '▶';

            let html = `
<tr class="ayanas-ar-row--invoice" data-invoice-key="${escapeHtml(cacheKey)}">
  <td class="ayanas-ar-invoice-toggle-cell">
    <button type="button" class="ayanas-ar-invoice-toggle" aria-expanded="${historyExpanded ? 'true' : 'false'}" aria-label="入金履歴" data-customer-code="${escapeHtml(customerCode)}" data-invoice-no="${escapeHtml(inv.invoiceNo)}">${historyToggle}</button>
  </td>
  <td><a class="ayanas-ar-link" href="${invoiceDetailUrl(inv.recordId)}" target="_blank" rel="noopener">${escapeHtml(inv.invoiceNo)}</a></td>
  <td>${formatDate(inv.invoiceDate)}</td>
  <td class="num">${formatYen(inv.billingTarget)}</td>
  <td class="num">${formatYen(inv.cash)}</td>
  <td class="num">${formatYen(inv.fee)}</td>
  <td class="num">${formatYen(inv.discount)}</td>
  <td class="num">${formatYen(inv.settled)}</td>
  <td class="num">${formatYen(inv.open)}</td>
  <td>${formatDate(inv.dueBase)}</td>
  <td class="num">${inv.overdueDays}</td>
  <td><span class="ayanas-ar-status ${statusClass}">${escapeHtml(status)}</span></td>
  <td class="ayanas-ar-payment-register-cell">${registerCell}</td>
</tr>`;

            if (historyExpanded) {
                html += `
<tr class="ayanas-ar-row--payment-history">
  <td colspan="13">
    <div class="ayanas-ar-payment-history">
      <div class="ayanas-ar-payment-history__title">${escapeHtml(CAYANAS_AR.UI.paymentHistoryTitle)}</div>
      ${renderPaymentHistoryContent(cacheKey, inv)}
    </div>
  </td>
</tr>`;
            }

            return html;

        }).join('');

        return `
<tr class="ayanas-ar-row--breakdown">
  <td colspan="16">
    <div class="ayanas-ar-breakdown">
      <div class="ayanas-ar-breakdown__title">請求別内訳</div>
      <table class="ayanas-ar-breakdown-table">
        <thead>
          <tr>
            <th></th>
            <th>請求番号</th>
            <th>請求日</th>
            <th>請求金額</th>
            <th>入金額</th>
            <th>手数料</th>
            <th>値引</th>
            <th>消込合計</th>
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

    const ensurePaymentHistoryLoaded = async (cacheKey, customerCode, invoiceNo) => {

        const cached = paymentHistoryCache.get(cacheKey);

        if (cached?.status === 'loaded') {
            return;
        }

        if (paymentHistoryInflight.has(cacheKey)) {
            await paymentHistoryInflight.get(cacheKey);
            return;
        }

        paymentHistoryCache.set(cacheKey, { status: 'loading' });

        const loadPromise = (async () => {

            try {

                const result = await CAYANAS_AREngine.fetchPaymentHistoryForInvoice(invoiceNo, customerCode);
                const inv = findOpenInvoice(customerCode, invoiceNo);
                const consistent = inv ? historyTotalsMatchInvoice(result.totals, inv) : true;

                if (inv && !consistent) {
                    console.warn('[ayanas-ar] payment history totals mismatch', {
                        invoiceNo,
                        breakdown: {
                            cash: inv.cash,
                            fee: inv.fee,
                            discount: inv.discount,
                            settled: inv.settled,
                        },
                        history: result.totals,
                    });
                }

                paymentHistoryCache.set(cacheKey, {
                    status: 'loaded',
                    rows: result.rows,
                    totals: result.totals,
                    consistent,
                });

            } catch (error) {

                console.error('[ayanas-ar] payment history fetch failed', error);
                paymentHistoryCache.set(cacheKey, { status: 'error' });

            }

        })();

        paymentHistoryInflight.set(cacheKey, loadPromise);

        try {
            await loadPromise;
        } finally {
            paymentHistoryInflight.delete(cacheKey);
        }

    };

    const matchesFilter = (customer) => {

        if (customer.openBalanceTotal <= CAYANAS_AR.OPEN_EPSILON) {
            if (activeFilter === 'open') {
                return false;
            }
        }

        const hasOverdue = (minDays) => (
            customer.openBalanceTotal > CAYANAS_AR.OPEN_EPSILON
            && customer.invoices.some((inv) => inv.overdueDays >= minDays)
        );

        if (activeFilter === '30' && !hasOverdue(30)) {
            return false;
        }

        if (activeFilter === '60' && !hasOverdue(60)) {
            return false;
        }

        if (activeFilter === '90' && !hasOverdue(90)) {
            return false;
        }

        if (activeFilter === 'open' && customer.openBalanceTotal <= CAYANAS_AR.OPEN_EPSILON) {
            return false;
        }

        const q = searchText.trim().toLowerCase();

        if (!q) {
            return true;
        }

        const code = String(customer.customerCode ?? '').toLowerCase();
        const name = String(customer.customerName ?? '').toLowerCase();

        return code.includes(q) || name.includes(q);

    };

    const renderSummary = (summary) => {

        const s = summary || {};

        return `
<div class="ayanas-ar-cards">
  <div class="ayanas-ar-card"><div class="ayanas-ar-card__label">売掛残高合計</div><div class="ayanas-ar-card__value">${formatYen(s.openBalanceTotal)}</div></div>
  <div class="ayanas-ar-card"><div class="ayanas-ar-card__label">30日超</div><div class="ayanas-ar-card__value">${formatYen(s.over30)}</div></div>
  <div class="ayanas-ar-card"><div class="ayanas-ar-card__label">60日超</div><div class="ayanas-ar-card__value">${formatYen(s.over60)}</div></div>
  <div class="ayanas-ar-card"><div class="ayanas-ar-card__label">90日超</div><div class="ayanas-ar-card__value">${formatYen(s.over90)}</div></div>
  <div class="ayanas-ar-card"><div class="ayanas-ar-card__label">今月入金額</div><div class="ayanas-ar-card__value">${formatYen(s.monthCashIn)}</div></div>
  <div class="ayanas-ar-card"><div class="ayanas-ar-card__label">今月入金予定額</div><div class="ayanas-ar-card__value">${formatYen(s.monthScheduled)}</div></div>
</div>`;

    };

    const renderCustomerRow = (customer) => {

        const expanded = expandedCustomers.has(customer.customerCode);
        const toggle = expanded ? '▼' : '▶';
        const overdueClass = customer.oldestOpenOverdueDays > 0 && customer.openBalanceTotal > CAYANAS_AR.OPEN_EPSILON
            ? ' is-overdue'
            : '';

        let html = `
<tr class="ayanas-ar-row--customer${overdueClass}" data-customer-code="${escapeHtml(customer.customerCode)}">
  <td class="ayanas-ar-toggle-cell"><button type="button" class="ayanas-ar-toggle" aria-expanded="${expanded ? 'true' : 'false'}" aria-label="請求別内訳">${toggle}</button></td>
  <td>${escapeHtml(customer.customerCode)}</td>
  <td>${escapeHtml(customer.customerName || '—')}</td>
  <td class="num">${formatYen(customer.uncollectedBillingTotal)}</td>
  <td class="num">${formatYen(customer.cashTotal)}</td>
  <td class="num">${formatYen(customer.feeTotal)}</td>
  <td class="num">${formatYen(customer.discountTotal)}</td>
  <td class="num">${formatYen(customer.settledTotal)}</td>
  <td class="num">${formatYen(customer.openBalanceTotal)}</td>
  <td>${formatDate(customer.oldestOpenInvoiceDate)}</td>
  <td>${formatDate(customer.oldestOpenDueBase)}</td>
  <td class="num">${customer.oldestOpenOverdueDays || 0}</td>
  <td>${formatDate(customer.lastPaymentDate)}</td>
  <td>${formatDate(customer.nextPaymentDueDate)}</td>
  <td class="num">${customer.unpaidCount}</td>
  <td class="num">${customer.partialCount}</td>
</tr>`;

        if (expanded) {
            html += renderInvoiceBreakdownBlock(customer);
        }

        return html;

    };

    const renderTable = (customers) => {

        const rows = customers.filter(matchesFilter).map(renderCustomerRow).join('');

        if (!rows) {
            return '<p class="ayanas-ar-message">表示対象の取引先がありません。</p>';
        }

        return `
<div class="ayanas-ar-table-wrap">
<table class="ayanas-ar-table">
  <thead>
    <tr>
      <th></th>
      <th>取引先コード</th>
      <th>取引先名</th>
      <th>未回収請求額</th>
      <th>現金入金</th>
      <th>手数料</th>
      <th>値引</th>
      <th>消込合計</th>
      <th>売掛残高</th>
      <th>最古未回収請求日</th>
      <th>支払期日</th>
      <th>超過日数</th>
      <th>最終入金日</th>
      <th>次回入金予定</th>
      <th>未入金件</th>
      <th>一部入金件</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
</div>`;

    };

    const renderToolbar = () => {

        const ui = CAYANAS_AR.UI;
        const btn = (id, label) => (
            `<button type="button" class="ayanas-ar-btn${activeFilter === id ? ' is-active' : ''}" data-ar-filter="${id}">${label}</button>`
        );

        return `
<div class="ayanas-ar-toolbar">
  ${btn('all', ui.filterAll)}
  ${btn('open', ui.filterOpenOnly)}
  ${btn('30', ui.filterOver30)}
  ${btn('60', ui.filterOver60)}
  ${btn('90', ui.filterOver90)}
  <input type="search" class="ayanas-ar-search" id="ayanas-ar-search" placeholder="${escapeHtml(ui.searchPlaceholder)}" value="${escapeHtml(searchText)}">
  <button type="button" class="ayanas-ar-btn ayanas-ar-btn--primary" id="ayanas-ar-reload">${escapeHtml(ui.reload)}</button>
</div>`;

    };

    const renderAll = (root, report) => {

        const ui = CAYANAS_AR.UI;
        const asOf = report?.summary?.asOfDate || '—';
        const generated = report?.generatedAt
            ? new Date(report.generatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
            : '';

        root.innerHTML = `
<div class="ayanas-ar-head">
  <h1 class="ayanas-ar-head__title">${escapeHtml(ui.title)}</h1>
  <div class="ayanas-ar-head__meta">基準日: ${escapeHtml(asOf)}${generated ? ` / 更新: ${escapeHtml(generated)}` : ''}</div>
</div>
${renderSummary(report?.summary)}
${renderToolbar()}
${renderTable(report?.customers || [])}`;

    };

    const bindEvents = (root) => {

        root.querySelectorAll('[data-ar-filter]').forEach((button) => {

            button.addEventListener('click', () => {

                activeFilter = button.getAttribute('data-ar-filter') || 'all';
                renderAll(root, lastReport);
                bindEvents(root);

            });

        });

        const search = root.querySelector('#ayanas-ar-search');

        if (search) {
            search.addEventListener('input', () => {

                searchText = search.value;
                renderAll(root, lastReport);
                bindEvents(root);

                const again = root.querySelector('#ayanas-ar-search');

                if (again) {
                    again.focus();
                    again.setSelectionRange(again.value.length, again.value.length);
                }

            });
        }

        root.querySelectorAll('.ayanas-ar-toggle').forEach((button) => {

            button.addEventListener('click', (event) => {

                event.preventDefault();
                event.stopPropagation();

                const row = button.closest('.ayanas-ar-row--customer');
                const code = row?.getAttribute('data-customer-code');

                if (!code) {
                    return;
                }

                if (expandedCustomers.has(code)) {
                    expandedCustomers.delete(code);
                } else {
                    expandedCustomers.add(code);
                }

                renderAll(root, lastReport);
                bindEvents(root);

            });

        });

        const reload = root.querySelector('#ayanas-ar-reload');

        if (reload) {
            reload.addEventListener('click', () => {
                loadAndRender(root);
            });
        }

        root.querySelectorAll('[data-ar-payment-register]').forEach((link) => {

            link.addEventListener('click', (event) => {
                event.stopPropagation();
                paymentReturnReloadPending = true;
            });

        });

        root.querySelectorAll('.ayanas-ar-invoice-toggle').forEach((button) => {

            button.addEventListener('click', async (event) => {

                event.preventDefault();
                event.stopPropagation();

                const customerCode = button.getAttribute('data-customer-code') || '';
                const invoiceNo = button.getAttribute('data-invoice-no') || '';
                const cacheKey = invoiceHistoryKey(customerCode, invoiceNo);

                if (expandedInvoices.has(cacheKey)) {
                    expandedInvoices.delete(cacheKey);
                    renderAll(root, lastReport);
                    bindEvents(root);
                    return;
                }

                expandedInvoices.add(cacheKey);
                renderAll(root, lastReport);
                bindEvents(root);

                await ensurePaymentHistoryLoaded(cacheKey, customerCode, invoiceNo);

                renderAll(root, lastReport);
                bindEvents(root);

            });

        });

    };

    const loadAndRender = async (root) => {

        const ui = CAYANAS_AR.UI;

        root.innerHTML = `<p class="ayanas-ar-message">${escapeHtml(ui.loading)}</p>`;

        paymentHistoryCache.clear();
        paymentHistoryInflight.clear();

        try {

            lastReport = await CAYANAS_AREngine.buildReport();
            renderAll(root, lastReport);
            bindEvents(root);

        } catch (error) {

            console.error('[ayanas-ar]', error);

            root.innerHTML = `<div class="ayanas-ar-error">${escapeHtml(ui.errorPrefix)} ${escapeHtml(error.message || String(error))}</div>`;

        }

    };

    kintone.events.on('app.record.index.show', (event) => {

        if (!isArApp()) {
            return event;
        }

        document.body.classList.add(BODY_CLASS);

        ensurePaymentReturnReload();

        const root = ensureRoot();

        loadAndRender(root);

        return event;

    });

    kintone.events.on('app.record.index.hide', (event) => {

        document.body.classList.remove(BODY_CLASS);

        const root = document.getElementById(ROOT_ID);

        if (root) {
            root.remove();
        }

        return event;

    });

}());
