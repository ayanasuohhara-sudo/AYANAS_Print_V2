'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/schedule_hub_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/schedule_hub_engine.js'), 'utf8'));

const E = global.CAYANAS_ScheduleHubEngine;
const C = global.CAYANAS_SCHEDULE_HUB;
const desktop = fs.readFileSync(path.join(root, 'customize/schedule_hub_desktop.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'customize/schedule_hub.css'), 'utf8');
const app89Config = fs.readFileSync(path.join(root, 'customize/deadline_load_config.js'), 'utf8');
const scheduleCustomer = fs.readFileSync(path.join(root, 'customize/schedule_customer.js'), 'utf8');

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
    $id: { value: String(opts.id || manageNo || 'id') },
    manage_no: { value: manageNo },
    deadline: { value: deadline },
    customer_code: { value: opts.customerCode === undefined ? 'C001' : opts.customerCode },
    customer_name: { value: opts.customerName || 'テスト店' },
    client_name: { value: opts.clientName === undefined ? '客' : opts.clientName },
    slip_no: { value: opts.slipNo === undefined ? 'S-' + manageNo : opts.slipNo },
    kimono_type: { value: opts.kimonoType || '訪問着' },
    kimono_spec: { value: opts.kimonoSpec || '袷' },
    aggregation_status: { value: opts.aggregation === undefined ? '有効' : opts.aggregation },
    delivery_status: { value: opts.delivery === undefined ? '未納品' : opts.delivery },
    process_status: { value: opts.process || '海外戻り' },
    work_status: { value: opts.work === undefined ? '仕上げ中' : opts.work },
    location_status: { value: opts.location || '本社' },
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
]);

const TODAY = '2026-10-15';

