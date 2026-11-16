'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/business_dashboard_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/business_dashboard_monthly_engine.js'), 'utf8'));

const C = global.CAYANAS_BUSINESS_DASHBOARD;
const M = global.CAYANAS_BusinessDashboardMonthly;

let failed = 0;
const assert = (name, cond) => {
    if (cond) {
        console.log('OK  ' + name);
        return;
    }
    failed += 1;
    console.error('FAIL ' + name);
};

assert('dashboard VERSION 1.7.1', global.CAYANAS_BUSINESS_DASHBOARD_VERSION === '1.7.1');
assert('monthly engine 1.1.0', M.VERSION === '1.1.0');
assert('MONTHLY defined', !!C.MONTHLY);
assert('month order starts Aug', C.MONTHLY.MONTH_ORDER[0] === 8 && C.MONTHLY.MONTH_ORDER[11] === 7);
assert('data start', C.MONTHLY.DATA_START_DATE === '2026-03-24');
assert('domestic kimono key', C.MONTHLY.DOMESTIC_KIMONO_SUBCATEGORY === '国内仕立');
assert('obi key', C.MONTHLY.OBI_SUBCATEGORY === '帯仕立');

assert('normalize 洗い張り→洗張り', M.normalizeSubcategory('洗い張り') === '洗張り');
assert('normalize 修理・直し→修理', M.normalizeSubcategory('修理・直し') === '修理');
assert('normalize 海外仕立', M.normalizeSubcategory('海外仕立') === '海外仕立');

assert('route overseas', M.classifyKimonoRoute(['紋入れ', '海外仕立', '湯のし']) === 'overseas');
assert('route domestic kimono', M.classifyKimonoRoute(['国内仕立', 'ガード']) === 'domestic');
assert('route obi', M.classifyKimonoRoute(['帯仕立']) === 'obi');
assert('route other', M.classifyKimonoRoute(['丸洗い']) === 'other');
assert('route conflict overseas+obi', M.classifyKimonoRoute(['海外仕立', '帯仕立']) === 'conflict');
assert('route conflict domestic+obi', M.classifyKimonoRoute(['国内仕立', '帯仕立']) === 'conflict');

const detail = M.classifyTailorRouteDetail(['海外仕立', '帯仕立']);
assert('conflict detail flags', detail.isConflict === true && detail.tailorCategories.join(',') === 'overseas,obi');

const fy = M.fiscalYearRange(2026);
assert('fiscal label', fy.label === '2026年度');
assert('fiscal start Aug1', fy.startDate === '2026-08-01');
assert('fiscal end Jul31', fy.endDate === '2027-07-31');
assert('12 months', fy.months.length === 12);
assert('first month Aug', fy.months[0].month === 8 && fy.months[0].year === 2026);
assert('last month Jul', fy.months[11].month === 7 && fy.months[11].year === 2027);

assert('status future', M.monthStatus(fy.months[11], '2026-11-16', '2026-03-24') === 'future');
assert('status ready Nov', M.monthStatus(
    { start: '2026-11-01', end: '2026-11-30' },
    '2026-11-16',
    '2026-03-24'
) === 'ready');
assert('status before data', M.monthStatus(
    { start: '2025-08-01', end: '2025-08-31' },
    '2026-11-16',
    '2026-03-24'
) === 'before_data');

const products = [
    {
        item_code: { value: 'OV1' },
        item_name: { value: '海外仕立' },
        subcategory: { value: '海外仕立' },
    },
    {
        item_code: { value: 'DM1' },
        item_name: { value: '国内仕立' },
        subcategory: { value: '国内仕立' },
    },
    {
        item_code: { value: 'OB1' },
        item_name: { value: '帯仕立' },
        subcategory: { value: '帯仕立' },
    },
    {
        item_code: { value: 'AD1' },
        item_name: { value: '紋入れ' },
        subcategory: { value: '紋入れ' },
    },
    {
        item_code: { value: 'AR1' },
        item_name: { value: '洗い張り旧' },
        subcategory: { value: '洗い張り' },
    },
];

const lookup = M.buildProductLookup(products);
assert('alias in lookup', lookup.byCode.get('AR1') === '洗張り');

