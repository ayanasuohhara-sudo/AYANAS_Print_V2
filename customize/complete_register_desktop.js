(function () {
    'use strict';

    const C = window.CAYANAS_INTERNAL_OPS;
    const Batch = window.CAYANAS_BarcodeBatchCore;
    const Engine = window.CAYANAS_CompleteRegisterEngine;
    const Ui = window.CAYANAS_BarcodeBatchUi;

    if (!C || !Batch || !Engine || !Ui) {
        console.error('[complete_register] 依存 JS が未読込です。');
        return;
    }

    if (kintone.app.getId() !== C.APP.completeRegister) {
        return;
    }

    const PANEL_ID = 'cayan-complete-register-panel';
    const INPUT_ID = 'cayan-complete-register-barcode';
    const TABLE_BODY_ID = 'cayan-complete-register-tbody';
    const STATUS_ID = 'cayan-complete-register-status';

    let list = Batch.createEmptyList();
    let isSubmitting = false;

    const F = C.FIELDS.order;

    const kintoneApi = (path, method, body) => new Promise((resolve, reject) => {
        kintone.api(path, method, body, resolve, reject);
    });

    const escapeQueryValue = (value) => String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

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

        if (countEl) {
            countEl.textContent = String(list.items.length);
        }

        if (!tbody) {
            return;
        }

        if (list.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9">（未読取）</td></tr>';
            return;
        }

        tbody.innerHTML = list.items.map((item) => (
            '<tr>'
            + '<td>' + Ui.escapeHtml(item.manageNo) + '</td>'
            + '<td>' + Ui.escapeHtml(item.customerName) + '</td>'
            + '<td>' + Ui.escapeHtml(item.clientName) + '</td>'
            + '<td>' + Ui.escapeHtml(item.kimonoType) + '</td>'
            + '<td>' + Ui.escapeHtml(item.locationStatus) + '</td>'
            + '<td>' + Ui.escapeHtml(item.processStatus) + '</td>'
            + '<td>' + Ui.escapeHtml(item.workStatus) + '</td>'
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
            setStatus('読取: ' + Ui.escapeHtml(manageNo), false);
        }

        renderTable();

        const input = document.getElementById(INPUT_ID);

        if (input) {
            input.value = '';
            input.focus();
        }

    };

    const onBulkSubmit = async () => {

        if (isSubmitting || list.items.length === 0) {
            return;
        }

        if (!window.confirm(list.items.length + ' 件を完了登録します。\n'
            + 'process=完了 / work=仕上げ完了 / delivery=納品待ち\nlocation は変更しません。')) {
            return;
        }

        isSubmitting = true;
        const putRecord = Engine.buildCompletePutRecord();

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

                const beforeLoc = getField(fresh, F.locationStatus);

                await kintoneApi(
                    kintone.api.url('/k/v1/record.json', true),
                    'PUT',
                    {
                        app: C.APP.order,
                        id: fresh.$id.value,
                        record: putRecord,
                    }
                );

                const after = await fetchOrder(item.manageNo);

                if (after && getField(after, F.locationStatus) !== beforeLoc) {
                    item.errorMessage = '警告: location が変化しました';
                }

                okCount += 1;

            } catch (error) {
                item.errorMessage = error.message || String(error);
                failCount += 1;
                remain.push(item);
            }

        }

        list.items = remain;
        renderTable();
        isSubmitting = false;

        setStatus(
            '<strong>完了登録</strong> 成功: ' + okCount + ' / 残: ' + failCount,
            failCount > 0
        );

    };

    const mount = () => {

        const space = kintone.app.record.getSpaceElement(C.SPACE.completeRegister)
            || kintone.app.record.getSpaceElement(C.SPACE.messageFallback);

        if (!space || document.getElementById(PANEL_ID)) {
            return;
        }

        Ui.injectStyles('cayan-batch-ui-style', Ui.BATCH_TABLE_CSS);

        space.innerHTML = (
            '<div id="' + PANEL_ID + '" class="cayan-batch-panel">'
            + '<h2 class="cayan-batch-title">完了登録</h2>'
            + '<p class="cayan-batch-hint">最終検品・仕上げ完了。バーコード連続読取→一括登録。</p>'
            + '<label class="cayan-batch-label" for="' + INPUT_ID + '">管理番号</label>'
            + '<input type="text" id="' + INPUT_ID + '" class="cayan-batch-input" autocomplete="off">'
            + '<p class="cayan-batch-meta">読取件数: <span id="' + PANEL_ID + '-count">0</span> 件</p>'
            + '<table class="cayan-batch-table"><thead><tr>'
            + '<th>管理番号</th><th>顧客名</th><th>お客様名</th><th>着物種類</th>'
            + '<th>現在地</th><th>工程</th><th>作業</th><th>結果</th><th></th>'
            + '</tr></thead><tbody id="' + TABLE_BODY_ID + '"></tbody></table>'
            + '<button type="button" id="' + PANEL_ID + '-submit" class="cayan-batch-btn cayan-batch-btn--primary">一括完了登録</button>'
            + '<div id="' + STATUS_ID + '" class="cayan-batch-status"></div>'
            + '</div>'
        );

        document.getElementById(INPUT_ID).addEventListener('keydown', (event) => {

            if (event.key === 'Enter' || event.key === 'NumpadEnter') {
                event.preventDefault();
                onScan(event.target.value);
            }

        });

        document.getElementById(PANEL_ID + '-submit').addEventListener('click', () => onBulkSubmit());

        renderTable();

        window.setTimeout(() => document.getElementById(INPUT_ID)?.focus(), 200);

    };

    kintone.events.on(['app.record.create.show', 'app.record.edit.show'], (event) => {

        [300, 900].forEach((ms) => window.setTimeout(mount, ms));

        return event;

    });

}());
