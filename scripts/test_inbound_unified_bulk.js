'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/wasai_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/inbound_unified_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/inbound_unified_engine.js'), 'utf8'));

const E = global.CAYANAS_InboundUnifiedEngine;
const C = global.CAYANAS_InboundUnified;
const TODAY = '2026-10-06';

let failed = 0;

const assert = (name, cond) => {
    if (cond) {
        console.log('OK  ' + name);
        return;
    }

    failed += 1;
    console.error('FAIL ' + name);
};

const item = (route, recordId, lineRowId, shipDate, createdAt) => ({
    route: route,
    recordId: recordId,
    lineRowId: lineRowId || '',
    shipDate: shipDate,
    createdAt: createdAt,
});

const trueKeys = (decision) => Object.keys(decision.updateOrderByKey)
    .filter((key) => decision.updateOrderByKey[key]);

const run = () => {
    const one = [item(C.ROUTE.domestic, '27-1', 'L1', '2026-09-01', '2026-09-01T00:00:00Z')];
    const planOne = E.planInboundItems(one);

    assert('未入庫1件は確認なし', planOne.ok === true && planOne.bulk === false);
    assert('未入庫1件はApp16を更新する', trueKeys(E.assignOrderUpdates(one)).length === 1);

    const none = E.planInboundItems([]);
    assert(
        '全件入庫済は未入庫なし',
        none.ok === false
            && String(none.errorMessage || '').indexOf('未入庫の外注履歴がありません') >= 0
    );

    assert(
        '和裁士出庫中は入庫日があっても未入庫',
        E.isOpenWasaiLineStatus('出庫中', '2026-10-14') === true
    );
    assert(
        '和裁士入庫済は未入庫ではない',
        E.isOpenWasaiLineStatus('入庫済', '2026-10-14') === false
    );
    assert(
        '和裁士空状態は入庫日空なら未入庫',
        E.isOpenWasaiLineStatus('', '') === true
    );
    assert(
        '受注が和裁士作業中ならルートは和裁士',
        E.inferRouteFromOrder({
            process_status: { value: C.ORDER_PROCESS.wasaiActive },
            location_status: { value: C.ORDER_LOCATION.wasai },
        }) === C.ROUTE.wasai
    );

    const domesticTwo = [
        item(C.ROUTE.domestic, '27-1', 'L1', '2026-08-01', '2026-08-01T00:00:00Z'),
        item(C.ROUTE.domestic, '27-2', 'L2', '2026-09-10', '2026-09-10T00:00:00Z'),
    ];
    const planDomestic = E.planInboundItems(domesticTwo);
    const decisionDomestic = E.assignOrderUpdates(domesticTwo);

    assert('国内2件は一括確認', planDomestic.bulk === true && planDomestic.primary.confident === true);
    assert('国内2件のApp16更新は1件だけ', trueKeys(decisionDomestic).length === 1);
    assert('国内2件は通常の国内入庫後状態', planDomestic.primary.item.route === C.ROUTE.domestic);

    const overseasMany = [
        item(C.ROUTE.overseas, '28-1', '', '2026-07-01', '2026-07-01T00:00:00Z'),
        item(C.ROUTE.overseas, '28-2', '', '2026-07-20', '2026-07-20T00:00:00Z'),
        item(C.ROUTE.overseas, '28-3', '', '2026-08-02', '2026-08-02T00:00:00Z'),
    ];

    assert('海外複数は海外ルートで1回', E.assignOrderUpdates(overseasMany).skipOrder === false
        && E.selectPrimaryOpenItem(overseasMany).item.route === C.ROUTE.overseas
        && trueKeys(E.assignOrderUpdates(overseasMany)).length === 1);

    const wasaiMany = [
        item(C.ROUTE.wasai, '74-1', 'W1', '2026-06-01', '2026-06-01T00:00:00Z'),
        item(C.ROUTE.wasai, '74-2', 'W2', '2026-06-15', '2026-06-15T00:00:00Z'),
    ];

    assert('和裁士複数は和裁士ルートで1回', E.selectPrimaryOpenItem(wasaiMany).item.route === C.ROUTE.wasai
        && trueKeys(E.assignOrderUpdates(wasaiMany)).length === 1);

    const mixedDomesticOverseas = [
        item(C.ROUTE.domestic, '27-old', 'A', '2026-08-01', '2026-08-01T01:00:00Z'),
        item(C.ROUTE.overseas, '28-mid', '', '2026-08-20', '2026-08-20T01:00:00Z'),
        item(C.ROUTE.domestic, '27-new', 'B', '2026-09-10', '2026-09-10T01:00:00Z'),
    ];
    const mixedDecision = E.assignOrderUpdates(mixedDomesticOverseas);
    const mixedPrimary = E.selectPrimaryOpenItem(mixedDomesticOverseas);

    assert('国内＋海外は最新出庫日の国内', mixedPrimary.confident === true
        && mixedPrimary.item.recordId === '27-new');
    assert('国内＋海外のApp16更新は最新1件', trueKeys(mixedDecision).length === 1
        && trueKeys(mixedDecision)[0] === E.openItemKey(mixedPrimary.item));

    const mixedThree = mixedDomesticOverseas.concat([
        item(C.ROUTE.wasai, '74-1', 'W1', '2026-08-15', '2026-08-15T01:00:00Z'),
    ]);
    const threePrimary = E.selectPrimaryOpenItem(mixedThree);

    assert('3ルート混在も最新出庫日を採用', threePrimary.confident === true
        && threePrimary.item.recordId === '27-new'
        && trueKeys(E.assignOrderUpdates(mixedThree)).length === 1);

    const sameDay = [
        item(C.ROUTE.domestic, '27-1', 'L1', '2026-09-10', '2026-09-10T01:00:00Z'),
        item(C.ROUTE.overseas, '28-1', '', '2026-09-10', '2026-09-10T09:00:00Z'),
    ];

    assert('同じ出庫日は作成日時が後の海外', E.selectPrimaryOpenItem(sameDay).item.recordId === '28-1');

    const unknown = [
        item(C.ROUTE.domestic, '27-1', 'L1', '', '2026-09-10T01:00:00Z'),
        item(C.ROUTE.overseas, '28-1', '', '2026-09-10', '2026-09-10T09:00:00Z'),
    ];
    const unknownDecision = E.assignOrderUpdates(unknown);

    assert('出庫日が無い混在はApp16を更新しない', unknownDecision.skipOrder === true
        && trueKeys(unknownDecision).length === 0);

    const tied = [
        item(C.ROUTE.domestic, '27-1', 'L1', '2026-09-10', '2026-09-10T01:00:00Z'),
        item(C.ROUTE.wasai, '74-1', 'W1', '2026-09-10', '2026-09-10T01:00:00Z'),
    ];

    assert('出庫日時が完全に同じならApp16を更新しない', E.assignOrderUpdates(tied).skipOrder === true);

    const summary = E.summarizeOpenItems(mixedThree);

    assert('内訳は国内2・海外1・和裁士1', summary.total === 4
        && summary.domestic === 2
        && summary.overseas === 1
        && summary.wasai === 1);

    const text = E.buildBulkConfirmText('A123456', [
        item(C.ROUTE.domestic, '27-1', 'L1', '2026-08-01', '2026-08-01T00:00:00Z'),
        item(C.ROUTE.domestic, '27-2', 'L2', '2026-09-01', '2026-09-01T00:00:00Z'),
        item(C.ROUTE.overseas, '28-1', '', '2026-08-20', '2026-08-20T00:00:00Z'),
    ]);

    assert('確認文に件数とルートと質問がある', text.indexOf('管理番号：A123456') >= 0
        && text.indexOf('未入庫の外注履歴が3件あります') >= 0
        && text.indexOf('国内外注 2件') >= 0
        && text.indexOf('海外外注 1件') >= 0
        && text.indexOf('和裁士 0件') >= 0
        && text.indexOf('3件すべてを入庫済みにしますか？') >= 0
        && text.indexOf('最新の国内外注') >= 0);

    assert('別日の入庫済み履歴は上書きしない', E.historyWriteAction('2026-08-01', TODAY) === 'keep');
    assert('当日済みは再書き込みしない', E.historyWriteAction(TODAY, TODAY) === 'keep-today');
    assert('未入庫だけ書き込む', E.historyWriteAction('', TODAY) === 'write');

    const retryGroup = [
        item(C.ROUTE.domestic, '27-ok', 'L1', '2026-08-01', '2026-08-01T00:00:00Z'),
        item(C.ROUTE.overseas, '28-fail', '', '2026-09-10', '2026-09-10T00:00:00Z'),
    ];
    const retry = E.assignOrderUpdates(retryGroup);

    assert('再実行でもApp16更新対象は最新の1件のまま', trueKeys(retry).length === 1
        && trueKeys(retry)[0] === E.openItemKey(retryGroup[1]));

    if (failed > 0) {
        console.error(failed + ' failed');
        process.exit(1);
    }

    console.log('all passed');
};

run();
