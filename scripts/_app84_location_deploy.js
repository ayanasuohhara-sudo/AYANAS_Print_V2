'use strict';

/**
 * App84 社内作業 — 保管場所同時登録（App30 同型）を本番反映
 *   node scripts/_app84_location_deploy.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const APP84 = 84;
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'app84_location_' + STAMP);

const APP84_JS = [
  'work_status_labels.js',
  'internal_ops_config.js',
  'barcode_batch_core.js',
  'barcode_batch_ui.js',
  'internal_work_engine.js',
  'internal_work_desktop.js',
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

async function backupCustomize() {
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP84}/`);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const c=await api('/k/v1/app/customize.json','GET',{app:${APP84}});
      return { customize:c };
    })()`,
  });
  await page.close();
  return result.result.value;
}

async function deployApp84() {
  const filesMap = {};
  for (const n of APP84_JS) filesMap[n] = readLocal(n);
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP84}/`);
  await pushFilesToPage(page.send, filesMap);
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      try{
        const APP=${APP84};
        const jsOrder=${JSON.stringify(APP84_JS)};
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
        const current=await api('/k/v1/app/customize.json','GET',{app:APP});
        await api('/k/v1/preview/app/customize.json','PUT',{
          app:APP,
          scope: current.scope || 'ALL',
          desktop:{
            js: jsOrder.map(n=>({type:'FILE',file:{fileKey:keys[n]}})),
            css: ((current.desktop||{}).css)||[]
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
          desktopJs: ((after.desktop||{}).js||[]).map(x=>x.file&&x.file.name)
        };
      }catch(e){ return {ok:false, error: e.message||String(e)}; }
    })()`,
  });
  await page.close();
  const value = result && result.result && result.result.value;
  if (!value) throw new Error('deploy empty');
  return value;
}

async function verifyUi() {
  // open create form so space panel mounts
  const page = await openPage(`https://${SUB}.cybozu.com/k/${APP84}/edit`);
  await new Promise((r) => setTimeout(r, 4500));
  // try create URL if edit needs record
  let ui = await page.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(()=>({
      url: location.href,
      hasPanel: !!document.getElementById('cayan-internal-work-panel'),
      mode: !!document.getElementById('cayan-internal-work-mode'),
      location: !!document.getElementById('cayan-internal-work-location'),
      work: !!document.getElementById('cayan-internal-work-status'),
      modes: [...document.querySelectorAll('#cayan-internal-work-mode option')].map(o=>o.value),
      locs: [...document.querySelectorAll('#cayan-internal-work-location option')].map(o=>o.value),
      engineModes: window.CAYANAS_InternalWorkEngine && window.CAYANAS_InternalWorkEngine.BULK_MODE,
      hint: ((document.querySelector('.cayan-batch-hint')||{}).textContent||'').trim()
    }))()`,
  });
  if (!ui.result.value.hasPanel) {
    await page.send('Page.navigate', { url: `https://${SUB}.cybozu.com/k/${APP84}/edit` });
    await new Promise((r) => setTimeout(r, 1000));
    // kintone create
    await page.send('Page.navigate', { url: `https://${SUB}.cybozu.com/k/${APP84}/edit?tab=create` }).catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));
    // direct create
    await page.close();
    const page2 = await openPage(`https://${SUB}.cybozu.com/k/${APP84}/edit`);
    // use index + click add if needed
    await page2.close();
    const page3 = await openPage(`https://${SUB}.cybozu.com/k/${APP84}/`);
    await new Promise((r) => setTimeout(r, 2000));
    await page3.send('Runtime.evaluate', {
      expression: `(()=>{const a=document.querySelector('a.gaia-argoui-app-menu-add, .gaia-argoui-app-menu-add, a[href*="/edit"]'); if(a) a.click(); return !!a;})()`,
    });
    await new Promise((r) => setTimeout(r, 5000));
    ui = await page3.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(()=>({
        url: location.href,
        hasPanel: !!document.getElementById('cayan-internal-work-panel'),
        mode: !!document.getElementById('cayan-internal-work-mode'),
        location: !!document.getElementById('cayan-internal-work-location'),
        work: !!document.getElementById('cayan-internal-work-status'),
        modes: [...document.querySelectorAll('#cayan-internal-work-mode option')].map(o=>o.value),
        locs: [...document.querySelectorAll('#cayan-internal-work-location option')].map(o=>o.value),
        engineModes: window.CAYANAS_InternalWorkEngine && window.CAYANAS_InternalWorkEngine.BULK_MODE,
        hint: ((document.querySelector('.cayan-batch-hint')||{}).textContent||'').trim()
      }))()`,
    });
    const shot = await page3.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await page3.close();
    return { ui: ui.result.value, screenshot: shot.data };
  }
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await page.close();
  return { ui: ui.result.value, screenshot: shot.data };
}

async function main() {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  fs.writeFileSync('/tmp/app84_location_dir.txt', WORK_DIR);

  console.error('=== backup App84 ===');
  const before = await backupCustomize();
  fs.writeFileSync(path.join(WORK_DIR, 'app84_before.json'), JSON.stringify(before, null, 2));

  console.error('=== deploy App84 ===');
  const deploy = await deployApp84();
  fs.writeFileSync(path.join(WORK_DIR, 'deploy.json'), JSON.stringify(deploy, null, 2));
  console.log(JSON.stringify(deploy, null, 2));
  if (!deploy.ok) throw new Error('App84 deploy failed');
  if (JSON.stringify(deploy.desktopJs) !== JSON.stringify(APP84_JS)) {
    throw new Error('JS order mismatch: ' + JSON.stringify(deploy.desktopJs));
  }

  console.error('=== verify UI ===');
  const verified = await verifyUi();
  fs.writeFileSync(path.join(WORK_DIR, 'ui.json'), JSON.stringify(verified.ui, null, 2));
  fs.writeFileSync(path.join(WORK_DIR, 'ui.png'), Buffer.from(verified.screenshot, 'base64'));
  fs.mkdirSync('/opt/cursor/artifacts/screenshots', { recursive: true });
  fs.writeFileSync('/opt/cursor/artifacts/screenshots/app84_location_modes.png', Buffer.from(verified.screenshot, 'base64'));
  console.log(JSON.stringify(verified.ui, null, 2));

  if (!verified.ui.hasPanel || !verified.ui.mode || !verified.ui.location) {
    throw new Error('UI panel/mode/location missing');
  }
  if (JSON.stringify(verified.ui.modes) !== JSON.stringify(['work', 'work_with_location', 'location_only'])) {
    throw new Error('mode options mismatch');
  }
  if (!verified.ui.locs.includes('工場') || !verified.ui.locs.includes('本社') || !verified.ui.locs.includes('店舗')) {
    throw new Error('location options incomplete');
  }
  if (!verified.ui.engineModes || verified.ui.engineModes.workWithLocation !== 'work_with_location') {
    throw new Error('engine BULK_MODE missing');
  }

  const summary = {
    at: new Date().toISOString(),
    ok: true,
    dir: WORK_DIR,
    deploy,
    ui: verified.ui,
  };
  fs.writeFileSync(path.join(WORK_DIR, 'PROD_OK.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(WORK_DIR, 'ROLLBACK.md'),
    [
      '# App84 保管場所同時登録 — 復旧',
      '',
      '- バックアップ: `' + WORK_DIR + '`',
      '- `app84_before.json` の desktop js を再アップロードしてデプロイ',
      '',
    ].join('\n')
  );
  console.error('APP84 LOCATION PROD OK');
  console.log(JSON.stringify({ ok: true, dir: WORK_DIR }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
