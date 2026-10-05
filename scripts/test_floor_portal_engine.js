'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/floor_portal_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/floor_portal_engine.js'), 'utf8'));

const E = global.CAYANAS_FloorPortalEngine;
const C = global.CAYANAS_FLOOR_PORTAL;
const TODAY = '2026-10-05';

let failed = 0;

const assert = (name, cond) => {
    if (cond) {
        console.log('OK  ' + name);
        return;
    }

    failed += 1;
    console.error('FAIL ' + name);
};

const line = (name) => ({
    value: {
        item_name: { value: name },
    },
});

const rec = (manageNo, location, work, extra) => {
    const opts = extra || {};
    const record = {
        $id: { value: opts.id || manageNo + '-' + work + '-' + location },
        manage_no: { value: manageNo },
        order_date: { value: opts.orderDate || '2026-09-01' },
        deadline: { value: opts.deadline === undefined ? '2026-10-20' : opts.deadline },
        customer_name: { value: opts.customerName || '顧客A' },
        client_name: { value: opts.clientName || 'お客様B' },
        kimono_type: { value: opts.kimonoType || '訪問着' },
        kimono_spec: { value: opts.kimonoSpec || '袷' },
        process_status: { value: opts.process || '工場作業中' },
        location_status: { value: location },
        work_status: { value: work },
        delivery_status: { value: opts.delivery || '未納品' },
        detail_table: { value: opts.lines || [line('丸洗い')] },
    };

    if (opts.aggregation !== 'OMIT') {
        record.aggregation_status = { value: opts.aggregation === undefined ? '有効' : opts.aggregation };
    }

    return record;
};

const ids = (rows) => rows.map((row) => row.recordId);

