const fs = require('fs');
const b64 = fs.readFileSync(
  'C:/CAYANAS_Print_v2/customize/backups/schedule_customer.b64.txt',
  'utf8'
).trim();

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
  const names = Array.from(document.querySelectorAll('tr'))
    .filter((r) => /\\.js/.test(r.innerText || ''))
    .map((r) => (r.innerText || '').replace(/\\s+/g, ' ').trim())
    .slice(0, 15);
  return {
    ok: true,
    filesCount: input.files.length,
    fileName: input.files[0] && input.files[0].name,
    size: input.files[0] && input.files[0].size,
    names: names,
  };
})()`;

fs.writeFileSync(
  'C:/CAYANAS_Print_v2/customize/backups/upload_params.json',
  JSON.stringify({ expression }, null, 2)
);
console.log('expression length', expression.length);
