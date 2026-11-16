(function () {
    'use strict';

    /**
     * 請求書 App 35 — 前回請求額・入金の自動引き継ぎ
     * 前提: payment_create.js を先に読み込む（PaymentCreateV2）
     * INVOICE_BALANCE_JS_VERSION: 1.1.0
     *
     * トリガー:
     * - 新規作成・編集画面表示（customer_code あり）
     * - 請求先コード変更
     * - 未請求データ取込完了後
     * - 請求書作成ボタン実行直前
     * - 手動「入金・繰越を再取得」
     * - InvoiceCreate / BulkInvoiceCreate が存在する場合は一括作成の 0 固定をパッチ
     */

    const INVOICE_BALANCE_JS_VERSION = '1.1.0';
    const INVOICE_APP_ID = 35;
    const REFRESH_BUTTON_ID = 'ayanas-invoice-balance-refresh-button';
    const IMPORT_BUTTON_ID = 'ayanas-invoice-import-button';
    const CREATE_BUTTON_ID = 'ayanas-invoice-create-button';

    let isApplying = false;
    let importHookInstalled = false;
    let createHookInstalled = false;
    let invoiceCreatePatched = false;
    let bulkPatched = false;
    let patchTimer = null;

    const InvoiceBalanceDesktop = {
        VERSION: INVOICE_BALANCE_JS_VERSION,
    };

    const isInvoiceApp = () => {

        if (typeof kintone === 'undefined' || typeof kintone.app?.getId !== 'function') {
            return false;
        }

        return kintone.app.getId() === INVOICE_APP_ID;

    };

    const assertPaymentModule = () => {

        if (typeof PaymentCreateV2 === 'undefined') {
            throw new Error('PaymentCreateV2 が読み込まれていません。payment_create.js を先に設定してください。');
        }

    };

    const getFieldValue = (record, fieldCode) => {

        const field = record?.[fieldCode];

        if (!field || field.value === null || field.value === undefined) {
            return '';
        }

        return field.value;

    };

    const getCustomerCode = (record) => {

        const fields = PaymentCreateV2.INVOICE_FIELDS;

        return String(getFieldValue(record, fields.customerCode)).trim();

    };

    const getExcludeInvoiceNo = (record) => {

        const fields = PaymentCreateV2.INVOICE_FIELDS;

        return String(getFieldValue(record, fields.invoiceNo)).trim();

    };

    const applyRefreshToScreen = (applied) => {

        const fields = PaymentCreateV2.INVOICE_FIELDS;
        const updates = {
            [fields.carryOver]: { value: String(applied.carryOver) },
            [fields.paymentAmount]: { value: String(applied.paymentAmount) },
        };

        const currentRecord = kintone.app.record.get().record ?? {};

        if (currentRecord[fields.displayLastInvoiceAmount]) {
            updates[fields.displayLastInvoiceAmount] = {
                value: String(applied.displayLastInvoiceAmount ?? applied.carryOver),
            };
        }

        if (currentRecord[fields.lastInvoiceAmount]) {
            updates[fields.lastInvoiceAmount] = {
                value: String(applied.lastInvoiceAmount ?? applied.carryOver),
            };
        }

        if (currentRecord[fields.balance]) {
            updates[fields.balance] = { value: String(applied.balance) };
        }

        kintone.app.record.set({ record: updates });

    };

    const runBalanceRefresh = async (options = {}) => {

        assertPaymentModule();

        const { record } = kintone.app.record.get();
        const customerCode = getCustomerCode(record);

        if (!customerCode) {
            if (options.silent) {
                return null;
            }

            window.alert('請求先コードを入力してから実行してください。');

            return null;
        }

        isApplying = true;

        try {

            const applied = await PaymentCreateV2.refreshInvoiceHeaderFromPayments(record, {
                excludeInvoiceNo: getExcludeInvoiceNo(record),
            });

            applyRefreshToScreen(applied);

            if (!options.silent) {
                const lines = [
                    '入金・前回請求を再取得しました。',
                    `前回請求額（carry_over）: ${applied.carryOver}`,
                    `今回入金額（直前請求への充当）: ${applied.paymentAmount}`,
                    `繰越額: ${applied.carryForwardAmount ?? (applied.carryOver - applied.paymentAmount)}`,
                    `未回収残高（参考）: ${applied.carryOverNet ?? 0}`,
                ];

                if (applied.priorInvoiceNo) {
                    lines.push(
                        `参照請求: ${applied.priorInvoiceNo}`
                        + (applied.priorInvoiceDate ? `（${applied.priorInvoiceDate}）` : '')
                        + (applied.priorInvoiceStatus ? ` [${applied.priorInvoiceStatus}]` : '')
                    );
                }

                if (applied.skippedUnconfirmedPrior && applied.unconfirmedInvoiceNo) {
                    lines.push(`未確定請求をスキップ: ${applied.unconfirmedInvoiceNo}`);
                }

                if (applied.note) {
                    lines.push(applied.note);
                }

                window.alert(lines.join('\n'));
            }

            return applied;

        } finally {
            isApplying = false;
        }

    };

    InvoiceBalanceDesktop.refresh = runBalanceRefresh;

    const createRefreshButton = () => {

        const button = document.createElement('button');

        button.id = REFRESH_BUTTON_ID;
        button.type = 'button';
        button.textContent = '入金・繰越を再取得';
        button.className = 'ayanas-invoice-balance-refresh-button';
        button.style.marginLeft = '8px';
        button.addEventListener('click', () => {

            void runBalanceRefresh().catch((error) => {

                console.error('[invoice_balance_desktop]', error);
                window.alert(`再取得に失敗しました。\n${error.message ?? error}`);

            });

        });

        return button;

    };

    const mountRefreshButton = () => {

        if (document.getElementById(REFRESH_BUTTON_ID)) {
            return;
        }

        const anchor = document.getElementById(IMPORT_BUTTON_ID)
            || document.getElementById(CREATE_BUTTON_ID)
            || kintone.app.record.getSpaceElement('ayanas-invoice-create-actions');

        if (!anchor?.parentElement) {
            return;
        }

        anchor.parentElement.appendChild(createRefreshButton());

    };

    /**
     * 取込完了後に再取得。InvoiceCreate.importUninvoicedData をラップできれば完了後に実行。
     * フォールバック: 取込ボタン click 後、明細反映を待ってから再取得。
     */
    const scheduleRefreshAfterImport = () => {

        const startedAt = Date.now();
        const fields = PaymentCreateV2.INVOICE_FIELDS;
        const beforeTotal = String(
            getFieldValue(kintone.app.record.get().record, fields.total) || ''
        );

        const tryRefresh = async () => {

            try {
                await runBalanceRefresh({ silent: true });
            } catch (error) {
                console.warn('[invoice_balance_desktop] auto refresh after import', error);
            }

        };

        const poll = () => {

            const record = kintone.app.record.get().record;
            const total = String(getFieldValue(record, fields.total) || '');
            const table = record[fields.detailTable || 'invoice_detail'];
            const rows = Array.isArray(table?.value) ? table.value : [];
            const changed = total !== beforeTotal || rows.length > 0;

            if (changed || Date.now() - startedAt > 15000) {
                void tryRefresh();
                return;
            }

            window.setTimeout(poll, 400);

        };

        window.setTimeout(poll, 500);

    };

    const installImportHook = () => {

        if (importHookInstalled) {
            return;
        }

        importHookInstalled = true;

        document.addEventListener('click', (event) => {

            const target = event.target;

            if (!(target instanceof HTMLElement)) {
                return;
            }

            const button = target.closest(`#${IMPORT_BUTTON_ID}`);

            if (!button) {
                return;
            }

            scheduleRefreshAfterImport();

        }, true);

    };

    /**
     * 請求書作成ボタン: 作成処理の前に最新繰越・入金を画面へ反映。
     * capture で一度止め、再取得後に pass フラグ付きで再クリックして元ハンドラへ渡す。
     */
    const installCreateHook = () => {

        if (createHookInstalled) {
            return;
        }

        createHookInstalled = true;

        document.addEventListener('click', (event) => {

            const target = event.target;

            if (!(target instanceof HTMLElement)) {
                return;
            }

            const button = target.closest(`#${CREATE_BUTTON_ID}`);

            if (!button) {
                return;
            }

            if (button.dataset.ayanasCarryPass === '1') {
                button.dataset.ayanasCarryPass = '0';
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();

            void (async () => {

                try {
                    await runBalanceRefresh({ silent: true });
                } catch (error) {
                    console.warn('[invoice_balance_desktop] refresh before create', error);
                }

                button.dataset.ayanasCarryPass = '1';
                button.click();

            })();

        }, true);

    };

    const patchInvoiceCreateModule = () => {

        if (invoiceCreatePatched || typeof InvoiceCreate === 'undefined') {
            return false;
        }

        assertPaymentModule();

        if (typeof InvoiceCreate.buildMonthlyInvoiceRecord === 'function') {

            const originalBuild = InvoiceCreate.buildMonthlyInvoiceRecord.bind(InvoiceCreate);

            InvoiceCreate.buildMonthlyInvoiceRecord = (args) => {

                const payload = originalBuild(args);
                const customerCode = String(args?.customerCode ?? '').trim();

                // 同期 API 互換のため payload に Promise を付与。一括側で await する。
                payload.__ayanasHeaderEnrichPromise = PaymentCreateV2
                    .enrichRestPayloadWithHeaderRefresh(payload, customerCode, {
                        excludeInvoiceNo: String(args?.invoiceNo ?? '').trim(),
                    })
                    .then((result) => result.payload)
                    .catch((error) => {
                        console.warn('[invoice_balance_desktop] monthly carry enrich failed', error);
                        return payload;
                    });

                return payload;

            };

        }

        if (typeof InvoiceCreate.buildInvoiceCompletion === 'function') {

            const originalCompletion = InvoiceCreate.buildInvoiceCompletion.bind(InvoiceCreate);

            InvoiceCreate.buildInvoiceCompletion = async (record) => {

                try {
                    await PaymentCreateV2.refreshInvoiceHeaderFromPayments(record, {
                        excludeInvoiceNo: String(
                            getFieldValue(record, PaymentCreateV2.INVOICE_FIELDS.invoiceNo)
                        ).trim(),
                    });
                } catch (error) {
                    console.warn('[invoice_balance_desktop] completion refresh failed', error);
                }

                return originalCompletion(record);

            };

        }

        if (typeof InvoiceCreate.importUninvoicedData === 'function') {

            const originalImport = InvoiceCreate.importUninvoicedData.bind(InvoiceCreate);

            InvoiceCreate.importUninvoicedData = async (...args) => {

                const result = await originalImport(...args);

                window.setTimeout(() => {
                    void runBalanceRefresh({ silent: true }).catch((error) => {
                        console.warn('[invoice_balance_desktop] post-import refresh', error);
                    });
                }, 0);

                return result;

            };

        }

        invoiceCreatePatched = true;
        console.info('[invoice_balance_desktop] InvoiceCreate patched for carry-over');

        return true;

    };

    const patchBulkInvoiceCreateModule = () => {

        if (bulkPatched || typeof BulkInvoiceCreate === 'undefined') {
            return false;
        }

        if (typeof BulkInvoiceCreate.run !== 'function') {
            return false;
        }

        assertPaymentModule();

        const originalRun = BulkInvoiceCreate.run.bind(BulkInvoiceCreate);

        BulkInvoiceCreate.run = async (options) => {

            // buildMonthly が付与する enrich Promise を、POST 前に消化できるよう
            // createInvoiceRecord 相当をラップ（Bulk 実装差吸収）
            const ensurePayloadEnriched = async (payload) => {

                if (payload && payload.__ayanasHeaderEnrichPromise) {
                    await payload.__ayanasHeaderEnrichPromise;
                    delete payload.__ayanasHeaderEnrichPromise;
                } else if (payload) {
                    const code = String(payload.customer_code?.value ?? '').trim();
                    if (code) {
                        await PaymentCreateV2.enrichRestPayloadWithHeaderRefresh(payload, code, {
                            excludeInvoiceNo: String(payload.invoice_no?.value ?? '').trim(),
                        });
                    }
                }

                return payload;

            };

            if (typeof InvoiceCreate !== 'undefined'
                && typeof InvoiceCreate.buildMonthlyInvoiceRecord === 'function'
                && !InvoiceCreate.__ayanasBulkEnrichWrapped) {

                const build = InvoiceCreate.buildMonthlyInvoiceRecord.bind(InvoiceCreate);

                InvoiceCreate.buildMonthlyInvoiceRecord = (args) => {
                    const payload = build(args);
                    // enrich promise already attached by patchInvoiceCreateModule
                    return payload;
                };

                InvoiceCreate.__ayanasBulkEnrichWrapped = true;
            }

            // kintone POST を一時ラップして enrich 完了を待つ
            const originalApi = kintone.api;
            const wrappedApi = async (url, method, body) => {

                const path = typeof url === 'string' ? url : String(url);
                const isRecordPost = method === 'POST'
                    && body
                    && body.record
                    && path.indexOf('/k/v1/record') !== -1
                    && Number(body.app) === INVOICE_APP_ID;

                if (isRecordPost) {
                    await ensurePayloadEnriched(body.record);
                }

                return originalApi(url, method, body);

            };

            wrappedApi.url = originalApi.url;
            kintone.api = wrappedApi;

            try {
                return await originalRun(options);
            } finally {
                kintone.api = originalApi;
            }

        };

        bulkPatched = true;
        console.info('[invoice_balance_desktop] BulkInvoiceCreate patched for carry-over');

        return true;

    };

    const tryPatchInvoiceModules = () => {

        try {
            patchInvoiceCreateModule();
            patchBulkInvoiceCreateModule();
        } catch (error) {
            console.warn('[invoice_balance_desktop] patch failed', error);
        }

        if ((!invoiceCreatePatched || !bulkPatched) && !patchTimer
            && typeof window.setInterval === 'function') {
            let attempts = 0;
            patchTimer = window.setInterval(() => {
                attempts += 1;
                patchInvoiceCreateModule();
                patchBulkInvoiceCreateModule();
                if ((invoiceCreatePatched && bulkPatched) || attempts > 40) {
                    window.clearInterval(patchTimer);
                    patchTimer = null;
                }
            }, 250);
        }

    };

    const onShow = (event) => {

        if (!isInvoiceApp()) {
            return event;
        }

        tryPatchInvoiceModules();

        window.setTimeout(() => {
            mountRefreshButton();
            installImportHook();
            installCreateHook();
        }, 0);

        const customerCode = getCustomerCode(event.record || {});

        if (customerCode && !isApplying) {
            window.setTimeout(() => {
                void runBalanceRefresh({ silent: true }).catch((error) => {
                    console.warn('[invoice_balance_desktop] show refresh', error);
                });
            }, 300);
        }

        return event;

    };

    const onCustomerChange = (event) => {

        if (!isInvoiceApp() || isApplying) {
            return event;
        }

        window.setTimeout(() => {

            void runBalanceRefresh({ silent: true }).catch((error) => {

                console.warn('[invoice_balance_desktop] customer change refresh', error);

            });

        }, 0);

        return event;

    };

    kintone.events.on([
        'app.record.create.show',
        'app.record.edit.show',
    ], onShow);

    kintone.events.on([
        'app.record.create.change.customer_code',
        'app.record.edit.change.customer_code',
    ], onCustomerChange);

    // 一覧の一括作成画面などでもパッチを試みる
    if (typeof kintone !== 'undefined' && kintone.events?.on) {
        kintone.events.on(['app.record.index.show'], () => {
            tryPatchInvoiceModules();
            return undefined;
        });
    }

    window.InvoiceBalanceDesktop = InvoiceBalanceDesktop;
    tryPatchInvoiceModules();

    console.info(`[invoice_balance_desktop] loaded ${INVOICE_BALANCE_JS_VERSION}`);

}());
