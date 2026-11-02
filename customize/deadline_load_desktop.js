(function () {
    'use strict';

    /**
     * 納期負荷カレンダー App89 — 月間カレンダー。
     * App16 / App13 は参照のみ。状態は変更しない。
     */

    const ROOT_ID = 'ayanas-deadline-load-root';
    const BODY_CLASS = 'ayanas-deadline-load-active';

    const Engine = window.CAYANAS_DeadlineLoadEngine;

    if (!Engine || typeof CAYANAS_DEADLINE_LOAD === 'undefined') {
        console.error('[deadline_load] 依存 JS が未読込です。');
        return;
    }

    if (typeof kintone === 'undefined') {
        return;
    }

    const cfg = () => CAYANAS_DEADLINE_LOAD;

    let requestSerial = 0;
    let viewYear = 0;
    let viewMonth = 0;
    let selectedYmd = '';
    let model = null;
    let loading = false;
    let message = '';
    let messageKind = '';

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const kintoneGet = (appId, query, fields) => kintone.api(
        kintone.api.url('/k/v1/records.json', true),
        'GET',
        {
            app: appId,
            query: query,
            fields: fields,
        }
    );

    const fetchOrderPage = async (query) => {

        const response = await kintoneGet(
            cfg().ORDER_APP_ID,
            query,
            Engine.orderFetchFields()
        );

        return response.records || [];

    };

    const fetchProductPage = async (query) => {

        const response = await kintoneGet(
            cfg().PRODUCT_APP_ID,
            query,
            Engine.productFetchFields()
        );

        return response.records || [];

    };

    const loadSubcategoryMap = async (records) => {

        const codes = Engine.collectItemCodes(records);
        const chunks = Engine.chunkItemCodes(codes);
        const products = [];

        for (let index = 0; index < chunks.length; index += 1) {
            const baseQuery = Engine.buildProductQuery(chunks[index]);
            const page = await Engine.fetchAllPages(baseQuery, fetchProductPage);

            products.push(...page.records);
        }

        return Engine.buildSubcategoryMap(products);

    };

    const cellHtml = (cell) => {

        if (!cell) {
            return '<div class="cayan-dl-cell is-blank"></div>';
        }

        const counts = Engine.dayCounts(model, cell.ymd);
        const lines = Engine.visibleCountLines(counts);
        const weekend = cell.isSunday ? ' is-sun' : (cell.isSaturday ? ' is-sat' : '');
        const today = cell.ymd === Engine.todayParts(new Date()).ymd ? ' is-today' : '';
        const selected = cell.ymd === selectedYmd ? ' is-selected' : '';
        const lineHtml = lines.map((line) => (
            '<span class="cayan-dl-count"><span>' + escapeHtml(line.label) + '</span>'
            + '<span>' + escapeHtml(line.count) + '</span></span>'
        )).join('');
        const summary = lines.map((line) => line.label + line.count).join(' ');

        return '<button type="button" class="cayan-dl-cell' + weekend + today + selected + '"'
            + ' data-ymd="' + escapeHtml(cell.ymd) + '"'
            + ' aria-pressed="' + (cell.ymd === selectedYmd ? 'true' : 'false') + '"'
            + ' aria-label="' + escapeHtml(cell.day + '日 ' + summary) + '">'
            + '<span class="cayan-dl-day">' + escapeHtml(cell.day) + '</span>'
            + lineHtml
            + '</button>';

    };

    const calendarHtml = () => {

        const weeks = Engine.buildCalendarWeeks(viewYear, viewMonth);
        const headers = cfg().WEEKDAY_LABELS.map((label, index) => {
            const weekend = index === 6 ? ' is-sun' : (index === 5 ? ' is-sat' : '');

            return '<div class="cayan-dl-dow' + weekend + '">' + escapeHtml(label) + '</div>';
        }).join('');
        const body = weeks.map((week) => (
            '<div class="cayan-dl-week">' + week.map(cellHtml).join('') + '</div>'
        )).join('');

        return '<div class="cayan-dl-grid">' + headers + '</div>' + body;

    };

    const detailRowHtml = (row) => {

        const manageCell = row.recordId
            ? '<a class="cayan-dl-link" href="'
                + escapeHtml(location.origin + Engine.orderDetailPath(row.recordId))
                + '" target="_blank" rel="noopener noreferrer">'
                + escapeHtml(row.manageNo)
                + '</a>'
            : escapeHtml(row.manageNo);
        const duplicate = row.duplicate
            ? '<span class="cayan-dl-dup">' + escapeHtml(cfg().DUPLICATE_LABEL) + '</span>'
            : '';
        const cell = (value, key) => (
            '<td class="' + (key ? 'cayan-dl-key' : '') + '">' + escapeHtml(value) + '</td>'
        );

        return '<tr>'
            + '<td class="cayan-dl-key">' + manageCell + duplicate + '</td>'
            + cell(row.customerName, true)
            + cell(row.clientName, true)
            + cell(row.kimonoType, false)
            + cell(row.processing, true)
            + cell(row.deadline, false)
            + cell(row.processStatus, true)
            + cell(row.workStatus, true)
            + '</tr>';

    };

    const detailGroupHtml = (group) => {

        const body = group.rows.map(detailRowHtml).join('');

        return '<section class="cayan-dl-group">'
            + '<h3 class="cayan-dl-group-title">【'
            + escapeHtml(group.label)
            + '　'
            + escapeHtml(group.count)
            + '件】</h3>'
            + '<div class="cayan-dl-table-wrap"><table class="cayan-dl-table"><thead><tr>'
            + '<th>管理番号</th><th>顧客名</th><th>お客様名</th>'
            + '<th>着物種類</th><th>加工内容</th><th>納期</th>'
            + '<th>現在工程</th><th>作業状態</th>'
            + '</tr></thead><tbody>' + body + '</tbody></table></div>'
            + '</section>';

    };

    const detailHtml = () => {

        if (!selectedYmd) {
            return '';
        }

        const groups = Engine.detailGroups(model, selectedYmd);
        const totalRows = Engine.dayRows(model, selectedYmd).length;
        const heading = '<h2 class="cayan-dl-detail-title">'
            + escapeHtml(Engine.formatLongDate(selectedYmd))
            + '</h2>'
            + '<p class="cayan-dl-detail-count">'
            + escapeHtml(Engine.detailCountText(totalRows))
            + '</p>';

        if (!groups.length) {
            return heading + '<p class="cayan-dl-empty">' + escapeHtml(cfg().MESSAGES.emptyDay) + '</p>';
        }

        return heading + groups.map(detailGroupHtml).join('');

    };

    const paint = () => {

        const root = document.getElementById(ROOT_ID);

        if (!root) {
            return;
        }

        const title = root.querySelector('#cayan-dl-title');
        const note = root.querySelector('#cayan-dl-message');
        const cal = root.querySelector('#cayan-dl-cal');
        const detail = root.querySelector('#cayan-dl-detail');

        title.textContent = Engine.monthBounds(viewYear, viewMonth).label;
        note.textContent = message;
        note.className = 'cayan-dl-message' + (messageKind ? ' is-' + messageKind : '');
        note.hidden = !message;
        cal.innerHTML = loading ? '' : calendarHtml();
        detail.innerHTML = loading ? '' : detailHtml();

        root.querySelectorAll('.cayan-dl-nav button').forEach((button) => {
            button.disabled = loading;
        });

    };

    const loadMonth = async (year, month, nextSelected) => {

        const ticket = requestSerial + 1;

        requestSerial = ticket;
        viewYear = year;
        viewMonth = month;
        selectedYmd = nextSelected || '';
        loading = true;
        message = cfg().MESSAGES.loading;
        messageKind = 'info';
        model = null;
        paint();

        try {
            const fetched = await Engine.fetchAllPages(
                Engine.buildMonthQuery(year, month),
                fetchOrderPage
            );

            if (ticket !== requestSerial) {
                return;
            }

            const subcategoryByCode = await loadSubcategoryMap(fetched.records);

            if (ticket !== requestSerial) {
                return;
            }

            model = Engine.aggregateMonth(fetched.records, subcategoryByCode, year, month);
            loading = false;
            message = fetched.truncated ? cfg().MESSAGES.truncated : '';
            messageKind = fetched.truncated ? 'warn' : '';
            paint();
        } catch (error) {
            if (ticket !== requestSerial) {
                return;
            }

            console.error(
                '[deadline_load]',
                error && error.code,
                error && error.message,
                error
            );
            loading = false;
            model = null;
            message = cfg().MESSAGES.failed;
            messageKind = 'error';
            paint();
        }

    };

    const shellHtml = () => (
        '<header class="cayan-dl-header">'
        + '<h1 class="cayan-dl-title">納期負荷カレンダー</h1>'
        + '<p class="cayan-dl-lead">受注の納期ごとに、丸洗い・しみ／海外仕立／国内仕立／修理／帯仕立の点数を確認します。</p>'
        + '</header>'
        + '<div class="cayan-dl-nav">'
        + '<button type="button" class="cayan-dl-btn" id="cayan-dl-prev">＜ 前月</button>'
        + '<h2 class="cayan-dl-month" id="cayan-dl-title"></h2>'
        + '<button type="button" class="cayan-dl-btn" id="cayan-dl-next">翌月 ＞</button>'
        + '<button type="button" class="cayan-dl-btn is-primary" id="cayan-dl-today">今日</button>'
        + '</div>'
        + '<p class="cayan-dl-message" id="cayan-dl-message" hidden></p>'
        + '<div class="cayan-dl-cal-wrap"><div id="cayan-dl-cal"></div></div>'
        + '<section class="cayan-dl-detail" id="cayan-dl-detail"></section>'
    );

    const bind = (root) => {

        if (root.dataset.bound === '1') {
            return;
        }

        root.dataset.bound = '1';

        root.querySelector('#cayan-dl-prev').addEventListener('click', () => {
            const next = Engine.shiftMonth(viewYear, viewMonth, -1);
            loadMonth(next.year, next.month, '');
        });

        root.querySelector('#cayan-dl-next').addEventListener('click', () => {
            const next = Engine.shiftMonth(viewYear, viewMonth, 1);
            loadMonth(next.year, next.month, '');
        });

        root.querySelector('#cayan-dl-today').addEventListener('click', () => {
            const today = Engine.todayParts(new Date());
            loadMonth(today.year, today.month, today.ymd);
        });

        root.querySelector('#cayan-dl-cal').addEventListener('click', (event) => {
            const button = event.target.closest('[data-ymd]');

            if (!button || loading) {
                return;
            }

            selectedYmd = button.getAttribute('data-ymd') || '';
            paint();
        });

    };

    const mount = () => {

        document.body.classList.add(BODY_CLASS);

        let root = document.getElementById(ROOT_ID);

        if (!root) {
            const header = kintone.app.getHeaderSpaceElement();
            const mountPoint = header || document.querySelector('.contents-gaia') || document.body;

            root = document.createElement('div');
            root.id = ROOT_ID;
            root.className = 'cayan-dl-root';
            root.innerHTML = shellHtml();
            mountPoint.insertBefore(root, mountPoint.firstChild);
        }

        bind(root);

        const today = Engine.todayParts(new Date());

        loadMonth(today.year, today.month, today.ymd);

    };

    kintone.events.on('app.record.index.show', (event) => {

        if (kintone.app.getId() !== cfg().DEADLINE_LOAD_APP_ID) {
            return event;
        }

        mount();

        return event;

    });

    kintone.events.on('app.record.index.hide', (event) => {

        requestSerial += 1;
        document.body.classList.remove(BODY_CLASS);

        const root = document.getElementById(ROOT_ID);

        if (root) {
            root.remove();
        }

        model = null;
        selectedYmd = '';
        message = '';
        messageKind = '';
        loading = false;

        return event;

    });

}());
