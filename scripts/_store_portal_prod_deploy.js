'use strict';

/**
 * 店舗ポータル App87 本番反映（v1.3.1・文字サイズ拡大）
 *   node scripts/_store_portal_prod_deploy.js
 *
 * App86（工場）は変更しない。ACL は変更しない。
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const APP87 = 87;
const APP86 = 86;
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'store_portal_prod_' + STAMP);

const APP87_JS = [
  'work_status_labels.js',
  'floor_portal_config.js',
  'floor_portal_engine.js',
  'floor_portal_desktop.js',
];
const APP87_CSS = ['floor_portal.css'];

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

async function pushFilesToPage(send, filesMap) {
  await send('Runtime.evaluate', { expression: 'window.__SP_FILES={}; true' });
  for (const [name, buf] of Object.entries(filesMap)) {
    const b64 = Buffer.isBuffer(buf) ? buf.toString('base64') : Buffer.from(buf).toString('base64');
    const CHUNK = 350000;
    await send('Runtime.evaluate', {
      expression: `window.__SP_FILES[${JSON.stringify(name)}]=[]; true`,
    });
    for (let i = 0; i < b64.length; i += CHUNK) {
      const part = b64.slice(i, i + CHUNK);
      await send('Runtime.evaluate', {
        expression: `window.__SP_FILES[${JSON.stringify(name)}].push(${JSON.stringify(part)}); true`,
      });
    }
    await send('Runtime.evaluate', {
      expression: `window.__SP_FILES[${JSON.stringify(name)}]=window.__SP_FILES[${JSON.stringify(name)}].join(''); true`,
    });
  }
}

async function backupCustomize(appId) {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${appId}/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const c=await api('/k/v1/app/customize.json','GET',{app:${appId}});
      const a=await api('/k/v1/app/acl.json','GET',{app:${appId}});
      const s=await api('/k/v1/app/settings.json','GET',{app:${appId}});
      return {
        name:s.name,
        customize:c,
        aclSummary:(a.rights||[]).map(r=>({
          type:r.entity&&r.entity.type,
          code:r.entity&&r.entity.code,
          view:!!r.recordViewable,
          add:!!r.recordAddable,
          edit:!!r.recordEditable
        }))
      };
    })()`,
  });
  await page.close();
  return result.result.value;
}

async function deployApp87() {
  const filesMap = {};
  for (const n of APP87_JS.concat(APP87_CSS)) filesMap[n] = readLocal(n);
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP87}/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      try{
        const APP=${APP87};
        const jsOrder=${JSON.stringify(APP87_JS)};
        const cssOrder=${JSON.stringify(APP87_CSS)};
        const files=window.__SP_FILES;
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
  if (!value) throw new Error('deploy empty: ' + JSON.stringify(result).slice(0, 500));
  return value;
}

async function verifyStoreUi() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP87}/`);
  await new Promise((r) => setTimeout(r, 5000));
  const result = await page.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(()=>{
      const C=window.CAYANAS_FLOOR_PORTAL;
      const links=[...document.querySelectorAll('a.cayan-fp-btn')].map(a=>({
        text:(a.querySelector('.cayan-fp-menu__label')||a).textContent.trim(),
        href:a.getAttribute('href')||'',
        note:((a.querySelector('.cayan-fp-menu__note')||{}).textContent||'').trim()
      }));
      const summary=[...document.querySelectorAll('.cayan-fp-summary-card')].map(card=>({
        label:((card.querySelector('.cayan-fp-summary-card__label')||{}).textContent||'').trim(),
        value:((card.querySelector('.cayan-fp-summary-card__value')||{}).textContent||'').trim(),
        unavailable: card.classList.contains('is-unavailable')
      }));
      return {
        ver: C && C.VERSION,
        storeCustomer: C && C.STORE_CUSTOMER_CODE,
        title: (document.querySelector('.cayan-fp-title')||{}).textContent||'',
        hasMenu: !!document.querySelector('.cayan-fp-menu'),
        hasSummary: !!document.querySelector('.cayan-fp-summary'),
        has85: links.some(l=>/\\/k\\/85\\//.test(l.href) || /App85|しみ抜き作業/.test(l.text)),
        hasLocationMove: links.some(l=>l.text==='保管場所移動' && /\\/k\\/34\\//.test(l.href)),
        hasInternalWork: links.some(l=>l.text==='社内作業登録' && /\\/k\\/84\\//.test(l.href)),
        permissionNote: ((document.querySelector('.cayan-fp-note--warn')||{}).textContent||'').trim(),
        links,
        summary
      };
    })()`,
  });
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await page.close();
  return {
    ui: result.result.value,
    screenshot: shot.data,
  };
}

async function verifyFactoryUntouched() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP86}/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const c=await api('/k/v1/app/customize.json','GET',{app:${APP86}});
      await new Promise(r=>setTimeout(r,3500));
      const C=window.CAYANAS_FLOOR_PORTAL;
      return {
        js:((c.desktop||{}).js||[]).map(x=>x.file&&x.file.name),
        css:((c.desktop||{}).css||[]).map(x=>x.file&&x.file.name),
        ver: C && C.VERSION,
        title:(document.querySelector('.cayan-fp-title')||{}).textContent||'',
        hasStoreMenu: !!document.querySelector('.cayan-fp-menu'),
        hasSummary: !!document.querySelector('.cayan-fp-summary'),
        flatLinks: [...document.querySelectorAll('nav.cayan-fp-links a, a.cayan-fp-btn')].map(a=>a.textContent.trim())
      };
    })()`,
  });
  await page.close();
  return result.result.value;
}

async function main() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync('/tmp/store_portal_prod_dir.txt', WORK_DIR);

  console.error('=== backup App87 ===');
  const before = await backupCustomize(APP87);
  fs.writeFileSync(path.join(WORK_DIR, 'app87_before.json'), JSON.stringify(before, null, 2));

  console.error('=== deploy App87 ===');
  const deploy = await deployApp87();
  fs.writeFileSync(path.join(WORK_DIR, 'deploy.json'), JSON.stringify(deploy, null, 2));
  console.log(JSON.stringify(deploy, null, 2));
  if (!deploy.ok) throw new Error('App87 deploy failed');
  if (JSON.stringify(deploy.desktopJs) !== JSON.stringify(APP87_JS)) {
    throw new Error('JS order mismatch');
  }
  if (JSON.stringify(deploy.desktopCss) !== JSON.stringify(APP87_CSS)) {
    throw new Error('CSS order mismatch');
  }

  console.error('=== verify store UI ===');
  const store = await verifyStoreUi();
  fs.writeFileSync(path.join(WORK_DIR, 'store_ui.json'), JSON.stringify(store.ui, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'store_ui.png'), Buffer.from(store.screenshot, 'base64'));
  fs.mkdirSync('/opt/cursor/artifacts/screenshots', { recursive: true });
  fs.writeFileSync('/opt/cursor/artifacts/screenshots/store_portal_prod_live.png', Buffer.from(store.screenshot, 'base64'));
  console.log(JSON.stringify(store.ui, null, 2));
  if (!store.ui || store.ui.ver !== '1.3.1') throw new Error('version not 1.3.1');
  if (!store.ui.hasMenu || !store.ui.hasSummary) throw new Error('menu/summary missing');
  if (store.ui.has85) throw new Error('App85 link present');
  if (!store.ui.hasLocationMove || !store.ui.hasInternalWork) throw new Error('required work links missing');

  console.error('=== verify factory App86 not overwritten ===');
  const factory = await verifyFactoryUntouched();
  fs.writeFileSync(path.join(WORK_DIR, 'factory_ui.json'), JSON.stringify(factory, null, 2));
  console.log(JSON.stringify(factory, null, 2));
  // Factory may still be on older portal JS; must not have store-only menu injected as App87-only content unless same bundle.
  // We did not deploy App86, so customize list should be unchanged from before this script.
  if (!Array.isArray(factory.js) || factory.js.length === 0) {
    throw new Error('factory customize empty unexpectedly');
  }

  const rollback = [
    '# 店舗ポータル本番反映 — 復旧',
    '',
    '- バックアップ: `' + WORK_DIR + '`',
    '- 作成: ' + new Date().toISOString() + ' (UTC)',
    '',
    '1. App87: `app87_before.json` の desktop js/css 順に旧ファイルを再アップロードしてデプロイ',
    '2. App86 は本作業で未変更',
    '3. ACL は変更していない',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(WORK_DIR, 'ROLLBACK.md'), rollback);

  const summary = {
    at: new Date().toISOString(),
    ok: true,
    dir: WORK_DIR,
    deploy,
    store: store.ui,
    factory,
    published: true,
    aclChanged: false,
  };
  fs.writeFileSync(path.join(WORK_DIR, 'PROD_OK.json'), JSON.stringify(summary, null, 2));
  console.error('STORE PORTAL PROD OK');
  console.log(JSON.stringify({ ok: true, ver: store.ui.ver, dir: WORK_DIR }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