const orderOverseasAddon = {
    manage_no: { value: 'M1' },
    order_date: { value: '2026-11-10' },
    customer_code: { value: 'C1' },
    customer_name: { value: '得意先A' },
    kimono_type: { value: '訪問着' },
    kimono_spec: { value: '袷' },
    aggregation_status: { value: '有効' },
    detail_table: {
        value: [
            {
                value: {
                    item_code: { value: 'OV1' },
                    item_name: { value: '海外仕立' },
                    qty: { value: '1' },
                    amount: { value: '15000' },
                },
            },
            {
                value: {
                    item_code: { value: 'AD1' },
                    item_name: { value: '紋入れ' },
                    qty: { value: '1' },
                    amount: { value: '4000' },
                },
            },
        ],
    },
};

const analyzed = M.analyzeOrder(orderOverseasAddon, lookup);
assert('kimono overseas', analyzed.route === 'overseas' && analyzed.isTailorKimono);
assert('amount separable', analyzed.amountSeparable === true);
assert('tailor amount 15000', analyzed.tailorAmount === 15000);
assert('addon amount 4000', analyzed.addonAmount === 4000);
assert('order total 19000', analyzed.orderTotal === 19000);

const cancelled = {
    ...orderOverseasAddon,
    manage_no: { value: 'M2' },
    aggregation_status: { value: '取消' },
};

const domestic = {
    manage_no: { value: 'M3' },
    order_date: { value: '2026-11-05' },
    customer_code: { value: 'C2' },
    customer_name: { value: '得意先B' },
    kimono_type: { value: '小紋' },
    kimono_spec: { value: '単衣' },
    aggregation_status: { value: '' },
    detail_table: {
        value: [
            {
                value: {
                    item_code: { value: 'DM1' },
                    item_name: { value: '国内仕立' },
                    qty: { value: '1' },
                    amount: { value: '12000' },
                },
            },
        ],
    },
};

const obi = {
    manage_no: { value: 'M5' },
    order_date: { value: '2026-11-08' },
    customer_code: { value: 'C3' },
    customer_name: { value: '得意先C' },
    kimono_type: { value: '名古屋帯' },
    kimono_spec: { value: '—' },
    aggregation_status: { value: '有効' },
    detail_table: {
        value: [
            {
                value: {
                    item_code: { value: 'OB1' },
                    item_name: { value: '帯仕立' },
                    qty: { value: '1' },
                    amount: { value: '8000' },
                },
            },
        ],
    },
};

const conflict = {
    manage_no: { value: 'M6' },
    order_date: { value: '2026-09-05' },
    customer_code: { value: 'C4' },
    customer_name: { value: '得意先D' },
    kimono_type: { value: '訪問着' },
    kimono_spec: { value: '袷' },
    aggregation_status: { value: '有効' },
    detail_table: {
        value: [
            {
                value: {
                    item_code: { value: 'OV1' },
                    item_name: { value: '海外仕立' },
                    qty: { value: '1' },
                    amount: { value: '15000' },
                },
            },
            {
                value: {
                    item_code: { value: 'OB1' },
                    item_name: { value: '帯仕立' },
                    qty: { value: '1' },
                    amount: { value: '8000' },
                },
            },
        ],
    },
};

const conflictAnalyzed = M.analyzeOrder(conflict, lookup);
assert('conflict not countable', conflictAnalyzed.route === 'conflict'
    && conflictAnalyzed.isConflict === true
    && conflictAnalyzed.isTailorKimono === false);

const octOverseas = {
    ...orderOverseasAddon,
    manage_no: { value: 'M4' },
    order_date: { value: '2026-10-20' },
};

