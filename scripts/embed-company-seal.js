'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const imageDir = path.join(projectRoot, 'image');
const primaryPath = path.join(imageDir, 'company-seal.png');
const fallbackPath = path.join(imageDir, 'company-seal.png', 'get.png');
const doubleExtPath = path.join(imageDir, 'company-seal.png.png');
const outputPath = path.join(projectRoot, 'js', 'company-seal-data.js');

const resolveSourcePath = () => {

    const candidates = [
        primaryPath,
        doubleExtPath,
        fallbackPath,
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            if (candidate !== primaryPath) {
                console.warn(`[embed-company-seal] ${path.basename(candidate)} を使用します。`);
                console.warn('[embed-company-seal] 推奨ファイル名: image/company-seal.png');
            }
            return candidate;
        }
    }

    if (fs.existsSync(primaryPath) && fs.statSync(primaryPath).isDirectory()) {
        const pngFiles = fs.readdirSync(primaryPath)
            .filter((name) => /\.png$/i.test(name))
            .map((name) => path.join(primaryPath, name));

        if (pngFiles.length > 0) {
            console.warn('[embed-company-seal] image/company-seal.png フォルダ内の PNG を使用します。');
            console.warn('[embed-company-seal] 推奨ファイル名: image/company-seal.png');
            return pngFiles[0];
        }
    }

    if (fs.existsSync(imageDir) && fs.statSync(imageDir).isDirectory()) {
        const sealFiles = fs.readdirSync(imageDir)
            .filter((name) => /^company-seal.*\.png$/i.test(name))
            .map((name) => path.join(imageDir, name))
            .filter((filePath) => fs.statSync(filePath).isFile());

        if (sealFiles.length > 0) {
            console.warn(`[embed-company-seal] ${path.basename(sealFiles[0])} を使用します。`);
            console.warn('[embed-company-seal] 推奨ファイル名: image/company-seal.png');
            return sealFiles[0];
        }
    }

    return '';

};

const sourcePath = resolveSourcePath();

if (!sourcePath) {
    console.warn('[embed-company-seal] ハンコ画像が見つかりません。空のデータ URL を出力します。');
    fs.writeFileSync(outputPath, `(() => {
    'use strict';
    window.CompanySealDataUrl = '';
})();
`, 'utf8');
    process.exit(0);
}

const buffer = fs.readFileSync(sourcePath);
const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;

fs.writeFileSync(outputPath, `(() => {
    'use strict';

    /**
     * 請求書ハンコ画像（npm run pack 時に image/company-seal.png から生成）
     */
    window.CompanySealDataUrl = ${JSON.stringify(dataUrl)};
})();
`, 'utf8');

console.log(`[embed-company-seal] ${sourcePath} -> ${outputPath}`);

