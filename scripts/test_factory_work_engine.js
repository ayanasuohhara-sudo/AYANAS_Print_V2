'use strict';

/**
 * node scripts/test_factory_work_engine.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

global.window = global;

vm.runInThisContext(
    fs.readFileSync(path.join(root, 'customize/factory_inbound_config.js'), 'utf8'),
    { filename: 'factory_inbound_config.js' }
);

vm.runInThisContext(
    fs.readFileSync(path.join(root, 'customize/factory_work_engine.js'), 'utf8'),
    { filename: 'factory_work_engine.js' }
);

const W = global.CAYANAS_FactoryWorkEngine;
const A = W.ACTION;

let failed = 0;

const assert = (name, cond) => {

    if (cond) {
        console.log('OK  ' + name);
        return;
    }

    failed += 1;
    console.error('FAIL ' + name);

};

assert('ケース1 丸洗い開始可能', W.canPerformAction(A.maruStart, '工場', '丸洗い待ち'));
assert(
    'ケース1 PUT先',
    W.getNextWorkStatusForAction(A.maruStart) === '丸洗い中'
);

assert('ケース2 丸洗い完了可能', W.canPerformAction(A.maruComplete, '工場', '丸洗い中'));
assert(
    'ケース2 PUT先',
    W.getNextWorkStatusForAction(A.maruComplete) === '仕上げ待ち'
);

assert('ケース3 仕上げ完了可能', W.canPerformAction(A.finishComplete, '工場', '仕上げ待ち'));
assert(
    'ケース3 PUT先',
    W.getNextWorkStatusForAction(A.finishComplete) === '仕上げ完了'
);

const done = W.resolveWorkUiState('工場', '仕上げ完了');
assert('ケース4 仕上げ完了済み', done.uiState === W.UI_STATE.finishDone && !done.enabledAction);

const sort = W.resolveWorkUiState('工場', '未着手');
assert('ケース5 未着手', sort.uiState === W.UI_STATE.sortPending && sort.message.indexOf('振り分け') >= 0);

const store = W.resolveWorkUiState('店舗', 'しみ抜き待ち');
assert('ケース6 店舗', store.uiState === W.UI_STATE.notFactory);

assert(
    'ケース7 stale文言',
    W.buildStaleStateMessage('工場', '丸洗い中').indexOf('すでに変更') >= 0
);

assert(
    'ケース8 丸洗い待ち→仕上げ完了不可',
    !W.canPerformAction(A.finishComplete, '工場', '丸洗い待ち')
);

assert(
    'ケース8b 丸洗い待ち→丸洗い完了不可',
    !W.canPerformAction(A.maruComplete, '工場', '丸洗い待ち')
);

if (failed > 0) {
    process.exit(1);
}

console.log('\nAll factory work engine tests passed.');
