const fs = require('fs');
const b64 = fs
  .readFileSync(
    'C:/CAYANAS_Print_v2/customize/backups/schedule_customer.b64.txt',
    'utf8'
  )
  .trim();

const chunkSize = 1500;
const chunks = [];
for (let i = 0; i < b64.length; i += chunkSize) {
  chunks.push(b64.slice(i, i + chunkSize));
}

fs.writeFileSync(
  'C:/CAYANAS_Print_v2/customize/backups/upload_chunks.json',
  JSON.stringify({ chunks, totalLen: b64.length }, null, 2)
);
console.log('chunks', chunks.length, 'total', b64.length);
