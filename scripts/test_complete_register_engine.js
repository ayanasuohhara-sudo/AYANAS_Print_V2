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

const rec = R.buildCompletePutRecord();

assert('process 完了', rec.process_status.value === C.PROCESS.complete);
assert('work 仕上げ完了', rec.work_status.value === C.WORK.finishDone);
assert('delivery 納品待ち', rec.delivery_status.value === C.DELIVERY.waiting);
assert('location なし', !rec.location_status);

if (failed) {
    process.exit(1);
}

console.log('\nAll complete register engine tests passed.');
