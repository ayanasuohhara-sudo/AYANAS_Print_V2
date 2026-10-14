'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/deadline_load_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/deadline_load_engine.js'), 'utf8'));

const E = global.CAYANAS_DeadlineLoadEngine;
const C = global.CAYANAS_DEADLINE_LOAD;
const desktop = fs.readFileSync(path.join(root, 'customize/deadline_load_desktop.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'customize/deadline_load.css'), 'utf8');

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
        aggregation_status: { value: opts.aggregation === undefined ? '有効' : opts.aggregation },
        delivery_status: { value: opts.delivery || '未納品' },
        customer_code: { value: opts.customerCode || 'C001' },
        customer_name: { value: opts.customerName || '顧客A' },
        client_name: { value: opts.clientName || 'お客様B' },
        kimono_type: { value: '訪問着' },
        kimono_spec: { value: '袷' },
        process_status: { value: '工場作業中' },
        work_status: { value: '仕上げ中' },
        location_status: { value: '工場' },
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
    ['ARA', '洗張り'],
]);

const modelOf = (records, options) => E.aggregateMonth(records, products, 2026, 10, options);

const countsOn = (records, date, options) => E.dayCounts(modelOf(records, options), date);

const sumCounts = (counts) => counts.tailoring + counts.wash + counts.repair;

