'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/business_dashboard_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/business_dashboard_engine.js'), 'utf8'));

const Engine = global.CAYANAS_BusinessDashboardEngine;

let failed = 0;

const assert = (name, cond) => {
    if (cond) {
        console.log('OK  ' + name);
        return;
    }

    failed += 1;
    console.error('FAIL ' + name);
};

const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });

const orderLine = (amount) => ({
    value: {
        item_code: { value: 'P1' },
        item_name: { value: '丸洗い' },
        qty: { value: '1' },
        amount: { value: String(amount) },
    },
});

const orderRecord = (manageNo, amount, aggregation, extra) => {
    const opts = extra || {};
    const record = {
        $id: { value: opts.id || manageNo },
        manage_no: { value: manageNo },
        order_date: { value: day },
        customer_code: { value: 'M001' },
        customer_name: { value: '顧客' },
        kimono_type: { value: '訪問着' },
        kimono_spec: { value: '' },
        deadline: { value: day },
        process_status: { value: opts.process || '工場作業中' },
        location_status: { value: '工場' },
        detail_table: { value: [orderLine(amount)] },
    };

    if (aggregation !== 'OMIT') {
        record.aggregation_status = { value: aggregation };
    }

    return record;
};

const deliveryRecord = (manageNo, amount, aggregation, id) => {
    const record = {
        $id: { value: id || ('D-' + manageNo + '-' + String(aggregation)) },
        delivery_date: { value: day },
        customer_code: { value: 'M001' },
        customer_name: { value: '顧客' },
        delivery_detail: {
            value: [{
                value: {
                    manage_no: { value: manageNo },
                    item_name: { value: '丸洗い' },
                    qty: { value: '1' },
                    amount: { value: String(amount) },
                    kimono_type: { value: '訪問着' },
                    kimono_spec: { value: '' },
                },
            }],
        },
    };

    if (aggregation !== 'OMIT') {
        record.aggregation_status = { value: aggregation };
    }

    return record;
};

const project = (record, fields) => {
    const out = {};

    (fields || []).forEach((code) => {
        if (Object.prototype.hasOwnProperty.call(record, code)) {
            out[code] = record[code];
        }
    });

    return out;
};

const orders = [
    orderRecord('M-ACTIVE', 1000, '有効'),
    orderRecord('M-BLANK', 2000, ''),
    orderRecord('M-NONE', 3000, 'OMIT'),
    orderRecord('M-CANCEL', 4000, '取消', { process: '取消だけ工程' }),
    orderRecord('M-PAD', 999, ' 取消 '),
    orderRecord('OP-CANCEL-DEL', 10, '有効'),
    orderRecord('OP-DELIVERED', 20, '有効'),
    orderRecord('OP-BOTH', 30, '有効'),
];

const deliveries = [
    deliveryRecord('M-DEL-A', 100, '有効'),
    deliveryRecord('M-DEL-B', 200, ''),
    deliveryRecord('M-DEL-C', 400, '取消'),
    deliveryRecord('OP-CANCEL-DEL', 50, '取消'),
    deliveryRecord('OP-DELIVERED', 60, '有効'),
    deliveryRecord('OP-BOTH', 70, '有効', 'D-BOTH-ACTIVE'),
    deliveryRecord('OP-BOTH', 80, '取消', 'D-BOTH-CANCEL'),
];

const queries = [];

const api = async (path, method, body) => {
    queries.push(String(body.query || ''));

    const match = String(body.query || '').match(/limit\s+(\d+)\s+offset\s+(\d+)/);
    const limit = match ? Number(match[1]) : 500;
    const offset = match ? Number(match[2]) : 0;
    const source = body.app === 16 ? orders : (body.app === 19 ? deliveries : []);
    const page = source.slice(offset, offset + limit).map((record) => project(record, body.fields));

    return { records: page };
};

api.url = (requestPath) => requestPath;
global.kintone = { api };

const openNos = (report) => report.pipeline.openOrders.map((row) => row.manageNo);

