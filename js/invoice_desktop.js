(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * invoice_desktop.js
     *
     * 請求書作成アプリ（App 35）画面イベント。
     */

    const BUTTON_ID = 'ayanas-invoice-import-button';
    const BUTTON_CLASS = 'ayanas-invoice-import-button';

    /** V1.0: 未請求データ取込のみ。保存時の請求済更新は行わない */
    const MARK_INVOICED_ON_SAVE = false;

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
            closingYm: String(getFieldValue(record, fields.closingYm) ?? '').trim(),
            customerCode: String(getFieldValue(record, fields.customerCode) ?? '').trim(),
            invoiceDate: String(getFieldValue(record, fields.invoiceDate) ?? '').trim(),
        };

    };

    const applyInvoiceDataToForm = (invoiceData) => {

        const fields = InvoiceCreate.INVOICE_FIELDS;
        const { header, details, summary } = invoiceData;

        const updates = {
            [fields.closingYm]: { value: header.closing_ym },
            [fields.customerName]: { value: header.customer_name },
            [fields.detailTable]: InvoiceCreate.toInvoiceDetailFieldValue(details),
            [fields.itemCount]: { value: summary.item_count },
            [fields.qtyTotal]: { value: summary.qty_total },
            [fields.subtotal]: { value: summary.subtotal },
            [fields.tax]: { value: summary.tax },
            [fields.total]: { value: summary.total },
            [fields.invoiceAmount]: { value: summary.total },
        };

        kintone.app.record.set({ record: updates });

    };

    const handleImportUninvoicedClick = async () => {

        try {

            const current = kintone.app.record.get();
            const { closingDate, closingYm, customerCode, invoiceDate } = getFormValues(current.record);

            const invoiceData = await InvoiceCreate.importUninvoicedData({
                closingYm,
                closingDate,
                customerCode,
                referenceDate: invoiceDate,
            });

            applyInvoiceDataToForm(invoiceData);

            alert(
                `未請求データを取り込みました。\n\n`
                + `集計期間: ${invoiceData.header.period_label}\n`
                + `納品書: ${invoiceData.deliveryCount} 件\n`
                + `取得件数: ${invoiceData.summary.item_count} 点\n`
                + `数量合計: ${invoiceData.summary.qty_total}\n`
                + `税抜合計: ${invoiceData.summary.subtotal.toLocaleString()} 円\n`
                + `消費税: ${invoiceData.summary.tax.toLocaleString()} 円\n`
                + `税込合計: ${invoiceData.summary.total.toLocaleString()} 円`
            );

        } catch (error) {

            console.error('[AYANAS Invoice]', error);

            const message = error instanceof Error
                ? error.message
                : '不明なエラーが発生しました。';

            alert(`未請求データ取込エラー\n\n${message}`);

        }

    };

    const createImportButton = () => {

        const button = document.createElement('button');

        button.id = BUTTON_ID;
        button.type = 'button';
        button.className = BUTTON_CLASS;
        button.textContent = '未請求データ取込';
        button.addEventListener('click', handleImportUninvoicedClick);

        return button;

    };

    const appendImportButton = () => {

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

        space.appendChild(createImportButton());

    };

    const handleSubmitSuccess = async (event) => {

        if (!MARK_INVOICED_ON_SAVE || !isInvoiceApp()) {
            return event;
        }

        try {

            const fallbackIds = [...pendingDeliveryIds];
            const targetIds = await InvoiceCreate.resolveDeliveryIdsForRecord(
                event.record,
                fallbackIds
            );

            if (targetIds.length === 0) {
                return event;
            }

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

        appendImportButton();

        return event;

    });

    kintone.events.on(['app.record.create.submit.success', 'app.record.edit.submit.success'], handleSubmitSuccess);

})();
