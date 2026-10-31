'use strict';

/**
 * 工場入庫 planFactoryInbound の単体テスト（Node）
 * node scripts/test_factory_inbound_engine.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

const loadFactoryInbound = () => {

    global.window = global;
    global.CAYANAS_FACTORY_INBOUND = undefined;
    global.CAYANAS_FactoryInboundEngine = undefined;

    const configSrc = fs.readFileSync(path.join(root, 'customize/factory_inbound_config.js'), 'utf8');
    const engineSrc = fs.readFileSync(path.join(root, 'customize/factory_inbound_engine.js'), 'utf8');

    vm.runInThisContext(configSrc, { filename: 'factory_inbound_config.js' });
    vm.runInThisContext(engineSrc, { filename: 'factory_inbound_engine.js' });

    return global.CAYANAS_FactoryInboundEngine;

};

const Engine = loadFactoryInbound();
const plan = Engine.planFactoryInbound;

const resolved = { hasMaruarai: true, unresolvedCount: 0 };
const noMaru = { hasMaruarai: false, unresolvedCount: 0 };
const unresolved = { hasMaruarai: false, unresolvedCount: 1 };

const cases = [
    {
        name: 'ケース1 店舗+丸洗いあり',
        from: '店舗',
        analysis: resolved,
        expect: { action: 'put', workStatus: '丸洗い待ち' },
    },
    {
        name: 'ケース2 店舗+しみのみ(丸洗いなし)',
        from: '店舗',
        analysis: noMaru,
        expect: { action: 'put', workStatus: '仕上げ待ち' },
    },
    {
        name: 'ケース3 本社+丸洗いあり',
        from: '本社',
        analysis: resolved,
        expect: { action: 'put', workStatus: '未着手' },
    },
    {
        name: 'ケース4 本社+しみのみ',
        from: '本社',
        analysis: noMaru,
        expect: { action: 'put', workStatus: '未着手' },
    },
    {
        name: 'ケース5 すでに工場',
        from: '工場',
        analysis: noMaru,
        expect: { action: 'reject', code: 'already_factory' },
    },
    {
        name: 'ケース6 外注先',
        from: '外注先',
        analysis: noMaru,
        expect: { action: 'reject', code: 'blocked_source' },
    },
    {
        name: 'ケース6b 海外',
        from: '海外',
        analysis: noMaru,
        expect: { action: 'reject', code: 'blocked_source' },
    },
    {
        name: 'ケース6c 和裁士',
        from: '和裁士',
        analysis: noMaru,
        expect: { action: 'reject', code: 'blocked_source' },
    },
    {
        name: 'ケース7 納品済',
        from: '納品済',
        analysis: noMaru,
        expect: { action: 'reject', code: 'blocked_source' },
    },
    {
        name: '店舗+App13未特定',
        from: '店舗',
        analysis: unresolved,
        expect: { action: 'reject', code: 'unresolved_lines' },
    },
];

let failed = 0;

cases.forEach((tc) => {

    const result = plan(tc.from, tc.analysis);

    const okAction = result.action === tc.expect.action;
    const okWork = tc.expect.workStatus === undefined || result.workStatus === tc.expect.workStatus;
    const okCode = tc.expect.code === undefined || result.code === tc.expect.code;

    if (okAction && okWork && okCode) {
        console.log('OK  ' + tc.name);
        return;
    }

    failed += 1;
    console.error('FAIL ' + tc.name, JSON.stringify(result));

});

if (failed > 0) {
    process.exit(1);
}

console.log('\nAll ' + cases.length + ' tests passed.');
