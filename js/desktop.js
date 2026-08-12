(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * desktop.js
     *
     * kintone レコード詳細画面に印刷ボタンを配置し、
     * Record.get() でデータ取得 → Preview.open() でプレビュー表示を行う。
     */

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

    const getPluginBaseUrl = () => {

        const script = document.currentScript;

        if (!(script instanceof HTMLScriptElement) || !script.src) {
            throw new Error('pluginBaseUrl を取得できません。');
        }

        return script.src;

    };

    const handlePrintClick = () => {

        try {

            assertRecordLoaded();

            const data = Record.get();

            assertPreviewLoaded();

            Preview.open(data);

        } catch (error) {

            console.error('[AYANAS Print]', error);

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

        if (document.getElementById(BUTTON_ID)) {
            return event;
        }

        const space = kintone.app.record.getHeaderMenuSpaceElement();

        if (!space) {
            return event;
        }

        space.appendChild(createPrintButton(Layout.getButtonLabel()));

        return event;

    });

})();
