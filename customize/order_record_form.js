(function () {
    'use strict';

    /**
     * 受注明細（App 16）— 詳細・編集・追加画面のフォント拡大と行整列
     * order_record_form.css を同じアプリに CSS として登録してください。
     */

    const ORDER_APP_ID = 16;
    const BODY_CLASS = 'ayanas-order-record-ui';

    const isOrderApp = () => {

        if (typeof kintone === 'undefined' || typeof kintone.app?.getId !== 'function') {
            return false;
        }

        return kintone.app.getId() === ORDER_APP_ID;

    };

    const tagFieldControls = (record) => {

        if (typeof kintone.app.record?.getFieldElement !== 'function') {
            return;
        }

        if (!record || typeof record !== 'object') {
            return;
        }

        Object.keys(record).forEach((fieldCode) => {

            const fieldElement = kintone.app.record.getFieldElement(fieldCode);
            const control = fieldElement?.closest?.('.control-gaia');

            if (!control || control.dataset.ayanasOrderTagged === '1') {
                return;
            }

            control.dataset.ayanasOrderTagged = '1';
            control.classList.add('ayanas-order-field');
            control.classList.add(`ayanas-order-field--${fieldCode}`);

        });

    };

    const clearFormInlineWidths = () => {

        const selectors = [
            '.layout-gaia .control-gaia',
            '.layout-gaia .control-value-gaia',
            '.layout-gaia .control-inner-gaia',
            '.layout-gaia .input-text-outer-cybozu',
            '.layout-gaia .input-text-cybozu',
            '.layout-gaia .input-date-text-cybozu',
        ];

        selectors.forEach((selector) => {

            document.querySelectorAll(selector).forEach((element) => {

                element.style.removeProperty('width');
                element.style.removeProperty('max-width');
                element.style.removeProperty('min-width');

            });

        });

    };

    const refreshLayout = (record) => {

        tagFieldControls(record);
        clearFormInlineWidths();

    };

    const enableUi = (record) => {

        document.body.classList.add(BODY_CLASS);
        const run = () => refreshLayout(record);
        run();
        window.setTimeout(run, 0);
        window.setTimeout(run, 300);

    };

    const disableUi = () => {

        document.body.classList.remove(BODY_CLASS);

    };

    const onShow = (event) => {

        if (!isOrderApp()) {
            return event;
        }

        enableUi(event.record);

        return event;

    };

    const onHide = (event) => {

        if (!isOrderApp()) {
            return event;
        }

        disableUi();

        return event;

    };

    kintone.events.on([
        'app.record.detail.show',
        'app.record.edit.show',
        'app.record.create.show',
    ], onShow);

    kintone.events.on([
        'app.record.detail.hide',
        'app.record.edit.hide',
        'app.record.create.hide',
    ], onHide);

}());
