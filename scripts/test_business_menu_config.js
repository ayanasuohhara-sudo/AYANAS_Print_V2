'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../customize/hub_nav_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../customize/hub_nav.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../customize/business_menu_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../customize/factory_menu_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '../portal-customize/portal_business_banners_config.js'), 'utf8'));

const C = global.CAYANAS_BUSINESS_MENU;
const F = global.CAYANAS_FACTORY_MENU;
const P = global.CAYANAS_PORTAL_BUSINESS_BANNERS;
const Hub = global.CAYANAS_HubNav;
const desktop = fs.readFileSync(path.join(__dirname, '../customize/business_menu_desktop.js'), 'utf8');
const factoryDesktop = fs.readFileSync(path.join(__dirname, '../customize/factory_menu_desktop.js'), 'utf8');
const floorDesktop = fs.readFileSync(path.join(__dirname, '../customize/floor_portal_desktop.js'), 'utf8');
const floorCfg = fs.readFileSync(path.join(__dirname, '../customize/floor_portal_config.js'), 'utf8');

let failed = 0;

const assert = (name, cond) => {
    if (cond) {
        console.log('OK  ' + name);
        return;
    }
    failed += 1;
    console.error('FAIL ' + name);
};

assert('VERSION 2.0.0', C.VERSION === '2.0.0');
assert('App91', C.BUSINESS_MENU_APP_ID === 91);
assert('6分類', Array.isArray(C.CATEGORIES) && C.CATEGORIES.length === 6);

const byId = Object.fromEntries(C.CATEGORIES.map((c) => [c.id, c]));
assert('分類ID一式', ['store', 'factory', 'outsourcing', 'finance', 'schedule', 'masters']
    .every((id) => !!byId[id]));

const allItems = C.CATEGORIES.flatMap((c) => c.items || []);
const allAppIds = allItems.map((i) => i.appId);
assert('App85 を含めない', allAppIds.indexOf(85) < 0);
assert('App95 を含めない', allAppIds.indexOf(95) < 0);
assert('App99 を含めない', allAppIds.indexOf(99) < 0);
assert('App92 を業務メニューに載せない', allAppIds.indexOf(92) < 0);
assert('App97 を業務メニューに載せない', allAppIds.indexOf(97) < 0);
assert('App98 を予定・納期と工場に含む',
    (byId.schedule.items || []).some((i) => i.appId === 98)
    && (byId.factory.items || []).some((i) => i.appId === 98));
assert('店舗は App87 導線', (byId.store.items || [])[0].appId === 87);
assert('工場は App90 導線', (byId.factory.items || [])[0].appId === 90);
assert('外注に 27/28/74/78', [27, 28, 74, 78]
    .every((id) => (byId.outsourcing.items || []).some((i) => i.appId === id)));
assert('経理に 19/35/21/22/75', [19, 35, 21, 22, 75]
    .every((id) => (byId.finance.items || []).some((i) => i.appId === id)));
assert('予定に 89/94/98', [89, 94, 98]
    .every((id) => (byId.schedule.items || []).some((i) => i.appId === id)));
assert('正式名称 仕上げ完了登録',
    (byId.factory.items || []).some((i) => i.label === '仕上げ完了登録'));
assert('正式名称 社内入庫登録',
    (byId.factory.items || []).some((i) => i.label === '社内入庫登録'));
assert('旧 cat alias order→store', C.CATEGORY_ALIASES.order === 'store');
assert('旧 cat alias logistics→outsourcing', C.CATEGORY_ALIASES.logistics === 'outsourcing');

assert('工場メニュー VERSION 2.0.0', F.VERSION === '2.0.0');
assert('工場メニューに App98',
    F.SECTIONS.some((s) => (s.items || []).some((i) => i.appId === 98)));
assert('工場メニューに App86 維持',
    F.SECTIONS.some((s) => (s.items || []).some((i) => i.appId === 86)));

assert('ポータル先頭は店舗', P.CATEGORIES[0].appId === 87 && P.CATEGORIES[0].hub === true);
assert('ポータル2番目は工場', P.CATEGORIES[1].appId === 90 && P.CATEGORIES[1].hub === true);
assert('ポータルは8枠', P.CATEGORIES.length === 8);
assert('ポータル VERSION 2.0.0', P.VERSION === '2.0.0');

assert('共通ナビ部品あり', !!Hub && typeof Hub.renderHtml === 'function');
const navHtml = Hub.renderHtml({ activeAppId: 91 });
assert('ナビ TOP active', navHtml.indexOf('aria-current="page"') !== -1
    && navHtml.indexOf('>TOP<') !== -1);
assert('ナビに店舗・工場リンク', navHtml.indexOf('/k/87/') !== -1
    && navHtml.indexOf('/k/90/') !== -1);

assert('desktop が HubNav を使う', desktop.indexOf('CAYANAS_HubNav') !== -1);
assert('factory desktop が HubNav を使う', factoryDesktop.indexOf('CAYANAS_HubNav') !== -1);
assert('floor desktop が HubNav を使う', floorDesktop.indexOf('CAYANAS_HubNav') !== -1);
assert('floor に App97 通常リンクなし（storePayment メニュー）',
    !/storePayment',\s*label:/.test(floorCfg)
    && floorCfg.indexOf("label: '入金登録'") < 0);
assert('floor は 1.7.0 入金状況リンクを混入しない',
    floorCfg.indexOf('入金状況（受注一覧）') < 0
    && floorCfg.indexOf('入金履歴（参照・任意）') < 0);
assert('floor VERSION 1.8.0', /FLOOR_PORTAL_VERSION = '1\.8\.0'/.test(floorCfg));
assert('App92 は店舗メニューに残る', floorCfg.indexOf("appKey: 'storeDeadline'") !== -1);

if (failed) {
    process.exit(1);
}

console.log('\nAll business menu restructure tests passed.');
