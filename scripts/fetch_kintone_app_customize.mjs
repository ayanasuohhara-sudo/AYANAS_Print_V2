/**
 * kintone アプリの JavaScript/CSS カスタマイズ定義とファイルを取得
 *
 * 環境変数:
 *   KINTONE_SUBDOMAIN=o5nppg7kb4ly
 *   KINTONE_API_TOKEN=（アプリ管理権限の API トークン。App30/34 それぞれまたは共通）
 *
 * 実行例:
 *   node scripts/fetch_kintone_app_customize.mjs 30 34
 *
 * 出力: _tmp_app{ID}_export/kintone_customize.json とダウンロードした JS/CSS
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SUBDOMAIN = process.env.KINTONE_SUBDOMAIN || 'o5nppg7kb4ly';
const TOKEN = process.env.KINTONE_API_TOKEN || '';

const appIds = process.argv.slice(2).map(Number).filter((n) => n > 0);

if (!TOKEN) {
  console.error('KINTONE_API_TOKEN が未設定です。');
  process.exit(1);
}

if (appIds.length === 0) {
  console.error('Usage: node scripts/fetch_kintone_app_customize.mjs 30 34');
  process.exit(1);
}

const base = `https://${SUBDOMAIN}.cybozu.com`;

async function apiGet(relativeUrl) {
  const res = await fetch(`${base}${relativeUrl}`, {
    headers: { 'X-Cybozu-API-Token': TOKEN },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${relativeUrl} → ${res.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function downloadFile(fileKey, destPath) {
  const res = await fetch(`${base}/k/v1/file.json?fileKey=${encodeURIComponent(fileKey)}`, {
    headers: { 'X-Cybozu-API-Token': TOKEN },
  });
  if (!res.ok) {
    throw new Error(`file ${fileKey} → ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
}

function collectFiles(scope) {
  const out = [];
  if (!scope) {
    return out;
  }
  ['js', 'css'].forEach((kind) => {
    (scope[kind] || []).forEach((entry, index) => {
      out.push({ kind, index, type: entry.type, file: entry.file });
    });
  });
  return out;
}

for (const appId of appIds) {
  const outDir = path.join(ROOT, `_tmp_app${appId}_export`);
  fs.mkdirSync(outDir, { recursive: true });

  const customize = await apiGet(`/k/v1/app/customize.json?app=${appId}`);
  fs.writeFileSync(
    path.join(outDir, 'kintone_customize.json'),
    JSON.stringify(customize, null, 2)
  );

  const scopes = [
    { name: 'desktop', scope: customize.desktop },
    { name: 'mobile', scope: customize.mobile },
  ];

  for (const { name, scope } of scopes) {
    for (const item of collectFiles(scope)) {
      const ext = item.kind === 'js' ? 'js' : 'css';
      const fileName = `${name}_${item.kind}${item.index + 1}.${ext}`;
      const dest = path.join(outDir, fileName);
      await downloadFile(item.file.fileKey, dest);
      console.log(`App ${appId}: saved ${fileName} (${item.type})`);
    }
  }

  console.log(`App ${appId}: wrote kintone_customize.json`);
}
