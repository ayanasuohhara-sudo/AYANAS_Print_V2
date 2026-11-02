'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;

vm.runInThisContext(
  fs.readFileSync(path.join(root, 'customize/schedule_customer.js'), 'utf8')
);

const S = global.CAYANAS_ScheduleCustomer;
const src1 = fs.readFileSync(path.join(root, 'customize/schedule_customer.js'), 'utf8');
const src2 = fs.readFileSync(path.join(root, 'customize/schedule_customer2.js'), 'utf8');

let failed = 0;

const assert = (name, cond) => {
  if (cond) {
    console.log('OK  ' + name);
    return;
  }
  failed += 1;
  console.error('FAIL ' + name);
};

assert('API exported', Boolean(S && S.buildCustomerSearchQuery && S.escapeQueryValue && S.buildCustomerMap));
assert('VIEW_ID', S.VIEW_ID === 5521026);
assert('APP_ID', S.APP_ID === 16);
assert('DELIVERY_DONE is 納品済', S.DELIVERY_DONE === '納品済');

const q = S.buildCustomerSearchQuery('m032');
assert(
  '1 顧客コード + 納品済除外',
  q === 'customer_code = "m032" and (delivery_status not in ("納品済") or delivery_status in (""))'
);
assert('2 process_status を含めない', q.indexOf('process_status') === -1);
assert('3 != を使わない', q.indexOf('!=') === -1);

assert('6 空コードは空クエリ', S.buildCustomerSearchQuery('') === '');
assert('7 空白のみは空クエリ', S.buildCustomerSearchQuery('   ') === '');

const escaped = S.buildCustomerSearchQuery('a"b\\c');
assert(
  '8 特殊文字エスケープ',
  escaped === 'customer_code = "a\\"b\\\\c" and (delivery_status not in ("納品済") or delivery_status in (""))'
);

assert(
  '9 schedule_customer2 は無効化（イベント登録なし）',
  src2.indexOf('kintone.events.on') === -1
    && src2.indexOf('customer-filter') === -1
);

assert('10 VIEW ガードあり', src1.indexOf('event.viewId !== VIEW_ID') !== -1);
assert('11 全件は query なし URL', src1.indexOf("navigateByCustomerCode('')") !== -1
  || src1.indexOf('navigateByCustomerCode("")') !== -1
  || src1.indexOf("buildViewUrl('')") !== -1);

assert('12 ドロップダウンUIあり', src1.indexOf("customer-filter") !== -1
  && src1.indexOf('顧客選択') !== -1);
assert('13 コード入力UIあり', src1.indexOf('customer-code-search') !== -1
  && src1.indexOf('顧客コード') !== -1);
assert('14 UI二重防止', src1.indexOf('schedule-customer-toolbar') !== -1
  && src1.indexOf("getElementById('customer-filter')") !== -1);

const map = S.buildCustomerMap([
  { customer_code: { value: 'A001' }, customer_name: { value: '甲' } },
  { customer_code: { value: 'A001' }, customer_name: { value: '甲' } },
  { customer_code: { value: '  ' }, customer_name: { value: '無視' } },
  { customer_code: { value: 'B002' }, customer_name: { value: '乙' } },
]);
assert('15 顧客マップ重複排除', Object.keys(map).sort().join(',') === 'A001,B002'
  && map.A001 === '甲' && map.B002 === '乙');

assert(
  '16 ドロップダウン読込も納品済除外',
  src1.indexOf('undeliveredCondition()') !== -1
    && S.undeliveredCondition().indexOf('delivery_status not in') !== -1
);

if (failed) {
  console.error('\n' + failed + ' assertion(s) failed');
  process.exit(1);
}

console.log('\nAll tests passed');
