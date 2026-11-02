'use strict';

/**
 * Builds one async IIFE string that:
 * 1) expects window.__SH_FILES already set (base64 map)
 * 2) uploads to App 94 customize (desktop) and deploys
 */

const uploadBody = `
(async function () {
  const APP = 94;
  const files = window.__SH_FILES;
  if (!files) throw new Error('__SH_FILES missing');

  function b64ToBlob(b64, type) {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: type });
  }

  async function uploadBlob(blob, filename) {
    const fd = new FormData();
    fd.append('file', blob, filename);
    const res = await fetch(kintone.api.url('/k/v1/file.json', true), {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      body: fd
    });
    const json = await res.json();
    if (!res.ok || !json.fileKey) {
      throw new Error('file upload failed: ' + JSON.stringify(json));
    }
    return json.fileKey;
  }

  const cssKey = await uploadBlob(b64ToBlob(files['schedule_hub.css'], 'text/css'), 'schedule_hub.css');
  const configKey = await uploadBlob(b64ToBlob(files['schedule_hub_config.js'], 'text/javascript'), 'schedule_hub_config.js');
  const engineKey = await uploadBlob(b64ToBlob(files['schedule_hub_engine.js'], 'text/javascript'), 'schedule_hub_engine.js');
  const desktopKey = await uploadBlob(b64ToBlob(files['schedule_hub_desktop.js'], 'text/javascript'), 'schedule_hub_desktop.js');

  await kintone.api(kintone.api.url('/k/v1/preview/app/customize.json', true), 'PUT', {
    app: APP,
    desktop: {
      js: [
        { type: 'FILE', file: { fileKey: configKey } },
        { type: 'FILE', file: { fileKey: engineKey } },
        { type: 'FILE', file: { fileKey: desktopKey } }
      ],
      css: [
        { type: 'FILE', file: { fileKey: cssKey } }
      ]
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
      return { ok: true, keys: { cssKey: cssKey, configKey: configKey, engineKey: engineKey, desktopKey: desktopKey } };
    }
    if (s && s.status === 'FAIL') return { ok: false, status: s };
    await new Promise(function (r) { setTimeout(r, 500); });
  }
  return { ok: false, timeout: true };
})()
`;

require('fs').writeFileSync(
  require('path').join(__dirname, 'sh_upload_eval.js'),
  uploadBody.trim()
);
console.log('wrote upload eval', uploadBody.length);
