(function () {
    'use strict';

    if (window.CAYANAS_INTERNAL_OPS?.DISABLE_LEGACY_APP84) {
        return;
    }

    /**
     * 工場振り分け — App84 UI
     * 読込: order_line_classifier.js → factory_inbound_config.js → factory_sorting_engine.js → 本ファイル
     */

    const C = window.CAYANAS_FACTORY_INBOUND;
    const Cls = window.CAYANAS_OrderLineClassifier;
    const SortEngine = window.CAYANAS_FactorySortingEngine;

    if (!C || !Cls || !SortEngine) {
        console.error('[factory_sorting] order_line_classifier / factory_inbound_config / factory_sorting_engine を先に読み込んでください。');
        return;
    }

    if (!C.FACTORY_INBOUND_APP_ID || kintone.app.getId() !== C.FACTORY_INBOUND_APP_ID) {
        return;
    }

    const PANEL_ID = 'cayan-factory-sorting-panel';
    const INPUT_ID = 'cayan-factory-sorting-manage-no';
    const ACTION_SELECT_ID = 'cayan-factory-sorting-action';
    const EXECUTE_BTN_ID = 'cayan-factory-sorting-execute';
    const MANAGE_NO_MIN = C.MANAGE_NO_MIN_LENGTH || 6;

    let productLookup = null;
    let productLookupPromise = null;
    let pendingSort = null;
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

    const SORTING_MOUNT_ROOT_ID = 'cayan-factory-sorting-mount-root';

    const getDedicatedSortingSpace = () => kintone.app.record.getSpaceElement(C.SORTING_SPACE_ID);

    /**
     * 専用スペース factory_sorting_space を優先。
     * 未設定時は工場入庫スペース直下にマウント用 div を追加（入庫パネルは触らない）。
     */
    const getSortingMountSpace = () => {

        const dedicated = getDedicatedSortingSpace();

        if (dedicated) {
            return dedicated;
        }

        const inboundSpace = kintone.app.record.getSpaceElement(C.UI_SPACE_ID)
            || kintone.app.record.getSpaceElement(C.MESSAGE_SPACE_ID);

        if (!inboundSpace) {
            return null;
        }

        let root = document.getElementById(SORTING_MOUNT_ROOT_ID);

        if (!root) {
            root = document.createElement('div');
            root.id = SORTING_MOUNT_ROOT_ID;
            inboundSpace.appendChild(root);

            if (!window.__cayanFactorySortingFallbackLogged) {
                window.__cayanFactorySortingFallbackLogged = true;
                console.info(
                    '[factory_sorting] 要素ID「' + C.SORTING_SPACE_ID + '」のスペースが無いため、'
                    + '工場入庫スペース内に振り分けを表示しています（動作に問題はありません）。'
                    + '別エリアに分ける場合はフォームにスペースを追加し、要素IDを「' + C.SORTING_SPACE_ID + '」に設定してください。'
                );
            }
        }

        return root;

    };

    const setStatusMessage = (html, isError) => {

        const el = document.getElementById(PANEL_ID + '-status');

        if (!el) {
            return;
        }

        el.innerHTML = html;
        el.style.color = isError ? '#b00020' : '#0d6b0d';

    };

    const syncExecuteControls = (hasPending) => {

        const select = document.getElementById(ACTION_SELECT_ID);
        const executeBtn = document.getElementById(EXECUTE_BTN_ID);
        const canUse = Boolean(hasPending) && !isSubmitting;

        if (select) {
            select.disabled = !canUse;
        }

        if (executeBtn) {
            executeBtn.disabled = !canUse || !String(select?.value ?? '').trim();
        }

    };

    const resetActionSelect = () => {

        const select = document.getElementById(ACTION_SELECT_ID);

        if (select) {
            select.value = '';
        }

    };

    const renderSortView = (view) => {

        const previewEl = document.getElementById(PANEL_ID + '-preview');

        if (!previewEl) {
            return;
        }

        if (!view) {
            previewEl.innerHTML = '<p class="cayan-fs-muted">管理番号を読み取ると、ここに商品情報が表示されます。</p>';
            resetActionSelect();
            syncExecuteControls(false);
            pendingSort = null;
            return;
        }

        if (view.reject) {
            previewEl.innerHTML = (
                '<div class="cayan-fs-preview cayan-fs-preview--error">'
                + '<p><strong>読み取れません</strong></p>'
                + '<p>' + escapeHtml(view.message).replace(/\n/g, '<br>') + '</p>'
                + '</div>'
            );
            resetActionSelect();
            syncExecuteControls(false);
            pendingSort = null;
            return;
        }

        const maruLabel = view.hasMaruarai ? 'あり' : 'なし';
        const shimiLabel = view.hasShiminuki ? 'あり' : 'なし';

        previewEl.innerHTML = (
            '<div class="cayan-fs-preview">'
            + '<p><strong>管理番号:</strong> ' + escapeHtml(view.manageNo) + '</p>'
            + '<p><strong>顧客名:</strong> ' + escapeHtml(view.customerName) + '</p>'
            + '<p><strong>お客様名:</strong> ' + escapeHtml(view.clientName) + '</p>'
            + '<p><strong>着物種類:</strong> ' + escapeHtml(view.kimonoType) + '</p>'
            + '<p><strong>現在地:</strong> ' + escapeHtml(view.locationStatus) + '</p>'
            + '<p><strong>現在の作業ステータス:</strong> ' + escapeHtml(view.workStatus) + '</p>'
            + '<p><strong>App13判定（参考）:</strong> 丸洗い: ' + maruLabel + ' / しみ抜き: ' + shimiLabel + '</p>'
            + '<p><strong>加工内容</strong></p>'
            + SortEngine.formatDetailLinesHtml(view.lineSummaries)
            + '</div>'
        );

        resetActionSelect();
        syncExecuteControls(true);

        pendingSort = {
            recordId: view.recordId,
            manageNo: view.manageNo,
            locationStatus: view.locationStatus,
            workStatus: view.workStatus,
        };

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
        };

    };

    const resetInput = () => {

        const input = document.getElementById(INPUT_ID);

        if (input) {
            input.value = '';
            input.focus();
        }

        renderSortView(null);
        resetActionSelect();
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
            renderSortView(view);

            if (view.reject) {
                setStatusMessage(escapeHtml(view.message).replace(/\n/g, '<br>'), true);
            } else {
                setStatusMessage('操作を選んで「実行」してください。次の商品は管理番号を連続スキャンできます。', false);
                const input = document.getElementById(INPUT_ID);

                if (input) {
                    input.focus();
                    input.select();
                }
            }

        } catch (error) {
            console.error('[factory_sorting]', error);
            renderSortView(null);
            setStatusMessage('エラー: ' + escapeHtml(error.message || String(error)), true);
        }

    };

    const executeSortAction = async (action) => {

        if (!pendingSort || isSubmitting) {
            return;
        }

        if (!action) {
            setStatusMessage('操作を選択してください。', true);
            return;
        }

        isSubmitting = true;
        syncExecuteControls(Boolean(pendingSort));

        try {
            const fresh = await fetchOrderByManageNo(pendingSort.manageNo);

            if (!fresh) {
                setStatusMessage('再取得に失敗しました。', true);
                return;
            }

            const of = F().order;
            const freshLoc = String(Cls.getFieldValue(fresh, of.locationStatus)).trim();
            const freshWork = String(Cls.getFieldValue(fresh, of.workStatus)).trim();
            const targets = SortEngine.getPutTargetsForAction(action);
            const confirmMessage = SortEngine.buildConfirmMessage(
                pendingSort.manageNo,
                freshLoc,
                freshWork,
                targets,
                action
            );

            if (!window.confirm(confirmMessage)) {
                return;
            }

            const recordId = fresh.$id?.value ?? pendingSort.recordId;

            await kintoneApi(
                kintone.api.url('/k/v1/record.json', true),
                'PUT',
                {
                    app: C.ORDER_APP_ID,
                    id: recordId,
                    record: {
                        [of.locationStatus]: { value: targets.locationStatus },
                        [of.workStatus]: { value: targets.workStatus },
                    },
                }
            );

            setStatusMessage(
                '<strong>振り分け完了</strong><br>'
                + '管理番号: ' + escapeHtml(pendingSort.manageNo) + '<br>'
                + '移動先: ' + escapeHtml(targets.locationStatus) + '<br>'
                + '作業: ' + escapeHtml(targets.workStatus),
                false
            );

            resetInput();

        } catch (error) {
            console.error('[factory_sorting] PUT', error);
            setStatusMessage('更新エラー: ' + escapeHtml(error.message || String(error)), true);
            syncExecuteControls(Boolean(pendingSort));

        } finally {
            isSubmitting = false;
            syncExecuteControls(Boolean(pendingSort));
        }

    };

    const onExecuteClick = () => {

        const select = document.getElementById(ACTION_SELECT_ID);
        executeSortAction(String(select?.value ?? '').trim());

    };

    const injectStyles = () => {

        if (document.getElementById('cayan-factory-sorting-style')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'cayan-factory-sorting-style';
        style.textContent = [
            '.cayan-fs-panel { box-sizing: border-box; width: 100%; max-width: 640px; margin-top: 24px; padding: 16px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fffbeb; font-size: 14px; line-height: 1.5; }',
            '.cayan-fs-title { margin: 0 0 12px; font-size: 18px; font-weight: 700; }',
            '.cayan-fs-label { display: block; margin-bottom: 6px; font-weight: 600; }',
            '.cayan-fs-input { box-sizing: border-box; width: 100%; padding: 8px 10px; font-size: 16px; border: 1px solid #ccc; border-radius: 4px; }',
            '.cayan-fs-hint { margin: 6px 0 12px; color: #666; font-size: 12px; }',
            '.cayan-fs-preview { margin: 12px 0; padding: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; }',
            '.cayan-fs-preview--error { border-color: #f5c2c7; background: #fff5f5; }',
            '.cayan-fs-muted { color: #888; }',
            '.cayan-fs-detail-list { margin: 0; padding-left: 1.2em; }',
            '.cayan-fs-sub { color: #64748b; font-size: 12px; }',
            '.cayan-fs-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; align-items: center; }',
            '.cayan-fs-select { flex: 1 1 200px; min-width: 180px; padding: 8px 10px; font-size: 14px; border: 1px solid #ccc; border-radius: 4px; }',
            '.cayan-fs-btn { padding: 10px 14px; font-size: 14px; font-weight: 700; color: #fff; border: none; border-radius: 6px; cursor: pointer; }',
            '.cayan-fs-btn:disabled { background: #94a3b8 !important; cursor: not-allowed; }',
            '.cayan-fs-btn--execute { background: #2563eb; }',
            '#cayan-factory-sorting-panel-status { margin-top: 12px; min-height: 1.2em; }',
        ].join('\n');

        document.head.appendChild(style);

    };

    const mountPanel = () => {

        const space = getSortingMountSpace();

        if (!space) {
            console.warn(
                '[factory_sorting] 表示先がありません。'
                + '「' + C.SORTING_SPACE_ID + '」または「' + C.UI_SPACE_ID + '」のスペースをフォームに追加してください。'
            );
            return;
        }

        if (document.getElementById(PANEL_ID)) {
            return;
        }

        injectStyles();

        space.innerHTML = (
            '<div id="' + PANEL_ID + '" class="cayan-fs-panel">'
            + '<h2 class="cayan-fs-title">振り分け</h2>'
            + '<label class="cayan-fs-label" for="' + INPUT_ID + '">管理番号</label>'
            + '<input type="text" id="' + INPUT_ID + '" class="cayan-fs-input" autocomplete="off" placeholder="バーコードを読み取る">'
            + '<p class="cayan-fs-hint">バーコード連続読取 → 操作を手で選択 → 実行。状態による自動判定はしません。</p>'
            + '<div id="' + PANEL_ID + '-preview"></div>'
            + '<div class="cayan-fs-actions">'
            + '<label class="cayan-fs-label" for="' + ACTION_SELECT_ID + '">振り分け操作</label>'
            + '<select id="' + ACTION_SELECT_ID + '" class="cayan-fs-select" disabled>'
            + '<option value="">— 選択してください —</option>'
            + '<option value="' + SortEngine.ACTION.maru + '">丸洗いへ（工場／丸洗い待ち）</option>'
            + '<option value="' + SortEngine.ACTION.storeShimi + '">店舗しみ抜きへ（店舗／しみ抜き待ち）</option>'
            + '<option value="' + SortEngine.ACTION.finish + '">仕上げへ（工場／仕上げ待ち）</option>'
            + '</select>'
            + '<button type="button" id="' + EXECUTE_BTN_ID + '" class="cayan-fs-btn cayan-fs-btn--execute" disabled>実行</button>'
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

        document.getElementById(ACTION_SELECT_ID).addEventListener('change', () => {
            syncExecuteControls(Boolean(pendingSort));
        });

        document.getElementById(EXECUTE_BTN_ID).addEventListener('click', () => {
            onExecuteClick();
        });

        renderSortView(null);

        window.setTimeout(() => input.focus(), 200);

    };

    const scheduleMount = () => {

        // 工場入庫パネル（300ms）の後にマウント。DOM 遅延時は再試行。
        [400, 900, 1800, 3500].forEach((delayMs) => {
            window.setTimeout(() => {
                mountPanel();

                if (typeof window.CAYANAS_applyFactoryPortalLayout === 'function') {
                    window.CAYANAS_applyFactoryPortalLayout();
                }

            }, delayMs);
        });

    };

    kintone.events.on(['app.record.create.show', 'app.record.edit.show'], (event) => {

        scheduleMount();

        return event;

    });

}());
