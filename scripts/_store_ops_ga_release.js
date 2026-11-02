'use strict';

/**
 * 店舗システム 実運用・一般公開
 *
 * - App97 ACL: everyone view/add/edit（delete 不可）
 * - App92: PICKUP allowlist 解除（v1.3.0）を反映
 *
 *   node scripts/_store_ops_ga_release.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const APP92 = 92;
const APP97 = 97;
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'store_ops_ga_' + STAMP);

const APP92_JS = [
  'store_deadline_config.js',
  'store_deadline_engine.js',
  'store_payment_config.js',
  'store_payment_engine.js',
  'store_pickup_shared.js',
  'store_pickup_api.js',
  'store_deadline_desktop.js',
  'store_deadline_pickup.js',
];
const APP92_CSS = ['store_deadline.css'];

/** 一般公開 ACL（削除は一般不可） */
const APP97_GA_RIGHTS = [
  {
    entity: { type: 'USER', code: 'info@ayanas.co.jp' },
    includeSubs: false,
    appEditable: true,
    recordViewable: true,
    recordAddable: true,
    recordEditable: true,
    recordDeletable: false,
    recordImportable: true,
    recordExportable: true,
  },
  {
    entity: { type: 'GROUP', code: 'Administrators' },
    includeSubs: false,
    appEditable: true,
    recordViewable: true,
    recordAddable: true,
    recordEditable: true,
    recordDeletable: true,
    recordImportable: true,
    recordExportable: true,
  },
  {
    entity: { type: 'CREATOR', code: null },
    includeSubs: false,
    appEditable: true,
    recordViewable: true,
    recordAddable: true,
    recordEditable: true,
    recordDeletable: false,
    recordImportable: false,
    recordExportable: true,
  },
  {
    entity: { type: 'GROUP', code: 'everyone' },
    includeSubs: false,
    appEditable: false,
    recordViewable: true,
    recordAddable: true,
    recordEditable: true,
    recordDeletable: false,
    recordImportable: false,
    recordExportable: true,
  },
];

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
      const t = setTimeout(() => rej(new Error('timeout ' + method)), 600000);
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
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const s = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({hasK:typeof kintone!=='undefined',url:location.href})`,
    });
    if (s.result && s.result.value && s.result.value.hasK && !/login/.test(s.result.value.url)) break;
  }
  return {
    send,
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

async function pushFilesToPage(send, filesMap) {
  await send('Runtime.evaluate', { expression: 'window.__GA_FILES={}; true' });
  for (const [name, buf] of Object.entries(filesMap)) {
    const b64 = Buffer.isBuffer(buf) ? buf.toString('base64') : Buffer.from(buf).toString('base64');
    const CHUNK = 350000;
    await send('Runtime.evaluate', {
      expression: `window.__GA_FILES[${JSON.stringify(name)}]=[]; true`,
    });
    for (let i = 0; i < b64.length; i += CHUNK) {
      const part = b64.slice(i, i + CHUNK);
      await send('Runtime.evaluate', {
        expression: `window.__GA_FILES[${JSON.stringify(name)}].push(${JSON.stringify(part)}); true`,
      });
    }
    await send('Runtime.evaluate', {
      expression: `window.__GA_FILES[${JSON.stringify(name)}]=window.__GA_FILES[${JSON.stringify(name)}].join(''); true`,
    });
  }
}

async function deployApp92() {
  const filesMap = {};
  for (const n of APP92_JS.concat(APP92_CSS)) filesMap[n] = readLocal(n);
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP92}/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      try{
        const APP=${APP92};
        const jsOrder=${JSON.stringify(APP92_JS)};
        const cssOrder=${JSON.stringify(APP92_CSS)};
        const files=window.__GA_FILES;
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
        for(let i=0;i<120;i++){
          const st=await api('/k/v1/preview/app/deploy.json','GET',{apps:[APP]});
          last=(st.apps||[])[0];
          if(last && (last.status==='SUCCESS'||last.status==='FAIL')) break;
          await new Promise(r=>setTimeout(r,500));
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
  const value = result && result.result && result.result.value;
  if (!value) {
    throw new Error('App92 deploy evaluate empty: ' + JSON.stringify(result).slice(0, 800));
  }
  return value;
}

async function applyApp97GaAcl() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP97}/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      try{
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        const before=await api('/k/v1/app/acl.json','GET',{app:${APP97}});
        await api('/k/v1/preview/app/acl.json','PUT',{
          app:${APP97},
          rights:${JSON.stringify(APP97_GA_RIGHTS)}
        });
        await api('/k/v1/preview/app/deploy.json','POST',{apps:[{app:${APP97}}]});
        let last=null;
        for(let i=0;i<120;i++){
          const st=await api('/k/v1/preview/app/deploy.json','GET',{apps:[${APP97}]});
          last=(st.apps||[])[0];
          if(last && (last.status==='SUCCESS'||last.status==='FAIL')) break;
          await new Promise(r=>setTimeout(r,500));
        }
        const after=await api('/k/v1/app/acl.json','GET',{app:${APP97}});
        const everyone=(after.rights||[]).find(r=>r.entity&&r.entity.code==='everyone');
        return {
          ok: !!(last&&last.status==='SUCCESS'),
          deploy:last,
          beforeRevision: before.revision,
          afterRevision: after.revision,
          everyoneViewable: !!(everyone&&everyone.recordViewable),
          everyoneAddable: !!(everyone&&everyone.recordAddable),
          everyoneEditable: !!(everyone&&everyone.recordEditable),
          everyoneDeletable: !!(everyone&&everyone.recordDeletable),
          rightsSummary:(after.rights||[]).map(r=>({
            type:r.entity&&r.entity.type,
            code:r.entity&&r.entity.code,
            view:!!r.recordViewable,
            add:!!r.recordAddable,
            edit:!!r.recordEditable,
            del:!!r.recordDeletable,
            appEdit:!!r.appEditable
          }))
        };
      }catch(e){ return {ok:false,error:e.message||String(e)}; }
    })()`,
  });
  await page.close();
  const value = result && result.result && result.result.value;
  if (!value) {
    throw new Error('App97 ACL evaluate empty: ' + JSON.stringify(result).slice(0, 800));
  }
  return value;
}

