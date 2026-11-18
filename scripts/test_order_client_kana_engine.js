'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/kana_normalize.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/order_client_kana_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/order_client_kana_engine.js'), 'utf8'));

const E = global.CAYANAS_OrderClientKanaEngine;
const C = global.CAYANAS_ORDER_CLIENT_KANA;
const desktop = fs.readFileSync(path.join(root, 'customize/order_client_kana_desktop.js'), 'utf8');

let failed = 0;
const assert = (name, cond) => {
  if (cond) console.log('OK  ' + name);
  else {
    failed += 1;
    console.error('FAIL ' + name);
  }
};

assert('normalize katakana', E.normalizeForSave('ヤマモトキヨコ') === 'やまもときよこ');
assert('normalize spaces', E.normalizeForSave('やまもと きよこ') === 'やまもときよこ');
assert('status options', E.statusOptions().indexOf('確認済') >= 0 && E.statusOptions().indexOf('未確認') >= 0);

const hints = E.buildReadingHints('山本清子', 'ヤマモトキヨコ');
assert('typed hint', hints.some((h) => h.kana === 'やまもときよこ' && h.unconfirmed));
assert('no kanji auto guess', !hints.some((h) => h.source === 'kanji_guess'));

const missing = {
  client_name: { value: '山本' },
};
assert('missing field safe', E.applyToRecord(missing, 'やまもと', '未確認').ok === false);

const present = {
  client_name: { value: '山本清子' },
  client_name_kana: { value: '' },
  client_name_kana_status: { value: '' },
};
const applied = E.applyToRecord(present, 'ヤマモト キヨコ', '確認済');
assert('apply save', applied.ok && present.client_name_kana.value === 'やまもときよこ'
  && present.client_name_kana_status.value === '確認済');

assert('submit does not block without field', desktop.indexOf('missing_field') !== -1);
assert('A550 note present', C.STORE_CUSTOMER_CODE === 'A550');
assert('no bulk put', desktop.indexOf('records.json') === -1);

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('all passed');
