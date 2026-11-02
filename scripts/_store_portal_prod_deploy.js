'use strict';

/**
 * 工場・店舗ポータル App86/App87 本番反映（v1.4.2）
 *   node scripts/_store_portal_prod_deploy.js
 *
 * 両アプリに同一バンドル（work_status_labels 含む）を載せる。
 * ACL は変更しない。
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const APP87 = 87;
const APP86 = 86;
const EXPECT_VER = '1.4.2';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'store_portal_prod_' + STAMP);

const PORTAL_JS = [
  'work_status_labels.js',
  'floor_portal_config.js',
  'floor_portal_engine.js',
  'floor_portal_desktop.js',
];
const PORTAL_CSS = ['floor_portal.css'];

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

async function deployApp(appId) {
  const filesMap = {};
  for (const n of PORTAL_JS.concat(PORTAL_CSS)) filesMap[n] = readLocal(n);
  const page = await openPage(`https://${SUB}.cybozu.com/k/${appId}/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      try{
        const APP=${appId};
        const jsOrder=${JSON.stringify(PORTAL_JS)};
        const cssOrder=${JSON.stringify(PORTAL_CSS)};
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

async function verifyPortalUi(appId) {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${appId}/`);
  await new Promise((r) => setTimeout(r, 5500));
  const result = await page.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(()=>{
      const C=window.CAYANAS_FLOOR_PORTAL;
      const root=document.querySelector('.cayan-fp-root');
      const links=[...document.querySelectorAll('a.cayan-fp-btn')].map(a=>({
        text:(a.querySelector('.cayan-fp-menu__label')||a).textContent.trim(),
        href:a.getAttribute('href')||'',
        note:((a.querySelector('.cayan-fp-menu__note')||{}).textContent||'').trim(),
        fontSize: getComputedStyle(a).fontSize
      }));
      const summary=[...document.querySelectorAll('.cayan-fp-summary-card')].map(card=>({
        label:((card.querySelector('.cayan-fp-summary-card__label')||{}).textContent||'').trim(),
        value:((card.querySelector('.cayan-fp-summary-card__value')||{}).textContent||'').trim(),
        unavailable: card.classList.contains('is-unavailable')
      }));
      const workLabels=[...document.querySelectorAll('#cayan-fp-work-cards .cayan-fp-card__label')]
        .map(el=>el.textContent.trim());
      return {
        app: ${appId},
        ver: C && C.VERSION,
        title: (document.querySelector('.cayan-fp-title')||{}).textContent||'',
        rootFontSize: root ? getComputedStyle(root).fontSize : null,
        titleFontSize: ((document.querySelector('.cayan-fp-title')||{}).style)
          ? getComputedStyle(document.querySelector('.cayan-fp-title')).fontSize : null,
        hasMenu: !!document.querySelector('.cayan-fp-menu'),
        hasSummary: !!document.querySelector('.cayan-fp-summary'),
        summaryTitle: ((document.querySelector('.cayan-fp-summary__title')||{}).textContent||'').trim(),
        has85: links.some(l=>/\\/k\\/85\\//.test(l.href) || /App85|しみ抜き作業/.test(l.text)),
        hasLocationMove: links.some(l=>l.text==='保管場所移動' && /\\/k\\/34\\//.test(l.href)),
        hasInternalWork: links.some(l=>l.text==='社内作業登録' && /\\/k\\/84\\//.test(l.href)),
        flatLinks: [...document.querySelectorAll('nav.cayan-fp-links a')].map(a=>a.textContent.trim()),
        workLabels,
        hasDeliveryWaitingCard: workLabels.indexOf('納品待ち') >= 0,
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

async function main() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync('/tmp/store_portal_prod_dir.txt', WORK_DIR);

  console.error('=== backup App87 / App86 ===');
  const before87 = await backupCustomize(APP87);
  const before86 = await backupCustomize(APP86);
  fs.writeFileSync(path.join(WORK_DIR, 'app87_before.json'), JSON.stringify(before87, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'app86_before.json'), JSON.stringify(before86, null, 2));

  console.error('=== deploy App87 ===');
  const deploy87 = await deployApp(APP87);
  fs.writeFileSync(path.join(WORK_DIR, 'deploy87.json'), JSON.stringify(deploy87, null, 2));
  console.log(JSON.stringify({ app87: deploy87 }, null, 2));
  if (!deploy87.ok) throw new Error('App87 deploy failed');
  if (JSON.stringify(deploy87.desktopJs) !== JSON.stringify(PORTAL_JS)) {
    throw new Error('App87 JS order mismatch');
  }

  console.error('=== deploy App86 ===');
  const deploy86 = await deployApp(APP86);
  fs.writeFileSync(path.join(WORK_DIR, 'deploy86.json'), JSON.stringify(deploy86, null, 2));
  console.log(JSON.stringify({ app86: deploy86 }, null, 2));
  if (!deploy86.ok) throw new Error('App86 deploy failed');
  if (JSON.stringify(deploy86.desktopJs) !== JSON.stringify(PORTAL_JS)) {
    throw new Error('App86 JS order mismatch');
  }

  console.error('=== verify store UI ===');
  const store = await verifyPortalUi(APP87);
  fs.writeFileSync(path.join(WORK_DIR, 'store_ui.json'), JSON.stringify(store.ui, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'store_ui.png'), Buffer.from(store.screenshot, 'base64'));
  fs.mkdirSync('/opt/cursor/artifacts/screenshots', { recursive: true });
  fs.writeFileSync('/opt/cursor/artifacts/screenshots/store_portal_v140.png', Buffer.from(store.screenshot, 'base64'));
  console.log(JSON.stringify(store.ui, null, 2));
  if (!store.ui || store.ui.ver !== EXPECT_VER) throw new Error('store version not ' + EXPECT_VER);
  if (store.ui.rootFontSize !== '15px') throw new Error('store root font not 15px: ' + store.ui.rootFontSize);
  if (!store.ui.hasMenu || !store.ui.hasSummary) throw new Error('store menu/summary missing');
  if (store.ui.has85) throw new Error('App85 link present');
  if (!store.ui.hasLocationMove || !store.ui.hasInternalWork) throw new Error('required work links missing');
  if (!store.ui.hasDeliveryWaitingCard) throw new Error('store delivery waiting card missing');

  console.error('=== verify factory UI ===');
  const factory = await verifyPortalUi(APP86);
  fs.writeFileSync(path.join(WORK_DIR, 'factory_ui.json'), JSON.stringify(factory.ui, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'factory_ui.png'), Buffer.from(factory.screenshot, 'base64'));
  fs.writeFileSync('/opt/cursor/artifacts/screenshots/factory_portal_v140.png', Buffer.from(factory.screenshot, 'base64'));
  console.log(JSON.stringify(factory.ui, null, 2));
  if (!factory.ui || factory.ui.ver !== EXPECT_VER) throw new Error('factory version not ' + EXPECT_VER);
  if (factory.ui.rootFontSize !== '15px') throw new Error('factory root font not 15px');
  if (factory.ui.hasMenu) throw new Error('factory should keep flat shortcuts (no store menu)');
  if (!factory.ui.hasSummary) throw new Error('factory summary missing');
  if (factory.ui.summaryTitle !== '本日の工場状況') throw new Error('factory summary title mismatch');
  if (!factory.ui.hasDeliveryWaitingCard) throw new Error('factory delivery waiting card missing');
  if (!Array.isArray(factory.ui.flatLinks) || factory.ui.flatLinks.length < 3) {
    throw new Error('factory flat links missing');
  }
  const factorySummaryLabels = (factory.ui.summary || []).map((s) => s.label);
  if (factorySummaryLabels.indexOf('本日の工場受注') < 0 || factorySummaryLabels.indexOf('納品待ち') < 0) {
    throw new Error('factory summary cards incomplete: ' + factorySummaryLabels.join(','));
  }

  const rollback = [
    '# 工場・店舗ポータル本番反映 — 復旧',
    '',
    '- バックアップ: `' + WORK_DIR + '`',
    '- 作成: ' + new Date().toISOString() + ' (UTC)',
    '',
    '1. App87: `app87_before.json` の desktop js/css を再アップロードしてデプロイ',
    '2. App86: `app86_before.json` の desktop js/css を再アップロードしてデプロイ',
    '3. ACL は変更していない',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(WORK_DIR, 'ROLLBACK.md'), rollback);

  const summary = {
    at: new Date().toISOString(),
    ok: true,
    dir: WORK_DIR,
    expectVer: EXPECT_VER,
    deploy87,
    deploy86,
    store: store.ui,
    factory: factory.ui,
    published: true,
    aclChanged: false,
  };
  fs.writeFileSync(path.join(WORK_DIR, 'PROD_OK.json'), JSON.stringify(summary, null, 2));
  console.error('FLOOR PORTAL PROD OK');
  console.log(JSON.stringify({ ok: true, ver: EXPECT_VER, dir: WORK_DIR }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