async function verifyApp92Ui() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP92}/`);
  await new Promise((r) => setTimeout(r, 4500));
  const result = await page.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `({
      ver: window.CAYANAS_STORE_DEADLINE && window.CAYANAS_STORE_DEADLINE.VERSION,
      allow: window.CAYANAS_STORE_DEADLINE && window.CAYANAS_STORE_DEADLINE.PICKUP_ALLOWED_LOGIN_CODES,
      panel: !!document.getElementById('cayan-sd-pickup-panel'),
      title: (document.querySelector('.cayan-sd-pickup__title')||{}).textContent || '',
      denied: /利用権限がありません|検証ユーザーのみ/.test(
        (document.querySelector('.cayan-sd-pickup__warn')||{}).textContent || ''
      ),
      hasInput: !!document.querySelector('#cayan-sd-pickup-panel input, .cayan-sd-pickup input')
    })`,
  });
  await page.close();
  return result.result.value;
}

async function verifyApp97AclLive() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP97}/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const after=await api('/k/v1/app/acl.json','GET',{app:97});
      const everyone=(after.rights||[]).find(r=>r.entity&&r.entity.code==='everyone');
      return {
        ok:true,
        revision: after.revision,
        everyoneViewable: !!(everyone&&everyone.recordViewable),
        everyoneAddable: !!(everyone&&everyone.recordAddable),
        everyoneEditable: !!(everyone&&everyone.recordEditable),
        everyoneDeletable: !!(everyone&&everyone.recordDeletable),
        rightsSummary:(after.rights||[]).map(r=>({
          type:r.entity&&r.entity.type,
          code:r.entity&&r.entity.code,
          view:!!r.recordViewable,
          add:!!r.recordAddable,
          edit:!!r.recordEditable,
          del:!!r.recordDeletable,
          appEdit:!!r.appEditable
        }))
      };
    })()`,
  });
  await page.close();
  return result.result.value;
}

