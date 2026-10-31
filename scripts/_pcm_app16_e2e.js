'use strict';

/**
 * Production E2E for PCM×App16 — [TEST] data only.
 * Uses copy-from-existing to satisfy customer_code LOOKUP validation.
 */
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

const SUB = 'o5nppg7kb4ly';
const ORDER_APP = 16;
const PCM_APP = 96;
const TEST_PCM_ID = 'P000002';
const TEST_PCM_NAME = '[TEST]山田花子';

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
  if (!page || !page.webSocketDebuggerUrl) throw new Error('open failed');
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
    await new Promise((r) => setTimeout(r, 400));
    const s = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({hasK:typeof kintone!=='undefined',token:typeof kintone!=='undefined'&&kintone.getRequestToken&&!!kintone.getRequestToken(),url:location.href})`,
    });
    const v = s.result && s.result.value;
    if (v && v.hasK && v.token && !/login/.test(v.url || '')) break;
  }
  return { send, pageId: page.id };
}

async function closePage(pageId) {
  try {
    await httpJson('/json/close/' + pageId, 'GET');
  } catch (_) {}
}

async function portalSend() {
  const list = await httpJson('/json/list');
  const portal = (list || []).find(
    (t) => t.type === 'page' && /cybozu\.com/.test(t.url || '') && !/login/.test(t.url || '')
  );
  if (!portal) throw new Error('no portal');
  const ws = new WebSocket(portal.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  let id = 1;
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = id++;
      const t = setTimeout(() => rej(new Error('timeout')), 180000);
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
  return {
    send,
    close: () => ws.close(),
  };
}

async function waitUrl(send, pred, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const s = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({url:location.href,title:document.title})`,
    });
    if (pred(s.result.value)) return s.result.value;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('waitUrl timeout');
}

async function clickSave(send) {
  return send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(()=>{
      const nodes=[...document.querySelectorAll('button, a, .gaia-ui-actionmenu-save, [class*=save]')];
      const el=nodes.find(b=>/保存|Save/i.test((b.textContent||'').trim()) || /actionmenu-save/i.test(b.className||''));
      if(!el) return {ok:false};
      el.click();
      return {ok:true};
    })()`,
  });
}

async function readSavedRecord(send) {
  return send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const m=(location.hash||'').match(/record=(\\d+)/) || (location.href.match(/record=(\\d+)/));
      const rid=m&&m[1];
      if(!rid) return {ok:false,error:'no rid',url:location.href,title:document.title};
      // wait saiban PUT
      let last=null;
      for(let i=0;i<20;i++){
        const rec=await kintone.api(kintone.api.url('/k/v1/record.json',true),'GET',{app:16,id:rid});
        last=rec.record;
        if(last.manage_no && last.manage_no.value) break;
        await new Promise(r=>setTimeout(r,400));
      }
      return {
        ok:true,
        recordId:rid,
        personal:last.personal_customer_id&&last.personal_customer_id.value||'',
        client:last.client_name&&last.client_name.value||'',
        manage_no:last.manage_no&&last.manage_no.value||'',
        code:last.customer_code&&last.customer_code.value||'',
        kimono:last.kimono_type&&last.kimono_type.value||''
      };
    })()`,
  });
}

