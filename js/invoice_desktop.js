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
    const CANCEL_BUTTON_ID = 'ayanas-invoice-cancel-button';
    const IMPORT_BUTTON_CLASS = 'ayanas-invoice-import-button';
    const CREATE_BUTTON_CLASS = 'ayanas-invoice-create-button';
    const CONFIRM_BUTTON_CLASS = 'ayanas-invoice-confirm-button';
    const CANCEL_BUTTON_CLASS = 'ayanas-invoice-cancel-button';

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
            closingYm: String(getFieldValue(record, fields.closingYm) ?? '').trim(),
            closingDate: String(getFieldValue(record, fields.closingDate) ?? '').trim(),
            billingFrom: String(getFieldValue(record, fields.billingFrom) ?? '').trim(),
            billingTo: String(getFieldValue(record, fields.billingTo) ?? '').trim(),
            invoiceDate: String(getFieldValue(record, fields.invoiceDate) ?? '').trim(),
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

        const updates = {
            [fields.customerName]: { value: header.customer_name },
            [fields.detailTable]: InvoiceCreate.toInvoiceDetailFieldValue(details),
            [fields.itemCount]: { value: summary.item_count },
            [fields.qtyTotal]: { value: summary.qty_total },
            [fields.subtotal]: { value: summary.subtotal },
            [fields.tax]: { value: summary.tax },
            [fields.total]: { value: summary.total },
            [fields.invoiceAmount]: { value: summary.total },
        };

        if (header.closing_ym) {
            updates[fields.closingYm] = { value: header.closing_ym };
        }

        if (header.closing_date) {
            updates[fields.closingDate] = { value: header.closing_date };
        }

        if (header.billing_from) {
            updates[fields.billingFrom] = { value: header.billing_from };
        }

        if (header.billing_to) {
            updates[fields.billingTo] = { value: header.billing_to };
        }

        kintone.app.record.set({ record: updates });

    };

    const applyInvoiceCompletionToForm = (completion) => {

        const fields = InvoiceCreate.INVOICE_FIELDS;
        const updates = {};

        Object.entries(completion).forEach(([fieldCode, value]) => {
            updates[fieldCode] = { value };
        });

        kintone.app.record.set({ record: updates });

    };

    const applyInvoiceVoidToForm = () => {

        const fields = InvoiceCreate.INVOICE_FIELDS;
        const voidUpdate = InvoiceCreate.buildInvoiceVoidUpdate();
        const updates = {};

        Object.entries(voidUpdate).forEach(([fieldCode, fieldValue]) => {
            updates[fieldCode] = fieldValue;
        });

        kintone.app.record.set({ record: updates });

    };

    const handleImportUninvoicedClick = async () => {

        try {

            const current = kintone.app.record.get();
            const recordId = getRecordId(current.record);

            if (!recordId) {
                await InvoicePermission.assertAddRecord();
            } else {
                await InvoicePermission.assertEditCurrentRecord(current.record);
            }

            const { customerCode, closingYm, closingDate, billingFrom, billingTo, invoiceDate } = getFormValues(current.record);

            const invoiceData = await InvoiceCreate.importUninvoicedData({
                customerCode,
                closingYm,
                closingDate,
                billingFrom,
                billingTo,
                invoiceDate,
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

        if (message === InvoicePermission.PERMISSION_DENIED_MESSAGE) {
                alert(message);
                return;
            }

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

            await InvoicePermission.assertConfirm(record);

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

    const handleCancelInvoiceClick = async () => {

        if (!window.confirm(InvoiceCreate.INVOICE_CANCEL_DIALOG)) {
            return;
        }

        try {

            const { record, recordId } = await resolveCurrentInvoiceRecord();

            await InvoicePermission.assertVoid(record);

            await InvoiceCreate.voidInvoice({
                record,
                recordId,
            });

            try {
                applyInvoiceVoidToForm();
            } catch (formError) {
                // 詳細画面など record.set 非対応の場合は API 更新のみ
            }

            alert(InvoiceCreate.INVOICE_CANCEL_MESSAGE);

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
            const recordId = getRecordId(current.record);

            if (!recordId) {
                await InvoicePermission.assertAddRecord();
            } else {
                await InvoicePermission.assertEditCurrentRecord(current.record);
            }

            const completion = await InvoiceCreate.buildInvoiceCompletion(current.record);

            applyInvoiceCompletionToForm(completion);
            invoiceCompletionPending = true;

            alert(
                '請求書の内容を設定しました。\n\n'
                + `請求日: ${completion[InvoiceCreate.INVOICE_FIELDS.invoiceDate]}\n`
                + `支払期限: ${completion[InvoiceCreate.INVOICE_FIELDS.dueDate]}\n`
                + `請求締年月: ${completion[InvoiceCreate.INVOICE_FIELDS.closingYm]}\n\n`
                + '保存すると請求番号が自動採番されます。'
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

    const appendInvoiceButtons = ({
        includeImport = false,
        includeCreate = false,
        includeConfirm = false,
        includeCancel = false,
    } = {}) => {

        if (!isInvoiceApp()) {
            return;
        }

        const space = kintone.app.record.getHeaderMenuSpaceElement();

        if (!space) {
            return;
        }

        document.getElementById(IMPORT_BUTTON_ID)?.remove();
        document.getElementById(CREATE_BUTTON_ID)?.remove();
        document.getElementById(CONFIRM_BUTTON_ID)?.remove();
        document.getElementById(CANCEL_BUTTON_ID)?.remove();

        if (includeImport) {
            space.appendChild(createButton(
                IMPORT_BUTTON_ID,
                IMPORT_BUTTON_CLASS,
                '未請求データ取込',
                handleImportUninvoicedClick
            ));
        }

        if (includeCreate) {
            space.appendChild(createButton(
                CREATE_BUTTON_ID,
                CREATE_BUTTON_CLASS,
                '請求書作成',
                handleCreateInvoiceClick
            ));
        }

        if (includeConfirm) {
            space.appendChild(createButton(
                CONFIRM_BUTTON_ID,
                CONFIRM_BUTTON_CLASS,
                '請求確定',
                handleConfirmInvoiceClick
            ));
        }

        if (includeCancel) {
            space.appendChild(createButton(
                CANCEL_BUTTON_ID,
                CANCEL_BUTTON_CLASS,
                '請求書取消',
                handleCancelInvoiceClick
            ));
        }

    };

    const refreshInvoiceButtons = async (record, recordId) => {

        const options = typeof InvoicePermission !== 'undefined'
            ? await InvoicePermission.getActionOptions(record, recordId)
            : getInvoiceActionOptions(record, recordId);

        appendInvoiceButtons(options);

    };

    const getInvoiceActionOptions = (record, recordId) => {

        const fields = InvoiceCreate.INVOICE_FIELDS;
        const invoiceStatus = String(getFieldValue(record, fields.invoiceStatus) ?? '').trim();
        const hasRecord = Boolean(recordId);

        return {
            includeConfirm: hasRecord && invoiceStatus === InvoiceCreate.INVOICE_STATUS_CREATING,
            includeCancel: hasRecord && invoiceStatus === InvoiceCreate.INVOICE_STATUS_CREATING,
        };

    };

    const handleSubmit = async (event) => {

        if (!isInvoiceApp()) {
            return event;
        }

        try {

            if (!event.recordId) {
                await InvoicePermission.assertAddRecord();
            } else {
                await InvoicePermission.assertEditSubmit(event.record);
            }

            const fields = InvoiceCreate.INVOICE_FIELDS;
            const isCreate = !event.recordId;
            const invoiceNo = await InvoiceCreate.assignInvoiceNoForSave({
                record: event.record,
                recordId: event.recordId ?? null,
                isCreate,
            });

            if (!event.record[fields.invoiceNo]) {
                event.record[fields.invoiceNo] = { value: invoiceNo };
            } else {
                event.record[fields.invoiceNo].value = invoiceNo;
            }

        } catch (error) {

            console.error('[AYANAS Invoice]', error);

            event.error = error instanceof Error
                ? error.message
                : '請求番号の採番に失敗しました。';

        }

        return event;

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

    kintone.events.on(['app.record.create.show', 'app.record.edit.show'], async (event) => {

        if (!isInvoiceApp()) {
            return event;
        }

        currentRecordId = event.recordId ?? null;
        await refreshInvoiceButtons(event.record, event.recordId);

        return event;

    });

    kintone.events.on('app.record.detail.show', async (event) => {

        if (!isInvoiceApp()) {
            return event;
        }

        currentRecordId = event.recordId ?? null;
        await refreshInvoiceButtons(event.record, event.recordId);

        return event;

    });

    kintone.events.on(['app.record.create.submit', 'app.record.edit.submit'], handleSubmit);

    kintone.events.on(['app.record.create.submit.success', 'app.record.edit.submit.success'], handleSubmitSuccess);

})();
