'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/order_search_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/order_search_engine.js'), 'utf8'));

const E = global.CAYANAS_OrderSearchEngine;
const C = global.CAYANAS_ORDER_SEARCH;
const desktop = fs.readFileSync(path.join(root, 'customize/order_search_desktop.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'customize/order_search.css'), 'utf8');

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

const rec = (extra) => {

    const opts = extra || {};

    return {
        $id: { value: opts.id || '1' },
        manage_no: { value: opts.manageNo || '' },
        order_date: { value: opts.orderDate || '2026-09-01' },
        deadline: { value: opts.deadline === undefined ? '2026-10-11' : opts.deadline },
        customer_code: { value: opts.customerCode || 'A335' },
        customer_name: { value: opts.customerName || '有限会社松川調整所' },
        client_name: { value: opts.clientName || '井田華子' },
        slip_no: { value: opts.slipNo || 'SL-1234' },
        kimono_type: { value: opts.kimonoType || '訪問着' },
        kimono_spec: { value: opts.kimonoSpec || '袷' },
        process_status: { value: opts.process || '工場作業中' },
        work_status: { value: opts.work || 'しみ抜き中' },
        location_status: { value: opts.location || '工場' },
        delivery_status: { value: opts.delivery || '未納品' },
        aggregation_status: { value: opts.aggregation === undefined ? '有効' : opts.aggregation },
        detail_table: { value: opts.lines || [line('丸洗い')] },
    };

};

const queryOf = (input) => E.buildSearchRequest(input).query;

const exact = queryOf({ customerCode: 'A335' });

assert('1 顧客コード完全一致', exact === 'customer_code = "A335" and (delivery_status not in ("納品済") or delivery_status in (""))'
    && exact.indexOf('like') === -1
    && exact.indexOf('!=') === -1);

const nameQuery = queryOf({ customerName: '松川' });

assert('2 顧客名部分一致', nameQuery.indexOf('customer_name like "松川"') !== -1
    && nameQuery.indexOf('%') === -1);

const clientQuery = queryOf({ clientName: '井田' });

assert('3 お客様名部分一致', clientQuery.indexOf('client_name like "井田"') !== -1
    && clientQuery.indexOf('%') === -1);

const slipQuery = queryOf({ slipNo: '1234' });

assert('4 伝票番号部分一致', slipQuery.indexOf('slip_no like "1234"') !== -1
    && slipQuery.indexOf('%') === -1);

const manageQuery = queryOf({ manageNo: '100626916' });

assert('5 管理番号完全一致', manageQuery.indexOf('manage_no = "100626916"') !== -1
    && manageQuery.indexOf('manage_no like') === -1);

const andQuery = queryOf({ customerCode: 'A335', clientName: '井田' });

assert('6 AND検索', andQuery === 'customer_code = "A335" and client_name like "井田" and (delivery_status not in ("納品済") or delivery_status in (""))');

assert('7 納品済OFF', queryOf({ customerName: '松川', includeDelivered: false }).indexOf('delivery_status not in ("納品済")') !== -1
    && queryOf({ customerName: '松川' }).indexOf('!=') === -1);

const deliveredOn = queryOf({ customerName: '松川', includeDelivered: true });

assert('8 納品済ON', deliveredOn.indexOf('delivery_status') === -1);

const mixed = E.buildRows([
    rec({ id: '1', aggregation: '取消', manageNo: 'C1' }),
    rec({ id: '2', aggregation: '', manageNo: 'B1' }),
    rec({ id: '3', aggregation: '有効', manageNo: 'A1' }),
]);

assert('9 取消除外', mixed.every((row) => row.manageNo !== 'C1'));
assert('10 集計空欄は表示', mixed.some((row) => row.manageNo === 'B1'));
assert('有効も表示', mixed.some((row) => row.manageNo === 'A1'));

const blank = E.buildSearchRequest({
    customerCode: '  ',
    customerName: '',
    clientName: '',
    slipNo: '',
    manageNo: '',
    includeDelivered: true,
});

assert('11 条件なしはAPIを呼ばない', blank.ok === false
    && blank.query === ''
    && blank.message === '検索条件を1つ以上入力してください。');

assert('納品済チェックだけでは検索しない', E.buildSearchRequest({ includeDelivered: true }).ok === false);

assert('12 0件', E.buildRows([]).length === 0 && C.MESSAGES.empty === '該当する受注はありません。');

const joined = E.joinProcessing(rec({
    lines: [line('丸洗い'), line(''), line('  '), line('しみ抜き'), line('ガード')],
}));

assert('13 加工内容を / で連結', joined === '丸洗い / しみ抜き / ガード');

const sorted = E.buildRows([
    rec({ id: 'late', manageNo: '100', deadline: '2026-10-20' }),
    rec({ id: 'soon-old', manageNo: '100626916', deadline: '2026-10-11' }),
    rec({ id: 'soon-new', manageNo: '100626920', deadline: '2026-10-11' }),
    rec({ id: 'blank', manageNo: '999', deadline: '' }),
]);

assert('14 納期が近い順', sorted.map((row) => row.recordId).join(',') === 'soon-new,soon-old,late,blank');
assert('15 納期空欄は最後', sorted[sorted.length - 1].recordId === 'blank');
assert('同日は管理番号の新しい順', sorted[0].manageNo === '100626920' && sorted[1].manageNo === '100626916');

const duplicates = E.buildRows([
    rec({ id: 'd1', manageNo: '100626916', deadline: '2026-10-11' }),
    rec({ id: 'd2', manageNo: '100626916', deadline: '2026-10-12' }),
    rec({ id: 'one', manageNo: '200', deadline: '2026-10-11' }),
]);

assert('16 重複は統合しない', duplicates.filter((row) => row.manageNo === '100626916').length === 2
    && duplicates.filter((row) => row.manageNo === '100626916').every((row) => row.duplicate)
    && duplicates.find((row) => row.manageNo === '200').duplicate === false);

const pageRecords = (size, start) => Array.from({ length: size }, (_, index) => rec({
    id: String(start + index),
    manageNo: String(100000 + start + index),
}));

assert('18 App16詳細リンク', E.orderDetailPath('321') === '/k/16/show#record=321'
    && desktop.indexOf('target="_blank"') !== -1
    && desktop.indexOf('orderDetailPath') !== -1);

assert('19 Enter検索', E.isSearchEnterKey({ key: 'Enter', isComposing: false }) === true
    && E.isSearchEnterKey({ key: 'Enter', isComposing: true }) === false
    && desktop.indexOf('isSearchEnterKey') !== -1);

const cleared = E.clearedInput();

assert('20 クリア', cleared.customerCode === ''
    && cleared.customerName === ''
    && cleared.clientName === ''
    && cleared.slipNo === ''
    && cleared.manageNo === ''
    && cleared.includeDelivered === false
    && desktop.indexOf('clearedInput') !== -1
    && desktop.indexOf('clearSearch') !== -1);

const special = queryOf({ customerName: '松"川\\' });

assert('特殊文字をエスケープ', special.indexOf('customer_name like "松\\"川\\\\"') !== -1);

assert('集計状態はクエリに入れない', queryOf({ customerCode: 'A335' }).indexOf('aggregation_status') === -1);

assert('件数表示', E.resultCountText(8) === '検索結果：8件');

assert('App88以外では起動しない', desktop.indexOf('SEARCH_APP_ID') !== -1
    && C.SEARCH_APP_ID === 88
    && C.ORDER_APP_ID === 16);

assert('更新APIは呼ばない', desktop.indexOf('PUT') === -1 && desktop.indexOf('.put(') === -1);

assert('横スクロール', css.indexOf('overflow-x: auto') !== -1);

assert('失敗メッセージ', C.MESSAGES.failed === '検索に失敗しました。再度お試しください。');

const finish = () => {

    if (failed > 0) {
        console.error(failed + ' failed');
        process.exit(1);
    }

    console.log('all passed');

};

const pages = [];

E.fetchAllPages('customer_code = "A335"', async (query) => {

    pages.push(query);

    if (pages.length === 1) {
        return pageRecords(500, 0);
    }

    if (pages.length === 2) {
        return pageRecords(500, 500);
    }

    return pageRecords(20, 1000);

}).then((many) => {

    assert('17 100件超をページング', many.length === 1020
        && pages.length === 3
        && pages[0].indexOf('limit 500 offset 0') !== -1
        && pages[1].indexOf('limit 500 offset 500') !== -1
        && pages[2].indexOf('limit 500 offset 1000') !== -1);
    finish();

}).catch((error) => {

    console.error(error);
    process.exit(1);

});
