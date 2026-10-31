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
    const MODE_ID = 'cayan-complete-register-mode';
    const LOC_ID = 'cayan-complete-register-location';
    const SUMMARY_ID = 'cayan-complete-register-summary';
    const SUBMIT_ID = 'cayan-complete-register-submit';
    const TABLE_BODY_ID = 'cayan-complete-register-tbody';
    const STATUS_ID = 'cayan-complete-register-status';

    const MODE = Engine.BULK_MODE;

    const MODE_LABELS = {
        [MODE.complete]: '完了登録のみ',
        [MODE.completeWithLocation]: '完了登録＋保管場所変更',
        [MODE.locationOnly]: '保管場所変更のみ',
    };

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
                fields: Engine.orderFetchFields(),
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

    const getSelectedMode = () => (
        document.getElementById(MODE_ID)?.value || MODE.complete
    );

    const getSelectedLocation = () => (
        document.getElementById(LOC_ID)?.value || ''
    );

    const locationLabel = (value) => {
        const loc = String(value || '').trim();
        return loc || '変更しない';
    };

    const updateSummary = () => {

        const el = document.getElementById(SUMMARY_ID);

        if (!el) {
            return;
        }

        const mode = getSelectedMode();
        const loc = getSelectedLocation();
        const modeText = MODE_LABELS[mode] || mode;
        const locText = mode === MODE.complete ? '変更しない' : locationLabel(loc);

        el.textContent = '現在: ' + modeText + ' / 保管場所: ' + locText;

    };

    const setSubmitEnabled = (enabled) => {

        const btn = document.getElementById(SUBMIT_ID);

        if (btn) {
            btn.disabled = !enabled;
        }

    };

    const formatError = (error) => {

        if (!error) {
            return '不明なエラー';
        }

        if (typeof error === 'string') {
            return error;
        }

        return error.message || error.errorCode || error.code || String(error);

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

    const buildConfirmMessage = (mode, location, count) => {

        const modeText = MODE_LABELS[mode] || mode;
        const lines = [
            count + ' 件を一括更新します。',
            '処理内容: ' + modeText,
        ];

        if (mode === MODE.complete) {
            lines.push('process=完了 / work=仕上げ完了 / delivery=納品待ち / 完了日=当日');
            lines.push('location は変更しません。すでに完了の商品はスキップします。');
        } else if (mode === MODE.completeWithLocation) {
            lines.push('process=完了 / work=仕上げ完了 / delivery=納品待ち / 完了日=当日');
            lines.push('location=' + location);
            lines.push('すでに完了の商品は保管場所のみ更新します（同一ならスキップ）。');
        } else {
            lines.push('location=' + location + ' のみ更新（工程・作業・納品は変更しません）');
        }

        lines.push('納品済の商品は更新しません。');

        return lines.join('\n');

    };

    const onBulkSubmit = async () => {

        if (isSubmitting || list.items.length === 0) {
            return;
        }

        const mode = getSelectedMode();
        const location = getSelectedLocation();
        const validation = Engine.validateBulkSelection(mode, location);

        if (!validation.ok) {
            setStatus(Ui.escapeHtml(validation.reason), true);
            return;
        }

        if (!window.confirm(buildConfirmMessage(mode, location, list.items.length))) {
            return;
        }

        isSubmitting = true;
        setSubmitEnabled(false);

        let okCount = 0;
        let skipCount = 0;
        let failCount = 0;
        const remain = [];

        try {
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

                    const snapshot = Engine.toOrderSnapshot(fresh);
                    const plan = Engine.planBulkItemAction({
                        mode,
                        location,
                        snapshot,
                    });

                    if (plan.action === 'skip') {
                        skipCount += 1;
                        continue;
                    }

                    if (plan.action === 'fail') {
                        item.errorMessage = plan.reason || '更新不可';
                        failCount += 1;
                        remain.push(item);
                        continue;
                    }

                    /* PUT直前に再取得し、並行更新（納品済化など）を再判定 */
                    const prePut = await fetchOrder(item.manageNo);

                    if (!prePut) {
                        item.errorMessage = 'PUT直前の再取得失敗';
                        failCount += 1;
                        remain.push(item);
                        continue;
                    }

                    const prePlan = Engine.planBulkItemAction({
                        mode,
                        location,
                        snapshot: Engine.toOrderSnapshot(prePut),
                    });

                    if (prePlan.action === 'skip') {
                        skipCount += 1;
                        continue;
                    }

                    if (prePlan.action === 'fail') {
                        item.errorMessage = prePlan.reason || '更新不可';
                        failCount += 1;
                        remain.push(item);
                        continue;
                    }

                    const putRecord = prePlan.putRecord;

                    await kintoneApi(
                        kintone.api.url('/k/v1/record.json', true),
                        'PUT',
                        {
                            app: C.APP.order,
                            id: prePut.$id.value,
                            record: putRecord,
                        }
                    );

                    const after = await fetchOrder(item.manageNo);

                    if (!Engine.isPutApplied(after, putRecord)) {
                        item.errorMessage = '更新内容を確認できません';
                        failCount += 1;
                        remain.push(item);
                        continue;
                    }

                    okCount += 1;

                } catch (error) {
                    item.errorMessage = formatError(error);
                    failCount += 1;
                    remain.push(item);
                }

            }
        } finally {
            list.items = remain;
            renderTable();
            isSubmitting = false;
            setSubmitEnabled(true);
        }

        const modeText = MODE_LABELS[mode] || mode;

        setStatus(
            '<strong>' + Ui.escapeHtml(modeText) + '</strong> 成功: ' + okCount
            + ' / スキップ: ' + skipCount
            + ' / 残: ' + failCount,
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
            + '<p class="cayan-batch-hint">最終検品・仕上げ完了。バーコード連続読取→一括更新。'
            + '初期は「完了登録のみ」。保管場所は必要なときだけ変更します。</p>'
            + '<label class="cayan-batch-label" for="' + MODE_ID + '">処理内容</label>'
            + '<select id="' + MODE_ID + '" class="cayan-batch-select">'
            + '<option value="' + MODE.complete + '" selected>完了登録のみ</option>'
            + '<option value="' + MODE.completeWithLocation + '">完了登録＋保管場所変更</option>'
            + '<option value="' + MODE.locationOnly + '">保管場所変更のみ</option>'
            + '</select>'
            + '<label class="cayan-batch-label" for="' + LOC_ID + '">保管場所</label>'
            + '<select id="' + LOC_ID + '" class="cayan-batch-select">'
            + '<option value="" selected>変更しない</option>'
            + '<option value="' + C.LOCATION.factory + '">' + C.LOCATION.factory + '</option>'
            + '<option value="' + C.LOCATION.hq + '">' + C.LOCATION.hq + '</option>'
            + '<option value="' + C.LOCATION.store + '">' + C.LOCATION.store + '</option>'
            + '</select>'
            + '<label class="cayan-batch-label" for="' + INPUT_ID + '">管理番号</label>'
            + '<input type="text" id="' + INPUT_ID + '" class="cayan-batch-input" autocomplete="off">'
            + '<p class="cayan-batch-meta">読取件数: <span id="' + PANEL_ID + '-count">0</span> 件</p>'
            + '<table class="cayan-batch-table"><thead><tr>'
            + '<th>管理番号</th><th>顧客名</th><th>お客様名</th><th>着物種類</th>'
            + '<th>現在地</th><th>工程</th><th>作業</th><th>結果</th><th></th>'
            + '</tr></thead><tbody id="' + TABLE_BODY_ID + '"></tbody></table>'
            + '<p id="' + SUMMARY_ID + '" class="cayan-batch-meta"></p>'
            + '<button type="button" id="' + SUBMIT_ID + '" class="cayan-batch-btn cayan-batch-btn--primary">一括更新</button>'
            + '<div id="' + STATUS_ID + '" class="cayan-batch-status"></div>'
            + '</div>'
        );

        document.getElementById(INPUT_ID).addEventListener('keydown', (event) => {

            if (event.key === 'Enter' || event.key === 'NumpadEnter') {
                event.preventDefault();
                onScan(event.target.value);
            }

        });

        document.getElementById(MODE_ID).addEventListener('change', () => {
            updateSummary();
        });

        document.getElementById(LOC_ID).addEventListener('change', () => {
            updateSummary();
        });

        document.getElementById(SUBMIT_ID).addEventListener('click', () => onBulkSubmit());

        updateSummary();
        renderTable();

        window.setTimeout(() => document.getElementById(INPUT_ID)?.focus(), 200);

    };

    kintone.events.on(['app.record.create.show', 'app.record.edit.show'], (event) => {

        [300, 900].forEach((ms) => window.setTimeout(mount, ms));

        return event;

    });

}());
