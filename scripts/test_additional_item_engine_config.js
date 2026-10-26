'use strict';

/**
 * additional_item_engine のアプリID・マスタフィールド設定の回帰テスト。
 * （kintone 非依存の設定値のみ検証）
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
global.kintone = {
  api: function () {
    throw new Error('kintone.api should not be called in this test');
  },
  app: {
    getId: function () { return 0; },
  },
};

vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, '../customize/additional_item_engine.js'), 'utf8')
);

const E = global.CAYANAS_AdditionalItemEngine;
let failed = 0;

const assert = (name, cond) => {
  if (cond) {
    console.log('OK  ' + name);
  } else {
    failed += 1;
    console.error('FAIL ' + name);
  }
};

assert('engine loaded', !!E);
assert('VERSION 1.2.1+', typeof E.VERSION === 'string' && E.VERSION >= '1.2.1');
assert('外注加工マスタは App23', E.APP.outsourceProcessing === 23);
assert('App95 ではない', E.APP.outsourceProcessing !== 95);
assert('delivery App19', E.APP.delivery === 19);
assert('outsourceOutbound App27', E.APP.outsourceOutbound === 27);
assert('product App13', E.APP.product === 13);

if (failed) {
  process.exit(1);
}

console.log('\nAll additional_item_engine config tests passed.');
