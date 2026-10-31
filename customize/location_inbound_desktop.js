(function () {
    'use strict';

    const C = window.CAYANAS_INTERNAL_OPS;
    const Batch = window.CAYANAS_BarcodeBatchCore;
    const Engine = window.CAYANAS_LocationInboundEngine;
    const Ui = window.CAYANAS_BarcodeBatchUi;

    if (!C || !Batch || !Engine || !Ui) {
        console.error('[location_inbound] internal_ops_config / barcode_batch_core / location_inbound_engine / barcode_batch_ui を読み込んでください。');
        return;
    }

    if (kintone.app.getId() !== C.APP.locationInbound) {
        return;
    }

    const PANEL_ID = 'cayan-location-inbound-panel';
    const INPUT_ID = 'cayan-location-inbound-barcode';
    const DEST_ID = 'cayan-location-inbound-dest';
    const TABLE_BODY_ID = 'cayan-location-inbound-tbody';
    const STATUS_ID = 'cayan-location-inbound-status';

    let list = Batch.createEmptyList();
    let isSubmitting = false;
    let isScanning = false;
    let scanDebounceTimer = null;
    const SCAN_IDLE_MS = 400;

    const F = C.FIELDS.order;

    const kintoneApi = (path, method, body) => new Promise((resolve, reject) => {
        kintone.api(path, method, body, resolve, reject);
    });

    const escapeQueryValue = (value) => String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

    const formatError = (error) => {

        if (!error) {
            return '不明なエラー';
        }

        if (typeof error === 'string') {
            return error;
        }

        const message = error.message || error.errorCode || error.code;

        if (message) {
            return String(message);
        }

        try {
            return JSON.stringify(error);
        } catch (err) {
            return String(error);
        }

    };

    const isEnterKey = (event) => (
        event.key === 'Enter'
        || event.key === 'NumpadEnter'
        || event.keyCode === 13
        || event.which === 13
    );

    const clearAndFocusInput = () => {

        const input = document.getElementById(INPUT_ID);

        if (!input) {
            return;
        }

        input.value = '';
        window.setTimeout(() => {
            input.focus();
            if (typeof input.select === 'function') {
                input.select();
            }
        }, 0);

    };

    const fetchOrder = async (manageNo) => {

        const resp = await kintoneApi(
            kintone.api.url('/k/v1/records.json', true),
            'GET',
            {
                app: C.APP.order,
                query: F.manageNo + ' = "' + escapeQueryValue(manageNo) + '" limit 1',
                fields: [
                    '$id',
                    F.manageNo,
                    F.customerName,
                    F.clientName,
                    F.kimonoType,
                    F.locationStatus,
                    F.processStatus,
                    F.workStatus,
                    F.deliveryStatus,
                ],
            }
        );

        return resp.records?.[0] ?? null;

    };

    const getField = (record, code) => String(record?.[code]?.value ?? '').trim();

    const setStatus = (html, isError) => {

        const el = document.getElementById(STATUS_ID);

        if (el) {
            el.innerHTML = html;
            el.style.color = isError ? '#b00020' : '#0d6b0d';
        }

    };

    const renderTable = () => {

        const tbody = document.getElementById(TABLE_BODY_ID);
        const countEl = document.getElementById(PANEL_ID + '-count');

        if (!tbody) {
            return;
        }

        if (countEl) {
            countEl.textContent = String(list.items.length);
        }

        if (list.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10">（未読取）</td></tr>';
            return;
        }

        tbody.innerHTML = list.items.map((item) => (
            '<tr data-row-id="' + Ui.escapeHtml(item.rowId) + '">'
            + '<td>' + Ui.escapeHtml(item.manageNo) + '</td>'
            + '<td>' + Ui.escapeHtml(item.customerName) + '</td>'
            + '<td>' + Ui.escapeHtml(item.clientName) + '</td>'
            + '<td>' + Ui.escapeHtml(item.kimonoType) + '</td>'
            + '<td>' + Ui.escapeHtml(item.locationStatus) + '</td>'
            + '<td>' + Ui.escapeHtml(item.processStatus) + '</td>'
            + '<td>' + Ui.escapeHtml(item.workStatus) + '</td>'
            + '<td>' + Ui.escapeHtml(item.deliveryStatus) + '</td>'
            + '<td class="cayan-batch-err">' + Ui.escapeHtml(item.errorMessage) + '</td>'
            + '<td><button type="button" class="cayan-batch-btn cayan-batch-btn--danger cayan-batch-row-remove" data-row-id="'
            + Ui.escapeHtml(item.rowId) + '">削除</button></td>'
            + '</tr>'
        )).join('');

        tbody.querySelectorAll('.cayan-batch-row-remove').forEach((btn) => {
            btn.addEventListener('click', () => {
                Batch.removeByRowId(list, btn.getAttribute('data-row-id'));
                renderTable();
            });
        });

    };

    const onScan = async (raw) => {

        const manageNo = Batch.norm(raw);

        if (manageNo.length < C.MANAGE_NO_MIN_LENGTH) {
            return;
        }

        if (isScanning || isSubmitting) {
            return;
        }

        const dest = document.getElementById(DEST_ID)?.value;

        if (!dest) {
            setStatus('先に「入庫先」を選択してから、もう一度スキャン（または Enter）してください。', true);
            /* 番号は残し、入庫先選択後に再確定できるようにする */
            document.getElementById(INPUT_ID)?.focus();
            return;
        }

        isScanning = true;

        try {
            const order = await fetchOrder(manageNo);

            if (!order) {
                setStatus('App16 に見つかりません: ' + Ui.escapeHtml(manageNo), true);
                return;
            }

            const row = {
                recordId: order.$id.value,
                manageNo: getField(order, F.manageNo),
                customerName: getField(order, F.customerName),
                clientName: getField(order, F.clientName),
                kimonoType: getField(order, F.kimonoType),
                locationStatus: getField(order, F.locationStatus),
                processStatus: getField(order, F.processStatus),
                workStatus: getField(order, F.workStatus),
                deliveryStatus: getField(order, F.deliveryStatus),
            };

            const addResult = Batch.addOrRejectDuplicate(list, row);

            if (!addResult.ok) {
                setStatus(Ui.escapeHtml(addResult.reason), true);
            } else {
                setStatus('読取: ' + Ui.escapeHtml(row.manageNo || manageNo)
                    + '（' + list.items.length + '件）→ 続けてスキャン可。確定は「一括入庫」', false);
            }

            renderTable();
        } catch (error) {
            console.error('[location_inbound] onScan', error);
            setStatus('読取エラー: ' + Ui.escapeHtml(formatError(error)), true);
        } finally {
            isScanning = false;
            clearAndFocusInput();
        }

    };

    const queueScanFromInput = () => {

        if (scanDebounceTimer) {
            window.clearTimeout(scanDebounceTimer);
        }

        scanDebounceTimer = window.setTimeout(() => {
            scanDebounceTimer = null;
            const input = document.getElementById(INPUT_ID);
            const value = Batch.norm(input?.value);

            if (value.length < C.MANAGE_NO_MIN_LENGTH) {
                return;
            }

            onScan(value);
        }, SCAN_IDLE_MS);

    };

    const onBulkSubmit = async () => {

        if (isSubmitting || list.items.length === 0) {
            return;
        }

        const dest = document.getElementById(DEST_ID)?.value;

        if (!dest) {
            setStatus('入庫先を選択してください。', true);
            return;
        }

        if (!window.confirm('入庫先: ' + dest + '\n' + list.items.length + ' 件を一括入庫します。よろしいですか？')) {
            return;
        }

        isSubmitting = true;
        setStatus('登録中…', false);

        let okCount = 0;
        let failCount = 0;
        const remain = [];

        for (const item of list.items) {
            item.errorMessage = '';

            try {
                const fresh = await fetchOrder(item.manageNo);

                if (!fresh) {
                    item.errorMessage = '再取得失敗';
                    failCount += 1;
                    remain.push(item);
                    continue;
                }

                const snapshot = {
                    locationStatus: getField(fresh, F.locationStatus),
                    processStatus: getField(fresh, F.processStatus),
                    workStatus: getField(fresh, F.workStatus),
                    deliveryStatus: getField(fresh, F.deliveryStatus),
                };

                const plan = Engine.buildInboundPutRecord(dest, snapshot);

                if (plan.skipReason === 'same_location') {
                    item.errorMessage = '同一場所のためスキップ';
                    failCount += 1;
                    remain.push(item);
                    continue;
                }

                if (!plan.record) {
                    failCount += 1;
                    remain.push(item);
                    continue;
                }

                await kintoneApi(
                    kintone.api.url('/k/v1/record.json', true),
                    'PUT',
                    {
                        app: C.APP.order,
                        id: fresh.$id.value,
                        record: plan.record,
                    }
                );

                okCount += 1;

            } catch (error) {
                item.errorMessage = formatError(error);
                failCount += 1;
                remain.push(item);
            }

        }

        list.items = remain;
        renderTable();
        isSubmitting = false;

        setStatus(
            '<strong>一括入庫完了</strong><br>成功: ' + okCount + ' 件 / 失敗・残: ' + failCount + ' 件',
            failCount > 0
        );

    };

    const mount = () => {

        const space = kintone.app.record.getSpaceElement(C.SPACE.locationInbound)
            || kintone.app.record.getSpaceElement(C.SPACE.messageFallback);

        if (!space || document.getElementById(PANEL_ID)) {
            return;
        }

        Ui.injectStyles('cayan-batch-ui-style', Ui.BATCH_TABLE_CSS);

        space.innerHTML = (
            '<div id="' + PANEL_ID + '" class="cayan-batch-panel">'
            + '<h2 class="cayan-batch-title">社内移動・到着入庫</h2>'
            + '<p class="cayan-batch-hint">①入庫先を選択 → ②管理番号を連続スキャン → ③「一括入庫」で App16 を更新。'
            + '（kintone の「保存」では受注は更新されません）</p>'
            + '<label class="cayan-batch-label" for="' + DEST_ID + '">入庫先（必須）</label>'
            + '<select id="' + DEST_ID + '" class="cayan-batch-select">'
            + '<option value="">— 選択 —</option>'
            + '<option value="' + C.LOCATION.hq + '">' + C.LOCATION.hq + '</option>'
            + '<option value="' + C.LOCATION.factory + '">' + C.LOCATION.factory + '</option>'
            + '<option value="' + C.LOCATION.store + '">' + C.LOCATION.store + '</option>'
            + '</select>'
            + '<label class="cayan-batch-label" for="' + INPUT_ID + '">管理番号（連続読取）</label>'
            + '<input type="text" id="' + INPUT_ID + '" class="cayan-batch-input" autocomplete="off" inputmode="none">'
            + '<p class="cayan-batch-meta">読取件数: <span id="' + PANEL_ID + '-count">0</span> 件</p>'
            + '<table class="cayan-batch-table"><thead><tr>'
            + '<th>管理番号</th><th>顧客名</th><th>お客様名</th><th>着物種類</th>'
            + '<th>現在地</th><th>工程</th><th>作業</th><th>納品</th><th>結果</th><th></th>'
            + '</tr></thead><tbody id="' + TABLE_BODY_ID + '"></tbody></table>'
            + '<button type="button" id="' + PANEL_ID + '-submit" class="cayan-batch-btn cayan-batch-btn--primary">一括入庫</button>'
            + '<div id="' + STATUS_ID + '" class="cayan-batch-status"></div>'
            + '</div>'
        );

        const barcodeInput = document.getElementById(INPUT_ID);

        barcodeInput.addEventListener('keydown', (event) => {

            if (!isEnterKey(event)) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            if (scanDebounceTimer) {
                window.clearTimeout(scanDebounceTimer);
                scanDebounceTimer = null;
            }

            onScan(event.target.value);

        });

        /* Enter を送らないスキャナ向け: 入力が止まったら確定 */
        barcodeInput.addEventListener('input', () => {
            queueScanFromInput();
        });

        document.getElementById(DEST_ID).addEventListener('change', () => {

            const pending = Batch.norm(document.getElementById(INPUT_ID)?.value);

            if (pending.length >= C.MANAGE_NO_MIN_LENGTH) {
                onScan(pending);
            } else {
                document.getElementById(INPUT_ID)?.focus();
            }

        });

        document.getElementById(PANEL_ID + '-submit').addEventListener('click', () => {
            onBulkSubmit();
        });

        renderTable();
        clearAndFocusInput();

    };

    /**
     * フォームに旧 barcode_input が残っている場合のフォールバック。
     * スキャナがネイティブ項目に入っても一覧へ流す。
     */
    const onNativeBarcodeChange = (event) => {

        const field = event.record && event.record.barcode_input;

        if (!field) {
            return event;
        }

        const raw = Batch.norm(field.value);

        if (raw.length >= C.MANAGE_NO_MIN_LENGTH) {
            field.value = '';
            onScan(raw);
        }

        return event;

    };

    kintone.events.on(['app.record.create.show', 'app.record.edit.show'], (event) => {

        [300, 900].forEach((ms) => window.setTimeout(mount, ms));

        return event;

    });

    kintone.events.on([
        'app.record.create.change.barcode_input',
        'app.record.edit.change.barcode_input',
    ], onNativeBarcodeChange);

}());
