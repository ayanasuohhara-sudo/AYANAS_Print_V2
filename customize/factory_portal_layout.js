(function () {
    'use strict';

    if (window.CAYANAS_INTERNAL_OPS?.DISABLE_LEGACY_APP84) {
        return;
    }

    /**
     * App84 — 工場入庫・振り分け・工場作業を横並び表示
     */

    const C = window.CAYANAS_FACTORY_INBOUND;

    if (!C || !C.FACTORY_INBOUND_APP_ID) {
        return;
    }

    const STYLE_ID = 'cayan-factory-portal-layout-style';
    const HOST_ID = 'cayan-factory-portal-host';
    const INLINE_CLASS = 'cayan-factory-portal-inline';

    const PANEL_IDS = [
        'cayan-factory-inbound-panel',
        'cayan-factory-sorting-panel',
        'cayan-factory-work-panel',
    ];

    const injectStyles = () => {

        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '#' + HOST_ID + ' {',
            '  display: flex !important;',
            '  flex-direction: row !important;',
            '  flex-wrap: wrap !important;',
            '  align-items: flex-start !important;',
            '  gap: 16px !important;',
            '  width: 100% !important;',
            '  max-width: none !important;',
            '  margin: 8px 0 16px !important;',
            '  box-sizing: border-box !important;',
            '}',
            '#' + HOST_ID + ' > .control-gaia,',
            '#' + HOST_ID + ' > .cayan-factory-portal-col {',
            '  flex: 1 1 300px !important;',
            '  min-width: 280px !important;',
            '  max-width: 100% !important;',
            '  width: auto !important;',
            '  margin: 0 !important;',
            '  box-sizing: border-box !important;',
            '}',
            '.' + INLINE_CLASS + ' {',
            '  display: flex !important;',
            '  flex-direction: row !important;',
            '  flex-wrap: wrap !important;',
            '  align-items: flex-start !important;',
            '  gap: 16px !important;',
            '  width: 100% !important;',
            '  box-sizing: border-box !important;',
            '}',
            '.' + INLINE_CLASS + ' > * {',
            '  flex: 1 1 300px !important;',
            '  min-width: 280px !important;',
            '  max-width: 100% !important;',
            '  box-sizing: border-box !important;',
            '}',
            '#' + HOST_ID + ' .cayan-fi-panel,',
            '#' + HOST_ID + ' .cayan-fs-panel,',
            '#' + HOST_ID + ' .cayan-fw-panel,',
            '.' + INLINE_CLASS + ' .cayan-fi-panel,',
            '.' + INLINE_CLASS + ' .cayan-fs-panel,',
            '.' + INLINE_CLASS + ' .cayan-fw-panel {',
            '  max-width: none !important;',
            '  width: 100% !important;',
            '  margin-top: 0 !important;',
            '}',
            '.cayan-factory-portal-empty-row { display: none !important; }',
        ].join('\n');

        document.head.appendChild(style);

    };

    const columnRootForPanel = (panelEl) => {

        if (!panelEl) {
            return null;
        }

        const fieldBox = panelEl.closest('.control-gaia');

        if (fieldBox) {
            return fieldBox;
        }

        const mountRoot = panelEl.closest('#cayan-factory-sorting-mount-root, #cayan-factory-work-mount-root');

        if (mountRoot) {
            return mountRoot;
        }

        return panelEl.parentElement;

    };

    const hideEmptyFormRows = () => {

        document.querySelectorAll('.row-gaia').forEach((row) => {

            if (row.querySelector('#' + HOST_ID)) {
                return;
            }

            if (row.querySelector('.control-gaia')) {
                return;
            }

            if (row.querySelector(PANEL_IDS.map((id) => '#' + id).join(','))) {
                return;
            }

            row.classList.add('cayan-factory-portal-empty-row');

        });

    };

    const applyFactoryPortalLayout = () => {

        if (typeof kintone === 'undefined' || kintone.app.getId() !== C.FACTORY_INBOUND_APP_ID) {
            return false;
        }

        injectStyles();

        const panels = PANEL_IDS
            .map((id) => document.getElementById(id))
            .filter(Boolean);

        if (panels.length < 2) {
            return false;
        }

        const columns = [];
        const seen = new Set();

        panels.forEach((panel) => {

            const col = columnRootForPanel(panel);

            if (!col || seen.has(col)) {
                return;
            }

            seen.add(col);
            columns.push(col);

        });

        if (columns.length < 2) {
            return false;
        }

        const sharedParent = columns[0].parentElement;
        const allSameParent = sharedParent
            && sharedParent.id !== HOST_ID
            && columns.every((col) => col.parentElement === sharedParent);

        if (allSameParent && (
            sharedParent.id === C.UI_SPACE_ID
            || sharedParent.id === C.MESSAGE_SPACE_ID
            || sharedParent.id === 'cayan-factory-sorting-mount-root'
            || sharedParent.id === 'cayan-factory-work-mount-root'
        )) {
            sharedParent.classList.add(INLINE_CLASS);
            hideEmptyFormRows();
            return true;
        }

        let host = document.getElementById(HOST_ID);

        if (!host) {
            host = document.createElement('div');
            host.id = HOST_ID;
            host.className = INLINE_CLASS;
            columns[0].parentElement.insertBefore(host, columns[0]);
        }

        columns.forEach((col) => {

            if (col.parentElement !== host) {
                host.appendChild(col);
            }

        });

        hideEmptyFormRows();
        return true;

    };

    window.CAYANAS_applyFactoryPortalLayout = applyFactoryPortalLayout;

    const scheduleLayout = () => {

        [1000, 2200, 4000, 6500].forEach((delayMs) => {
            window.setTimeout(() => {
                applyFactoryPortalLayout();
            }, delayMs);
        });

    };

    kintone.events.on(['app.record.create.show', 'app.record.edit.show'], (event) => {

        scheduleLayout();

        return event;

    });

}());
