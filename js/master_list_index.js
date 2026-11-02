(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * master_list_index.js
     *
     * 各マスタアプリ一覧に「一覧印刷」ボタンを追加する。
     */

    const TOOLBAR_CLASS = 'ayanas-master-list-toolbar';
    const BUTTON_CLASS = 'ayanas-master-list-button';

    const assertModulesLoaded = () => {
        Validation.assertModule(MasterListRegistry, 'MasterListRegistry', 'getByAppId');
        Validation.assertModule(MasterList, 'MasterList', 'fetchReportData');
        Validation.assertModule(Preview, 'Preview', 'open');
    };

    const getToolbarId = (appId) => `ayanas-master-list-toolbar-${appId}`;

    const createButton = (definition) => {

        const button = document.createElement('button');

        button.type = 'button';
        button.className = BUTTON_CLASS;
        button.textContent = definition.buttonLabel;
        button.addEventListener('click', (event) => handlePrintClick(event, definition));

        return button;

    };

    const createToolbar = (definition) => {

        const toolbar = document.createElement('div');

        toolbar.id = getToolbarId(definition.appId);
        toolbar.className = TOOLBAR_CLASS;
        toolbar.appendChild(createButton(definition));

        return toolbar;

    };

    const mountToolbar = (definition) => {

        const toolbarId = getToolbarId(definition.appId);

        if (document.getElementById(toolbarId)) {
            return;
        }

        const toolbar = createToolbar(definition);
        const headerSpace = kintone.app.getHeaderSpaceElement();

        if (headerSpace) {
            headerSpace.prepend(toolbar);
            return;
        }

        const menuSpace = kintone.app.getHeaderMenuSpaceElement();

        if (menuSpace) {
            menuSpace.prepend(toolbar);
        }

    };

    const handlePrintClick = async (event, definition) => {

        const button = event.currentTarget;
        const originalLabel = button.textContent;

        button.disabled = true;
        button.textContent = '取得中...';

        try {

            assertModulesLoaded();

            const data = await MasterList.fetchReportData({ reportType: definition.reportType });

            if (!Array.isArray(data.details) || data.details.length === 0) {
                alert('印刷対象のデータがありません。');
                return;
            }

            await Preview.open(data, { reportType: definition.reportType });

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

    kintone.events.on('app.record.index.show', (event) => {

        const definition = MasterListRegistry.getByAppId(kintone.app.getId());

        if (!definition) {
            return event;
        }

        mountToolbar(definition);

        return event;

    });

})();
