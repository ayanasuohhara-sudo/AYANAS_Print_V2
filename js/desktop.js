(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * desktop.js
     *
     * kintone レコード詳細画面に印刷ボタンを配置し、
     * Record.get() → Preview.open() でプレビュー表示を行う。
     */

    const DELIVERY_APP_ID = 19;

    const getInvoiceAppId = () => {

        if (typeof InvoiceCreate !== 'undefined' && typeof InvoiceCreate.getInvoiceAppId === 'function') {
            return InvoiceCreate.getInvoiceAppId();
        }

        return 35;

    };

    const getPaymentAppId = () => {

        if (typeof PaymentCreate !== 'undefined' && typeof PaymentCreate.getPaymentAppId === 'function') {
            return PaymentCreate.getPaymentAppId();
        }

        return 36;

    };

    const getReceivableAppId = () => {

        if (typeof ReceivableCreate !== 'undefined' && typeof ReceivableCreate.getReceivableAppId === 'function') {
            return ReceivableCreate.getReceivableAppId();
        }

        return 37;

    };

    const BUTTON_ID = 'ayanas-print-button';
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

        const scripts = document.querySelectorAll('script[src*="desktop.js"]');

        if (scripts.length > 0) {
            return scripts[scripts.length - 1].src;
        }

        const script = document.currentScript;

        if (script instanceof HTMLScriptElement && script.src) {
            return script.src;
        }

        throw new Error('pluginBaseUrl を取得できません。');

    };

    const getButtonLabel = () => Layout.getButtonLabel();

    const handlePrintClick = async () => {

        try {

            assertRecordLoaded();

            const data = Record.get();

            assertPreviewLoaded();

            await Preview.open(data);

        } catch (error) {

            console.error('[AYANAS Print V3]', error);

            const message = error instanceof Error
                ? error.message
                : '不明なエラーが発生しました。';

            alert(`印刷エラー\n\n${message}`);

        }

    };

    const createPrintButton = (label) => {

        const button = document.createElement('button');

        button.id = BUTTON_ID;
        button.type = 'button';
        button.className = BUTTON_CLASS;
        button.textContent = label;
        button.addEventListener('click', handlePrintClick);

        return button;

    };

    assertPreviewLoaded();
    assertLayoutLoaded();
    Preview.initialize(getPluginBaseUrl());

    kintone.events.on('app.record.detail.show', (event) => {

        if (getAppId() === getPaymentAppId() || getAppId() === getReceivableAppId()) {
            return event;
        }

        if (document.getElementById(BUTTON_ID)) {
            return event;
        }

        const space = kintone.app.record.getHeaderMenuSpaceElement();

        if (!space) {
            return event;
        }

        space.appendChild(createPrintButton(getButtonLabel()));

        return event;

    });

})();
