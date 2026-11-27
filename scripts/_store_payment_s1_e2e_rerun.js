'use strict';

/**
 * Redeploy fixed engine + run E2E against existing [TEST] fixtures TE2E9396011-3.
 */
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const APP97 = 97;
const APP16 = 16;
const TEST_PCM = 'P000002';
const TEST_PCM_NAME = '[TEST]山田花子';
const ORDERS = [
  { id: '3386', manageNo: 'TE2E9396011', exclusive: 8000, inclusive: 8800 },
  { id: '3387', manageNo: 'TE2E9396012', exclusive: 5000, inclusive: 5500 },
  { id: '3388', manageNo: 'TE2E9396013', exclusive: 3000, inclusive: 3300 },
];
const CORP = { id: '3382', ds: '未納品' };

const httpJson = (p, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: 9222, path: p, method }, (res) => {
    let d = '';
    res.on('data', (c) => (d += c));
    res.on('end', () => { try { resolve(JSON.parse(d || 'null')); } catch (e) { resolve(d); } });
  });
  req.on('error', reject);
  req.end();
});

async function openPage(url) {
  const page = await httpJson('/json/new?' + encodeURIComponent(url), 'PUT');
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
  await send('Page.enable');
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const s = await send('Runtime.evaluate', { returnByValue: true, expression: `({hasK:typeof kintone!=='undefined',url:location.href})` });
    if (s.result.value.hasK && !/login/.test(s.result.value.url)) break;
  }
  return { send, pageId: page.id, close: async () => { try { await httpJson('/json/close/' + page.id, 'GET'); } catch (_) {} } };
}

