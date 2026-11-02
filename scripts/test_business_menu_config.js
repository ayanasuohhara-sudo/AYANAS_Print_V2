'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../customize/business_menu_config.js'), 'utf8'));

const C = global.CAYANAS_BUSINESS_MENU;
let failed = 0;

const assert = (name, cond) => {
    if (cond) {
        console.log('OK  ' + name);
        return;
    }
    failed += 1;
    console.error('FAIL ' + name);
};

assert('VERSION 1.1.0', C.VERSION === '1.1.0');
assert('App91', C.BUSINESS_MENU_APP_ID === 91);
assert('8分類', Array.isArray(C.CATEGORIES) && C.CATEGORIES.length === 8);

const byId = Object.fromEntries(C.CATEGORIES.map((c) => [c.id, c]));
assert('分類ID一式', ['order', 'logistics', 'billing', 'work', 'deadline', 'customer_schedule', 'analytics', 'masters']
    .every((id) => !!byId[id]));

const allItems = C.CATEGORIES.flatMap((c) => c.items || []);
const allAppIds = allItems.map((i) => i.appId);
assert('App85 を含めない', allAppIds.indexOf(85) < 0);

const logisticsLabels = (byId.logistics.items || []).map((i) => i.label);
assert('保管場所移動あり', logisticsLabels.indexOf('保管場所移動') >= 0);
assert('旧社内移動入庫ラベルなし', logisticsLabels.every((l) => l.indexOf('社内移動入庫') < 0));
assert('保管場所移動が先頭', (byId.logistics.items || [])[0].appId === 34);

const workLabels = (byId.work.items || []).map((i) => i.label);
assert('工場ポータル表記', workLabels.indexOf('工場作業状況ポータル') >= 0);
assert('店舗ポータル表記', workLabels.indexOf('店舗ポータル（A550）') >= 0);
assert('社内作業登録', workLabels.indexOf('社内作業登録') >= 0);
assert('検品・仕上げ完了', workLabels.indexOf('検品・仕上げ完了') >= 0);
assert('旧作業状況登録なし', workLabels.indexOf('作業状況登録') < 0);

const masterIds = (byId.masters.items || []).map((i) => i.appId);
assert('個人顧客マスタ App96', masterIds.indexOf(96) >= 0);

assert('店舗専用92を業務メニューに載せない', allAppIds.indexOf(92) < 0);
assert('店舗専用97を業務メニューに載せない', allAppIds.indexOf(97) < 0);

if (failed) {
    process.exit(1);
}

console.log('\nAll business menu config tests passed.');
