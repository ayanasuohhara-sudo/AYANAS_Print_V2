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

    const PAYMENT_APP_ID = 36;

    const RECEIVABLE_APP_ID = 37;

    const OVERSEAS_OUTBOUND_APP_ID = 28;



    const PLUGIN_VERSION = '90';



    const BUTTON_ID = 'ayanas-print-button';

    const GENERAL_DELIVERY_BUTTON_ID = 'ayanas-print-button-delivery-general';

    const GENERAL_DELIVERY_BUTTON_LABEL = '一般客 納品書';

    const GENERAL_INVOICE_BUTTON_ID = 'ayanas-print-button-invoice-general';

    const GENERAL_INVOICE_BUTTON_LABEL = '一般客 請求書';

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



        if (appId === OVERSEAS_OUTBOUND_APP_ID) {

            return false;

        }



        return true;



    };



    const getButtonLabel = () => Layout.getButtonLabel();



    const preparePrintData = async (printOptions = {}) => {



        assertRecordLoaded();



        const data = await Record.get();



        if (printOptions.recipientMode !== 'general') {

            return data;

        }



        const appId = getAppId();

        let recipient;

        if (appId === DELIVERY_APP_ID) {

            Validation.assertModule(Record, 'Record', 'resolveGeneralDeliveryRecipient');

            recipient = Record.resolveGeneralDeliveryRecipient(data.details);

        } else if (appId === INVOICE_APP_ID) {

            Validation.assertModule(Record, 'Record', 'resolveGeneralInvoiceRecipient');

            recipient = Record.resolveGeneralInvoiceRecipient(data.details);

        } else {

            return data;

        }



        if (!recipient.ok) {

            alert(recipient.message);

            return null;

        }



        return {

            header: {

                ...data.header,

                general_client_name: recipient.clientName,

            },

            details: data.details,

            summary: data.summary,

        };



    };



    const handlePrintClick = async (printOptions = {}) => {



        try {



            const data = await preparePrintData(printOptions);



            if (!data) {

                return;

            }



            assertPreviewLoaded();



            await Preview.open(data, printOptions);



        } catch (error) {



            console.error('[AYANAS Print V3]', error);



            const message = error instanceof Error

                ? error.message

                : '不明なエラーが発生しました。';



            alert(`印刷エラー\n\n${message}`);



        }



    };



    const createPrintButton = (options) => {



        const button = document.createElement('button');



        button.id = options.id;

        button.type = 'button';

        button.className = BUTTON_CLASS;

        button.textContent = options.label;

        button.addEventListener('click', () => {

            handlePrintClick(options.printOptions ?? {});

        });



        return button;



    };



    const appendInvoicePrintButtons = (space) => {



        if (!document.getElementById(BUTTON_ID)) {

            space.appendChild(createPrintButton({

                id: BUTTON_ID,

                label: getButtonLabel(),

            }));

        }



        if (!document.getElementById(GENERAL_INVOICE_BUTTON_ID)) {

            space.appendChild(createPrintButton({

                id: GENERAL_INVOICE_BUTTON_ID,

                label: GENERAL_INVOICE_BUTTON_LABEL,

                printOptions: {

                    recipientMode: 'general',

                },

            }));

        }



    };



    const appendDeliveryPrintButtons = (space) => {



        if (!document.getElementById(BUTTON_ID)) {

            space.appendChild(createPrintButton({

                id: BUTTON_ID,

                label: getButtonLabel(),

            }));

        }



        if (!document.getElementById(GENERAL_DELIVERY_BUTTON_ID)) {

            space.appendChild(createPrintButton({

                id: GENERAL_DELIVERY_BUTTON_ID,

                label: GENERAL_DELIVERY_BUTTON_LABEL,

                printOptions: {

                    recipientMode: 'general',

                },

            }));

        }



    };



    assertPreviewLoaded();

    assertLayoutLoaded();

    Preview.initialize(getPluginBaseUrl());

    console.info(`[AYANAS Print V3] plugin version ${PLUGIN_VERSION}`);



    kintone.events.on('app.record.detail.show', (event) => {



        if (!shouldShowPrintButton()) {

            return event;

        }



        document.getElementById('ayanas-print-button-order')?.remove();

        document.getElementById('ayanas-print-button-order-detail')?.remove();



        const space = kintone.app.record.getHeaderMenuSpaceElement();



        if (!space) {

            return event;

        }



        if (getAppId() === DELIVERY_APP_ID) {

            appendDeliveryPrintButtons(space);

            return event;

        }



        if (getAppId() === INVOICE_APP_ID) {

            appendInvoicePrintButtons(space);

            return event;

        }



        document.getElementById(GENERAL_DELIVERY_BUTTON_ID)?.remove();

        document.getElementById(GENERAL_INVOICE_BUTTON_ID)?.remove();



        if (document.getElementById(BUTTON_ID)) {

            return event;

        }



        space.appendChild(createPrintButton({

            id: BUTTON_ID,

            label: getButtonLabel(),

        }));



        return event;



    });



})();


