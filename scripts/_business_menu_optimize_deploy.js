'use strict';

/**
 * AYANAS 業務メニュー最適化の本番反映
 *   node scripts/_business_menu_optimize_deploy.js
 *
 * - App91 business_menu v1.1.0
 * - App90 factory_menu v1.1.1
 * - App86/87 floor_portal v1.4.2（ショートカット名称）
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'business_menu_opt_' + STAMP);

const APPS = {
  91: {
    js: ['business_menu_config.js', 'business_menu_desktop.js'],
    css: ['business_menu.css'],
    expectVerGlobal: 'CAYANAS_BUSINESS_MENU_VERSION',
    expectVer: '1.1.0',
  },
  90: {
    js: ['factory_menu_config.js', 'factory_menu_desktop.js'],
    css: ['factory_menu.css'],
    expectVerGlobal: 'CAYANAS_FACTORY_MENU_VERSION',
    expectVer: '1.1.1',
  },
  87: {
    js: [
      'work_status_labels.js',
      'floor_portal_config.js',
      'floor_portal_engine.js',
      'floor_portal_desktop.js',
    ],
    css: ['floor_portal.css'],
    expectVerGlobal: 'CAYANAS_FLOOR_PORTAL_VERSION',
    expectVer: '1.4.2',
  },
  86: {
    js: [
      'work_status_labels.js',
      'floor_portal_config.js',
      'floor_portal_engine.js',
      'floor_portal_desktop.js',
    ],
    css: ['floor_portal.css'],
    expectVerGlobal: 'CAYANAS_FLOOR_PORTAL_VERSION',
    expectVer: '1.4.2',
  },
};

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

async function deployApp(appId) {
  const spec = APPS[appId];
  const filesMap = {};
  for (const n of spec.js.concat(spec.css)) filesMap[n] = readLocal(n);
  const page = await openPage(`https://${SUB}.cybozu.com/k/${appId}/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      try{
        const APP=${appId};
        const jsOrder=${JSON.stringify(spec.js)};
        const cssOrder=${JSON.stringify(spec.css)};
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
  if (!value) throw new Error('deploy empty app ' + appId);
  return value;
}

async function verifyApp91() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/91/?cat=work`);
  await new Promise((r) => setTimeout(r, 4000));
  const result = await page.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(()=>{
      const C=window.CAYANAS_BUSINESS_MENU;
      const labels=[...document.querySelectorAll('.cayan-bm-btn__label')].map(el=>el.textContent.trim());
      const lead=((document.querySelector('.cayan-bm-lead, .cayan-bm-header__lead, p.cayan-bm-lead')||{}).textContent||'').trim()
        || ((document.querySelector('[class*=\"lead\"]')||{}).textContent||'').trim();
      return {
        ver: window.CAYANAS_BUSINESS_MENU_VERSION,
        title: C && C.TITLE,
        labels,
        hasFactoryPortal: labels.indexOf('工場作業状況ポータル')>=0,
        hasStorePortal: labels.indexOf('店舗ポータル（A550）')>=0,
        hasInternalWork: labels.indexOf('社内作業登録')>=0,
        hasComplete: labels.indexOf('検品・仕上げ完了')>=0,
        noOldWorkLabel: labels.indexOf('作業状況登録')<0,
        noApp85: !(C && JSON.stringify(C).includes('/k/85') || labels.some(l=>/App85|しみ抜き作業/.test(l)))
      };
    })()`,
  });
  // also check logistics + masters
  await page.send('Page.navigate', { url: `https://${SUB}.cybozu.com/k/91/?cat=logistics` });
  await new Promise((r) => setTimeout(r, 2500));
  const logistics = await page.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(()=>{
      const labels=[...document.querySelectorAll('.cayan-bm-btn__label')].map(el=>el.textContent.trim());
      return {
        labels,
        first: labels[0]||null,
        hasLocationMove: labels.indexOf('保管場所移動')>=0,
        noOldInbound: labels.every(l=>l.indexOf('社内移動入庫')<0)
      };
    })()`,
  });
  await page.send('Page.navigate', { url: `https://${SUB}.cybozu.com/k/91/?cat=masters` });
  await new Promise((r) => setTimeout(r, 2500));
  const masters = await page.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(()=>{
      const labels=[...document.querySelectorAll('.cayan-bm-btn__label')].map(el=>el.textContent.trim());
      const hrefs=[...document.querySelectorAll('a.cayan-bm-btn')].map(a=>a.getAttribute('href')||'');
      return {
        labels,
        hasPcm: labels.indexOf('個人顧客マスタ')>=0,
        hasPcmLink: hrefs.some(h=>/\\/k\\/96\\//.test(h))
      };
    })()`,
  });
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await page.close();
  return {
    work: result.result.value,
    logistics: logistics.result.value,
    masters: masters.result.value,
    screenshot: shot.data,
  };
}

async function verifyApp90() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/90/`);
  await new Promise((r) => setTimeout(r, 3500));
  const result = await page.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(()=>{
      const labels=[...document.querySelectorAll('.cayan-fm-btn__label, a[class*=\"btn\"] span, .cayan-fm-item__label')].map(el=>el.textContent.trim()).filter(Boolean);
      // fallback: any visible menu labels
      const all=[...document.querySelectorAll('a')].map(a=>a.textContent.replace(/\\s+/g,' ').trim()).filter(t=>t.length>1 && t.length<40);
      const pool = labels.length ? labels : all;
      return {
        ver: window.CAYANAS_FACTORY_MENU_VERSION,
        labels: pool,
        hasLocationMove: pool.indexOf('保管場所移動')>=0,
        hasInternalWork: pool.indexOf('社内作業登録')>=0,
        hasComplete: pool.indexOf('検品・仕上げ完了')>=0
      };
    })()`,
  });
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await page.close();
  return { ui: result.result.value, screenshot: shot.data };
}

async function verifyFactory86() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/86/`);
  await new Promise((r) => setTimeout(r, 4000));
  const result = await page.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(()=>{
      const links=[...document.querySelectorAll('nav.cayan-fp-links a')].map(a=>a.textContent.trim());
      return {
        ver: window.CAYANAS_FLOOR_PORTAL_VERSION,
        links,
        hasLocationMove: links.indexOf('保管場所移動')>=0,
        noOldInbound: links.indexOf('社内入庫登録')<0
      };
    })()`,
  });
  await page.close();
  return result.result.value;
}

async function main() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync('/tmp/business_menu_opt_dir.txt', WORK_DIR);

  const deployResults = {};
  for (const appId of [91, 90, 87, 86]) {
    console.error('=== deploy App' + appId + ' ===');
    const deploy = await deployApp(appId);
    deployResults[appId] = deploy;
    fs.writeFileSync(path.join(WORK_DIR, 'deploy_' + appId + '.json'), JSON.stringify(deploy, null, 2));
    console.log(JSON.stringify({ app: appId, deploy }, null, 2));
    if (!deploy.ok) throw new Error('App' + appId + ' deploy failed');
    if (JSON.stringify(deploy.desktopJs) !== JSON.stringify(APPS[appId].js)) {
      throw new Error('App' + appId + ' JS order mismatch');
    }
  }

  console.error('=== verify App91 ===');
  const app91 = await verifyApp91();
  fs.writeFileSync(path.join(WORK_DIR, 'app91_ui.json'), JSON.stringify({
    work: app91.work,
    logistics: app91.logistics,
    masters: app91.masters,
  }, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'app91_ui.png'), Buffer.from(app91.screenshot, 'base64'));
  fs.mkdirSync('/opt/cursor/artifacts/screenshots', { recursive: true });
  fs.writeFileSync('/opt/cursor/artifacts/screenshots/business_menu_opt_masters.png', Buffer.from(app91.screenshot, 'base64'));
  console.log(JSON.stringify({ work: app91.work, logistics: app91.logistics, masters: app91.masters }, null, 2));

  if (app91.work.ver !== '1.1.0') throw new Error('App91 version mismatch');
  if (!app91.work.hasFactoryPortal || !app91.work.hasStorePortal || !app91.work.hasInternalWork || !app91.work.hasComplete) {
    throw new Error('App91 work labels incomplete');
  }
  if (!app91.logistics.hasLocationMove || !app91.logistics.noOldInbound || app91.logistics.first !== '保管場所移動') {
    throw new Error('App91 logistics not optimized');
  }
  if (!app91.masters.hasPcm || !app91.masters.hasPcmLink) throw new Error('App91 masters missing App96');

  console.error('=== verify App90 ===');
  const app90 = await verifyApp90();
  fs.writeFileSync(path.join(WORK_DIR, 'app90_ui.json'), JSON.stringify(app90.ui, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'app90_ui.png'), Buffer.from(app90.screenshot, 'base64'));
  fs.writeFileSync('/opt/cursor/artifacts/screenshots/factory_menu_opt.png', Buffer.from(app90.screenshot, 'base64'));
  console.log(JSON.stringify(app90.ui, null, 2));
  if (app90.ui.ver !== '1.1.1') throw new Error('App90 version mismatch');
  if (!app90.ui.hasLocationMove || !app90.ui.hasInternalWork || !app90.ui.hasComplete) {
    throw new Error('App90 labels incomplete');
  }

  console.error('=== verify App86 shortcuts ===');
  const app86 = await verifyFactory86();
  fs.writeFileSync(path.join(WORK_DIR, 'app86_ui.json'), JSON.stringify(app86, null, 2));
  console.log(JSON.stringify(app86, null, 2));
  if (app86.ver !== '1.4.2') throw new Error('App86 version mismatch');
  if (!app86.hasLocationMove || !app86.noOldInbound) throw new Error('App86 shortcut label not updated');

  // capture work category screenshot too
  const pageWork = await openPage(`https://${SUB}.cybozu.com/k/91/?cat=work`);
  await new Promise((r) => setTimeout(r, 3000));
  const shotWork = await pageWork.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(WORK_DIR, 'app91_work.png'), Buffer.from(shotWork.data, 'base64'));
  fs.writeFileSync('/opt/cursor/artifacts/screenshots/business_menu_opt_work.png', Buffer.from(shotWork.data, 'base64'));
  await pageWork.close();

  const summary = {
    at: new Date().toISOString(),
    ok: true,
    dir: WORK_DIR,
    deployResults,
    app91: { work: app91.work, logistics: app91.logistics, masters: app91.masters },
    app90: app90.ui,
    app86,
  };
  fs.writeFileSync(path.join(WORK_DIR, 'PROD_OK.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(WORK_DIR, 'ROLLBACK.md'),
    '# 業務メニュー最適化 — 復旧\n\n- バックアップ: `' + WORK_DIR + '`\n'
  );
  console.error('BUSINESS MENU OPT PROD OK');
  console.log(JSON.stringify({ ok: true, dir: WORK_DIR }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
