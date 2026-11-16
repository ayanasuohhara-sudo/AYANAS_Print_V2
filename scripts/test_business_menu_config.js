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

assert('VERSION 3.0.0', C.VERSION === '3.0.0');
assert('App91', C.BUSINESS_MENU_APP_ID === 91);
assert('DEFAULT home', C.DEFAULT_CATEGORY === 'home');
assert('USE_HUB_NAV', C.USE_HUB_NAV === true);

assert('11項目 MENU_ITEMS', Array.isArray(C.MENU_ITEMS) && C.MENU_ITEMS.length === 11);

const expectedOrder = [
    ['order', 'direct', 16],
    ['outsource_out', 'direct', 27],
    ['wasai_out', 'direct', 74],
    ['inbound', 'direct', 78],
    ['overseas_out', 'direct', 28],
    ['delivery', 'direct', 19],
    ['invoice', 'direct', 35],
    ['deadline', 'menu', null],
    ['store', 'direct', 87],
    ['factory', 'direct', 90],
    ['masters', 'menu', null],
];

expectedOrder.forEach(([id, mode, appId], index) => {
    const item = C.MENU_ITEMS[index];
    assert('順序' + (index + 1) + ' id=' + id, item && item.id === id);
    assert('順序' + (index + 1) + ' mode=' + mode, item && item.mode === mode);
    if (appId != null) {
        assert('順序' + (index + 1) + ' app=' + appId, item && item.directAppId === appId);
    }
});

assert('ラベル 受注登録', C.MENU_ITEMS[0].label === '受注登録');
assert('ラベル 外注入庫', C.MENU_ITEMS[3].label === '外注入庫');
assert('ラベル 納期', C.MENU_ITEMS[7].label === '納期');
assert('ラベル 店舗', C.MENU_ITEMS[8].label === '店舗');
assert('ラベル 工場', C.MENU_ITEMS[9].label === '工場');
assert('ラベル マスタ', C.MENU_ITEMS[10].label === 'マスタ');

const byId = Object.fromEntries(C.MENU_ITEMS.map((item) => [item.id, item]));
assert('店舗は1件のみ', C.MENU_ITEMS.filter((i) => i.id === 'store').length === 1);
assert('工場は1件のみ', C.MENU_ITEMS.filter((i) => i.id === 'factory').length === 1);
assert('店舗→87', byId.store.directAppId === 87);
assert('工場→90', byId.factory.directAppId === 90);
assert('外注入庫→78', byId.inbound.directAppId === 78);

const deadlineApps = (byId.deadline.items || []).map((i) => i.appId);
assert('納期に 89/94/98', [89, 94, 98].every((id) => deadlineApps.indexOf(id) >= 0));
assert('納期先頭は App89', deadlineApps[0] === 89);

const masterApps = (byId.masters.items || []).map((i) => i.appId);
assert('マスタに既存一覧', [8, 96, 11, 13, 14, 73, 23, 26]
    .every((id) => masterApps.indexOf(id) >= 0));

const allDirectIds = C.MENU_ITEMS
    .filter((i) => i.mode === 'direct')
    .map((i) => i.directAppId);
const allSubIds = C.MENU_ITEMS
    .filter((i) => i.mode === 'menu')
    .flatMap((i) => (i.items || []).map((x) => x.appId));
const allAppIds = allDirectIds.concat(allSubIds);

assert('App85 を含めない', allAppIds.indexOf(85) < 0);
assert('App95 を含めない', allAppIds.indexOf(95) < 0);
assert('App99 を含めない', allAppIds.indexOf(99) < 0);
assert('App92 を業務メニューに載せない', allAppIds.indexOf(92) < 0);
assert('App97 を業務メニューに載せない', allAppIds.indexOf(97) < 0);

assert('alias store→home', C.CATEGORY_ALIASES.store === 'home');
assert('alias factory→home', C.CATEGORY_ALIASES.factory === 'home');
assert('alias schedule→deadline', C.CATEGORY_ALIASES.schedule === 'deadline');
assert('alias masters→masters', C.CATEGORY_ALIASES.masters === 'masters');

const cats = C.CATEGORIES;
assert('CATEGORIES に home', Array.isArray(cats) && cats.some((c) => c.id === 'home'));
assert('CATEGORIES に deadline/masters',
    cats.some((c) => c.id === 'deadline') && cats.some((c) => c.id === 'masters'));

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
assert('desktop がホームタイルを描画', desktop.indexOf('cayan-bm-home__tile') !== -1);
assert('desktop が MENU_ITEMS を使う', desktop.indexOf('MENU_ITEMS') !== -1);
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

console.log('\nAll business menu flat-11 tests passed.');
