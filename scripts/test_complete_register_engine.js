'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../customize/internal_ops_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../customize/complete_register_engine.js'), 'utf8'));

const R = global.CAYANAS_CompleteRegisterEngine;
const C = global.CAYANAS_INTERNAL_OPS;
const MODE = R.BULK_MODE;

let failed = 0;

const assert = (name, cond) => {

    if (cond) {
        console.log('OK  ' + name);
    } else {
        failed += 1;
        console.error('FAIL ' + name);
    }

};

const snap = (opts) => ({
    recordId: '1',
    manageNo: 'M001',
    customerName: '顧客',
    clientName: 'お客様',
    kimonoType: '振袖',
    locationStatus: opts.location || '工場',
    processStatus: opts.process || '工場作業中',
    workStatus: opts.work || '仕上げ中',
    deliveryStatus: opts.delivery || '納品待ち',
    completionDate: opts.completionDate || '',
});

/* --- 既存: buildCompletePutRecord 無引数互換 --- */
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

/* --- パターンA: 完了登録のみ --- */
const putA = R.buildBulkPutRecord({ mode: MODE.complete, date: new Date(2026, 9, 5) });
assert('A location なし', !putA.location_status);
assert('A process 完了', putA.process_status.value === C.PROCESS.complete);
assert('A work 仕上げ完了', putA.work_status.value === C.WORK.finishDone);
assert('A delivery 納品待ち', putA.delivery_status.value === C.DELIVERY.waiting);

const planASkip = R.planBulkItemAction({
    mode: MODE.complete,
    snapshot: snap({ process: '完了', location: '本社' }),
});
assert('A 完了済みは skip', planASkip.action === 'skip');

const planAPut = R.planBulkItemAction({
    mode: MODE.complete,
    snapshot: snap({ process: '工場作業中', location: '工場' }),
});
assert('A 未完了は put', planAPut.action === 'put' && !planAPut.putRecord.location_status);

/* --- パターンB: 完了＋保管場所 --- */
const putB = R.buildBulkPutRecord({
    mode: MODE.completeWithLocation,
    location: '本社',
    date: new Date(2026, 9, 5),
});
assert('B location 本社', putB.location_status.value === '本社');
assert('B process 完了', putB.process_status.value === C.PROCESS.complete);
assert('B 項目5つ', Object.keys(putB).length === 5);

const planBNew = R.planBulkItemAction({
    mode: MODE.completeWithLocation,
    location: '本社',
    snapshot: snap({ process: '工場作業中', location: '工場' }),
});
assert('B 未完了は完了+location', planBNew.action === 'put'
    && planBNew.putRecord.process_status
    && planBNew.putRecord.location_status.value === '本社');

const planBDoneMove = R.planBulkItemAction({
    mode: MODE.completeWithLocation,
    location: '店舗',
    snapshot: snap({ process: '完了', location: '本社', work: '仕上げ完了' }),
});
assert('B 完了済みで場所違いは locationのみ', planBDoneMove.action === 'put'
    && planBDoneMove.putRecord.location_status.value === '店舗'
    && !planBDoneMove.putRecord.process_status);

const planBDoneSame = R.planBulkItemAction({
    mode: MODE.completeWithLocation,
    location: '本社',
    snapshot: snap({ process: '完了', location: '本社', work: '仕上げ完了' }),
});
assert('B 完了済み同場所は skip', planBDoneSame.action === 'skip');

/* --- パターンC: 保管場所のみ --- */
const putC = R.buildBulkPutRecord({ mode: MODE.locationOnly, location: '工場' });
assert('C location のみ', Object.keys(putC).length === 1
    && putC.location_status.value === '工場'
    && !putC.process_status
    && !putC.work_status
    && !putC.delivery_status);

const planCMove = R.planBulkItemAction({
    mode: MODE.locationOnly,
    location: '工場',
    snapshot: snap({ process: '工場作業中', location: '本社' }),
});
assert('C 異場所は put locationのみ', planCMove.action === 'put'
    && planCMove.putRecord.location_status.value === '工場'
    && !planCMove.putRecord.process_status);

const planCSame = R.planBulkItemAction({
    mode: MODE.locationOnly,
    location: '工場',
    snapshot: snap({ process: '工場作業中', location: '工場' }),
});
assert('C 同場所は skip', planCSame.action === 'skip');

/* --- 納品済ブロック --- */
const planDelivered = R.planBulkItemAction({
    mode: MODE.complete,
    snapshot: snap({ process: '完了', delivery: '納品済', location: '本社' }),
});
assert('納品済は fail', planDelivered.action === 'fail');

const planDeliveredLoc = R.planBulkItemAction({
    mode: MODE.locationOnly,
    location: '店舗',
    snapshot: snap({ process: '完了', delivery: '納品済', location: '本社' }),
});
assert('納品済は場所変更も fail', planDeliveredLoc.action === 'fail');

/* --- バリデーション --- */
assert('完了のみは場所不要', R.validateBulkSelection(MODE.complete, '').ok);
assert('完了+場所は場所必須', !R.validateBulkSelection(MODE.completeWithLocation, '').ok);
assert('場所のみは場所必須', !R.validateBulkSelection(MODE.locationOnly, '').ok);
assert('完了+場所 本社OK', R.validateBulkSelection(MODE.completeWithLocation, '本社').ok);

/* --- isPutApplied --- */
const afterComplete = {
    process_status: { value: '完了' },
    work_status: { value: '仕上げ完了' },
    delivery_status: { value: '納品待ち' },
    completion_date: { value: '2026-10-05' },
    location_status: { value: '工場' },
};
assert('isPutApplied A', R.isPutApplied(afterComplete, putA));
assert('isPutApplied C', R.isPutApplied(
    { location_status: { value: '工場' }, process_status: { value: '工場作業中' } },
    putC
));
assert('isCompletePutApplied 互換', R.isCompletePutApplied(afterComplete, rec));

/* --- B 工場/店舗 --- */
['工場', '本社', '店舗'].forEach((loc) => {
    const put = R.buildBulkPutRecord({
        mode: MODE.completeWithLocation,
        location: loc,
        date: new Date(2026, 9, 5),
    });
    assert('B location=' + loc, put.location_status.value === loc
        && put.process_status.value === '完了');
});

if (failed) {
    process.exit(1);
}

console.log('\nAll complete register engine tests passed.');
