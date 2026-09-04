(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * overseas_outbound_index.js
     *
     * 海外外注（App 28）一覧画面の帳票ボタン。
     */

    const TOOLBAR_ID = 'ayanas-overseas-outbound-toolbar';
    const DIALOG_ID = 'ayanas-overseas-outbound-dialog';
    const LIST_ID = 'ayanas-overseas-outbound-list';

    const REPORT_CONFIG = {
        unreceived: {
            buttonId: 'ayanas-overseas-unreceived-button',
            label: '出庫明細表（未入庫）',
            dialogTitle: '出庫明細表（未入庫）を印刷',
            emptyMessage: '未入庫品のある出庫日はありません。',
            countLabel: (count) => `未入庫 ${count}点`,
            reportType: 'overseas_outbound_detail',
            fetchDates: () => OverseasOutbound.fetchShipDateList(),
            fetchData: (shipDate) => OverseasOutbound.fetchReportDataByShipDate(shipDate),
            validateData: (data) => data.details.length > 0,
            emptyDataMessage: '選択した出庫日の未入庫品はありません。',
        },
        katsuya: {
            buttonId: 'ayanas-overseas-katsuya-button',
            label: '勝矢和裁用 出庫表',
            dialogTitle: '勝矢和裁用 出庫表を印刷',
            emptyMessage: '出庫実績のある出庫日はありません。',
            countLabel: (count) => `${count}点`,
            reportType: 'overseas_outbound_sheet',
            fetchDates: () => OverseasOutbound.fetchOutboundShipDateList(),
            fetchData: (shipDate) => OverseasOutbound.fetchOutboundSheetDataByShipDate(shipDate, 'katsuya'),
            validateData: (data) => data.details.length > 0,
            emptyDataMessage: '選択した出庫日の出庫データはありません。',
        },
        internal: {
            buttonId: 'ayanas-overseas-internal-button',
            label: '社内保管用 出庫表',
            dialogTitle: '社内保管用 出庫表を印刷',
            emptyMessage: '出庫実績のある出庫日はありません。',
            countLabel: (count) => `${count}点`,
            reportType: 'overseas_outbound_sheet',
            fetchDates: () => OverseasOutbound.fetchOutboundShipDateList(),
            fetchData: (shipDate) => OverseasOutbound.fetchOutboundSheetDataByShipDate(shipDate, 'internal'),
            validateData: (data) => data.details.length > 0,
            emptyDataMessage: '選択した出庫日の出庫データはありません。',
        },
    };

    let activeReportKey = 'unreceived';

    const assertModulesLoaded = () => {
        Validation.assertModule(OverseasOutbound, 'OverseasOutbound', 'fetchShipDateList');
        Validation.assertModule(Preview, 'Preview', 'open');
    };

    const getActiveReportConfig = () => REPORT_CONFIG[activeReportKey] ?? REPORT_CONFIG.unreceived;

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

    const buildListRowHtml = (item, config) => `
<div class="ayanas-overseas-outbound-row">
    <span class="ayanas-overseas-outbound-row__date">${Format.escapeHtml(formatShipDateLabel(item.shipDate))}</span>
    <span class="ayanas-overseas-outbound-row__count">${Format.escapeHtml(config.countLabel(item.count))}</span>
    <button type="button" class="ayanas-overseas-outbound-row__print" data-ship-date="${Format.escapeHtml(item.shipDate)}">印刷</button>
</div>`;

    const buildDialogHtml = (items, config) => {

        const rowsHtml = items.length > 0
            ? items.map((item) => buildListRowHtml(item, config)).join('\n')
            : `<p class="ayanas-overseas-outbound-empty">${Format.escapeHtml(config.emptyMessage)}</p>`;

        return `
<div id="${DIALOG_ID}" class="ayanas-overseas-outbound-dialog" role="dialog" aria-modal="true">
    <div class="ayanas-overseas-outbound-dialog__backdrop"></div>
    <div class="ayanas-overseas-outbound-dialog__panel">
        <h2 class="ayanas-overseas-outbound-dialog__title">${Format.escapeHtml(config.dialogTitle)}</h2>
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

    const handlePrintClick = async (button) => {

        const shipDate = button.getAttribute('data-ship-date');
        const config = getActiveReportConfig();

        if (!shipDate) {
            return;
        }

        const originalLabel = button.textContent;

        button.disabled = true;
        button.textContent = '取得中...';

        try {

            assertModulesLoaded();

            const data = await config.fetchData(shipDate);

            if (!config.validateData(data)) {
                alert(config.emptyDataMessage);
                removeDialog();
                return;
            }

            await Preview.open(data, { reportType: config.reportType });
            removeDialog();

        } catch (error) {

            console.error('[AYANAS Print V3]', error);

            const message = error instanceof Error
                ? error.message
                : '不明なエラーが発生しました。';

            alert(`印刷に失敗しました。\n\n${message}`);

        } finally {

            button.disabled = false;
            button.textContent = originalLabel;

        }

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

    const showDialog = async (reportKey) => {

        activeReportKey = reportKey;
        const config = getActiveReportConfig();

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

            const items = await config.fetchDates();
            const dialogHtml = buildDialogHtml(items, config);
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

    const createButton = (reportKey) => {

        const config = REPORT_CONFIG[reportKey];
        const button = document.createElement('button');

        button.id = config.buttonId;
        button.type = 'button';
        button.className = 'ayanas-overseas-outbound-button';
        button.textContent = config.label;
        button.addEventListener('click', () => showDialog(reportKey));

        return button;

    };

    const createToolbar = () => {

        const toolbar = document.createElement('div');

        toolbar.id = TOOLBAR_ID;
        toolbar.className = 'ayanas-overseas-outbound-toolbar';
        toolbar.appendChild(createButton('katsuya'));
        toolbar.appendChild(createButton('internal'));
        toolbar.appendChild(createButton('unreceived'));

        return toolbar;

    };

    const mountToolbar = () => {

        if (document.getElementById(TOOLBAR_ID)) {
            return;
        }

        const toolbar = createToolbar();
        const headerSpace = kintone.app.getHeaderSpaceElement();

        if (headerSpace) {
            headerSpace.prepend(toolbar);
            return;
        }

        const recordList = document.querySelector('.recordlist-gaia');

        if (recordList?.parentElement) {
            recordList.parentElement.insertBefore(toolbar, recordList);
            return;
        }

        const menuSpace = kintone.app.getHeaderMenuSpaceElement();

        if (menuSpace) {
            menuSpace.prepend(toolbar);
        }

    };

    kintone.events.on('app.record.index.show', (event) => {

        if (kintone.app.getId() !== OverseasOutbound.APP_ID) {
            return event;
        }

        console.info(
            '[AYANAS Print V3] overseas outbound service version',
            OverseasOutbound.SERVICE_VERSION ?? '(unknown)'
        );

        mountToolbar();

        return event;

    });

})();
