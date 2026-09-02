(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * matsuba_summary_index.js
     *
     * 請求書アプリ（App 35）一覧画面に「松葉 合計請求書」ボタンを追加する。
     * 請求対象期間を確認したうえで 4 顧客を集計し、印刷プレビューを開く。
     * レコード更新は行わない。
     */

    const INVOICE_APP_ID = 35;
    const TOOLBAR_ID = 'ayanas-matsuba-summary-toolbar';
    const BUTTON_ID = 'ayanas-matsuba-summary-button';
    const DIALOG_ID = 'ayanas-matsuba-summary-dialog';
    const INVOICE_CREATE_ACTIONS_ID = 'ayanas-invoice-create-actions';

    let attachRetryTimer = 0;

    const formatLocalDate = (date) => {

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;

    };

    const getDefaultPeriod = () => {

        const today = new Date();
        const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastOfPrev = new Date(firstOfThisMonth.getTime() - 1);
        const firstOfPrev = new Date(lastOfPrev.getFullYear(), lastOfPrev.getMonth(), 1);

        return {
            billingFrom: formatLocalDate(firstOfPrev),
            billingTo: formatLocalDate(lastOfPrev),
        };

    };

    const removeDialog = () => {
        document.getElementById(DIALOG_ID)?.remove();
    };

    const assertModulesLoaded = () => {
        Validation.assertModule(MatsubaSummaryInvoice, 'MatsubaSummaryInvoice', 'fetchReportData');
        Validation.assertModule(Preview, 'Preview', 'open');
    };

    const buildDialogHtml = (period) => {

        const codes = (MatsubaSummaryInvoice.CUSTOMER_CODES || []).join(' / ');

        return `
<div id="${DIALOG_ID}" class="ayanas-matsuba-summary-dialog" role="dialog" aria-modal="true">
    <div class="ayanas-matsuba-summary-dialog__backdrop"></div>
    <div class="ayanas-matsuba-summary-dialog__panel">
        <h2 class="ayanas-matsuba-summary-dialog__title">松葉 合計請求書</h2>
        <p class="ayanas-matsuba-summary-dialog__lead">請求対象期間を確認してください。対象顧客（${Format.escapeHtml(codes)}）を集計して印刷プレビューを表示します。</p>
        <p class="ayanas-matsuba-summary-dialog__note">この帳票は集計・印刷専用です。請求済ステータス・納品書・入金状態は変更しません。</p>
        <div class="ayanas-matsuba-summary-dialog__field">
            <label>請求対象期間</label>
            <div class="ayanas-matsuba-summary-dialog__period">
                <input type="date" id="ayanas-matsuba-billing-from" aria-label="開始日" value="${Format.escapeHtml(period.billingFrom)}">
                <span>～</span>
                <input type="date" id="ayanas-matsuba-billing-to" aria-label="終了日" value="${Format.escapeHtml(period.billingTo)}">
            </div>
        </div>
        <div class="ayanas-matsuba-summary-dialog__actions">
            <button type="button" class="ayanas-matsuba-summary-dialog__cancel">閉じる</button>
            <button type="button" class="ayanas-matsuba-summary-dialog__preview">プレビュー</button>
        </div>
    </div>
</div>`;

    };

    const handlePreviewClick = async (button) => {

        const billingFrom = String(document.getElementById('ayanas-matsuba-billing-from')?.value ?? '').trim();
        const billingTo = String(document.getElementById('ayanas-matsuba-billing-to')?.value ?? '').trim();
        const originalLabel = button.textContent;

        button.disabled = true;
        button.textContent = '集計中...';

        try {

            assertModulesLoaded();

            const data = await MatsubaSummaryInvoice.fetchReportData({ billingFrom, billingTo });

            await Preview.open(data, { reportType: MatsubaSummaryInvoice.REPORT_TYPE });
            removeDialog();

        } catch (error) {

            console.error('[AYANAS Print V3]', error);

            const message = error instanceof Error
                ? error.message
                : '不明なエラーが発生しました。';

            alert(`松葉 合計請求書の印刷に失敗しました。\n\n${message}`);

        } finally {

            button.disabled = false;
            button.textContent = originalLabel;

        }

    };

    const bindDialogEvents = (dialog) => {

        dialog.querySelector('.ayanas-matsuba-summary-dialog__backdrop')
            ?.addEventListener('click', removeDialog);

        dialog.querySelector('.ayanas-matsuba-summary-dialog__cancel')
            ?.addEventListener('click', removeDialog);

        const previewButton = dialog.querySelector('.ayanas-matsuba-summary-dialog__preview');

        previewButton?.addEventListener('click', () => handlePreviewClick(previewButton));

    };

    const showDialog = () => {

        assertModulesLoaded();
        removeDialog();

        const wrapper = document.createElement('div');

        wrapper.innerHTML = buildDialogHtml(getDefaultPeriod()).trim();

        const dialog = wrapper.firstElementChild;

        document.body.appendChild(dialog);
        bindDialogEvents(dialog);

    };

    MatsubaSummaryInvoice.openPreviewDialog = showDialog;

    const createButton = () => {

        const button = document.createElement('button');

        button.id = BUTTON_ID;
        button.type = 'button';
        button.className = 'ayanas-matsuba-summary-button';
        button.textContent = '松葉 合計請求書';
        button.addEventListener('click', showDialog);

        return button;

    };

    const createToolbar = (button) => {

        const toolbar = document.createElement('div');

        toolbar.id = TOOLBAR_ID;
        toolbar.className = 'ayanas-matsuba-summary-toolbar';
        toolbar.appendChild(button);

        return toolbar;

    };

    const attachToInvoiceActions = (button) => {

        const actions = document.getElementById(INVOICE_CREATE_ACTIONS_ID);

        if (!actions) {
            return false;
        }

        if (button.parentElement !== actions) {
            actions.appendChild(button);
        }

        document.getElementById(TOOLBAR_ID)?.remove();

        return true;

    };

    const mountOwnToolbar = (button) => {

        if (document.getElementById(TOOLBAR_ID)) {
            return;
        }

        const toolbar = createToolbar(button);

        const headerMenu = kintone.app.getHeaderMenuSpaceElement();

        if (headerMenu) {
            headerMenu.appendChild(toolbar);
            return;
        }

        const headerSpace = kintone.app.getHeaderSpaceElement();

        if (headerSpace) {
            headerSpace.prepend(toolbar);
        }

    };

    const mountButton = () => {

        let button = document.getElementById(BUTTON_ID);

        if (!(button instanceof HTMLButtonElement)) {
            button = createButton();
        }

        if (attachToInvoiceActions(button)) {
            return;
        }

        mountOwnToolbar(button);

        if (attachRetryTimer) {
            window.clearInterval(attachRetryTimer);
        }

        let attempts = 0;

        attachRetryTimer = window.setInterval(() => {

            attempts += 1;

            const existing = document.getElementById(BUTTON_ID) || button;

            if (attachToInvoiceActions(existing)) {
                window.clearInterval(attachRetryTimer);
                attachRetryTimer = 0;
                return;
            }

            if (attempts >= 40) {
                window.clearInterval(attachRetryTimer);
                attachRetryTimer = 0;
            }

        }, 250);

    };

    kintone.events.on('app.record.index.show', (event) => {

        if (kintone.app.getId() !== INVOICE_APP_ID) {
            return event;
        }

        mountButton();

        return event;

    });

})();