(async () => {
    const report = await M.buildMonthlyReport({
        fiscalStartYear: 2026,
        route: 'all',
        asOfDate: '2026-11-16',
        selectedMonthKey: '2026-11',
        orders: [orderOverseasAddon, cancelled, domestic, octOverseas, obi, conflict],
        products,
        deliveredManageNos: new Set(['M4']),
    });

    assert('series 12', report.series.length === 12);
    const nov = report.series.find((r) => r.key === '2026-11');
    assert('nov ready', nov.status === 'ready');
    assert('nov overseas 1', nov.overseasKimono === 1);
    assert('nov domestic 1', nov.domesticKimono === 1);
    assert('nov obi 1', nov.obiKimono === 1);
    assert('nov total 3', nov.tailorKimono === 3);
    assert('cancelled excluded', report.meta.analyzedCount === 5);

    const oct = report.series.find((r) => r.key === '2026-10');
    assert('oct overseas 1', oct.overseasKimono === 1);
    assert('nov mom vs oct', nov.mom === 2);

    const aug = report.series.find((r) => r.key === '2026-08');
    assert('aug ready zero', aug.status === 'ready' && aug.filteredKimono === 0);

    const jul = report.series.find((r) => r.key === '2027-07');
    assert('jul future', jul.status === 'future');

    assert('selected amounts separable', report.selectedMonth.amountSeparable === true);
    assert('selected tailor amount', report.selectedMonth.tailorAmount === 35000);
    assert('selected addon', report.selectedMonth.addonAmount === 4000);
    assert('avg order', Math.round(report.selectedMonth.avgOrderUnitPrice) === 13000);

    assert('backlog excludes delivered and conflict', report.backlog.openKimono === 3);
    assert('customer matrix rows', report.customerMatrix.length >= 2);
    assert('no yoy field', report.series.every((r) => r.yoy === undefined));
    assert('conflict reported', report.conflictCount === 1
        && report.conflicts[0].manageNo === 'M6');
    assert('year totals exclude conflict', report.yearTotals.overseasKimono === 2
        && report.yearTotals.domesticKimono === 1
        && report.yearTotals.obiKimono === 1
        && report.yearTotals.tailorKimono === 4
        && report.yearTotals.conflictCount === 1);

    const overseasOnly = await M.buildMonthlyReport({
        fiscalStartYear: 2026,
        route: 'overseas',
        asOfDate: '2026-11-16',
        selectedMonthKey: '2026-11',
        orders: [orderOverseasAddon, cancelled, domestic, octOverseas, obi, conflict],
        products,
        deliveredManageNos: new Set(),
    });
    const novO = overseasOnly.series.find((r) => r.key === '2026-11');
    assert('overseas filter count', novO.filteredKimono === 1);

    const obiOnly = await M.buildMonthlyReport({
        fiscalStartYear: 2026,
        route: 'obi',
        asOfDate: '2026-11-16',
        selectedMonthKey: '2026-11',
        orders: [orderOverseasAddon, cancelled, domestic, octOverseas, obi, conflict],
        products,
        deliveredManageNos: new Set(),
    });
    const novObi = obiOnly.series.find((r) => r.key === '2026-11');
    assert('obi filter count', novObi.filteredKimono === 1);

    const domesticOnly = await M.buildMonthlyReport({
        fiscalStartYear: 2026,
        route: 'domestic',
        asOfDate: '2026-11-16',
        selectedMonthKey: '2026-11',
        orders: [orderOverseasAddon, cancelled, domestic, octOverseas, obi, conflict],
        products,
        deliveredManageNos: new Set(),
    });
    const novD = domesticOnly.series.find((r) => r.key === '2026-11');
    assert('domestic filter excludes obi', novD.filteredKimono === 1);

    const desktop = fs.readFileSync(path.join(root, 'customize/business_dashboard_desktop.js'), 'utf8');
    assert('desktop has monthly tab', desktop.indexOf('経営月次') >= 0);
    assert('desktop has obi column', desktop.indexOf('monthlyColObi') >= 0);
    assert('desktop has obi route', desktop.indexOf("data-bd-m-route=\"${id}\"") >= 0
        || desktop.indexOf("routeBtn('obi'") >= 0);
    assert('desktop conflict section', desktop.indexOf('renderMonthlyConflicts') >= 0);
    assert('desktop uses Monthly engine', desktop.indexOf('CAYANAS_BusinessDashboardMonthly') >= 0);

    // daily desktop markers unchanged (smoke)
    assert('daily overview still present', desktop.indexOf('ayanas-bd-overview-table') >= 0);

    if (failed) {
        process.exit(1);
    }
    console.log('\nAll business dashboard monthly tests passed.');
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
