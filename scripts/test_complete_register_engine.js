'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../customize/internal_ops_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../customize/complete_register_engine.js'), 'utf8'));

const R = global.CAYANAS_CompleteRegisterEngine;
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

const rec = R.buildCompletePutRecord(new Date(2026, 9, 5, 23, 30, 0));
const keys = Object.keys(rec);

assert('process 完了', rec.process_status.value === C.PROCESS.complete);
assert('work 仕上げ完了', rec.work_status.value === C.WORK.finishDone);
assert('delivery 納品待ち', rec.delivery_status.value === C.DELIVERY.waiting);
assert('completion_date 当日', rec.completion_date.value === '2026-10-05');
assert('location なし', !rec.location_status);
assert('PUT項目は4つ', keys.length === 4
    && keys.indexOf('process_status') !== -1
    && keys.indexOf('work_status') !== -1
    && keys.indexOf('delivery_status') !== -1
    && keys.indexOf('completion_date') !== -1);

if (failed) {
    process.exit(1);
}

console.log('\nAll complete register engine tests passed.');
