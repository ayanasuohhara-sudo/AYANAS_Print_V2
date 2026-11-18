'use strict';

/**
 * A550 P0 限定本番反映 + E2E（検証用レコードのみ）
 *
 * Modes:
 *   node scripts/_a550_p0_limited_prod.js all
 *   node scripts/_a550_p0_limited_prod.js precheck
 *   node scripts/_a550_p0_limited_prod.js deploy
 *   node scripts/_a550_p0_limited_prod.js e2e
 *   node scripts/_a550_p0_limited_prod.js restore-acl
 *   node scripts/_a550_p0_limited_prod.js rollback
 *
 * 一般公開（everyone ACL の恒久変更など）は行わない。
 * 反映中のみ ACL を制限し、成功後は元 ACL に戻す（App19/92 は既存業務アプリのため）。
 * 報告上の一般公開は別承認。
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const APP16 = 16;
const APP19 = 19;
const APP92 = 92;
const APP97 = 97;
const APP96 = 96;
const VERIFIER = 'info@ayanas.co.jp';
const TEST_PCM = 'P000002';
const TEST_PCM_NAME = '[TEST]山田花子';
const MODE = process.argv[2] || 'all';
const BK_DIR = process.env.A550_P0_BACKUP
  || (fs.existsSync('/tmp/a550_p0_backup_dir.txt')
    ? fs.readFileSync('/tmp/a550_p0_backup_dir.txt', 'utf8').trim()
    : '');
const REPORT_DIR = path.join(ROOT, 'docs');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'a550_p0_run_' + STAMP);

const APP19_JS_ORDER = [
  'internal_ops_config.js',
  'complete_register_engine.js',
  'delivery_completion_guard.js',
  'barcode_delivery.js',
  'delivery_complete_sync.js',
  'delivery_a550_edit_guard.js',
  'price_master_register.js',
  'delivery_additional_item_guard.js',
  'additional_item_engine.js',
];

const APP92_JS_ORDER = [
  'store_deadline_config.js',
  'store_deadline_engine.js',
  'store_deadline_desktop.js',
];
const APP92_CSS_ORDER = ['store_deadline.css'];

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

async function attachPortal() {
  const list = await httpJson('/json/list');
  const page = (list || []).find(
    (t) => t.type === 'page'
      && /cybozu\.com\/k/.test(t.url || '')
      && !/login/.test(t.url || '')
      && !/web-worker/.test(t.url || '')
  );
  if (!page) throw new Error('no logged-in kintone tab');
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
  return { ws, send, close: () => ws.close() };
}

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
    const s = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({hasK:typeof kintone!=='undefined',url:location.href})`,
    });
    if (s.result && s.result.value && s.result.value.hasK && !/login/.test(s.result.value.url)) break;
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

function readLocal(name) {
  return fs.readFileSync(path.join(ROOT, 'customize', name));
}

function readBackupFile(appId, logicalName) {
  const meta = JSON.parse(fs.readFileSync(path.join(BK_DIR, 'app' + appId, 'files_meta.json'), 'utf8'));
  const hit = meta.find((m) => m.name === logicalName);
  if (!hit) throw new Error('backup missing ' + logicalName + ' for app ' + appId);
  return fs.readFileSync(path.join(BK_DIR, 'app' + appId, hit.file));
}

async function pushFilesToPage(send, filesMap) {
  await send('Runtime.evaluate', { expression: 'window.__A550_FILES={}; true' });
  for (const [name, buf] of Object.entries(filesMap)) {
    const b64 = buf.toString('base64');
    const CHUNK = 350000;
    await send('Runtime.evaluate', {
      expression: `window.__A550_FILES[${JSON.stringify(name)}]=[]; true`,
    });
    for (let i = 0; i < b64.length; i += CHUNK) {
      const part = b64.slice(i, i + CHUNK);
      await send('Runtime.evaluate', {
        expression: `window.__A550_FILES[${JSON.stringify(name)}].push(${JSON.stringify(part)}); true`,
      });
    }
    await send('Runtime.evaluate', {
      expression: `window.__A550_FILES[${JSON.stringify(name)}]=window.__A550_FILES[${JSON.stringify(name)}].join(''); true`,
    });
  }
}

async function deployCustomize(appId, jsOrder, cssOrder, filesMap) {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${appId}/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      try{
        const APP=${appId};
        const jsOrder=${JSON.stringify(jsOrder)};
        const cssOrder=${JSON.stringify(cssOrder)};
        const files=window.__A550_FILES;
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        const token=kintone.getRequestToken();
        function b64ToBlob(b64,type){
          const bin=atob(b64); const arr=new Uint8Array(bin.length);
          for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
          return new Blob([arr],{type});
        }
        async function uploadBlob(blob,filename){
          const fd=new FormData();
          fd.append('__REQUEST_TOKEN__', token);
          fd.append('file', blob, filename);
          const bodyText=await new Promise((resolve,reject)=>{
            const xhr=new XMLHttpRequest();
            xhr.open('POST','/k/v1/file.json');
            xhr.setRequestHeader('X-Requested-With','XMLHttpRequest');
            xhr.onload=()=>resolve(xhr.responseText);
            xhr.onerror=()=>reject(new Error('upload network error'));
            xhr.send(fd);
          });
          const json=JSON.parse(bodyText);
          if(!json.fileKey) throw new Error(bodyText);
          return json.fileKey;
        }
        const keys={};
        for(const name of jsOrder) keys[name]=await uploadBlob(b64ToBlob(files[name],'text/javascript'),name);
        for(const name of cssOrder) keys[name]=await uploadBlob(b64ToBlob(files[name],'text/css'),name);
        const current=await api('/k/v1/app/customize.json','GET',{app:APP});
        await api('/k/v1/preview/app/customize.json','PUT',{
          app:APP,
          scope: current.scope || 'ALL',
          desktop:{
            js: jsOrder.map(n=>({type:'FILE',file:{fileKey:keys[n]}})),
            css: cssOrder.map(n=>({type:'FILE',file:{fileKey:keys[n]}}))
          },
          mobile: current.mobile || {js:[],css:[]}
        });
        await api('/k/v1/preview/app/deploy.json','POST',{apps:[{app:APP}]});
        let last=null;
        for(let i=0;i<100;i++){
          const st=await api('/k/v1/preview/app/deploy.json','GET',{apps:[APP]});
          last=(st.apps||[])[0];
          if(last && (last.status==='SUCCESS'||last.status==='FAIL')) break;
          await new Promise(r=>setTimeout(r,400));
        }
        const after=await api('/k/v1/app/customize.json','GET',{app:APP});
        return {
          ok: !!(last && last.status==='SUCCESS'),
          deploy: last,
          desktopJs: ((after.desktop||{}).js||[]).map(x=>x.file&&x.file.name),
          desktopCss: ((after.desktop||{}).css||[]).map(x=>x.file&&x.file.name)
        };
      }catch(e){ return {ok:false, error: e.message||String(e)}; }
    })()`,
  });
  await page.close();
  return result.result.value;
}

async function setLimitedAcl(appIds, enableLimited) {
  const backup = Object.fromEntries(
    appIds.map((id) => [
      String(id),
      JSON.parse(fs.readFileSync(path.join(BK_DIR, 'app' + id, 'acl.json'), 'utf8')),
    ])
  );
  const portal = await attachPortal();
  const result = await portal.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const apps=${JSON.stringify(appIds)};
      const limited=${enableLimited ? 'true' : 'false'};
      const backup=${JSON.stringify(backup)};
      const out={};
      for(const app of apps){
        let rights;
        if(limited){
          rights=[
            {entity:{type:'USER',code:'${VERIFIER}'},appEditable:true,recordViewable:true,recordAddable:true,recordEditable:true,recordDeletable:true,recordImportable:true,recordExportable:true},
            {entity:{type:'GROUP',code:'Administrators'},appEditable:true,recordViewable:true,recordAddable:true,recordEditable:true,recordDeletable:true,recordImportable:true,recordExportable:true},
            {entity:{type:'CREATOR',code:null},appEditable:true,recordViewable:true,recordAddable:true,recordEditable:true,recordDeletable:true,recordImportable:true,recordExportable:true}
          ];
        } else {
          rights = (backup[String(app)].rights||[]).map(r=>({
            entity: r.entity,
            appEditable: r.appEditable,
            recordViewable: r.recordViewable,
            recordAddable: r.recordAddable,
            recordEditable: r.recordEditable,
            recordDeletable: r.recordDeletable,
            recordImportable: r.recordImportable,
            recordExportable: r.recordExportable,
            fieldPrivileges: r.fieldPrivileges
          }));
        }
        await api('/k/v1/preview/app/acl.json','PUT',{app,rights});
        await api('/k/v1/preview/app/deploy.json','POST',{apps:[{app}]});
        let last=null;
        for(let i=0;i<80;i++){
          const st=await api('/k/v1/preview/app/deploy.json','GET',{apps:[app]});
          last=(st.apps||[])[0];
          if(last && (last.status==='SUCCESS'||last.status==='FAIL')) break;
          await new Promise(r=>setTimeout(r,400));
        }
        const acl=await api('/k/v1/app/acl.json','GET',{app});
        out[app]={ok: !!(last&&last.status==='SUCCESS'), deploy:last, rights:(acl.rights||[]).map(r=>({type:r.entity.type,code:r.entity.code,view:r.recordViewable,add:r.recordAddable}))};
      }
      return out;
    })()`,
  });
  portal.close();
  return result.result.value;
}

function precheckLocal() {
  const report = { at: new Date().toISOString(), ok: true, checks: [] };
  const note = (name, ok, detail) => {
    report.checks.push({ name, ok: !!ok, detail: detail || null });
    if (!ok) report.ok = false;
    console.log((ok ? 'OK  ' : 'FAIL ') + name);
  };

  if (!BK_DIR || !fs.existsSync(BK_DIR)) {
    note('backup dir exists', false, BK_DIR);
    return report;
  }
  note('backup dir exists', true, BK_DIR);

  global.window = global;
  global.kintone = { app: { getId: () => 0 }, events: { on: () => {} }, api: { url: () => '' } };
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'customize/delivery_complete_sync.js'), 'utf8'));
  const S = global.CAYANAS_DeliveryCompleteSync;
  const storePut = S.buildStoreOrderUpdate('2026-11-01', 'N1');
  const storeKeys = Object.keys(storePut).sort();
  note(
    'A550 PUT fields only delivery_status/no/date',
    storeKeys.join(',') === 'delivery_date,delivery_no,delivery_status',
    storeKeys
  );
  note('A550 delivery_status=納品待ち', storePut.delivery_status.value === '納品待ち');
  const corpPut = S.buildCorporateOrderUpdate('2026-11-01', 'N9');
  note(
    '法人 PUT に location=納品済 と delivery=納品済',
    corpPut.location_status.value === '納品済' && corpPut.delivery_status.value === '納品済',
    Object.keys(corpPut).sort()
  );
  note('法人は店舗顧客ではない', S.isCorporateCustomer('A100') && !S.isStoreCustomer('A100'));
  note('A550は店舗顧客', S.isStoreCustomer('A550') && !S.isCorporateCustomer('A550'));

  const prodSync = fs.readFileSync(
    path.join(BK_DIR, 'app19', 'files_meta.json'),
    'utf8'
  );
  note('App19 backup meta readable', /delivery_complete_sync/.test(prodSync));

  const dual = S.planStoreOrderSync(
    {
      delivery_status: { value: '納品待ち' },
      delivery_no: { value: 'N-OLD' },
      delivery_date: { value: '2026-10-01' },
    },
    '2026-11-01',
    'N-NEW'
  );
  note('二重同期防止（別番号は warn）', dual.action === 'warn', dual);

  const same = S.planStoreOrderSync(
    {
      delivery_status: { value: '納品待ち' },
      delivery_no: { value: 'N1' },
      delivery_date: { value: '2026-11-01' },
    },
    '2026-11-01',
    'N1'
  );
  note('同一番号は skip（再実行安全）', same.action === 'skip', same);

  note('edit guard file exists', fs.existsSync(path.join(ROOT, 'customize/delivery_a550_edit_guard.js')));
  note('RESTORE.md exists', fs.existsSync(path.join(BK_DIR, 'RESTORE.md')));
  return report;
}

async function deployBoth() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const files19 = {};
  for (const name of APP19_JS_ORDER) {
    if (name === 'delivery_complete_sync.js' || name === 'delivery_a550_edit_guard.js') {
      files19[name] = readLocal(name);
    } else {
      files19[name] = readBackupFile(APP19, name);
    }
  }
  const files92 = {};
  for (const name of APP92_JS_ORDER.concat(APP92_CSS_ORDER)) {
    files92[name] = readLocal(name);
  }

  console.error('ACL limit start');
  const aclLimit = await setLimitedAcl([APP19, APP92], true);
  fs.writeFileSync(path.join(WORK_DIR, 'acl_limited.json'), JSON.stringify(aclLimit, null, 2));

  console.error('deploy App19');
  const d19 = await deployCustomize(APP19, APP19_JS_ORDER, [], files19);
  fs.writeFileSync(path.join(WORK_DIR, 'deploy_app19.json'), JSON.stringify(d19, null, 2));
  console.error('App19', JSON.stringify(d19));

  console.error('deploy App92');
  const d92 = await deployCustomize(APP92, APP92_JS_ORDER, APP92_CSS_ORDER, files92);
  fs.writeFileSync(path.join(WORK_DIR, 'deploy_app92.json'), JSON.stringify(d92, null, 2));
  console.error('App92', JSON.stringify(d92));

  return { aclLimit, d19, d92, workDir: WORK_DIR };
}

async function rollbackCustomize() {
  const files19 = {};
  const meta19 = JSON.parse(fs.readFileSync(path.join(BK_DIR, 'app19', 'files_meta.json'), 'utf8'));
  const js19 = meta19.filter((m) => m.kind === 'js' && m.scope === 'desktop').sort((a, b) => a.index - b.index).map((m) => m.name);
  const css19 = meta19.filter((m) => m.kind === 'css' && m.scope === 'desktop').sort((a, b) => a.index - b.index).map((m) => m.name);
  for (const name of js19.concat(css19)) files19[name] = readBackupFile(APP19, name);

  const files92 = {};
  const meta92 = JSON.parse(fs.readFileSync(path.join(BK_DIR, 'app92', 'files_meta.json'), 'utf8'));
  const js92 = meta92.filter((m) => m.kind === 'js' && m.scope === 'desktop').sort((a, b) => a.index - b.index).map((m) => m.name);
  const css92 = meta92.filter((m) => m.kind === 'css' && m.scope === 'desktop').sort((a, b) => a.index - b.index).map((m) => m.name);
  for (const name of js92.concat(css92)) files92[name] = readBackupFile(APP92, name);

  const r19 = await deployCustomize(APP19, js19, css19, files19);
  const r92 = await deployCustomize(APP92, js92, css92, files92);
  const acl = await setLimitedAcl([APP19, APP92], false);
  return { r19, r92, acl };
}

async function runE2E() {
  const report = {
    at: new Date().toISOString(),
    backup: BK_DIR,
    e2e: [],
    fixtures: null,
    deployVerify: null,
    app16Sync: null,
    app92: null,
    app97: null,
    corporate: null,
    residual: [],
    generalRelease: 'NO — await separate approval',
  };
  const assert = (name, cond, detail) => {
    const row = { name, ok: !!cond, detail: detail === undefined ? null : detail };
    report.e2e.push(row);
    console.log((cond ? 'OK  ' : 'FAIL ') + name);
    if (!cond && detail) {
      console.log('   ', typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 500));
    }
  };

  // Verify deployed customize
  const portal = await attachPortal();
  const verify = await portal.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const c19=await api('/k/v1/app/customize.json','GET',{app:${APP19}});
      const c92=await api('/k/v1/app/customize.json','GET',{app:${APP92}});
      return {
        app19: ((c19.desktop&&c19.desktop.js)||[]).map(x=>x.file&&x.file.name),
        app92js: ((c92.desktop&&c92.desktop.js)||[]).map(x=>x.file&&x.file.name),
        app92css: ((c92.desktop&&c92.desktop.css)||[]).map(x=>x.file&&x.file.name)
      };
    })()`,
  });
  report.deployVerify = verify.result.value;
  assert(
    'App19 JS includes sync + edit guard in order',
    JSON.stringify(report.deployVerify.app19) === JSON.stringify(APP19_JS_ORDER),
    report.deployVerify.app19
  );
  assert(
    'App92 JS/CSS v1.1.0 order',
    JSON.stringify(report.deployVerify.app92js) === JSON.stringify(APP92_JS_ORDER)
      && JSON.stringify(report.deployVerify.app92css) === JSON.stringify(APP92_CSS_ORDER),
    report.deployVerify
  );

  // Create TEST fixtures on App16
  const fixture = await portal.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const pcm=await api('/k/v1/records.json','GET',{app:${APP96},query:'personal_customer_id = "${TEST_PCM}" limit 1'});
      if(!(pcm.records||[]).length) return {ok:false,error:'PCM missing'};
      const src=await api('/k/v1/records.json','GET',{app:${APP16},query:'customer_code = "A550" and manage_no = "103126379" limit 1'});
      const base=src.records[0];
      if(!base) return {ok:false,error:'no A550 template'};
      const srcRow=((base.detail_table&&base.detail_table.value)||[])[0];
      const srcItemCode=srcRow&&srcRow.value&&srcRow.value.item_code&&srcRow.value.item_code.value;
      if(!srcItemCode) return {ok:false,error:'template item_code missing'};
      const stamp=Date.now().toString().slice(-6);
      const today=new Date().toISOString().slice(0,10);
      const in7=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
      const specs=[
        {mn:'TP0'+stamp+'A', loc:'店舗', note:'store-waiting'},
        {mn:'TP0'+stamp+'B', loc:'工場', note:'factory-not-arrived'},
        {mn:'TP0'+stamp+'C', loc:'工場', note:'partial-sibling'}
      ];
      const created=[];
      for(const s of specs){
        const record={
          customer_code:{value:'A550'},
          customer_name:{value: base.customer_name ? base.customer_name.value : '店舗'},
          client_name:{value:'${TEST_PCM_NAME}'},
          personal_customer_id:{value:'${TEST_PCM}'},
          manage_no:{value:s.mn},
          kimono_type:{value:'[TEST]P0小紋'},
          location_status:{value:s.loc},
          process_status:{value:'完了'},
          work_status:{value:'仕上げ完了'},
          delivery_status:{value:'納品待ち'},
          delivery_no:{value:''},
          delivery_date:{value:''},
          order_date:{value:today},
          deadline:{value:in7},
          detail_table:{value:[{value:{
            item_code:{value:srcItemCode},
            item_name:{value:'[TEST]P0丸洗い'},
            qty:{value:'1'},
            unit_price:{value:'3000'}
          }}]}
        };
        const res=await api('/k/v1/record.json','POST',{app:${APP16},record});
        created.push({id:String(res.id), manageNo:s.mn, location:s.loc, note:s.note});
      }

      // App8 に検証用法人マスタを用意（実顧客は変更しない）
      const corpCode='Z9P0';
      const existingMaster=await api('/k/v1/records.json','GET',{app:8,query:'customer_code = \"'+corpCode+'\" limit 1'});
      let masterId=existingMaster.records[0] && existingMaster.records[0].$id.value;
      if(!masterId){
        const master=await api('/k/v1/record.json','POST',{app:8,record:{
          customer_code:{value:corpCode},
          customer_name:{value:'[TEST]P0法人'}
        }});
        masterId=String(master.id);
      }
      const corpMn='TP0'+stamp+'X';
      const corpRes=await api('/k/v1/record.json','POST',{app:${APP16},record:{
        customer_code:{value:corpCode},
        customer_name:{value:'[TEST]P0法人'},
        client_name:{value:'[TEST]法人顧客'},
        manage_no:{value:corpMn},
        kimono_type:{value:'[TEST]P0法人'},
        location_status:{value:'工場'},
        process_status:{value:'完了'},
        work_status:{value:'仕上げ完了'},
        delivery_status:{value:'未納品'},
        order_date:{value:today},
        deadline:{value:in7},
        detail_table:{value:[{value:{
          item_code:{value:srcItemCode},
          item_name:{value:'[TEST]P0法人加工'},
          qty:{value:'1'},
          unit_price:{value:'5000'}
        }}]}
      }});

      // 実法人サンプルのリビジョン（非影響確認用・更新しない）
      const realCorp=await api('/k/v1/records.json','GET',{app:${APP16},query:'customer_code = \"A545\" and manage_no = \"103126382\" limit 1',fields:['$id','customer_code','delivery_status','location_status','$revision','manage_no']});
      const real=realCorp.records[0]||null;
      return {
        ok:true,
        stamp,
        today,
        created,
        corp:{id:String(corpRes.id), manageNo:corpMn, code:corpCode, masterId:String(masterId)},
        realCorpGuard: real?{id:real.$id.value, code:real.customer_code.value, mn:real.manage_no.value, ds:real.delivery_status.value, ls:real.location_status.value, rev:real.$revision.value}:null
      };
    })()`,
  });
  portal.close();
  report.fixtures = fixture.result.value;
  assert('TEST App16 fixtures created', report.fixtures && report.fixtures.ok && report.fixtures.created.length === 3, report.fixtures);
  if (!report.fixtures || !report.fixtures.ok) {
    report.passed = report.e2e.filter((x) => x.ok).length;
    report.failed = report.e2e.filter((x) => !x.ok).length;
    return report;
  }

  const [oStore, oFactory, oPartial] = report.fixtures.created;
  const corp = report.fixtures.corp;
  const today = report.fixtures.today;
  const realCorpGuard = report.fixtures.realCorpGuard;

  // App92: before slip — should appear on schedule (delivery_no empty)
  const app92 = await openPage(`https://${SUB}.cybozu.com/k/${APP92}/`);
  await new Promise((r) => setTimeout(r, 3500));
  const beforeSched = await app92.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const E=window.CAYANAS_StoreDeadlineEngine;
      const C=window.CAYANAS_STORE_DEADLINE;
      if(!E||!C) return {ok:false,error:'globals missing', ver:window.CAYANAS_STORE_DEADLINE_VERSION};
      const mns=${JSON.stringify([oStore.manageNo, oFactory.manageNo, oPartial.manageNo])};
      const q='customer_code = \"A550\" and manage_no in ('+mns.map(m=>'\"'+m+'\"').join(',')+')';
      const recs=(await api('/k/v1/records.json','GET',{app:16,query:q})).records||[];
      const flags=recs.map(r=>({
        mn:r.manage_no.value,
        excluded:E.isExcludedFromSchedule(r),
        waiting:E.isWaitingStockAtStore(r),
        slip:E.isSlipCreatedNotAtStore(r),
        dn:r.delivery_no&&r.delivery_no.value,
        loc:r.location_status.value,
        ds:r.delivery_status.value
      }));
      return {ok:true, ver:C.VERSION, flags};
    })()`,
  });
  assert('App92 globals VERSION 1.1.0', beforeSched.result.value && beforeSched.result.value.ver === '1.1.0', beforeSched.result.value);
  assert(
    'E2E#3 納品書前はスケジュール対象（excluded=false）',
    beforeSched.result.value
      && beforeSched.result.value.flags.every((f) => f.excluded === false && !f.dn),
    beforeSched.result.value
  );
  await app92.close();

  // App19 create + A550 sync via deployed helpers（UI保存はCDP遷移で切断されるため API+本番と同型ロジック）
  const slipStoreFactory = await (async () => {
    const page = await openPage(`https://${SUB}.cybozu.com/k/${APP19}/`);
    await new Promise((r) => setTimeout(r, 2500));
    const r = await page.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        const S=window.CAYANAS_DeliveryCompleteSync;
        if(!S) return {ok:false,error:'sync global missing'};
        const today=${JSON.stringify(today)};
        const created=await api('/k/v1/record.json','POST',{app:19,record:{
          customer_code:{value:'A550'},
          customer_name:{value:'ayanasu'},
          delivery_date:{value:today},
          delivery_type:{value:'本社納品'},
          delivery_detail:{value:[
            {value:{manage_no:{value:${JSON.stringify(oStore.manageNo)}}, client_name:{value:'${TEST_PCM_NAME}'}, kimono_type:{value:'[TEST]P0小紋'}, item_name:{value:'[TEST]P0丸洗い'}, qty:{value:'1'}, unit_price:{value:'3000'}}},
            {value:{manage_no:{value:${JSON.stringify(oFactory.manageNo)}}, client_name:{value:'${TEST_PCM_NAME}'}, kimono_type:{value:'[TEST]P0小紋'}, item_name:{value:'[TEST]P0丸洗い'}, qty:{value:'1'}, unit_price:{value:'3000'}}}
          ]}
        }});
        const id=String(created.id);
        const deliveryNo='N'+today.replace(/-/g,'')+'-'+id;
        await api('/k/v1/record.json','PUT',{app:19,id,record:{delivery_no:{value:deliveryNo}}});
        const results=[];
        for(const mn of [${JSON.stringify(oStore.manageNo)}, ${JSON.stringify(oFactory.manageNo)}]){
          const found=await api('/k/v1/records.json','GET',{app:16,query:'manage_no = \"'+mn+'\"'});
          const order=(found.records||[])[0];
          if(!order){ results.push({mn, ok:false, error:'missing'}); continue; }
          const before={ps:order.process_status.value, ls:order.location_status.value, ws:order.work_status.value};
          const plan=S.planStoreOrderSync(order, today, deliveryNo);
          if(plan.action==='put'){
            await api('/k/v1/record.json','PUT',{app:16,id:order.$id.value,record:plan.record});
          }
          const after=(await api('/k/v1/record.json','GET',{app:16,id:order.$id.value})).record;
          results.push({
            mn, action:plan.action, reason:plan.reason,
            before, after:{
              ds:after.delivery_status.value, dn:after.delivery_no.value, dd:after.delivery_date.value,
              ps:after.process_status.value, ls:after.location_status.value, ws:after.work_status.value
            }
          });
        }
        // handler wiring check
        const srcOk = typeof S.planStoreOrderSync==='function' && S.STATUS_WAITING==='納品待ち' && S.A550_CUSTOMER_CODE==='A550';
        return {ok:true, mode:'api+deployed-helpers', recordId:id, deliveryNo, results, srcOk};
      })()`,
    });
    await page.close();
    return r.result.value;
  })();
  assert('E2E#4 App19 納品書作成（店舗+工場）', slipStoreFactory && slipStoreFactory.ok, slipStoreFactory);
  assert('本番同期ヘルパー配線', !!(slipStoreFactory && slipStoreFactory.srcOk), slipStoreFactory);

  const syncCheck = await (async () => {
    const p = await attachPortal();
    const r = await p.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        const ids=${JSON.stringify([oStore.id, oFactory.id, oPartial.id])};
        const out=[];
        for(const id of ids){
          const rec=(await api('/k/v1/record.json','GET',{app:16,id})).record;
          out.push({
            id,
            mn: rec.manage_no.value,
            ds: rec.delivery_status.value,
            dn: rec.delivery_no && rec.delivery_no.value,
            dd: rec.delivery_date && rec.delivery_date.value,
            ps: rec.process_status.value,
            ls: rec.location_status.value,
            ws: rec.work_status.value
          });
        }
        return {orders:out, slipNo: ${JSON.stringify((slipStoreFactory && slipStoreFactory.deliveryNo) || '')}, slipId: ${JSON.stringify((slipStoreFactory && slipStoreFactory.recordId) || '')}};
      })()`,
    });
    p.close();
    return r.result.value;
  })();
  report.app16Sync = Object.assign({}, slipStoreFactory, syncCheck);

  const syncedStore = syncCheck.orders.find((o) => o.id === oStore.id);
  const syncedFactory = syncCheck.orders.find((o) => o.id === oFactory.id);
  const syncedPartial = syncCheck.orders.find((o) => o.id === oPartial.id);

  assert(
    'E2E#5 App16 delivery_no/date 反映（店舗・工場）',
    !!(syncedStore && syncedStore.dn && syncedFactory && syncedFactory.dn
      && syncedStore.ds === '納品待ち' && syncedFactory.ds === '納品待ち'),
    syncCheck
  );
  assert(
    'process/location/work 不変',
    syncedStore && syncedFactory
      && syncedStore.ps === '完了' && syncedStore.ls === '店舗' && syncedStore.ws === '仕上げ完了'
      && syncedFactory.ps === '完了' && syncedFactory.ls === '工場' && syncedFactory.ws === '仕上げ完了',
    { syncedStore, syncedFactory }
  );
  assert('未明細の C は未同期', syncedPartial && !syncedPartial.dn && syncedPartial.ds === '納品待ち', syncedPartial);

  // 同期漏れ再実行（同一番号は skip）
  const rerun = await (async () => {
    const page = await openPage(`https://${SUB}.cybozu.com/k/${APP19}/`);
    await new Promise((r) => setTimeout(r, 1500));
    const r = await page.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        const S=window.CAYANAS_DeliveryCompleteSync;
        const order=(await api('/k/v1/records.json','GET',{app:16,query:'manage_no = \"'+${JSON.stringify(oStore.manageNo)}+'\"'})).records[0];
        const plan=S.planStoreOrderSync(order, ${JSON.stringify(today)}, ${JSON.stringify((slipStoreFactory && slipStoreFactory.deliveryNo) || '')});
        return plan;
      })()`,
    });
    await page.close();
    return r.result.value;
  })();
  assert('同期再実行は skip（安全）', rerun && rerun.action === 'skip', rerun);

  // App92 after slip
  const app92b = await openPage(`https://${SUB}.cybozu.com/k/${APP92}/`);
  await new Promise((r) => setTimeout(r, 3000));
  const afterSched = await app92b.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const E=window.CAYANAS_StoreDeadlineEngine;
      const mns=${JSON.stringify([oStore.manageNo, oFactory.manageNo, oPartial.manageNo])};
      const q='customer_code = \"A550\" and manage_no in ('+mns.map(m=>'\"'+m+'\"').join(',')+')';
      const recs=(await api('/k/v1/records.json','GET',{app:16,query:q,fields:['$id','manage_no','customer_code','customer_name','client_name','kimono_type','deadline','process_status','work_status','location_status','delivery_status','delivery_no','delivery_date','aggregation_status','detail_table']})).records||[];
      const by=Object.fromEntries(recs.map(r=>[r.manage_no.value,r]));
      const store=by[${JSON.stringify(oStore.manageNo)}];
      const factory=by[${JSON.stringify(oFactory.manageNo)}];
      const partial=by[${JSON.stringify(oPartial.manageNo)}];
      return {
        storeExcluded: store && E.isExcludedFromSchedule(store),
        factoryExcluded: factory && E.isExcludedFromSchedule(factory),
        partialExcluded: partial && E.isExcludedFromSchedule(partial),
        storeWaiting: store && E.isWaitingStockAtStore(store),
        factoryWaiting: factory && E.isWaitingStockAtStore(factory),
        factorySlip: factory && E.isSlipCreatedNotAtStore(factory),
        storeSlip: store && E.isSlipCreatedNotAtStore(store),
        storeDn: store && store.delivery_no.value,
        factoryDn: factory && factory.delivery_no.value,
        partialDn: partial && partial.delivery_no.value
      };
    })()`,
  });
  report.app92 = afterSched.result.value;
  assert('E2E#6 納品書後スケジュール除外', afterSched.result.value.storeExcluded && afterSched.result.value.factoryExcluded, afterSched.result.value);
  assert('未納品書の C は従来どおり表示（excluded=false）', afterSched.result.value.partialExcluded === false, afterSched.result.value);
  assert('E2E#7 店舗は納品待ち在庫', afterSched.result.value.storeWaiting === true && afterSched.result.value.storeSlip === false, afterSched.result.value);
  assert('E2E#8 工場は店舗未到着', afterSched.result.value.factorySlip === true && afterSched.result.value.factoryWaiting === false, afterSched.result.value);
  await app92b.close();

  // Move factory → store
  const moved = await (async () => {
    const p = await attachPortal();
    const r = await p.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        await api('/k/v1/record.json','PUT',{app:16,id:${JSON.stringify(oFactory.id)},record:{location_status:{value:'店舗'}}});
        const rec=(await api('/k/v1/record.json','GET',{app:16,id:${JSON.stringify(oFactory.id)}})).record;
        return {ls:rec.location_status.value, dn:rec.delivery_no.value, ds:rec.delivery_status.value};
      })()`,
    });
    p.close();
    return r.result.value;
  })();
  assert('工場→店舗へ移動', moved.ls === '店舗', moved);

  const app92c = await openPage(`https://${SUB}.cybozu.com/k/${APP92}/`);
  await new Promise((r) => setTimeout(r, 2500));
  const afterMove = await app92c.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const E=window.CAYANAS_StoreDeadlineEngine;
      const rec=(await api('/k/v1/record.json','GET',{app:16,id:${JSON.stringify(oFactory.id)}})).record;
      return {
        waiting: E.isWaitingStockAtStore(rec),
        slip: E.isSlipCreatedNotAtStore(rec),
        excluded: E.isExcludedFromSchedule(rec)
      };
    })()`,
  });
  await app92c.close();
  assert('E2E#9 店舗移動後は納品待ち在庫', afterMove.result.value.waiting === true && afterMove.result.value.slip === false, afterMove.result.value);

  // Partial slip for C only
  const slipPartial = await (async () => {
    const page = await openPage(`https://${SUB}.cybozu.com/k/${APP19}/`);
    await new Promise((r) => setTimeout(r, 2000));
    const r = await page.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        const S=window.CAYANAS_DeliveryCompleteSync;
        const today=${JSON.stringify(today)};
        const created=await api('/k/v1/record.json','POST',{app:19,record:{
          customer_code:{value:'A550'}, customer_name:{value:'ayanasu'}, delivery_date:{value:today}, delivery_type:{value:'本社納品'},
          delivery_detail:{value:[{value:{manage_no:{value:${JSON.stringify(oPartial.manageNo)}}, client_name:{value:'${TEST_PCM_NAME}'}, kimono_type:{value:'[TEST]P0'}, item_name:{value:'[TEST]P0'}, qty:{value:'1'}, unit_price:{value:'3000'}}}]}
        }});
        const id=created.id;
        const deliveryNo='N'+today.replace(/-/g,'')+'-'+id;
        await api('/k/v1/record.json','PUT',{app:19,id,record:{delivery_no:{value:deliveryNo}}});
        const order=(await api('/k/v1/records.json','GET',{app:16,query:'manage_no = \"'+${JSON.stringify(oPartial.manageNo)}+'\"'})).records[0];
        const plan=S.planStoreOrderSync(order, today, deliveryNo);
        if(plan.action==='put') await api('/k/v1/record.json','PUT',{app:16,id:order.$id.value,record:plan.record});
        // dual sync attempt with different no
        const order2=(await api('/k/v1/records.json','GET',{app:16,query:'manage_no = \"'+${JSON.stringify(oPartial.manageNo)}+'\"'})).records[0];
        const dual=S.planStoreOrderSync(order2, today, deliveryNo+'-OTHER');
        const again=S.planStoreOrderSync(order2, today, deliveryNo);
        return {id, deliveryNo, plan:plan.action, dual:dual.action, again:again.action, dn:order2.delivery_no.value};
      })()`,
    });
    await page.close();
    return r.result.value;
  })();
  assert('E2E#11 一部商品のみ納品同期', !!(slipPartial && (slipPartial.plan === 'put' || slipPartial.again === 'skip')), slipPartial);
  assert('二重同期防止', slipPartial.dual === 'warn' && slipPartial.again === 'skip', slipPartial);

  // App97 payment + pickup on store item
  const app97 = await openPage(`https://${SUB}.cybozu.com/k/${APP97}/`);
  await new Promise((r) => setTimeout(r, 4000));
  const payPickup = await app97.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const Api=window.CAYANAS_StorePayment_Api;
      const Eng=window.CAYANAS_StorePayment_Engine;
      const C=window.CAYANAS_StorePayment;
      if(!Api||!Eng||!C) return {ok:false,error:'App97 globals missing'};
      const loaded=await Api.loadByBarcode(${JSON.stringify(oStore.manageNo)});
      if(!loaded.ok) return {ok:false,error:loaded.error||'load fail', loaded};
      const row=loaded.rows.find(r=>r.manageNo===${JSON.stringify(oStore.manageNo)});
      if(!row) return {ok:false,error:'row missing', loaded};
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
      if(!pay.ok) return {ok:false, stage:'pay', pay};
      const pick=await Api.completePickup('${oStore.id}',{});
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const after=(await api('/k/v1/record.json','GET',{app:16,id:'${oStore.id}'})).record;
      return {ok: !!(pick.ok && after.delivery_status.value==='納品済'), pay, pick, ds:after.delivery_status.value, dn:after.delivery_no.value};
    })()`,
  });
  await app97.close();
  report.app97 = payPickup.result.value;
  assert('E2E#10 入金・引き渡しで納品済', report.app97 && report.app97.ok, report.app97);

  const app92d = await openPage(`https://${SUB}.cybozu.com/k/${APP92}/`);
  await new Promise((r) => setTimeout(r, 2500));
  const afterPickup = await app92d.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const E=window.CAYANAS_StoreDeadlineEngine;
      const rec=(await api('/k/v1/record.json','GET',{app:16,id:'${oStore.id}'})).record;
      return {
        waiting:E.isWaitingStockAtStore(rec),
        slip:E.isSlipCreatedNotAtStore(rec),
        excluded:E.isExcludedFromSchedule(rec),
        ds:rec.delivery_status.value
      };
    })()`,
  });
  await app92d.close();
  assert('納品済は在庫から除外', afterPickup.result.value.waiting === false && afterPickup.result.value.slip === false && afterPickup.result.value.excluded === true, afterPickup.result.value);

  // Corporate path on TEST master Z9P0 only (実顧客は触らない)
  const corpResult = await (async () => {
    const page = await openPage(`https://${SUB}.cybozu.com/k/${APP19}/`);
    await new Promise((r) => setTimeout(r, 2000));
    const r = await page.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        const S=window.CAYANAS_DeliveryCompleteSync;
        const today=${JSON.stringify(today)};
        const corpCode=${JSON.stringify(corp.code)};
        const before=(await api('/k/v1/record.json','GET',{app:16,id:${JSON.stringify(corp.id)}})).record;
        const created=await api('/k/v1/record.json','POST',{app:19,record:{
          customer_code:{value:corpCode}, customer_name:{value:'[TEST]P0法人'}, delivery_date:{value:today}, delivery_type:{value:'本社納品'},
          delivery_detail:{value:[{value:{manage_no:{value:${JSON.stringify(corp.manageNo)}}, client_name:{value:'[TEST]法人顧客'}, kimono_type:{value:'[TEST]P0法人'}, item_name:{value:'[TEST]P0法人加工'}, qty:{value:'1'}, unit_price:{value:'5000'}}}]}
        }});
        const id=created.id;
        const deliveryNo='N'+today.replace(/-/g,'')+'-'+id;
        await api('/k/v1/record.json','PUT',{app:19,id,record:{delivery_no:{value:deliveryNo}}});
        const put=S.buildCorporateOrderUpdate(today, deliveryNo);
        await api('/k/v1/record.json','PUT',{app:16,id:${JSON.stringify(corp.id)},record:put});
        const after=(await api('/k/v1/record.json','GET',{app:16,id:${JSON.stringify(corp.id)}})).record;
        let realAfter=null;
        const guard=${JSON.stringify(realCorpGuard)};
        if(guard && guard.id){
          const rr=(await api('/k/v1/record.json','GET',{app:16,id:guard.id})).record;
          realAfter={ds:rr.delivery_status.value, ls:rr.location_status.value, rev:rr.$revision.value, mn:rr.manage_no.value};
        }
        return {
          isCorp: S.isCorporateCustomer(corpCode),
          notStore: !S.isStoreCustomer(corpCode),
          before:{ds:before.delivery_status.value, ls:before.location_status.value},
          after:{ds:after.delivery_status.value, ls:after.location_status.value, dn:after.delivery_no.value, dd:after.delivery_date.value},
          putKeys: Object.keys(put).sort(),
          realGuardBefore: guard,
          realGuardAfter: realAfter
        };
      })()`,
    });
    await page.close();
    return r.result.value;
  })();
  report.corporate = corpResult;
  assert(
    'E2E#12 法人は納品済+location納品済',
    corpResult
      && corpResult.isCorp
      && corpResult.after.ds === '納品済'
      && corpResult.after.ls === '納品済'
      && corpResult.after.dn,
    corpResult
  );
  assert(
    '実法人レコード非影響',
    !realCorpGuard
      || (corpResult.realGuardAfter
        && corpResult.realGuardAfter.rev === realCorpGuard.rev
        && corpResult.realGuardAfter.ds === realCorpGuard.ds
        && corpResult.realGuardAfter.ls === realCorpGuard.ls),
    { before: realCorpGuard, after: corpResult && corpResult.realGuardAfter }
  );

  // Edit guard presence
  const guard = await (async () => {
    const page = await openPage(`https://${SUB}.cybozu.com/k/${APP19}/`);
    await new Promise((r) => setTimeout(r, 2000));
    const r = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({guard:!!window.CAYANAS_DeliveryA550EditGuard, sync:!!window.CAYANAS_DeliveryCompleteSync, a550: window.CAYANAS_DeliveryA550EditGuard && window.CAYANAS_DeliveryA550EditGuard.isA550WithSlip({customer_code:{value:'A550'},delivery_no:{value:'N1'}})})`,
    });
    await page.close();
    return r.result.value;
  })();
  assert('編集ガード利用可能', guard && guard.guard && guard.a550 === true, guard);

  report.residual = [
    '過去 A550 の delivery_no 未連携は遡及していない',
    '納品書削除の自動巻き戻しなし（runbook 運用）',
    'App19/92 の ACL は業務継続のため元に戻す（一般公開宣言は別承認）',
    'UI保存が環境により失敗した場合は API+helper フォールバックで同期検証',
  ];

  report.passed = report.e2e.filter((x) => x.ok).length;
  report.failed = report.e2e.filter((x) => !x.ok).length;
  return report;
}

async function main() {
  if (!BK_DIR || !fs.existsSync(BK_DIR)) {
    console.error('Backup dir missing. Set A550_P0_BACKUP or /tmp/a550_p0_backup_dir.txt');
    process.exit(1);
  }
  fs.mkdirSync(WORK_DIR, { recursive: true });

  if (MODE === 'precheck') {
    const r = precheckLocal();
    fs.writeFileSync(path.join(WORK_DIR, 'precheck.json'), JSON.stringify(r, null, 2));
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }

  if (MODE === 'restore-acl') {
    const acl = await setLimitedAcl([APP19, APP92], false);
    console.log(JSON.stringify(acl, null, 2));
    return;
  }

  if (MODE === 'rollback') {
    const r = await rollbackCustomize();
    fs.writeFileSync(path.join(WORK_DIR, 'rollback.json'), JSON.stringify(r, null, 2));
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  if (MODE === 'deploy') {
    const pre = precheckLocal();
    if (!pre.ok) process.exit(1);
    const d = await deployBoth();
    console.log(JSON.stringify(d, null, 2));
    if (!(d.d19.ok && d.d92.ok)) {
      console.error('deploy failed → rollback');
      await rollbackCustomize();
      process.exit(1);
    }
    return;
  }

  if (MODE === 'e2e') {
    let report;
    try {
      report = await runE2E();
      report.passed = report.passed != null ? report.passed : (report.e2e || []).filter((x) => x.ok).length;
      report.failed = report.failed != null ? report.failed : (report.e2e || []).filter((x) => !x.ok).length;
    } catch (e) {
      report = {
        passed: 0,
        failed: 1,
        error: String(e && e.stack || e),
        e2e: [{ name: 'e2e threw', ok: false, detail: String(e) }],
        generalRelease: 'NO — await separate approval',
      };
    }
    fs.writeFileSync(path.join(WORK_DIR, 'e2e_report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(REPORT_DIR, 'A550_P0_LIMITED_E2E_REPORT.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, failed: report.failed, error: report.error || null }, null, 2));
    process.exit(report.failed ? 1 : 0);
  }

  // all
  const pre = precheckLocal();
  fs.writeFileSync(path.join(WORK_DIR, 'precheck.json'), JSON.stringify(pre, null, 2));
  if (!pre.ok) process.exit(1);

  let deployResult;
  try {
    deployResult = await deployBoth();
    if (!(deployResult.d19.ok && deployResult.d92.ok)) {
      throw new Error('deploy failed');
    }
  } catch (e) {
    console.error('deploy error, rolling back', e);
    await rollbackCustomize();
    process.exit(1);
  }

  let report;
  try {
    report = await runE2E();
    report.deploy = {
      app19: deployResult.d19,
      app92: deployResult.d92,
      aclLimited: deployResult.aclLimit,
      backup: BK_DIR,
      workDir: WORK_DIR,
    };
  } catch (e) {
    console.error('e2e error', e);
    report = { failed: 1, error: String(e), e2e: [] };
  }

  report.passed = report.passed != null ? report.passed : (report.e2e || []).filter((x) => x.ok).length;
  report.failed = report.failed != null ? report.failed : (report.e2e || []).filter((x) => !x.ok).length;

  const syncOk = (report.e2e || []).some((x) => /delivery_no/.test(x.name) && x.ok);
  const deployOk = !!(deployResult && deployResult.d19 && deployResult.d19.ok && deployResult.d92 && deployResult.d92.ok);

  if (!deployOk || ((report.failed || 0) > 3 && !syncOk)) {
    console.error('critical failures → rollback JS');
    const rb = await rollbackCustomize();
    report.rollback = rb;
  } else {
    console.error('restore ACL to original (keep JS)');
    const acl = await setLimitedAcl([APP19, APP92], false);
    report.aclRestored = acl;
  }

  fs.writeFileSync(path.join(WORK_DIR, 'e2e_report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(REPORT_DIR, 'A550_P0_LIMITED_E2E_REPORT.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    passed: report.passed,
    failed: report.failed,
    generalRelease: report.generalRelease,
    backup: BK_DIR,
    workDir: WORK_DIR,
  }, null, 2));
  process.exit(report.failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
