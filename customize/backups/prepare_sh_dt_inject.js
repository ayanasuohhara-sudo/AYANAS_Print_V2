'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname);
const files = [
  'schedule_hub.css',
  'schedule_hub_config.js',
  'schedule_hub_engine.js',
  'schedule_hub_desktop.js',
];

const manifest = {};
const allChunks = [];

files.forEach((name) => {
  const b64 = fs.readFileSync(path.join(root, '..', name)).toString('base64');
  manifest[name] = { len: b64.length, start: allChunks.length };
  const size = 1000;
  for (let i = 0; i < b64.length; i += size) {
    allChunks.push({ name: name, i: allChunks.length, data: b64.slice(i, i + size) });
  }
  manifest[name].end = allChunks.length - 1;
  manifest[name].parts = manifest[name].end - manifest[name].start + 1;
});

fs.writeFileSync(path.join(root, 'sh_dt_chunks.json'), JSON.stringify(allChunks));
fs.writeFileSync(path.join(root, 'sh_dt_manifest.json'), JSON.stringify(manifest, null, 2));

allChunks.forEach((chunk, index) => {
  const expr = 'window.__SHB=window.__SHB||{};window.__SHB['
    + JSON.stringify(chunk.name)
    + ']=(window.__SHB['
    + JSON.stringify(chunk.name)
    + ']||[]).concat(['
    + JSON.stringify(chunk.data)
    + ']);';
  fs.writeFileSync(path.join(root, 'dt_' + index + '.js'), expr);
});

const finalize = `
(async function () {
  const APP = 94;
  function join(name) {
    return (window.__SHB[name] || []).join('');
  }
  function b64ToBlob(b64, type) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: type });
  }
  async function upload(name, type) {
    const b64 = join(name);
    const fd = new FormData();
    fd.append('file', b64ToBlob(b64, type), name);
    const res = await fetch(kintone.api.url('/k/v1/file.json', true), {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      body: fd
    });
    const json = await res.json();
    if (!json.fileKey) throw new Error(name + ' ' + JSON.stringify(json));
    return json.fileKey;
  }
  const cssKey = await upload('schedule_hub.css', 'text/css');
  const configKey = await upload('schedule_hub_config.js', 'text/javascript');
  const engineKey = await upload('schedule_hub_engine.js', 'text/javascript');
  const desktopKey = await upload('schedule_hub_desktop.js', 'text/javascript');
  await kintone.api(kintone.api.url('/k/v1/preview/app/customize.json', true), 'PUT', {
    app: APP,
    desktop: {
      js: [
        { type: 'FILE', file: { fileKey: configKey } },
        { type: 'FILE', file: { fileKey: engineKey } },
        { type: 'FILE', file: { fileKey: desktopKey } }
      ],
      css: [{ type: 'FILE', file: { fileKey: cssKey } }]
    },
    mobile: { js: [], css: [] }
  });
  await kintone.api(kintone.api.url('/k/v1/preview/app/deploy.json', true), 'POST', {
    apps: [{ app: APP }]
  });
  for (let i = 0; i < 40; i++) {
    const st = await kintone.api(kintone.api.url('/k/v1/preview/app/deploy.json', true), 'GET', { apps: [APP] });
    const s = (st.apps || [])[0];
    if (s && s.status === 'SUCCESS') {
      return {
        ok: true,
        lens: Object.keys(window.__SHB).map(function (n) {
          return n + ':' + join(n).length;
        })
      };
    }
    if (s && s.status === 'FAIL') return { ok: false, status: s };
    await new Promise(function (r) { setTimeout(r, 500); });
  }
  return { ok: false, timeout: true };
})()
`.trim();

fs.writeFileSync(path.join(root, 'dt_finalize.js'), finalize);
console.log(JSON.stringify({ chunks: allChunks.length, manifest: manifest, finalizeLen: finalize.length }));
