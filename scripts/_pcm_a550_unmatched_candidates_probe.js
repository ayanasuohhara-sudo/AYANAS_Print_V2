'use strict';

/**
 * A550 personal_customer_id 未登録の照合候補調査（読取のみ・自動紐付けなし）
 *   node scripts/_pcm_a550_unmatched_candidates_probe.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'customize/backups/store_customer_history_survey_2026-11-16');
fs.mkdirSync(OUT, { recursive: true });

const httpJson = (p, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: 9222, path: p, method }, (res) => {
    let d = '';
    res.on('data', (c) => { d += c; });
    res.on('end', () => {
      try { resolve(JSON.parse(d || 'null')); } catch (_) { resolve(d); }
    });
  });
  req.on('error', reject);
  req.end();
});

async function openPage(url) {
  const page = await httpJson('/json/new?' + encodeURIComponent(url), 'PUT');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  let id = 1;
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = id++;
    const t = setTimeout(() => rej(new Error('timeout ' + method)), 300000);
    const h = (raw) => {
      const m = JSON.parse(String(raw));
      if (m.id === i) {
        clearTimeout(t);
        ws.off('message', h);
        if (m.error) rej(new Error(JSON.stringify(m.error)));
        else res(m.result);
      }
    };
    ws.on('message', h);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const s = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: "typeof kintone!=='undefined'&&!/login/i.test(location.href)",
    });
    if (s.result && s.result.value) break;
  }
  return {
    send,
    close: async () => { try { await httpJson('/json/close/' + page.id); } catch (_) {} },
  };
}

(async () => {
  const page = await openPage('https://o5nppg7kb4ly.cybozu.com/k/16/');
  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const fetchAll = async (app, baseQuery, fields) => {
        const out = [];
        let offset = 0;
        let total = 0;
        while (true) {
          const q = (baseQuery ? baseQuery + ' ' : '') + 'limit 200 offset ' + offset;
          const body = { app: app, query: q, totalCount: true, fields: fields };
          const res = await api('/k/v1/records.json', 'GET', body);
          out.push.apply(out, res.records || []);
          total = Number(res.totalCount || 0);
          if (out.length >= total || !(res.records || []).length) break;
          offset += 200;
          if (offset > 20000) break;
        }
        return { records: out, total: total };
      };

      const normName = (s) => String(s || '').trim()
        .replace(/[\\s　]+/g, '')
        .replace(/[①②③④⑤⑥⑦⑧⑨⑩]/g, '')
        .toLowerCase();
      const normKana = (s) => String(s || '').trim()
        .replace(/[\\s　]+/g, '')
        .replace(/[ァ-ン]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
        .replace(/[ー−‐-]/g, '')
        .toLowerCase();

      const pcmFields = ['$id', 'personal_customer_id', 'customer_name', 'customer_kana', 'phone', 'mobile_phone', 'member_no'];
      const orderFields = ['$id', 'manage_no', 'order_date', 'client_name', 'client_name_kana', 'kimono_type', 'delivery_status', 'personal_customer_id', 'aggregation_status'];

      const pcmPack = await fetchAll(96, '', pcmFields);
      const unmatchedPack = await fetchAll(16, 'customer_code = "A550" and personal_customer_id = "" order by order_date desc', orderFields);
      const linkedPack = await fetchAll(16, 'customer_code = "A550" and personal_customer_id != "" order by order_date desc', orderFields);

      const byName = new Map();
      const byKana = new Map();
      (pcmPack.records || []).forEach((r) => {
        const entry = {
          pcmRecordId: r.$id.value,
          pid: r.personal_customer_id.value,
          name: r.customer_name.value,
          kana: r.customer_kana.value,
          phone: r.phone.value,
          mobile: r.mobile_phone.value,
          memberNo: r.member_no.value,
        };
        const n = normName(entry.name);
        const k = normKana(entry.kana);
        if (n) {
          if (!byName.has(n)) byName.set(n, []);
          byName.get(n).push(entry);
        }
        if (k) {
          if (!byKana.has(k)) byKana.set(k, []);
          byKana.get(k).push(entry);
        }
      });

      const linkedByName = new Map();
      (linkedPack.records || []).forEach((r) => {
        const n = normName(r.client_name.value);
        if (!n) return;
        if (!linkedByName.has(n)) linkedByName.set(n, new Set());
        linkedByName.get(n).add(r.personal_customer_id.value);
      });

      const summary = {
        totalUnmatched: unmatchedPack.total,
        fetchedUnmatched: (unmatchedPack.records || []).length,
        uniqueNames: 0,
        exactName1: 0,
        exactNameMulti: 0,
        kanaOnly1: 0,
        multiWeak: 0,
        noCandidate: 0,
        nameConflictsWithLinked: 0,
      };

      const nameSet = new Set();
      const rows = [];
      (unmatchedPack.records || []).forEach((r) => {
        const rawName = String(r.client_name.value || '').trim();
        const rawKana = String(r.client_name_kana.value || '').trim();
        const n = normName(rawName);
        const k = normKana(rawKana);
        if (n) nameSet.add(n);
        const map = new Map();
        (n ? (byName.get(n) || []) : []).forEach((h) => map.set(h.pid, Object.assign({}, h, { match: 'name' })));
        (k ? (byKana.get(k) || []) : []).forEach((h) => {
          if (map.has(h.pid)) map.get(h.pid).match = 'name+kana';
          else map.set(h.pid, Object.assign({}, h, { match: 'kana' }));
        });
        const candidates = Array.from(map.values());
        let grade = 'none';
        const hasName = candidates.some((c) => String(c.match).indexOf('name') >= 0);
        if (candidates.length === 1 && hasName) grade = 'exact_name_1';
        else if (candidates.length > 1 && hasName) grade = 'exact_name_multi';
        else if (candidates.length === 1 && candidates[0].match === 'kana') grade = 'kana_only_1';
        else if (candidates.length > 1) grade = 'multi_weak';
        else grade = 'none';

        const linkedPids = n ? Array.from(linkedByName.get(n) || []) : [];
        if (grade === 'exact_name_1') summary.exactName1 += 1;
        else if (grade === 'exact_name_multi') summary.exactNameMulti += 1;
        else if (grade === 'kana_only_1') summary.kanaOnly1 += 1;
        else if (grade === 'multi_weak') summary.multiWeak += 1;
        else summary.noCandidate += 1;
        if (linkedPids.length) summary.nameConflictsWithLinked += 1;

        rows.push({
          recordId: r.$id.value,
          manageNo: r.manage_no.value,
          orderDate: r.order_date.value,
          clientName: rawName,
          clientKana: rawKana,
          kimonoType: r.kimono_type.value,
          deliveryStatus: r.delivery_status.value,
          aggregationStatus: r.aggregation_status.value,
          grade: grade,
          conflictWithLinkedPids: linkedPids,
          candidates: candidates.map((c) => ({
            pid: c.pid,
            name: c.name,
            kana: c.kana,
            match: c.match,
            pcmRecordId: c.pcmRecordId,
          })),
        });
      });
      summary.uniqueNames = nameSet.size;

      const byClient = new Map();
      rows.forEach((row) => {
        const key = row.clientName || '(空)';
        if (!byClient.has(key)) {
          byClient.set(key, {
            clientName: key,
            orders: [],
            grades: {},
            candidates: [],
            conflictWithLinkedPids: [],
          });
        }
        const g = byClient.get(key);
        g.orders.push({
          manageNo: row.manageNo,
          orderDate: row.orderDate,
          recordId: row.recordId,
          grade: row.grade,
        });
        g.grades[row.grade] = (g.grades[row.grade] || 0) + 1;
        row.candidates.forEach((c) => {
          if (!g.candidates.find((x) => x.pid === c.pid)) g.candidates.push(c);
        });
        row.conflictWithLinkedPids.forEach((pid) => {
          if (g.conflictWithLinkedPids.indexOf(pid) < 0) g.conflictWithLinkedPids.push(pid);
        });
      });

      const groups = Array.from(byClient.values()).map((g) => ({
        clientName: g.clientName,
        orderCount: g.orders.length,
        grades: g.grades,
        candidates: g.candidates,
        conflictWithLinkedPids: g.conflictWithLinkedPids,
        sampleOrders: g.orders.slice(0, 8),
      })).sort((a, b) => b.orderCount - a.orderCount || a.clientName.localeCompare(b.clientName, 'ja'));

      return {
        ok: true,
        pcmCount: pcmPack.total,
        linkedCount: linkedPack.total,
        summary: summary,
        groups: groups,
        rows: rows,
      };
    })()`,
  });

  await page.close();
  const value = result.result && result.result.value;
  if (!value || !value.ok) {
    console.error(JSON.stringify(value, null, 2));
    process.exit(1);
  }

  fs.writeFileSync(path.join(OUT, 'a550_unmatched_candidates.json'), JSON.stringify(value, null, 2));

  const lines = [];
  lines.push('# A550 未紐付け照合候補（自動紐付けなし）');
  lines.push('');
  lines.push('生成: 2026-11-16（Asia/Tokyo） / 読取のみ / 氏名のみでは更新しない');
  lines.push('');
  lines.push('## サマリー');
  lines.push('');
  lines.push('| 指標 | 件数 |');
  lines.push('|------|------|');
  const s = value.summary;
  lines.push('| 未紐付け受注 | ' + s.totalUnmatched + ' |');
  lines.push('| 未紐付けユニーク氏名 | ' + s.uniqueNames + ' |');
  lines.push('| 氏名一致・候補1件 | ' + s.exactName1 + ' |');
  lines.push('| 氏名一致・候補複数 | ' + s.exactNameMulti + ' |');
  lines.push('| かなのみ一致・候補1件 | ' + s.kanaOnly1 + ' |');
  lines.push('| 弱い複数候補 | ' + s.multiWeak + ' |');
  lines.push('| 候補なし | ' + s.noCandidate + ' |');
  lines.push('| 同氏名で既に別PID紐付けあり | ' + s.nameConflictsWithLinked + ' |');
  lines.push('| App96件数 | ' + value.pcmCount + ' |');
  lines.push('| A550既紐付け受注 | ' + value.linkedCount + ' |');
  lines.push('');
  lines.push('## 氏名グループ一覧');
  lines.push('');
  lines.push('| お客様名 | 未紐付け件数 | 判定内訳 | 候補PID | 既紐付け衝突 |');
  lines.push('|----------|--------------|----------|---------|--------------|');
  value.groups.forEach((g) => {
    const grades = Object.keys(g.grades).map((k) => k + ':' + g.grades[k]).join(', ');
    const cands = (g.candidates || []).map((c) => c.pid).join(', ') || '—';
    const conflict = (g.conflictWithLinkedPids || []).join(', ') || '—';
    lines.push('| ' + g.clientName + ' | ' + g.orderCount + ' | ' + grades + ' | ' + cands + ' | ' + conflict + ' |');
  });
  fs.writeFileSync(path.join(OUT, 'A550_UNMATCHED_CANDIDATES.md'), lines.join('\n'));

  console.log(JSON.stringify({
    summary: value.summary,
    pcmCount: value.pcmCount,
    linkedCount: value.linkedCount,
    groupCount: value.groups.length,
    topGroups: value.groups.slice(0, 12),
  }, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
