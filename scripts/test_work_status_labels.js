'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../customize/work_status_labels.js'), 'utf8'));

const W = global.CAYANAS_WORK_STATUS;
let failed = 0;
const assert = (name, cond) => {
  if (cond) console.log('OK  ' + name);
  else {
    failed += 1;
    console.error('FAIL ' + name);
  }
};

assert('9 options', W.OPTIONS.length === 9);
assert('first 未着', W.OPTIONS[0] === '未着');
assert('5th しみ抜き中', W.OPTIONS[4] === 'しみ抜き中');
assert('last 仕上げ完了', W.OPTIONS[8] === '仕上げ完了');
assert('App84 is 8', W.APP84_SELECT_OPTIONS.length === 8);
assert('App84 no 仕上げ完了', !W.APP84_SELECT_OPTIONS.includes('仕上げ完了'));
assert('未着手→未着', W.normalize('未着手') === '未着');
assert('しみ抜き待ち→しみ抜き中', W.normalize('しみ抜き待ち') === 'しみ抜き中');
assert('仕上げ待ち→仕上げ中', W.normalize('仕上げ待ち') === '仕上げ中');
assert('equals dual', W.equals('未着手', '未着'));
assert('empty', W.normalize('') === '');

if (failed) process.exit(1);
console.log('\nAll work_status_labels tests passed.');
