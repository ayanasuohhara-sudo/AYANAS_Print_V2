(function () {
    'use strict';

    /**
     * 入金管理 App 21（V2）
     * payment_desktop.js — 画面イベント・未入金請求取得・請求書同期
     */

    if (typeof PaymentCreateV2 === 'undefined') {
        console.error('[payment_desktop] payment_create.js を先に読み込んでください。');
        return;
    }

    if (typeof PaymentCreateV2.refreshCustomerDisplayAmounts !== 'function') {
        window.alert(
            '入金管理JSの payment_create.js が古いか、正しく読み込まれていません。\n'
            + 'App 21 のカスタマイズで payment_create.js（V2.0.3）を payment_desktop.js より先に登録し、両方を最新版に差し替えてください。'
        );
        console.error('[payment_desktop] PaymentCreateV2.VERSION=', PaymentCreateV2.VERSION);
        return;
    }

    const PAYMENT_APP_ID = PaymentCreateV2.getPaymentAppId();

    if (kintone.app.getId() !== PAYMENT_APP_ID) {
        return;
    }

    const F = PaymentCreateV2.PAYMENT_FIELDS;
    const AF = PaymentCreateV2.ALLOCATION_FIELDS;

    const HIDDEN_ALLOCATION_COLUMNS = [
        `${F.allocationTable}.${AF.cashAllocation}`,
        `${F.allocationTable}.${AF.feeAllocation}`,
        `${F.allocationTable}.${AF.discountAllocation}`,
    ];

    const BUTTON_FETCH_ID = 'payment-v2-fetch-open-invoices';
    const BUTTON_SUGGEST_ID = 'payment-v2-suggest-allocation';
    const PANEL_HISTORY_ID = 'payment-v2-history-panel';

    let invoiceNosBeforeEdit = [];
    let invoiceNosBeforeDelete = [];
    let isApplyingRecord = false;

    /** プラグイン（AYANAS Invoice 等）より後に実行する */
    const scheduleAfterPlugins = (callback) => {
        window.setTimeout(callback, 0);
        window.setTimeout(callback, 150);
    };

    /**
     * Invoice v7 等が取引先欄を無効化することがあるため、ルックアップ入力だけ再有効化する。
     * 取引先名（コピー先）は触らない。
     */
    const ensureCustomerLookupEditable = () => {

        const enableField = (fieldCode) => {

            try {

                const el = kintone.app.record.getFieldElement(fieldCode);

                if (!el) {
                    return;
                }

                el.querySelectorAll('input, textarea').forEach((input) => {
                    input.readOnly = false;
                    input.disabled = false;
                });

                el.querySelectorAll('button').forEach((button) => {
                    button.disabled = false;
                });

            } catch (error) {
                console.warn('[payment_desktop] enable field', fieldCode, error);
            }

        };

        enableField(F.customerCode);
        enableField(F.clientName);

    };

    const hideInternalColumns = (event) => {

        HIDDEN_ALLOCATION_COLUMNS.forEach((fieldCode) => {

            try {
                kintone.app.record.setFieldShown(fieldCode, false);
            } catch (error) {
                console.warn('[payment_desktop] setFieldShown', fieldCode, error);
            }

        });

        return event;

    };

    const getRecordId = (record) => {

        const id = record?.$id?.value;

        return id ? String(id) : null;

    };

    const hasAllocationRows = (record) => {

        const rows = record[F.allocationTable]?.value ?? [];

        return rows.some((row) => String(row?.value?.[AF.invoiceNo]?.value ?? '').trim() !== '');

    };

    const fetchPaymentRecord = async (recordId) => {

        const response = await kintone.api(kintone.api.url('/k/v1/record', true), 'GET', {
            app: PAYMENT_APP_ID,
            id: recordId,
        });

        return response.record;

    };

    const refreshCalculations = async (record, excludeId = null) => {

        await PaymentCreateV2.refreshCustomerDisplayAmounts(record, excludeId);

        if (hasAllocationRows(record)) {
            await PaymentCreateV2.refreshRowSnapshots(record, excludeId);
        }

        PaymentCreateV2.applyHeaderCalculations(record);

    };

    /** ルックアップ欄（取引先コード等）を触らず、計算結果だけ反映する */
    const CALCULATED_HEADER_FIELD_CODES = [
        F.displayLastInvoiceAmount,
        F.displayCurrentBalance,
        F.displayBalanceAfter,
        F.writeoffAmount,
        F.allocationTotal,
        F.allocationDiff,
    ];

    const applyRecordToScreen = (record, options = {}) => {

        const { includeAllocationTable = false } = options;

        if (isApplyingRecord) {
            return;
        }

        const patch = {};

        CALCULATED_HEADER_FIELD_CODES.forEach((fieldCode) => {

            if (record[fieldCode]) {
                patch[fieldCode] = record[fieldCode];
            }

        });

        if (includeAllocationTable && record[F.allocationTable]) {
            patch[F.allocationTable] = record[F.allocationTable];
        }

        if (Object.keys(patch).length === 0) {
            return;
        }

        isApplyingRecord = true;

        try {
            kintone.app.record.set({ record: patch });
        } finally {
            window.setTimeout(() => {
                isApplyingRecord = false;
            }, 0);
        }

    };

    const ensureHeaderButtons = () => {

        const space = kintone.app.record.getHeaderMenuSpaceElement();

        if (!space) {
            return;
        }

        if (!document.getElementById(BUTTON_FETCH_ID)) {

            const fetchButton = document.createElement('button');

            fetchButton.id = BUTTON_FETCH_ID;
            fetchButton.type = 'button';
            fetchButton.textContent = '未入金請求取得';
            fetchButton.className = 'kintoneplugin-button-dialog-ok';
            fetchButton.style.marginRight = '8px';
            fetchButton.addEventListener('click', onFetchOpenInvoicesClick);
            space.appendChild(fetchButton);

        }

        if (!document.getElementById(BUTTON_SUGGEST_ID)) {

            const suggestButton = document.createElement('button');

            suggestButton.id = BUTTON_SUGGEST_ID;
            suggestButton.type = 'button';
            suggestButton.textContent = '充当案を作成';
            suggestButton.className = 'kintoneplugin-button-dialog-ok';
            suggestButton.addEventListener('click', onSuggestAllocationClick);
            space.appendChild(suggestButton);

        }

    };

    const renderHistoryPanel = async (customerCode) => {

        const existing = document.getElementById(PANEL_HISTORY_ID);

        if (existing) {
            existing.remove();
        }

        const code = String(customerCode ?? '').trim();

        if (!code) {
            return;
        }

        const query = `${F.customerCode} = "${code.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" order by ${F.paymentDate} desc, $id desc limit 20`;
        const response = await kintone.api(kintone.api.url('/k/v1/records', true), 'GET', {
            app: PAYMENT_APP_ID,
            query,
            fields: [
                F.paymentDate,
                F.paymentMethod,
                F.paymentAmount,
                F.fee,
                F.discountAmount,
                F.displayBalanceAfter,
                F.clientName,
                F.paymentNo,
                F.paymentRecordStatus,
            ],
        });

        const container = document.createElement('div');

        container.id = PANEL_HISTORY_ID;
        container.style.margin = '16px 0';
        container.style.padding = '12px';
        container.style.border = '1px solid #ccc';
        container.style.background = '#fafafa';

        const title = document.createElement('h3');

        title.textContent = '直近の入金履歴（参照）';
        title.style.margin = '0 0 8px';
        title.style.fontSize = '14px';
        container.appendChild(title);

        const table = document.createElement('table');

        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.fontSize = '12px';

        table.innerHTML = `
            <thead>
                <tr>
                    <th style="border:1px solid #ddd;padding:4px;">入金日</th>
                    <th style="border:1px solid #ddd;padding:4px;">入金番号</th>
                    <th style="border:1px solid #ddd;padding:4px;">方法</th>
                    <th style="border:1px solid #ddd;padding:4px;text-align:right;">入金額</th>
                    <th style="border:1px solid #ddd;padding:4px;text-align:right;">手数料</th>
                    <th style="border:1px solid #ddd;padding:4px;text-align:right;">値引</th>
                    <th style="border:1px solid #ddd;padding:4px;text-align:right;">入金後残高</th>
                    <th style="border:1px solid #ddd;padding:4px;">お客様名</th>
                </tr>
            </thead>
            <tbody></tbody>`;

        const tbody = table.querySelector('tbody');

        response.records.forEach((item) => {

            const tr = document.createElement('tr');
            const status = item[F.paymentRecordStatus]?.value ?? '';

            if (status === '取消') {
                tr.style.opacity = '0.55';
            }

            tr.innerHTML = `
                <td style="border:1px solid #ddd;padding:4px;">${item[F.paymentDate]?.value ?? ''}</td>
                <td style="border:1px solid #ddd;padding:4px;">${item[F.paymentNo]?.value ?? ''}</td>
                <td style="border:1px solid #ddd;padding:4px;">${item[F.paymentMethod]?.value ?? ''}</td>
                <td style="border:1px solid #ddd;padding:4px;text-align:right;">${item[F.paymentAmount]?.value ?? ''}</td>
                <td style="border:1px solid #ddd;padding:4px;text-align:right;">${item[F.fee]?.value ?? ''}</td>
                <td style="border:1px solid #ddd;padding:4px;text-align:right;">${item[F.discountAmount]?.value ?? ''}</td>
                <td style="border:1px solid #ddd;padding:4px;text-align:right;">${item[F.displayBalanceAfter]?.value ?? ''}</td>
                <td style="border:1px solid #ddd;padding:4px;">${item[F.clientName]?.value ?? ''}</td>`;

            tbody.appendChild(tr);

        });

        if (response.records.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = '<td colspan="8" style="padding:8px;">入金履歴がありません。</td>';
            tbody.appendChild(tr);
        }

        container.appendChild(table);

        const recordGaia = document.querySelector('#record-gaia');

        if (recordGaia) {
            recordGaia.appendChild(container);
        }

    };

    const applyUrlSeedParams = async (record) => {

        const params = new URLSearchParams(window.location.search);
        const customerCode = params.get('customer_code');
        const invoiceNo = params.get('invoice_no');

        if (customerCode && !record[F.customerCode]?.value) {
            record[F.customerCode].value = customerCode;
        }

        if (!invoiceNo) {
            return;
        }

        const table = record[F.allocationTable];

        if (!table?.value?.length) {
            table.value = [];
        }

        const hasRow = table.value.some((row) => (
            String(row?.value?.[AF.invoiceNo]?.value ?? '').trim() === invoiceNo.trim()
        ));

        if (hasRow) {
            return;
        }

        const invoiceRecord = await PaymentCreateV2.fetchInvoiceRecordByNo(invoiceNo);

        if (!invoiceRecord) {
            return;
        }

        const paymentRecords = await PaymentCreateV2.fetchAllActivePaymentRecords();
        const excludeId = getRecordId(record);

        table.value.push(PaymentCreateV2.buildAllocationRowFromInvoice(
            invoiceRecord,
            paymentRecords,
            excludeId
        ));

    };

    const runCustomerRefresh = async (record, excludeId) => {

        await refreshCalculations(record, excludeId);
        await renderHistoryPanel(record[F.customerCode]?.value);

    };

    const onFetchOpenInvoicesClick = async () => {

        try {

            const record = kintone.app.record.get().record;
            const customerCode = String(record[F.customerCode]?.value ?? '').trim();

            if (!customerCode) {
                window.alert('先に取引先コードを選択してください。');
                return;
            }

            const existingRows = record[F.allocationTable]?.value ?? [];

            if (existingRows.length > 0 && !window.confirm('充当明細を未入金請求で置き換えますか？')) {
                return;
            }

            const excludeId = getRecordId(record);
            const openInvoices = await PaymentCreateV2.fetchOpenInvoicesForCustomer(customerCode, excludeId);
            const paymentRecords = await PaymentCreateV2.fetchAllActivePaymentRecords();

            record[F.allocationTable].value = openInvoices.map((invoiceRecord) => (
                PaymentCreateV2.buildAllocationRowFromInvoice(invoiceRecord, paymentRecords, excludeId)
            ));

            PaymentCreateV2.suggestAllocationAmounts(record);
            PaymentCreateV2.splitWriteoffToRows(record);
            await refreshCalculations(record, excludeId);

            applyRecordToScreen(record, { includeAllocationTable: true });

        } catch (error) {

            console.error('[payment_desktop] fetch open invoices', error);
            window.alert(`未入金請求の取得に失敗しました。\n${error.message ?? error}`);

        }

    };

    const onSuggestAllocationClick = async () => {

        try {

            const record = kintone.app.record.get().record;
            const excludeId = getRecordId(record);

            PaymentCreateV2.suggestAllocationAmounts(record);
            PaymentCreateV2.splitWriteoffToRows(record);
            await refreshCalculations(record, excludeId);

            applyRecordToScreen(record, { includeAllocationTable: true });

        } catch (error) {

            console.error('[payment_desktop] suggest allocation', error);
            window.alert(`充当案の作成に失敗しました。\n${error.message ?? error}`);

        }

    };

    const onShow = (event) => {

        hideInternalColumns(event);
        ensureHeaderButtons();

        if (event.type === 'app.record.edit.show') {
            invoiceNosBeforeEdit = PaymentCreateV2.collectInvoiceNosFromRecord(event.record);
        }

        scheduleAfterPlugins(async () => {

            ensureCustomerLookupEditable();

            try {

                const current = kintone.app.record.get().record;
                const excludeId = getRecordId(current);

                await applyUrlSeedParams(current);
                await runCustomerRefresh(current, excludeId);

                applyRecordToScreen(current, {
                    includeAllocationTable: hasAllocationRows(current),
                });

                await renderHistoryPanel(current[F.customerCode]?.value);

            } catch (error) {

                console.error('[payment_desktop] show (deferred)', error);
                window.alert(`画面の初期表示に失敗しました。\n${error.message ?? error}`);

            }

        });

        return event;

    };

    const runChangeRefresh = async (isCustomerEvent) => {

        const { record } = kintone.app.record.get();
        const excludeId = getRecordId(record);

        await refreshCalculations(record, excludeId);

        if (PaymentCreateV2.autoFillAllocationIfEmpty(record)) {
            PaymentCreateV2.splitWriteoffToRows(record);
            PaymentCreateV2.applyHeaderCalculations(record);
        }

        if (isCustomerEvent) {
            await renderHistoryPanel(record[F.customerCode]?.value);
            ensureCustomerLookupEditable();
        }

        applyRecordToScreen(record, {
            includeAllocationTable: hasAllocationRows(record),
        });

    };

    const onCustomerOrAmountChange = (event) => {

        if (isApplyingRecord) {
            return event;
        }

        const isCustomerEvent = event.type.includes(`change.${F.customerCode}`)
            || event.type.includes(`change.${F.customerName}`);

        window.setTimeout(() => {

            void runChangeRefresh(isCustomerEvent).catch((error) => {

                console.error('[payment_desktop] change', error);
                window.alert(`金額の再計算に失敗しました。\n${error.message ?? error}`);

            });

        }, 0);

        return event;

    };

    const prepareSubmit = async (event) => {

        const record = event.record;
        const excludeId = getRecordId(record);

        await PaymentCreateV2.refreshRowSnapshots(record, excludeId);
        PaymentCreateV2.autoFillAllocationIfEmpty(record);
        PaymentCreateV2.splitWriteoffToRows(record);
        PaymentCreateV2.applyHeaderCalculations(record);
        PaymentCreateV2.removeZeroAllocationRows(record);

        const errors = PaymentCreateV2.validateRecord(record);

        if (errors.length > 0) {
            event.error = errors.join('\n');
            return event;
        }

        const duplicateMessage = await PaymentCreateV2.findDuplicateWarning(record, excludeId);

        if (duplicateMessage && !window.confirm(duplicateMessage)) {
            event.error = '保存をキャンセルしました。';
            return event;
        }

        if (!String(record[F.paymentNo]?.value ?? '').trim()) {
            record[F.paymentNo].value = await PaymentCreateV2.generatePaymentNo(record[F.paymentDate]?.value);
        }

        if (!String(record[F.paymentRecordStatus]?.value ?? '').trim()) {
            record[F.paymentRecordStatus].value = '有効';
        }

        return event;

    };

    const onSubmitSuccess = async (event) => {

        try {

            const saved = await fetchPaymentRecord(event.recordId);
            const extra = event.type === 'app.record.edit.submit.success' ? invoiceNosBeforeEdit : [];

            await PaymentCreateV2.syncInvoicesForPaymentRecord(saved, extra);

        } catch (error) {

            console.error('[payment_desktop] sync failed', error);
            window.alert(`入金は保存されましたが、請求書の更新に失敗しました。\n${error.message ?? error}`);

        }

        return event;

    };

    const onDeleteSubmit = (event) => {

        invoiceNosBeforeDelete = PaymentCreateV2.collectInvoiceNosFromRecord(event.record);
        return event;

    };

    const onDeleteSuccess = async (event) => {

        try {

            const paymentRecords = await PaymentCreateV2.fetchAllActivePaymentRecords();

            for (const invoiceNo of invoiceNosBeforeDelete) {
                await PaymentCreateV2.syncInvoiceByNo(invoiceNo, paymentRecords);
            }

        } catch (error) {

            console.error('[payment_desktop] delete sync failed', error);
            window.alert(`入金は削除されましたが、請求書の再集計に失敗しました。\n${error.message ?? error}`);

        }

        invoiceNosBeforeDelete = [];
        return event;

    };

    kintone.events.on([
        'app.record.create.show',
        'app.record.edit.show',
    ], onShow);

    kintone.events.on([
        `app.record.create.change.${F.customerCode}`,
        `app.record.edit.change.${F.customerCode}`,
        `app.record.create.change.${F.customerName}`,
        `app.record.edit.change.${F.customerName}`,
        `app.record.create.change.${F.paymentAmount}`,
        `app.record.edit.change.${F.paymentAmount}`,
        `app.record.create.change.${F.fee}`,
        `app.record.edit.change.${F.fee}`,
        `app.record.create.change.${F.discountAmount}`,
        `app.record.edit.change.${F.discountAmount}`,
        `app.record.create.change.${F.allocationTable}`,
        `app.record.edit.change.${F.allocationTable}`,
    ], onCustomerOrAmountChange);

    kintone.events.on([
        'app.record.create.submit',
        'app.record.edit.submit',
    ], prepareSubmit);

    kintone.events.on([
        'app.record.create.submit.success',
        'app.record.edit.submit.success',
    ], onSubmitSuccess);

    kintone.events.on('app.record.delete.submit', onDeleteSubmit);
    kintone.events.on('app.record.delete.submit.success', onDeleteSuccess);

}());
