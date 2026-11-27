'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname);
const b64 = JSON.parse(fs.readFileSync(path.join(root, 'schedule_hub_b64.json'), 'utf8'));
const chunkSize = 3500;
const exprs = ['window.__SH_PARTS = {};'];

Object.keys(b64).forEach((name) => {
  const text = b64[name];
  exprs.push('window.__SH_PARTS[' + JSON.stringify(name) + '] = [];');
  let partIndex = 0;
  for (let i = 0; i < text.length; i += chunkSize) {
    const slice = text.slice(i, i + chunkSize);
    exprs.push(
      'window.__SH_PARTS[' + JSON.stringify(name) + '][' + partIndex + '] = '
      + JSON.stringify(slice) + ';'
    );
    partIndex += 1;
  }
});

exprs.push([
  'window.__SH_FILES = {};',
  'Object.keys(window.__SH_PARTS).forEach(function (name) {',
  '  window.__SH_FILES[name] = window.__SH_PARTS[name].join("");',
  '});',
  'Object.keys(window.__SH_FILES).map(function (n) {',
  '  return n + ":" + window.__SH_FILES[n].length;',
  '}).join(",");',
].join('\n'));

fs.writeFileSync(path.join(root, 'sh_inject_exprs_small.json'), JSON.stringify(exprs));
exprs.forEach((expr, index) => {
  fs.writeFileSync(path.join(root, 'sh_s_' + index + '.js'), expr);
});
console.log('count', exprs.length, 'max', Math.max(...exprs.map((e) => e.length)));
