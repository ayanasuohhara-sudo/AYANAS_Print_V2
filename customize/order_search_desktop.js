(function () {
    'use strict';

    /**
     * 受注検索 App88 — 一覧画面の検索UI（ふりがな予測対応）。
     * App16 は参照のみ。ふりがなの確定保存は App16 編集画面側。
     */

    const ROOT_ID = 'ayanas-order-search-root';
    const BODY_CLASS = 'ayanas-order-search-active';

    const Engine = window.CAYANAS_OrderSearchEngine;

    if (!Engine || typeof CAYANAS_ORDER_SEARCH === 'undefined') {
        console.error('[order_search] 依存 JS が未読込です。');
        return;
    }

    if (typeof kintone === 'undefined') {
        return;
    }

    const cfg = () => CAYANAS_ORDER_SEARCH;

    let requestSerial = 0;
    let suggestSerial = 0;
    let suggestTimer = null;
    let rows = [];
    let message = '';
    let messageKind = '';
    let countText = '';
    let loading = false;
    let suggestions = [];

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const readForm = (root) => ({
        customerCode: root.querySelector('#cayan-os-customer-code')?.value ?? '',
        customerName: root.querySelector('#cayan-os-customer-name')?.value ?? '',
        clientName: root.querySelector('#cayan-os-client-name')?.value ?? '',
        clientNameKana: root.querySelector('#cayan-os-client-kana')?.value ?? '',
        slipNo: root.querySelector('#cayan-os-slip-no')?.value ?? '',
        manageNo: root.querySelector('#cayan-os-manage-no')?.value ?? '',
        kimonoType: root.querySelector('#cayan-os-kimono-type')?.value ?? '',
        orderDateFrom: root.querySelector('#cayan-os-order-from')?.value ?? '',
        orderDateTo: root.querySelector('#cayan-os-order-to')?.value ?? '',
        includeDelivered: Boolean(root.querySelector('#cayan-os-include-delivered')?.checked),
        excludeA550: Boolean(root.querySelector('#cayan-os-exclude-a550')?.checked),
    });

    const writeForm = (root, input) => {

        const values = input || Engine.clearedInput();

        root.querySelector('#cayan-os-customer-code').value = values.customerCode;
        root.querySelector('#cayan-os-customer-name').value = values.customerName;
        root.querySelector('#cayan-os-client-name').value = values.clientName;
        root.querySelector('#cayan-os-client-kana').value = values.clientNameKana || '';
        root.querySelector('#cayan-os-slip-no').value = values.slipNo;
        root.querySelector('#cayan-os-manage-no').value = values.manageNo;
        root.querySelector('#cayan-os-kimono-type').value = values.kimonoType || '';
        root.querySelector('#cayan-os-order-from').value = values.orderDateFrom || '';
        root.querySelector('#cayan-os-order-to').value = values.orderDateTo || '';
        root.querySelector('#cayan-os-include-delivered').checked = values.includeDelivered === true;
        root.querySelector('#cayan-os-exclude-a550').checked = values.excludeA550 === true;

    };

    const cell = (value, key) => (
        '<td class="' + (key ? 'cayan-os-key' : '') + '">' + escapeHtml(value) + '</td>'
    );

    const statusBadge = (row) => {

        if (!row.clientNameKana) {
            return '<span class="cayan-os-badge is-empty">ふりがな未登録</span>';
        }

        if (row.clientNameKanaStatus === cfg().KANA_STATUS.confirmed) {
            return '<span class="cayan-os-badge is-ok">確認済</span>';
        }

        if (row.clientNameKanaStatus === cfg().KANA_STATUS.unknown) {
            return '<span class="cayan-os-badge is-unknown">不明</span>';
        }

        return '<span class="cayan-os-badge is-pending">未確認</span>';

    };

    const renderRows = () => {

        if (!rows.length) {
            return '';
        }

        return rows.map((row) => {

            const manageCell = row.recordId
                ? '<a class="cayan-os-link" href="'
                    + escapeHtml(location.origin + Engine.orderDetailPath(row.recordId))
                    + '" target="_blank" rel="noopener noreferrer">'
                    + escapeHtml(row.manageNo)
                    + '</a>'
                : escapeHtml(row.manageNo);
            const duplicate = row.duplicate
                ? '<span class="cayan-os-dup">' + escapeHtml(cfg().DUPLICATE_LABEL) + '</span>'
                : '';
            const editLink = row.recordId
                ? '<a class="cayan-os-link cayan-os-edit" href="'
                    + escapeHtml(location.origin + Engine.orderEditPath(row.recordId))
                    + '" target="_blank" rel="noopener noreferrer">ふりがな登録</a>'
                : '';

            return '<tr>'
                + '<td class="cayan-os-key">' + manageCell + duplicate + '</td>'
                + cell(row.deadline, true)
                + cell(row.orderDate, false)
                + cell(row.customerCode, false)
                + cell(row.customerName, true)
                + cell(row.clientName, true)
                + '<td class="cayan-os-key">' + escapeHtml(row.clientNameKana) + ' ' + statusBadge(row) + '</td>'
                + cell(row.slipNo, false)
                + cell(row.kimonoType, false)
                + cell(row.kimonoSpec, false)
                + cell(row.processing, true)
                + cell(row.processStatus, true)
                + cell(row.workStatus, true)
                + cell(row.locationStatus, true)
                + cell(row.deliveryStatus, true)
                + '<td>' + editLink + '</td>'
                + '</tr>';

        }).join('');

    };

    const paintSuggestions = () => {

        const root = document.getElementById(ROOT_ID);

        if (!root) {
            return;
        }

        const box = root.querySelector('#cayan-os-suggest');

        if (!box) {
            return;
        }

        if (!suggestions.length) {
            box.hidden = true;
            box.innerHTML = '';
            return;
        }

        box.hidden = false;
        box.innerHTML = suggestions.map((item, index) => {

            const badge = item.unconfirmed
                ? '<span class="cayan-os-badge is-pending">未確認含む</span>'
                : '<span class="cayan-os-badge is-ok">確認済</span>';
            const kimono = (item.kimonoTypes || []).slice(0, 3).join('・');

            return '<button type="button" class="cayan-os-suggest-item" data-index="' + index + '">'
                + '<span class="cayan-os-suggest-main">'
                + escapeHtml(item.clientNameKana) + ' / ' + escapeHtml(item.clientName)
                + '</span>'
                + '<span class="cayan-os-suggest-meta">'
                + escapeHtml(item.customerCode) + ' '
                + escapeHtml(item.customerName) + ' '
                + escapeHtml(kimono) + ' '
                + item.count + '件 '
                + badge
                + '</span>'
                + '</button>';

        }).join('');

    };

    const paintResults = () => {

        const root = document.getElementById(ROOT_ID);

        if (!root) {
            return;
        }

        const count = root.querySelector('#cayan-os-count');
        const note = root.querySelector('#cayan-os-message');
        const body = root.querySelector('#cayan-os-body');
        const table = root.querySelector('#cayan-os-table');

        count.textContent = countText;
        note.textContent = message;
        note.className = 'cayan-os-message' + (messageKind ? ' is-' + messageKind : '');
        note.hidden = !message;
        body.innerHTML = renderRows();
        table.hidden = rows.length === 0;
        paintSuggestions();

    };

    const hideSuggestions = () => {

        suggestions = [];
        paintSuggestions();

    };

    const runSuggest = async () => {

        const root = document.getElementById(ROOT_ID);

        if (!root) {
            return;
        }

        const form = readForm(root);
        const plan = Engine.buildSuggestRequest(form);

        if (!plan.ok) {
            hideSuggestions();
            return;
        }

        const serial = suggestSerial + 1;

        suggestSerial = serial;

        try {
            const response = await kintone.api(
                kintone.api.url('/k/v1/records.json', true),
                'GET',
                {
                    app: cfg().ORDER_APP_ID,
                    query: plan.query,
                    fields: Engine.fetchFields(),
                }
            );

            if (serial !== suggestSerial) {
                return;
            }

            suggestions = Engine.buildSuggestItems(response.records || [], form.clientNameKana);
            paintSuggestions();
        } catch (error) {
            console.error('[order_search suggest]', error && error.code, error && error.message, error);
            if (serial === suggestSerial) {
                hideSuggestions();
            }
        }

    };

    const scheduleSuggest = () => {

        if (suggestTimer) {
            clearTimeout(suggestTimer);
        }

        suggestTimer = setTimeout(() => {
            runSuggest();
        }, cfg().SUGGEST_DEBOUNCE_MS);

    };

    const applySuggestion = (index) => {

        const root = document.getElementById(ROOT_ID);
        const item = suggestions[index];

        if (!root || !item) {
            return;
        }

        root.querySelector('#cayan-os-client-kana').value = item.clientNameKana || '';
        root.querySelector('#cayan-os-client-name').value = item.clientName || '';

        if (item.customerCode && !root.querySelector('#cayan-os-customer-code').value) {
            root.querySelector('#cayan-os-customer-code').value = item.customerCode;
        }

        hideSuggestions();
        runSearch();

    };

    const runSearch = async () => {

        const root = document.getElementById(ROOT_ID);

        if (!root) {
            return;
        }

        hideSuggestions();

        const form = readForm(root);
        const plan = Engine.buildSearchRequest(form);

        if (!plan.ok) {
            requestSerial += 1;
            loading = false;
            rows = [];
            countText = '';
            message = plan.message;
            messageKind = 'warn';
            paintResults();
            return;
        }

        const serial = requestSerial + 1;

        requestSerial = serial;
        loading = true;
        rows = [];
        countText = '';
        message = cfg().MESSAGES.loading;
        messageKind = 'info';
        paintResults();

        try {
            const pageResult = await Engine.fetchAllPages(plan.query, async (query) => {

                const response = await kintone.api(
                    kintone.api.url('/k/v1/records.json', true),
                    'GET',
                    {
                        app: cfg().ORDER_APP_ID,
                        query,
                        fields: Engine.fetchFields(),
                    }
                );

                return response.records || [];

            });

            if (serial !== requestSerial) {
                return;
            }

            const truncatedFetch = Boolean(pageResult.truncated);
            let built = Engine.buildRows(pageResult.records || []);

            built = Engine.filterRowsByKana(built, plan.criteria);

            const limited = Engine.applyDisplayLimit(built);

            rows = limited.rows;
            countText = Engine.resultCountText(rows.length, {
                truncated: truncatedFetch || limited.truncated,
            });
            message = rows.length === 0
                ? cfg().MESSAGES.empty
                : (form.clientNameKana ? '' : cfg().MESSAGES.kanaEmptyNote);
            messageKind = rows.length === 0 ? 'empty' : (form.clientNameKana ? '' : 'info');
            loading = false;
            paintResults();
        } catch (error) {

            if (serial !== requestSerial) {
                return;
            }

            console.error('[order_search]', error && error.code, error && error.message, error);
            loading = false;
            rows = [];
            countText = '';
            message = cfg().MESSAGES.failed;
            messageKind = 'error';
            paintResults();

        }

    };

    const clearSearch = () => {

        const root = document.getElementById(ROOT_ID);

        if (!root) {
            return;
        }

        requestSerial += 1;
        suggestSerial += 1;
        loading = false;
        writeForm(root, Engine.clearedInput());
        rows = [];
        countText = '';
        message = '';
        messageKind = '';
        hideSuggestions();
        paintResults();

    };

    const shellHtml = () => (
        '<header class="cayan-os-header">'
        + '<h1 class="cayan-os-title">受注検索</h1>'
        + '<p class="cayan-os-lead">法人コードとお客様名ふりがなで過去受注を探せます。同姓同名は統合しません。</p>'
        + '</header>'
        + '<form class="cayan-os-form" id="cayan-os-form" autocomplete="off">'
        + '<label class="cayan-os-field"><span>顧客コード</span>'
        + '<input id="cayan-os-customer-code" type="text" inputmode="text"></label>'
        + '<label class="cayan-os-field"><span>顧客名</span>'
        + '<input id="cayan-os-customer-name" type="text"></label>'
        + '<label class="cayan-os-field cayan-os-field--suggest"><span>お客様名ふりがな</span>'
        + '<input id="cayan-os-client-kana" type="text" placeholder="やまもときよこ" autocomplete="off">'
        + '<div class="cayan-os-suggest" id="cayan-os-suggest" hidden></div>'
        + '<span class="cayan-os-hint">' + escapeHtml(cfg().MESSAGES.suggestHint) + '</span></label>'
        + '<label class="cayan-os-field"><span>お客様名（漢字）</span>'
        + '<input id="cayan-os-client-name" type="text"></label>'
        + '<label class="cayan-os-field"><span>着物種類</span>'
        + '<input id="cayan-os-kimono-type" type="text" placeholder="訪問着"></label>'
        + '<label class="cayan-os-field"><span>管理番号</span>'
        + '<input id="cayan-os-manage-no" type="text" inputmode="numeric"></label>'
        + '<label class="cayan-os-field"><span>得意先伝票番号</span>'
        + '<input id="cayan-os-slip-no" type="text"></label>'
        + '<label class="cayan-os-field"><span>受注日（開始）</span>'
        + '<input id="cayan-os-order-from" type="date"></label>'
        + '<label class="cayan-os-field"><span>受注日（終了）</span>'
        + '<input id="cayan-os-order-to" type="date"></label>'
        + '<label class="cayan-os-check"><input id="cayan-os-include-delivered" type="checkbox">'
        + '<span>納品済を含む</span></label>'
        + '<label class="cayan-os-check"><input id="cayan-os-exclude-a550" type="checkbox">'
        + '<span>' + escapeHtml(cfg().MESSAGES.excludeA550) + '</span></label>'
        + '<div class="cayan-os-actions">'
        + '<button type="button" class="cayan-os-btn is-primary" id="cayan-os-search">検索</button>'
        + '<button type="button" class="cayan-os-btn" id="cayan-os-clear">クリア</button>'
        + '</div>'
        + '</form>'
        + '<p class="cayan-os-count" id="cayan-os-count"></p>'
        + '<p class="cayan-os-message" id="cayan-os-message" hidden></p>'
        + '<p class="cayan-os-limit">取得: 1ページ ' + cfg().PAGE_LIMIT + ' 件 / offset 上限 '
        + cfg().MAX_OFFSET + ' / 画面表示上限 ' + cfg().DISPLAY_LIMIT + ' 件</p>'
        + '<div class="cayan-os-table-wrap">'
        + '<table class="cayan-os-table" id="cayan-os-table" hidden>'
        + '<thead><tr>'
        + '<th>管理番号</th><th>納期</th><th>受注日</th><th>顧客コード</th><th>顧客名</th>'
        + '<th>お客様名</th><th>ふりがな</th><th>得意先伝票番号</th><th>着物種類</th><th>着物仕様</th>'
        + '<th>加工内容</th><th>工程</th><th>作業状態</th><th>保管場所</th><th>納品状態</th><th>操作</th>'
        + '</tr></thead>'
        + '<tbody id="cayan-os-body"></tbody>'
        + '</table>'
        + '</div>'
    );

    const bind = (root) => {

        if (root.dataset.bound === '1') {
            return;
        }

        root.dataset.bound = '1';

        root.querySelector('#cayan-os-search').addEventListener('click', () => {
            runSearch();
        });

        root.querySelector('#cayan-os-clear').addEventListener('click', () => {
            clearSearch();
        });

        root.querySelector('#cayan-os-client-kana').addEventListener('input', () => {
            scheduleSuggest();
        });

        root.querySelector('#cayan-os-suggest').addEventListener('click', (event) => {

            const button = event.target.closest('.cayan-os-suggest-item');

            if (!button) {
                return;
            }

            applySuggestion(Number(button.getAttribute('data-index')));

        });

        root.querySelector('#cayan-os-form').addEventListener('keydown', (event) => {

            if (!Engine.isSearchEnterKey(event)) {
                return;
            }

            event.preventDefault();
            runSearch();

        });

        document.addEventListener('click', (event) => {

            if (!root.contains(event.target)) {
                hideSuggestions();
            }

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
            root.className = 'cayan-os-root';
            root.innerHTML = shellHtml();
            mountPoint.insertBefore(root, mountPoint.firstChild);
        }

        bind(root);
        paintResults();

    };

    kintone.events.on('app.record.index.show', (event) => {

        if (kintone.app.getId() !== cfg().SEARCH_APP_ID) {
            return event;
        }

        mount();

        return event;

    });

    kintone.events.on('app.record.index.hide', (event) => {

        requestSerial += 1;
        suggestSerial += 1;

        if (suggestTimer) {
            clearTimeout(suggestTimer);
        }

        document.body.classList.remove(BODY_CLASS);

        const root = document.getElementById(ROOT_ID);

        if (root) {
            root.remove();
        }

        rows = [];
        suggestions = [];
        message = '';
        messageKind = '';
        countText = '';
        loading = false;

        return event;

    });

}());
