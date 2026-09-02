'use strict';

const fs = require('fs');
const path = require('path');

const manifestPath = path.resolve(__dirname, '..', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const version = manifest.version;

console.log('');
console.log('========================================');
console.log(`  パックするプラグイン version: ${version}`);
console.log('========================================');
console.log('');

if (Number(version) <= 66) {
    console.error('manifest.json の version が 66 以下です。');
    console.error('このままパックすると kintone の表示は 66 のままです。');
    console.error('git pull origin main してからパックしてください。');
    process.exit(1);
}

const ppkPath = path.resolve(__dirname, '..', 'private.ppk');

if (!fs.existsSync(ppkPath)) {
    console.error('private.ppk がありません。');
    console.error('66 のときと同じ鍵でパックしないと、別プラグインとして追加され、元の AYANAS Print は 66 のままです。');
    process.exit(1);
}
