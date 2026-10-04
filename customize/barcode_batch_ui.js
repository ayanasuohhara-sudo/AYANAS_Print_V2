(function () {
    'use strict';

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const injectStyles = (id, rules) => {

        if (document.getElementById(id)) {
            return;
        }

        const style = document.createElement('style');
        style.id = id;
        style.textContent = rules.join('\n');
        document.head.appendChild(style);

    };

    const BATCH_TABLE_CSS = [
        '.cayan-batch-panel { box-sizing:border-box; width:100%; max-width:960px; padding:16px; border:1px solid #cbd5e1; border-radius:8px; background:#fff; font-size:14px; line-height:1.45; }',
        '.cayan-batch-title { margin:0 0 12px; font-size:18px; font-weight:700; }',
        '.cayan-batch-label { display:block; margin:8px 0 4px; font-weight:600; }',
        '.cayan-batch-input { box-sizing:border-box; width:100%; max-width:320px; padding:8px 10px; font-size:16px; border:1px solid #ccc; border-radius:4px; }',
        '.cayan-batch-select { padding:8px 10px; font-size:14px; min-width:200px; }',
        '.cayan-batch-meta { margin:8px 0; color:#444; }',
        '.cayan-batch-table { width:100%; border-collapse:collapse; margin-top:8px; font-size:13px; }',
        '.cayan-batch-table th, .cayan-batch-table td { border:1px solid #e2e8f0; padding:6px 8px; text-align:left; vertical-align:top; }',
        '.cayan-batch-table th { background:#f1f5f9; }',
        '.cayan-batch-err { color:#b00020; font-size:12px; }',
        '.cayan-batch-btn { padding:8px 14px; font-size:14px; font-weight:700; border:none; border-radius:6px; cursor:pointer; margin-top:8px; margin-right:8px; }',
        '.cayan-batch-btn--primary { background:#2563eb; color:#fff; }',
        '.cayan-batch-btn--danger { background:#dc2626; color:#fff; }',
        '.cayan-batch-btn:disabled { background:#94a3b8; cursor:not-allowed; }',
        '.cayan-batch-status { margin-top:12px; min-height:1.2em; }',
        '.cayan-batch-hint { color:#666; font-size:12px; margin:4px 0; }',
    ];

    window.CAYANAS_BarcodeBatchUi = {
        escapeHtml,
        injectStyles,
        BATCH_TABLE_CSS,
    };

}());