const run = () => {
    const factoryRecords = [
        rec('F-PENDING', '工場', '未着手', { deadline: '2026-10-01', id: '1' }),
        rec('F-MARU-WAIT', '工場', '丸洗い待ち', { deadline: '2026-10-05', id: '2' }),
        rec('F-MARU', '工場', '丸洗い中・乾燥', { deadline: '2026-10-08', id: '3' }),
        rec('F-FINISH', '工場', '仕上げ中', { deadline: '2026-10-31', id: '4' }),
        rec('F-SHIMI', '工場', 'しみ抜き待ち', { deadline: '2026-11-02', id: '5' }),
        rec('F-DONE', '工場', '仕上げ完了', { deadline: '', id: '6' }),
        rec('F-LEGACY', '工場', '振り分け待ち', { deadline: '2026-09-30', id: '7' }),
        rec('F-LEGACY2', '工場', '丸洗い中', { id: '8' }),
        rec('F-LEGACY3', '工場', '仕上げ待ち', { id: '9' }),
        rec('F-BLANK', '工場', '未着手', { aggregation: '', deadline: '2026-10-12', id: '10' }),
        rec('F-OMIT', '工場', '丸洗い待ち', { aggregation: 'OMIT', deadline: '2026-10-06', id: '11' }),
        rec('F-CANCEL', '工場', '未着手', { aggregation: '取消', id: '12' }),
        rec('F-DELIVERED', '工場', '仕上げ完了', { delivery: '納品済', id: '13' }),
        rec('S-1', '店舗', '未着手', { id: '14' }),
        rec('H-1', '本社', '未着手', { id: '15' }),
        rec('DUP', '工場', '未着手', { deadline: '2026-10-03', id: '16', lines: [line('丸洗い'), line(''), line('しみ抜き'), line('ガード')] }),
        rec('DUP', '工場', '仕上げ中', { deadline: '2026-10-09', id: '17', customerName: '松葉', clientName: '山田' }),
        rec('F-SHIMI-IN', '工場', 'しみ抜き中', { id: '18' }),
        rec('F-OLD-REPAIR', '工場', '修理・直し中', { id: '19' }),
        rec('F-REPAIR', '工場', '修理中', { id: '20' }),
        rec('F-REWORK', '工場', '再直し中', { id: '21' }),
    ];

    const factory = E.buildStock(factoryRecords, { mode: 'factory', today: TODAY });
    const factoryNos = factory.rows.map((row) => row.manageNo);

    assert('工場以外は出ない', factoryNos.indexOf('S-1') === -1 && factoryNos.indexOf('H-1') === -1);
    assert('取消と納品済は出ない', factoryNos.indexOf('F-CANCEL') === -1 && factoryNos.indexOf('F-DELIVERED') === -1);
    assert('空欄と未取得の集計状態は出る', factoryNos.indexOf('F-BLANK') !== -1 && factoryNos.indexOf('F-OMIT') !== -1);
    assert('工場在庫は管理番号の件数', factory.kpis.total === 16);
    assert('未着手は重複を1枚', factory.kpis.work['未着手'] === 3);
    assert('丸洗い待ち', factory.kpis.work['丸洗い待ち'] === 2);
    assert('丸洗い中・乾燥', factory.kpis.work['丸洗い中・乾燥'] === 1);
    assert('仕上げ中は重複管理番号を含む', factory.kpis.work['仕上げ中'] === 2);
    assert('工場のしみ抜き待ち', factory.kpis.work['しみ抜き待ち'] === 1);
    assert('工場のしみ抜き中', factory.kpis.work['しみ抜き中'] === 1);
    assert('工場の修理中', factory.kpis.work['修理中'] === 1);
    assert('工場の再直し中', factory.kpis.work['再直し中'] === 1);
    assert('旧値と仕上げ完了はその他', factory.kpis.other === 5);
    assert('旧値を未着手にしない', factory.rows.filter((row) => row.workStatus === '振り分け待ち').length === 1
        && factory.kpis.work['未着手'] !== factory.rows.length);
    assert('重複は両方表示', factory.rows.filter((row) => row.manageNo === 'DUP').length === 2
        && factory.rows.filter((row) => row.manageNo === 'DUP').every((row) => row.duplicate));
    assert('加工内容を連結', factory.rows.find((row) => row.recordId === '16').processing === '丸洗い、しみ抜き、ガード');
    assert('納期超過', factory.kpis.deadline.overdue === 3);
    assert('今日納期', factory.kpis.deadline.today === 1);
    assert('7日以内は今日から7日後', factory.kpis.deadline.within7 === 5);
    assert('今月納期', factory.kpis.deadline.thisMonth === 13);
    assert('納期空欄は納期カードに入らない', factory.rows.filter((row) => row.recordId === '6')[0].urgency === ''
        && !factory.rows.filter((row) => row.recordId === '6')[0].deadlineFlags.thisMonth);
    assert('納期の近い順で空欄は後ろ', factory.rows[0].deadline === '2026-09-30'
        && factory.rows[factory.rows.length - 1].deadline === '');
    assert('超過が今日より優先', factory.rows.find((row) => row.recordId === '1').urgency === 'overdue');
    assert('今日は7日以内より優先表示', factory.rows.find((row) => row.recordId === '2').urgency === 'today');

    const andRows = E.filterRows(factory.rows, {
        mode: 'factory',
        workId: '丸洗い待ち',
        deadlineId: 'within7',
        query: '',
    });
    assert('作業と納期のAND', ids(andRows).indexOf('11') !== -1 && ids(andRows).indexOf('2') !== -1 && andRows.length === 2);

    ['しみ抜き待ち', 'しみ抜き中', '修理中', '再直し中'].forEach((label) => {
        const filtered = E.filterRows(factory.rows, { mode: 'factory', workId: label, deadlineId: '', query: '' });

        assert('工場カード絞り込み ' + label, filtered.length === 1 && filtered[0].workStatus === label);
    });

    const repairAndMonth = E.filterRows(factory.rows, {
        mode: 'factory',
        workId: '修理中',
        deadlineId: 'thisMonth',
        query: '',
    });
    const repairAndOverdue = E.filterRows(factory.rows, {
        mode: 'factory',
        workId: '修理中',
        deadlineId: 'overdue',
        query: '',
    });
    assert('修理中と今月納期のAND', repairAndMonth.length === 1 && repairAndMonth[0].workStatus === '修理中');
    assert('修理中と納期超過のANDは空', repairAndOverdue.length === 0);

    const searchRows = E.filterRows(factory.rows, {
        mode: 'factory',
        workId: '仕上げ中',
        deadlineId: '',
        query: '松葉',
    });
    assert('検索はKPIとAND', searchRows.length === 1 && searchRows[0].clientName === '山田');

    const cleared = E.filterRows(factory.rows, {
        mode: 'factory',
        workId: '',
        deadlineId: '',
        query: '松葉',
    });
    assert('絞り込み解除後も検索は残る', cleared.length === 1);

    const storeRecords = [
        rec('ST-P', '店舗', '未着手', { id: 's1' }),
        rec('ST-W', '店舗', 'しみ抜き待ち', { id: 's2', delivery: '納品待ち' }),
        rec('ST-I', '店舗', 'しみ抜き中', { id: 's3' }),
        rec('ST-F', '店舗', '仕上げ中', { id: 's4' }),
        rec('ST-WAIT', '店舗', '仕上げ完了', { id: 's5', delivery: '納品待ち', customerCode: 'A550' }),
        rec('ST-OTHER', '店舗', '丸洗い待ち', { id: 's6' }),
        rec('ST-CANCEL', '店舗', '未着手', { aggregation: '取消', id: 's7' }),
        rec('ST-OUT', '店舗', '仕上げ完了', { delivery: '納品済', id: 's8' }),
        rec('ST-BLANK', '店舗', '未着手', { aggregation: '', id: 's9' }),
        rec('FX', '工場', 'しみ抜き中', { id: 's10' }),
        rec('ST-REPAIR', '店舗', '修理・直し中', { id: 's11' }),
        rec('ST-REPAIR-NOW', '店舗', '修理中', { id: 's12' }),
        rec('ST-REWORK', '店舗', '再直し中', { id: 's13' }),
    ];
    const store = E.buildStock(storeRecords, { mode: 'store', today: TODAY });
    const storeNos = store.rows.map((row) => row.manageNo);

    assert('店舗在庫のみ', storeNos.indexOf('FX') === -1 && store.kpis.total === 10);
    assert('店舗の未着手', store.kpis.work['未着手'] === 2);
    assert('しみ抜き待ち', store.kpis.work['しみ抜き待ち'] === 1);
    assert('しみ抜き中', store.kpis.work['しみ抜き中'] === 1);
    assert('店舗の仕上げ中', store.kpis.work['仕上げ中'] === 1);
    assert('店舗の修理中', store.kpis.work['修理中'] === 1);
    assert('店舗の再直し中', store.kpis.work['再直し中'] === 1);
    assert('旧修理・直し中は修理中に入らない', store.rows.some((row) => row.workStatus === '修理・直し中')
        && E.filterRows(store.rows, { mode: 'store', workId: '修理中', deadlineId: '', query: '' })
            .every((row) => row.workStatus === '修理中'));
    assert('店舗はその他カードを出さない', C.SHOW_OTHER_CARD.store === false && C.SHOW_OTHER_CARD.factory === true);
    assert('納品待ちは作業と別に数える', store.kpis.deliveryWaiting === 2);
    assert('店舗の非表示その他には旧値が残る', store.kpis.other === 3);
    assert('納品済と取消は店舗にも出ない', storeNos.indexOf('ST-CANCEL') === -1 && storeNos.indexOf('ST-OUT') === -1);

    ['修理中', '再直し中'].forEach((label) => {
        const filtered = E.filterRows(store.rows, { mode: 'store', workId: label, deadlineId: 'thisMonth', query: '' });

        assert('店舗カードと今月納期のAND ' + label, filtered.length === 1 && filtered[0].workStatus === label);
    });

    const outside = E.describeLookup([
        rec('X', '本社', '未着手', { process: '海外外注中', id: 'o1' }),
    ]);
    assert('場所と工程を案内', outside.indexOf('本社') !== -1 && outside.indexOf('海外外注中') !== -1);
    assert('取消の案内', E.describeLookup([
        rec('Y', '店舗', '未着手', { aggregation: '取消' }),
    ]).indexOf('取消') !== -1);

    assert('絞り込みでは取得しない', E.shouldFetch({ visibilityState: 'visible', cause: 'filter' }) === false);
    assert('検索では取得しない', E.shouldFetch({ visibilityState: 'visible', cause: 'search' }) === false);
    assert('表示中の定期更新は取得する', E.shouldFetch({ visibilityState: 'visible', cause: 'interval' }) === true);
    assert('非表示タブの定期更新は止める', E.shouldFetch({ visibilityState: 'hidden', cause: 'interval' }) === false);
    assert('再表示では取得する', E.shouldFetch({ visibilityState: 'visible', cause: 'visible' }) === true);
    assert('更新間隔は2分', C.REFRESH_INTERVAL_MS === 120000);
    assert('App IDは設定に集約', C.APP.factoryPortal === 86 && C.APP.storePortal === 87
        && C.APP.locationInbound === 34 && C.APP.internalWork === 84 && C.APP.completeRegister === 30);

    const desktop = fs.readFileSync(path.join(root, 'customize/floor_portal_desktop.js'), 'utf8');
    assert('画面は状態を更新しない', desktop.indexOf("method, 'PUT'") === -1 && desktop.indexOf("'PUT'") === -1);
    assert('旧ポータルを呼ばない', desktop.indexOf('factory_portal_layout') === -1
        && desktop.indexOf('store_work') === -1);

    if (failed) {
        console.error(JSON.stringify({
            total: factory.kpis.total,
            work: factory.kpis.work,
            other: factory.kpis.other,
            deadline: factory.kpis.deadline,
            order: factory.rows.map((row) => row.manageNo + ':' + row.deadline),
        }, null, 2));
        process.exit(1);
    }

    console.log('\nAll floor portal engine tests passed.');
};

run();