const run = async () => {
    assert('有効は対象', Engine.isAggregationActive({ aggregation_status: { value: '有効' } }) === true);
    assert('空欄は対象', Engine.isAggregationActive({ aggregation_status: { value: '' } }) === true);
    assert('nullは対象', Engine.isAggregationActive({ aggregation_status: { value: null } }) === true);
    assert('未取得は対象', Engine.isAggregationActive({}) === true);
    assert('その他の値は対象', Engine.isAggregationActive({ aggregation_status: { value: '仮' } }) === true);
    assert('取消は対象外', Engine.isAggregationActive({ aggregation_status: { value: '取消' } }) === false);
    assert('空白付き取消は対象外', Engine.isAggregationActive({ aggregation_status: { value: ' 取消 ' } }) === false);

    const report = await Engine.buildReport({ preset: 'today' });
    const summary = report.summary.total;
    const nos = openNos(report);

    assert('App16 有効・空欄・未取得は受注枚数に入る', summary.orderKimono === 6);
    assert('App16 取消は受注金額に入らない', summary.orderAmount === 6060);
    assert('App19 有効と空欄は納品枚数に入る', summary.deliveryKimono === 4);
    assert('App19 取消は納品金額に入らない', summary.deliveryAmount === 430);
    assert('取消納品だけなら受注残に残る', nos.indexOf('OP-CANCEL-DEL') !== -1);
    assert('有効納品は受注残から外れる', nos.indexOf('OP-DELIVERED') === -1);
    assert('受注取消は受注残に入らない', nos.indexOf('M-CANCEL') === -1 && nos.indexOf('M-PAD') === -1);
    assert('有効納品と取消納品の両方は受注残から外れる', nos.indexOf('OP-BOTH') === -1);
    assert('有効・空欄・未取得の受注は受注残に残る', nos.indexOf('M-ACTIVE') !== -1
        && nos.indexOf('M-BLANK') !== -1
        && nos.indexOf('M-NONE') !== -1);
    assert('受注残は4件', report.pipeline.meta.openManageNoCount === 4);
    assert('在庫残金額は取消受注を含まない', report.pipeline.total.summary.openAmount === 6010);
    assert('取消受注の工程は工程別に出ない', report.pipeline.total.byProcessStatus.every((row) => row.name !== '取消だけ工程'));
    assert('全体状況の本日受注金額も同じ', report.overview.snapshots.today.segments.total.orderAmount === 6060);
    assert('全体状況の本日納品金額も同じ', report.overview.snapshots.today.segments.total.deliveryAmount === 430);
    assert('API queryは有効だけに絞っていない', queries.every((query) => query.indexOf('aggregation_status = "有効"') === -1
        && query.indexOf('aggregation_status not in') === -1));

    const desktop = fs.readFileSync(path.join(root, 'customize/business_dashboard_desktop.js'), 'utf8');
    const config = fs.readFileSync(path.join(root, 'customize/business_dashboard_config.js'), 'utf8');
    const money = fs.readFileSync(path.join(root, 'customize/business_dashboard_money.js'), 'utf8');

    assert('金額注記は残している', config.indexOf('受注金額は現在金額登録済み分（税抜）です。確定売上ではありません。') !== -1
        && desktop.indexOf('orderAmountNote') !== -1);
    assert('取消注記を表示する', config.indexOf('取消データは集計対象外') !== -1
        && desktop.indexOf('aggregationExclusionNote') !== -1);
    assert('お金の集計は未変更', money.indexOf('aggregation_status') === -1);

    if (failed) {
        console.error(JSON.stringify({
            orderKimono: summary.orderKimono,
            orderAmount: summary.orderAmount,
            deliveryKimono: summary.deliveryKimono,
            deliveryAmount: summary.deliveryAmount,
            open: nos,
        }, null, 2));
        process.exit(1);
    }

    console.log('\nAll business dashboard aggregation tests passed.');
};

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
