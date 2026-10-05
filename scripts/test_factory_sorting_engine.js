'use strict';

/**
 * node scripts/test_factory_sorting_engine.js
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
    fs.readFileSync(path.join(root, 'customize/factory_sorting_engine.js'), 'utf8'),
    { filename: 'factory_sorting_engine.js' }
);

const S = global.CAYANAS_FactorySortingEngine;
const C = global.CAYANAS_FACTORY_INBOUND;

let failed = 0;

const assert = (name, cond) => {

    if (cond) {
        console.log('OK  ' + name);
        return;
    }

    failed += 1;
    console.error('FAIL ' + name);

};

assert('eligible 工場+未着手', S.isEligibleForSorting('工場', '未着手'));
assert('ineligible 工場+丸洗い待ち', !S.isEligibleForSorting('工場', '丸洗い待ち'));
assert('ineligible 店舗+しみ抜き待ち', !S.isEligibleForSorting('店舗', 'しみ抜き待ち'));

const maru = S.getPutTargetsForAction(S.ACTION.maru);
assert('ケース1 丸洗い PUT', maru.locationStatus === '工場' && maru.workStatus === '丸洗い待ち');

const store = S.getPutTargetsForAction(S.ACTION.storeShimi);
assert('ケース2 店舗しみ PUT', store.locationStatus === '店舗' && store.workStatus === 'しみ抜き待ち');

const finish = S.getPutTargetsForAction(S.ACTION.finish);
assert('ケース3 仕上げ PUT', finish.locationStatus === '工場' && finish.workStatus === '仕上げ待ち');

assert(
    'ケース4 メッセージ',
    S.buildIneligibleMessage('工場', '丸洗い待ち').indexOf('未着手') >= 0
);

assert(
    'ケース5 メッセージ',
    S.buildIneligibleMessage('店舗', 'しみ抜き待ち').indexOf('工場') >= 0
);

const stale = S.buildStaleStateMessage('店舗', 'しみ抜き待ち');
assert('ケース6 stale', stale.indexOf('すでに変更') >= 0);

if (failed > 0) {
    process.exit(1);
}

console.log('\nAll sorting engine tests passed.');
