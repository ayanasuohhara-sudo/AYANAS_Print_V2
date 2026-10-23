'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_deadline_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/store_deadline_engine.js'), 'utf8'));

const E = global.CAYANAS_StoreDeadlineEngine;
const C = global.CAYANAS_STORE_DEADLINE;
const desktop = fs.readFileSync(path.join(root, 'customize/store_deadline_desktop.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'customize/store_deadline.css'), 'utf8');
const app89Config = fs.readFileSync(path.join(root, 'customize/deadline_load_config.js'), 'utf8');

let failed = 0;

const assert = (name, cond) => {

    if (cond) {
        console.log('OK  ' + name);
        return;
    }

    failed += 1;
    console.error('FAIL ' + name);

};

const line = (code, name) => ({
    value: {
        item_code: { value: code },
        item_name: { value: name },
    },
});

const rec = (manageNo, deadline, lines, extra) => {

    const opts = extra || {};

    return {
        $id: { value: opts.id || manageNo || 'id' },
        manage_no: { value: manageNo },
        deadline: { value: deadline },
        customer_code: { value: opts.customerCode === undefined ? 'A550' : opts.customerCode },
        aggregation_status: { value: opts.aggregation === undefined ? '有効' : opts.aggregation },
        delivery_status: { value: opts.delivery || '未納品' },
        process_status: { value: opts.process || '工場作業中' },
        customer_name: { value: opts.customerName || '松葉屋' },
        client_name: { value: opts.clientName || '山田' },
        kimono_type: { value: '訪問着' },
        kimono_spec: { value: '袷' },
        work_status: { value: opts.work || '仕上げ中' },
        location_status: { value: opts.location || '本社' },
        detail_table: { value: lines },
    };

};

const products = new Map([
    ['DOM', '国内仕立'],
    ['OVS', '海外仕立'],
    ['OBI', '帯仕立'],
    ['WASH', '丸洗い'],
    ['STAIN', 'しみぬき'],
    ['REP', '修理・直し'],
    ['REP2', '修理'],
    ['ARA', '洗張り'],
    ['YAKE', '修理・直し'],
]);

const modelOf = (records, options) => E.aggregateMonth(records, products, 2026, 10, options);

const countsOn = (records, date, options) => E.dayCounts(modelOf(records, options), date);

const sumCounts = (counts) => C.CATEGORIES
    .reduce((total, category) => total + Number(counts[category.key] || 0), 0);

const TODAY = '2026-10-15';

const run = async () => {

    assert('App92 / A550', C.STORE_DEADLINE_APP_ID === 92
        && C.STORE_CUSTOMER_CODE === 'A550'
        && C.ORDER_APP_ID === 16
        && C.PRODUCT_APP_ID === 13);

    assert('表示順', C.CATEGORIES.map((c) => c.label).join(',')
        === '丸洗い・しみ,海外仕立,国内仕立,修理,帯仕立');
    assert('判定優先', C.CATEGORY_PRIORITY.join(',')
        === 'overseas,domestic,obi,repair,wash');

    const a550 = countsOn([
        rec('A001', '2026-10-10', [line('DOM', '国内仕立')]),
    ], '2026-10-10');
    assert('1 A550は表示', a550.domestic === 1);

    const other = countsOn([
        rec('B001', '2026-10-10', [line('DOM', '国内仕立')], { customerCode: 'B100' }),
    ], '2026-10-10');
    assert('2 A550以外は非表示', sumCounts(other) === 0);

    const cancelled = countsOn([
        rec('A002', '2026-10-10', [line('DOM', '国内仕立')], { aggregation: '取消' }),
    ], '2026-10-10');
    assert('3 取消は非表示', sumCounts(cancelled) === 0);

    const blankAgg = countsOn([
        rec('A003', '2026-10-10', [line('WASH', '丸洗い')], { aggregation: '' }),
    ], '2026-10-10');
    assert('集計空欄は対象', blankAgg.wash === 1);

    assert('4 海外仕立＋丸洗い→海外のみ', (() => {
        const c = countsOn([
            rec('A004', '2026-10-10', [line('OVS', '海外仕立'), line('WASH', '丸洗い')]),
        ], '2026-10-10');
        return c.overseas === 1 && c.wash === 0 && sumCounts(c) === 1;
    })());

    assert('5 国内仕立＋しみぬき→国内のみ', (() => {
        const c = countsOn([
            rec('A005', '2026-10-10', [line('DOM', '国内仕立'), line('STAIN', 'しみぬき')]),
        ], '2026-10-10');
        return c.domestic === 1 && c.wash === 0 && sumCounts(c) === 1;
    })());

    assert('6 帯仕立＋丸洗い→帯のみ', (() => {
        const c = countsOn([
            rec('A006', '2026-10-10', [line('OBI', '帯仕立'), line('WASH', '丸洗い')]),
        ], '2026-10-10');
        return c.obi === 1 && c.wash === 0 && sumCounts(c) === 1;
    })());

    assert('7 修理＋丸洗い→修理のみ', (() => {
        const c = countsOn([
            rec('A007', '2026-10-10', [line('REP', '修理・直し'), line('WASH', '丸洗い')]),
        ], '2026-10-10');
        return c.repair === 1 && c.wash === 0 && sumCounts(c) === 1;
    })());

    assert('App13 subcategory「修理」も修理分類', (() => {
        const c = countsOn([
            rec('A007b', '2026-10-10', [line('REP2', 'ヤケ直し')]),
        ], '2026-10-10');
        return c.repair === 1 && !c.uncategorized && sumCounts(c) === 1;
    })());

    assert('8 丸洗い＋しみぬき→丸洗い・しみのみ', (() => {
        const c = countsOn([
            rec('A008', '2026-10-10', [line('WASH', '丸洗い'), line('STAIN', 'しみぬき')]),
        ], '2026-10-10');
        return c.wash === 1 && sumCounts(c) === 1;
    })());

    assert('9 洗張りのみ対象外', sumCounts(countsOn([
        rec('A009', '2026-10-10', [line('ARA', '洗張り')]),
    ], '2026-10-10')) === 0);

    assert('洗張り＋国内→国内', countsOn([
        rec('A010', '2026-10-10', [line('ARA', '洗張り'), line('DOM', '国内仕立')]),
    ], '2026-10-10').domestic === 1);

    assert('海外＋ヤケ直し→海外', (() => {
        const c = countsOn([
            rec('A011', '2026-10-10', [line('OVS', '海外仕立'), line('YAKE', 'ヤケ直し')]),
        ], '2026-10-10');
        return c.overseas === 1 && c.repair === 0 && sumCounts(c) === 1;
    })());

    assert('10 重複計上しない', (() => {
        const c = countsOn([
            rec('A012', '2026-10-10', [
                line('OVS', '海外仕立'),
                line('DOM', '国内仕立'),
                line('WASH', '丸洗い'),
            ]),
        ], '2026-10-10');
        return c.overseas === 1 && sumCounts(c) === 1;
    })());

    const orderModel = modelOf([
        rec('W1', '2026-10-20', [line('WASH', '丸洗い')]),
        rec('O1', '2026-10-20', [line('OVS', '海外仕立')]),
        rec('D1', '2026-10-20', [line('DOM', '国内仕立')]),
        rec('R1', '2026-10-20', [line('REP', '修理・直し')]),
        rec('B1', '2026-10-20', [line('OBI', '帯仕立')]),
    ]);
    assert('11 画面表示順', E.visibleCountLines(E.dayCounts(orderModel, '2026-10-20'))
        .map((row) => row.label).join(',')
        === '丸洗い・しみ,海外仕立,国内仕立,修理,帯仕立');
    assert('明細グループ順', E.detailGroups(orderModel, '2026-10-20')
        .map((g) => g.label).join(',')
        === '丸洗い・しみ,海外仕立,国内仕立,修理,帯仕立');

    const kpiRecords = [
        rec('K1', '2026-10-01', [line('DOM', '国内仕立')], { id: 'k1' }),
        rec('K2', TODAY, [line('WASH', '丸洗い')], { id: 'k2' }),
        rec('K3', '2026-10-18', [line('OBI', '帯仕立')], { id: 'k3' }),
        rec('K4', '2026-10-30', [line('DOM', '国内仕立')], { id: 'k4' }),
        rec('K5', '', [line('DOM', '国内仕立')], {
            id: 'k5',
            process: '完了',
            delivery: '納品待ち',
            location: '店舗',
        }),
        rec('K6', '2026-09-01', [line('DOM', '国内仕立')], {
            id: 'k6',
            process: '完了',
            delivery: '納品待ち',
        }),
        rec('K7', '2026-10-01', [line('DOM', '国内仕立')], {
            id: 'k7',
            delivery: '納品済',
        }),
        rec('K8', '2026-10-01', [line('DOM', '国内仕立')], {
            id: 'k8',
            aggregation: '取消',
        }),
        rec('K9', TODAY, [line('DOM', '国内仕立')], {
            id: 'k9',
            customerCode: 'Z999',
        }),
    ];
    const kpi = E.buildKpiModel(kpiRecords, products, TODAY);

    assert('12 納期超過', kpi.counts.overdue === 2
        && kpi.lists.overdue.every((row) => row.deadline < TODAY));
    assert('13 本日納期', kpi.counts.today === 1
        && kpi.lists.today[0].manageNo === 'K2');
    assert('14 7日以内（本日含む）', kpi.counts.within7 === 2
        && kpi.lists.within7.map((row) => row.manageNo).sort().join(',') === 'K2,K3');
    assert('15 完了・納品待ち', kpi.counts.ready === 2
        && kpi.lists.ready.map((row) => row.manageNo).sort().join(',') === 'K5,K6');

    assert('16 deadline空欄はカレンダー外', Object.keys(modelOf([
        rec('E1', '', [line('DOM', '国内仕立')], {
            process: '完了',
            delivery: '納品待ち',
        }),
    ]).days).length === 0);

    assert('17 deadline空欄＋完了納品待ちはKPI', (() => {
        const model = E.buildKpiModel([
            rec('E2', '', [line('DOM', '国内仕立')], {
                process: '完了',
                delivery: '納品待ち',
            }),
        ], products, TODAY);
        return model.counts.ready === 1 && model.counts.overdue === 0;
    })());

    assert('納品済はカレンダー除外', sumCounts(countsOn([
        rec('D1', '2026-10-10', [line('DOM', '国内仕立')], { delivery: '納品済' }),
    ], '2026-10-10')) === 0);

    assert('納品済除外をオフにできる', countsOn([
        rec('D2', '2026-10-10', [line('DOM', '国内仕立')], { delivery: '納品済' }),
    ], '2026-10-10', { excludeDelivered: false }).domestic === 1);

    const pages = [];
    const fetched = await E.fetchAllPages(
        E.buildMonthQuery(2026, 10),
        async (query) => {
            pages.push(query);
            const offset = Number(query.match(/offset (\d+)/)[1]);

            if (offset === 0 || offset === 500) {
                return new Array(500);
            }

            if (offset === 1000) {
                return new Array(20);
            }

            return [];
        }
    );
    assert('18 100件超ページング', fetched.records.length === 1020
        && pages[0].indexOf('customer_code = "A550"') !== -1
        && pages[0].indexOf('deadline >= "2026-10-01"') !== -1);

    const prev = E.shiftMonth(2026, 10, -1);
    const next = E.shiftMonth(2026, 10, 1);
    assert('19 前月・次月・今日', prev.month === 9 && next.month === 11
        && E.todayParts(new Date(2026, 9, 15)).ymd === '2026-10-15'
        && E.addDaysYmd('2026-10-15', 7) === '2026-10-22');

    assert('20 App16 PUTなし', desktop.indexOf("'GET'") !== -1
        && desktop.indexOf('PUT') === -1
        && desktop.indexOf('DELETE') === -1
        && desktop.indexOf('POST') === -1
        && desktop.indexOf('STORE_DEADLINE_APP_ID') !== -1
        && desktop.indexOf('data-kpi') !== -1
        && desktop.indexOf('clientName') !== -1);

    assert('クエリ分離', E.buildOverdueQuery(TODAY).indexOf('deadline < "2026-10-15"') !== -1
        && E.buildOverdueQuery(TODAY).indexOf('not in ("納品済")') !== -1
        && E.buildWithin7Query(TODAY).indexOf('deadline <= "2026-10-22"') !== -1
        && E.buildReadyQuery().indexOf('process_status') === -1
        && E.buildReadyQuery().indexOf('delivery_status in ("納品待ち")') !== -1
        && E.buildKpiPoolQuery(TODAY).indexOf('customer_code = "A550"') !== -1
        && E.buildKpiPoolQuery(TODAY).indexOf('process_status') === -1
        && E.buildProductQuery([]) === '');

    assert('完了はクライアント判定', E.isReadyForPickup(rec('R', '', [line('DOM', 'x')], {
        process: '完了',
        delivery: '納品待ち',
    })) === true
        && E.isReadyForPickup(rec('R2', '', [line('DOM', 'x')], {
            process: '工場作業中',
            delivery: '納品待ち',
        })) === false);

    assert('App89非共用', desktop.indexOf('CAYANAS_DEADLINE_LOAD') === -1
        && desktop.indexOf('deadline_load') === -1
        && app89Config.indexOf('STORE_DEADLINE') === -1
        && C.VERSION === '1.0.4'
        && C.CATEGORIES.find((c) => c.key === 'repair').subcategories.indexOf('修理') !== -1
        && desktop.indexOf('productDenied') !== -1
        && desktop.indexOf('buildKpiPoolQuery') !== -1
        && desktop.indexOf('Number(kintone.app.getId())') !== -1
        && desktop.indexOf('ayanas-store-deadline-boot-error') !== -1);

    assert('iPad向け見た目', css.indexOf('min-height: 44px') !== -1
        && css.indexOf('overflow-x: auto') !== -1
        && css.indexOf('.is-overdue') !== -1
        && css.indexOf('.cayan-sd-kpi') !== -1);

    if (failed) {
        process.exit(1);
    }

    console.log('\nAll store deadline tests passed.');

};

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
