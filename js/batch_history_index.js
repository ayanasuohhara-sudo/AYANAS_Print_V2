(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * batch_history_index.js
     *
     * 請求書作成アプリ一覧に請求締め実行履歴を表示する（V1.0: 表示のみ）。
     */

    const PANEL_ID = 'ayanas-batch-history-panel';
    const TABLE_BODY_ID = 'ayanas-batch-history-tbody';
    const HISTORY_LIMIT = 20;

    const STATUS_ROW_CLASS = {
        成功: 'ayanas-batch-history-success',
        一部失敗: 'ayanas-batch-history-partial',
        失敗: 'ayanas-batch-history-failed',
        処理中: 'ayanas-batch-history-running',
    };

    const isInvoiceApp = () => {

        if (typeof InvoiceCreate === 'undefined' || typeof BatchHistory === 'undefined') {
            return false;
        }

        return kintone.app.getId() === InvoiceCreate.getInvoiceAppId();

    };

    const formatYen = (value) => `${Number(value || 0).toLocaleString()} 円`;

    const formatNumber = (value) => Number(value || 0).toLocaleString();

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const formatExecutedAt = (value) => {

        const normalized = String(value ?? '').trim();

        if (!normalized) {
            return '';
        }

        return normalized.replace('T', ' ').slice(0, 19);

    };

    const renderRows = (rows) => {

        if (rows.length === 0) {
            return '<tr><td colspan="6" class="ayanas-batch-history-empty">実行履歴がありません。</td></tr>';
        }

        return rows.map((row) => {

            const statusClass = STATUS_ROW_CLASS[row.status] || '';

            return `
                <tr class="${statusClass}">
                    <td>${escapeHtml(formatExecutedAt(row.executed_at))}</td>
                    <td>${escapeHtml(row.status)}</td>
                    <td>${escapeHtml(row.executed_by)}</td>
                    <td>${escapeHtml(row.closing_day)}</td>
                    <td class="num">${formatNumber(row.invoice_count)}</td>
                    <td class="num">${formatNumber(row.total_amount)}</td>
                </tr>
            `;

        }).join('');

    };

    const renderPanel = () => `
        <section id="${PANEL_ID}" class="ayanas-batch-history-panel">
            <h3 class="ayanas-batch-history-title">請求締め実行履歴</h3>
            <div class="ayanas-batch-history-table-wrap">
                <table class="ayanas-batch-history-table">
                    <thead>
                        <tr>
                            <th>実行日時</th>
                            <th>処理結果</th>
                            <th>実行者</th>
                            <th>締日</th>
                            <th>請求書件数</th>
                            <th>請求総額</th>
                        </tr>
                    </thead>
                    <tbody id="${TABLE_BODY_ID}">
                        <tr><td colspan="6" class="ayanas-batch-history-empty">読み込み中...</td></tr>
                    </tbody>
                </table>
            </div>
        </section>
    `;

    const ensurePanel = () => {

        if (document.getElementById(PANEL_ID)) {
            return;
        }

        const toolbar = document.getElementById('ayanas-invoice-index-toolbar');
        const panelHtml = renderPanel();

        if (toolbar) {
            toolbar.insertAdjacentHTML('afterend', panelHtml);
            return;
        }

        const contents = document.querySelector('.contents-gaia');

        if (contents) {
            contents.insertAdjacentHTML('afterbegin', panelHtml);
        }

    };

    const loadHistory = async () => {

        const tbody = document.getElementById(TABLE_BODY_ID);

        if (!tbody) {
            return;
        }

        try {

            const rows = await BatchHistory.fetchRecent(HISTORY_LIMIT);

            tbody.innerHTML = renderRows(rows);

        } catch (error) {

            console.error('[AYANAS Batch History]', error);
            tbody.innerHTML = '<tr><td colspan="6" class="ayanas-batch-history-empty">実行履歴の取得に失敗しました。</td></tr>';

        }

    };

    kintone.events.on('app.record.index.show', (event) => {

        if (!isInvoiceApp()) {
            return event;
        }

        ensurePanel();
        loadHistory();

        return event;

    });

})();
