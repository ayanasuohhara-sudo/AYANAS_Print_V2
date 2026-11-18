/**
 * App89 分類確認用。manage_no の App16 明細と App13 subcategory を表示する。
 *
 *   $env:KINTONE_SUBDOMAIN = "o5nppg7kb4ly"
 *   $env:KINTONE_API_TOKEN = "（App16/13 GET）"
 *   node scripts/deadline_load_manage_audit.mjs 091826558
 */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const manageNo = String(process.argv[2] || '').trim();
const SUBDOMAIN = process.env.KINTONE_SUBDOMAIN || 'o5nppg7kb4ly';
const TOKEN = process.env.KINTONE_API_TOKEN || '';

if (!manageNo) {
  console.error('用法: node scripts/deadline_load_manage_audit.mjs <manage_no>');
  process.exit(1);
}

if (!TOKEN) {
  console.error('KINTONE_API_TOKEN が未設定です。');
  process.exit(1);
}

global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/deadline_load_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/deadline_load_engine.js'), 'utf8'));

const C = global.CAYANAS_DEADLINE_LOAD;
const E = global.CAYANAS_DeadlineLoadEngine;

const getJson = async (app, query, fields) => {
  const url = new URL(`https://${SUBDOMAIN}.cybozu.com/k/v1/records.json`);
  url.searchParams.set('app', String(app));
  url.searchParams.set('query', query);
  (fields || []).forEach((field) => url.searchParams.append('fields', field));

  const response = await fetch(url, {
    headers: { 'X-Cybozu-API-Token': TOKEN },
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(body));
  }

  return body.records || [];
};

const orders = await getJson(
  C.ORDER_APP_ID,
  `manage_no = "${manageNo.replace(/"/g, '\\"')}"`,
  E.orderFetchFields()
);

if (!orders.length) {
  console.log(`App16 に manage_no=${manageNo} はありません。`);
  process.exit(0);
}

const codes = E.collectItemCodes(orders);
const products = [];

for (const chunk of E.chunkItemCodes(codes)) {
  const page = await E.fetchAllPages(
    E.buildProductQuery(chunk),
    async (query) => getJson(C.PRODUCT_APP_ID, query, E.productFetchFields())
  );
  products.push(...page.records);
}

const map = E.buildSubcategoryMap(products);

console.log(`manage_no=${manageNo}  App16件数=${orders.length}`);
console.log(`判定優先: ${C.CATEGORY_PRIORITY.join(' > ')}`);
console.log(`表示順: ${C.CATEGORIES.map((c) => c.key).join(' → ')}`);
console.log('');

orders.forEach((record, index) => {
  const id = record.$id?.value;
  const deadline = String(record.deadline?.value || '').slice(0, 10);
  const aggregation = record.aggregation_status?.value;
  const detail = Array.isArray(record.detail_table?.value) ? record.detail_table.value : [];
  const keys = E.matchingCategoryKeys(record, map);
  const label = E.categoryLabel(keys);

  console.log(`--- レコード ${index + 1} id=${id} deadline=${deadline} aggregation=${aggregation}`);
  console.log(`採用分類: ${label || '（対象外）'}  keys=${keys.join(',') || '-'}`);
  console.log('明細:');

  detail.forEach((row) => {
    const code = String(row.value?.item_code?.value || '').trim();
    const name = String(row.value?.item_name?.value || '').trim();
    const sub = code ? String(map.get(code) || '') : '';
    const hit = C.CATEGORIES.find((category) => category.subcategories.includes(sub));

    console.log(
      `  item_code=${code || '(空)'}  item_name=${name || '(空)'}  subcategory=${sub || '(未解決)'}  → ${hit ? hit.label : '対象外'}`
    );
  });

  console.log('');
});
