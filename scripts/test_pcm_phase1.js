'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;
global.kintone = {};

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/pcm_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/pcm_numbering.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/pcm_engine.js'), 'utf8'));

const C = global.CAYANAS_PCM;
const N = global.CAYANAS_PCM_Numbering;
const E = global.CAYANAS_PCM_Engine;

let failed = 0;
const assert = (name, cond) => {
  if (cond) {
    console.log('OK  ' + name);
    return;
  }
  failed += 1;
  console.error('FAIL ' + name);
};

assert('config version', !!C.VERSION);
assert('PCM_APP_ID is 96', C.PCM_APP_ID === 96);
assert('COUNTER_APP_ID is 95', C.COUNTER_APP_ID === 95);
assert('format P000001', N.formatPersonalCustomerId(1) === 'P000001');
assert('format P000012', N.formatPersonalCustomerId(12) === 'P000012');
assert('valid id', N.isValidPersonalCustomerId('P000001') === true);
assert('invalid id', N.isValidPersonalCustomerId('A550') === false);

const q = E.buildSearchQuery({ customerName: '山田', phone: '090' });
assert('search query has name', q.indexOf('customer_name like "山田"') >= 0);
assert('search query has phone', q.indexOf('phone like "090"') >= 0);
assert('empty criteria', E.buildSearchQuery({}) === '');

assert('phone normalize', E.normalizePhone('090-1234-5678') === '09012345678');
assert('no auto-merge helpers exported as merge', typeof E.mergeCustomers === 'undefined');

if (failed > 0) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('all passed');
