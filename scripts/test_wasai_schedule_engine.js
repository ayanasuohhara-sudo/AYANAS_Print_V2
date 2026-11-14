'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/wasai_schedule_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/wasai_schedule_engine.js'), 'utf8'));

const E = global.CAYANAS_WasaiScheduleEngine;
const C = global.CAYANAS_WASAI_SCHEDULE;
const desktop = fs.readFileSync(path.join(root, 'customize/wasai_schedule_desktop.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'customize/wasai_schedule.css'), 'utf8');

let failed = 0;

const assert = (name, cond) => {
  if (cond) {
    console.log('OK  ' + name);
    return;
  }
  failed += 1;
  console.error('FAIL ' + name);
};

const line = (opts) => ({
  id: opts.id || undefined,
  value: {
    manage_no: { value: opts.manageNo || '' },
    line_status: { value: opts.status || '' },
    inbound_date: { value: opts.inboundDate || '' },
    eligible_line_coun: { value: opts.pieces == null ? '1' : String(opts.pieces) },
    processing_summary: { value: opts.item || '国内仕立' },
    deadline: { value: opts.deadline || '' },
    order_record_id: { value: opts.orderId || '' },
    customer_name: { value: opts.customer || '' },
    client_name: { value: opts.client || '' },
  },
});

const outbound = (opts) => ({
  $id: { value: opts.id || '1' },
  wasai_code: { value: opts.code || '002' },
  wasai_name: { value: opts.name || '西口陽子' },
  日ship_date: { value: opts.ship || '' },
  return_date: { value: opts.ret || '' },
  outbound_status: { value: opts.status || '出庫確定' },
  wasai_outbound_lines: { value: opts.lines || [] },
});

const inboundBatch = (opts) => ({
  $id: { value: opts.id || '80' },
  inbound_status: { value: opts.status || '入庫確定' },
  inbound_date: { value: opts.date || '2026-11-12' },
  inbound_lines: {
    value: (opts.lines || []).map((row) => ({
      value: {
        manage_no: { value: row.manageNo },
        inbound_route: { value: row.route || '和裁士' },
        line_result: { value: row.result || '確定成功' },
      },
    })),
  },
});

const master = (code, name, status, field) => {
  const rec = {
    $id: { value: code },
    wasai_code: { value: code },
    wasai_name: { value: name },
    trade_name: { value: '' },
  };
  rec[field || 'registration_statu'] = { value: status };
  return rec;
};

const run = async () => {
  assert('VERSION', C.VERSION === '1.0.0');
  assert('HOST_APP_ID は未設定（本番作成待ち）', C.HOST_APP_ID === null);
  assert('参照 App', C.WASAI_MASTER_APP_ID === 73
    && C.WASAI_OUTBOUND_APP_ID === 74
    && C.INBOUND_APP_ID === 78);

  assert('desktop が PUT/POST しない',
    desktop.indexOf("'PUT'") === -1
    && desktop.indexOf('"PUT"') === -1
    && desktop.indexOf("'POST'") === -1
    && desktop.indexOf('"POST"') === -1);

  assert('desktop は GET records のみ', desktop.indexOf('/k/v1/records.json') !== -1);
  assert('css にカレンダー根がある', css.indexOf('.cayan-ws-root') !== -1);

  const bounds = E.monthBounds(2026, 11);
  assert('monthBounds', bounds.start === '2026-11-01' && bounds.end === '2026-11-30');

  const prev = E.shiftMonth(2026, 11, -1);
  const next = E.shiftMonth(2026, 11, 1);
  assert('shiftMonth', prev.year === 2026 && prev.month === 10
    && next.year === 2026 && next.month === 12);

  assert('calendarDate は返却予定日優先',
    E.calendarDateForLine('2026-10-28', '2026-11-11') === '2026-11-11');
  assert('calendarDate は返却空なら出庫日',
    E.calendarDateForLine('2026-11-04', '') === '2026-11-04');

  const attr = E.capacityAttributionMonth('2026-10-28', '2026-11-11');
  assert('月またぎは返却予定月へ帰属（第4段階前提）',
    attr && attr.year === 2026 && attr.month === 11);

  const masters = E.normalizeMasters([
    master('002', '西口陽子', '有効'),
    master('009', '休止者', '休止'),
    master('001', '髙田まや', '有効', 'registration_status'),
  ]);
  assert('有効和裁士のみ・コード昇順',
    masters.length === 2
    && masters[0].wasaiCode === '001'
    && masters[1].wasaiCode === '002');

  const openKind = E.classifyLineKind('出庫中', 'M1', new Map());
  const emptyKind = E.classifyLineKind('', 'M2', new Map());
  const returnedKind = E.classifyLineKind('検品OK', 'M3', new Map());
  const reworkKind = E.classifyLineKind('再加工', 'M4', new Map());
  assert('出庫中分類', openKind === 'outbound' && emptyKind === 'outbound');
  assert('返却済分類', returnedKind === 'returned');
  assert('再加工分類', reworkKind === 'rework');

  const confirmMap = E.buildInboundConfirmMap([
    inboundBatch({
      date: '2026-11-12',
      lines: [
        { manageNo: '101326013', route: '和裁士', result: '確定成功' },
        { manageNo: 'X', route: '国内外注', result: '確定成功' },
        { manageNo: 'ERR', route: '和裁士', result: 'エラー' },
      ],
    }),
  ]);
  assert('App78 和裁士確定のみマップ',
    confirmMap.has('101326013')
    && !confirmMap.has('X')
    && !confirmMap.has('ERR'));
  assert('App78 補強で出庫中→返却済',
    E.classifyLineKind('出庫中', '101326013', confirmMap) === 'returned');

  const records = [
    outbound({
      id: '33',
      ship: '2026-11-04',
      ret: '2026-11-12',
      lines: [line({
        id: 'r1',
        manageNo: '101326013',
        status: '出庫中',
        pieces: 1,
        item: '国内仕立',
      })],
    }),
    outbound({
      id: '32',
      ship: '2026-11-04',
      ret: '2026-11-12',
      lines: [line({
        id: 'r2',
        manageNo: '102026154',
        status: '検品OK',
        pieces: 1,
        item: '国内仕立',
        inboundDate: '2026-11-12',
      })],
    }),
    outbound({
      id: '31',
      ship: '2026-10-28',
      ret: '2026-11-11',
      lines: [line({
        id: 'r3',
        manageNo: '100926956',
        status: '検品OK',
        pieces: 1,
        item: '国内仕立',
        inboundDate: '2026-11-11',
      })],
    }),
    outbound({
      id: '20',
      ship: '2026-10-01',
      ret: '2026-10-15',
      lines: [line({ manageNo: 'OLD', status: '出庫中', item: '旧月' })],
    }),
    outbound({
      id: '99',
      status: '取消',
      ship: '2026-11-01',
      ret: '2026-11-10',
      lines: [line({ manageNo: 'CXL', status: '出庫中' })],
    }),
  ];

  const model = E.aggregateMonth(
    records,
    [inboundBatch({
      date: '2026-11-12',
      lines: [{ manageNo: '101326013' }],
    })],
    '002',
    2026,
    11
  );

  assert('取消は除外', !model.items.some((row) => row.manageNo === 'CXL'));
  assert('他月は除外', !model.items.some((row) => row.manageNo === 'OLD'));
  assert('11月件数3', model.items.length === 3);
  assert('App78 で出庫中を返却済へ',
    model.items.find((row) => row.manageNo === '101326013').kind === 'returned');
  assert('検品OKは返却済',
    model.items.find((row) => row.manageNo === '102026154').kind === 'returned');

  const day12 = E.daySummary(model, '2026-11-12');
  assert('11/12 に2件', day12.rows.length === 2 && day12.totalPieces === 2);

  const day12OpenOnly = E.daySummary(model, '2026-11-12', { includeReturned: false });
  assert('返却済非表示で0', day12OpenOnly.rows.length === 0);

  const cross = E.aggregateMonth(
    [outbound({
      id: 'cross',
      ship: '2026-10-28',
      ret: '2026-11-11',
      lines: [line({ manageNo: 'CROSS', status: '出庫中', pieces: 2, item: '袷' })],
    })],
    [],
    '002',
    2026,
    11
  );
  assert('月またぎ出庫は返却予定月に載る',
    cross.days['2026-11-11']
    && cross.days['2026-11-11'].outboundPieces === 2
    && cross.totals.outboundPieces === 2);

  const query = E.buildOutboundMonthQuery('002', 2026, 11);
  assert('出庫クエリに和裁士と出庫確定',
    query.indexOf('wasai_code = "002"') !== -1
    && query.indexOf('出庫確定') !== -1
    && query.indexOf('return_date') !== -1
    && query.indexOf('日ship_date') !== -1);

  // fetchAllPages pagination
  let calls = 0;
  const paged = await E.fetchAllPages('order by $id asc', async () => {
    calls += 1;
    if (calls === 1) {
      return new Array(C.PAGE_LIMIT).fill({ $id: { value: '1' } });
    }
    return [{ $id: { value: '2' } }];
  });
  assert('fetchAllPages が複数ページ結合', paged.records.length === C.PAGE_LIMIT + 1
    && paged.truncated === false);

  if (failed > 0) {
    console.error('FAILED ' + failed);
    process.exit(1);
  }
  console.log('ALL PASSED');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
