(function () {
    'use strict';

    /**
     * 店舗納期カレンダー App92 — A550 表示専用。
     * App16 / App13 は参照のみ。状態は変更しない。
     */

    const ROOT_ID = 'ayanas-store-deadline-root';
    const BODY_CLASS = 'ayanas-store-deadline-active';

    const Engine = window.CAYANAS_StoreDeadlineEngine;

    if (typeof kintone === 'undefined') {
        return;
    }

    const showBootError = (text) => {
        try {
            const mountPoint = document.querySelector('.contents-gaia')
                || document.body;
            let box = document.getElementById('ayanas-store-deadline-boot-error');

            if (!box) {
                box = document.createElement('div');
                box.id = 'ayanas-store-deadline-boot-error';
                box.style.cssText = 'margin:16px;padding:14px 16px;border:2px solid #fda4af;'
                    + 'background:#fff1f2;color:#9f1239;font-size:16px;font-weight:700;';
                mountPoint.insertBefore(box, mountPoint.firstChild);
            }

            box.textContent = text;
        } catch (error) {
            console.error('[store_deadline] boot error', error);
        }
    };

    if (!Engine || typeof CAYANAS_STORE_DEADLINE === 'undefined') {
        console.error('[store_deadline] 依存 JS が未読込です。');
        kintone.events.on('app.record.index.show', (event) => {
            if (Number(kintone.app.getId()) === 92) {
                showBootError(
                    '店舗納期カレンダーのJS読込に失敗しました。'
                    + 'store_deadline_config.js → store_deadline_engine.js → store_deadline_desktop.js'
                    + ' の順で登録してください。'
                );
            }

            return event;
        });
        return;
    }

    const cfg = () => CAYANAS_STORE_DEADLINE;

    let requestSerial = 0;
    let viewYear = 0;
    let viewMonth = 0;
    let selectedYmd = '';
    let selectedKpi = '';
    let model = null;
    let kpiModel = null;
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

    const formatApiError = (error) => {

        if (!error) {
            return cfg().MESSAGES.failed;
        }

        const code = error.code || error.errorCode || '';
        const text = error.message || error.errorMessage || String(error);
        const id = error.id ? ' id=' + error.id : '';

        if (code) {
            return cfg().MESSAGES.failed + ' [' + code + '] ' + text + id;
        }

        return cfg().MESSAGES.failed + ' ' + text;

    };

    const loadSubcategoryMap = async (records) => {

        const codes = Engine.collectItemCodes(records);

        if (!codes.length) {
            return {
                map: new Map(),
                truncated: false,
                denied: false,
            };
        }

        const chunks = Engine.chunkItemCodes(codes);
        const products = [];
        let truncated = false;

        for (let index = 0; index < chunks.length; index += 1) {
            const baseQuery = Engine.buildProductQuery(chunks[index]);

            if (!baseQuery) {
                continue;
            }

            const page = await Engine.fetchAllPages(baseQuery, fetchProductPage);

            products.push(...page.records);
            truncated = truncated || page.truncated;
        }

        return {
            map: Engine.buildSubcategoryMap(products),
            truncated: truncated,
            denied: false,
        };

    };

    const mergeUniqueRecords = (lists) => {

        const map = new Map();

        lists.forEach((list) => {
            (Array.isArray(list) ? list : []).forEach((record) => {
                const id = String(record?.$id?.value ?? '');

                if (id) {
                    map.set(id, record);
                }
            });
        });

        return [...map.values()];

    };

    const cellHtml = (cell) => {

        if (!cell) {
            return '<div class="cayan-sd-cell is-blank"></div>';
        }

        const today = Engine.todayParts(new Date()).ymd;
        const counts = Engine.dayCounts(model, cell.ymd);
        const lines = Engine.visibleCountLines(counts);
        const weekend = cell.isSunday ? ' is-sun' : (cell.isSaturday ? ' is-sat' : '');
        const isToday = cell.ymd === today ? ' is-today' : '';
        const selected = cell.ymd === selectedYmd ? ' is-selected' : '';
        const overdue = cell.ymd < today && lines.length > 0 ? ' is-overdue' : '';
        const lineHtml = lines.map((line) => (
            '<span class="cayan-sd-count"><span>' + escapeHtml(line.label) + '</span>'
            + '<span>' + escapeHtml(line.count) + '</span></span>'
        )).join('');
        const summary = lines.map((line) => line.label + line.count).join(' ');

        return '<button type="button" class="cayan-sd-cell' + weekend + isToday + selected + overdue + '"'
            + ' data-ymd="' + escapeHtml(cell.ymd) + '"'
            + ' aria-pressed="' + (cell.ymd === selectedYmd ? 'true' : 'false') + '"'
            + ' aria-label="' + escapeHtml(cell.day + '日 ' + summary) + '">'
            + '<span class="cayan-sd-day">' + escapeHtml(cell.day) + '</span>'
            + lineHtml
            + '</button>';

    };

    const calendarHtml = () => {

        const weeks = Engine.buildCalendarWeeks(viewYear, viewMonth);
        const headers = cfg().WEEKDAY_LABELS.map((label, index) => {
            const weekend = index === 6 ? ' is-sun' : (index === 5 ? ' is-sat' : '');

            return '<div class="cayan-sd-dow' + weekend + '">' + escapeHtml(label) + '</div>';
        }).join('');
        const body = weeks.map((week) => (
            '<div class="cayan-sd-week">' + week.map(cellHtml).join('') + '</div>'
        )).join('');

        return '<div class="cayan-sd-grid">' + headers + '</div>' + body;

    };

    const kpiHtml = () => {

        const counts = kpiModel?.counts || {
            overdue: 0,
            today: 0,
            within7: 0,
            ready: 0,
        };
        const items = [
            cfg().KPI.overdue,
            cfg().KPI.today,
            cfg().KPI.within7,
            cfg().KPI.ready,
        ];

        return '<div class="cayan-sd-kpi" role="group" aria-label="店舗KPI">'
            + items.map((item) => {
                const active = selectedKpi === item.key ? ' is-active' : '';
                const tone = item.key === 'overdue' ? ' is-overdue' : (item.key === 'ready' ? ' is-ready' : '');

                return '<button type="button" class="cayan-sd-kpi-card' + active + tone + '"'
                    + ' data-kpi="' + escapeHtml(item.key) + '"'
                    + ' aria-pressed="' + (selectedKpi === item.key ? 'true' : 'false') + '">'
                    + '<span class="cayan-sd-kpi-label">' + escapeHtml(item.label) + '</span>'
                    + '<span class="cayan-sd-kpi-count">' + escapeHtml(counts[item.key] || 0) + '</span>'
                    + '</button>';
            }).join('')
            + '</div>';

    };

    const detailRowHtml = (row) => {

        const manageCell = row.recordId
            ? '<a class="cayan-sd-link" href="'
                + escapeHtml(location.origin + Engine.orderDetailPath(row.recordId))
                + '" target="_blank" rel="noopener noreferrer">'
                + escapeHtml(row.manageNo)
                + '</a>'
            : escapeHtml(row.manageNo);
        const duplicate = row.duplicate
            ? '<span class="cayan-sd-dup">' + escapeHtml(cfg().DUPLICATE_LABEL) + '</span>'
            : '';
        const cell = (value, key) => (
            '<td class="' + (key ? 'cayan-sd-key' : '') + '">' + escapeHtml(value) + '</td>'
        );

        return '<tr>'
            + '<td class="cayan-sd-key">' + manageCell + duplicate + '</td>'
            + cell(row.clientName, true)
            + cell(row.kimonoType, false)
            + cell(row.processing, true)
            + cell(row.deadline || '（未設定）', false)
            + cell(row.processStatus, true)
            + cell(row.locationStatus, true)
            + cell(row.workStatus, true)
            + cell(row.deliveryStatus, true)
            + '</tr>';

    };

    const tableWrap = (bodyRows) => (
        '<div class="cayan-sd-table-wrap"><table class="cayan-sd-table"><thead><tr>'
        + '<th>管理番号</th><th>お客様名</th><th>着物種類</th><th>加工内容</th>'
        + '<th>納期</th><th>工程</th><th>保管場所</th><th>作業状態</th><th>納品状態</th>'
        + '</tr></thead><tbody>' + bodyRows + '</tbody></table></div>'
    );

    const detailGroupHtml = (group) => (
        '<section class="cayan-sd-group">'
        + '<h3 class="cayan-sd-group-title">【'
        + escapeHtml(group.label)
        + '　'
        + escapeHtml(group.count)
        + '件】</h3>'
        + tableWrap(group.rows.map(detailRowHtml).join(''))
        + '</section>'
    );

    const dayDetailHtml = () => {

        if (!selectedYmd) {
            return '';
        }

        const groups = Engine.detailGroups(model, selectedYmd);
        const totalRows = Engine.dayRows(model, selectedYmd).length;
        const heading = '<h2 class="cayan-sd-detail-title">'
            + escapeHtml(Engine.formatLongDate(selectedYmd))
            + '</h2>'
            + '<p class="cayan-sd-detail-count">'
            + escapeHtml(Engine.detailCountText(totalRows))
            + '</p>';

        if (!groups.length) {
            return heading + '<p class="cayan-sd-empty">' + escapeHtml(cfg().MESSAGES.emptyDay) + '</p>';
        }

        return heading + groups.map(detailGroupHtml).join('');

    };

    const kpiDetailHtml = () => {

        if (!selectedKpi || !kpiModel) {
            return '';
        }

        const meta = cfg().KPI[selectedKpi];
        const rows = kpiModel.lists?.[selectedKpi] || [];
        const heading = '<h2 class="cayan-sd-detail-title">'
            + escapeHtml(meta ? meta.label : selectedKpi)
            + '</h2>'
            + '<p class="cayan-sd-detail-count">'
            + escapeHtml((meta ? meta.label : '') + ' ' + rows.length + cfg().MESSAGES.kpiSuffix)
            + '</p>';

        if (!rows.length) {
            return heading + '<p class="cayan-sd-empty">' + escapeHtml(cfg().MESSAGES.emptyKpi) + '</p>';
        }

        return heading + tableWrap(rows.map(detailRowHtml).join(''));

    };

    const detailHtml = () => {

        if (selectedKpi) {
            return kpiDetailHtml();
        }

        return dayDetailHtml();

    };

    const paint = () => {

        const root = document.getElementById(ROOT_ID);

        if (!root) {
            return;
        }

        try {
            const title = root.querySelector('#cayan-sd-title');
            const note = root.querySelector('#cayan-sd-message');
            const kpi = root.querySelector('#cayan-sd-kpi');
            const cal = root.querySelector('#cayan-sd-cal');
            const detail = root.querySelector('#cayan-sd-detail');
            const ver = root.querySelector('#cayan-sd-version');

            if (title) {
                title.textContent = Engine.monthBounds(viewYear, viewMonth).label;
            }

            if (ver) {
                ver.textContent = 'v' + cfg().VERSION;
            }

            if (note) {
                note.textContent = message;
                note.className = 'cayan-sd-message' + (messageKind ? ' is-' + messageKind : '');
                note.hidden = !message;
            }

            if (kpi) {
                kpi.innerHTML = loading ? '' : kpiHtml();
            }

            if (cal) {
                cal.innerHTML = loading ? '' : calendarHtml();
            }

            if (detail) {
                detail.innerHTML = loading ? '' : detailHtml();
            }

            root.querySelectorAll('.cayan-sd-nav button').forEach((button) => {
                button.disabled = loading;
            });
        } catch (error) {
            console.error('[store_deadline] paint', error);
            message = formatApiError(error);
            messageKind = 'error';

            const note = root.querySelector('#cayan-sd-message');

            if (note) {
                note.textContent = message;
                note.className = 'cayan-sd-message is-error';
                note.hidden = false;
            }
        }

    };

    const loadMonth = async (year, month, nextSelected) => {

        const ticket = requestSerial + 1;

        requestSerial = ticket;
        viewYear = year;
        viewMonth = month;
        selectedYmd = nextSelected || '';
        selectedKpi = '';
        loading = true;
        message = cfg().MESSAGES.loading;
        messageKind = 'info';
        model = null;
        kpiModel = null;
        paint();

        try {
            const today = Engine.todayParts(new Date()).ymd;
            const monthFetched = await Engine.fetchAllPages(
                Engine.buildMonthQuery(year, month),
                fetchOrderPage
            );

            if (ticket !== requestSerial) {
                return;
            }

            let kpiFetched = { records: [], truncated: false };
            let kpiWarning = '';

            try {
                kpiFetched = await Engine.fetchAllPages(
                    Engine.buildKpiPoolQuery(today),
                    fetchOrderPage
                );
            } catch (kpiError) {
                console.error('[store_deadline] KPI取得失敗', kpiError);
                kpiWarning = formatApiError(kpiError);
            }

            if (ticket !== requestSerial) {
                return;
            }

            const allRecords = mergeUniqueRecords([
                monthFetched.records,
                kpiFetched.records,
            ]);

            let subcategoryByCode = new Map();
            let productDenied = false;
            let productTruncated = false;

            try {
                const productResult = await loadSubcategoryMap(allRecords);

                subcategoryByCode = productResult.map;
                productTruncated = productResult.truncated;
            } catch (productError) {
                console.error('[store_deadline] App13取得失敗', productError);
                productDenied = true;
                subcategoryByCode = new Map();
            }

            if (ticket !== requestSerial) {
                return;
            }

            model = Engine.aggregateMonth(
                monthFetched.records,
                subcategoryByCode,
                year,
                month,
                { excludeDelivered: true }
            );
            kpiModel = Engine.buildKpiModel(allRecords, subcategoryByCode, today);
            loading = false;

            const dayCount = model && model.days ? Object.keys(model.days).length : 0;
            const notes = [];

            if (monthFetched.truncated || kpiFetched.truncated || productTruncated) {
                notes.push(cfg().MESSAGES.truncated);
            }

            if (productDenied) {
                notes.push(cfg().MESSAGES.productDenied);
            }

            if (kpiWarning) {
                notes.push('KPI: ' + kpiWarning);
            }

            if (dayCount === 0) {
                notes.push(
                    cfg().MESSAGES.emptyMonth
                    + '（月次取得 '
                    + monthFetched.records.length
                    + '件 / KPI取得 '
                    + kpiFetched.records.length
                    + '件）'
                );
            }

            message = notes.join(' ');
            messageKind = notes.length ? 'warn' : '';
            paint();
        } catch (error) {
            if (ticket !== requestSerial) {
                return;
            }

            console.error(
                '[store_deadline]',
                error && error.code,
                error && error.message,
                error
            );
            loading = false;
            model = null;
            kpiModel = null;
            message = formatApiError(error);
            messageKind = 'error';
            paint();
        }

    };

    const shellHtml = () => (
        '<header class="cayan-sd-header">'
        + '<h1 class="cayan-sd-title">店舗納期カレンダー'
        + ' <span class="cayan-sd-version" id="cayan-sd-version">v'
        + escapeHtml(cfg().VERSION)
        + '</span></h1>'
        + '<p class="cayan-sd-lead">' + escapeHtml(cfg().MESSAGES.lead) + '</p>'
        + '</header>'
        + '<div id="cayan-sd-kpi"></div>'
        + '<div class="cayan-sd-nav">'
        + '<button type="button" class="cayan-sd-btn" id="cayan-sd-prev">＜ 前月</button>'
        + '<h2 class="cayan-sd-month" id="cayan-sd-title"></h2>'
        + '<button type="button" class="cayan-sd-btn" id="cayan-sd-next">翌月 ＞</button>'
        + '<button type="button" class="cayan-sd-btn is-primary" id="cayan-sd-today">今日</button>'
        + '</div>'
        + '<p class="cayan-sd-message" id="cayan-sd-message" hidden></p>'
        + '<div class="cayan-sd-cal-wrap"><div id="cayan-sd-cal"></div></div>'
        + '<section class="cayan-sd-detail" id="cayan-sd-detail"></section>'
    );

    const bind = (root) => {

        if (root.dataset.bound === '1') {
            return;
        }

        root.dataset.bound = '1';

        root.querySelector('#cayan-sd-prev').addEventListener('click', () => {
            const next = Engine.shiftMonth(viewYear, viewMonth, -1);
            loadMonth(next.year, next.month, '');
        });

        root.querySelector('#cayan-sd-next').addEventListener('click', () => {
            const next = Engine.shiftMonth(viewYear, viewMonth, 1);
            loadMonth(next.year, next.month, '');
        });

        root.querySelector('#cayan-sd-today').addEventListener('click', () => {
            const today = Engine.todayParts(new Date());
            loadMonth(today.year, today.month, today.ymd);
        });

        root.querySelector('#cayan-sd-kpi').addEventListener('click', (event) => {
            const button = event.target.closest('[data-kpi]');

            if (!button || loading) {
                return;
            }

            const key = button.getAttribute('data-kpi') || '';

            selectedKpi = selectedKpi === key ? '' : key;

            if (selectedKpi) {
                selectedYmd = '';
            }

            paint();
        });

        root.querySelector('#cayan-sd-cal').addEventListener('click', (event) => {
            const button = event.target.closest('[data-ymd]');

            if (!button || loading) {
                return;
            }

            selectedYmd = button.getAttribute('data-ymd') || '';
            selectedKpi = '';
            paint();
        });

    };

    const mount = () => {

        let root = document.getElementById(ROOT_ID);

        if (!root) {
            const mountPoint = document.querySelector('.contents-gaia')
                || kintone.app.getHeaderSpaceElement()
                || document.body;

            root = document.createElement('div');
            root.id = ROOT_ID;
            root.className = 'cayan-sd-root';
            root.innerHTML = shellHtml();
            mountPoint.insertBefore(root, mountPoint.firstChild);
        }

        document.body.classList.add(BODY_CLASS);
        bind(root);

        const today = Engine.todayParts(new Date());

        loadMonth(today.year, today.month, today.ymd);

    };

    kintone.events.on('app.record.index.show', (event) => {

        if (Number(kintone.app.getId()) !== Number(cfg().STORE_DEADLINE_APP_ID)) {
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
        kpiModel = null;
        selectedYmd = '';
        selectedKpi = '';
        message = '';
        messageKind = '';
        loading = false;

        return event;

    });

}());
