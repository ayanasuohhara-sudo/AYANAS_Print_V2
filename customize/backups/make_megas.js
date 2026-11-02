'use strict';

const fs = require('fs');
const path = require('path');

const n = 90;
const size = 15;
const root = __dirname;

for (let b = 0; b < Math.ceil(n / size); b++) {
  const parts = [];
  for (let i = b * size; i < Math.min(n, (b + 1) * size); i++) {
    parts.push(fs.readFileSync(path.join(root, 'dt_' + i + '.js'), 'utf8'));
  }
  const expr = parts.join('\n') + '\n"mega-' + b + '";';
  fs.writeFileSync(path.join(root, 'mega_' + b + '.js'), expr);
  console.log('mega', b, expr.length);
}
