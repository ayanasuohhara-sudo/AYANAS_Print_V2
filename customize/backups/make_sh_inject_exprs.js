'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname);
const files = [
  ['schedule_hub.css', 'sh_chunks_schedule_hub.css.json'],
  ['schedule_hub_config.js', 'sh_chunks_schedule_hub_config.js.json'],
  ['schedule_hub_engine.js', 'sh_chunks_schedule_hub_engine.js.json'],
  ['schedule_hub_desktop.js', 'sh_chunks_schedule_hub_desktop.js.json'],
];

const exprs = ['window.__SH_PARTS = {};'];

files.forEach(([name, chunkFile]) => {
  const parts = JSON.parse(fs.readFileSync(path.join(root, chunkFile), 'utf8'));
  exprs.push('window.__SH_PARTS[' + JSON.stringify(name) + '] = [];');
  parts.forEach((part, index) => {
    exprs.push(
      'window.__SH_PARTS[' + JSON.stringify(name) + '][' + index + '] = '
      + JSON.stringify(part) + ';'
    );
  });
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

fs.writeFileSync(
  path.join(root, 'sh_inject_exprs.json'),
  JSON.stringify(exprs, null, 2)
);
console.log('exprs', exprs.length);
