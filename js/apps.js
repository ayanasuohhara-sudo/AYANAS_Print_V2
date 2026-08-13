(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * apps.js
     *
     * 業務アプリ JS を動的読込（manifest desktop/js 上限対策）。
     * 各モジュールは読込時に kintone イベントを登録する。
     */

    const APP_MODULES = [
        'js/apps/invoice_create.js',
        'js/apps/invoice_permission.js',
        'js/apps/batch_history.js',
        'js/apps/bulk_invoice_create.js',
        'js/apps/invoice_index.js',
        'js/apps/payment_create.js',
        'js/apps/receivable_create.js',
        'js/apps/invoice_desktop.js',
        'js/apps/bulk_invoice_create_desktop.js',
        'js/apps/batch_history_index.js',
        'js/apps/payment_desktop.js',
        'js/apps/receivable_index.js',
    ];

    window.AppsReady = Core.loadScripts(APP_MODULES).catch((error) => {
        console.error('[AYANAS Print V3 Apps]', error);
        throw error;
    });

})();
