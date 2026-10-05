'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../customize/internal_ops_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../customize/internal_work_engine.js'), 'utf8'));

const W = global.CAYANAS_InternalWorkEngine;
const C = global.CAYANAS_INTERNAL_OPS;

let failed = 0;

const assert = (name, cond) => {

    if (cond) {
        console.log('OK  ' + name);
    } else {
        failed += 1;
        console.error('FAIL ' + name);
    }

};

const allowedApp84 = [
    '未着手',
    '丸洗い待ち',
    '丸洗い中・乾燥',
    'しみ抜き待ち',
    'しみ抜き中',
    '修理中',
    '再直し中',
    '仕上げ中',
];

allowedApp84.forEach((label) => {
    assert('App84 選択可: ' + label, W.isAllowedWorkSelection(label));
});

assert('not 仕上げ完了', !W.isAllowedWorkSelection('仕上げ完了'));
assert('not 修理・直し中', !W.isAllowedWorkSelection('修理・直し中'));
assert('not 仕上げ待ち', !W.isAllowedWorkSelection('仕上げ待ち'));
assert('WORK_SELECT に仕上げ待ちなし', !C.WORK_SELECT_OPTIONS.includes('仕上げ待ち'));
assert('WORK_SELECT に修理・直し中なし', !C.WORK_SELECT_OPTIONS.includes('修理・直し中'));
assert('WORK_SELECT 件数 8', C.WORK_SELECT_OPTIONS.length === 8);

['修理中', '再直し中'].forEach((label) => {
    const put = W.buildWorkPutRecord(label);

    assert(label + 'を選択できる', put.work_status.value === label);
    assert(label + 'はwork_statusだけ', Object.keys(put).join(',') === 'work_status');
});

try {
    W.buildWorkPutRecord('修理・直し中');
    assert('build 修理・直し中 は throw', false);
} catch (error) {
    assert('build 修理・直し中 は throw', true);
}

try {
    W.buildWorkPutRecord('仕上げ待ち');
    assert('build 仕上げ待ち は throw', false);
} catch (error) {
    assert('build 仕上げ待ち は throw', true);
}

if (failed) {
    process.exit(1);
}

console.log('\nAll internal work engine tests passed.');
