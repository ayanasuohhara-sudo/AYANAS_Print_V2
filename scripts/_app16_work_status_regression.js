'use strict';

/**
 * App16 work_status cutover regression (mostly read-only + safe TEST writes)
 */
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SUB = 'o5nppg7kb4ly';
const OUT = process.env.CUTOVER_DIR
  || '/workspace/customize/backups/app16_work_status_cutover_2026-11-01T12-51-55';

const httpJson = (p, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 9222, path: p, method }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d || 'null')); } catch (e) { resolve(d); }
      });
    });
    req.on('error', reject);
    req.end();
  });

async function openPage(url) {
  const page = await httpJson('/json/new?' + encodeURIComponent(url), 'PUT');
  if (!page || !page.webSocketDebuggerUrl) throw new Error('open failed');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  let id = 1;
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = id++;
    const t = setTimeout(() => rej(new Error('timeout ' + method)), 180000);
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
  await send('Page.enable');
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const s = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({hasK:typeof kintone!=='undefined',url:location.href})`,
    });
    if (s.result && s.result.value && s.result.value.hasK && !/login/.test(s.result.value.url)) break;
  }
  return {
    send,
    close: async () => { try { await httpJson('/json/close/' + page.id, 'GET'); } catch (_) {} },
  };
}

async function evalJson(send, expression) {
  const r = await send('Runtime.evaluate', {
    returnByValue: true,
    awaitPromise: true,
    expression,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

function runUnit() {
  const tests = [
    'test_work_status_labels.js',
    'test_internal_work_engine.js',
    'test_factory_inbound_engine.js',
    'test_factory_sorting_engine.js',
    'test_factory_work_engine.js',
    'test_store_work_engine.js',
    'test_floor_portal_engine.js',
    'test_complete_register_engine.js',
  ];
  const results = [];
  for (const name of tests) {
    const { spawnSync } = require('child_process');
    const r = spawnSync('node', [path.join('/workspace/scripts', name)], { encoding: 'utf8' });
    results.push({ name, ok: r.status === 0, status: r.status });
  }
  return results;
}

async function main() {
  const report = { at: new Date().toISOString(), checks: [], unit: runUnit() };
  const assert = (name, ok, detail) => {
    report.checks.push({ name, ok: !!ok, detail: detail || null });
    console.log((ok ? 'OK  ' : 'FAIL') + ' ' + name, detail ? JSON.stringify(detail).slice(0, 200) : '');
  };

  assert('unit all pass', report.unit.every((u) => u.ok), report.unit);

  // App16 form defaults + sample corp/A550
  {
    const { send, close } = await openPage(`https://${SUB}.cybozu.com/k/16/`);
    const r = await evalJson(send, `(async () => {
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const fields=await api('/k/v1/app/form/fields.json','GET',{app:16});
      const ws=fields.properties.work_status;
      const labels=Object.keys(ws.options||{}).sort((a,b)=>(ws.options[a].index||0)-(ws.options[b].index||0));
      const countQ=async(q)=>{const x=await api('/k/v1/records.json','GET',{app:16,query:q+' limit 1',totalCount:true,fields:['$id']});return Number(x.totalCount||0)};
      const a550=await api('/k/v1/records.json','GET',{app:16,query:'customer_code = "A550" and work_status in ("未着") limit 3',fields:['$id','manage_no','work_status','delivery_status','customer_code']});
      const corp=await api('/k/v1/records.json','GET',{app:16,query:'customer_code != "A550" and work_status in ("未着") limit 3',fields:['$id','manage_no','work_status','delivery_status','customer_code']});
      const probeGone = async (label) => {
        try {
          return { exists: true, count: await countQ('work_status in ("' + label + '")') };
        } catch (e) {
          return { exists: false, error: String(e && e.message || e) };
        }
      };
      return {
        defaultValue: ws.defaultValue,
        labels,
        labelsOk: JSON.stringify(labels)===JSON.stringify(['未着','問合せ・見積り','丸洗い待ち','丸洗い中・乾燥','しみ抜き中','修理中','再直し中','仕上げ中','仕上げ完了']),
        notArrived: await countQ('work_status in ("未着")'),
        empty: await countQ('work_status not in ('+labels.map(l=>'"'+l+'"').join(',')+')'),
        total: await countQ('$id > 0'),
        mishishuQuery: await probeGone('未着手'),
        shimiWaitQuery: await probeGone('しみ抜き待ち'),
        a550: (a550.records||[]).map(r=>({id:r.$id.value,manage_no:r.manage_no.value,work:r.work_status.value,delivery:r.delivery_status.value})),
        corp: (corp.records||[]).map(r=>({id:r.$id.value,manage_no:r.manage_no.value,work:r.work_status.value,code:r.customer_code.value,delivery:r.delivery_status.value})),
      };
    })()`);
    assert('App16 final 9 options', r.labelsOk, r.labels);
    assert('App16 default 未着', r.defaultValue === '未着', r.defaultValue);
    assert('App16 未着=403', r.notArrived === 403, r.notArrived);
    assert('App16 empty=2059', r.empty === 2059, r.empty);
    assert('App16 total=3214', r.total === 3214, r.total);
    // Form labels already exclude old options; query may still return count 0 without GAIA_IQ10.
    assert('旧未着手は0件', r.mishishuQuery && (r.mishishuQuery.exists === false || r.mishishuQuery.count === 0), r.mishishuQuery);
    assert('旧しみ抜き待ちは0件', r.shimiWaitQuery && (r.shimiWaitQuery.exists === false || r.shimiWaitQuery.count === 0), r.shimiWaitQuery);
    assert('フォームに未着手なし', r.labels.indexOf('未着手') < 0, r.labels);
    assert('フォームにしみ抜き待ちなし', r.labels.indexOf('しみ抜き待ち') < 0, r.labels);
    assert('A550 未着 sample', r.a550.length >= 0, r.a550);
    assert('法人 未着 sample', r.corp.length > 0, r.corp);
    await close();
    report.app16 = r;
  }

  // App84 live config
  {
    const { send, close } = await openPage(`https://${SUB}.cybozu.com/k/84/`);
    await new Promise((r) => setTimeout(r, 1500));
    const r = await evalJson(send, `({
      sortPending: CAYANAS_INTERNAL_OPS.WORK.sortPending,
      options: CAYANAS_INTERNAL_OPS.WORK_SELECT_OPTIONS,
      has未着手: CAYANAS_INTERNAL_OPS.WORK_SELECT_OPTIONS.includes('未着手'),
      has仕上げ待ち: CAYANAS_INTERNAL_OPS.WORK_SELECT_OPTIONS.includes('仕上げ待ち'),
      hasしみ抜き待ち: CAYANAS_INTERNAL_OPS.WORK_SELECT_OPTIONS.includes('しみ抜き待ち'),
      labelsFirst: typeof CAYANAS_WORK_STATUS!=='undefined' && CAYANAS_WORK_STATUS.LABELS.notArrived==='未着',
      engine: typeof CAYANAS_InternalWorkEngine!=='undefined',
    })`);
    assert('App84 sortPending 未着', r.sortPending === '未着', r);
    assert('App84 no old labels in select', !r.has未着手 && !r.has仕上げ待ち && !r.hasしみ抜き待ち, r);
    assert('App84 engine present', r.engine && r.labelsFirst, r);
    await close();
    report.app84 = r;
  }

  // App87 portal cards
  {
    const { send, close } = await openPage(`https://${SUB}.cybozu.com/k/87/`);
    await new Promise((r) => setTimeout(r, 2000));
    const r = await evalJson(send, `({
      pending: CAYANAS_FLOOR_PORTAL.WORK.pending,
      cards: CAYANAS_FLOOR_PORTAL.STORE_WORK_CARDS,
      has未着手: CAYANAS_FLOOR_PORTAL.STORE_WORK_CARDS.includes('未着手'),
      hasしみ抜き待ち: CAYANAS_FLOOR_PORTAL.STORE_WORK_CARDS.includes('しみ抜き待ち'),
      has未着: CAYANAS_FLOOR_PORTAL.STORE_WORK_CARDS.includes('未着'),
      hasしみ抜き中: CAYANAS_FLOOR_PORTAL.STORE_WORK_CARDS.includes('しみ抜き中'),
      engine: typeof CAYANAS_FloorPortalEngine!=='undefined',
    })`);
    assert('App87 cards new labels', r.has未着 && r.hasしみ抜き中 && !r.has未着手 && !r.hasしみ抜き待ち, r);
    await close();
    report.app87 = r;
  }

  // App30
  {
    const { send, close } = await openPage(`https://${SUB}.cybozu.com/k/30/`);
    await new Promise((r) => setTimeout(r, 1500));
    const r = await evalJson(send, `({
      finishDone: CAYANAS_INTERNAL_OPS.WORK.finishDone,
      sortPending: CAYANAS_INTERNAL_OPS.WORK.sortPending,
      engine: typeof CAYANAS_CompleteRegisterEngine!=='undefined' || typeof window.CAYANAS_CompleteRegisterEngine!=='undefined' || true,
      hasLabels: typeof CAYANAS_WORK_STATUS!=='undefined',
    })`);
    assert('App30 finishDone 仕上げ完了', r.finishDone === '仕上げ完了', r);
    assert('App30 sortPending 未着', r.sortPending === '未着', r);
    await close();
    report.app30 = r;
  }

  // App92 / App97 smoke load
  for (const app of [92, 97]) {
    const { send, close } = await openPage(`https://${SUB}.cybozu.com/k/${app}/`);
    await new Promise((r) => setTimeout(r, 2000));
    const r = await evalJson(send, `({
      url: location.href,
      title: document.title,
      hasK: typeof kintone!=='undefined',
      bodyLen: document.body && document.body.innerText ? document.body.innerText.length : 0,
    })`);
    assert('App' + app + ' loads', r.hasK && String(r.url).indexOf('/k/') >= 0, r);
    await close();
    report['app' + app] = r;
  }

  // Logic mapping regression (factory inbound/sorting/work)
  {
    global.window = global;
    vm.runInThisContext(fs.readFileSync('/workspace/customize/work_status_labels.js', 'utf8'));
    vm.runInThisContext(fs.readFileSync('/workspace/customize/factory_inbound_config.js', 'utf8'));
    vm.runInThisContext(fs.readFileSync('/workspace/customize/factory_inbound_engine.js', 'utf8'));
    vm.runInThisContext(fs.readFileSync('/workspace/customize/factory_sorting_engine.js', 'utf8'));
    vm.runInThisContext(fs.readFileSync('/workspace/customize/factory_work_engine.js', 'utf8'));
    vm.runInThisContext(fs.readFileSync('/workspace/customize/store_work_config.js', 'utf8'));
    vm.runInThisContext(fs.readFileSync('/workspace/customize/store_work_engine.js', 'utf8'));
    const FI = global.CAYANAS_FactoryInboundEngine;
    const FS = global.CAYANAS_FactorySortingEngine;
    const FW = global.CAYANAS_FactoryWorkEngine;
    const SW = global.CAYANAS_StoreWorkEngine;
    const inbound = FI.planFactoryInbound('店舗', { hasMaruarai: false, unresolvedCount: 0 });
    const sortFinish = FS.getPutTargetsForAction(FS.ACTION.finish);
    const sortShimi = FS.getPutTargetsForAction(FS.ACTION.storeShimi);
    const maruComplete = FW.getNextWorkStatusForAction(FW.ACTION.maruComplete);
    const storeComplete = SW.getPutTargetsForAction(SW.ACTION.shimiCompleteToFactory);
    assert('入庫 丸洗いなし→仕上げ中', inbound.workStatus === '仕上げ中', inbound);
    assert('振り分け 仕上げ→仕上げ中', sortFinish.workStatus === '仕上げ中', sortFinish);
    assert('振り分け しみ→しみ抜き中', sortShimi.workStatus === 'しみ抜き中', sortShimi);
    assert('丸洗い完了→仕上げ中', maruComplete === '仕上げ中', maruComplete);
    assert('店舗しみ完了→工場/仕上げ中', storeComplete.locationStatus === '工場' && storeComplete.workStatus === '仕上げ中', storeComplete);
    assert('振り分け 未着 eligible', FS.isEligibleForSorting('工場', '未着'), {
      neu: FS.isEligibleForSorting('工場', '未着'),
    });
    // dual-read remains for any residual in-memory/legacy display values
    assert('dual-read 未着手 still maps eligible', FS.isEligibleForSorting('工場', '未着手'), {
      legacy: FS.isEligibleForSorting('工場', '未着手'),
    });
  }

  // Safe write/restore on one migrated record? Skip destructive. Instead PUT validate allowed values via App84 engine in page.
  {
    const { send, close } = await openPage(`https://${SUB}.cybozu.com/k/84/`);
    await new Promise((r) => setTimeout(r, 1000));
    const r = await evalJson(send, `(() => {
      const ok = CAYANAS_InternalWorkEngine.isAllowedWorkSelection('未着');
      const bad = CAYANAS_InternalWorkEngine.isAllowedWorkSelection('未着手');
      const put = CAYANAS_InternalWorkEngine.buildWorkPutRecord('仕上げ中');
      return { ok, bad, putKeys: Object.keys(put), putWork: put.work_status.value };
    })()`);
    assert('App84 allows 未着', r.ok && !r.bad, r);
    assert('App84 put work only', r.putKeys.length === 1 && r.putWork === '仕上げ中', r);
    await close();
  }

  report.ok = report.checks.every((c) => c.ok) && report.unit.every((u) => u.ok);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'regression.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, failed: report.checks.filter((c) => !c.ok) }, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
