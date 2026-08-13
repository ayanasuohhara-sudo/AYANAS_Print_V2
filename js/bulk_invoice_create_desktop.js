(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * bulk_invoice_create_desktop.js
     *
     * 請求書作成アプリ一覧に「請求書一括作成」ボタンを配置する。
     */

    const BUTTON_ID = 'ayanas-bulk-invoice-create-button';
    const DIALOG_ID = 'ayanas-bulk-invoice-create-dialog';
    const OVERLAY_ID = 'ayanas-bulk-invoice-create-overlay';

    const isInvoiceApp = () => {

        if (typeof InvoiceCreate === 'undefined' || typeof kintone === 'undefined') {
            return false;
        }

        return kintone.app.getId() === InvoiceCreate.getInvoiceAppId();

    };

    const formatDefaultClosingYm = () => {

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');

        return `${year}-${month}`;

    };

    const removeDialog = () => {

        document.getElementById(DIALOG_ID)?.remove();
        document.getElementById(OVERLAY_ID)?.remove();

    };

    const renderClosingOptions = () => {

        const labels = BulkInvoiceCreate.getClosingLabels();

        return labels.map((label) => `<option value="${label}">${label}</option>`).join('');

    };

    const formatYen = (amount) => `${Number(amount || 0).toLocaleString()} 円`;

    const showDialog = () => new Promise((resolve) => {

        removeDialog();

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'ayanas-monthly-billing-overlay';

        const dialog = document.createElement('div');
        dialog.id = DIALOG_ID;
        dialog.className = 'ayanas-monthly-billing-dialog';
        dialog.innerHTML = `
            <h3 class="ayanas-monthly-billing-dialog-title">請求書一括作成</h3>
            <p class="ayanas-monthly-billing-dialog-note">
                選択した締日の対象期間内の未請求納品書を、取引先ごとに請求書へ一括作成します。<br>
                V1.0: 納品管理の請求済更新は行いません。
            </p>
            <div class="ayanas-monthly-billing-dialog-field">
                <label for="ayanas-bulk-closing-ym">請求締年月</label>
                <input type="month" id="ayanas-bulk-closing-ym" value="${formatDefaultClosingYm()}">
            </div>
            <div class="ayanas-monthly-billing-dialog-field">
                <label for="ayanas-bulk-closing-date">締日</label>
                <select id="ayanas-bulk-closing-date">
                    ${renderClosingOptions()}
                </select>
            </div>
            <div class="ayanas-monthly-billing-dialog-actions">
                <button type="button" class="ayanas-monthly-billing-dialog-cancel">キャンセル</button>
                <button type="button" class="ayanas-monthly-billing-dialog-run">実行</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const close = (value) => {

            removeDialog();
            resolve(value);

        };

        overlay.addEventListener('click', (event) => {

            if (event.target === overlay) {
                close(null);
            }

        });

        dialog.querySelector('.ayanas-monthly-billing-dialog-cancel')
            .addEventListener('click', () => close(null));

        dialog.querySelector('.ayanas-monthly-billing-dialog-run')
            .addEventListener('click', () => {

                const closingYm = dialog.querySelector('#ayanas-bulk-closing-ym')?.value ?? '';
                const closingDate = dialog.querySelector('#ayanas-bulk-closing-date')?.value ?? '';

                if (!closingYm) {
                    alert('請求締年月を入力してください。');
                    return;
                }

                if (!closingDate) {
                    alert('締日を選択してください。');
                    return;
                }

                close({ closingYm, closingDate });

            });

    });

    const formatPeriodLabel = (period) => (
        `${period.periodStart} ～ ${period.periodEnd}`
    );

    const buildResultMessage = (result) => {

        const errorLines = result.errors.map((item) => (
            `${item.customerCode} ${item.customerName}: ${item.message}`
        ));

        return [
            '請求書一括作成が完了しました。',
            '',
            result.batchNo ? `締め処理番号: ${result.batchNo}` : null,
            `対象期間: ${formatPeriodLabel(result.period)}`,
            `作成件数: ${result.createdCount.toLocaleString()} 件`,
            `対象納品件数: ${result.deliveryCount.toLocaleString()} 件`,
            `対象金額: ${formatYen(result.totalAmount)}`,
            errorLines.length > 0 ? '' : null,
            errorLines.length > 0 ? '処理できなかった取引先:' : null,
            ...errorLines,
        ].filter((line) => line !== null).join('\n');

    };

    const handleBulkInvoiceCreateClick = async () => {

        const input = await showDialog();

        if (!input) {
            return;
        }

        const { closingYm, closingDate } = input;
        const period = InvoiceCreate.resolveClosingPeriod(closingYm, closingDate);
        const confirmed = window.confirm(
            `請求書一括作成を実行します。\n\n`
            + `請求締年月: ${period.closingYm}\n`
            + `締日: ${period.executionLabel}\n`
            + `対象期間: ${formatPeriodLabel(period)}\n\n`
            + `未請求の納品書を取引先ごとに請求書へ作成します。\n`
            + `よろしいですか？`
        );

        if (!confirmed) {
            return;
        }

        const button = document.getElementById(BUTTON_ID);

        if (button instanceof HTMLButtonElement) {
            button.disabled = true;
            button.textContent = '処理中...';
        }

        try {

            await InvoicePermission.assertAddRecord();

            const result = await BulkInvoiceCreate.run({ closingYm, closingDate });

            alert(buildResultMessage(result));
            location.reload();

        } catch (error) {

            console.error('[AYANAS Bulk Invoice Create]', error);
            alert(error?.message || '請求書一括作成に失敗しました。');

        } finally {

            if (button instanceof HTMLButtonElement) {
                button.disabled = false;
                button.textContent = '請求書一括作成';
            }

        }

    };

    const ensureButton = async () => {

        if (document.getElementById(BUTTON_ID)) {
            return;
        }

        if (typeof InvoicePermission !== 'undefined' && !(await InvoicePermission.canAddRecord())) {
            return;
        }

        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.className = 'ayanas-monthly-billing-button';
        button.textContent = '請求書一括作成';
        button.addEventListener('click', handleBulkInvoiceCreateClick);

        const toolbar = document.getElementById('ayanas-invoice-index-toolbar');
        const headerMenuSpace = kintone.app.getHeaderMenuSpaceElement();

        if (toolbar) {

            const actions = document.createElement('div');
            actions.className = 'ayanas-monthly-billing-toolbar';
            actions.appendChild(button);
            toolbar.insertBefore(actions, toolbar.firstChild);

        } else if (headerMenuSpace) {

            headerMenuSpace.appendChild(button);

        }

    };

    kintone.events.on('app.record.index.show', async (event) => {

        if (!isInvoiceApp()) {
            return event;
        }

        await ensureButton();

        return event;

    });

})();
