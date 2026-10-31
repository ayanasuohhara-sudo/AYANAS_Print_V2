(function () {
    'use strict';

    if (window.CAYANAS_INTERNAL_OPS?.DISABLE_LEGACY_APP84) {
        return;
    }

    /**
     * 工場入庫 V1 — 専用アプリ上の UI
     * 読込順: order_line_classifier.js → factory_inbound_config.js → factory_inbound_engine.js → 本ファイル
     */

    const C = window.CAYANAS_FACTORY_INBOUND;
    const Cls = window.CAYANAS_OrderLineClassifier;
    const Engine = window.CAYANAS_FactoryInboundEngine;

    if (!C || !Cls || !Engine) {
        console.error('[factory_inbound] order_line_classifier / factory_inbound_config / factory_inbound_engine を先に読み込んでください。');
        return;
    }

    if (!C.FACTORY_INBOUND_APP_ID || kintone.app.getId() !== C.FACTORY_INBOUND_APP_ID) {
        return;
    }

    const PANEL_ID = 'cayan-factory-inbound-panel';
    const INPUT_ID = 'cayan-factory-inbound-manage-no';
    const CONFIRM_BTN_ID = 'cayan-factory-inbound-confirm';
    const MANAGE_NO_MIN = C.MANAGE_NO_MIN_LENGTH || 6;

    let productLookup = null;
    let productLookupPromise = null;
    let pendingPreview = null;
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

        const app = C.PRODUCT_APP_ID;
        const fields = [
            F().product.itemCode,
            F().product.itemName,
            F().product.subcategory,
        ];

        const records = [];
        let offset = 0;
        const limit = 500;

        for (;;) {
            const resp = await kintoneApi(
                kintone.api.url('/k/v1/records.json', true),
                'GET',
                {
                    app,
                    query: 'order by $id asc limit ' + limit + ' offset ' + offset,
                    fields,
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

        const code = escapeQueryValue(manageNo);
        const of = F().order;

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
        kintone.app.record.getSpaceElement(C.UI_SPACE_ID)
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

    const renderPreview = (preview) => {

        const previewEl = document.getElementById(PANEL_ID + '-preview');
        const confirmBtn = document.getElementById(CONFIRM_BTN_ID);

        if (!previewEl || !confirmBtn) {
            return;
        }

        if (!preview) {
            previewEl.innerHTML = '<p class="cayan-fi-muted">管理番号を読み取ると、ここに確認内容が表示されます。</p>';
            confirmBtn.disabled = true;
            return;
        }

        if (preview.reject) {
            previewEl.innerHTML = (
                '<div class="cayan-fi-preview cayan-fi-preview--error">'
                + '<p><strong>工場入庫できません</strong></p>'
                + '<p>' + escapeHtml(preview.message).replace(/\n/g, '<br>') + '</p>'
                + (preview.currentWork
                    ? '<p>現在の作業ステータス: ' + escapeHtml(preview.currentWork) + '</p>'
                    : '')
                + '</div>'
            );
            confirmBtn.disabled = true;
            pendingPreview = null;
            return;
        }

        const maruLine = preview.maruaraiNote
            ? '<p>判定: <strong>' + escapeHtml(preview.maruaraiNote) + '</strong></p>'
            : '';

        previewEl.innerHTML = (
            '<div class="cayan-fi-preview">'
            + '<p><strong>管理番号:</strong> ' + escapeHtml(preview.manageNo) + '</p>'
            + '<p><strong>顧客名:</strong> ' + escapeHtml(preview.customerName) + '</p>'
            + '<p><strong>お客様名:</strong> ' + escapeHtml(preview.clientName) + '</p>'
            + '<p><strong>着物種類:</strong> ' + escapeHtml(preview.kimonoType) + '</p>'
            + '<p><strong>加工内容:</strong> ' + escapeHtml(preview.processingSummary) + '</p>'
            + '<p><strong>現在地:</strong> ' + escapeHtml(preview.fromLocation) + '</p>'
            + maruLine
            + '<hr>'
            + '<p><strong>工場入庫後</strong></p>'
            + '<p>現在地: <strong>' + escapeHtml(C.LOCATION.factory) + '</strong></p>'
            + '<p>作業ステータス: <strong>' + escapeHtml(preview.targetWork) + '</strong></p>'
            + '</div>'
        );

        confirmBtn.disabled = false;

        pendingPreview = {
            recordId: preview.recordId,
            manageNo: preview.manageNo,
            targetWork: preview.targetWork,
        };

    };

    const resetInputFocus = () => {

        const input = document.getElementById(INPUT_ID);

        if (input) {
            input.value = '';
            input.focus();
        }

        pendingPreview = null;
        renderPreview(null);
        setStatusMessage('', false);

    };

    const buildPreviewFromOrder = async (manageNo) => {

        const lookup = await ensureProductLookup();
        const order = await fetchOrderByManageNo(manageNo);

        if (!order) {
            return {
                reject: true,
                message: '管理番号が App16（受注明細）に見つかりません。\n' + manageNo,
            };
        }

        const of = F().order;
        const fromLocation = String(Cls.getFieldValue(order, of.locationStatus)).trim();
        const currentWork = String(Cls.getFieldValue(order, of.workStatus)).trim();

        if (fromLocation === C.LOCATION.factory) {
            return {
                reject: true,
                message: 'この商品はすでに工場にあります。作業ステータスは変更しません。',
                currentWork: currentWork || '（空欄）',
            };
        }

        const lineAnalysis = Cls.analyzeDetailTable(order, lookup, {
            detailTableField: of.detailTable,
            itemCodeField: of.itemCode,
            itemNameField: of.itemName,
            maruaraiSubcategory: C.MARUARAI_SUBCATEGORY,
        });

        const plan = Engine.planFactoryInbound(fromLocation, lineAnalysis);

        if (plan.action === 'reject') {
            return {
                reject: true,
                message: plan.message,
                currentWork: currentWork || undefined,
            };
        }

        const recordId = order.$id?.value;

        if (recordId === null || recordId === undefined || recordId === '') {
            return {
                reject: true,
                message: '受注レコード ID を取得できません。App16 の GET フィールドに $id が含まれているか確認してください。',
            };
        }

        return {
            reject: false,
            recordId,
            manageNo: String(Cls.getFieldValue(order, of.manageNo)).trim(),
            customerName: String(Cls.getFieldValue(order, of.customerName)).trim(),
            clientName: String(Cls.getFieldValue(order, of.clientName)).trim(),
            kimonoType: String(Cls.getFieldValue(order, of.kimonoType)).trim(),
            processingSummary: Engine.formatProcessingSummary(lineAnalysis.lineSummaries),
            fromLocation,
            targetWork: plan.workStatus,
            maruaraiNote: plan.maruaraiNote || '',
        };

    };

    const onLookupManageNo = async (manageNo) => {

        const normalized = String(manageNo ?? '').trim();

        if (normalized.length < MANAGE_NO_MIN) {
            return;
        }

        setStatusMessage('確認中…', false);

        try {
            const preview = await buildPreviewFromOrder(normalized);
            renderPreview(preview);

            if (preview.reject) {
                setStatusMessage(escapeHtml(preview.message).replace(/\n/g, '<br>'), true);
            } else {
                setStatusMessage('内容を確認し、「工場入庫する」を押してください。', false);
            }

        } catch (error) {
            console.error('[factory_inbound]', error);
            renderPreview(null);
            setStatusMessage('エラー: ' + escapeHtml(error.message || String(error)), true);
        }

    };

    const onConfirmInbound = async () => {

        if (!pendingPreview || isSubmitting) {
            return;
        }

        isSubmitting = true;

        const confirmBtn = document.getElementById(CONFIRM_BTN_ID);

        if (confirmBtn) {
            confirmBtn.disabled = true;
        }

        try {
            const of = F().order;

            await kintoneApi(
                kintone.api.url('/k/v1/record.json', true),
                'PUT',
                {
                    app: C.ORDER_APP_ID,
                    id: pendingPreview.recordId,
                    record: {
                        [of.locationStatus]: { value: C.LOCATION.factory },
                        [of.workStatus]: { value: pendingPreview.targetWork },
                    },
                }
            );

            setStatusMessage(
                '<strong>工場入庫しました</strong><br>'
                + '管理番号: ' + escapeHtml(pendingPreview.manageNo) + '<br>'
                + '現在地: ' + escapeHtml(C.LOCATION.factory) + '<br>'
                + '作業: ' + escapeHtml(pendingPreview.targetWork),
                false
            );

            resetInputFocus();

        } catch (error) {
            console.error('[factory_inbound] PUT', error);
            setStatusMessage('更新エラー: ' + escapeHtml(error.message || String(error)), true);

            if (confirmBtn) {
                confirmBtn.disabled = false;
            }

        } finally {
            isSubmitting = false;
        }

    };

    const injectStyles = () => {

        if (document.getElementById('cayan-factory-inbound-style')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'cayan-factory-inbound-style';
        style.textContent = [
            '.cayan-fi-panel { box-sizing: border-box; width: 100%; max-width: 640px; padding: 16px; border: 1px solid #dfe3e8; border-radius: 8px; background: #f8fafc; font-size: 14px; line-height: 1.5; }',
            '.cayan-fi-title { margin: 0 0 12px; font-size: 18px; font-weight: 700; }',
            '.cayan-fi-label { display: block; margin-bottom: 6px; font-weight: 600; }',
            '.cayan-fi-input { box-sizing: border-box; width: 100%; padding: 8px 10px; font-size: 16px; border: 1px solid #ccc; border-radius: 4px; }',
            '.cayan-fi-hint { margin: 6px 0 12px; color: #666; font-size: 12px; }',
            '.cayan-fi-preview { margin: 12px 0; padding: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 6px; }',
            '.cayan-fi-preview--error { border-color: #f5c2c7; background: #fff5f5; }',
            '.cayan-fi-muted { color: #888; }',
            '.cayan-fi-btn { margin-top: 8px; padding: 10px 20px; font-size: 15px; font-weight: 700; color: #fff; background: #2563eb; border: none; border-radius: 6px; cursor: pointer; }',
            '.cayan-fi-btn:disabled { background: #94a3b8; cursor: not-allowed; }',
            '#cayan-factory-inbound-panel-status { margin-top: 12px; min-height: 1.2em; }',
        ].join('\n');

        document.head.appendChild(style);

    };

    const mountPanel = () => {

        const space = getMountSpace();

        if (!space) {
            console.warn('[factory_inbound] スペース「' + C.UI_SPACE_ID + '」がありません。');
            return;
        }

        if (document.getElementById(PANEL_ID)) {
            return;
        }

        injectStyles();

        space.innerHTML = (
            '<div id="' + PANEL_ID + '" class="cayan-fi-panel">'
            + '<h2 class="cayan-fi-title">工場入庫</h2>'
            + '<label class="cayan-fi-label" for="' + INPUT_ID + '">管理番号</label>'
            + '<input type="text" id="' + INPUT_ID + '" class="cayan-fi-input" autocomplete="off" placeholder="バーコードを読み取る">'
            + '<p class="cayan-fi-hint">スキャン後 Enter、または入力してフォーカスを外すと確認画面が表示されます。</p>'
            + '<div id="' + PANEL_ID + '-preview"></div>'
            + '<button type="button" id="' + CONFIRM_BTN_ID + '" class="cayan-fi-btn" disabled>工場入庫する</button>'
            + '<div id="' + PANEL_ID + '-status"></div>'
            + '</div>'
        );

        const input = document.getElementById(INPUT_ID);
        const confirmBtn = document.getElementById(CONFIRM_BTN_ID);

        input.addEventListener('keydown', (event) => {

            if (event.key !== 'Enter' && event.key !== 'NumpadEnter') {
                return;
            }

            event.preventDefault();
            onLookupManageNo(input.value);

        });

        input.addEventListener('blur', () => {
            window.setTimeout(() => {
                onLookupManageNo(input.value);
            }, 150);
        });

        confirmBtn.addEventListener('click', () => {
            onConfirmInbound();
        });

        renderPreview(null);

        window.setTimeout(() => {
            input.focus();
        }, 200);

    };

    kintone.events.on(['app.record.create.show', 'app.record.edit.show'], (event) => {

        if (C.FACTORY_INBOUND_APP_ID === 0) {
            console.warn('[factory_inbound] FACTORY_INBOUND_APP_ID が 0 です。factory_inbound_config.js を設定してください。');
            return event;
        }

        window.setTimeout(() => {
            mountPanel();

            if (typeof window.CAYANAS_applyFactoryPortalLayout === 'function') {
                window.CAYANAS_applyFactoryPortalLayout();
            }

        }, 300);

        [1200, 3500, 6500].forEach((delayMs) => {
            window.setTimeout(() => {
                if (typeof window.CAYANAS_applyFactoryPortalLayout === 'function') {
                    window.CAYANAS_applyFactoryPortalLayout();
                }
            }, delayMs);
        });

        return event;

    });

}());
