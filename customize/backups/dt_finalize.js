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