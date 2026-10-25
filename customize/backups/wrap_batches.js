'use strict';

const fs = require('fs');
const path = require('path');

for (let i = 0; i < 9; i++) {
  const raw = fs.readFileSync(path.join(__dirname, 'batch_' + i + '.js'), 'utf8');
  const b64 = Buffer.from(raw, 'utf8').toString('base64');
  const lines = [];
  for (let p = 0; p < b64.length; p += 80) {
    lines.push(b64.slice(p, p + 80));
  }
  fs.writeFileSync(path.join(__dirname, 'batch_' + i + '.b64.txt'), lines.join('\n'));
  console.log(i, lines.length, b64.length);
}