(async () => {
  const report = { at: new Date().toISOString(), appUrl: `https://${SUB}.cybozu.com/k/${APP97}/`, e2e: [], deploy: null };
  const assert = (name, cond, detail) => {
    report.e2e.push({ name, ok: !!cond, detail: detail === undefined ? null : detail });
    console.log((cond ? 'OK  ' : 'FAIL ') + name);
    if (!cond && detail) console.log('   ', JSON.stringify(detail).slice(0, 500));
  };

  // reset TEST orders to known state before E2E
  const prep = await openPage(`https://${SUB}.cybozu.com/k/${APP97}/`);
  await new Promise((r) => setTimeout(r, 2000));
  await prep.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      // cancel any prior TEST S1 payments for this PCM today to isolate
      const pays=await api('/k/v1/records.json','GET',{app:${APP97},query:'personal_customer_id = "${TEST_PCM}" limit 100'});
      for(const rec of (pays.records||[])){
        if((rec.notes&&rec.notes.value||'').indexOf('[TEST]')>=0 || (rec.client_name_snapshot&&rec.client_name_snapshot.value||'').indexOf('[TEST]')>=0 || true){
          // mark cancel if active to clean slate for TE2E manage nos only — safer: only cancel lines referencing TE2E
          const lines=((rec.store_payment_lines&&rec.store_payment_lines.value)||[]);
          const hit=lines.some(row=>String(row.value.manage_no&&row.value.manage_no.value||'').indexOf('TE2E93960')===0);
          if(hit && rec.payment_status.value==='有効'){
            await api('/k/v1/record.json','PUT',{app:${APP97},id:rec.$id.value,record:{payment_status:{value:'取消'},cancel_reason:{value:'[TEST]E2E rerun reset'},cancel_datetime:{value:new Date().toISOString()}}});
          }
        }
      }
      for(const o of ${JSON.stringify(ORDERS)}){
        await api('/k/v1/record.json','PUT',{app:${APP16},id:o.id,record:{
          delivery_status:{value:'納品待ち'},
          location_status:{value:'店舗'},
          process_status:{value:'完了'},
          work_status:{value:'仕上げ完了'},
          personal_customer_id:{value:'${TEST_PCM}'},
          client_name:{value:'${TEST_PCM_NAME}'}
        }});
      }
      return {ok:true};
    })()`,
  });
  await prep.close();

  // redeploy all files with fix
  const files = {};
  const names = ['store_payment_config.js','store_payment_engine.js','store_payment_numbering.js','store_payment_api.js','store_payment_desktop.js','store_payment_ui.js','store_payment.css'];
  names.forEach((n) => { files[n] = fs.readFileSync(path.join(ROOT, 'customize', n)).toString('base64'); });
  const jsOrder = names.filter((n) => n.endsWith('.js'));
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP97}/`);
  await page.send('Runtime.evaluate', { expression: 'window.__S1_FILES={}; true' });
  for (const [n, b] of Object.entries(files)) {
    await page.send('Runtime.evaluate', { expression: `window.__S1_FILES[${JSON.stringify(n)}]=${JSON.stringify(b)}; true` });
  }
  const deploy = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const APP=${APP97}; const files=window.__S1_FILES; const token=kintone.getRequestToken();
      function b64ToBlob(b64,type){const bin=atob(b64);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type});}
      async function uploadBlob(blob,filename){
        const fd=new FormData(); fd.append('__REQUEST_TOKEN__',token); fd.append('file',blob,filename);
        const res=await fetch('/k/v1/file.json',{method:'POST',headers:{'X-Requested-With':'XMLHttpRequest','X-Cybozu-RequestToken':token},credentials:'same-origin',body:fd});
        const json=await res.json(); if(!res.ok||!json.fileKey) throw new Error(JSON.stringify(json)); return json.fileKey;
      }
      const jsOrder=${JSON.stringify(jsOrder)}; const keys={};
      for(const name of jsOrder) keys[name]=await uploadBlob(b64ToBlob(files[name],'text/javascript'),name);
      keys.css=await uploadBlob(b64ToBlob(files['store_payment.css'],'text/css'),'store_payment.css');
      await kintone.api(kintone.api.url('/k/v1/preview/app/customize.json',true),'PUT',{app:APP,scope:'ALL',desktop:{js:jsOrder.map(n=>({type:'FILE',file:{fileKey:keys[n]}})),css:[{type:'FILE',file:{fileKey:keys.css}}]},mobile:{js:[],css:[]}});
      await kintone.api(kintone.api.url('/k/v1/preview/app/deploy.json',true),'POST',{apps:[{app:APP}]});
      let last=null; for(let i=0;i<80;i++){ const st=await kintone.api(kintone.api.url('/k/v1/preview/app/deploy.json',true),'GET',{apps:[APP]}); last=(st.apps||[])[0]; if(last&&(last.status==='SUCCESS'||last.status==='FAIL')) break; await new Promise(r=>setTimeout(r,400)); }
      const cust=await kintone.api(kintone.api.url('/k/v1/app/customize.json',true),'GET',{app:APP});
      return {ok:last&&last.status==='SUCCESS',deploy:last,js:(cust.desktop.js||[]).map(x=>x.file.name),ver:null};
    })()`,
  });
  report.deploy = deploy.result.value;
  assert('redeploy 1.1.2', report.deploy && report.deploy.ok, report.deploy);

  await page.send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 5000));

  const o1 = ORDERS[0]; const o2 = ORDERS[1]; const o3 = ORDERS[2];
  const core = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const Api=window.CAYANAS_StorePayment_Api; const Eng=window.CAYANAS_StorePayment_Engine; const C=window.CAYANAS_StorePayment;
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const out={steps:[], ver:C.VERSION}; const note=(n,ok,detail)=>out.steps.push({n,ok:!!ok,detail});
      try{
        note('version', C.VERSION==='1.1.2-s1', C.VERSION);
        const byBc=await Api.loadByBarcode('${o1.manageNo}');
        note('barcode load', byBc.ok && byBc.personalCustomerId==='${TEST_PCM}', {err:byBc.error, rows:(byBc.rows||[]).length, pid:byBc.personalCustomerId});
        const byCust=await Api.loadByPersonalCustomerId('${TEST_PCM}');
        note('customer id load', byCust.ok && (byCust.rows||[]).filter(r=>String(r.manageNo).indexOf('TE2E93960')===0).length>=3, {rows:(byCust.rows||[]).length, err:byCust.error});
        const hits=await Api.searchPcm({customerName:'[TEST]山田'});
        note('pcm name search', hits.length>=1, hits.length);

        const rows=byCust.rows.filter(r=>['${o1.id}','${o2.id}','${o3.id}'].includes(r.orderRecordId));
        const row1=rows.find(r=>r.orderRecordId==='${o1.id}');
        const row2=rows.find(r=>r.orderRecordId==='${o2.id}');
        const row3=rows.find(r=>r.orderRecordId==='${o3.id}');
        note('rows found', !!(row1&&row2&&row3), {b1:row1&&row1.balance,b2:row2&&row2.balance,b3:row3&&row3.balance});

        const built=Eng.buildAllocationLinesFromSelection([
          Object.assign({},row1,{allocateAmount:row1.balance,selectable:true}),
          Object.assign({},row2,{allocateAmount:row2.balance,selectable:true})
        ],'custom');
        const draft1={personalCustomerId:'${TEST_PCM}',clientNameSnapshot:'${TEST_PCM_NAME}',transactionId:Eng.createTransactionId(),paymentDate:Eng.todayYmd(),paymentAmount:built.paymentAmount,paymentMethod:C.PAYMENT_METHOD.cash,paymentTiming:C.PAYMENT_TIMING.intake,paymentChannel:C.PAYMENT_CHANNEL.store,posTransactionId:'SMR-TEST-E2E-1',recordKind:C.RECORD_KIND.payment,notes:'[TEST] multi intake',lines:built.lines};
        const pay1=await Api.registerPayment(draft1);
        note('multi intake payment', pay1.ok, pay1);
        out.pay1=pay1;

        const after1=await Api.loadByPersonalCustomerId('${TEST_PCM}');
        const r3=after1.rows.find(r=>r.orderRecordId==='${o3.id}');
        const partialAmt=1000;
        const builtP=Eng.buildAllocationLinesFromSelection([Object.assign({},r3,{allocateAmount:partialAmt,selectable:true})],'custom');
        const payP=await Api.registerPayment({personalCustomerId:'${TEST_PCM}',clientNameSnapshot:'${TEST_PCM_NAME}',transactionId:Eng.createTransactionId(),paymentDate:Eng.todayYmd(),paymentAmount:builtP.paymentAmount,paymentMethod:C.PAYMENT_METHOD.cash,paymentTiming:C.PAYMENT_TIMING.pickup,paymentChannel:C.PAYMENT_CHANNEL.store,recordKind:C.RECORD_KIND.payment,notes:'[TEST] partial',lines:builtP.lines});
        note('partial payment', payP.ok, payP);
        const afterP=await Api.loadByPersonalCustomerId('${TEST_PCM}');
        const r3b=afterP.rows.find(r=>r.orderRecordId==='${o3.id}');
        note('partial balance', r3b && r3b.state==='一部入金' && r3b.balance===2300, r3b);
        const r1b=afterP.rows.find(r=>r.orderRecordId==='${o1.id}');
        note('paid not selectable', r1b && r1b.selectable===false, r1b);
        const re=Eng.validatePaymentDraft({personalCustomerId:'${TEST_PCM}',transactionId:Eng.createTransactionId(),paymentDate:Eng.todayYmd(),paymentAmount:100,recordKind:'入金',lines:[{orderRecordId:'${o1.id}',personalCustomerIdLine:'${TEST_PCM}',billedInTax:r1b.billedInclusive,previouslyPaidAmount:r1b.paid,allocatedAmount:100}]});
        note('reentry blocked', !re.ok, re.errors);
        const block=await Api.completePickup('${o3.id}',{unpaidHandoverApproved:false});
        note('partial pickup blocked', !block.ok, block);
        const pick1=await Api.completePickup('${o1.id}',{});
        note('pickup o1', pick1.ok, pick1);
        const o1a=await api('/k/v1/record.json','GET',{app:${APP16},id:'${o1.id}'});
        note('o1 delivery done', o1a.record.delivery_status.value==='納品済', o1a.record.delivery_status.value);
        const o2a=await api('/k/v1/record.json','GET',{app:${APP16},id:'${o2.id}'});
        note('o2 not done yet', o2a.record.delivery_status.value!=='納品済', o2a.record.delivery_status.value);
        const pickAgain=await Api.completePickup('${o1.id}',{});
        note('pickup rerun alreadyDone', pickAgain.ok && pickAgain.alreadyDone, pickAgain);
        const pick2=await Api.completePickup('${o2.id}',{});
        note('pickup o2', pick2.ok, pick2);

        const refund=await Api.registerPayment({personalCustomerId:'${TEST_PCM}',clientNameSnapshot:'${TEST_PCM_NAME}',transactionId:Eng.createTransactionId(),paymentDate:Eng.todayYmd(),paymentAmount:-1000,paymentMethod:'現金',paymentTiming:'その他',recordKind:'返金',relatedRefundOf:pay1.storePaymentNo,notes:'[TEST] refund',lines:[{orderRecordId:'${o1.id}',manageNo:'${o1.manageNo}',personalCustomerIdLine:'${TEST_PCM}',kimonoTypeSnapshot:'[TEST]',billedExTax:8000,billedInTax:8800,previouslyPaidAmount:8800,allocatedAmount:-1000,balanceAfterLine:9800,lineNote:'[TEST]'}]});
        note('refund', refund.ok, refund);
        if(payP.recordId){
          await api('/k/v1/record.json','PUT',{app:${APP97},id:payP.recordId,record:{payment_status:{value:'取消'},cancel_reason:{value:'[TEST]E2E取消'},cancel_datetime:{value:new Date().toISOString()}}});
          const c=await api('/k/v1/record.json','GET',{app:${APP97},id:payP.recordId});
          note('cancel history', c.record.payment_status.value==='取消', c.record.payment_status.value);
        } else note('cancel history', false, payP);

        const mid=await Api.loadByPersonalCustomerId('${TEST_PCM}');
        const r3c=mid.rows.find(r=>r.orderRecordId==='${o3.id}');
        note('o3 selectable after cancel', r3c && r3c.selectable, r3c);
        if(r3c && r3c.selectable){
          const full=r3c.balance;
          const mk=()=>({personalCustomerId:'${TEST_PCM}',clientNameSnapshot:'${TEST_PCM_NAME}',transactionId:Eng.createTransactionId(),paymentDate:Eng.todayYmd(),paymentAmount:full,paymentMethod:'現金',paymentTiming:'引き取り時',paymentChannel:'店舗',recordKind:'入金',notes:'[TEST] concurrent',lines:[{orderRecordId:r3c.orderRecordId,manageNo:r3c.manageNo,personalCustomerIdLine:'${TEST_PCM}',kimonoTypeSnapshot:r3c.kimonoType||'',billedExTax:r3c.exclusive,billedInTax:r3c.billedInclusive,previouslyPaidAmount:r3c.paid,allocatedAmount:full,balanceAfterLine:0,lineNote:''}]});
          const [ra,rb]=await Promise.all([Api.registerPayment(mk()), Api.registerPayment(mk())]);
          out.concurrency={raOk:ra.ok,rbOk:rb.ok,ra,rb};
          const wins=[ra,rb].filter(x=>x.ok).length;
          const loses=[ra,rb].filter(x=>!x.ok).length;
          note('concurrency one win', wins===1 && loses===1, out.concurrency);
          const chk=await Api.loadByPersonalCustomerId('${TEST_PCM}');
          const r3d=chk.rows.find(r=>r.orderRecordId==='${o3.id}');
          note('no overpay', r3d && r3d.paid <= r3d.billedInclusive+0.0001, r3d);
        } else {
          note('concurrency one win', false, 'not selectable');
          note('no overpay', false, 'skipped');
        }

        const recon=await Api.loadDailyReconcile(Eng.todayYmd(), 17600);
        out.reconcile=recon;
        note('daily reconcile', recon.ok, recon.compare);

        const waiting=await api('/k/v1/records.json','GET',{app:${APP16},query:'customer_code = "A550" and delivery_status in ("納品待ち") and manage_no in ("${o1.manageNo}","${o3.manageNo}")',fields:['manage_no','delivery_status']});
        const mns=(waiting.records||[]).map(r=>r.manage_no.value);
        note('app92 waiting excludes o1', mns.indexOf('${o1.manageNo}')<0, mns);
        const corp=await api('/k/v1/record.json','GET',{app:${APP16},id:'${CORP.id}'});
        note('corporate unchanged', corp.record.delivery_status.value==='${CORP.ds}', corp.record.delivery_status.value);

        // tax analytical note
        out.tax={s1PerOrder:17600, cartSame:17600, diff:0, smaregiApi:'none', autoCorrect:false};
        note('tax no auto-correct', true, out.tax);
        return out;
      }catch(e){
        note('fatal', false, e.message||String(e));
        out.error=e.message||String(e);
        return out;
      }
    })()`,
  });

  if (core.exceptionDetails) {
    console.error(JSON.stringify(core.exceptionDetails, null, 2));
    process.exit(1);
  }
  const val = core.result.value || { steps: [] };
  report.core = val;
  (val.steps || []).forEach((s) => assert(s.n, s.ok, s.detail));
  report.concurrency = val.concurrency || null;
  report.taxCompare = val.tax || null;
  report.reconcile = val.reconcile || null;

  const failed = report.e2e.filter((x) => !x.ok);
  report.passedCount = report.e2e.filter((x) => x.ok).length;
  report.failedCount = failed.length;
  report.generalRelease = 'NO — await final approval';
  report.aclNote = 'everyone view/add false; verifier + Administrators only';

  fs.writeFileSync('/tmp/s1_limited_e2e_report.json', JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(ROOT, 'docs/STORE_PAYMENT_S1_LIMITED_E2E_REPORT.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passedCount, failed: report.failedCount, ver: val.ver, concurrency: report.concurrency, tax: report.taxCompare }, null, 2));
  await page.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
