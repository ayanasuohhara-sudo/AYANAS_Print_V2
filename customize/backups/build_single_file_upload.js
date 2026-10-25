'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const name = process.argv[2];
const type = process.argv[3] || 'text/javascript';
const content = fs.readFileSync(path.join(root, name), 'utf8');

const expr = `
(async function () {
  const blob = new Blob([${JSON.stringify(content)}], { type: ${JSON.stringify(type)} });
  const fd = new FormData();
  fd.append('file', blob, ${JSON.stringify(name)});
  const res = await fetch(kintone.api.url('/k/v1/file.json', true), {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    body: fd
  });
  const json = await res.json();
  window.__SH_KEYS = window.__SH_KEYS || {};
  window.__SH_KEYS[${JSON.stringify(name)}] = json.fileKey;
  return json;
})()
`.trim();

const out = path.join(__dirname, 'upload_expr_' + name.replace(/\\W/g, '_') + '.js');
fs.writeFileSync(out, expr);
console.log(out, expr.length);