async function main() {
  const mode = process.argv[2] || 'all';
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync('/tmp/store_ops_ga_dir.txt', WORK_DIR);

  let acl;
  if (mode === 'acl' || mode === 'all') {
    console.error('=== App97 ACL backup + GA open ===');
    acl = await applyApp97GaAcl();
    fs.writeFileSync(path.join(WORK_DIR, 'app97_acl.json'), JSON.stringify(acl, null, 2));
    console.log(JSON.stringify(acl, null, 2));
    if (!acl.ok) throw new Error('App97 ACL failed');
    if (!acl.everyoneViewable || !acl.everyoneAddable || !acl.everyoneEditable) {
      throw new Error('everyone not fully opened for view/add/edit');
    }
    if (acl.everyoneDeletable) throw new Error('everyone must not delete');
  } else if (mode === 'app92' || mode === 'verify') {
    console.error('=== App97 ACL live verify ===');
    acl = await verifyApp97AclLive();
    fs.writeFileSync(path.join(WORK_DIR, 'app97_acl.json'), JSON.stringify(acl, null, 2));
    console.log(JSON.stringify(acl, null, 2));
    if (!acl.everyoneViewable || !acl.everyoneAddable || !acl.everyoneEditable) {
      throw new Error('everyone not open; run acl mode first');
    }
    if (acl.everyoneDeletable) throw new Error('everyone must not delete');
  }

  let deploy = null;
  if (mode === 'app92' || mode === 'all') {
    console.error('=== App92 deploy v1.3.0 (allow all) ===');
    deploy = await deployApp92();
    fs.writeFileSync(path.join(WORK_DIR, 'app92_deploy.json'), JSON.stringify(deploy, null, 2));
    console.log(JSON.stringify(deploy, null, 2));
    if (!deploy.ok) throw new Error('App92 deploy failed');
    if (JSON.stringify(deploy.desktopJs) !== JSON.stringify(APP92_JS)) {
      throw new Error('App92 JS order mismatch');
    }
  }

  console.error('=== App92 UI verify ===');
  const ui = await verifyApp92Ui();
  fs.writeFileSync(path.join(WORK_DIR, 'app92_ui.json'), JSON.stringify(ui, null, 2));
  console.log(JSON.stringify(ui, null, 2));
  if (!ui || ui.ver !== '1.3.0') throw new Error('App92 version not 1.3.0');
  if (ui.allow != null) throw new Error('allowlist still set');
  if (ui.denied) throw new Error('pickup still denied on UI');
  if (!ui.hasInput && !ui.panel) throw new Error('pickup panel missing');

  const rollback = [
    '# 店舗システム一般公開 — 復旧',
    '',
    '- バックアップ: `' + WORK_DIR + '`',
    '- 作成: ' + new Date().toISOString() + ' (UTC)',
    '',
    '## App97 ACL を限定に戻す',
    '',
    '- Stage1: `customize/backups/app97_stage1_acl_2026-11-01T15-13-50/`',
    '- または `node scripts/_pickup_waiting_prod.js acl`',
    '',
    '## App92 allowlist を戻す',
    '',
    '1. `store_deadline_config.js` の `PICKUP_ALLOWED_LOGIN_CODES` を検証配列に戻し VERSION を下げる',
    '2. App92 を再デプロイ（本ディレクトリの直前バックアップ、または `pickup_waiting_prod_*`）',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(WORK_DIR, 'ROLLBACK.md'), rollback);

  const summary = {
    at: new Date().toISOString(),
    timezoneNote: 'Asia/Tokyo',
    ok: true,
    dir: WORK_DIR,
    mode,
    app97: acl,
    app92Deploy: deploy,
    app92Ui: ui,
  };
  fs.writeFileSync(path.join(WORK_DIR, 'GA_OK.json'), JSON.stringify(summary, null, 2));
  console.error('GA RELEASE OK');
  console.log(JSON.stringify({ ok: true, dir: WORK_DIR, ver: ui.ver, mode }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
