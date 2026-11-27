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

const master = (code, name, status, field, capacity) => {
  const rec = {
    $id: { value: code },
    wasai_code: { value: code },
    wasai_name: { value: name },
    trade_name: { value: '' },
  };
  rec[field || 'registration_statu'] = { value: status };
  if (capacity !== undefined) {
    rec.monthly_capacity = { value: capacity };
  }
  return rec;
};

const run = async () => {
  assert('VERSION', C.VERSION === '1.4.0');
  assert('HOST_APP_ID は本番ホスト', C.HOST_APP_ID === 98);
  assert('PLAN_APP_ID は本番予定 App', C.PLAN_APP_ID === 99);
  assert('参照 App', C.WASAI_MASTER_APP_ID === 73
    && C.WASAI_OUTBOUND_APP_ID === 74
    && C.INBOUND_APP_ID === 78);
  assert('monthly_capacity フィールドコード', C.FIELDS.monthlyCapacity === 'monthly_capacity');
  assert('DISPLAY_KINDS は納期負荷と同型の4種',
    C.DISPLAY_KINDS.length === 4
    && C.DISPLAY_KINDS[0].key === 'outbound'
    && C.DISPLAY_KINDS[1].key === 'planned');
  assert('タイトルは入庫予定', C.MESSAGES.title.indexOf('入庫予定') !== -1);

  assert('desktop は予定 App 以外へ書込コードを持たない固定IDなし',
    !/app:\s*74/.test(desktop) || desktop.indexOf('WASAI_OUTBOUND') !== -1);
  assert('desktop は records GET を使う', desktop.indexOf('/k/v1/records.json') !== -1);
  assert('desktop の POST/PUT は record.json（予定用）',
    desktop.indexOf('/k/v1/record.json') !== -1);
  assert('desktop は名称セル(cayan-ws-item)', desktop.indexOf('cayan-ws-item') !== -1
    && desktop.indexOf('visibleItemLines') !== -1);
  assert('desktop は detailGroups を使う', desktop.indexOf('detailGroups') !== -1);
  assert('css にカレンダー根がある', css.indexOf('.cayan-ws-root') !== -1);
  assert('css は名称行スタイル', css.indexOf('.cayan-ws-item') !== -1);

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
    master('002', '西口陽子', '有効', 'registration_statu', '20'),
    master('009', '休止者', '休止'),
    master('001', '髙田まや', '有効', 'registration_status', ''),
    master('004', '中田路子', '有効', 'registration_statu', '0'),
  ]);
  assert('有効和裁士のみ・コード昇順',
    masters.length === 3
    && masters[0].wasaiCode === '001'
    && masters[1].wasaiCode === '002'
    && masters[2].wasaiCode === '004');
  assert('空の月間能力は未設定(null)', masters[0].monthlyCapacity === null
    && masters[0].monthlyCapacityLabel === '未設定');
  assert('数値20は20枚', masters[1].monthlyCapacity === 20
    && masters[1].monthlyCapacityLabel === '20枚');
  assert('0は未設定ではなく0枚', masters[2].monthlyCapacity === 0
    && masters[2].monthlyCapacityLabel === '0枚');

  assert('parse 欠落フィールドは未設定', E.parseMonthlyCapacity({
    wasai_code: { value: 'x' },
  }) === null);
  assert('parse 負数は未設定', E.parseMonthlyCapacity({
    monthly_capacity: { value: '-1' },
  }) === null);
  assert('parse 小数は未設定', E.parseMonthlyCapacity({
    monthly_capacity: { value: '1.5' },
  }) === null);
  assert('format 未設定文言', E.formatMonthlyCapacity(null) === '未設定');

  // 和裁士切替で表示ラベルが変わること（UI が selectedMaster を参照する前提）
  const byCode = Object.fromEntries(masters.map((row) => [row.wasaiCode, row]));
  assert('切替 001→未設定', byCode['001'].monthlyCapacityLabel === '未設定');
  assert('切替 002→20枚', byCode['002'].monthlyCapacityLabel === '20枚');

  assert('desktop に能力表示がある', desktop.indexOf('capacityLabel') !== -1
    || desktop.indexOf('formatMonthlyCapacity') !== -1);
  assert('desktop が monthly_capacity を直接PUTしない',
    !/monthly_capacity[\s\S]{0,80}PUT/.test(desktop)
    && desktop.indexOf('capacityEditHint') !== -1);

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
  assert('daySummary.counts 返却済', day12.counts.returned === 2);

  const day12OpenOnly = E.daySummary(model, '2026-11-12', { includeReturned: false });
  assert('返却済非表示で0', day12OpenOnly.rows.length === 0);

  const lines12 = E.visibleCountLines(day12, { includeReturned: true, includePlanned: true });
  assert('visibleCountLines は返却済のみ',
    lines12.length === 1 && lines12[0].key === 'returned' && lines12[0].count === 2);
  const groups12 = E.detailGroups(model, '2026-11-12', { includeReturned: true, includePlanned: true });
  assert('detailGroups は返却済グループ',
    groups12.length === 1 && groups12[0].key === 'returned' && groups12[0].count === 2);
  assert('detailCountText', E.detailCountText(2) === '入庫予定明細 2件');

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
  assert('出庫クエリは入庫予定日優先',
    query.indexOf('wasai_code = "002"') !== -1
    && query.indexOf('出庫確定') !== -1
    && query.indexOf('return_date >= "2026-11-01"') !== -1
    && query.indexOf('return_date = ""') !== -1
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

  const planRec = (opts) => ({
    $id: { value: opts.id || 'p1' },
    wasai_code: { value: opts.code || '002' },
    wasai_name: { value: opts.name || '西口陽子' },
    manage_no: { value: opts.manageNo || '' },
    item_summary: { value: opts.item || '袷' },
    piece_count: { value: opts.pieces == null ? '1' : String(opts.pieces) },
    planned_start_date: { value: opts.start || '' },
    planned_return_date: { value: opts.ret || '2026-11-20' },
    plan_status: { value: opts.status || '予約' },
    linked_outbound_record_id: { value: opts.linked || '' },
    linked_outbound_line_id: { value: '' },
    source: { value: opts.source || '事務所' },
    notes: { value: opts.notes || '' },
  });

  const withPlan = E.aggregateMonth(
    [outbound({
      id: '33',
      ship: '2026-11-04',
      ret: '2026-11-12',
      lines: [line({ manageNo: '101326013', status: '出庫中', pieces: 1, item: '国内仕立' })],
    })],
    [],
    '002',
    2026,
    11,
    {
      planRecords: [
        planRec({ id: 'p-open', manageNo: 'NEW001', ret: '2026-11-20', pieces: 2 }),
        planRec({ id: 'p-dup', manageNo: '101326013', ret: '2026-11-18', pieces: 1 }),
        planRec({ id: 'p-cancel', manageNo: 'CXL1', status: '取消', ret: '2026-11-19' }),
        planRec({ id: 'p-ship', manageNo: 'OLD1', status: '出庫済', ret: '2026-11-21' }),
      ],
    }
  );
  assert('予約はカレンダーに載る', withPlan.totals.plannedPieces === 2
    && withPlan.days['2026-11-20']
    && withPlan.days['2026-11-20'].plannedPieces === 2);
  assert('出庫済み manage_no の予約は二重計上しない',
    !withPlan.items.some((row) => row.planRecordId === 'p-dup')
    && withPlan.suppressedPlans.some((row) => row.manageNo === '101326013'));
  assert('取消・出庫済ステータスは非表示',
    !withPlan.items.some((row) => row.planRecordId === 'p-cancel' || row.planRecordId === 'p-ship'));
  assert('出庫中と予約が同居', withPlan.totals.outboundPieces === 1
    && withPlan.totals.plannedPieces === 2);

  const dupes = E.findDuplicateReservedPlans(
    [planRec({ id: 'a', manageNo: 'M1' }), planRec({ id: 'b', manageNo: 'M1' })],
    '002',
    'M1',
    'a'
  );
  assert('管理番号重複検出', dupes.length === 1 && E.readValue(dupes[0], '$id') === 'b');

  const bad = E.validatePlanInput({
    wasaiCode: '002',
    manageNo: 'M1',
    pieceCount: 1,
    plannedReturnDate: '2026-11-20',
    planStatus: '予約',
  }, [planRec({ id: 'a', manageNo: 'M1' })]);
  assert('重複予約は validate で弾く', bad.ok === false
    && bad.errors.indexOf(C.MESSAGES.planDuplicate) !== -1);

  const good = E.validatePlanInput({
    wasaiCode: '002',
    manageNo: '',
    pieceCount: 3,
    plannedReturnDate: '2026-11-20',
    planStatus: '予約',
  }, []);
  assert('枠予定は重複チェック対象外', good.ok === true);

  assert('セルラベルは顧客名/お客様名/商品名',
    E.formatCellItemLabel({
      customerName: '大進',
      clientName: '山田',
      itemSummary: '袷仕立',
    }) === '大進 / 山田 / 袷仕立');
  assert('セルラベル空欄は省略',
    E.formatCellItemLabel({
      customerName: '',
      clientName: '花子',
      itemSummary: '丸洗い',
    }) === '花子 / 丸洗い');
  assert('セルラベル全て空なら管理番号',
    E.formatCellItemLabel({ manageNo: 'M99' }) === 'M99');

  const named = E.aggregateMonth([
    outbound({
      id: 'n1',
      code: '002',
      ret: '2026-11-18',
      lines: [line({
        manageNo: 'N1',
        status: '出庫中',
        item: '国内仕立',
        customer: '得意先A',
        client: 'お客様B',
      })],
    }),
  ], [], '002', 2026, 11, { planRecords: [] });
  const cellLines = E.visibleItemLines(named, '2026-11-18', { includeReturned: false, includePlanned: true });
  assert('セルに名称行が出る', cellLines.totalCount === 1
    && cellLines.lines[0].label === '得意先A / お客様B / 国内仕立'
    && cellLines.lines[0].kind === 'outbound');
  assert('desktop が visibleItemLines を使う', desktop.indexOf('visibleItemLines') !== -1
    && desktop.indexOf('顧客名') !== -1
    && desktop.indexOf('お客様名') !== -1);
  const payload = E.buildPlanRecordPayload({
    wasaiCode: '002',
    wasaiName: '西口陽子',
    manageNo: 'X',
    itemSummary: '袷',
    pieceCount: 2,
    plannedReturnDate: '2026-11-22',
    source: '本人',
  });
  assert('予定ペイロード', payload.plan_status.value === '予約'
    && payload.source.value === '本人'
    && payload.piece_count.value === 2);

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
