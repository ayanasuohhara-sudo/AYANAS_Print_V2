(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * desktop.js
     *
     * kintone レコード詳細画面に印刷ボタンを配置し、
     * Record.get() → Preview.open() でプレビュー表示を行う。
     * 印刷以外の処理は行わない（請求業務は AYANAS Invoice プラグイン）。
     */

    const DELIVERY_APP_ID = 19;
    const INVOICE_APP_ID = 35;
    const ORDER_APP_ID = 16;
    const PAYMENT_APP_ID = 36;
    const RECEIVABLE_APP_ID = 37;

    const PLUGIN_VERSION = '55';

    const ORDER_PRINT_BUTTON_ID = 'ayanas-print-button-order';
    const ORDER_DETAIL_PRINT_BUTTON_ID = 'ayanas-print-button-order-detail';
    const BUTTON_CLASS = 'ayanas-print-button';

    const assertRecordLoaded = () => {
        Validation.assertModule(Record, 'Record', 'get');
    };

    const assertPreviewLoaded = () => {
        Validation.assertModule(Preview, 'Preview', 'open');
        Validation.assertModule(Preview, 'Preview', 'initialize');
    };

    const assertLayoutLoaded = () => {
        Validation.assertModule(Layout, 'Layout', 'getButtonLabel');
    };

    const getAppId = () => {

        try {

            if (typeof kintone === 'undefined' || typeof kintone.app?.getId !== 'function') {
                return null;
            }

            return kintone.app.getId();

        } catch (error) {
            return null;
        }

    };

    const getPluginBaseUrl = () => {

        const current = document.currentScript;

        if (current instanceof HTMLScriptElement && current.src) {
            return current.src;
        }

        const scriptUrl = findPrintPluginScriptUrlFromDesktop();

        if (scriptUrl) {
            return scriptUrl;
        }

        throw new Error('pluginBaseUrl を取得できません。');

    };

    const findPrintPluginScriptUrlFromDesktop = () => {

        const scripts = Array.from(document.querySelectorAll('script[src*="download.do"]'));

        for (let index = scripts.length - 1; index >= 0; index -= 1) {

            const src = scripts[index]?.src ?? '';

            if (!src.includes('type=DESKTOP_JS')) {
                continue;
            }

            try {

                if (new URL(src).searchParams.get('pluginId')) {
                    return src;
                }

            } catch (error) {
                continue;
            }

        }

        return '';

    };

    const shouldShowPrintButton = () => {

        const appId = getAppId();

        if (appId === PAYMENT_APP_ID || appId === RECEIVABLE_APP_ID) {
            return false;
        }

        if (appId === INVOICE_APP_ID) {
            return false;
        }

        return true;

    };

    const isOrderApp = () => getAppId() === ORDER_APP_ID;

    const getButtonLabel = () => Layout.getButtonLabel();

    const handlePrintClick = async (reportType) => {

        try {

            assertRecordLoaded();

            const data = await Record.get();

            assertPreviewLoaded();

            await Preview.open(data, reportType ? { reportType } : {});

        } catch (error) {

            console.error('[AYANAS Print V3]', error);

            const message = error instanceof Error
                ? error.message
                : '不明なエラーが発生しました。';

            alert(`印刷エラー\n\n${message}`);

        }

    };

    const createPrintButton = (id, label, reportType) => {

        const button = document.createElement('button');

        button.id = id;
        button.type = 'button';
        button.className = BUTTON_CLASS;
        button.textContent = label;
        button.addEventListener('click', () => handlePrintClick(reportType));

        return button;

    };

    const removePrintButtons = () => {

        document.getElementById(ORDER_PRINT_BUTTON_ID)?.remove();
        document.getElementById(ORDER_DETAIL_PRINT_BUTTON_ID)?.remove();
        document.getElementById('ayanas-print-button')?.remove();

    };

    const appendPrintButtons = () => {

        const space = kintone.app.record.getHeaderMenuSpaceElement();

        if (!space) {
            return;
        }

        removePrintButtons();

        if (isOrderApp()) {
            space.appendChild(createPrintButton(
                ORDER_PRINT_BUTTON_ID,
                '受注票印刷',
                'order'
            ));
            space.appendChild(createPrintButton(
                ORDER_DETAIL_PRINT_BUTTON_ID,
                '受注明細表',
                'order_detail'
            ));
            return;
        }

        space.appendChild(createPrintButton(
            'ayanas-print-button',
            getButtonLabel(),
            null
        ));

    };

    assertPreviewLoaded();
    assertLayoutLoaded();
    Preview.initialize(getPluginBaseUrl());
    console.info(`[AYANAS Print V3] plugin version ${PLUGIN_VERSION}`);

    kintone.events.on('app.record.detail.show', (event) => {

        if (!shouldShowPrintButton()) {
            return event;
        }

        if (document.getElementById(ORDER_PRINT_BUTTON_ID)
            || document.getElementById(ORDER_DETAIL_PRINT_BUTTON_ID)
            || document.getElementById('ayanas-print-button')) {
            return event;
        }

        appendPrintButtons();

        return event;

    });

})();
