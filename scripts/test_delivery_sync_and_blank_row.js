'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;
global.kintone = {
    app: { getId: () => 0 },
    events: { on: () => {} },
    api: { url: () => '' },
};

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/barcode_delivery.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/delivery_complete_sync.js'), 'utf8'));

const B = global.CAYANAS_BarcodeDelivery;
const S = global.CAYANAS_DeliveryCompleteSync;

let failed = 0;

const assert = (name, cond) => {
    if (cond) {
        console.log('OK  ' + name);
        return;
    }

    failed += 1;
    console.error('FAIL ' + name);
};

const blankRow = (id) => ({
    id: id,
    value: {
        manage_no: { value: '' },
        client_name: { value: '' },
        kimono_type: { value: '' },
        kimono_spec: { value: '' },
        item_code: { value: '' },
        item_name: { value: '' },
        qty: { value: '' },
        unit_price: { value: '' },
        amount: { value: '' },
        slip_no: { value: '' },
        in_charge: { value: '' },
    },
});

const product = (manageNo) => ({
    value: {
        manage_no: { value: manageNo },
        item_name: { value: '丸洗い' },
        qty: { value: '1' },
    },
});

const typed = () => ({
    id: 'typed',
    value: {
        manage_no: { value: '' },
        client_name: { value: '山田' },
        item_name: { value: '' },
        qty: { value: '0' },
        unit_price: { value: '0' },
        amount: { value: '0' },
    },
});

const run = () => {
    const first = B.placeDetailRows([blankRow('empty')], [product('A001')]);

    assert('最初のバーコードは空行を実商品にする', first.length === 1
        && first[0].id === 'empty'
        && first[0].value.manage_no.value === 'A001');

    const second = B.placeDetailRows(first, [product('A002')]);
    const third = B.placeDetailRows(second, [product('A003')]);

    assert('3点は空白なしの3行', third.length === 3
        && third.map((row) => row.value.manage_no.value).join(',') === 'A001,A002,A003');

    const kept = B.placeDetailRows([typed()], [product('A004')]);

    assert('入力済み行は上書きせず次行へ追加', kept.length === 2
        && kept[0].value.client_name.value === '山田'
        && kept[1].value.manage_no.value === 'A004');

    assert('数量0だけの商品行は空白ではない', B.isInitialBlankDetailRow({
        value: {
            manage_no: { value: 'A009' },
            item_name: { value: 'シミ抜き' },
            qty: { value: '0' },
            unit_price: { value: '0' },
            amount: { value: '0' },
        },
    }) === false);

    const corporate = S.buildCorporateOrderUpdate('2026-10-06', 'N20261006-10');

    assert('法人更新は納品済と納品日と納品番号', corporate.location_status.value === '納品済'
        && corporate.delivery_status.value === '納品済'
        && corporate.delivery_date.value === '2026-10-06'
        && corporate.delivery_no.value === 'N20261006-10');
    assert('完了日・工程・作業は更新しない', corporate.completion_date === undefined
        && corporate.process_status === undefined
        && corporate.work_status === undefined);
    assert('納品日が空なら日付フィールドを送らない', S.buildCorporateOrderUpdate('', 'N1').delivery_date === undefined);
    assert('A550と空欄は法人同期しない', S.isCorporateCustomer('A550') === false
        && S.isCorporateCustomer('') === false
        && S.isCorporateCustomer('M070') === true);

    if (failed > 0) {
        console.error(failed + ' failed');
        process.exit(1);
    }

    console.log('all passed');
};

run();
