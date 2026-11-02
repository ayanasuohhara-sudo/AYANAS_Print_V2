const fs = require('fs');

const src = fs.readFileSync(
  'C:/CAYANAS_Print_v2/customize/schedule_customer.js'
);
const b64 = src.toString('base64');
fs.writeFileSync(
  'C:/CAYANAS_Print_v2/customize/backups/schedule_customer.b64.txt',
  b64,
  'utf8'
);

const chunkSize = 1200;
const chunks = [];
for (let i = 0; i < b64.length; i += chunkSize) {
  chunks.push(b64.slice(i, i + chunkSize));
}
fs.writeFileSync(
  'C:/CAYANAS_Print_v2/customize/backups/upload_chunks.json',
  JSON.stringify({ chunks, totalLen: b64.length, decodedLen: src.length }, null, 2),
  'utf8'
);
console.log(
  JSON.stringify({
    chunks: chunks.length,
    totalLen: b64.length,
    decodedLen: src.length,
    head: src.toString('utf8').slice(0, 40),
  })
);
