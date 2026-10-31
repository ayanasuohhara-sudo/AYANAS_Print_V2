const fs = require('fs');
const src = fs.readFileSync(
  'C:/CAYANAS_Print_v2/customize/schedule_customer.js'
);
const b64 = src.toString('base64');
const expression = `(() => {
  const b64 = ${JSON.stringify(b64)};
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const file = new File([bytes], 'schedule_customer.js', { type: 'text/javascript' });
  const input = document.querySelectorAll('input[type=file]')[0];
  if (!input) return { ok: false, err: 'no input' };
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, size: file.size, head: bin.slice(0, 50) };
})()`;
fs.writeFileSync(
  'C:/CAYANAS_Print_v2/customize/backups/single_upload_expr.json',
  JSON.stringify({ expression }),
  'utf8'
);
console.log(JSON.stringify({ exprLen: expression.length, size: src.length }));
