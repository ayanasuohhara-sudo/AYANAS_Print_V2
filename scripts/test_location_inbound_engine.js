'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/internal_ops_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/location_inbound_engine.js'), 'utf8'));

const E = global.CAYANAS_LocationInboundEngine;
const C = global.CAYANAS_INTERNAL_OPS;

let failed = 0;

const assert = (name, cond) => {

    if (cond) {
        console.log('OK  ' + name);
        return;
    }

    failed += 1;
    console.error('FAIL ' + name);

};

const snap = (loc, proc, work, del) => ({
    locationStatus: loc,
    processStatus: proc,
    workStatus: work,
    deliveryStatus: del,
});

const factory = E.buildInboundPutRecord('工場', snap('本社', '受注', '丸洗い待ち', '未納品'));
assert('工場入庫 location+process', factory.record.location_status.value === '工場'
    && factory.record.process_status.value === '工場作業中'
    && !factory.record.work_status);

const store = E.buildInboundPutRecord('店舗', snap('工場', '工場作業中', 'しみ抜き待ち', '未納品'));
assert('店舗入庫', store.record.location_status.value === '店舗'
    && store.record.process_status.value === '店舗作業中');

const hq = E.buildInboundPutRecord('本社', snap('工場', '工場作業中', '仕上げ中', '未納品'));
assert('本社入庫 process維持相当', hq.record.location_status.value === '本社'
    && !hq.record.process_status);

const done = E.buildInboundPutRecord('店舗', snap('工場', '完了', '仕上げ完了', '納品待ち'));
assert('完了品 locationのみ', done.record.location_status.value === '店舗'
    && !done.record.process_status && !done.record.work_status && !done.record.delivery_status);

assert('完了判定 work', E.isCompletedForInbound('工場作業中', '仕上げ完了'));

if (failed) {
    process.exit(1);
}

console.log('\nAll location inbound engine tests passed.');
