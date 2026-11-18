'use strict';

/**
 * Create 店舗入金管理 (S1) via CDP + logged-in kintone session.
 * Does NOT upload JS customize (prod JS needs separate approval).
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

const httpJson = (p, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: 9222, path: p, method }, (res) => {
    let d = '';
    res.on('data', (c) => { d += c; });
    res.on('end', () => {
      try { resolve(JSON.parse(d || 'null')); } catch (e) { resolve(d); }
    });
  });
  req.on('error', reject);
  req.end();
});

(async () => {
  const list = await httpJson('/json/list');
  const page = (list || []).find((t) => t.type === 'page'
    && /cybozu\.com\/k/.test(t.url || '')
    && !/login/.test(t.url || '')
    && !/web-worker/.test(t.url || ''));
  if (!page) {
    throw new Error('No logged-in kintone tab found');
  }
  console.error('Using tab:', page.title, page.url);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  let id = 1;
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = id++;
    const t = setTimeout(() => rej(new Error('timeout ' + method)), 300000);
    const h = (raw) => {
      const m = JSON.parse(String(raw));
      if (m.id === i) {
        clearTimeout(t);
        ws.off('message', h);
        if (m.error) rej(new Error(JSON.stringify(m.error)));
        else res(m.result);
      }
    };
    ws.on('message', h);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Runtime.enable');

  const result = await send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const ddOptions = (names) => {
        const options = {};
        names.forEach((name, i) => {
          options[name] = { label: name, index: String(i) };
        });
        return options;
      };
      const num = (code, label, opts) => Object.assign({
        type: 'NUMBER',
        code: code,
        label: label,
        required: false,
        unique: false,
        defaultValue: '',
        digit: true,
        displayScale: null,
        unit: '円',
        unitPosition: 'AFTER',
        maxValue: null,
        minValue: null,
      }, opts || {});
      const text = (code, label, opts) => Object.assign({
        type: 'SINGLE_LINE_TEXT',
        code: code,
        label: label,
        required: false,
        unique: false,
        maxLength: '255',
        minLength: null,
        defaultValue: '',
        expression: '',
        hideExpression: false,
      }, opts || {});
      const multi = (code, label, opts) => Object.assign({
        type: 'MULTI_LINE_TEXT',
        code: code,
        label: label,
        required: false,
        defaultValue: '',
      }, opts || {});
      const drop = (code, label, names, opts) => Object.assign({
        type: 'DROP_DOWN',
        code: code,
        label: label,
        required: false,
        options: ddOptions(names),
        defaultValue: (opts && opts.defaultValue) || '',
      }, opts || {});

      const api = (path, method, body) => kintone.api(kintone.api.url(path, true), method, body);
      const waitDeploy = async (appIds) => {
        for (let i = 0; i < 80; i++) {
          const st = await api('/k/v1/preview/app/deploy.json', 'GET', { apps: appIds });
          const apps = st.apps || [];
          const pending = apps.some((a) => a.status === 'PROCESSING');
          const fail = apps.find((a) => a.status === 'FAIL');
          if (fail) return { ok: false, fail };
          if (!pending && apps.every((a) => a.status === 'SUCCESS')) return { ok: true, apps };
          await new Promise((r) => setTimeout(r, 500));
        }
        return { ok: false, timeout: true };
      };

      // Guard: do not create duplicate by name if already exists in space/portal listing is hard;
      // check by searching apps the user can see via app list is limited — skip if STORE env set.
      const create = await api('/k/v1/preview/app.json', 'POST', {
        name: '店舗入金管理',
        description: '店舗A550専用 入金管理 S1。税込正・印刷プラグイン同型 Math.round(ex*0.1)。本番JSは別途承認後。',
      });
      const appId = Number(create.app);

      const headerProps = {
        store_payment_no: text('store_payment_no', '入金番号', { unique: true, maxLength: '32' }),
        personal_customer_id: text('personal_customer_id', '個人顧客ID', { required: true, maxLength: '16', minLength: '1' }),
        client_name_snapshot: text('client_name_snapshot', 'お客様名（当時）', { maxLength: '100' }),
        payment_date: {
          type: 'DATE',
          code: 'payment_date',
          label: '入金日',
          required: true,
          unique: false,
          defaultValue: '',
          defaultExpression: 'TODAY',
        },
        payment_amount: num('payment_amount', '入金額', { required: true }),
        payment_method: drop('payment_method', '入金方法', ['現金', 'クレジットカード', 'その他'], { required: true, defaultValue: '現金' }),
        pos_transaction_id: text('pos_transaction_id', 'スマレジ取引番号', { maxLength: '64' }),
        payment_staff: {
          type: 'USER_SELECT',
          code: 'payment_staff',
          label: '担当者',
          required: true,
          entities: [],
        },
        transaction_id: text('transaction_id', '処理ID', { required: true, unique: true, maxLength: '64', minLength: '1' }),
        payment_status: drop('payment_status', '入金処理状態', ['有効', '取消', '返金済'], { required: true, defaultValue: '有効' }),
        payment_channel: drop('payment_channel', '入金チャネル', ['店舗', 'WEB', '移行'], { defaultValue: '店舗' }),
        payment_timing: drop('payment_timing', '入金タイミング', ['受付時', '引き取り時', 'その他'], { defaultValue: '' }),
        record_kind: drop('record_kind', 'レコード種別', ['入金', '返金'], { required: true, defaultValue: '入金' }),
        related_refund_of: text('related_refund_of', '返金元入金番号', { maxLength: '32' }),
        cancel_reason: multi('cancel_reason', '取消・返金理由'),
        cancel_datetime: {
          type: 'DATETIME',
          code: 'cancel_datetime',
          label: '取消日時',
          required: false,
          unique: false,
          defaultValue: '',
          defaultExpression: '',
        },
        unpaid_handover_approved: {
          type: 'CHECK_BOX',
          code: 'unpaid_handover_approved',
          label: '未収入金引き渡し承認',
          required: false,
          options: ddOptions(['承認済']),
          defaultValue: [],
          align: 'HORIZONTAL',
        },
        notes: multi('notes', 'メモ'),
        store_payment_lines: {
          type: 'SUBTABLE',
          code: 'store_payment_lines',
          label: '入金充当明細',
          noLabel: false,
          fields: {
            order_record_id: num('order_record_id', 'App16レコードID', {
              required: true,
              digit: false,
              unit: null,
              unitPosition: 'BEFORE',
              minValue: '1',
            }),
            manage_no: text('manage_no', '管理番号', { required: true, maxLength: '32' }),
            personal_customer_id_line: text('personal_customer_id_line', '個人顧客ID（行）', {
              required: true,
              maxLength: '16',
              minLength: '1',
            }),
            kimono_type_snapshot: text('kimono_type_snapshot', '着物種類（当時）', { maxLength: '100' }),
            billed_ex_tax: num('billed_ex_tax', '請求税抜（スナップショット）'),
            billed_amount: num('billed_amount', '請求税込（スナップショット）', { required: true }),
            allocated_amount: num('allocated_amount', '今回充当額', { required: true }),
            previously_paid_amount: num('previously_paid_amount', '充当前累計入金', { required: true }),
            balance_after_line: num('balance_after_line', '充当後残額'),
            line_note: text('line_note', '行メモ', { maxLength: '200' }),
          },
        },
      };

      await api('/k/v1/preview/app/form/fields.json', 'POST', {
        app: appId,
        properties: headerProps,
      });

      await api('/k/v1/preview/app/deploy.json', 'POST', { apps: [{ app: appId }] });
      const dep = await waitDeploy([appId]);
      if (!dep.ok) {
        return { ok: false, stage: 'deploy', dep, appId };
      }

      const fields = await api('/k/v1/app/form/fields.json', 'GET', { app: appId });
      const props = fields.properties || {};
      const business = Object.keys(props).filter((k) => !/レコード|作成|更新|カテゴリー|ステータス|作業者|Status|Assignee|Categories|Record_number|Created_|Updated_/.test(k)).sort();
      const sub = props.store_payment_lines;
      const lineCodes = sub && sub.fields ? Object.keys(sub.fields).sort() : [];

      return {
        ok: true,
        appId: appId,
        url: location.origin + '/k/' + appId + '/',
        businessFields: business,
        lineFields: lineCodes,
        fieldCount: business.length,
        taxLocked: {
          rate: 0.1,
          rounding: 'round',
          formula: 'tax = Math.round(ex * 0.1); inclusive = ex + tax',
          unit: 'order subtotal (sum App16 detail_table.amount)',
        },
      };
    })()`,
  });

  if (result.exceptionDetails) {
    console.error(JSON.stringify(result.exceptionDetails, null, 2));
    process.exit(1);
  }

  const value = result.result && result.result.value;
  console.log(JSON.stringify(value, null, 2));
  fs.writeFileSync('/tmp/store_payment_s1_created.json', JSON.stringify(value, null, 2));
  if (!value || !value.ok) process.exit(1);
  ws.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
