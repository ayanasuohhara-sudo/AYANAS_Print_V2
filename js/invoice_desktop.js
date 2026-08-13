(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * invoice_desktop.js
     *
     * 請求書作成アプリ（App 35）画面イベント。
     */

    const IMPORT_BUTTON_ID = 'ayanas-invoice-import-button';
    const CREATE_BUTTON_ID = 'ayanas-invoice-create-button';
    const CONFIRM_BUTTON_ID = 'ayanas-invoice-confirm-button';
    const IMPORT_BUTTON_CLASS = 'ayanas-invoice-import-button';
    const CREATE_BUTTON_CLASS = 'ayanas-invoice-create-button';
    const CONFIRM_BUTTON_CLASS = 'ayanas-invoice-confirm-button';

    /** V1.0: 請求済更新は行わない（V1.1 で実装） */
    const MARK_INVOICED_ON_SAVE = false;

    let invoiceCompletionPending = false;
    let currentRecordId = null;

    const resolveCurrentInvoiceRecord = async () => {

        try {

            const current = kintone.app.record.get();

            return {
                record: current.record,
                recordId: getRecordId(current.record),
            };

        } catch (error) {

            if (!currentRecordId) {
                throw new Error('レコード ID を取得できません。保存後に再度お試しください。');
            }

            const record = await InvoiceCreate.fetchInvoiceRecord(currentRecordId);

            return {
                record,
                recordId: currentRecordId,
            };

        }

    };

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
            customerCode: String(getFieldValue(record, fields.customerCode) ?? '').trim(),
            billingFrom: String(getFieldValue(record, fields.billingFrom) ?? '').trim(),
            billingTo: String(getFieldValue(record, fields.billingTo) ?? '').trim(),
        };

    };

    const applyInvoiceDataToForm = (invoiceData) => {

        const fields = InvoiceCreate.INVOICE_FIELDS;
        const { header, details, summary } = invoiceData;

        kintone.app.record.set({
            record: {
                [fields.detailTable]: InvoiceCreate.toInvoiceDetailFieldValue([]),
            },
        });

        kintone.app.record.set({
            record: {
                [fields.customerName]: { value: header.customer_name },
                [fields.detailTable]: InvoiceCreate.toInvoiceDetailFieldValue(details),
                [fields.itemCount]: { value: summary.item_count },
                [fields.qtyTotal]: { value: summary.qty_total },
                [fields.subtotal]: { value: summary.subtotal },
                [fields.tax]: { value: summary.tax },
                [fields.total]: { value: summary.total },
                [fields.invoiceAmount]: { value: summary.total },
            },
        });

    };

    const applyInvoiceCompletionToForm = (completion) => {

        const fields = InvoiceCreate.INVOICE_FIELDS;
        const updates = {};

        Object.entries(completion).forEach(([fieldCode, value]) => {
            updates[fieldCode] = { value };
        });

        kintone.app.record.set({ record: updates });

    };

    const handleImportUninvoicedClick = async () => {

        try {

            const current = kintone.app.record.get();
            const { customerCode, billingFrom, billingTo } = getFormValues(current.record);

            const invoiceData = await InvoiceCreate.importUninvoicedData({
                customerCode,
                billingFrom,
                billingTo,
            });

            applyInvoiceDataToForm(invoiceData);

            alert(
                `未請求データを取り込みました。\n\n`
                + `請求対象期間: ${invoiceData.header.period_label}\n`
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

            if (message === InvoiceCreate.NO_DATA_MESSAGE) {
                alert(message);
                return;
            }

            alert(`未請求データ取込エラー\n\n${message}`);

        }

    };

    const getRecordId = (record) => {

        const id = record?.$id?.value;

        if (id === null || id === undefined || id === '') {
            return null;
        }

        return Number(id);

    };

    const applyInvoiceStatusToForm = (status) => {

        const fields = InvoiceCreate.INVOICE_FIELDS;

        kintone.app.record.set({
            record: {
                [fields.invoiceStatus]: { value: status },
            },
        });

    };

    const handleConfirmInvoiceClick = async () => {

        if (!window.confirm(InvoiceCreate.INVOICE_CONFIRM_DIALOG)) {
            return;
        }

        try {

            const { record, recordId } = await resolveCurrentInvoiceRecord();

            await InvoiceCreate.confirmInvoice({
                record,
                recordId,
            });

            try {
                applyInvoiceStatusToForm(InvoiceCreate.INVOICE_STATUS_CONFIRMED);
            } catch (formError) {
                // 詳細画面など record.set 非対応の場合は API 更新のみ
            }

            alert(InvoiceCreate.INVOICE_CONFIRM_MESSAGE);

        } catch (error) {

            console.error('[AYANAS Invoice]', error);

            const message = error instanceof Error
                ? error.message
                : '不明なエラーが発生しました。';

            alert(message);

        }

    };

    const handleCreateInvoiceClick = async () => {

        try {

            const current = kintone.app.record.get();
            const completion = await InvoiceCreate.buildInvoiceCompletion(current.record);

            applyInvoiceCompletionToForm(completion);
            invoiceCompletionPending = true;

            alert(
                '請求書の内容を設定しました。\n\n'
                + `請求番号: ${completion[InvoiceCreate.INVOICE_FIELDS.invoiceNo]}\n`
                + `請求日: ${completion[InvoiceCreate.INVOICE_FIELDS.invoiceDate]}\n`
                + `請求締年月: ${completion[InvoiceCreate.INVOICE_FIELDS.closingYm]}\n\n`
                + '保存してください。'
            );

        } catch (error) {

            console.error('[AYANAS Invoice]', error);

            const message = error instanceof Error
                ? error.message
                : '不明なエラーが発生しました。';

            alert(`請求書作成エラー\n\n${message}`);

        }

    };

    const createButton = (id, className, label, handler) => {

        const button = document.createElement('button');

        button.id = id;
        button.type = 'button';
        button.className = className;
        button.textContent = label;
        button.addEventListener('click', handler);

        return button;

    };

    const appendInvoiceButtons = (includeConfirm = false) => {

        if (!isInvoiceApp()) {
            return;
        }

        const space = kintone.app.record.getHeaderMenuSpaceElement();

        if (!space) {
            return;
        }

        if (!document.getElementById(IMPORT_BUTTON_ID)) {
            space.appendChild(createButton(
                IMPORT_BUTTON_ID,
                IMPORT_BUTTON_CLASS,
                '未請求データ取込',
                handleImportUninvoicedClick
            ));
        }

        if (!document.getElementById(CREATE_BUTTON_ID)) {
            space.appendChild(createButton(
                CREATE_BUTTON_ID,
                CREATE_BUTTON_CLASS,
                '請求書作成',
                handleCreateInvoiceClick
            ));
        }

        if (includeConfirm && !document.getElementById(CONFIRM_BUTTON_ID)) {
            space.appendChild(createButton(
                CONFIRM_BUTTON_ID,
                CONFIRM_BUTTON_CLASS,
                '請求確定',
                handleConfirmInvoiceClick
            ));
        }

    };

    const handleSubmitSuccess = async (event) => {

        if (!isInvoiceApp()) {
            return event;
        }

        if (invoiceCompletionPending) {
            invoiceCompletionPending = false;
            alert(InvoiceCreate.INVOICE_COMPLETE_MESSAGE);
        }

        if (!MARK_INVOICED_ON_SAVE) {
            return event;
        }

        try {

            const targetIds = await InvoiceCreate.resolveDeliveryIdsForRecord(event.record);

            if (targetIds.length === 0) {
                return event;
            }

            const updatedCount = await InvoiceCreate.markDeliveriesAsInvoiced(targetIds);

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

        currentRecordId = event.recordId ?? null;
        appendInvoiceButtons(Boolean(event.recordId));

        return event;

    });

    kintone.events.on('app.record.detail.show', (event) => {

        if (!isInvoiceApp()) {
            return event;
        }

        currentRecordId = event.recordId ?? null;
        appendInvoiceButtons(true);

        return event;

    });

    kintone.events.on(['app.record.create.submit.success', 'app.record.edit.submit.success'], handleSubmitSuccess);

})();
