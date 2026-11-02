'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../customize/work_status_labels.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../customize/internal_ops_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../customize/internal_work_engine.js'), 'utf8'));

const W = global.CAYANAS_InternalWorkEngine;
const C = global.CAYANAS_INTERNAL_OPS;
const MODE = W.BULK_MODE;

let failed = 0;

const assert = (name, cond) => {

    if (cond) {
        console.log('OK  ' + name);
    } else {
        failed += 1;
        console.error('FAIL ' + name);
    }

};

const snap = (extra) => Object.assign({
    manageNo: 'M1',
    locationStatus: '工場',
    processStatus: '工場作業中',
    workStatus: '未着',
    deliveryStatus: '未納品',
}, extra || {});

const allowedApp84 = [
    '未着',
    '問合せ・見積り',
    '丸洗い待ち',
    '丸洗い中・乾燥',
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
assert('not 未着手', !W.isAllowedWorkSelection('未着手'));
assert('not しみ抜き待ち', !W.isAllowedWorkSelection('しみ抜き待ち'));
assert('WORK_SELECT に仕上げ待ちなし', !C.WORK_SELECT_OPTIONS.includes('仕上げ待ち'));
assert('WORK_SELECT に未着手なし', !C.WORK_SELECT_OPTIONS.includes('未着手'));
assert('WORK_SELECT 件数 8', C.WORK_SELECT_OPTIONS.length === 8);
assert('dual-read 未着手→未着', C.normalizeWorkStatus('未着手') === '未着');
assert('dual-read しみ抜き待ち→しみ抜き中', C.normalizeWorkStatus('しみ抜き待ち') === 'しみ抜き中');
assert('dual-read 仕上げ待ち→仕上げ中', C.normalizeWorkStatus('仕上げ待ち') === '仕上げ中');

['修理中', '再直し中', '未着'].forEach((label) => {
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

try {
    W.buildWorkPutRecord('未着手');
    assert('build 未着手 は throw', false);
} catch (error) {
    assert('build 未着手 は throw', true);
}

assert('MODE 定義', MODE.work === 'work'
    && MODE.workWithLocation === 'work_with_location'
    && MODE.locationOnly === 'location_only');

const workOnlyPut = W.buildBulkPutRecord({ mode: MODE.work, workStatus: '仕上げ中' });
assert('作業のみ PUT', Object.keys(workOnlyPut).join(',') === 'work_status'
    && workOnlyPut.work_status.value === '仕上げ中');

const bothPut = W.buildBulkPutRecord({
    mode: MODE.workWithLocation,
    workStatus: 'しみ抜き中',
    location: '本社',
});
assert('作業+場所 PUT', Object.keys(bothPut).sort().join(',') === 'location_status,work_status'
    && bothPut.work_status.value === 'しみ抜き中'
    && bothPut.location_status.value === '本社');

const locPut = W.buildBulkPutRecord({ mode: MODE.locationOnly, location: '店舗' });
assert('場所のみ PUT', Object.keys(locPut).join(',') === 'location_status'
    && locPut.location_status.value === '店舗');

assert('validate 作業のみ OK', W.validateBulkSelection(MODE.work, '丸洗い待ち', '').ok === true);
assert('validate 作業のみ NG', W.validateBulkSelection(MODE.work, '', '').ok === false);
assert('validate 作業+場所 OK', W.validateBulkSelection(MODE.workWithLocation, '修理中', '工場').ok === true);
assert('validate 作業+場所 NG 場所', W.validateBulkSelection(MODE.workWithLocation, '修理中', '').reason
    === '保管場所を工場・本社・店舗から選択してください。');
assert('validate 場所のみ OK', W.validateBulkSelection(MODE.locationOnly, '', '本社').ok === true);
assert('validate 場所のみ NG', W.validateBulkSelection(MODE.locationOnly, '仕上げ中', '').ok === false);

const planWork = W.planBulkItemAction({
    mode: MODE.work,
    workStatus: '仕上げ中',
    snapshot: snap({ workStatus: '未着' }),
});
assert('作業変更 put', planWork.action === 'put'
    && Object.keys(planWork.putRecord).join(',') === 'work_status');

const planWorkSkip = W.planBulkItemAction({
    mode: MODE.work,
    workStatus: '未着',
    snapshot: snap({ workStatus: '未着' }),
});
assert('作業同一 skip', planWorkSkip.action === 'skip');

const planBoth = W.planBulkItemAction({
    mode: MODE.workWithLocation,
    workStatus: 'しみ抜き中',
    location: '店舗',
    snapshot: snap({ workStatus: '未着', locationStatus: '工場' }),
});
assert('作業+場所 put 両方', planBoth.action === 'put'
    && Object.keys(planBoth.putRecord).sort().join(',') === 'location_status,work_status');

const planBothLocOnly = W.planBulkItemAction({
    mode: MODE.workWithLocation,
    workStatus: '未着',
    location: '本社',
    snapshot: snap({ workStatus: '未着', locationStatus: '工場' }),
});
assert('作業同一なら場所のみ', planBothLocOnly.action === 'put'
    && Object.keys(planBothLocOnly.putRecord).join(',') === 'location_status'
    && planBothLocOnly.putRecord.location_status.value === '本社');

const planBothSkip = W.planBulkItemAction({
    mode: MODE.workWithLocation,
    workStatus: '未着',
    location: '工場',
    snapshot: snap({ workStatus: '未着', locationStatus: '工場' }),
});
assert('作業+場所とも同一 skip', planBothSkip.action === 'skip');

const planLoc = W.planBulkItemAction({
    mode: MODE.locationOnly,
    location: '本社',
    snapshot: snap({ locationStatus: '工場' }),
});
assert('場所のみ put', planLoc.action === 'put'
    && Object.keys(planLoc.putRecord).join(',') === 'location_status');

const planLocSkip = W.planBulkItemAction({
    mode: MODE.locationOnly,
    location: '工場',
    snapshot: snap({ locationStatus: '工場' }),
});
assert('場所同一 skip', planLocSkip.action === 'skip');

const planDelivered = W.planBulkItemAction({
    mode: MODE.workWithLocation,
    workStatus: '仕上げ中',
    location: '店舗',
    snapshot: snap({ deliveryStatus: '納品済' }),
});
assert('納品済 fail', planDelivered.action === 'fail');

assert('isPutApplied OK', W.isPutApplied(
    { work_status: { value: '仕上げ中' }, location_status: { value: '店舗' } },
    { work_status: { value: '仕上げ中' }, location_status: { value: '店舗' } }
) === true);
assert('isPutApplied NG', W.isPutApplied(
    { work_status: { value: '未着' } },
    { work_status: { value: '仕上げ中' } }
) === false);

assert('allowedLocations', W.allowedLocations().join(',') === '工場,本社,店舗');

if (failed) {
    process.exit(1);
}

console.log('\nAll internal work engine tests passed.');
