'use strict';

/**
 * kintone plugin-packer: desktop/js は最大 30 件。
 * 店舗帳票 3 ファイルを store_print_bundle.js に同梱する。
 * invoice_window は templates/invoice.js 末尾へ同梱する。
 *
 * npm prepack から実行。
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function write(rel, body) {
  fs.writeFileSync(path.join(root, rel), body);
  console.log('[bundle-plugin-js]', rel, Buffer.byteLength(body), 'bytes');
}

const payment = read('js/store_print_payment.js');
if (payment.includes('StoreOrderTemplate') || payment.includes('bundled: templates/store_order')) {
  throw new Error('js/store_print_payment.js must be payment-only (not pre-bundled)');
}

write(
  'js/store_print_bundle.js',
  [
    '/* AYANAS store print bundle — generated for kintone desktop/js 30-file limit */',
    '/* Sources: store_print_payment.js + templates/store_order.js + templates/store_delivery.js */',
    payment,
    '',
    '/* ===== store_order ===== */',
    read('js/templates/store_order.js'),
    '',
    '/* ===== store_delivery ===== */',
    read('js/templates/store_delivery.js'),
    '',
  ].join('\n')
);

const invoice = read('js/templates/invoice.js');
const windowSrc = read('js/templates/invoice_window.js');
const marker = 'InvoiceWindowTemplate（manifest 30件制限のため invoice.js に同梱）';

if (!invoice.includes('window.InvoiceWindowTemplate') && !invoice.includes(marker)) {
  write(
    'js/templates/invoice.js',
    invoice.replace(/\s*$/, '')
      + '\n\n/* ===== '
      + marker
      + ' ===== */\n'
      + windowSrc
      + '\n'
  );
} else {
  console.log('[bundle-plugin-js] invoice.js already includes InvoiceWindowTemplate');
}