const run = async () => {
  assert('VERSION', C.VERSION === '1.0.1');
  assert('ORDER_APP_ID 16', C.ORDER_APP_ID === 16);
  assert('PRODUCT_APP_ID 13', C.PRODUCT_APP_ID === 13);
  assert('完成=納品待ち', C.DELIVERY_READY === '納品待ち');
  assert('納品済', C.DELIVERY_DONE === '納品済');
  assert('取消', C.AGGREGATION_CANCELLED === '取消');

  assert(
    '分類定義は App89 と同一ラベル順',
    C.CATEGORIES.map((c) => c.label).join(',')
      === '丸洗い・しみ,海外仕立,国内仕立,修理,帯仕立'
  );
  assert(
    '分類優先は App89 と同一',
    C.CATEGORY_PRIORITY.join(',') === 'overseas,domestic,obi,repair,wash'
  );
  assert(
    'App89 config に同一 priority あり',
    app89Config.indexOf("'overseas'") !== -1
      && app89Config.indexOf("'domestic'") !== -1
      && app89Config.indexOf("'obi'") !== -1
  );
  assert(
    '仕上げ対象は wash 除外',
    C.FINISH_CATEGORY_KEYS.join(',') === 'overseas,domestic,obi,repair'
  );

  assert('取消のみ除外（有効）', E.isCancelled(rec('A', '2026-10-10', [])) === false);
  assert('取消のみ除外（空）', E.isCancelled(rec('A', '2026-10-10', [], { aggregation: '' })) === false);
  assert('取消のみ除外（null相当）', E.isCancelled({ aggregation_status: { value: null } }) === false);
  assert('取消は除外', E.isCancelled(rec('A', '2026-10-10', [], { aggregation: '取消' })) === true);
  assert('空白付き取消も除外', E.isCancelled(rec('A', '2026-10-10', [], { aggregation: ' 取消 ' })) === true);

  assert('納品済判定', E.isDelivered(rec('A', '2026-10-10', [], { delivery: '納品済' })) === true);
  assert('納品待ち=完成', E.isReady(rec('A', '2026-10-10', [], { delivery: '納品待ち' })) === true);

  const openQ = E.buildOpenOrdersQuery();
  assert('未納品クエリに deadline 条件なし', openQ.indexOf('deadline') === -1);
  assert('未納品クエリは納品済除外', openQ.indexOf('納品済') !== -1);
  assert('未納品クエリに取消条件なし（空欄保護）', openQ.indexOf('aggregation') === -1);

  const custQ = E.buildCustomerSearchQuery('m032');
  assert(
    '顧客検索クエリ',
    custQ === 'customer_code = "m032" and (delivery_status not in ("納品済") or delivery_status in (""))'
  );
  assert('顧客検索に process なし', custQ.indexOf('process_status') === -1);

  /* 複数加工 → 1分類 */
  const multi = E.matchingCategoryKeys(
    rec('M1', '2026-10-10', [line('DOM', '国内仕立'), line('REP', '修理・直し'), line('WASH', '丸洗い')]),
    products
  );
  assert('複数加工は優先1分類(overseas>domestic>…)', multi.join(',') === 'domestic');

  const washOnly = E.buildFinishQueues(
    [rec('W1', '2026-10-10', [line('WASH', '丸洗い')], { work: '仕上げ中' })],
    products,
    TODAY
  );
  assert('丸洗いは仕上げ本体に出ない', washOnly.main.length === 0);

  /* ①本体 + 漏れ + 重複防止 */
  const finishRecs = [
    rec('F1', '2026-10-10', [line('DOM', '国内仕立')], {
      work: '仕上げ中',
      process: '外注戻り',
      id: '1',
    }),
    rec('F2', '2026-10-12', [line('OVS', '海外仕立')], {
      work: '仕上げ中',
      process: '海外戻り',
      id: '2',
    }),
    rec('L1', '2026-10-11', [line('DOM', '国内仕立')], {
      work: '',
      process: '外注戻り',
      location: '本社',
      id: '3',
    }),
    rec('L2', '2026-10-09', [line('REP', '修理・直し')], {
      work: '検品中',
      process: '外注戻り',
      location: '本社',
      id: '4',
    }),
    rec('L3', '2026-10-08', [line('DOM', '国内仕立')], {
      work: '',
      process: '外注戻り',
      location: '工場',
      id: '5',
    }),
    rec('L4', '2026-10-07', [line('WASH', '丸洗い')], {
      work: '',
      process: '外注戻り',
      location: '本社',
      id: '6',
    }),
    rec('D1', '2026-10-05', [line('DOM', '国内仕立')], {
      work: '仕上げ中',
      delivery: '納品済',
      id: '7',
    }),
    rec('C1', '2026-10-06', [line('DOM', '国内仕立')], {
      work: '仕上げ中',
      aggregation: '取消',
      id: '8',
    }),
    /* 本体にも漏れ条件にも該当しうるが work=仕上げ中 → 本体のみ */
    rec('DUP', '2026-10-13', [line('OBI', '帯仕立')], {
      work: '仕上げ中',
      process: '外注戻り',
      location: '本社',
      id: '9',
    }),
  ];

  const queues = E.buildFinishQueues(finishRecs, products, TODAY);
  assert('仕上げ本体件数', queues.main.map((r) => r.manageNo).join(',') === 'F1,F2,DUP');
  assert('漏れ候補に L1 L2', queues.leak.map((r) => r.manageNo).sort().join(',') === 'L1,L2');
  assert('漏れに工場外注戻りは出ない', queues.leak.every((r) => r.manageNo !== 'L3'));
  assert('漏れに丸洗いは出ない', queues.leak.every((r) => r.manageNo !== 'L4'));
  assert('漏れに本体 DUP が重複しない', queues.leak.every((r) => r.manageNo !== 'DUP'));
  assert('納品済除外', queues.main.every((r) => r.manageNo !== 'D1')
    && queues.leak.every((r) => r.manageNo !== 'D1'));
  assert('取消除外', queues.main.every((r) => r.manageNo !== 'C1'));

  /* 納期未設定 */
  const unsetRecs = [
    rec('U1', '', [line('DOM', '国内仕立')], { work: '仕上げ中', id: '10' }),
    rec('U2', '2026-10-20', [line('DOM', '国内仕立')], { work: '仕上げ中', id: '11' }),
    rec('U3', '', [line('DOM', '国内仕立')], {
      work: '',
      process: '外注戻り',
      location: '本社',
      id: '12',
    }),
  ];
  const unsetQ = E.buildFinishQueues(unsetRecs, products, TODAY);
  assert('納期未設定は本体に残る', unsetQ.main.some((r) => r.manageNo === 'U1'));
  assert('納期未設定は末尾', unsetQ.main.map((r) => r.manageNo).join(',') === 'U2,U1');
  assert('未設定ラベル', unsetQ.main.find((r) => r.manageNo === 'U1').deadlineLabel === '納期未設定');
  assert('未設定一覧に U1 U3', unsetQ.unset.map((r) => r.manageNo).sort().join(',') === 'U1,U3');

  /* ③ 全商品 / 納品可能 */
  const delivRecs = [
    rec('R1', '2026-10-10', [line('DOM', '国内仕立')], {
      delivery: '納品待ち',
      customerCode: 'A',
      customerName: '甲',
      id: '20',
    }),
    rec('R2', '2026-10-20', [line('DOM', '国内仕立')], {
      delivery: '未納品',
      customerCode: 'A',
      customerName: '甲',
      id: '21',
    }),
    rec('R3', '2026-10-12', [line('OBI', '帯仕立')], {
      delivery: '納品待ち',
      customerCode: 'B',
      customerName: '乙',
      id: '22',
    }),
    rec('R4', '', [line('DOM', '国内仕立')], {
      delivery: '納品待ち',
      customerCode: 'B',
      customerName: '乙',
      id: '23',
    }),
    rec('RX', '2026-10-01', [line('DOM', '国内仕立')], {
      delivery: '納品済',
      customerCode: 'A',
      id: '24',
    }),
  ];

  const allModel = E.buildDeliveryModel(delivRecs, products, TODAY, 'all');
  assert('全商品は納品済除外', allModel.rows.every((r) => r.manageNo !== 'RX'));
  assert('全商品件数', allModel.counts.total === 4);
  assert('完成と作業中', allModel.counts.ready === 3 && allModel.counts.working === 1);
  assert('超過カウント', allModel.counts.overdue >= 1);
  assert('未設定はカレンダー外リスト', allModel.unset.map((r) => r.manageNo).join(',') === 'R4');
  assert('カレンダー日別は未設定を含まない', E.dayCount(allModel, '') === 0);

  const readyModel = E.buildDeliveryModel(delivRecs, products, TODAY, 'ready');
  assert('納品可能のみ', readyModel.rows.every((r) => r.isReady)
    && readyModel.counts.total === 3
    && readyModel.counts.working === 0);

  const groupA = readyModel.groups.find((g) => g.customerCode === 'A');
  assert('得意先別完成点', groupA && groupA.readyCount === 1);
  assert('最短納期', groupA && groupA.earliestDeadline === '2026-10-10');

  /* 顧客別 */
  const custRows = E.filterByCustomer(
    E.openRowsFromRecords(delivRecs, products, TODAY),
    'A'
  );
  assert('顧客別は A のみ', custRows.every((r) => r.customerCode === 'A') && custRows.length === 2);
  assert(
    '顧客マップ',
    JSON.stringify(E.buildCustomerMap(custRows)) === JSON.stringify({ A: '甲' })
  );

  /* 詳細リンク */
  assert('App16 詳細パス', E.orderDetailPath('12345') === '/k/16/show#record=12345');

  const named = E.toRow(
    rec('N1', '2026-10-20', [line('DOM', '国内仕立')], {
      clientName: '山田太郎',
      slipNo: 'DEN-99',
      id: '90',
    }),
    products,
    TODAY
  );
  assert('お客様名 client_name', named.clientName === '山田太郎');
  assert('伝票番号 slip_no', named.slipNo === 'DEN-99');
  assert(
    '取得フィールドに slip_no / client_name',
    E.orderFetchFields().indexOf('slip_no') !== -1
      && E.orderFetchFields().indexOf('client_name') !== -1
  );
  assert(
    'desktop にお客様名・伝票番号列',
    desktop.indexOf('お客様名') !== -1
      && desktop.indexOf('伝票番号') !== -1
      && desktop.indexOf("'slipNo'") !== -1
      && desktop.indexOf("'client'") !== -1
  );

  /* 大量取得: offset / id / cursor */
  const makePage = (total) => {
    let served = 0;
    return async (query) => {
      const limitMatch = String(query).match(/limit\s+(\d+)/);
      const limit = limitMatch ? Number(limitMatch[1]) : 500;
      const offsetMatch = String(query).match(/offset\s+(\d+)/);
      const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
      const idMatch = String(query).match(/\$id\s*>\s*(\d+)/);
      const afterId = idMatch ? Number(idMatch[1]) : 0;

      const out = [];
      if (idMatch || (!offsetMatch && String(query).indexOf('order by $id') !== -1)) {
        let start = afterId + 1;
        if (!idMatch) {
          start = 1;
        }
        for (let i = 0; i < limit && start + i <= total; i += 1) {
          const id = start + i;
          out.push(rec('M' + id, '2026-10-20', [line('DOM', 'x')], { id: String(id) }));
        }
        return out;
      }

      for (let i = 0; i < limit && offset + i < total; i += 1) {
        const id = offset + i + 1;
        out.push(rec('M' + id, '2026-10-20', [line('DOM', 'x')], { id: String(id) }));
      }
      served += out.length;
      return out;
    };
  };

  const offsetResult = await E.fetchAllByOffset('delivery_status not in ("納品済") order by $id asc', makePage(1200));
  assert('offset 取得件数', offsetResult.records.length === 1200 && offsetResult.method === 'offset');
  assert('offset API 回数', offsetResult.calls === 3);

  const idResult = await E.fetchAllByRecordId('(delivery_status not in ("納品済") or delivery_status in (""))', makePage(1200));
  assert('id ページング件数', idResult.records.length === 1200 && idResult.method === 'id');
  assert('id API 回数', idResult.calls === 3);

  let cursorCalls = 0;
  const cursorResult = await E.fetchAllByCursor('x', ['$id'], {
    createCursor: async () => {
      cursorCalls += 1;
      return { id: 'cur1' };
    },
    getCursor: async () => {
      cursorCalls += 1;
      if (cursorCalls === 2) {
        return {
          records: [rec('C1', '2026-10-10', [], { id: '1' })],
          next: true,
        };
      }
      return {
        records: [rec('C2', '2026-10-10', [], { id: '2' })],
        next: false,
      };
    },
    deleteCursor: async () => {
      cursorCalls += 1;
    },
  });
  assert('cursor 取得', cursorResult.records.length === 2 && cursorResult.method === 'cursor');
  assert('cursor delete 含む呼び出し', cursorResult.calls >= 3);

  const fallback = await E.fetchAllOpenOrders('q', ['$id'], {
    fetchPage: makePage(50),
    cursorApi: {
      createCursor: async () => {
        throw new Error('no cursor');
      },
    },
  });
  assert('cursor 失敗時 id フォールバック', fallback.method === 'id' && fallback.records.length === 50);
  assert('取得統計フォーマット', E.formatFetchStats({ count: 50, calls: 1, elapsedMs: 12 }).indexOf('50') !== -1);

  let allFailed = false;
  try {
    await E.fetchAllOpenOrders('q', ['$id'], {
      fetchPage: async () => {
        throw new Error('page fail');
      },
      cursorApi: {
        createCursor: async () => {
          throw new Error('cursor fail');
        },
      },
    });
  } catch (err) {
    allFailed = err.code === 'FETCH_ALL_FAILED'
      && String(err.message).indexOf('件数は表示しません') !== -1;
  }
  assert('全取得失敗時は throw（件数返却なし）', allFailed);

  assert(
    '権限エラー文言',
    E.formatApiError({ status: 403, message: 'no privilege' }).indexOf('閲覧権限') !== -1
  );
  assert(
    'desktop 失敗時に clearLoadedData',
    desktop.indexOf('clearLoadedData') !== -1
      && desktop.indexOf('取得完了まで前回の件数を出さない') !== -1
  );
  assert(
    'App13 失敗は warn 継続',
    desktop.indexOf('productMapFailed') !== -1
      && desktop.indexOf('productResult.failed') !== -1
  );
  assert(
    '一覧非表示はホスト body class のみ',
    css.indexOf('ayanas-schedule-hub-active') !== -1
      && desktop.indexOf('BODY_CLASS') !== -1
      && desktop.indexOf('他アプリの一覧には影響しない') !== -1
  );

  /* desktop: PUT/POST なし（cursor の POST は records/cursor のみ許可） */
  assert('desktop に records PUT なし', !/records\.json['"]\s*,\s*'PUT'/.test(desktop)
    && desktop.indexOf("method: 'PUT'") === -1
    && desktop.indexOf(', \'PUT\'') === -1
    && desktop.indexOf(', "PUT"') === -1);
  assert(
    'desktop の POST は cursor のみ',
    (desktop.match(/'POST'/g) || []).length === 1
      && desktop.indexOf('/k/v1/records/cursor.json') !== -1
  );
  assert('desktop に record 更新 API なし', desktop.indexOf('/k/v1/record.json') === -1);
  assert('3タブ', desktop.indexOf('finish') !== -1
    && desktop.indexOf('customer') !== -1
    && desktop.indexOf('delivery') !== -1);
  assert('漏れ枠タイトル参照', desktop.indexOf('leakTitle') !== -1);
  assert('未設定枠', desktop.indexOf('unsetTitle') !== -1);
  assert('一覧/カレンダー切替', desktop.indexOf('view-mode') !== -1);
  assert('全商品/納品可能切替', desktop.indexOf('delivery-mode') !== -1);
  assert('App16 詳細 open', desktop.indexOf('orderDetailPath') !== -1
    || desktop.indexOf('data-action="open"') !== -1);
  assert('CSS 超過強調', css.indexOf('is-overdue') !== -1 && css.indexOf('font-size: 16px') !== -1);
  assert('既存 schedule_customer 未変更前提（本テストは読取のみ）', scheduleCustomer.indexOf('VIEW_ID = 5521026') !== -1);

  if (failed) {
    console.error('\nFAILED: ' + failed);
    process.exit(1);
  }
  console.log('\nAll tests passed.');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
