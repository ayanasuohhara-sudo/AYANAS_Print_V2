(function () {
    'use strict';

    /**
     * 工場・店舗 作業状況ポータル — 一覧画面。
     * ステータスは変更しない。
     */

    const ROOT_ID = 'ayanas-floor-portal-root';
    const BODY_CLASS = 'ayanas-floor-portal-active';

    const Engine = window.CAYANAS_FloorPortalEngine;

    if (!Engine || typeof CAYANAS_FLOOR_PORTAL === 'undefined') {
        console.error('[floor_portal] 依存 JS が未読込です。');
        return;
    }

    const cfg = () => CAYANAS_FLOOR_PORTAL;

    let mode = '';
    let stock = null;
    let storeSummary = null;
    let workId = '';
    let deadlineId = '';
    let query = '';
    let notice = '';
    let highlightManageNo = '';
    let loading = false;
    let loadError = '';
    let timerId = 0;
    let requestSerial = 0;
    let shellReady = false;

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const formatHm = (date) => new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(date);

    const appUrl = (appId) => location.origin + '/k/' + appId + '/';

    const resolveAppId = (appKey) => {
        const app = cfg().APP || {};
        const id = app[appKey];
        return typeof id === 'number' && id > 0 ? id : 0;
    };

    /** 店舗: グループ化メニュー。工場: 従来の3ショートカット。App85 は載せない。 */
    const renderMenuHtml = () => {
        const ui = cfg().UI;
        const app = cfg().APP;

        if (mode !== cfg().MODE.store) {
            return ''
                + '<nav class="cayan-fp-links" aria-label="工場ショートカット">'
                + '<a class="cayan-fp-btn" href="' + escapeHtml(appUrl(app.locationInbound)) + '" target="_blank" rel="noopener">' + escapeHtml(ui.shortcutInbound) + '</a>'
                + '<a class="cayan-fp-btn" href="' + escapeHtml(appUrl(app.internalWork)) + '" target="_blank" rel="noopener">' + escapeHtml(ui.shortcutWork) + '</a>'
                + '<a class="cayan-fp-btn" href="' + escapeHtml(appUrl(app.completeRegister)) + '" target="_blank" rel="noopener">' + escapeHtml(ui.shortcutComplete) + '</a>'
                + '</nav>';
        }

        const groups = Array.isArray(cfg().STORE_MENU_GROUPS) ? cfg().STORE_MENU_GROUPS : [];
        const groupsHtml = groups.map((group) => {
            const links = (group.links || []).map((link) => {
                const id = resolveAppId(link.appKey);
                if (!id) {
                    return '';
                }
                const note = link.note
                    ? '<span class="cayan-fp-menu__note">' + escapeHtml(link.note) + '</span>'
                    : '';
                return ''
                    + '<a class="cayan-fp-btn cayan-fp-btn--menu" href="'
                    + escapeHtml(appUrl(id))
                    + '" target="_blank" rel="noopener">'
                    + '<span class="cayan-fp-menu__label">' + escapeHtml(link.label) + '</span>'
                    + note
                    + '</a>';
            }).join('');

            return ''
                + '<div class="cayan-fp-menu-group" data-menu-group="' + escapeHtml(group.id || '') + '">'
                + '<h3 class="cayan-fp-menu-group__title">' + escapeHtml(group.label || '') + '</h3>'
                + '<div class="cayan-fp-menu-group__links">' + links + '</div>'
                + '</div>';
        }).join('');

        return ''
            + '<section class="cayan-fp-menu" aria-label="' + escapeHtml(ui.storeMenuTitle || '店舗メニュー') + '">'
            + '<h2 class="cayan-fp-menu__title">' + escapeHtml(ui.storeMenuTitle || '店舗メニュー') + '</h2>'
            + '<p class="cayan-fp-note">' + escapeHtml(ui.storeMenuLead || '') + '</p>'
            + '<p class="cayan-fp-note cayan-fp-note--warn">' + escapeHtml(ui.storePermissionNote || '') + '</p>'
            + '<div class="cayan-fp-menu__groups">' + groupsHtml + '</div>'
            + '</section>';
    };

    const renderSummaryHtml = () => {
        if (mode !== cfg().MODE.store) {
            return '';
        }

        const ui = cfg().UI;
        return ''
            + '<section class="cayan-fp-summary" aria-label="' + escapeHtml(ui.summaryTitle || '本日の店舗状況') + '">'
            + '<h2 class="cayan-fp-summary__title">' + escapeHtml(ui.summaryTitle || '本日の店舗状況') + '</h2>'
            + '<div class="cayan-fp-summary__cards" id="cayan-fp-summary-cards"></div>'
            + '</section>';
    };

    const summaryCardHtml = (label, text, unavailable) => (
        '<div class="cayan-fp-summary-card' + (unavailable ? ' is-unavailable' : '') + '">'
        + '<span class="cayan-fp-summary-card__label">' + escapeHtml(label) + '</span>'
        + '<span class="cayan-fp-summary-card__value">' + escapeHtml(text) + '</span>'
        + '</div>'
    );

    const paintSummary = () => {
        const el = document.getElementById('cayan-fp-summary-cards');
        if (!el || mode !== cfg().MODE.store) {
            return;
        }

        const ui = cfg().UI;
        if (loading && !storeSummary) {
            el.innerHTML = summaryCardHtml(ui.summaryTitle || '状況', ui.loading, true);
            return;
        }

        const s = storeSummary || Engine.buildStoreDailySummary({});
        el.innerHTML = [
            summaryCardHtml(
                ui.summaryTodayOrders,
                Engine.formatSummaryMetric(s.todayOrderCount),
                s.todayOrderCount.status !== 'ok'
            ),
            summaryCardHtml(
                ui.summaryDueToday,
                Engine.formatSummaryMetric(s.dueTodayCount),
                s.dueTodayCount.status !== 'ok'
            ),
            summaryCardHtml(
                ui.summaryPickupWaiting,
                Engine.formatSummaryMetric(s.pickupWaitingCount),
                s.pickupWaitingCount.status !== 'ok'
            ),
            summaryCardHtml(
                ui.summaryPaymentAmount,
                Engine.formatSummaryMetric(s.paymentAmountToday, { currency: true }),
                s.paymentAmountToday.status !== 'ok'
            ),
            summaryCardHtml(
                ui.summaryOverdue,
                Engine.formatSummaryMetric(s.overdueCount),
                s.overdueCount.status !== 'ok'
            ),
        ].join('');
    };

    const visibleRows = () => {

        if (!stock) {
            return [];
        }

        return Engine.filterRows(stock.rows, {
            mode,
            workId,
            deadlineId,
            query,
        });

    };

    const kintoneApi = (path, method, body) => kintone.api(path, method, body);

    const fetchAll = async (queryText, options) => {

        const opts = options || {};
        const appId = opts.appId || cfg().ORDER_APP_ID;
        const fields = opts.fields || Engine.orderFetchFields();
        const all = [];
        let offset = 0;
        const limit = 500;

        while (true) {

            const response = await kintoneApi(
                kintone.api.url('/k/v1/records.json', true),
                'GET',
                {
                    app: appId,
                    query: queryText + ' limit ' + limit + ' offset ' + offset,
                    fields,
                }
            );
            const records = response.records || [];

            all.push(...records);

            if (records.length < limit) {
                break;
            }

            offset += limit;

        }

        return all;

    };

    const fetchTodayPaymentAmount = async (today) => {
        const P = cfg().PAYMENT || {};
        const records = await fetchAll(Engine.buildTodayPaymentQuery(today), {
            appId: cfg().STORE_PAYMENT_APP_ID || cfg().APP.storePayment,
            fields: [P.amountField, P.statusField, P.dateField, P.kindField],
        });
        return Engine.sumPaymentAmount(records);
    };

    const reload = async (cause) => {

        if (!Engine.shouldFetch({
            visibilityState: document.visibilityState,
            cause,
        })) {
            return;
        }

        const serial = requestSerial + 1;

        requestSerial = serial;
        loading = true;
        loadError = '';
        paint();

        try {
            const today = Engine.todayYmdJst();
            const records = await fetchAll(Engine.buildLocationQuery(mode));

            if (serial !== requestSerial) {
                return;
            }

            stock = Engine.buildStock(records, { mode, today });
            stock.fetchedAt = new Date();

            if (mode === cfg().MODE.store) {
                let todayOrderRecords = null;
                let paymentAmount = null;
                let paymentFetched = false;

                try {
                    todayOrderRecords = await fetchAll(Engine.buildTodayStoreOrderQuery(today));
                } catch (orderError) {
                    console.error('[floor_portal] today orders', orderError && orderError.message, orderError);
                    todayOrderRecords = null;
                }

                try {
                    paymentAmount = await fetchTodayPaymentAmount(today);
                    paymentFetched = true;
                } catch (paymentError) {
                    console.error('[floor_portal] today payments', paymentError && paymentError.message, paymentError);
                    paymentAmount = null;
                    paymentFetched = false;
                }

                if (serial !== requestSerial) {
                    return;
                }

                storeSummary = Engine.buildStoreDailySummary({
                    todayOrderRecords,
                    stock,
                    stockFetched: true,
                    paymentAmount,
                    paymentFetched,
                });
            } else {
                storeSummary = null;
            }

            loading = false;
            paint();
        } catch (error) {

            if (serial !== requestSerial) {
                return;
            }

            loading = false;
            loadError = error && error.message ? error.message : String(error);
            if (mode === cfg().MODE.store) {
                storeSummary = Engine.buildStoreDailySummary({
                    stockFetched: false,
                    paymentFetched: false,
                });
            }
            console.error('[floor_portal]', error && error.code, error && error.message, error);
            paint();

        }

    };

    const lookupManageNo = async (manageNo) => {

        notice = '';
        highlightManageNo = '';

        const exact = (stock?.rows || []).filter((row) => row.manageNo === manageNo);

        if (exact.length > 0) {
            const shown = visibleRows().some((row) => row.manageNo === manageNo);

            highlightManageNo = shown ? manageNo : '';
            notice = shown ? '' : cfg().UI.filteredOut;
            paint();
            scrollToManageNo(manageNo);
            return;
        }

        try {
            const response = await kintoneApi(
                kintone.api.url('/k/v1/records.json', true),
                'GET',
                {
                    app: cfg().ORDER_APP_ID,
                    query: Engine.buildManageNoQuery(manageNo),
                    fields: Engine.orderFetchFields(),
                }
            );

            notice = Engine.describeLookup(response.records || []);
            paint();
        } catch (error) {
            notice = error && error.message ? error.message : String(error);
            paint();
        }

    };

    const scrollToManageNo = (manageNo) => {

        const root = document.getElementById(ROOT_ID);
        const row = root?.querySelector('tr[data-manage-no="' + CSS.escape(manageNo) + '"]');

        if (row) {
            row.scrollIntoView({ block: 'center' });
        }

    };

    const cardButton = (cardId, label, count, active) => (
        '<button type="button" class="cayan-fp-card' + (active ? ' is-active' : '') + '" data-card="' + escapeHtml(cardId) + '">'
        + '<span class="cayan-fp-card__label">' + escapeHtml(label) + '</span>'
        + '<span class="cayan-fp-card__count">' + String(count) + '</span>'
        + '</button>'
    );

    const renderCards = () => {

        const ui = cfg().UI;
        const kpis = stock?.kpis;
        const total = kpis ? kpis.total : 0;
        const work = kpis ? kpis.work : {};
        const other = kpis ? kpis.other : 0;
        const deadline = kpis ? kpis.deadline : { overdue: 0, today: 0, within7: 0, thisMonth: 0 };
        const names = Engine.workCardsForMode(mode);
        let workHtml = cardButton('stock:total', ui.stockTotal, total, workId === '' && deadlineId === '');

        names.forEach((name) => {
            workHtml += cardButton('work:' + name, name, work[name] || 0, workId === name);
        });

        if (mode === cfg().MODE.store) {
            workHtml += cardButton(
                'work:deliveryWaiting',
                ui.deliveryWaiting,
                kpis ? kpis.deliveryWaiting : 0,
                workId === 'deliveryWaiting'
            );
        }

        if (cfg().SHOW_OTHER_CARD[mode]) {
            workHtml += cardButton('work:other', ui.other, other, workId === 'other');
        }

        const deadlineHtml = [
            cardButton('deadline:overdue', ui.overdue, deadline.overdue, deadlineId === 'overdue'),
            cardButton('deadline:today', ui.dueToday, deadline.today, deadlineId === 'today'),
            cardButton('deadline:within7', ui.within7, deadline.within7, deadlineId === 'within7'),
            cardButton('deadline:thisMonth', ui.thisMonth, deadline.thisMonth, deadlineId === 'thisMonth'),
        ].join('');

        return { workHtml, deadlineHtml };

    };

    const renderTable = (rows) => {

        const ui = cfg().UI;

        if (!rows.length) {
            return '<p class="cayan-fp-empty">' + escapeHtml(ui.empty) + '</p>';
        }

        const body = rows.map((row) => {

            const classes = ['cayan-fp-row'];

            if (row.urgency) {
                classes.push('is-' + row.urgency);
            }

            if (highlightManageNo && row.manageNo === highlightManageNo) {
                classes.push('is-focus');
            }

            const manageLink = row.recordId
                ? '<a class="cayan-fp-link" href="'
                    + escapeHtml(location.origin + Engine.orderDetailPath(row.recordId))
                    + '" target="_blank" rel="noopener noreferrer">'
                    + escapeHtml(row.manageNo)
                    + '</a>'
                : escapeHtml(row.manageNo);
            const manageCell = manageLink
                + (row.duplicate ? '<span class="cayan-fp-dup">' + escapeHtml(ui.duplicate) + '</span>' : '');

            return '<tr class="' + classes.join(' ') + '" data-manage-no="' + escapeHtml(row.manageNo) + '">'
                + '<td>' + manageCell + '</td>'
                + '<td>' + escapeHtml(row.orderDate) + '</td>'
                + '<td>' + escapeHtml(row.deadline) + '</td>'
                + '<td>' + escapeHtml(row.customerName) + '</td>'
                + '<td>' + escapeHtml(row.clientName) + '</td>'
                + '<td>' + escapeHtml(row.kimonoType) + '</td>'
                + '<td>' + escapeHtml(row.kimonoSpec) + '</td>'
                + '<td>' + escapeHtml(row.processing) + '</td>'
                + '<td>' + escapeHtml(row.processStatus) + '</td>'
                + '<td>' + escapeHtml(row.workStatus) + '</td>'
                + '<td>' + escapeHtml(row.deliveryStatus) + '</td>'
                + '</tr>';

        }).join('');

        return '<div class="cayan-fp-table-wrap"><table class="cayan-fp-table"><thead><tr>'
            + '<th>管理番号</th><th>受注日</th><th>納期</th><th>顧客名</th><th>お客様名</th>'
            + '<th>着物種類</th><th>仕様</th><th>加工内容</th><th>工程</th><th>作業状況</th><th>納品状態</th>'
            + '</tr></thead><tbody>' + body + '</tbody></table></div>';

    };

    const ensureShell = (root) => {

        if (root.dataset.shell === '1') {
            return;
        }

        const ui = cfg().UI;
        const title = mode === cfg().MODE.store ? ui.storeTitle : ui.factoryTitle;
        const note = mode === cfg().MODE.store ? ui.storeWaitingNote : ui.factoryOtherNote;

        root.dataset.shell = '1';
        root.innerHTML = ''
            + '<header class="cayan-fp-header">'
            + '<h1 class="cayan-fp-title">' + escapeHtml(title) + '</h1>'
            + '<div class="cayan-fp-header__side">'
            + '<span class="cayan-fp-updated" id="cayan-fp-updated"></span>'
            + '<button type="button" class="cayan-fp-btn" id="cayan-fp-refresh">' + escapeHtml(ui.refresh) + '</button>'
            + '</div></header>'
            + renderMenuHtml()
            + renderSummaryHtml()
            + '<section class="cayan-fp-section"><h2>現在状況</h2><div class="cayan-fp-cards" id="cayan-fp-work-cards"></div>'
            + '<p class="cayan-fp-note">' + escapeHtml(note) + '</p></section>'
            + '<section class="cayan-fp-section"><h2>納期</h2><div class="cayan-fp-cards" id="cayan-fp-deadline-cards"></div>'
            + '<p class="cayan-fp-note">納期のカードは重なります。空欄の納期は入りません。</p></section>'
            + '<div class="cayan-fp-tools">'
            + '<input id="cayan-fp-search" class="cayan-fp-search" type="search" placeholder="' + escapeHtml(ui.searchPlaceholder) + '" autocomplete="off">'
            + '<button type="button" class="cayan-fp-btn" id="cayan-fp-clear">' + escapeHtml(ui.clearFilters) + '</button>'
            + '<span class="cayan-fp-status" id="cayan-fp-status"></span>'
            + '</div>'
            + '<p class="cayan-fp-notice" id="cayan-fp-notice" hidden></p>'
            + '<div id="cayan-fp-list"></div>';

    };

    const paint = () => {

        const root = document.getElementById(ROOT_ID);

        if (!root) {
            return;
        }

        ensureShell(root);

        const ui = cfg().UI;
        const cards = renderCards();
        const rows = visibleRows();
        const updated = document.getElementById('cayan-fp-updated');
        const workCards = document.getElementById('cayan-fp-work-cards');
        const deadlineCards = document.getElementById('cayan-fp-deadline-cards');
        const status = document.getElementById('cayan-fp-status');
        const noticeEl = document.getElementById('cayan-fp-notice');
        const list = document.getElementById('cayan-fp-list');
        const statusLine = loading
            ? ui.loading
            : (loadError ? ui.errorPrefix + ' ' + loadError : '表示 ' + rows.length + ' 行');

        if (updated) {
            updated.textContent = stock?.fetchedAt ? '最終更新 ' + formatHm(stock.fetchedAt) : '';
        }

        if (workCards) {
            workCards.innerHTML = cards.workHtml;
        }

        if (deadlineCards) {
            deadlineCards.innerHTML = cards.deadlineHtml;
        }

        if (status) {
            status.textContent = statusLine;
        }

        if (noticeEl) {
            noticeEl.hidden = !notice;
            noticeEl.textContent = notice;
        }

        if (list) {
            list.innerHTML = renderTable(rows);
        }

        paintSummary();

    };

    const onCard = (card) => {

        notice = '';
        highlightManageNo = '';

        if (card === 'stock:total') {
            workId = '';
            deadlineId = '';
            paint();
            return;
        }

        if (card.indexOf('work:') === 0) {
            const next = card.slice(5);

            workId = workId === next ? '' : next;
            paint();
            return;
        }

        if (card.indexOf('deadline:') === 0) {
            const next = card.slice(9);

            deadlineId = deadlineId === next ? '' : next;
            paint();
        }

    };

    const bind = () => {

        const root = document.getElementById(ROOT_ID);

        if (!root || root.dataset.bound === '1') {
            return;
        }

        root.dataset.bound = '1';

        root.addEventListener('click', (event) => {

            const card = event.target.closest('[data-card]');

            if (card) {
                onCard(card.getAttribute('data-card'));
                return;
            }

            if (event.target.id === 'cayan-fp-refresh') {
                reload('manual');
                return;
            }

            if (event.target.id === 'cayan-fp-clear') {
                workId = '';
                deadlineId = '';
                notice = '';
                highlightManageNo = '';
                paint();
            }

        });

        root.addEventListener('input', (event) => {

            if (event.target.id !== 'cayan-fp-search') {
                return;
            }

            query = event.target.value;
            highlightManageNo = '';
            paint();

        });

        root.addEventListener('keydown', (event) => {

            if (event.target.id !== 'cayan-fp-search') {
                return;
            }

            if (event.key !== 'Enter') {
                return;
            }

            event.preventDefault();
            const manageNo = query.trim();

            if (!manageNo) {
                return;
            }

            const inStock = (stock?.rows || []).some((row) => row.manageNo === manageNo);

            if (inStock || visibleRows().length === 0) {
                lookupManageNo(manageNo);
            }

        });

    };

    const onVisibility = () => {

        if (document.visibilityState === 'visible' && mode) {
            reload('visible');
        }

    };

    const startTimer = () => {

        if (timerId) {
            window.clearInterval(timerId);
        }

        timerId = window.setInterval(() => {
            reload('interval');
        }, cfg().REFRESH_INTERVAL_MS);

        if (!document.body.dataset.floorPortalVisibility) {
            document.addEventListener('visibilitychange', onVisibility);
            document.body.dataset.floorPortalVisibility = '1';
        }

    };

    const stopTimer = () => {

        if (timerId) {
            window.clearInterval(timerId);
            timerId = 0;
        }

    };

    const mount = () => {

        document.body.classList.add(BODY_CLASS);

        let root = document.getElementById(ROOT_ID);

        if (!root) {
            const header = kintone.app.getHeaderSpaceElement();
            const mountPoint = header || document.querySelector('.contents-gaia') || document.body;

            root = document.createElement('div');
            root.id = ROOT_ID;
            root.className = 'cayan-fp-root';
            mountPoint.insertBefore(root, mountPoint.firstChild);
            shellReady = false;
        }

        bind();

        if (!shellReady) {
            shellReady = true;
            paint();
        }

        startTimer();
        reload('initial');

    };

    kintone.events.on('app.record.index.show', (event) => {

        mode = Engine.resolveMode(kintone.app.getId());

        if (!mode) {
            return event;
        }

        mount();

        return event;

    });

    kintone.events.on('app.record.index.hide', (event) => {

        stopTimer();
        document.body.classList.remove(BODY_CLASS);
        mode = '';
        requestSerial += 1;

        const root = document.getElementById(ROOT_ID);

        if (root) {
            root.remove();
        }

        shellReady = false;

        return event;

    });

}());
