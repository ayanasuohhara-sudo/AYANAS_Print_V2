const fs = require('fs');
const src = fs.readFileSync(
  'C:/CAYANAS_Print_v2/customize/schedule_customer.js'
);
const b64 = src.toString('base64');
const chunkSize = 2000;
const chunks = [];
for (let i = 0; i < b64.length; i += chunkSize) {
  chunks.push(b64.slice(i, i + chunkSize));
}
fs.writeFileSync(
  'C:/CAYANAS_Print_v2/customize/backups/upload_chunks.json',
  JSON.stringify({ chunks, totalLen: b64.length, decodedLen: src.length }),
  'utf8'
);
chunks.forEach((c, i) => {
  fs.writeFileSync(
    `C:/CAYANAS_Print_v2/customize/backups/chunk_${i}.txt`,
    c,
    'utf8'
  );
});
console.log(JSON.stringify({ n: chunks.length, totalLen: b64.length }));
