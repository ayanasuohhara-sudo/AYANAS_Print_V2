(function () {
    'use strict';

    /**
     * 店舗しみ抜き作業 V1 — App85 UI
     * 読込: order_line_classifier.js → store_work_config.js → store_work_engine.js → 本ファイル
     */

    const C = window.CAYANAS_STORE_WORK;
    const Cls = window.CAYANAS_OrderLineClassifier;
    const StoreEngine = window.CAYANAS_StoreWorkEngine;

    if (!C || !Cls || !StoreEngine) {
        console.error('[store_work] order_line_classifier / store_work_config / store_work_engine を先に読み込んでください。');
        return;
    }

    if (!C.STORE_WORK_APP_ID || kintone.app.getId() !== C.STORE_WORK_APP_ID) {
        return;
    }

    const PANEL_ID = 'cayan-store-work-panel';
    const INPUT_ID = 'cayan-store-work-manage-no';
    const MANAGE_NO_MIN = C.MANAGE_NO_MIN_LENGTH || 6;

    let productLookup = null;
    let productLookupPromise = null;
    let pendingWork = null;
    let isSubmitting = false;

    const F = () => C.FIELDS;

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const escapeQueryValue = (value) => String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

    const kintoneApi = (path, method, body) => new Promise((resolve, reject) => {
        kintone.api(path, method, body, resolve, reject);
    });

    const fetchAllProductRecords = async () => {

        const pf = F().product;
        const records = [];
        let offset = 0;
        const limit = 500;

        for (;;) {
            const resp = await kintoneApi(
                kintone.api.url('/k/v1/records.json', true),
                'GET',
                {
                    app: C.PRODUCT_APP_ID,
                    query: 'order by $id asc limit ' + limit + ' offset ' + offset,
                    fields: [pf.itemCode, pf.itemName, pf.subcategory],
                }
            );

            records.push(...(resp.records || []));
            offset += limit;

            if (!resp.records || resp.records.length < limit) {
                break;
            }
        }

        return records;

    };

    const ensureProductLookup = () => {

        if (productLookup) {
            return Promise.resolve(productLookup);
        }

        if (!productLookupPromise) {
            productLookupPromise = fetchAllProductRecords()
                .then((records) => {
                    productLookup = Cls.buildProductLookup(records, F().product);
                    return productLookup;
                })
                .catch((error) => {
                    productLookupPromise = null;
                    throw error;
                });
        }

        return productLookupPromise;

    };

    const fetchOrderByManageNo = async (manageNo) => {

        const of = F().order;
        const code = escapeQueryValue(manageNo);

        const resp = await kintoneApi(
            kintone.api.url('/k/v1/records.json', true),
            'GET',
            {
                app: C.ORDER_APP_ID,
                query: of.manageNo + ' = "' + code + '" limit 1',
                fields: [
                    '$id',
                    of.manageNo,
                    of.customerName,
                    of.clientName,
                    of.kimonoType,
                    of.locationStatus,
                    of.workStatus,
                    of.detailTable,
                ],
            }
        );

        return resp.records?.[0] ?? null;

    };

    const getMountSpace = () => (
        kintone.app.record.getSpaceElement(C.WORK_SPACE_ID)
        || kintone.app.record.getSpaceElement(C.MESSAGE_SPACE_ID)
    );

    const setStatusMessage = (html, isError) => {

        const el = document.getElementById(PANEL_ID + '-status');

        if (!el) {
            return;
        }

        el.innerHTML = html;
        el.style.color = isError ? '#b00020' : '#0d6b0d';

    };

    const syncActionButtons = (enabledAction) => {

        const map = {
            shimiStart: StoreEngine.ACTION.shimiStart,
            shimiComplete: StoreEngine.ACTION.shimiCompleteToFactory,
        };

        Object.keys(map).forEach((key) => {
            const btn = document.getElementById(PANEL_ID + '-btn-' + key);

            if (btn) {
                btn.disabled = map[key] !== enabledAction || isSubmitting;
            }
        });

    };

    const renderWorkView = (view) => {

        const previewEl = document.getElementById(PANEL_ID + '-preview');
        const noticeEl = document.getElementById(PANEL_ID + '-notice');

        if (!previewEl) {
            return;
        }

        if (!view) {
            previewEl.innerHTML = '<p class="cayan-sw-muted">管理番号を読み取ると、ここに商品情報が表示されます。</p>';

            if (noticeEl) {
                noticeEl.textContent = '';
            }

            syncActionButtons(null);
            pendingWork = null;
            return;
        }

        const maruLabel = view.hasMaruarai ? 'あり' : 'なし';
        const shimiLabel = view.hasShiminuki ? 'あり' : 'なし';

        previewEl.innerHTML = (
            '<div class="cayan-sw-preview">'
            + '<p><strong>管理番号:</strong> ' + escapeHtml(view.manageNo) + '</p>'
            + '<p><strong>顧客名:</strong> ' + escapeHtml(view.customerName) + '</p>'
            + '<p><strong>お客様名:</strong> ' + escapeHtml(view.clientName) + '</p>'
            + '<p><strong>着物種類:</strong> ' + escapeHtml(view.kimonoType) + '</p>'
            + '<p><strong>現在地:</strong> ' + escapeHtml(view.locationStatus) + '</p>'
            + '<p><strong>現在の作業ステータス:</strong> ' + escapeHtml(view.workStatus) + '</p>'
            + '<p><strong>App13判定（参考）:</strong> 丸洗い: ' + maruLabel + ' / しみ抜き: ' + shimiLabel + '</p>'
            + '<p><strong>加工内容</strong></p>'
            + StoreEngine.formatDetailLinesHtml(view.lineSummaries)
            + '</div>'
        );

        if (noticeEl) {
            noticeEl.textContent = view.noticeMessage || '';
            noticeEl.className = view.noticeIsError
                ? 'cayan-sw-notice cayan-sw-notice--error'
                : 'cayan-sw-notice';
        }

        syncActionButtons(view.enabledAction);

        if (view.enabledAction) {
            pendingWork = {
                recordId: view.recordId,
                manageNo: view.manageNo,
                locationStatus: view.locationStatus,
                workStatus: view.workStatus,
                enabledAction: view.enabledAction,
            };
        } else {
            pendingWork = null;
        }

    };

    const buildViewFromOrder = async (manageNo) => {

        const lookup = await ensureProductLookup();
        const order = await fetchOrderByManageNo(manageNo);

        if (!order) {
            return {
                reject: true,
                message: '管理番号が App16（受注明細）に見つかりません。\n' + manageNo,
            };
        }

        const of = F().order;
        const locationStatus = String(Cls.getFieldValue(order, of.locationStatus)).trim();
        const workStatus = String(Cls.getFieldValue(order, of.workStatus)).trim();

        const lineAnalysis = Cls.analyzeDetailTable(order, lookup, {
            detailTableField: of.detailTable,
            itemCodeField: of.itemCode,
            itemNameField: of.itemName,
            qtyField: of.qty,
            maruaraiSubcategory: C.MARUARAI_SUBCATEGORY,
            shiminukiSubcategory: C.SHIMINUKI_SUBCATEGORY,
        });

        const recordId = order.$id?.value;

        if (recordId === null || recordId === undefined || recordId === '') {
            return {
                reject: true,
                message: '受注レコード ID を取得できません。',
            };
        }

        const ui = StoreEngine.resolveWorkUiState(locationStatus, workStatus);

        return {
            reject: false,
            recordId,
            manageNo: String(Cls.getFieldValue(order, of.manageNo)).trim(),
            customerName: String(Cls.getFieldValue(order, of.customerName)).trim(),
            clientName: String(Cls.getFieldValue(order, of.clientName)).trim(),
            kimonoType: String(Cls.getFieldValue(order, of.kimonoType)).trim(),
            locationStatus,
            workStatus,
            hasMaruarai: lineAnalysis.hasMaruarai,
            hasShiminuki: lineAnalysis.hasShiminuki,
            lineSummaries: lineAnalysis.lineSummaries,
            enabledAction: ui.enabledAction,
            noticeMessage: ui.message,
            noticeIsError: Boolean(ui.message),
        };

    };

    const resetInput = () => {

        const input = document.getElementById(INPUT_ID);

        if (input) {
            input.value = '';
            input.focus();
        }

        renderWorkView(null);
        setStatusMessage('', false);

    };

    const onLookupManageNo = async (manageNo) => {

        const normalized = String(manageNo ?? '').trim();

        if (normalized.length < MANAGE_NO_MIN) {
            return;
        }

        setStatusMessage('読込中…', false);

        try {
            const view = await buildViewFromOrder(normalized);

            if (view.reject) {
                renderWorkView(null);
                setStatusMessage(escapeHtml(view.message).replace(/\n/g, '<br>'), true);
                return;
            }

            renderWorkView(view);

            if (view.enabledAction) {
                setStatusMessage('実行する操作ボタンを選んでください。', false);
            } else if (view.noticeMessage) {
                setStatusMessage(escapeHtml(view.noticeMessage).replace(/\n/g, '<br>'), view.noticeIsError);
            } else {
                setStatusMessage('', false);
            }

        } catch (error) {
            console.error('[store_work]', error);
            renderWorkView(null);
            setStatusMessage('エラー: ' + escapeHtml(error.message || String(error)), true);
        }

    };

    const buildPutRecord = (action, of) => {

        const targets = StoreEngine.getPutTargetsForAction(action);
        const record = {
            [of.workStatus]: { value: targets.workStatus },
        };

        if (action === StoreEngine.ACTION.shimiCompleteToFactory) {
            record[of.locationStatus] = { value: targets.locationStatus };
        }

        return { targets, record };

    };

    const executeWorkAction = async (action) => {

        if (!pendingWork || isSubmitting) {
            return;
        }

        if (pendingWork.enabledAction !== action) {
            setStatusMessage('現在の状態ではこの操作はできません。', true);
            return;
        }

        const confirmMessage = StoreEngine.buildConfirmMessage(
            pendingWork.manageNo,
            pendingWork.locationStatus,
            pendingWork.workStatus,
            action
        );

        if (!window.confirm(confirmMessage)) {
            return;
        }

        isSubmitting = true;
        syncActionButtons(null);

        try {
            const fresh = await fetchOrderByManageNo(pendingWork.manageNo);

            if (!fresh) {
                setStatusMessage('再取得に失敗しました。', true);
                return;
            }

            const of = F().order;
            const freshLoc = String(Cls.getFieldValue(fresh, of.locationStatus)).trim();
            const freshWork = String(Cls.getFieldValue(fresh, of.workStatus)).trim();

            if (!StoreEngine.canPerformAction(action, freshLoc, freshWork)) {
                const staleMsg = StoreEngine.buildStaleStateMessage(freshLoc, freshWork);
                setStatusMessage(escapeHtml(staleMsg).replace(/\n/g, '<br>'), true);
                const staleView = await buildViewFromOrder(pendingWork.manageNo);

                if (!staleView.reject) {
                    renderWorkView(staleView);
                }

                return;
            }

            const { targets, record } = buildPutRecord(action, of);
            const recordId = fresh.$id?.value ?? pendingWork.recordId;
            const manageNo = pendingWork.manageNo;

            await kintoneApi(
                kintone.api.url('/k/v1/record.json', true),
                'PUT',
                {
                    app: C.ORDER_APP_ID,
                    id: recordId,
                    record,
                }
            );

            const title = StoreEngine.buildSuccessMessage(action);

            setStatusMessage(
                '<strong>' + escapeHtml(title) + '</strong><br>'
                + '管理番号: ' + escapeHtml(manageNo) + '<br>'
                + '現在地: ' + escapeHtml(targets.locationStatus) + '<br>'
                + '作業: ' + escapeHtml(targets.workStatus),
                false
            );

            resetInput();

        } catch (error) {
            console.error('[store_work] PUT', error);
            setStatusMessage('更新エラー: ' + escapeHtml(error.message || String(error)), true);
            syncActionButtons(pendingWork.enabledAction);

        } finally {
            isSubmitting = false;
        }

    };

    const injectStyles = () => {

        if (document.getElementById('cayan-store-work-style')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'cayan-store-work-style';
        style.textContent = [
            '.cayan-sw-panel { box-sizing: border-box; width: 100%; max-width: 640px; padding: 16px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fdf4ff; font-size: 14px; line-height: 1.5; }',
            '.cayan-sw-title { margin: 0 0 12px; font-size: 18px; font-weight: 700; }',
            '.cayan-sw-label { display: block; margin-bottom: 6px; font-weight: 600; }',
            '.cayan-sw-input { box-sizing: border-box; width: 100%; padding: 8px 10px; font-size: 16px; border: 1px solid #ccc; border-radius: 4px; }',
            '.cayan-sw-hint { margin: 6px 0 12px; color: #666; font-size: 12px; }',
            '.cayan-sw-preview { margin: 12px 0; padding: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; }',
            '.cayan-sw-muted { color: #888; }',
            '.cayan-sw-notice { margin: 8px 0; font-weight: 600; }',
            '.cayan-sw-notice--error { color: #b00020; }',
            '.cayan-sw-detail-list { margin: 0; padding-left: 1.2em; }',
            '.cayan-sw-sub { color: #64748b; font-size: 12px; }',
            '.cayan-sw-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }',
            '.cayan-sw-btn { padding: 10px 14px; font-size: 14px; font-weight: 700; color: #fff; border: none; border-radius: 6px; cursor: pointer; }',
            '.cayan-sw-btn:disabled { background: #94a3b8 !important; cursor: not-allowed; }',
            '.cayan-sw-btn--start { background: #9333ea; }',
            '.cayan-sw-btn--complete { background: #0284c7; }',
            '#cayan-store-work-panel-status { margin-top: 12px; min-height: 1.2em; }',
        ].join('\n');

        document.head.appendChild(style);

    };

    const mountPanel = () => {

        const space = getMountSpace();

        if (!space) {
            console.warn(
                '[store_work] スペース「' + C.WORK_SPACE_ID + '」がありません。'
                + '要素IDを「' + C.WORK_SPACE_ID + '」に設定してください。'
            );
            return;
        }

        if (document.getElementById(PANEL_ID)) {
            return;
        }

        injectStyles();

        space.innerHTML = (
            '<div id="' + PANEL_ID + '" class="cayan-sw-panel">'
            + '<h2 class="cayan-sw-title">店舗しみ抜き作業</h2>'
            + '<label class="cayan-sw-label" for="' + INPUT_ID + '">管理番号</label>'
            + '<input type="text" id="' + INPUT_ID + '" class="cayan-sw-input" autocomplete="off" placeholder="バーコードを読み取る">'
            + '<p class="cayan-sw-hint">対象: 現在地「店舗」。しみ抜き待ち → しみ抜き中 → 工場・仕上げ待ち。</p>'
            + '<div id="' + PANEL_ID + '-preview"></div>'
            + '<p id="' + PANEL_ID + '-notice" class="cayan-sw-notice"></p>'
            + '<div class="cayan-sw-actions">'
            + '<button type="button" id="' + PANEL_ID + '-btn-shimiStart" class="cayan-sw-btn cayan-sw-btn--start" disabled>しみ抜き開始</button>'
            + '<button type="button" id="' + PANEL_ID + '-btn-shimiComplete" class="cayan-sw-btn cayan-sw-btn--complete" disabled>しみ抜き完了・工場へ</button>'
            + '</div>'
            + '<div id="' + PANEL_ID + '-status"></div>'
            + '</div>'
        );

        const input = document.getElementById(INPUT_ID);

        input.addEventListener('keydown', (event) => {

            if (event.key !== 'Enter' && event.key !== 'NumpadEnter') {
                return;
            }

            event.preventDefault();
            onLookupManageNo(input.value);

        });

        input.addEventListener('blur', () => {
            window.setTimeout(() => onLookupManageNo(input.value), 150);
        });

        document.getElementById(PANEL_ID + '-btn-shimiStart').addEventListener('click', () => {
            executeWorkAction(StoreEngine.ACTION.shimiStart);
        });

        document.getElementById(PANEL_ID + '-btn-shimiComplete').addEventListener('click', () => {
            executeWorkAction(StoreEngine.ACTION.shimiCompleteToFactory);
        });

        renderWorkView(null);

        window.setTimeout(() => input.focus(), 200);

    };

    kintone.events.on(['app.record.create.show', 'app.record.edit.show'], (event) => {

        [300, 900, 1800].forEach((delayMs) => {
            window.setTimeout(() => {
                mountPanel();
            }, delayMs);
        });

        return event;

    });

}());
