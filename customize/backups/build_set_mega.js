'use strict';

const fs = require('fs');
const path = require('path');

const root = __dirname;
for (let i = 0; i < 6; i++) {
  const s = fs.readFileSync(path.join(root, 'mega_' + i + '.js'), 'utf8');
  const expr = 'document.getElementById("sh-paste").value = '
    + JSON.stringify(s)
    + '; document.getElementById("sh-paste").value.length;';
  fs.writeFileSync(path.join(root, 'set_mega_' + i + '.js'), expr);
  console.log(i, expr.length);
}
