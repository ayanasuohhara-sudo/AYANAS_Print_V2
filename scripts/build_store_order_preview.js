'use strict';

/**
 * 店舗受注表（切り取り式）ローカルプレビュー HTML を生成する。
 * node scripts/build_store_order_preview.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;

global.Format = {
  escapeHtml: (v) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;'),
  formatMoney: (v) => {
    const n = Number(v) || 0;
    return n.toLocaleString('ja-JP');
  },
  formatDate: (v) => String(v ?? '').slice(0, 10),
};
global.Validation = {
  assertDetailReportData: (data) => {
    if (!data || !data.header) {
      throw new Error('invalid data');
    }
  },
};
global.Common = {
  getBodyClass: (layout) => 'report-' + (layout && layout.reportType || 'x'),
  buildDocumentHtml: ({ title, bodyClass, content }) => (
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>'
    + title
    + '</title></head><body class="'
    + bodyClass
    + '">'
    + content
    + '</body></html>'
  ),
};
global.TemplateInterface = {
  create: (name, fn) => ({ name: name, render: fn }),
};

vm.runInThisContext(fs.readFileSync(path.join(root, 'js/templates/store_order.js'), 'utf8'));

const css = fs.readFileSync(path.join(root, 'css/print.css'), 'utf8');
const bodyHtml = global.StoreOrderTemplate.render({
  header: {
    manage_no: 'TSP801856P',
    client_name: '[TEST]山田花子',
    pcm_customer_name: '[TEST]山田花子',
    personal_customer_id: 'P000002',
    kimono_type: '小紋',
    kimono_spec: '袷',
    deadline: '2026-11-10',
    order_date: '2026-11-02',
    customer_code: 'A550',
    payment_state: '一部入金',
    payment_exclusive: 5000,
    payment_tax: 500,
    payment_billed_inclusive: 5500,
    payment_paid: 2000,
    payment_balance: 3500,
  },
  details: [
    { item_name: '丸洗い', amount: 3000 },
    { item_name: 'しみぬき', amount: 2000 },
  ],
  summary: {},
}, {}, { reportType: 'store_order' });

const inner = bodyHtml
  .replace(/^[\s\S]*<body[^>]*>/i, '')
  .replace(/<\/body>[\s\S]*$/i, '');

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>店舗受注表プレビュー（切り取り式 v146）</title>
<style>
${css}
@page { size: A4 portrait; margin: 0; }
body { margin: 0; background: #cbd5e1; }
.preview-shell { max-width: 210mm; margin: 12px auto; background: #fff; box-shadow: 0 8px 24px rgba(15,23,42,.25); }
.preview-toolbar { padding: 10px 14px; background: #0f172a; color: #fff; font: 13px/1.4 sans-serif; }
.preview-toolbar button { margin-left: 8px; }
</style>
<script src="/lib/JsBarcode.all.min.js"></script>
</head>
<body class="report-store-order">
<div class="preview-toolbar">
  店舗受注表・切り取り式プレビュー（印刷倍率 100% / A4縦）
  <button type="button" onclick="window.print()">印刷</button>
</div>
<div class="preview-shell">
${inner}
</div>
<script>
(function () {
  if (typeof JsBarcode !== 'function') return;
  document.querySelectorAll('.store-order-barcode__svg').forEach(function (svg) {
    var value = svg.getAttribute('data-barcode-value') || '';
    if (!value) return;
    JsBarcode(svg, value, {
      format: 'CODE39',
      displayValue: false,
      height: 42,
      width: 1.4,
      margin: 4,
      background: '#ffffff',
      lineColor: '#000000'
    });
  });
})();
</script>
</body>
</html>
`;

const outDir = path.join(root, 'docs/artifacts/store_print_preview');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'store_order_cut_ticket_preview.html');
fs.writeFileSync(outPath, html);
console.log('Wrote', outPath);
