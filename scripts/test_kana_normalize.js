'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/kana_normalize.js'), 'utf8'));

const K = global.CAYANAS_KanaNormalize;
let failed = 0;

const assert = (name, cond) => {
  if (cond) {
    console.log('OK  ' + name);
    return;
  }
  failed += 1;
  console.error('FAIL ' + name);
};

assert('version', K.VERSION === '1.0.0');
assert('hiragana identity', K.normalizeKanaKey('やまもときよこ') === 'やまもときよこ');
assert('katakana same', K.normalizeKanaKey('ヤマモトキヨコ') === 'やまもときよこ');
assert('spaces ignored', K.normalizeKanaKey('やまもと きよこ') === 'やまもときよこ');
assert('fullwidth space', K.normalizeKanaKey('やまもと　きよこ') === 'やまもときよこ');
assert('mixed kana', K.normalizeKanaKey('ヤマもとキヨコ') === 'やまもときよこ');
assert('partial match', K.matchesKana('やまもと きよこ', 'ヤマモト', 'partial'));
assert('prefix match', K.matchesKana('やまもときよこ', 'やまもと', 'prefix'));
assert('prefix fail', !K.matchesKana('きよこやまもと', 'やまもと', 'prefix'));
assert('empty stored no match', !K.matchesKana('', 'やまもと', 'partial'));
assert('has kana', K.hasKanaChars('ヤマモト'));
assert('has kanji', K.hasKanjiChars('山本清子'));
assert('no kana in kanji', !K.hasKanaChars('山本清子'));

if (failed) {
  console.error('failed=' + failed);
  process.exit(1);
}

console.log('ALL PASS');