const run = async () => {

    const domestic = countsOn([
        rec('A001', '2026-10-10', [line('DOM', '国内仕立')]),
    ], '2026-10-10');
    assert('1 国内仕立は仕立1', domestic.tailoring === 1 && domestic.wash === 0 && domestic.repair === 0);

    const overseas = countsOn([
        rec('A002', '2026-10-10', [line('OVS', '海外仕立')]),
    ], '2026-10-10');
    assert('2 海外仕立は仕立1', overseas.tailoring === 1 && sumCounts(overseas) === 1);

    const obi = countsOn([
        rec('A003', '2026-10-10', [line('OBI', '帯仕立')]),
    ], '2026-10-10');
    assert('3 帯仕立だけは0', sumCounts(obi) === 0);

    const wash = countsOn([
        rec('A004', '2026-10-10', [line('WASH', '丸洗い')]),
    ], '2026-10-10');
    assert('4 丸洗いは丸洗い・しみぬき1', wash.wash === 1 && wash.tailoring === 0);

    const stain = countsOn([
        rec('A005', '2026-10-10', [line('STAIN', 'しみぬき')]),
    ], '2026-10-10');
    assert('5 しみぬきは丸洗い・しみぬき1', stain.wash === 1 && sumCounts(stain) === 1);

    const bothWash = countsOn([
        rec('A006', '2026-10-10', [line('WASH', '丸洗い'), line('STAIN', 'しみぬき')]),
    ], '2026-10-10');
    assert('6 同一管理番号の丸洗い＋しみぬきは1', bothWash.wash === 1 && sumCounts(bothWash) === 1);

    const repair = countsOn([
        rec('A007', '2026-10-10', [line('REP', '修理・直し')]),
    ], '2026-10-10');
    assert('7 修理・直しは修理1', repair.repair === 1 && sumCounts(repair) === 1);

    const arai = countsOn([
        rec('A008', '2026-10-10', [line('ARA', '洗張り')]),
    ], '2026-10-10');
    assert('8 洗張りだけは0', sumCounts(arai) === 0);

    const araiDom = countsOn([
        rec('A009', '2026-10-10', [line('ARA', '洗張り'), line('DOM', '国内仕立')]),
    ], '2026-10-10');
    assert('9 洗張り＋国内仕立は仕立1', araiDom.tailoring === 1 && sumCounts(araiDom) === 1);

    const araiOvs = countsOn([
        rec('A010', '2026-10-10', [line('ARA', '洗張り'), line('OVS', '海外仕立')]),
    ], '2026-10-10');
    assert('10 洗張り＋海外仕立は仕立1', araiOvs.tailoring === 1 && sumCounts(araiOvs) === 1);

    const obiWash = countsOn([
        rec('A011', '2026-10-10', [line('OBI', '帯仕立'), line('WASH', '丸洗い')]),
    ], '2026-10-10');
    assert('11 帯仕立＋丸洗いは丸洗い・しみぬき1', obiWash.wash === 1 && obiWash.tailoring === 0);

    const domRepair = countsOn([
        rec('A012', '2026-10-10', [line('DOM', '国内仕立'), line('REP', '修理・直し')]),
    ], '2026-10-10');
    assert('12 国内仕立＋修理は仕立1・修理1', domRepair.tailoring === 1 && domRepair.repair === 1 && domRepair.wash === 0);

    const cancelled = modelOf([
        rec('A013', '2026-10-10', [line('DOM', '国内仕立')], { aggregation: '取消' }),
    ]);
    assert('13 取消は除外', sumCounts(E.dayCounts(cancelled, '2026-10-10')) === 0
        && E.dayRows(cancelled, '2026-10-10').length === 0);

    const blankAgg = countsOn([
        rec('A014', '2026-10-10', [line('DOM', '国内仕立')], { aggregation: '' }),
    ], '2026-10-10');
    assert('14 集計ステータス空欄は対象', blankAgg.tailoring === 1);

    const noDeadline = modelOf([
        rec('A015', '', [line('DOM', '国内仕立')]),
    ]);
    assert('15 納期空欄は対象外', Object.keys(noDeadline.days).length === 0);

    const delivered = countsOn([
        rec('A016', '2026-10-11', [line('DOM', '国内仕立')], { delivery: '納品済' }),
    ], '2026-10-11');
    assert('納品済も納期どおり数える', delivered.tailoring === 1);
    const openOnly = countsOn([
        rec('A016', '2026-10-11', [line('DOM', '国内仕立')], { delivery: '納品済' }),
    ], '2026-10-11', { openOrdersOnly: true });
    assert('受注残だけは後から除外できる', sumCounts(openOnly) === 0);

    const guessed = countsOn([
        rec('A017', '2026-10-10', [line('OBI', '国内仕立')]),
    ], '2026-10-10');
    assert('品名が仕立でも帯仕立コードは0', sumCounts(guessed) === 0);

    const codeWins = countsOn([
        rec('A018', '2026-10-10', [line('DOM', '帯仕立')]),
    ], '2026-10-10');
    assert('品名ではなく商品コードの中分類', codeWins.tailoring === 1);

    const obiAndTailor = countsOn([
        rec('A019', '2026-10-10', [line('OBI', '帯仕立'), line('DOM', '国内仕立')]),
    ], '2026-10-10');
    assert('帯仕立＋国内仕立は仕立1', obiAndTailor.tailoring === 1 && sumCounts(obiAndTailor) === 1);

    const mixedDay = modelOf([
        rec('A012', '2026-10-10', [line('ARA', '洗張り'), line('DOM', '国内仕立'), line('REP', '修理・直し')], {
            id: '16-12',
            customerCode: 'C100',
            customerName: '松葉',
            clientName: '山田',
        }),
    ]);
    const mixedRows = E.dayRows(mixedDay, '2026-10-10');
    assert('19 日付明細', mixedRows.length === 1
        && mixedRows[0].manageNo === 'A012'
        && mixedRows[0].customerCode === 'C100'
        && mixedRows[0].customerName === '松葉'
        && mixedRows[0].clientName === '山田'
        && mixedRows[0].kimonoType === '訪問着'
        && mixedRows[0].kimonoSpec === '袷'
        && mixedRows[0].processing === '洗張り / 国内仕立 / 修理・直し'
        && mixedRows[0].categoriesLabel === '仕立 / 修理'
        && mixedRows[0].processStatus === '工場作業中'
        && mixedRows[0].workStatus === '仕上げ中'
        && mixedRows[0].locationStatus === '工場'
        && mixedRows[0].recordId === '16-12');
    assert('19 明細見出し', E.formatLongDate('2026-10-10') === '2026年10月10日'
        && E.detailCountText(1) === '納期明細 1件');
    assert('0件分類はセルに出さない', E.visibleCountLines(E.dayCounts(mixedDay, '2026-10-10'))
        .map((lineItem) => lineItem.label + lineItem.count).join(',') === '仕立1,修理1');

    const dup = modelOf([
        rec('A020', '2026-10-12', [line('DOM', '国内仕立')], { id: '1' }),
        rec('A020', '2026-10-12', [line('REP', '修理・直し')], { id: '2' }),
        rec('A021', '2026-10-12', [line('DOM', '国内仕立')], { id: '3' }),
    ]);
    const dupCounts = E.dayCounts(dup, '2026-10-12');
    const dupRows = E.dayRows(dup, '2026-10-12');
    assert('21 同一納期の重複管理番号は二重に数えない', dupCounts.tailoring === 2
        && dupCounts.repair === 1
        && dupRows.length === 3
        && dupRows.filter((row) => row.manageNo === 'A020' && row.duplicate).length === 2
        && dupRows.filter((row) => row.manageNo === 'A021' && row.duplicate).length === 0);

    const otherDay = countsOn([
        rec('A020', '2026-10-13', [line('DOM', '国内仕立')]),
    ], '2026-10-13');
    assert('別納期の同じ管理番号はそれぞれの日で1', otherDay.tailoring === 1);

    const blanks = modelOf([
        rec('', '2026-10-14', [line('DOM', '国内仕立')], { id: 'b1' }),
        rec('', '2026-10-14', [line('DOM', '国内仕立')], { id: 'b2' }),
    ]);
    assert('管理番号なしは1件にまとめない', E.dayCounts(blanks, '2026-10-14').tailoring === 2
        && E.dayRows(blanks, '2026-10-14').every((row) => !row.duplicate));

    const outside = modelOf([
        rec('A030', '2026-11-01', [line('DOM', '国内仕立')]),
        rec('A031', '2026-09-30', [line('WASH', '丸洗い')]),
    ]);
    assert('表示月の外は集計しない', Object.keys(outside.days).length === 0);

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
    assert('16 100件超をページング', fetched.records.length === 1020
        && fetched.truncated === false
        && pages.length === 3
        && pages[0].indexOf('limit 500 offset 0') !== -1
        && pages[1].indexOf('offset 500') !== -1
        && pages[2].indexOf('offset 1000') !== -1
        && pages[0].indexOf('deadline >= "2026-10-01"') !== -1
        && pages[0].indexOf('deadline <= "2026-10-31"') !== -1
        && pages[0].indexOf('取消') === -1
        && pages[0].indexOf('納品済') === -1);

    const prev = E.shiftMonth(2026, 10, -1);
    const next = E.shiftMonth(2026, 10, 1);
    const yearBack = E.shiftMonth(2026, 1, -1);
    const yearFwd = E.shiftMonth(2026, 12, 1);
    assert('17 前月・翌月', prev.year === 2026 && prev.month === 9
        && next.year === 2026 && next.month === 11
        && yearBack.year === 2025 && yearBack.month === 12
        && yearFwd.year === 2027 && yearFwd.month === 1
        && E.monthBounds(2026, 10).label === '2026年10月');

    const today = E.todayParts(new Date(2026, 9, 14));
    assert('18 今日', today.year === 2026 && today.month === 10
        && today.day === 14 && today.ymd === '2026-10-14');

    assert('20 App16詳細リンク', E.orderDetailPath('16-12') === '/k/16/show#record=16-12');

    const weeks = E.buildCalendarWeeks(2026, 10);
    assert('月曜始まり', weeks[0][0] === null
        && weeks[0][3]
        && weeks[0][3].ymd === '2026-10-01'
        && weeks[0][3].weekdayIndex === 3
        && C.WEEKDAY_LABELS.join('') === '月火水木金土日');

    const codes = [];

    for (let index = 0; index < 101; index += 1) {
        codes.push('P' + index);
    }

    const chunks = E.chunkItemCodes(E.collectItemCodes([
        rec('Z', '2026-10-01', codes.map((code) => line(code, '名称' + code))),
        rec('Z2', '2026-10-01', [line('P0', '再掲'), line('', 'コードなし')]),
    ]));
    assert('商品コードは重複取得しない', chunks.length === 2
        && chunks[0].length === 100
        && chunks[1].length === 1
        && chunks[0][0] === 'P0');
    assert('商品クエリはコードだけ', E.buildProductQuery(['DOM', 'A"B']).indexOf('item_code in (') === 0
        && E.buildProductQuery(['DOM', 'A"B']).indexOf('"A\\"B"') !== -1
        && E.buildProductQuery(['DOM']).indexOf('item_name') === -1);

    const mapped = E.buildSubcategoryMap([
        { item_code: { value: 'DOM' }, subcategory: { value: '国内仕立' }, item_name: { value: '別物' } },
        { item_code: { value: 'DOM' }, subcategory: { value: '帯仕立' } },
    ]);
    assert('同じ商品コードは最初の中分類', mapped.get('DOM') === '国内仕立');

    assert('上限未設定では負荷判定を出さない', E.loadLevel(10, null) === ''
        && E.loadLevel(10, C.LIMITS.tailoring) === '');
    assert('上限を渡すと将来判定できる', E.loadLevel(10, 10) === '満杯'
        && E.loadLevel(8, 10) === '注意'
        && E.loadLevel(7, 10) === '余裕');

    assert('App89', C.DEADLINE_LOAD_APP_ID === 89
        && C.ORDER_APP_ID === 16
        && C.PRODUCT_APP_ID === 13);
    assert('帯仕立は分類表に無い', JSON.stringify(C.CATEGORIES).indexOf('帯仕立') === -1
        && JSON.stringify(C.CATEGORIES).indexOf('洗張り') === -1);
    assert('画面は参照専用', desktop.indexOf("'GET'") !== -1
        && desktop.indexOf('PUT') === -1
        && desktop.indexOf('DELETE') === -1
        && desktop.indexOf('DEADLINE_LOAD_APP_ID') !== -1
        && desktop.indexOf('cayan-dl-prev') !== -1
        && desktop.indexOf('cayan-dl-next') !== -1
        && desktop.indexOf('cayan-dl-today') !== -1
        && desktop.indexOf('data-ymd') !== -1
        && desktop.indexOf('target="_blank"') !== -1
        && desktop.indexOf('orderDetailPath') !== -1
        && desktop.indexOf('openOrdersOnly') === -1);
    assert('土日と今日の見た目', css.indexOf('overflow-x: auto') !== -1
        && css.indexOf('.is-today') !== -1
        && css.indexOf('.is-sat') !== -1
        && css.indexOf('.is-sun') !== -1
        && css.indexOf('minmax(132px, 1fr)') !== -1);

    if (failed) {
        process.exit(1);
    }

    console.log('\nAll deadline load tests passed.');

};

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