(async () => {
  const report = { tests: [], createdRecordIds: [], ok: true };
  const assert = (name, cond, detail) => {
    report.tests.push({ name, ok: !!cond, detail: detail || null });
    console.log((cond ? 'OK  ' : 'FAIL ') + name + (detail ? ' ' + JSON.stringify(detail) : ''));
    if (!cond) report.ok = false;
  };

  const portal = await portalSend();

  // seed ids
  const seeds = await portal.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const a550=await api('/k/v1/records.json','GET',{
        app:16,
        query:'customer_code = "A550" order by レコード番号 desc limit 1',
        fields:['$id','manage_no','customer_code','client_name','personal_customer_id']
      });
      const empty=await api('/k/v1/records.json','GET',{
        app:16,
        query:'customer_code = "A550" and personal_customer_id = "" order by レコード番号 desc limit 1',
        fields:['$id','manage_no','client_name']
      });
      const corp=await api('/k/v1/records.json','GET',{
        app:16,
        query:'customer_code != "A550" and customer_code != "" order by レコード番号 desc limit 1',
        fields:['$id','manage_no','customer_code','customer_name','client_name']
      });
      const pcm=await api('/k/v1/records.json','GET',{
        app:96,
        query:'personal_customer_id = "${TEST_PCM_ID}" limit 1',
        fields:['$id','personal_customer_id','customer_name']
      });
      return {
        a550:a550.records[0]&&{id:a550.records[0].$id.value, manage_no:a550.records[0].manage_no.value},
        empty:empty.records[0]&&{id:empty.records[0].$id.value, manage_no:empty.records[0].manage_no.value, client:empty.records[0].client_name.value},
        corp:corp.records[0]&&{id:corp.records[0].$id.value, code:corp.records[0].customer_code.value, manage_no:corp.records[0].manage_no.value},
        pcm:pcm.records[0]&&{id:pcm.records[0].$id.value, name:pcm.records[0].customer_name.value}
      };
    })()`,
  });
  portal.close();
  const seed = seeds.result.value;
  assert('seed A550 exists', !!seed.a550, seed.a550);
  assert('seed PCM P000002 exists', !!seed.pcm, seed.pcm);
  assert('seed corp exists', !!seed.corp, seed.corp);
  assert('seed legacy empty A550', !!seed.empty, seed.empty);

  let createdId = null;
  let manageNo1 = null;

  // --- 1) A550 new via copy + PCM select + save ---
  {
    const { send, pageId } = await openPage(
      `https://${SUB}.cybozu.com/k/${ORDER_APP}/edit?record=${seed.a550.id}#mode=copy`
    );
    await new Promise((r) => setTimeout(r, 5000));
    await send('Runtime.evaluate', {
      expression: `window.confirm=function(){return true;}; window.alert=function(){}; true`,
    });

    const loaded = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({pcm:!!window.CAYANAS_OrderPcm,eng:!!window.CAYANAS_OrderPcm_Engine,field:!!kintone.app.record.get().record.personal_customer_id,code:kintone.app.record.get().record.customer_code.value})`,
    });
    assert('copy form loaded with A550+PCM js', loaded.result.value.pcm && loaded.result.value.eng && loaded.result.value.code === 'A550', loaded.result.value);

    const prep = await send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const rows=await CAYANAS_OrderPcm_Engine.searchPersonalCustomers({personalCustomerId:'${TEST_PCM_ID}'});
        if(!rows.length) return {ok:false,error:'no pcm'};
        const pcm=rows[0];
        const id=CAYANAS_OrderPcm_Engine.readValue(pcm,'personal_customer_id');
        const name=CAYANAS_OrderPcm_Engine.readValue(pcm,'customer_name');
        const snap=kintone.app.record.get();
        const r=snap.record;
        r.personal_customer_id.value=id;
        r.personal_customer_id.disabled=true;
        r.client_name.value=name;
        if(r.kimono_type) r.kimono_type.value='[TEST]E2E小紋';
        if(r.location_status && !r.location_status.value) r.location_status.value='店舗';
        // clear manage_no like saiban1 (also saiban1 will clear on submit)
        if(r.manage_no) r.manage_no.value='';
        kintone.app.record.set({record:r});
        await new Promise(x=>setTimeout(x,400));
        const after=kintone.app.record.get().record;
        const panel=document.getElementById('order-pcm-search-panel');
        return {
          ok:true,
          personal:after.personal_customer_id.value,
          client:after.client_name.value,
          panelVisible:!!(panel&&!panel.hidden),
          location:after.location_status&&after.location_status.value
        };
      })()`,
    });
    assert('A550 PCM select on create(copy)', prep.result.value && prep.result.value.ok && prep.result.value.personal === TEST_PCM_ID && prep.result.value.client === TEST_PCM_NAME, prep.result.value);

    const click = await clickSave(send);
    assert('click save A550', click.result.value && click.result.value.ok, click.result.value);

    try {
      await waitUrl(send, (v) => /\/k\/16\/show/.test(v.url), 60000);
      await new Promise((r) => setTimeout(r, 1500));
      const detail = await readSavedRecord(send);
      assert('saved personal_customer_id remains', detail.result.value && detail.result.value.personal === TEST_PCM_ID, detail.result.value);
      assert('manage_no auto assigned', detail.result.value && /^\d{9}$/.test(detail.result.value.manage_no), detail.result.value);
      createdId = detail.result.value.recordId;
      manageNo1 = detail.result.value.manage_no;
      report.createdRecordIds.push(createdId);
    } catch (e) {
      const diag = await send('Runtime.evaluate', {
        returnByValue: true,
        expression: `({url:location.href,title:document.title,err:(document.querySelector('.notifier-error-cybozu,.ocean-notifier-error,.gaia-argoui-app-notify')||{}).textContent||document.body.innerText.slice(0,300)})`,
      });
      assert('saved personal_customer_id remains', false, { error: String(e.message || e), diag: diag.result.value });
      assert('manage_no auto assigned', false, 'skipped');
    }
    await closePage(pageId);
  }

  // --- 2) Copy again from created: inherit ID, new manage_no ---
  if (createdId) {
    const { send, pageId } = await openPage(
      `https://${SUB}.cybozu.com/k/${ORDER_APP}/edit?record=${createdId}#mode=copy`
    );
    await new Promise((r) => setTimeout(r, 5000));
    await send('Runtime.evaluate', {
      expression: `window.confirm=()=>true; window.alert=()=>{}; true`,
    });
    const copyShow = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(()=>{
        const r=kintone.app.record.get().record;
        return {personal:r.personal_customer_id.value, client:r.client_name.value, manage_no:r.manage_no.value};
      })()`,
    });
    assert('copy inherits personal_customer_id', copyShow.result.value && copyShow.result.value.personal === TEST_PCM_ID, copyShow.result.value);

    await send('Runtime.evaluate', {
      expression: `(()=>{ const snap=kintone.app.record.get(); if(snap.record.kimono_type) snap.record.kimono_type.value='[TEST]E2E複製'; if(snap.record.manage_no) snap.record.manage_no.value=''; kintone.app.record.set(snap); return true; })()`,
    });
    await clickSave(send);
    try {
      await waitUrl(send, (v) => /\/k\/16\/show/.test(v.url), 60000);
      await new Promise((r) => setTimeout(r, 1500));
      const copySaved = await readSavedRecord(send);
      assert('copy keeps personal id after save', copySaved.result.value && copySaved.result.value.personal === TEST_PCM_ID, copySaved.result.value);
      assert(
        'copy gets new manage_no',
        copySaved.result.value && copySaved.result.value.manage_no && copySaved.result.value.manage_no !== manageNo1,
        { first: manageNo1, second: copySaved.result.value.manage_no, id: copySaved.result.value.recordId }
      );
      report.createdRecordIds.push(copySaved.result.value.recordId);
    } catch (e) {
      assert('copy keeps personal id after save', false, String(e.message || e));
      assert('copy gets new manage_no', false, 'skipped');
    }
    await closePage(pageId);
  } else {
    assert('copy inherits personal_customer_id', false, 'skipped');
    assert('copy gets new manage_no', false, 'skipped');
  }

  // --- 3) App96 history ---
  if (seed.pcm) {
    const { send, pageId } = await openPage(
      `https://${SUB}.cybozu.com/k/${PCM_APP}/show#record=${seed.pcm.id}`
    );
    await new Promise((r) => setTimeout(r, 5500));
    const hist = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(()=>{
        const panel=document.getElementById('pcm-order-history-panel');
        const table=panel&&panel.querySelector('table');
        const text=panel?panel.innerText:'';
        return {
          panel:!!panel,
          hasTable:!!table,
          hasManage: ${JSON.stringify(manageNo1 || '')} ? text.indexOf(${JSON.stringify(manageNo1 || '')})>=0 : false,
          text: text.slice(0,400)
        };
      })()`,
    });
    assert('App96 order history shows linked orders', hist.result.value && hist.result.value.panel && hist.result.value.hasTable, hist.result.value);
    await closePage(pageId);
  }

  // --- 4) Legacy empty A550 edit warn only ---
  if (seed.empty) {
    const { send, pageId } = await openPage(
      `https://${SUB}.cybozu.com/k/${ORDER_APP}/edit?record=${seed.empty.id}`
    );
    await new Promise((r) => setTimeout(r, 4500));
    const val = await send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const r=kintone.app.record.get().record;
        const result=await CAYANAS_OrderPcm_Engine.validateStoreOrderPersonalCustomer(r,'edit');
        return {result, personal:r.personal_customer_id.value, code:r.customer_code.value};
      })()`,
    });
    assert(
      'legacy A550 edit empty is warn-only',
      val.result.value && val.result.value.result && val.result.value.result.ok && val.result.value.result.warnEmptyOnEdit,
      val.result.value
    );
    // do NOT save/change legacy record
    await closePage(pageId);
  }

  // --- 5) Corporate copy save without PCM ---
  if (seed.corp) {
    const { send, pageId } = await openPage(
      `https://${SUB}.cybozu.com/k/${ORDER_APP}/edit?record=${seed.corp.id}#mode=copy`
    );
    await new Promise((r) => setTimeout(r, 5000));
    await send('Runtime.evaluate', {
      expression: `window.confirm=()=>true; window.alert=()=>{}; true`,
    });
    const corpPrep = await send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const snap=kintone.app.record.get();
        const r=snap.record;
        if(r.personal_customer_id) r.personal_customer_id.value='';
        if(r.client_name) r.client_name.value='[TEST]法人E2Eお客様';
        if(r.manage_no) r.manage_no.value='';
        if(r.location_status && !r.location_status.value) r.location_status.value='本社';
        kintone.app.record.set({record:r});
        await new Promise(x=>setTimeout(x,300));
        const v=await CAYANAS_OrderPcm_Engine.validateStoreOrderPersonalCustomer(kintone.app.record.get().record,'create');
        const panel=document.getElementById('order-pcm-search-panel');
        return {
          code:kintone.app.record.get().record.customer_code.value,
          validateOk:v.ok,
          panelHidden:!panel||panel.hidden
        };
      })()`,
    });
    assert('corporate skips PCM validation', corpPrep.result.value && corpPrep.result.value.validateOk && corpPrep.result.value.code !== 'A550', corpPrep.result.value);

    await clickSave(send);
    try {
      await waitUrl(send, (v) => /\/k\/16\/show/.test(v.url), 60000);
      await new Promise((r) => setTimeout(r, 1500));
      const corpSaved = await readSavedRecord(send);
      assert(
        'corporate save empty personal id + manage_no',
        corpSaved.result.value
          && corpSaved.result.value.code !== 'A550'
          && !corpSaved.result.value.personal
          && /^\d{9}$/.test(corpSaved.result.value.manage_no),
        corpSaved.result.value
      );
      report.createdRecordIds.push(corpSaved.result.value.recordId);
    } catch (e) {
      const diag = await send('Runtime.evaluate', {
        returnByValue: true,
        expression: `({url:location.href,err:(document.querySelector('.notifier-error-cybozu,.gaia-argoui-app-notify')||{}).textContent||document.body.innerText.slice(0,250)})`,
      });
      assert('corporate save empty personal id + manage_no', false, { error: String(e.message || e), diag: diag.result.value });
    }
    await closePage(pageId);
  }

  // --- 6) Name mismatch warning ---
  {
    const { send, pageId } = await openPage(`https://${SUB}.cybozu.com/k/${ORDER_APP}/edit`);
    await new Promise((r) => setTimeout(r, 3500));
    const mismatch = await send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const r={
          customer_code:{value:'A550'},
          personal_customer_id:{value:'${TEST_PCM_ID}'},
          client_name:{value:'[TEST]不一致な名前'}
        };
        return await CAYANAS_OrderPcm_Engine.validateStoreOrderPersonalCustomer(r,'create');
      })()`,
    });
    assert('name mismatch warning', mismatch.result.value && mismatch.result.value.ok && mismatch.result.value.warnMismatch, mismatch.result.value);
    await closePage(pageId);
  }

  report.note = 'Test App16 records created with [TEST] markers; legacy empty A550 was not modified.';
  fs.writeFileSync('/tmp/pcm_app16_e2e_report.json', JSON.stringify(report, null, 2));
  fs.writeFileSync(
    '/workspace/customize/backups/pcm_app16_deploy_20261101/e2e_report.json',
    JSON.stringify(report, null, 2)
  );
  console.log(
    '\nSUMMARY',
    JSON.stringify({
      ok: report.ok,
      passed: report.tests.filter((t) => t.ok).length,
      total: report.tests.length,
      createdRecordIds: report.createdRecordIds,
    })
  );
  if (!report.ok) process.exit(1);
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
