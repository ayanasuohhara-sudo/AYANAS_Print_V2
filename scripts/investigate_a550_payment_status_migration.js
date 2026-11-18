'use strict';

/**
 * A550 過去データの入金状況候補を調査する（読取専用・上書きなし）。
 *
 * 判定規則（承認仕様）:
 *   残額0円以下 → 入金済み候補
 *   一部入金あり・残額あり → 一部入金候補
 *   入金なし → 未入金候補
 * 判定不能は別一覧。
 *
 * 用法（ローカルモック）:
 *   node scripts/investigate_a550_payment_status_migration.js
 *
 * 本番読取（別途認証がある場合）:
 *   LIVE=1 node scripts/investigate_a550_payment_status_migration.js
 *
 * 一括 PUT は行わない。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'docs');

global.window = global;
vm.runInThisContext(
  fs.readFileSync(path.join(root, 'customize/store_payment_status.js'), 'utf8')
);
vm.runInThisContext(
  fs.readFileSync(path.join(root, 'customize/store_payment_config.js'), 'utf8')
);
vm.runInThisContext(
  fs.readFileSync(path.join(root, 'customize/store_payment_engine.js'), 'utf8')
);

const Status = global.CAYANAS_StorePaymentStatus;
const E = global.CAYANAS_StorePayment_Engine;

const classifyOrder = (order, payments) => {
  const id = String(order.$id && order.$id.value);
  const manageNo = E.readValue(order, 'manage_no');
  const customerCode = E.readValue(order, 'customer_code');
  const deliveryStatus = E.readValue(order, 'delivery_status');
  const current = Status.readValue(order, Status.FIELD_CODE);
  const detailRows = ((order.detail_table && order.detail_table.value) || []).length;

  if (customerCode !== 'A550') {
    return {
      bucket: 'skipped_non_a550',
      id: id,
      manageNo: manageNo,
      customerCode: customerCode,
    };
  }

  let balance;
  try {
    balance = E.getOrderBalance(order, payments || []);
  } catch (err) {
    return {
      bucket: 'undetermined',
      reason: 'balance_error:' + (err && err.message ? err.message : String(err)),
      id: id,
      manageNo: manageNo,
      deliveryStatus: deliveryStatus,
      detailRows: detailRows,
      currentStatus: current,
    };
  }

  const suggested = Status.suggestFromBalanceState(
    balance.state,
    balance.balance,
    balance.paid
  );

  if (!suggested) {
    return {
      bucket: 'undetermined',
      reason: 'unmapped_state:' + balance.state,
      id: id,
      manageNo: manageNo,
      deliveryStatus: deliveryStatus,
      detailRows: detailRows,
      currentStatus: current,
      balance: balance,
    };
  }

  // 複数明細は受注単位ステータスで問題ないが、明細金額が0の行混在を注記
  const note = detailRows > 1
    ? 'multi_detail_lines_order_level_status'
    : '';

  return {
    bucket: 'candidate_' + (
      suggested === Status.STATUS.paid ? 'paid'
        : suggested === Status.STATUS.partial ? 'partial'
          : 'unpaid'
    ),
    suggested: suggested,
    id: id,
    manageNo: manageNo,
    deliveryStatus: deliveryStatus,
    detailRows: detailRows,
    currentStatus: current,
    alreadySet: !!Status.norm(current),
    balanceState: balance.state,
    billedInclusive: balance.billedInclusive,
    paid: balance.paid,
    balance: balance.balance,
    note: note,
    deliveredCaution: deliveryStatus === '納品済',
  };
};

const runMock = () => {
  const orders = [
    {
      $id: { value: '1' },
      customer_code: { value: 'A550' },
      manage_no: { value: 'M001' },
      delivery_status: { value: '引き取り待ち' },
      detail_table: { value: [{ value: { amount: { value: '10000' } } }] },
    },
    {
      $id: { value: '2' },
      customer_code: { value: 'A550' },
      manage_no: { value: 'M002' },
      delivery_status: { value: '納品済' },
      detail_table: {
        value: [
          { value: { amount: { value: '5000' } } },
          { value: { amount: { value: '5000' } } },
        ],
      },
    },
    {
      $id: { value: '3' },
      customer_code: { value: 'A550' },
      manage_no: { value: 'M003' },
      delivery_status: { value: '未納品' },
      detail_table: { value: [{ value: { amount: { value: '8000' } } }] },
    },
    {
      $id: { value: '9' },
      customer_code: { value: 'M070' },
      manage_no: { value: 'C001' },
      delivery_status: { value: '納品済' },
      detail_table: { value: [{ value: { amount: { value: '1000' } } }] },
    },
  ];

  const paymentsByOrder = {
    2: [{
      payment_status: { value: '有効' },
      store_payment_lines: {
        value: [{
          value: {
            order_record_id: { value: '2' },
            allocated_amount: { value: '11000' },
          },
        }],
      },
    }],
    3: [{
      payment_status: { value: '有効' },
      store_payment_lines: {
        value: [{
          value: {
            order_record_id: { value: '3' },
            allocated_amount: { value: '4000' },
          },
        }],
      },
    }],
  };

  return orders.map((o) => classifyOrder(o, paymentsByOrder[o.$id.value] || []));
};

const summarize = (rows) => {
  const summary = {
    total: rows.length,
    candidate_paid: 0,
    candidate_partial: 0,
    candidate_unpaid: 0,
    undetermined: 0,
    skipped_non_a550: 0,
    deliveredCaution: 0,
    multiDetail: 0,
    alreadySet: 0,
  };
  rows.forEach((r) => {
    if (summary[r.bucket] != null) {
      summary[r.bucket] += 1;
    }
    if (r.deliveredCaution) {
      summary.deliveredCaution += 1;
    }
    if (r.note === 'multi_detail_lines_order_level_status') {
      summary.multiDetail += 1;
    }
    if (r.alreadySet) {
      summary.alreadySet += 1;
    }
  });
  return summary;
};

const main = async () => {
  const live = process.env.LIVE === '1';
  let rows;
  if (live) {
    console.error('LIVE=1: production read is not wired in this environment.');
    console.error('Use mock mode for unit verification; wire CDP/API in approved ops script.');
    process.exit(2);
  }
  rows = runMock();
  const summary = summarize(rows);
  const undetermined = rows.filter((r) => r.bucket === 'undetermined');
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'mock',
    rules: {
      paid: '残額0以下 → 入金済み候補',
      partial: '充当ありかつ残額あり → 一部入金候補',
      unpaid: '充当なし → 未入金候補',
      noOverwrite: true,
      bulkUpdateRequiresApproval: true,
    },
    summary: summary,
    undetermined: undetermined,
    samples: {
      paid: rows.filter((r) => r.bucket === 'candidate_paid').slice(0, 20),
      partial: rows.filter((r) => r.bucket === 'candidate_partial').slice(0, 20),
      unpaid: rows.filter((r) => r.bucket === 'candidate_unpaid').slice(0, 20),
    },
  };

  const jsonPath = path.join(outDir, 'A550_PAYMENT_STATUS_MIGRATION_INVESTIGATION.json');
  const mdPath = path.join(outDir, 'A550_PAYMENT_STATUS_MIGRATION_INVESTIGATION.md');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const md = [
    '# A550 入金状況 過去データ移行調査（上書きなし）',
    '',
    '- 生成: ' + report.generatedAt + '（UTC）',
    '- モード: **mock**（本番一括更新なし）',
    '',
    '## 判定規則',
    '',
    '| App97 残額 | 候補 |',
    '|-----------|------|',
    '| 残額 ≤ 0 | 入金済み |',
    '| 充当あり・残額あり | 一部入金 |',
    '| 充当なし | 未入金 |',
    '| 判定不能 | 一覧報告（上書きしない） |',
    '',
    '## サマリ（モック）',
    '',
    '```json',
    JSON.stringify(summary, null, 2),
    '```',
    '',
    '## 判定不能',
    '',
    undetermined.length ? JSON.stringify(undetermined, null, 2) : '（なし）',
    '',
    '## 注意',
    '',
    '- 既存データの無条件上書きはしない',
    '- 納品済レコードは `deliveredCaution`',
    '- 複数明細は受注単位ステータス（整合性は注文合計ベース）',
    '- **一括更新は別途承認後**',
    '',
  ].join('\n');
  fs.writeFileSync(mdPath, md);

  console.log(JSON.stringify(summary, null, 2));
  console.log('wrote', jsonPath);
  console.log('wrote', mdPath);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
