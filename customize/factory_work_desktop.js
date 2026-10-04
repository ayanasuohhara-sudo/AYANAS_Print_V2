(function () {
    'use strict';

    if (window.CAYANAS_INTERNAL_OPS?.DISABLE_LEGACY_APP84) {
        return;
    }

    /**
     * 工場作業 — App84 UI
     * 読込: order_line_classifier.js → factory_inbound_config.js → factory_work_engine.js → 本ファイル
     */

    const C = window.CAYANAS_FACTORY_INBOUND;
    const Cls = window.CAYANAS_OrderLineClassifier;
    const WorkEngine = window.CAYANAS_FactoryWorkEngine;
    const SortEngine = window.CAYANAS_FactorySortingEngine;

    if (!C || !Cls || !WorkEngine) {
        console.error('[factory_work] order_line_classifier / factory_inbound_config / factory_work_engine を先に読み込んでください。');
        return;
    }

    if (!C.FACTORY_INBOUND_APP_ID || kintone.app.getId() !== C.FACTORY_INBOUND_APP_ID) {
        return;
    }

    const PANEL_ID = 'cayan-factory-work-panel';
    const INPUT_ID = 'cayan-factory-work-manage-no';
    const ACTION_SELECT_ID = 'cayan-factory-work-action';
    const EXECUTE_BTN_ID = 'cayan-factory-work-execute';
    const MANAGE_NO_MIN = C.MANAGE_NO_MIN_LENGTH || 6;
    const WORK_MOUNT_ROOT_ID = 'cayan-factory-work-mount-root';

    let productLookup = null;
    let productLookupPromise = null;
    let pendingWork = null;
    let isSubmitting = false;

    const F = () => C.FIELDS;

    const formatDetailLinesHtml = (lineSummaries) => {

        if (SortEngine && SortEngine.formatDetailLinesHtml) {
            return SortEngine.formatDetailLinesHtml(lineSummaries);
        }

        const lines = lineSummaries || [];

        if (lines.length === 0) {
            return '<p>（加工明細なし）</p>';
        }

        return '<ul class="cayan-fw-detail-list">'
            + lines.map((line) => {
                const name = String(line.itemName || line.itemCode || '—').trim();
                const qty = line.qty !== '' && line.qty !== undefined ? String(line.qty) : '—';
                return '<li>' + name + '　' + qty + '</li>';
            }).join('')
            + '</ul>';

    };

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

    const getDedicatedWorkSpace = () => kintone.app.record.getSpaceElement(C.WORK_SPACE_ID);

    const getWorkMountSpace = () => {

        const dedicated = getDedicatedWorkSpace();

        if (dedicated) {
            return dedicated;
        }

        const inboundSpace = kintone.app.record.getSpaceElement(C.UI_SPACE_ID)
            || kintone.app.record.getSpaceElement(C.MESSAGE_SPACE_ID);

        if (!inboundSpace) {
            return null;
        }

        let root = document.getElementById(WORK_MOUNT_ROOT_ID);

        if (!root) {
            root = document.createElement('div');
            root.id = WORK_MOUNT_ROOT_ID;
            inboundSpace.appendChild(root);

            if (!window.__cayanFactoryWorkFallbackLogged) {
                window.__cayanFactoryWorkFallbackLogged = true;
                console.info(
                    '[factory_work] 要素ID「' + C.WORK_SPACE_ID + '」のスペースが無いため、'
                    + '工場入庫スペース内に工場作業を表示しています（動作に問題はありません）。'
                    + '別エリアに分ける場合はフォームにスペースを追加し、要素IDを「' + C.WORK_SPACE_ID + '」に設定してください。'
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

    const renderWorkView = (view) => {

        const previewEl = document.getElementById(PANEL_ID + '-preview');

        if (!previewEl) {
            return;
        }

        if (!view) {
            previewEl.innerHTML = '<p class="cayan-fw-muted">管理番号を読み取ると、ここに商品情報が表示されます。</p>';
            resetActionSelect();
            syncExecuteControls(false);
            pendingWork = null;
            return;
        }

        if (view.reject) {
            previewEl.innerHTML = (
                '<div class="cayan-fw-preview">'
                + '<p><strong>読み取れません</strong></p>'
                + '<p>' + escapeHtml(view.message).replace(/\n/g, '<br>') + '</p>'
                + '</div>'
            );
            resetActionSelect();
            syncExecuteControls(false);
            pendingWork = null;
            return;
        }

        const maruLabel = view.hasMaruarai ? 'あり' : 'なし';
        const shimiLabel = view.hasShiminuki ? 'あり' : 'なし';

        previewEl.innerHTML = (
            '<div class="cayan-fw-preview">'
            + '<p><strong>管理番号:</strong> ' + escapeHtml(view.manageNo) + '</p>'
            + '<p><strong>顧客名:</strong> ' + escapeHtml(view.customerName) + '</p>'
            + '<p><strong>お客様名:</strong> ' + escapeHtml(view.clientName) + '</p>'
            + '<p><strong>着物種類:</strong> ' + escapeHtml(view.kimonoType) + '</p>'
            + '<p><strong>現在地:</strong> ' + escapeHtml(view.locationStatus) + '</p>'
            + '<p><strong>現在の作業ステータス:</strong> ' + escapeHtml(view.workStatus) + '</p>'
            + '<p><strong>App13判定（参考）:</strong> 丸洗い: ' + maruLabel + ' / しみ抜き: ' + shimiLabel + '</p>'
            + '<p><strong>加工内容</strong></p>'
            + formatDetailLinesHtml(view.lineSummaries)
            + '</div>'
        );

        resetActionSelect();
        syncExecuteControls(true);

        pendingWork = {
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
            setStatusMessage('操作を選んで「実行」してください。次の商品は管理番号を連続スキャンできます。', false);

            const input = document.getElementById(INPUT_ID);

            if (input) {
                input.focus();
                input.select();
            }

        } catch (error) {
            console.error('[factory_work]', error);
            renderWorkView(null);
            setStatusMessage('エラー: ' + escapeHtml(error.message || String(error)), true);
        }

    };

    const executeWorkAction = async (action) => {

        if (!pendingWork || isSubmitting) {
            return;
        }

        if (!action) {
            setStatusMessage('操作を選択してください。', true);
            return;
        }

        isSubmitting = true;
        syncExecuteControls(Boolean(pendingWork));

        try {
            const fresh = await fetchOrderByManageNo(pendingWork.manageNo);

            if (!fresh) {
                setStatusMessage('再取得に失敗しました。', true);
                return;
            }

            const of = F().order;
            const freshLoc = String(Cls.getFieldValue(fresh, of.locationStatus)).trim();
            const freshWork = String(Cls.getFieldValue(fresh, of.workStatus)).trim();
            const confirmMessage = WorkEngine.buildConfirmMessage(
                pendingWork.manageNo,
                freshLoc,
                freshWork,
                action
            );

            if (!window.confirm(confirmMessage)) {
                return;
            }

            const nextWork = WorkEngine.getNextWorkStatusForAction(action);
            const recordId = fresh.$id?.value ?? pendingWork.recordId;
            const manageNo = pendingWork.manageNo;

            await kintoneApi(
                kintone.api.url('/k/v1/record.json', true),
                'PUT',
                {
                    app: C.ORDER_APP_ID,
                    id: recordId,
                    record: {
                        [of.workStatus]: { value: nextWork },
                    },
                }
            );

            const title = WorkEngine.buildSuccessMessage(action);

            setStatusMessage(
                '<strong>' + escapeHtml(title) + '</strong><br>'
                + '管理番号: ' + escapeHtml(manageNo) + '<br>'
                + '現在地: ' + escapeHtml(freshLoc) + '<br>'
                + '作業: ' + escapeHtml(nextWork),
                false
            );

            resetInput();

        } catch (error) {
            console.error('[factory_work] PUT', error);
            setStatusMessage('更新エラー: ' + escapeHtml(error.message || String(error)), true);
            syncExecuteControls(Boolean(pendingWork));

        } finally {
            isSubmitting = false;
            syncExecuteControls(Boolean(pendingWork));
        }

    };

    const onExecuteClick = () => {

        const select = document.getElementById(ACTION_SELECT_ID);
        executeWorkAction(String(select?.value ?? '').trim());

    };

    const injectStyles = () => {

        if (document.getElementById('cayan-factory-work-style')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'cayan-factory-work-style';
        style.textContent = [
            '.cayan-fw-panel { box-sizing: border-box; width: 100%; max-width: 640px; margin-top: 24px; padding: 16px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f0fdf4; font-size: 14px; line-height: 1.5; }',
            '.cayan-fw-title { margin: 0 0 12px; font-size: 18px; font-weight: 700; }',
            '.cayan-fw-label { display: block; margin-bottom: 6px; font-weight: 600; }',
            '.cayan-fw-input { box-sizing: border-box; width: 100%; padding: 8px 10px; font-size: 16px; border: 1px solid #ccc; border-radius: 4px; }',
            '.cayan-fw-hint { margin: 6px 0 12px; color: #666; font-size: 12px; }',
            '.cayan-fw-preview { margin: 12px 0; padding: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; }',
            '.cayan-fw-muted { color: #888; }',
            '.cayan-fw-notice { margin: 8px 0; font-weight: 600; }',
            '.cayan-fw-notice--error { color: #b00020; }',
            '.cayan-fw-detail-list { margin: 0; padding-left: 1.2em; }',
            '.cayan-fw-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; align-items: center; }',
            '.cayan-fw-select { flex: 1 1 200px; min-width: 180px; padding: 8px 10px; font-size: 14px; border: 1px solid #ccc; border-radius: 4px; }',
            '.cayan-fw-btn { padding: 10px 14px; font-size: 14px; font-weight: 700; color: #fff; border: none; border-radius: 6px; cursor: pointer; }',
            '.cayan-fw-btn:disabled { background: #94a3b8 !important; cursor: not-allowed; }',
            '.cayan-fw-btn--execute { background: #2563eb; }',
            '#cayan-factory-work-panel-status { margin-top: 12px; min-height: 1.2em; }',
        ].join('\n');

        document.head.appendChild(style);

    };

    const mountPanel = () => {

        const space = getWorkMountSpace();

        if (!space) {
            console.warn(
                '[factory_work] 表示先がありません。'
                + '「' + C.WORK_SPACE_ID + '」または「' + C.UI_SPACE_ID + '」をフォームに追加してください。'
            );
            return;
        }

        if (document.getElementById(PANEL_ID)) {
            return;
        }

        injectStyles();

        space.innerHTML = (
            '<div id="' + PANEL_ID + '" class="cayan-fw-panel">'
            + '<h2 class="cayan-fw-title">工場作業</h2>'
            + '<label class="cayan-fw-label" for="' + INPUT_ID + '">管理番号</label>'
            + '<input type="text" id="' + INPUT_ID + '" class="cayan-fw-input" autocomplete="off" placeholder="バーコードを読み取る">'
            + '<p class="cayan-fw-hint">バーコード連続読取 → 操作を手で選択 → 実行。状態による自動判定はしません。</p>'
            + '<div id="' + PANEL_ID + '-preview"></div>'
            + '<div class="cayan-fw-actions">'
            + '<label class="cayan-fw-label" for="' + ACTION_SELECT_ID + '">工場作業</label>'
            + '<select id="' + ACTION_SELECT_ID + '" class="cayan-fw-select" disabled>'
            + '<option value="">— 選択してください —</option>'
            + '<option value="' + WorkEngine.ACTION.maruStart + '">丸洗い開始（工場／丸洗い中）</option>'
            + '<option value="' + WorkEngine.ACTION.maruComplete + '">丸洗い完了（工場／仕上げ待ち）</option>'
            + '<option value="' + WorkEngine.ACTION.finishComplete + '">仕上げ完了（工場／仕上げ完了）</option>'
            + '</select>'
            + '<button type="button" id="' + EXECUTE_BTN_ID + '" class="cayan-fw-btn cayan-fw-btn--execute" disabled>実行</button>'
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
            syncExecuteControls(Boolean(pendingWork));
        });

        document.getElementById(EXECUTE_BTN_ID).addEventListener('click', () => {
            onExecuteClick();
        });

        renderWorkView(null);

        window.setTimeout(() => input.focus(), 200);

    };

    const installPortalLayoutIfNeeded = () => {

        if (typeof window.CAYANAS_applyFactoryPortalLayout === 'function') {
            return;
        }

        const HOST_ID = 'cayan-factory-portal-host';
        const INLINE_CLASS = 'cayan-factory-portal-inline';
        const PANELS = [
            'cayan-factory-inbound-panel',
            'cayan-factory-sorting-panel',
            'cayan-factory-work-panel',
        ];

        const injectLayoutStyles = () => {

            if (document.getElementById('cayan-factory-portal-layout-style')) {
                return;
            }

            const style = document.createElement('style');
            style.id = 'cayan-factory-portal-layout-style';
            style.textContent = [
                '#' + HOST_ID + '{display:flex!important;flex-direction:row!important;flex-wrap:wrap!important;gap:16px!important;width:100%!important;align-items:flex-start!important;}',
                '#' + HOST_ID + '>.control-gaia,#' + HOST_ID + '>div{flex:1 1 300px!important;min-width:280px!important;max-width:100%!important;width:auto!important;margin:0!important;}',
                '.' + INLINE_CLASS + '{display:flex!important;flex-direction:row!important;flex-wrap:wrap!important;gap:16px!important;width:100%!important;align-items:flex-start!important;}',
                '.' + INLINE_CLASS + '>*{flex:1 1 300px!important;min-width:280px!important;max-width:100%!important;}',
                '#' + HOST_ID + ' .cayan-fi-panel,#' + HOST_ID + ' .cayan-fs-panel,#' + HOST_ID + ' .cayan-fw-panel,',
                '.' + INLINE_CLASS + ' .cayan-fi-panel,.' + INLINE_CLASS + ' .cayan-fs-panel,.' + INLINE_CLASS + ' .cayan-fw-panel{max-width:none!important;width:100%!important;margin-top:0!important;}',
                '.cayan-factory-portal-empty-row{display:none!important;}',
            ].join('');

            document.head.appendChild(style);

        };

        const columnFor = (panel) => panel.closest('.control-gaia')
            || panel.closest('#cayan-factory-sorting-mount-root, #cayan-factory-work-mount-root')
            || panel.parentElement;

        window.CAYANAS_applyFactoryPortalLayout = () => {

            if (kintone.app.getId() !== C.FACTORY_INBOUND_APP_ID) {
                return false;
            }

            injectLayoutStyles();

            const panels = PANELS.map((id) => document.getElementById(id)).filter(Boolean);

            if (panels.length < 2) {
                return false;
            }

            const columns = [];
            const seen = new Set();

            panels.forEach((panel) => {

                const col = columnFor(panel);

                if (!col || seen.has(col)) {
                    return;
                }

                seen.add(col);
                columns.push(col);

            });

            if (columns.length < 2) {
                return false;
            }

            const sharedParent = columns[0].parentElement;
            const allSameParent = sharedParent
                && sharedParent.id !== HOST_ID
                && columns.every((col) => col.parentElement === sharedParent);

            if (allSameParent && (
                sharedParent.id === C.UI_SPACE_ID
                || sharedParent.id === C.MESSAGE_SPACE_ID
            )) {
                sharedParent.classList.add(INLINE_CLASS);
            } else {
                let host = document.getElementById(HOST_ID);

                if (!host) {
                    host = document.createElement('div');
                    host.id = HOST_ID;
                    host.className = INLINE_CLASS;
                    columns[0].parentElement.insertBefore(host, columns[0]);
                }

                columns.forEach((col) => {

                    if (col.parentElement !== host) {
                        host.appendChild(col);
                    }

                });
            }

            document.querySelectorAll('.row-gaia').forEach((row) => {

                if (row.querySelector('#' + HOST_ID) || row.querySelector('.control-gaia')) {
                    return;
                }

                row.classList.add('cayan-factory-portal-empty-row');

            });

            return true;

        };

    };

    installPortalLayoutIfNeeded();

    const runPortalLayout = () => {

        if (typeof window.CAYANAS_applyFactoryPortalLayout === 'function') {
            window.CAYANAS_applyFactoryPortalLayout();
        }

    };

    const scheduleMount = () => {

        [500, 1000, 2000, 3500].forEach((delayMs) => {
            window.setTimeout(() => {
                mountPanel();
                runPortalLayout();
            }, delayMs);
        });

    };

    kintone.events.on(['app.record.create.show', 'app.record.edit.show'], (event) => {

        scheduleMount();

        return event;

    });

}());
