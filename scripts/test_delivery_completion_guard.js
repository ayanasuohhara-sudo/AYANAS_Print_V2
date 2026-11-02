'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/internal_ops_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/complete_register_engine.js'), 'utf8'));

const R = global.CAYANAS_CompleteRegisterEngine;
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

const order = (manageNo, processStatus, extra) => {
    const opts = extra || {};

    return {
        $id: { value: opts.id || manageNo },
        manage_no: { value: manageNo },
        customer_name: { value: opts.customerName || '顧客A' },
        client_name: { value: opts.clientName || 'お客様B' },
        kimono_type: { value: opts.kimonoType || '訪問着' },
        location_status: { value: opts.location || '工場' },
        process_status: { value: processStatus },
        work_status: { value: opts.work || '仕上げ中' },
        delivery_status: { value: opts.delivery || '未納品' },
        completion_date: { value: opts.completionDate === undefined ? '' : opts.completionDate },
    };
};

const lookup = (manageNo, records, error) => ({
    manageNo,
    records: records || [],
    error: error || '',
});

const detailRow = (manageNo) => ({
    value: {
        manage_no: { value: manageNo },
    },
});

const appliedRecord = (item, putRecord) => ({
    $id: { value: item.recordId },
    manage_no: { value: item.manageNo },
    process_status: { value: putRecord.process_status.value },
    work_status: { value: putRecord.work_status.value },
    delivery_status: { value: putRecord.delivery_status.value },
    completion_date: { value: putRecord.completion_date.value },
    location_status: { value: item.locationStatus },
});

