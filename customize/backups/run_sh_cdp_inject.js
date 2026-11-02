'use strict';

/**
 * Prints each inject expression as a single-line JSON string to stdout,
 * prefixed with ===EXPR_N=== for an external runner.
 * (Used when piping into CDP manually.)
 */

const fs = require('fs');
const path = require('path');

const exprs = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'sh_inject_exprs.json'), 'utf8')
);

exprs.forEach((expr, index) => {
  process.stdout.write('===EXPR_' + index + '===\n');
  process.stdout.write(JSON.stringify(expr) + '\n');
});
