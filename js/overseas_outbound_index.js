(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * overseas_outbound_index.js
     *
     * 海外外注（App 28）一覧画面に出庫明細表ボタンを追加する。
     */

    const BUTTON_ID = 'ayanas-overseas-outbound-button';
    const DIALOG_ID = 'ayanas-overseas-outbound-dialog';
    const LIST_ID = 'ayanas-overseas-outbound-list';

    const assertModulesLoaded = () => {
        Validation.assertModule(OverseasOutbound, 'OverseasOutbound', 'fetchShipDateList');
        Validation.assertModule(Preview, 'Preview', 'open');
    };

    const formatShipDateLabel = (shipDate) => {

        try {
            return Format.formatDate(shipDate);
        } catch (error) {
            return String(shipDate ?? '').trim();
        }

    };

    const removeDialog = () => {
        document.getElementById(DIALOG_ID)?.remove();
    };

    const buildListRowHtml = (item) => `
<div class="ayanas-overseas-outbound-row">
    <span class="ayanas-overseas-outbound-row__date">${Format.escapeHtml(formatShipDateLabel(item.shipDate))}</span>
    <span class="ayanas-overseas-outbound-row__count">未入庫 ${Format.escapeHtml(String(item.count))}点</span>
    <button type="button" class="ayanas-overseas-outbound-row__print" data-ship-date="${Format.escapeHtml(item.shipDate)}">印刷</button>
</div>`;

    const buildDialogHtml = (items) => {

        const rowsHtml = items.length > 0
            ? items.map(buildListRowHtml).join('\n')
            : '<p class="ayanas-overseas-outbound-empty">未入庫品のある出庫日はありません。</p>';

        return `
<div id="${DIALOG_ID}" class="ayanas-overseas-outbound-dialog" role="dialog" aria-modal="true">
    <div class="ayanas-overseas-outbound-dialog__backdrop"></div>
    <div class="ayanas-overseas-outbound-dialog__panel">
        <h2 class="ayanas-overseas-outbound-dialog__title">出庫明細表を印刷</h2>
        <p class="ayanas-overseas-outbound-dialog__lead">出庫日を選択してください</p>
        <div id="${LIST_ID}" class="ayanas-overseas-outbound-dialog__list">
            ${rowsHtml}
        </div>
        <div class="ayanas-overseas-outbound-dialog__actions">
            <button type="button" class="ayanas-overseas-outbound-dialog__close">閉じる</button>
        </div>
    </div>
</div>`;

    };

    const bindDialogEvents = (dialog) => {

        dialog.querySelector('.ayanas-overseas-outbound-dialog__backdrop')
            ?.addEventListener('click', removeDialog);

        dialog.querySelector('.ayanas-overseas-outbound-dialog__close')
            ?.addEventListener('click', removeDialog);

        dialog.querySelectorAll('.ayanas-overseas-outbound-row__print').forEach((button) => {
            button.addEventListener('click', () => handlePrintClick(button));
        });

    };

    const handlePrintClick = async (button) => {

        const shipDate = button.getAttribute('data-ship-date');

        if (!shipDate) {
            return;
        }

        const originalLabel = button.textContent;

        button.disabled = true;
        button.textContent = '取得中...';

        try {

            assertModulesLoaded();

            const data = await OverseasOutbound.fetchReportDataByShipDate(shipDate);

            if (!data.details.length) {
                alert('選択した出庫日の未入庫品はありません。');
                removeDialog();
                return;
            }

            await Preview.open(data, { reportType: 'overseas_outbound_detail' });
            removeDialog();

        } catch (error) {

            console.error('[AYANAS Print V3]', error);

            const message = error instanceof Error
                ? error.message
                : '不明なエラーが発生しました。';

            alert(`出庫明細表の印刷に失敗しました。\n\n${message}`);

        } finally {

            button.disabled = false;
            button.textContent = originalLabel;

        }

    };

    const showDialog = async () => {

        assertModulesLoaded();

        removeDialog();

        const loadingDialog = document.createElement('div');

        loadingDialog.id = DIALOG_ID;
        loadingDialog.className = 'ayanas-overseas-outbound-dialog';
        loadingDialog.innerHTML = `
<div class="ayanas-overseas-outbound-dialog__backdrop"></div>
<div class="ayanas-overseas-outbound-dialog__panel">
    <p class="ayanas-overseas-outbound-dialog__loading">出庫日を読み込んでいます...</p>
</div>`;

        document.body.appendChild(loadingDialog);

        try {

            const items = await OverseasOutbound.fetchShipDateList();
            const dialogHtml = buildDialogHtml(items);
            const wrapper = document.createElement('div');

            wrapper.innerHTML = dialogHtml.trim();

            const dialog = wrapper.firstElementChild;

            loadingDialog.replaceWith(dialog);
            bindDialogEvents(dialog);

        } catch (error) {

            removeDialog();

            console.error('[AYANAS Print V3]', error);

            const message = error instanceof Error
                ? error.message
                : '不明なエラーが発生しました。';

            alert(`出庫日の取得に失敗しました。\n\n${message}`);

        }

    };

    const createButton = () => {

        const button = document.createElement('button');

        button.id = BUTTON_ID;
        button.type = 'button';
        button.className = 'ayanas-overseas-outbound-button';
        button.textContent = '出庫明細表';
        button.addEventListener('click', showDialog);

        return button;

    };

    kintone.events.on('app.record.index.show', (event) => {

        if (kintone.app.getId() !== OverseasOutbound.APP_ID) {
            return event;
        }

        if (document.getElementById(BUTTON_ID)) {
            return event;
        }

        const space = kintone.app.getHeaderMenuSpaceElement();

        if (!space) {
            return event;
        }

        space.appendChild(createButton());

        return event;

    });

})();
