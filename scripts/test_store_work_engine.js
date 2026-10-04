'use strict';

/**
 * node scripts/test_store_work_engine.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

global.window = global;

vm.runInThisContext(
    fs.readFileSync(path.join(root, 'customize/store_work_config.js'), 'utf8'),
    { filename: 'store_work_config.js' }
);

vm.runInThisContext(
    fs.readFileSync(path.join(root, 'customize/store_work_engine.js'), 'utf8'),
    { filename: 'store_work_engine.js' }
);

const S = global.CAYANAS_StoreWorkEngine;
const A = S.ACTION;

let failed = 0;

const assert = (name, cond) => {

    if (cond) {
        console.log('OK  ' + name);
        return;
    }

    failed += 1;
    console.error('FAIL ' + name);

};

const startTargets = S.getPutTargetsForAction(A.shimiStart);
assert('しみ抜き開始', startTargets.locationStatus === '店舗' && startTargets.workStatus === 'しみ抜き中');
assert('開始 canPerform', S.canPerformAction(A.shimiStart, '店舗', 'しみ抜き待ち'));

const completeTargets = S.getPutTargetsForAction(A.shimiCompleteToFactory);
assert('完了・工場', completeTargets.locationStatus === '工場' && completeTargets.workStatus === '仕上げ待ち');
assert('完了 canPerform', S.canPerformAction(A.shimiCompleteToFactory, '店舗', 'しみ抜き中'));

assert('工場は対象外', !S.canPerformAction(A.shimiStart, '工場', 'しみ抜き待ち'));
assert('待ちから完了不可', !S.canPerformAction(A.shimiCompleteToFactory, '店舗', 'しみ抜き待ち'));
assert('店舗・その他', S.resolveWorkUiState('店舗', '丸洗い待ち').enabledAction === null);

assert('stale', S.buildStaleStateMessage('工場', '仕上げ待ち').indexOf('すでに変更') >= 0);

if (failed > 0) {
    process.exit(1);
}

console.log('\nAll store work engine tests passed.');
