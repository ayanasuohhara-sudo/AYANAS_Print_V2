'use strict';

/**
 * 一般公開前の最終確認（検証データのみ）
 * - 実画面相当: App19 UI 保存 → App16/App92/App97
 * - 異常系: 再保存 / 二重登録 / 編集警告 / 同期失敗・再実行 / App97 入金後 App16 失敗
 *
 * node scripts/_a550_final_pre_release_verify.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const APP16 = 16;
const APP19 = 19;
const APP92 = 92;
const APP97 = 97;
const TEST_PCM = 'P000002';
const TEST_PCM_NAME = '[TEST]山田花子';
const FIXTURES = JSON.parse(fs.readFileSync('/tmp/a550_final_fixtures.json', 'utf8'));
const OUT = path.join(ROOT, 'docs', 'A550_FINAL_PRE_RELEASE_VERIFY.json');

const httpJson = (p, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 9222, path: p, method }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d || 'null'));
        } catch (e) {
          resolve(d);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });

async function openPage(url) {
  const page = await httpJson('/json/new?' + encodeURIComponent(url), 'PUT');
  if (!page || !page.webSocketDebuggerUrl) throw new Error('open failed ' + JSON.stringify(page));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  let id = 1;
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
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
  await send('Page.enable');
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 300));
    try {
      const s = await send('Runtime.evaluate', {
        returnByValue: true,
        expression: `({hasK:typeof kintone!=='undefined',url:location.href})`,
      });
      if (s.result && s.result.value && s.result.value.hasK && !/login/.test(s.result.value.url)) break;
    } catch (_) {}
  }
  return {
    send,
    pageId: page.id,
    close: async () => {
      try {
        await httpJson('/json/close/' + page.id, 'GET');
      } catch (_) {}
    },
  };
}

async function attachAny() {
  const list = await httpJson('/json/list');
  const page = (list || []).find(
    (t) => t.type === 'page'
      && /cybozu\.com\/k/.test(t.url || '')
      && !/login/.test(t.url || '')
      && !/web-worker/.test(t.url || '')
  );
  if (!page) throw new Error('no tab');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  let id = 1;
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
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
  return { send, close: () => ws.close(), pageId: page.id, url: page.url };
}

async function reattachById(pageId) {
  const list = await httpJson('/json/list');
  const page = (list || []).find((t) => t.id === pageId) || (list || []).find(
    (t) => t.type === 'page' && /\/k\/19\//.test(t.url || '')
  );
  if (!page) throw new Error('page lost');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  let id = 1;
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = id++;
      const t = setTimeout(() => rej(new Error('timeout ' + method)), 120000);
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
  return { send, close: () => ws.close(), pageId: page.id, url: page.url };
}

(async () => {
  const report = {
    at: new Date().toISOString(),
    fixtures: FIXTURES,
    scope: null,
    ui: [],
    abnormal: [],
    bugs: [],
    notes: [],
  };
  const assert = (bucket, name, cond, detail) => {
    const row = { name, ok: !!cond, detail: detail === undefined ? null : detail };
    report[bucket].push(row);
    console.log((cond ? 'OK  ' : 'FAIL ') + '[' + bucket + '] ' + name);
    if (!cond && detail) console.log('   ', typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 500));
  };

  // ---- 1) public scope ----
  {
    const p = await attachAny();
    const scope = await p.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        const out={};
        for(const app of [19,92,97]){
          const acl=await api('/k/v1/app/acl.json','GET',{app});
          const cust=await api('/k/v1/app/customize.json','GET',{app});
          const everyone=(acl.rights||[]).find(r=>r.entity && r.entity.code==='everyone');
          out[app]={
            everyoneView: !!(everyone&&everyone.recordViewable),
            everyoneAdd: !!(everyone&&everyone.recordAddable),
            js:((cust.desktop&&cust.desktop.js)||[]).map(x=>x.file&&x.file.name),
            hasA550Guard: ((cust.desktop&&cust.desktop.js)||[]).some(x=>x.file&&x.file.name==='delivery_a550_edit_guard.js'),
            hasStoreDeadline: ((cust.desktop&&cust.desktop.js)||[]).some(x=>x.file&&x.file.name==='store_deadline_engine.js'),
            hasPayment: ((cust.desktop&&cust.desktop.js)||[]).some(x=>x.file&&x.file.name==='store_payment_ui.js')
          };
        }
        return out;
      })()`,
    });
    p.close();
    report.scope = scope.result.value;
    assert('ui', 'App19 everyone に新JS適用（view/add true + edit_guard）',
      report.scope[19].everyoneView && report.scope[19].everyoneAdd && report.scope[19].hasA550Guard, report.scope[19]);
    assert('ui', 'App92 everyone に v1.1.0 適用',
      report.scope[92].everyoneView && report.scope[92].everyoneAdd && report.scope[92].hasStoreDeadline, report.scope[92]);
    assert('ui', 'App97 は限定ACL維持（everyone view/add false）',
      report.scope[97].everyoneView === false && report.scope[97].everyoneAdd === false && report.scope[97].hasPayment, report.scope[97]);
  }

  const [oStore, oFactory, oExtra] = FIXTURES.created;
  const today = FIXTURES.today;

  // ---- 2) Real UI: App19 create/save ----
  let slipId = null;
  let deliveryNo = null;
  {
    const page = await openPage(`https://${SUB}.cybozu.com/k/${APP19}/edit`);
    await new Promise((r) => setTimeout(r, 3000));
    await page.send('Runtime.evaluate', {
      expression: `(function(){
        const rec={
          customer_code:{value:'A550',type:'SINGLE_LINE_TEXT'},
          customer_name:{value:'ayanasu',type:'SINGLE_LINE_TEXT'},
          delivery_date:{value:${JSON.stringify(today)},type:'DATE'},
          delivery_type:{value:'本社納品',type:'DROP_DOWN'},
          delivery_detail:{type:'SUBTABLE',value:[
            {value:{manage_no:{value:${JSON.stringify(oStore.manageNo)},type:'SINGLE_LINE_TEXT'},client_name:{value:'${TEST_PCM_NAME}',type:'SINGLE_LINE_TEXT'},kimono_type:{value:'[TEST]最終確認小紋',type:'SINGLE_LINE_TEXT'},item_name:{value:'[TEST]最終確認',type:'SINGLE_LINE_TEXT'},qty:{value:'1',type:'NUMBER'},unit_price:{value:'3000',type:'NUMBER'}}},
            {value:{manage_no:{value:${JSON.stringify(oFactory.manageNo)},type:'SINGLE_LINE_TEXT'},client_name:{value:'${TEST_PCM_NAME}',type:'SINGLE_LINE_TEXT'},kimono_type:{value:'[TEST]最終確認小紋',type:'SINGLE_LINE_TEXT'},item_name:{value:'[TEST]最終確認',type:'SINGLE_LINE_TEXT'},qty:{value:'1',type:'NUMBER'},unit_price:{value:'3000',type:'NUMBER'}}}
          ]}
        };
        kintone.app.record.set({record:rec});
        return true;
      })()`,
    });
    await new Promise((r) => setTimeout(r, 800));
    // click save (short); navigation may kill in-flight awaits
    try {
      await page.send('Runtime.evaluate', {
        expression: `(function(){
          const btn=document.querySelector('.gaia-ui-actionmenu-save, .gaia-argoui-app-toolbar-savebutton')
            || [...document.querySelectorAll('button')].find(b=>/保存|Save/i.test(b.textContent||''));
          if(!btn) throw new Error('save button missing');
          btn.click();
          return true;
        })()`,
      });
    } catch (e) {
      // ignore navigation abort
    }

    let saved = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const sess = await reattachById(page.pageId);
        const st = await sess.send('Runtime.evaluate', {
          returnByValue: true,
          expression: `({url:location.href, id:(location.href.match(/record=(\\d+)/)||[])[1]||null, text:(document.body&&document.body.innerText||'').slice(0,200)})`,
        });
        const v = st.result.value;
        if (v.id || /show/.test(v.url)) {
          saved = v;
          sess.close();
          break;
        }
        sess.close();
      } catch (_) {}
    }
    try { await page.close(); } catch (_) {}

    assert('ui', 'App19 実画面でA550納品書を保存', !!(saved && saved.id), saved);
    slipId = saved && saved.id;
  }

  // wait for sync handler
  await new Promise((r) => setTimeout(r, 5000));

  // verify App16 after UI save
  {
    const p = await attachAny();
    const after = await p.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        const ids=${JSON.stringify([oStore.id, oFactory.id, oExtra.id])};
        const orders=[];
        for(const id of ids){
          const rec=(await api('/k/v1/record.json','GET',{app:16,id})).record;
          orders.push({id, mn:rec.manage_no.value, ds:rec.delivery_status.value, dn:rec.delivery_no&&rec.delivery_no.value, dd:rec.delivery_date&&rec.delivery_date.value, ps:rec.process_status.value, ls:rec.location_status.value, ws:rec.work_status.value});
        }
        let slip=null;
        if(${JSON.stringify(!!slipId)}){
          slip=(await api('/k/v1/record.json','GET',{app:19,id:${JSON.stringify(String(slipId || ''))}})).record;
        }
        return {
          orders,
          slipNo: slip&&slip.delivery_no&&slip.delivery_no.value,
          slipDate: slip&&slip.delivery_date&&slip.delivery_date.value,
          syncGlobal: typeof window.CAYANAS_DeliveryCompleteSync
        };
      })()`,
    });
    p.close();
    const orders = after.result.value.orders;
    deliveryNo = after.result.value.slipNo;
    const s = orders.find((o) => o.id === oStore.id);
    const f = orders.find((o) => o.id === oFactory.id);
    const e = orders.find((o) => o.id === oExtra.id);
    report.uiSync = after.result.value;

    // If UI save did not trigger sync (no dn), repair once via deployed helpers and flag
    if (!s.dn) {
      report.notes.push('UI保存後の自動同期が未反映のため、本番ヘルパーで1回補完して継続検証');
      const page = await openPage(`https://${SUB}.cybozu.com/k/${APP19}/`);
      await new Promise((r) => setTimeout(r, 2000));
      const repair = await page.send('Runtime.evaluate', {
        awaitPromise: true,
        returnByValue: true,
        expression: `(async()=>{
          const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
          const S=window.CAYANAS_DeliveryCompleteSync;
          let id=${JSON.stringify(String(slipId || ''))};
          let slip;
          if(id){
            slip=(await api('/k/v1/record.json','GET',{app:19,id})).record;
          } else {
            const created=await api('/k/v1/record.json','POST',{app:19,record:{
              customer_code:{value:'A550'},customer_name:{value:'ayanasu'},delivery_date:{value:${JSON.stringify(today)}},delivery_type:{value:'本社納品'},
              delivery_detail:{value:[
                {value:{manage_no:{value:${JSON.stringify(oStore.manageNo)}},client_name:{value:'${TEST_PCM_NAME}'},kimono_type:{value:'[TEST]'},item_name:{value:'[TEST]'},qty:{value:'1'},unit_price:{value:'3000'}}},
                {value:{manage_no:{value:${JSON.stringify(oFactory.manageNo)}},client_name:{value:'${TEST_PCM_NAME}'},kimono_type:{value:'[TEST]'},item_name:{value:'[TEST]'},qty:{value:'1'},unit_price:{value:'3000'}}}
              ]}
            }});
            id=String(created.id);
            slip=(await api('/k/v1/record.json','GET',{app:19,id})).record;
          }
          let dn=String((slip.delivery_no&&slip.delivery_no.value)||'').trim();
          if(!dn){
            dn='N'+${JSON.stringify(today)}.replace(/-/g,'')+'-'+id;
            await api('/k/v1/record.json','PUT',{app:19,id,record:{delivery_no:{value:dn}}});
          }
          const results=[];
          for(const mn of [${JSON.stringify(oStore.manageNo)}, ${JSON.stringify(oFactory.manageNo)}]){
            const order=(await api('/k/v1/records.json','GET',{app:16,query:'manage_no=\"'+mn+'\"'})).records[0];
            const plan=S.planStoreOrderSync(order, ${JSON.stringify(today)}, dn);
            if(plan.action==='put') await api('/k/v1/record.json','PUT',{app:16,id:order.$id.value,record:plan.record});
            results.push({mn,action:plan.action,reason:plan.reason});
          }
          return {ok:true,id,dn,results};
        })()`,
      });
      await page.close();
      report.uiRepair = repair.result.value;
      deliveryNo = repair.result.value.dn;
      slipId = repair.result.value.id;
      report.bugs.push({
        severity: 'medium',
        title: 'App19 UI保存後の App16 自動同期が本環境で未確認/未発火',
        mitigation: 'ヘルパーで補完して後続検証。本番イベント配線は customize に存在。手動再保存で確認推奨',
        detail: after.result.value,
      });
      // refresh orders
      const p2 = await attachAny();
      const refreshed = await p2.send('Runtime.evaluate', {
        awaitPromise: true,
        returnByValue: true,
        expression: `(async()=>{
          const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
          const out=[];
          for(const id of ${JSON.stringify([oStore.id, oFactory.id, oExtra.id])}){
            const rec=(await api('/k/v1/record.json','GET',{app:16,id})).record;
            out.push({id, mn:rec.manage_no.value, ds:rec.delivery_status.value, dn:rec.delivery_no&&rec.delivery_no.value, dd:rec.delivery_date&&rec.delivery_date.value, ps:rec.process_status.value, ls:rec.location_status.value, ws:rec.work_status.value});
          }
          return out;
        })()`,
      });
      p2.close();
      report.uiSync.orders = refreshed.result.value;
      Object.assign(s, refreshed.result.value.find((o) => o.id === oStore.id));
      Object.assign(f, refreshed.result.value.find((o) => o.id === oFactory.id));
      Object.assign(e, refreshed.result.value.find((o) => o.id === oExtra.id));
    }

    assert('ui', 'App16 納品書番号・納品待ち更新', !!(s.dn && f.dn && s.ds === '納品待ち' && f.ds === '納品待ち'), { s, f, deliveryNo });
    assert('ui', 'process/location/work 不変', s.ps === '完了' && s.ls === '店舗' && s.ws === '仕上げ完了' && f.ls === '工場', { s, f });
    assert('ui', '明細外 C は未同期', !e.dn, e);
  }

  // App92 schedule / inventory via engine on real page
  {
    const page = await openPage(`https://${SUB}.cybozu.com/k/${APP92}/`);
    await new Promise((r) => setTimeout(r, 4000));
    const kpi = await page.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        const E=window.CAYANAS_StoreDeadlineEngine;
        const C=window.CAYANAS_STORE_DEADLINE;
        const mns=${JSON.stringify([oStore.manageNo, oFactory.manageNo, oExtra.manageNo])};
        const recs=(await api('/k/v1/records.json','GET',{app:16,query:'customer_code=\"A550\" and manage_no in ('+mns.map(m=>'\"'+m+'\"').join(',')+')'})).records||[];
        const by=Object.fromEntries(recs.map(r=>[r.manage_no.value,r]));
        const store=by[${JSON.stringify(oStore.manageNo)}];
        const factory=by[${JSON.stringify(oFactory.manageNo)}];
        const extra=by[${JSON.stringify(oExtra.manageNo)}];
        const uiText=(document.body&&document.body.innerText)||'';
        return {
          ver:C&&C.VERSION,
          uiHasWaiting:/納品待ち在庫/.test(uiText),
          uiHasSlip:/店舗未到着|納品書済/.test(uiText),
          storeExcluded:E.isExcludedFromSchedule(store),
          factoryExcluded:E.isExcludedFromSchedule(factory),
          extraExcluded:E.isExcludedFromSchedule(extra),
          storeWaiting:E.isWaitingStockAtStore(store),
          factorySlip:E.isSlipCreatedNotAtStore(factory),
          factoryWaiting:E.isWaitingStockAtStore(factory)
        };
      })()`,
    });
    await page.close();
    report.app92 = kpi.result.value;
    assert('ui', 'App92 VERSION 1.1.0 / KPIラベル表示', kpi.result.value.ver === '1.1.0' && kpi.result.value.uiHasWaiting && kpi.result.value.uiHasSlip, kpi.result.value);
    assert('ui', 'App92 スケジュールから除外（A/B）', kpi.result.value.storeExcluded && kpi.result.value.factoryExcluded, kpi.result.value);
    assert('ui', 'App92 納品待ち在庫（店舗A）', kpi.result.value.storeWaiting === true, kpi.result.value);
    assert('ui', 'App92 店舗未到着（工場B）', kpi.result.value.factorySlip === true && kpi.result.value.factoryWaiting === false, kpi.result.value);
    assert('ui', '未納品書Cはスケジュール残存', kpi.result.value.extraExcluded === false, kpi.result.value);
  }

  // App97 barcode + pay + pickup (TEST only; no real customer)
  {
    const page = await openPage(`https://${SUB}.cybozu.com/k/${APP97}/`);
    await new Promise((r) => setTimeout(r, 4500));
    const pay = await page.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const Api=window.CAYANAS_StorePayment_Api;
        const Eng=window.CAYANAS_StorePayment_Engine;
        const C=window.CAYANAS_StorePayment;
        if(!Api||!Eng||!C) return {ok:false,error:'globals missing'};
        const ui=!!document.getElementById('stp-s1-accounting-root');
        const loaded=await Api.loadByBarcode(${JSON.stringify(oStore.manageNo)});
        if(!loaded.ok) return {ok:false,stage:'barcode',loaded,ui};
        const row=loaded.rows.find(r=>r.manageNo===${JSON.stringify(oStore.manageNo)});
        const built=Eng.buildAllocationLinesFromSelection([Object.assign({},row,{allocateAmount:row.balance,selectable:true})],'custom');
        const draft={
          personalCustomerId:'${TEST_PCM}',
          clientNameSnapshot:'${TEST_PCM_NAME}',
          transactionId:Eng.createTransactionId(),
          paymentDate:Eng.todayYmd(),
          paymentAmount:built.paymentAmount,
          paymentMethod:C.PAYMENT_METHOD.cash,
          paymentTiming:C.PAYMENT_TIMING.pickup,
          paymentChannel:C.PAYMENT_CHANNEL.store,
          recordKind:C.RECORD_KIND.payment,
          lines:built.lines
        };
        const pay=await Api.registerPayment(draft);
        if(!pay.ok) return {ok:false,stage:'pay',pay,ui,barcode:true};
        const pick=await Api.completePickup(${JSON.stringify(oStore.id)},{});
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        const after=(await api('/k/v1/record.json','GET',{app:16,id:${JSON.stringify(oStore.id)}})).record;
        return {ok:!!(pick.ok && after.delivery_status.value==='納品済'), ui, barcode:true, pay, pick, ds:after.delivery_status.value, dn:after.delivery_no.value};
      })()`,
    });
    await page.close();
    report.app97 = pay.result.value;
    assert('ui', 'App97 バーコード読取', !!(pay.result.value && pay.result.value.barcode), pay.result.value);
    assert('ui', 'App97 入金登録', !!(pay.result.value && pay.result.value.pay && pay.result.value.pay.ok), pay.result.value);
    assert('ui', 'App97 引き渡し完了→納品済', !!(pay.result.value && pay.result.value.ok && pay.result.value.ds === '納品済'), pay.result.value);
  }

  {
    const page = await openPage(`https://${SUB}.cybozu.com/k/${APP92}/`);
    await new Promise((r) => setTimeout(r, 2500));
    const gone = await page.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        const E=window.CAYANAS_StoreDeadlineEngine;
        const rec=(await api('/k/v1/record.json','GET',{app:16,id:${JSON.stringify(oStore.id)}})).record;
        return {waiting:E.isWaitingStockAtStore(rec), slip:E.isSlipCreatedNotAtStore(rec), excluded:E.isExcludedFromSchedule(rec), ds:rec.delivery_status.value};
      })()`,
    });
    await page.close();
    assert('ui', 'App92在庫から除外（納品済）', gone.result.value.waiting === false && gone.result.value.slip === false && gone.result.value.excluded === true, gone.result.value);
  }

  // ---- 3) Abnormal ----
  {
    const page = await openPage(`https://${SUB}.cybozu.com/k/${APP19}/`);
    await new Promise((r) => setTimeout(r, 2000));
    const ab = await page.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        const S=window.CAYANAS_DeliveryCompleteSync;
        const G=window.CAYANAS_DeliveryA550EditGuard;
        const today=${JSON.stringify(today)};
        const dn=${JSON.stringify(deliveryNo || '')};
        const order=(await api('/k/v1/records.json','GET',{app:16,query:'manage_no=\"'+${JSON.stringify(oFactory.manageNo)}+'\"'})).records[0];
        const resave=S.planStoreOrderSync(order, today, dn);
        const dual=S.planStoreOrderSync(order, today, dn+'-DUP');
        const guardHit=G && G.isA550WithSlip({customer_code:{value:'A550'},delivery_no:{value:dn||'N1'}});
        const guardCorp=!G.isA550WithSlip({customer_code:{value:'A100'},delivery_no:{value:'N9'}});

        // simulate sync failure then safe retry: temporary wrong then restore path
        // 1) force a warn (already has dn) as failure-to-apply case
        // 2) clear dn on EXTRA then put, then put again => skip
        const extra=(await api('/k/v1/records.json','GET',{app:16,query:'manage_no=\"'+${JSON.stringify(oExtra.manageNo)}+'\"'})).records[0];
        // create second slip for extra
        const created=await api('/k/v1/record.json','POST',{app:19,record:{
          customer_code:{value:'A550'},customer_name:{value:'ayanasu'},delivery_date:{value:today},delivery_type:{value:'本社納品'},
          delivery_detail:{value:[{value:{manage_no:{value:${JSON.stringify(oExtra.manageNo)}},client_name:{value:'${TEST_PCM_NAME}'},kimono_type:{value:'[TEST]'},item_name:{value:'[TEST]'},qty:{value:'1'},unit_price:{value:'3000'}}}]}
        }});
        const sid=String(created.id);
        const dn2='N'+today.replace(/-/g,'')+'-'+sid;
        await api('/k/v1/record.json','PUT',{app:19,id:sid,record:{delivery_no:{value:dn2}}});
        // simulate first sync failure: do nothing, detect missing
        const before=(await api('/k/v1/records.json','GET',{app:16,query:'manage_no=\"'+${JSON.stringify(oExtra.manageNo)}+'\"'})).records[0];
        const missing=!before.delivery_no.value;
        // safe re-run
        const plan2=S.planStoreOrderSync(before, today, dn2);
        if(plan2.action==='put') await api('/k/v1/record.json','PUT',{app:16,id:before.$id.value,record:plan2.record});
        const after=(await api('/k/v1/records.json','GET',{app:16,query:'manage_no=\"'+${JSON.stringify(oExtra.manageNo)}+'\"'})).records[0];
        const retry=S.planStoreOrderSync(after, today, dn2);

        return {
          resave, dual, guardHit, guardCorp, warningText: !!(G&&G.WARNING&&/自動では戻りません/.test(G.WARNING)),
          syncFailDetect: missing===true, syncRepair: after.delivery_no.value===dn2, syncRetrySkip: retry.action==='skip'
        };
      })()`,
    });
    await page.close();
    const a = ab.result.value;
    report.abnormalDetail = a;
    assert('abnormal', '同じ納品書の再保存は skip', a.resave && a.resave.action === 'skip', a.resave);
    assert('abnormal', '別納品書への重複は warn', a.dual && a.dual.action === 'warn', a.dual);
    assert('abnormal', '編集ガード対象判定（A550+番号）', a.guardHit === true && a.guardCorp === true && a.warningText, a);
    assert('abnormal', 'App16同期漏れを検出して安全に再実行', a.syncFailDetect && a.syncRepair && a.syncRetrySkip, a);
  }

  // App97: payment success then App16 update failure simulation
  {
    const page = await openPage(`https://${SUB}.cybozu.com/k/${APP97}/`);
    await new Promise((r) => setTimeout(r, 3500));
    const sim = await page.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const Api=window.CAYANAS_StorePayment_Api;
        const Eng=window.CAYANAS_StorePayment_Engine;
        const C=window.CAYANAS_StorePayment;
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        // use factory item (synced, not yet paid)
        const loaded=await Api.loadByBarcode(${JSON.stringify(oFactory.manageNo)});
        if(!loaded.ok) return {ok:false,error:'load',loaded};
        const row=loaded.rows.find(r=>r.manageNo===${JSON.stringify(oFactory.manageNo)});
        const built=Eng.buildAllocationLinesFromSelection([Object.assign({},row,{allocateAmount:row.balance,selectable:true})],'custom');
        const draft={
          personalCustomerId:'${TEST_PCM}', clientNameSnapshot:'${TEST_PCM_NAME}',
          transactionId:Eng.createTransactionId(), paymentDate:Eng.todayYmd(), paymentAmount:built.paymentAmount,
          paymentMethod:C.PAYMENT_METHOD.cash, paymentTiming:C.PAYMENT_TIMING.pickup, paymentChannel:C.PAYMENT_CHANNEL.store,
          recordKind:C.RECORD_KIND.payment, lines:built.lines
        };
        const pay=await Api.registerPayment(draft);
        if(!pay.ok) return {ok:false,stage:'pay',pay};
        // simulate App16 pickup failure: temporarily set invalid by using wrong id first
        let fail=null;
        try {
          fail=await Api.completePickup('999999999',{});
        } catch(e){ fail={ok:false, error:String(e.message||e)}; }
        const mid=(await api('/k/v1/record.json','GET',{app:16,id:${JSON.stringify(oFactory.id)}})).record;
        const stillWaiting=mid.delivery_status.value!=='納品済';
        // recovery: rerun pickup on correct id
        const pick=await Api.completePickup(${JSON.stringify(oFactory.id)},{});
        const after=(await api('/k/v1/record.json','GET',{app:16,id:${JSON.stringify(oFactory.id)}})).record;
        return {
          payOk:!!pay.ok,
          payNo:pay.storePaymentNo,
          failSimulated: !!(fail && fail.ok===false),
          stillWaitingAfterFail: stillWaiting,
          recoverOk: !!(pick.ok && after.delivery_status.value==='納品済'),
          finalDs: after.delivery_status.value
        };
      })()`,
    });
    await page.close();
    report.app97Failure = sim.result.value;
    assert('abnormal', 'App97入金成功後のApp16失敗を模擬し、入金は残る',
      sim.result.value.payOk && sim.result.value.failSimulated && sim.result.value.stillWaitingAfterFail, sim.result.value);
    assert('abnormal', 'App16更新失敗後に引き取り再実行で復旧', sim.result.value.recoverOk === true, sim.result.value);
  }

  report.passedUi = report.ui.filter((x) => x.ok).length;
  report.failedUi = report.ui.filter((x) => !x.ok).length;
  report.passedAbnormal = report.abnormal.filter((x) => x.ok).length;
  report.failedAbnormal = report.abnormal.filter((x) => !x.ok).length;
  report.app97GeneralRelease = 'NO — keep limited ACL; await final approval';
  report.staffImpact = {
    app19: 'everyone に新JS適用済み（A550保存で App16 同期・編集警告）。法人経路は従来どおり',
    app92: 'everyone に v1.1.0 適用済み（納品書番号除外・在庫KPI）。A550のみ表示',
    app97: 'everyone 不可。verifier/Administrators のみ',
  };

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    passedUi: report.passedUi,
    failedUi: report.failedUi,
    passedAbnormal: report.passedAbnormal,
    failedAbnormal: report.failedAbnormal,
    bugs: report.bugs.length,
    out: OUT,
  }, null, 2));
  process.exit((report.failedUi + report.failedAbnormal) ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
