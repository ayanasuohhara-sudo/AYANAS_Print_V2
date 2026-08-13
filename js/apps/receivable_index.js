(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * receivable_index.js
     *
     * 売掛一覧アプリ（App 37）読み取り専用一覧画面。
     */

    const ROOT_ID = 'ayanas-receivable-index-root';
    const SORT_STORAGE_KEY = 'ayanas-receivable-sort';

    const SORT_OPTIONS = [
        { id: 'customer', label: '請求先別' },
        { id: 'invoiceDate', label: '請求日順' },
        { id: 'accountsReceivable', label: '売掛残高順' },
        { id: 'dueDate', label: '支払期限順' },
    ];

    const COLLECTION_ROW_CLASS = {
        未回収: 'ayanas-receivable-row-uncollected',
        一部回収: 'ayanas-receivable-row-partial',
        回収済: 'ayanas-receivable-row-collected',
    };

    const isReceivableApp = () => {

        if (typeof ReceivableCreate === 'undefined') {
            return false;
        }

        return kintone.app.getId() === ReceivableCreate.getReceivableAppId();

    };

    const formatYen = (value) => `${Number(value || 0).toLocaleString()} 円`;

    const formatNumber = (value) => Number(value || 0).toLocaleString();

    const getStoredSortId = () => {

        try {
            return window.sessionStorage.getItem(SORT_STORAGE_KEY) || 'invoiceDate';
        } catch (error) {
            return 'invoiceDate';
        }

    };

    const setStoredSortId = (sortId) => {

        try {
            window.sessionStorage.setItem(SORT_STORAGE_KEY, sortId);
        } catch (error) {
            // ignore
        }

    };

    const getRowClassName = (row) => {

        const classes = [];

        const statusClass = COLLECTION_ROW_CLASS[row.collection_status];

        if (statusClass) {
            classes.push(statusClass);
        }

        if (ReceivableCreate.isOverdue(row)) {
            classes.push('ayanas-receivable-row-overdue');
        }

        return classes.join(' ');

    };

    const renderTableRows = (rows) => {

        if (rows.length === 0) {
            return '<tr><td colspan="12" class="ayanas-receivable-index-empty">表示する売掛データがありません。</td></tr>';
        }

        return rows.map((row) => {
            const className = getRowClassName(row);
            const invoiceAppId = InvoiceCreate.getInvoiceAppId();

            return `
                <tr class="${className}">
                    <td>${escapeHtml(row.customer_code)}</td>
                    <td>${escapeHtml(row.customer_name)}</td>
                    <td><a href="/k/${invoiceAppId}/show#record=${row.invoice_record_id}">${escapeHtml(row.invoice_no)}</a></td>
                    <td>${escapeHtml(row.invoice_date)}</td>
                    <td>${escapeHtml(row.due_date)}</td>
                    <td class="num">${formatNumber(row.invoice_amount)}</td>
                    <td class="num">${formatNumber(row.payment_total)}</td>
                    <td class="num">${formatNumber(row.accounts_receivable)}</td>
                    <td>${escapeHtml(row.collection_status)}</td>
                    <td>${escapeHtml(row.last_payment_date)}</td>
                    <td class="num">${formatNumber(row.elapsed_days)}</td>
                    <td>${escapeHtml(row.in_charge)}</td>
                </tr>
            `;
        }).join('');

    };

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const renderSummary = (summary) => ([
        `<p class="ayanas-receivable-index-summary-item"><strong>売掛総額</strong>${formatYen(summary.receivableTotal)}</p>`,
        `<p class="ayanas-receivable-index-summary-item"><strong>未回収件数</strong>${formatNumber(summary.uncollectedCount)} 件</p>`,
        `<p class="ayanas-receivable-index-summary-item"><strong>期限超過件数</strong>${formatNumber(summary.overdueCount)} 件</p>`,
        `<p class="ayanas-receivable-index-summary-item"><strong>今月回収額</strong>${formatYen(summary.monthlyCollection)}</p>`,
    ].join(''));

    const renderSortButtons = (activeSortId) => SORT_OPTIONS.map((sort) => {
        const activeClass = sort.id === activeSortId ? ' is-active' : '';

        return `<button type="button" class="ayanas-receivable-sort-button${activeClass}" data-sort-id="${sort.id}">${sort.label}</button>`;
    }).join('');

    const renderRoot = () => `
        <div id="${ROOT_ID}" class="ayanas-receivable-index-root">
            <p class="ayanas-receivable-readonly-notice">V1.0: 請求書・入金管理から取得した読み取り専用一覧です。このアプリからデータ更新は行いません。</p>
            <div class="ayanas-receivable-index-toolbar">
                <div id="ayanas-receivable-summary" class="ayanas-receivable-index-summary">
                    <p class="ayanas-receivable-index-loading">読み込み中...</p>
                </div>
                <div id="ayanas-receivable-sorts" class="ayanas-receivable-index-sorts">
                    <span class="ayanas-receivable-index-sorts-label">並び替え</span>
                </div>
            </div>
            <div class="ayanas-receivable-table-wrap">
                <table class="ayanas-receivable-table">
                    <thead>
                        <tr>
                            <th>請求先コード</th>
                            <th>請求先名</th>
                            <th>請求番号</th>
                            <th>請求日</th>
                            <th>支払期限</th>
                            <th>請求金額</th>
                            <th>入金累計</th>
                            <th>売掛残高</th>
                            <th>回収状況</th>
                            <th>最終入金日</th>
                            <th>経過日数</th>
                            <th>担当者</th>
                        </tr>
                    </thead>
                    <tbody id="ayanas-receivable-table-body">
                        <tr><td colspan="12" class="ayanas-receivable-index-loading">読み込み中...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    const ensureRoot = () => {

        document.body.classList.add('ayanas-receivable-app');

        let root = document.getElementById(ROOT_ID);

        if (root) {
            return root;
        }

        const contents = document.querySelector('.contents-gaia');

        if (!contents) {
            return null;
        }

        contents.insertAdjacentHTML('afterbegin', renderRoot());
        root = document.getElementById(ROOT_ID);

        const sorts = root?.querySelector('#ayanas-receivable-sorts');

        if (sorts) {
            sorts.insertAdjacentHTML('beforeend', renderSortButtons(getStoredSortId()));

            sorts.addEventListener('click', (event) => {

                const button = event.target.closest('[data-sort-id]');

                if (!(button instanceof HTMLButtonElement)) {
                    return;
                }

                setStoredSortId(button.dataset.sortId || 'invoiceDate');
                loadReceivableList();

            });
        }

        return root;

    };

    const updateSortButtons = (activeSortId) => {

        document.querySelectorAll('[data-sort-id]').forEach((button) => {

            if (!(button instanceof HTMLButtonElement)) {
                return;
            }

            button.classList.toggle('is-active', button.dataset.sortId === activeSortId);

        });

    };

    const loadReceivableList = async () => {

        const summaryElement = document.getElementById('ayanas-receivable-summary');
        const tableBody = document.getElementById('ayanas-receivable-table-body');
        const sortId = getStoredSortId();

        if (summaryElement) {
            summaryElement.innerHTML = '<p class="ayanas-receivable-index-loading">読み込み中...</p>';
        }

        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="12" class="ayanas-receivable-index-loading">読み込み中...</td></tr>';
        }

        updateSortButtons(sortId);

        try {

            const [rows, monthlyCollection] = await Promise.all([
                ReceivableCreate.fetchReceivableRows(),
                ReceivableCreate.fetchMonthlyCollectionTotal(),
            ]);

            const sortedRows = ReceivableCreate.sortReceivableRows(rows, sortId);
            const summary = ReceivableCreate.calculateSummary(sortedRows, monthlyCollection);

            if (summaryElement) {
                summaryElement.innerHTML = renderSummary(summary);
            }

            if (tableBody) {
                tableBody.innerHTML = renderTableRows(sortedRows);
            }

        } catch (error) {

            console.error('[AYANAS Receivable]', error);

            if (summaryElement) {
                summaryElement.innerHTML = '<p class="ayanas-receivable-index-loading">集計の取得に失敗しました。</p>';
            }

            if (tableBody) {
                tableBody.innerHTML = '<tr><td colspan="12" class="ayanas-receivable-index-empty">データの取得に失敗しました。</td></tr>';
            }

        }

    };

    kintone.events.on('app.record.index.show', (event) => {

        if (!isReceivableApp()) {
            return event;
        }

        ensureRoot();
        loadReceivableList();

        return event;

    });

    kintone.events.on(['app.record.create.show', 'app.record.edit.show'], (event) => {

        if (!isReceivableApp()) {
            return event;
        }

        event.error = '売掛一覧アプリ V1.0 ではレコードの手入力登録は行いません。';

        return event;

    });

})();
