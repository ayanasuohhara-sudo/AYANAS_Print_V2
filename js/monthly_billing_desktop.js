(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * monthly_billing_desktop.js
     *
     * 請求書作成アプリ一覧に「月次請求処理」ボタンを配置する。
     */

    const BUTTON_ID = 'ayanas-monthly-billing-button';
    const DIALOG_ID = 'ayanas-monthly-billing-dialog';
    const OVERLAY_ID = 'ayanas-monthly-billing-overlay';

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

        const labels = MonthlyBilling.getMonthlyClosingLabels();

        return labels.map((label) => `<option value="${label}">${label}</option>`).join('');

    };

    const showDialog = () => new Promise((resolve) => {

        removeDialog();

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'ayanas-monthly-billing-overlay';

        const dialog = document.createElement('div');
        dialog.id = DIALOG_ID;
        dialog.className = 'ayanas-monthly-billing-dialog';
        dialog.innerHTML = `
            <h3 class="ayanas-monthly-billing-dialog-title">月次請求処理</h3>
            <p class="ayanas-monthly-billing-dialog-note">
                選択した締日の対象期間内の未請求納品書を、請求先ごとに請求書へ一括作成します。<br>
                V1.0: 納品管理の請求済更新は行いません。
            </p>
            <div class="ayanas-monthly-billing-dialog-field">
                <label for="ayanas-monthly-closing-ym">請求締年月</label>
                <input type="month" id="ayanas-monthly-closing-ym" value="${formatDefaultClosingYm()}">
            </div>
            <div class="ayanas-monthly-billing-dialog-field">
                <label for="ayanas-monthly-closing-date">締日</label>
                <select id="ayanas-monthly-closing-date">
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

                const closingYm = dialog.querySelector('#ayanas-monthly-closing-ym')?.value ?? '';
                const closingDate = dialog.querySelector('#ayanas-monthly-closing-date')?.value ?? '';

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

    const handleMonthlyBillingClick = async () => {

        const input = await showDialog();

        if (!input) {
            return;
        }

        const { closingYm, closingDate } = input;
        const period = InvoiceCreate.resolveClosingPeriod(closingYm, closingDate);
        const confirmed = window.confirm(
            `月次請求処理を実行します。\n\n`
            + `請求締年月: ${period.closingYm}\n`
            + `締日: ${period.executionLabel}\n`
            + `対象期間: ${formatPeriodLabel(period)}\n\n`
            + `未請求の納品書を請求先ごとに請求書へ作成します。\n`
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

            const result = await MonthlyBilling.run({ closingYm, closingDate });
            const createdLines = result.created.map((item) => (
                `${item.customerCode} ${item.customerName} / ${item.invoiceNo} / `
                + `${item.deliveryCount} 件 / ${item.total.toLocaleString()} 円`
            ));
            const errorLines = result.errors.map((item) => (
                `${item.customerCode}: ${item.message}`
            ));

            alert(
                `月次請求処理が完了しました。\n\n`
                + `対象期間: ${formatPeriodLabel(result.period)}\n`
                + `作成件数: ${result.created.length} 件\n`
                + `対象納品書: ${result.deliveryCount} 件\n`
                + (result.skippedDeliveryCount > 0
                    ? `対象外納品書: ${result.skippedDeliveryCount} 件\n`
                    : '')
                + (createdLines.length > 0 ? `\n${createdLines.join('\n')}\n` : '')
                + (errorLines.length > 0 ? `\nエラー:\n${errorLines.join('\n')}` : '')
            );

            location.reload();

        } catch (error) {

            console.error('[AYANAS Monthly Billing]', error);
            alert(error?.message || '月次請求処理に失敗しました。');

        } finally {

            if (button instanceof HTMLButtonElement) {
                button.disabled = false;
                button.textContent = '月次請求処理';
            }

        }

    };

    const ensureButton = () => {

        if (document.getElementById(BUTTON_ID)) {
            return;
        }

        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.className = 'ayanas-monthly-billing-button';
        button.textContent = '月次請求処理';
        button.addEventListener('click', handleMonthlyBillingClick);

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

    kintone.events.on('app.record.index.show', (event) => {

        if (!isInvoiceApp()) {
            return event;
        }

        ensureButton();

        return event;

    });

})();
