'use strict';

const fs = require('fs');
const path = require('path');

const root = __dirname;
const chunks = JSON.parse(fs.readFileSync(path.join(root, 'sh_dt_chunks.json'), 'utf8'));
const batchSize = 10;
const batches = [];

for (let i = 0; i < chunks.length; i += batchSize) {
  const slice = chunks.slice(i, i + batchSize);
  const expr = slice.map((chunk) => (
    'window.__SHB=window.__SHB||{};'
    + 'window.__SHB[' + JSON.stringify(chunk.name) + ']='
    + '(window.__SHB[' + JSON.stringify(chunk.name) + ']||[]).concat(['
    + JSON.stringify(chunk.data) + ']);'
  )).join('\n') + '\n"batch-' + batches.length + '";';
  const file = path.join(root, 'batch_' + batches.length + '.js');
  fs.writeFileSync(file, expr);
  batches.push({ index: batches.length, file: file, len: expr.length, count: slice.length });
}

fs.writeFileSync(path.join(root, 'sh_batches_meta.json'), JSON.stringify(batches, null, 2));
console.log(JSON.stringify(batches.map((b) => ({ i: b.index, len: b.len, count: b.count }))));
