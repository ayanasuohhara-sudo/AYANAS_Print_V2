'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_pickup_shared.js'), 'utf8'));
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

const snap = (opts) => ({
    customerCode: opts.customerCode === undefined ? 'A550' : opts.customerCode,
    locationStatus: opts.loc,
    processStatus: opts.proc,
    workStatus: opts.work,
    deliveryStatus: opts.del,
    deliveryNo: opts.deliveryNo === undefined ? '' : opts.deliveryNo,
});

const factory = E.buildInboundPutRecord('工場', snap({
    loc: '本社',
    proc: '受注',
    work: '丸洗い待ち',
    del: '未納品',
}));
assert('工場入庫 location+process', factory.record.location_status.value === '工場'
    && factory.record.process_status.value === '工場作業中'
    && !factory.record.work_status
    && !factory.record.delivery_status);

const store = E.buildInboundPutRecord('店舗', snap({
    loc: '工場',
    proc: '工場作業中',
    work: 'しみ抜き待ち',
    del: '未納品',
}));
assert('店舗入庫', store.record.location_status.value === '店舗'
    && store.record.process_status.value === '店舗作業中'
    && !store.record.delivery_status);

const hq = E.buildInboundPutRecord('本社', snap({
    loc: '工場',
    proc: '工場作業中',
    work: '仕上げ中',
    del: '未納品',
}));
assert('本社入庫 process維持相当', hq.record.location_status.value === '本社'
    && !hq.record.process_status);

const doneNoSlip = E.buildInboundPutRecord('店舗', snap({
    loc: '工場',
    proc: '完了',
    work: '仕上げ完了',
    del: '納品待ち',
    deliveryNo: '',
}));
assert('完了品・番号なしは locationのみ', doneNoSlip.record.location_status.value === '店舗'
    && !doneNoSlip.record.process_status
    && !doneNoSlip.record.delivery_status);

const doneWithSlip = E.buildInboundPutRecord('店舗', snap({
    loc: '工場',
    proc: '完了',
    work: '仕上げ完了',
    del: '納品待ち',
    deliveryNo: 'N10',
}));
assert('完了品・番号ありは引き取り待ち', doneWithSlip.record.location_status.value === '店舗'
    && doneWithSlip.record.delivery_status.value === '引き取り待ち'
    && !doneWithSlip.record.process_status
    && !doneWithSlip.record.work_status);

const corporate = E.buildInboundPutRecord('店舗', snap({
    customerCode: 'M070',
    loc: '工場',
    proc: '完了',
    work: '仕上げ完了',
    del: '納品待ち',
    deliveryNo: 'N10',
}));
assert('法人は delivery 非更新', corporate.record.location_status.value === '店舗'
    && !corporate.record.delivery_status);

const alreadyAtStore = E.buildInboundPutRecord('店舗', snap({
    loc: '店舗',
    proc: '完了',
    work: '仕上げ完了',
    del: '納品待ち',
    deliveryNo: 'N11',
}));
assert('同一店舗でも納品待ち→引き取り待ち昇格', alreadyAtStore.record
    && alreadyAtStore.record.delivery_status.value === '引き取り待ち'
    && !alreadyAtStore.record.location_status);

const alreadyPickup = E.buildInboundPutRecord('店舗', snap({
    loc: '店舗',
    proc: '完了',
    work: '仕上げ完了',
    del: '引き取り待ち',
    deliveryNo: 'N11',
}));
assert('既に引き取り待ちは skip', alreadyPickup.skipReason === 'same_location');

assert('完了判定 work', E.isCompletedForInbound('工場作業中', '仕上げ完了'));
assert('pickup waiting option in config', C.DELIVERY.pickupWaiting === '引き取り待ち');

if (failed) {
    process.exit(1);
}

console.log('\nAll location inbound engine tests passed.');
