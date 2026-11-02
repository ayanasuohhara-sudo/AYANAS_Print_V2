(function () {
    'use strict';

    /**
     * 請求書 App 35 — 再作成時に入金・前回請求・繰越を App21/35 から再取得
     * 前提: payment_create.js を先に読み込む（PaymentCreateV2）
     */

    const INVOICE_APP_ID = 35;
    const REFRESH_BUTTON_ID = 'ayanas-invoice-balance-refresh-button';
    const IMPORT_BUTTON_ID = 'ayanas-invoice-import-button';
    const CREATE_BUTTON_ID = 'ayanas-invoice-create-button';

    let isApplying = false;
    let importHookInstalled = false;

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
                window.alert(
                    '入金・前回請求を再取得しました。\n'
                    + `前回請求額（carry_over）: ${applied.carryOver}\n`
                    + `今回入金額（直前請求への充当）: ${applied.paymentAmount}\n`
                    + `未回収残高（参考）: ${applied.carryOverNet ?? 0}`
                );
            }

            return applied;

        } finally {
            isApplying = false;
        }

    };

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

            window.setTimeout(() => {

                void runBalanceRefresh({ silent: true }).catch((error) => {

                    console.warn('[invoice_balance_desktop] auto refresh after import', error);

                });

            }, 800);

        }, true);

    };

    const onShow = (event) => {

        if (!isInvoiceApp()) {
            return event;
        }

        window.setTimeout(() => {
            mountRefreshButton();
            installImportHook();
        }, 0);

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

    console.info('[invoice_balance_desktop] loaded');

}());
