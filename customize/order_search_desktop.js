(function () {
    'use strict';

    /**
     * 受注検索 App88 — 一覧画面の検索UI。
     * App16 は参照のみ。状態は変更しない。
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
    let rows = [];
    let message = '';
    let messageKind = '';
    let countText = '';
    let loading = false;

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const readForm = (root) => ({
        customerCode: root.querySelector('#cayan-os-customer-code')?.value ?? '',
        customerName: root.querySelector('#cayan-os-customer-name')?.value ?? '',
        clientName: root.querySelector('#cayan-os-client-name')?.value ?? '',
        slipNo: root.querySelector('#cayan-os-slip-no')?.value ?? '',
        manageNo: root.querySelector('#cayan-os-manage-no')?.value ?? '',
        includeDelivered: Boolean(root.querySelector('#cayan-os-include-delivered')?.checked),
    });

    const writeForm = (root, input) => {

        const values = input || Engine.clearedInput();

        root.querySelector('#cayan-os-customer-code').value = values.customerCode;
        root.querySelector('#cayan-os-customer-name').value = values.customerName;
        root.querySelector('#cayan-os-client-name').value = values.clientName;
        root.querySelector('#cayan-os-slip-no').value = values.slipNo;
        root.querySelector('#cayan-os-manage-no').value = values.manageNo;
        root.querySelector('#cayan-os-include-delivered').checked = values.includeDelivered === true;

    };

    const cell = (value, key) => (
        '<td class="' + (key ? 'cayan-os-key' : '') + '">' + escapeHtml(value) + '</td>'
    );

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

            return '<tr>'
                + '<td class="cayan-os-key">' + manageCell + duplicate + '</td>'
                + cell(row.deadline, true)
                + cell(row.orderDate, false)
                + cell(row.customerCode, false)
                + cell(row.customerName, true)
                + cell(row.clientName, true)
                + cell(row.slipNo, false)
                + cell(row.kimonoType, false)
                + cell(row.kimonoSpec, false)
                + cell(row.processing, true)
                + cell(row.processStatus, true)
                + cell(row.workStatus, true)
                + cell(row.locationStatus, true)
                + cell(row.deliveryStatus, true)
                + '</tr>';

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

    };

    const runSearch = async () => {

        const root = document.getElementById(ROOT_ID);

        if (!root) {
            return;
        }

        const plan = Engine.buildSearchRequest(readForm(root));

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
            const records = await Engine.fetchAllPages(plan.query, async (query) => {

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

            rows = Engine.buildRows(records);
            countText = Engine.resultCountText(rows.length);
            message = rows.length === 0 ? cfg().MESSAGES.empty : '';
            messageKind = rows.length === 0 ? 'empty' : '';
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
        loading = false;
        writeForm(root, Engine.clearedInput());
        rows = [];
        countText = '';
        message = '';
        messageKind = '';
        paintResults();

    };

    const shellHtml = () => (
        '<header class="cayan-os-header">'
        + '<h1 class="cayan-os-title">受注検索</h1>'
        + '<p class="cayan-os-lead">受注明細を検索して、納期・工程・作業状態・保管場所を確認します。</p>'
        + '</header>'
        + '<form class="cayan-os-form" id="cayan-os-form" autocomplete="off">'
        + '<label class="cayan-os-field"><span>顧客コード</span>'
        + '<input id="cayan-os-customer-code" type="text" inputmode="text"></label>'
        + '<label class="cayan-os-field"><span>顧客名</span>'
        + '<input id="cayan-os-customer-name" type="text"></label>'
        + '<label class="cayan-os-field"><span>お客様名</span>'
        + '<input id="cayan-os-client-name" type="text"></label>'
        + '<label class="cayan-os-field"><span>得意先伝票番号</span>'
        + '<input id="cayan-os-slip-no" type="text"></label>'
        + '<label class="cayan-os-field"><span>管理番号</span>'
        + '<input id="cayan-os-manage-no" type="text" inputmode="numeric"></label>'
        + '<label class="cayan-os-check"><input id="cayan-os-include-delivered" type="checkbox">'
        + '<span>納品済を含む</span></label>'
        + '<div class="cayan-os-actions">'
        + '<button type="button" class="cayan-os-btn is-primary" id="cayan-os-search">検索</button>'
        + '<button type="button" class="cayan-os-btn" id="cayan-os-clear">クリア</button>'
        + '</div>'
        + '</form>'
        + '<p class="cayan-os-count" id="cayan-os-count"></p>'
        + '<p class="cayan-os-message" id="cayan-os-message" hidden></p>'
        + '<div class="cayan-os-table-wrap">'
        + '<table class="cayan-os-table" id="cayan-os-table" hidden>'
        + '<thead><tr>'
        + '<th>管理番号</th><th>納期</th><th>受注日</th><th>顧客コード</th><th>顧客名</th>'
        + '<th>お客様名</th><th>得意先伝票番号</th><th>着物種類</th><th>着物仕様</th>'
        + '<th>加工内容</th><th>工程</th><th>作業状態</th><th>保管場所</th><th>納品状態</th>'
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

        root.querySelector('#cayan-os-form').addEventListener('keydown', (event) => {

            if (!Engine.isSearchEnterKey(event)) {
                return;
            }

            event.preventDefault();
            runSearch();

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
        document.body.classList.remove(BODY_CLASS);

        const root = document.getElementById(ROOT_ID);

        if (root) {
            root.remove();
        }

        rows = [];
        message = '';
        messageKind = '';
        countText = '';
        loading = false;

        return event;

    });

}());