const run = async () => {
    const blankRows = R.collectDistinctManageNos([
        detailRow(''),
        detailRow('   '),
        detailRow('123456'),
        detailRow('123456'),
        { value: {} },
    ]);
    assert('ケース7 空行は対象外で重複は1件', blankRows.length === 1 && blankRows[0] === '123456');

    const done = R.planDeliveryCompletion([
        lookup('100001', [order('100001', '完了', { completionDate: '' })]),
    ]);
    assert('ケース1 完了は確認なしで保存', done.action === 'save' && done.completable.length === 0);
    assert('ケース1 空の完了日を埋めない', done.evaluation.alreadyComplete[0].completionDate === '');

    const factory = R.planDeliveryCompletion([
        lookup('123456', [order('123456', '工場作業中', {
            customerName: '松葉',
            clientName: '山田',
            kimonoType: '訪問着',
            work: '仕上げ中',
            location: '工場',
        })]),
    ]);
    assert('ケース2 工場作業中は確認', factory.action === 'confirm' && factory.completable.length === 1);
    assert('ケース2 確認文に明細', factory.message.indexOf('123456') !== -1
        && factory.message.indexOf('松葉') !== -1
        && factory.message.indexOf('山田') !== -1
        && factory.message.indexOf('訪問着') !== -1
        && factory.message.indexOf('工場作業中') !== -1
        && factory.message.indexOf('仕上げ中') !== -1
        && factory.message.indexOf('保管場所:工場') !== -1
        && factory.message.indexOf('未完了の商品が1点あります。') !== -1
        && factory.message.indexOf('そのまま納品書を作成しますか？') !== -1);

    const putRecord = R.buildCompletePutRecord(new Date(2026, 9, 5, 8, 0, 0));
    const stored = {};
    const factoryResult = await R.applyCompletableUpdates(factory.completable, putRecord, {
        putOrder: async (item, record) => {
            stored[item.manageNo] = appliedRecord(item, record);
            assert('ケース2 PUTにlocationが無い', !record.location_status);
        },
        fetchOrder: async (manageNo) => stored[manageNo],
    });
    assert('ケース2 確認後に保存可', factoryResult.save === true);
    assert('ケース2 完了内容', stored['123456'].process_status.value === C.PROCESS.complete
        && stored['123456'].work_status.value === C.WORK.finishDone
        && stored['123456'].delivery_status.value === C.DELIVERY.waiting
        && stored['123456'].completion_date.value === '2026-10-05'
        && stored['123456'].location_status.value === '工場');

    const store = R.planDeliveryCompletion([
        lookup('200001', [order('200001', '店舗作業中', { location: '店舗' })]),
    ]);
    assert('ケース3 店舗作業中は補完可', store.action === 'confirm'
        && store.completable[0].processStatus === '店舗作業中');

    const returned = R.planDeliveryCompletion([
        lookup('300001', [order('300001', '海外戻り', { location: '本社' })]),
    ]);
    assert('ケース4 海外戻りは補完可', returned.action === 'confirm'
        && returned.completable[0].processStatus === '海外戻り');

    ['外注戻り', '和裁士戻り', '検品仕上中'].forEach((status) => {
        const plan = R.planDeliveryCompletion([
            lookup('300002', [order('300002', status)]),
        ]);
        assert('補完可 ' + status, plan.action === 'confirm');
    });

    const overseas = R.planDeliveryCompletion([
        lookup('400001', [order('400001', '海外外注中', { location: '海外' })]),
    ]);
    assert('ケース5 海外外注中は確認して完了できる', overseas.action === 'confirm' && overseas.completable.length === 1);
    assert('ケース5 確認文', overseas.message.indexOf('400001') !== -1
        && overseas.message.indexOf('海外外注中') !== -1
        && overseas.message.indexOf('そのまま納品書を作成しますか？') !== -1);
    assert('ケース5 確認ボタン相当の文言が無い', overseas.message.indexOf('［OK］') === -1);

    ['外注中', '和裁士作業中', '', '   ', '未知工程', '仕上げ待ち', '丸洗い中'].forEach((status) => {
        const plan = R.planDeliveryCompletion([
            lookup('400002', [order('400002', status)]),
        ]);
        assert('ケース6 確認 ' + (status.trim() || '(空欄)'), plan.action === 'confirm' && plan.completable.length === 1);
    });

    const missing = R.planDeliveryCompletion([
        lookup('500001', []),
    ]);
    assert('ケース8 0件は停止', missing.action === 'stop'
        && missing.message.indexOf('管理番号 500001 が受注明細に見つかりません。') !== -1);

    const duplicated = R.planDeliveryCompletion([
        lookup('500002', [
            order('500002', '工場作業中', { id: '1' }),
            order('500002', '工場作業中', { id: '2' }),
        ]),
    ]);
    assert('ケース9 2件は停止', duplicated.action === 'stop'
        && duplicated.completable.length === 0
        && duplicated.message.indexOf('管理番号 500002 が受注明細に複数存在します。') !== -1);

    const mixed = R.planDeliveryCompletion([
        lookup('600001', [order('600001', '完了', { completionDate: '2026-09-01' })]),
        lookup('600002', [order('600002', '工場作業中')]),
    ]);
    assert('ケース10 未完了だけ確認', mixed.action === 'confirm'
        && mixed.completable.length === 1
        && mixed.completable[0].manageNo === '600002'
        && mixed.evaluation.alreadyComplete[0].completionDate === '2026-09-01');

    const blockedMix = R.planDeliveryCompletion([
        lookup('700001', [order('700001', '完了', { completionDate: '2026-09-01' })]),
        lookup('700002', [order('700002', '工場作業中')]),
        lookup('700003', [order('700003', '海外外注中')]),
    ]);
    assert('ケース11 外注中が混ざっても確認して完了できる', blockedMix.action === 'confirm'
        && blockedMix.completable.length === 2
        && blockedMix.completable[0].manageNo === '700002'
        && blockedMix.completable[1].manageNo === '700003'
        && blockedMix.evaluation.alreadyComplete.length === 1);
    assert('ケース11 完了済みは確認対象に含めない', blockedMix.message.indexOf('700001') === -1
        && blockedMix.message.indexOf('700003') !== -1);

    const partialStored = {};
    const partial = await R.applyCompletableUpdates([
        { recordId: '1', manageNo: '800001', locationStatus: '工場' },
        { recordId: '2', manageNo: '800002', locationStatus: '工場' },
    ], putRecord, {
        putOrder: async (item, record) => {
            if (item.manageNo === '800002') {
                throw new Error('更新失敗');
            }
            partialStored[item.manageNo] = appliedRecord(item, record);
        },
        fetchOrder: async (manageNo) => partialStored[manageNo] || null,
    });
    assert('途中失敗は保存しない', partial.save === false
        && partial.succeeded.indexOf('800001') !== -1
        && partial.failed[0].manageNo === '800002');
    assert('途中失敗でも成功分は戻さない', partialStored['800001'].process_status.value === '完了'
        && !partialStored['800002']);
    assert('途中失敗の案内', partial.message.indexOf('800001') !== -1
        && partial.message.indexOf('800002') !== -1
        && partial.message.indexOf('工程は戻していません。') !== -1);

    const unverified = await R.applyCompletableUpdates([
        { recordId: '3', manageNo: '800003', locationStatus: '工場' },
    ], putRecord, {
        putOrder: async () => {},
        fetchOrder: async () => order('800003', '工場作業中'),
    });
    assert('再GETで完了確認できなければ保存しない', unverified.save === false
        && unverified.failed[0].reason === '完了内容を確認できません');

    const a550 = R.planDeliveryCompletion([
        lookup('900001', [order('900001', '工場作業中')]),
    ]);
    const corporate = R.planDeliveryCompletion([
        lookup('900001', [order('900001', '工場作業中')]),
    ]);
    assert('ケース12 得意先に関係なく同じ判定', a550.action === corporate.action
        && a550.completable.length === corporate.completable.length);

    const guard = fs.readFileSync(path.join(root, 'customize/delivery_completion_guard.js'), 'utf8');
    const sync = fs.readFileSync(path.join(root, 'customize/delivery_complete_sync.js'), 'utf8');
    const price = fs.readFileSync(path.join(root, 'customize/price_master_register.js'), 'utf8');
    const markStart = sync.indexOf('async function markOrderDelivered');
    const markEnd = sync.indexOf('async function syncCorporateDelivery');
    const markBody = sync.slice(markStart, markEnd);

    assert('ケース12 ガードはA550を除外しない', guard.indexOf('A550') === -1);
    assert('ケース12 納品済同期はA550を除外したまま', sync.indexOf("const A550_CUSTOMER_CODE = 'A550'") !== -1
        && sync.indexOf('customerCode !== A550_CUSTOMER_CODE') !== -1);
    assert('ケース13 納品済同期は状態・納品日・納品番号', sync.indexOf('buildCorporateOrderUpdate') !== -1
        && sync.indexOf('[FIELD.locationStatus]: { value: STATUS_DELIVERED }') !== -1
        && sync.indexOf('[FIELD.deliveryStatus]: { value: STATUS_DELIVERED }') !== -1
        && sync.indexOf('[FIELD.deliveryDate] = { value: date }') !== -1
        && sync.indexOf('[FIELD.deliveryNo] = { value: number }') !== -1
        && markBody.indexOf('completion_date') === -1
        && markBody.indexOf('work_status') === -1
        && markBody.indexOf('[FIELD.processStatus]') === -1);
    assert('保存前イベント', guard.indexOf("'app.record.create.submit'") !== -1
        && guard.indexOf("'app.record.edit.submit'") !== -1
        && guard.indexOf('submit.success') === -1);
    assert('保存後イベントは従来どおり', sync.indexOf('app.record.create.submit.success') !== -1
        && sync.indexOf('app.record.edit.submit.success') !== -1
        && price.indexOf('app.record.create.submit.success') !== -1
        && price.indexOf('app.record.edit.submit.success') !== -1);
    assert('App19は完了文字列を持たない', guard.indexOf('仕上げ完了') === -1
        && guard.indexOf('納品待ち') === -1
        && guard.indexOf("value: '完了'") === -1);
    const confirmText = fs.readFileSync(path.join(root, 'customize/complete_register_engine.js'), 'utf8');
    assert('未完了は1回の確認文', confirmText.indexOf('未完了の商品が') !== -1
        && confirmText.indexOf('そのまま納品書を作成しますか？') !== -1);
    assert('外注中も確認して完了できる', R.classifyProcessStatus('外注中') === 'completable'
        && R.classifyProcessStatus('海外外注中') === 'completable'
        && R.classifyProcessStatus('和裁士作業中') === 'completable'
        && R.classifyProcessStatus('') === 'completable'
        && R.classifyProcessStatus('完了') === 'complete');
    assert('標準ダイアログでは保存を切らない', guard.indexOf('window.confirm') === -1
        && guard.indexOf('window.alert') === -1
        && guard.indexOf('return false') === -1);
    assert('中止は event.error で返す', guard.indexOf('event.error = message') !== -1);
    assert('PUTは確認より後', guard.indexOf('planDeliveryCompletion') < guard.indexOf('askToCompleteAndSave(plan.message)')
        && guard.indexOf('askToCompleteAndSave(plan.message)') < guard.indexOf('buildCompletePutRecord')
        && guard.indexOf('buildCompletePutRecord') < guard.indexOf('applyCompletableUpdates')
        && guard.lastIndexOf('return event;') > guard.indexOf('applyCompletableUpdates'));

    if (failed) {
        process.exit(1);
    }

    console.log('\nAll delivery completion guard tests passed.');
};

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
