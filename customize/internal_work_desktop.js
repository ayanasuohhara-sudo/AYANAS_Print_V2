(function () {
    'use strict';

    const C = window.CAYANAS_INTERNAL_OPS;
    const Batch = window.CAYANAS_BarcodeBatchCore;
    const Engine = window.CAYANAS_InternalWorkEngine;
    const Ui = window.CAYANAS_BarcodeBatchUi;

    if (!C || !Batch || !Engine || !Ui) {
        console.error('[internal_work] 依存 JS が未読込です。');
        return;
    }

    if (kintone.app.getId() !== C.APP.internalWork) {
        return;
    }

    const PANEL_ID = 'cayan-internal-work-panel';
    const INPUT_ID = 'cayan-internal-work-barcode';
    const WORK_SELECT_ID = 'cayan-internal-work-status';
    const TABLE_BODY_ID = 'cayan-internal-work-tbody';
    const STATUS_ID = 'cayan-internal-work-msg';

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

    const selectedWork = () => document.getElementById(WORK_SELECT_ID)?.value ?? '';

    const renderTable = () => {

        const tbody = document.getElementById(TABLE_BODY_ID);
        const countEl = document.getElementById(PANEL_ID + '-count');
        const targetWork = selectedWork();

        if (countEl) {
            countEl.textContent = String(list.items.length);
        }

        if (!tbody) {
            return;
        }

        if (list.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10">（未読取）</td></tr>';
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
            + '<td>' + Ui.escapeHtml(targetWork) + '</td>'
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
        const work = selectedWork();

        if (!work) {
            setStatus('先に作業ステータスを選択してください。', true);
            return;
        }

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

        const work = selectedWork();

        if (!work || !Engine.isAllowedWorkSelection(work)) {
            setStatus('作業ステータスを選択してください。', true);
            return;
        }

        if (isSubmitting || list.items.length === 0) {
            return;
        }

        if (!window.confirm('作業ステータス: ' + work + '\n' + list.items.length + ' 件を一括登録します。')) {
            return;
        }

        isSubmitting = true;

        let okCount = 0;
        let failCount = 0;
        const remain = [];
        const putRecord = Engine.buildWorkPutRecord(work);

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

                await kintoneApi(
                    kintone.api.url('/k/v1/record.json', true),
                    'PUT',
                    {
                        app: C.APP.order,
                        id: fresh.$id.value,
                        record: putRecord,
                    }
                );

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
            '<strong>一括登録完了</strong><br>成功: ' + okCount + ' / 残: ' + failCount,
            failCount > 0
        );

    };

    const mount = () => {

        const space = kintone.app.record.getSpaceElement(C.SPACE.internalWork)
            || kintone.app.record.getSpaceElement(C.SPACE.messageFallback);

        if (!space || document.getElementById(PANEL_ID)) {
            return;
        }

        Ui.injectStyles('cayan-batch-ui-style', Ui.BATCH_TABLE_CSS);

        const workOptions = C.WORK_SELECT_OPTIONS.map((label) => (
            '<option value="' + Ui.escapeHtml(label) + '">' + Ui.escapeHtml(label) + '</option>'
        )).join('');

        space.innerHTML = (
            '<div id="' + PANEL_ID + '" class="cayan-batch-panel">'
            + '<h2 class="cayan-batch-title">社内作業ステータス管理</h2>'
            + '<p class="cayan-batch-hint">工場・店舗の作業を手動選択し、バーコード連続読取→一括登録。location / process / delivery は変更しません。</p>'
            + '<label class="cayan-batch-label" for="' + WORK_SELECT_ID + '">作業ステータス（先に選択）</label>'
            + '<select id="' + WORK_SELECT_ID + '" class="cayan-batch-select">'
            + '<option value="">— 選択 —</option>' + workOptions
            + '</select>'
            + '<label class="cayan-batch-label" for="' + INPUT_ID + '">管理番号（連続読取）</label>'
            + '<input type="text" id="' + INPUT_ID + '" class="cayan-batch-input" autocomplete="off">'
            + '<p class="cayan-batch-meta">読取件数: <span id="' + PANEL_ID + '-count">0</span> 件</p>'
            + '<table class="cayan-batch-table"><thead><tr>'
            + '<th>管理番号</th><th>顧客名</th><th>お客様名</th><th>着物種類</th>'
            + '<th>現在地</th><th>工程</th><th>現在作業</th><th>変更後</th><th>結果</th><th></th>'
            + '</tr></thead><tbody id="' + TABLE_BODY_ID + '"></tbody></table>'
            + '<button type="button" id="' + PANEL_ID + '-submit" class="cayan-batch-btn cayan-batch-btn--primary">一括登録</button>'
            + '<div id="' + STATUS_ID + '" class="cayan-batch-status"></div>'
            + '</div>'
        );

        document.getElementById(WORK_SELECT_ID).addEventListener('change', () => renderTable());

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
