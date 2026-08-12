(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * invoice_desktop.js
     *
     * 請求書作成アプリの画面イベント。
     * 締日指定 → 納品書抽出 → 請求明細作成 → 税計算 → 保存時に請求済更新。
     */

    const BUTTON_ID = 'ayanas-invoice-create-button';
    const BUTTON_CLASS = 'ayanas-invoice-create-button';

    const pendingDeliveryIds = new Set();

    const isInvoiceApp = () => {

        if (typeof kintone === 'undefined' || typeof kintone.app?.getId !== 'function') {
            return false;
        }

        return kintone.app.getId() === InvoiceCreate.getInvoiceAppId();

    };

    const getFieldValue = (record, fieldCode) => {

        const field = record?.[fieldCode];

        if (!field || field.value === null || field.value === undefined) {
            return '';
        }

        return field.value;

    };

    const getFormValues = (record) => {

        const fields = InvoiceCreate.INVOICE_FIELDS;

        return {
            closingDate: String(getFieldValue(record, fields.closingDate) ?? '').trim(),
            customerCode: String(getFieldValue(record, fields.customerCode) ?? '').trim(),
        };

    };

    const applyInvoiceDataToForm = (invoiceData) => {

        const fields = InvoiceCreate.INVOICE_FIELDS;
        const { header, details, summary } = invoiceData;

        kintone.app.record.set({
            record: {
                [fields.customerName]: { value: header.customer_name },
                [fields.detailTable]: InvoiceCreate.toInvoiceDetailFieldValue(details),
                [fields.subtotal]: { value: summary.subtotal },
                [fields.tax]: { value: summary.tax },
                [fields.total]: { value: summary.total },
            },
        });

    };

    const handleCreateInvoiceClick = async () => {

        try {

            const current = kintone.app.record.get();
            const { closingDate, customerCode } = getFormValues(current.record);

            const invoiceData = await InvoiceCreate.buildInvoiceData({
                closingDate,
                customerCode,
            });

            pendingDeliveryIds.clear();

            invoiceData.deliveryRecordIds.forEach((id) => {
                pendingDeliveryIds.add(id);
            });

            applyInvoiceDataToForm(invoiceData);

            alert(
                `請求明細を作成しました。\n\n`
                + `納品書: ${invoiceData.deliveryCount} 件\n`
                + `明細行: ${invoiceData.summary.count} 行\n`
                + `税抜合計: ${invoiceData.summary.subtotal.toLocaleString()} 円\n`
                + `消費税: ${invoiceData.summary.tax.toLocaleString()} 円\n`
                + `税込合計: ${invoiceData.summary.total.toLocaleString()} 円\n\n`
                + '保存すると、対象納品書に請求済フラグが設定されます。'
            );

        } catch (error) {

            console.error('[AYANAS Invoice]', error);

            const message = error instanceof Error
                ? error.message
                : '不明なエラーが発生しました。';

            alert(`請求明細作成エラー\n\n${message}`);

        }

    };

    const createInvoiceButton = () => {

        const button = document.createElement('button');

        button.id = BUTTON_ID;
        button.type = 'button';
        button.className = BUTTON_CLASS;
        button.textContent = '請求明細を作成';
        button.addEventListener('click', handleCreateInvoiceClick);

        return button;

    };

    const appendInvoiceButton = () => {

        if (!isInvoiceApp()) {
            return;
        }

        if (document.getElementById(BUTTON_ID)) {
            return;
        }

        const space = kintone.app.record.getHeaderMenuSpaceElement();

        if (!space) {
            return;
        }

        space.appendChild(createInvoiceButton());

    };

    const handleSubmitSuccess = async (event) => {

        if (!isInvoiceApp()) {
            return event;
        }

        const recordDeliveryIds = InvoiceCreate.collectDeliveryIdsFromRecord(event.record);
        const targetIds = recordDeliveryIds.length > 0
            ? recordDeliveryIds
            : [...pendingDeliveryIds];

        if (targetIds.length === 0) {
            return event;
        }

        try {

            const updatedCount = await InvoiceCreate.markDeliveriesAsInvoiced(targetIds);

            pendingDeliveryIds.clear();

            console.log(`[AYANAS Invoice] 請求済更新: ${updatedCount} 件`);

        } catch (error) {

            console.error('[AYANAS Invoice]', error);

            const message = error instanceof Error
                ? error.message
                : '不明なエラーが発生しました。';

            alert(
                `請求書は保存されましたが、納品書の請求済更新に失敗しました。\n\n${message}`
            );

        }

        return event;

    };

    kintone.events.on(['app.record.create.show', 'app.record.edit.show'], (event) => {

        appendInvoiceButton();

        return event;

    });

    kintone.events.on(['app.record.create.submit.success', 'app.record.edit.submit.success'], handleSubmitSuccess);

})();
