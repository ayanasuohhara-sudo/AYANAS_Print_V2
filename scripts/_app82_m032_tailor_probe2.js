'use strict';

/**
 * M032 深掘り: 月別内訳・「海外仕立て」未解決・年度別ダッシュボード数値
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const SUB = 'o5nppg7kb4ly';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const WORK_DIR = path.join(ROOT, 'customize/backups', 'app82_m032_probe2_' + STAMP);
fs.mkdirSync(WORK_DIR, { recursive: true });
const CODE = 'M032';

const httpJson = (p, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 9222, path: p, method }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(d || 'null'));
        } catch (_) {
          resolve(d);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });

async function openPage(url) {
  const page = await httpJson('/json/new?' + encodeURIComponent(url), 'PUT');
  if (!page || !page.webSocketDebuggerUrl) throw new Error('open failed');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  let id = 1;
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = id++;
    const t = setTimeout(() => rej(new Error('timeout ' + method)), 600000);
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
      expression: `({hasK:typeof kintone!=='undefined',url:location.href})`,
    });
    if (s.result && s.result.value && s.result.value.hasK && !/login/.test(s.result.value.url)) break;
  }
  return {
    send,
    close: async () => { try { await httpJson('/json/close/' + page.id, 'GET'); } catch (_) {} },
  };
}

(async () => {
  const page = await openPage(`https://${SUB}.cybozu.com/k/82/`);
  await page.send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 2500));

  const result = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const CODE = ${JSON.stringify(CODE)};
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const Monthly = window.CAYANAS_BusinessDashboardMonthly;
      const CFG = window.CAYANAS_BUSINESS_DASHBOARD;

      async function fetchAll(app, query, fields) {
        const out = [];
        let offset = 0;
        while (true) {
          const res = await api('/k/v1/records.json', 'GET', {
            app, query: query + ' limit 500 offset ' + offset, totalCount: true, fields
          });
          out.push(...(res.records || []));
          if (out.length >= Number(res.totalCount || 0) || !(res.records || []).length) break;
          offset += 500;
        }
        return out;
      }

      const products = await fetchAll(13, 'order by レコード番号 asc', ['item_code','item_name','subcategory']);
      const lookup = Monthly.buildProductLookup(products);

      // App13 に「海外仕立て」があるか
      const overseasNamed = products.filter((r) => {
        const n = String(r.item_name && r.item_name.value || '');
        const c = String(r.item_code && r.item_code.value || '');
        const s = String(r.subcategory && r.subcategory.value || '');
        return /海外仕[立て]/.test(n+c+s) || /海外/.test(s);
      }).map((r) => ({
        code: r.item_code && r.item_code.value,
        name: r.item_name && r.item_name.value,
        sub: r.subcategory && r.subcategory.value,
        resolved: Monthly.normalizeSubcategory(r.subcategory && r.subcategory.value)
      }));

      const orders = await fetchAll(16,
        'customer_code = "' + CODE + '" order by order_date asc',
        ['$id','manage_no','order_date','customer_code','customer_name','kimono_type','aggregation_status','detail_table']
      );

      const DATA_START = CFG.MONTHLY.DATA_START_DATE;
      const analyzed = orders.map((rec) => Monthly.analyzeOrder(rec, lookup));
      analyzed.forEach((o, i) => {
        o.aggregationStatus = String(orders[i].aggregation_status && orders[i].aggregation_status.value || '').trim();
        o.cancelled = o.aggregationStatus === '取消';
      });

      // 明細品名の出現（未解決含む）
      const itemNameFreq = {};
      const unresolvedNameFreq = {};
      orders.forEach((rec) => {
        const rows = (rec.detail_table && rec.detail_table.value) || [];
        rows.forEach((row) => {
          const v = row.value || {};
          const name = String(v.item_name && v.item_name.value || '').trim();
          const code = String(v.item_code && v.item_code.value || '').trim();
          if (!name && !code) return;
          itemNameFreq[name || ('#'+code)] = (itemNameFreq[name || ('#'+code)] || 0) + 1;
          const sub = (() => {
            if (code && lookup.byCode.has(code)) return lookup.byCode.get(code) || '';
            if (name && lookup.byName.has(name)) return lookup.byName.get(name) || '';
            return '';
          })();
          if (!sub) {
            const key = name || ('#'+code);
            unresolvedNameFreq[key] = (unresolvedNameFreq[key] || 0) + 1;
          }
        });
      });

      const monthBucket = {};
      const bump = (ym, key) => {
        if (!monthBucket[ym]) {
          monthBucket[ym] = {
            total: 0, tailor: 0, other: 0, conflict: 0, cancelled: 0,
            otherUnresolvedKaigai: 0, overseas: 0, domestic: 0, obi: 0
          };
        }
        monthBucket[ym][key] += 1;
      };

      analyzed.forEach((o, idx) => {
        const ym = (o.orderDate || '').slice(0, 7) || 'unknown';
        bump(ym, 'total');
        if (o.cancelled) bump(ym, 'cancelled');
        if (o.route === 'overseas') { bump(ym, 'overseas'); bump(ym, 'tailor'); }
        else if (o.route === 'domestic') { bump(ym, 'domestic'); bump(ym, 'tailor'); }
        else if (o.route === 'obi') { bump(ym, 'obi'); bump(ym, 'tailor'); }
        else if (o.route === 'conflict') bump(ym, 'conflict');
        else {
          bump(ym, 'other');
          // 明細に海外仕立て文字列があるか
          const rows = (orders[idx].detail_table && orders[idx].detail_table.value) || [];
          const hasKaigaiShitateTe = rows.some((row) => {
            const n = String(row.value && row.value.item_name && row.value.item_name.value || '');
            return n === '海外仕立て' || n.indexOf('海外仕立') >= 0;
          });
          if (hasKaigaiShitateTe) bump(ym, 'otherUnresolvedKaigai');
        }
      });

      // 「海外仕立て」未解決が原因で other になった件数
      let otherDueToKaigaiTe = 0;
      const otherKaigaiSamples = [];
      analyzed.forEach((o, idx) => {
        if (o.route !== 'other' || o.cancelled) return;
        const rows = (orders[idx].detail_table && orders[idx].detail_table.value) || [];
        const names = rows.map((row) => String(row.value && row.value.item_name && row.value.item_name.value || '').trim()).filter(Boolean);
        if (names.some((n) => n === '海外仕立て' || /^海外仕立/.test(n))) {
          otherDueToKaigaiTe += 1;
          if (otherKaigaiSamples.length < 25) {
            otherKaigaiSamples.push({
              manageNo: o.manageNo,
              orderDate: o.orderDate,
              kimonoType: o.kimonoType,
              names
            });
          }
        }
      });

      // もし「海外仕立て」を海外仕立エイリアスしたらどうなるか
      const aliasExtra = Object.assign({}, CFG.MONTHLY.SUBCATEGORY_ALIASES || {}, {
        '海外仕立て': '海外仕立',
        '国内仕立て': '国内仕立',
        '帯仕立て': '帯仕立'
      });
      // monkey-patch normalize via re-resolve on names
      const reclassWithAlias = (rec) => {
        const rows = (rec.detail_table && rec.detail_table.value) || [];
        const subs = [];
        rows.forEach((row) => {
          const v = row.value || {};
          const name = String(v.item_name && v.item_name.value || '').trim();
          const code = String(v.item_code && v.item_code.value || '').trim();
          if (!name && !code) return;
          let sub = '';
          if (code && lookup.byCode.has(code)) sub = lookup.byCode.get(code) || '';
          else if (name && lookup.byName.has(name)) sub = lookup.byName.get(name) || '';
          if (!sub && name && aliasExtra[name]) sub = aliasExtra[name];
          // 品名そのものがカテゴリ名のとき
          if (!sub && aliasExtra[name]) sub = aliasExtra[name];
          if (!sub && (name === '海外仕立て' || name === '海外仕立')) sub = '海外仕立';
          if (!sub && (name === '国内仕立て' || name === '国内仕立')) sub = '国内仕立';
          if (!sub && (name === '帯仕立て' || name === '帯仕立')) sub = '帯仕立';
          if (sub) subs.push(Monthly.normalizeSubcategory(sub));
        });
        return Monthly.classifyTailorRouteDetail(subs).route;
      };

      let hypoTailor = 0;
      let hypoGain = 0;
      analyzed.forEach((o, idx) => {
        if (o.cancelled) return;
        const route2 = reclassWithAlias(orders[idx]);
        const isT = route2 === 'overseas' || route2 === 'domestic' || route2 === 'obi';
        if (isT) hypoTailor += 1;
        if (!o.isTailorKimono && isT) hypoGain += 1;
      });

      // ダッシュボード buildMonthlyReport で得意先抽出（2025年度・2026年度）
      const customerForFy = {};
      for (const year of [2025, 2026]) {
        const report = await Monthly.buildMonthlyReport({
          fiscalStartYear: year,
          routeFilter: 'all',
          asOfYmd: Monthly.todayYmdJst(),
        });
        const ranking = (report.customerRanking || report.customers || []);
        // buildMonthlyReport structure — inspect keys
        const custMaps = [];
        if (report.months) {
          // aggregate from months byCustomer if present
        }
        let found = null;
        const tryLists = [
          report.customerRanking,
          report.customers,
          report.selectedCustomers,
          report.ranking,
        ].filter(Boolean);
        for (const list of tryLists) {
          const hit = list.find((c) => c.customerCode === CODE);
          if (hit) { found = hit; break; }
        }
        // selected metrics months sum from byCustomer in months
        let fromMonths = null;
        if (Array.isArray(report.months)) {
          let tailor = 0, overseas = 0, domestic = 0, obi = 0;
          const perMonth = {};
          report.months.forEach((m) => {
            if (m.status !== 'ready') return;
            const customers = m.byCustomer || m.customers || [];
            let row = null;
            if (Array.isArray(customers)) {
              row = customers.find((c) => c.customerCode === CODE);
            } else if (customers && typeof customers === 'object') {
              row = customers[CODE];
            }
            if (row) {
              perMonth[m.key || m.label] = {
                tailor: row.tailorKimono,
                overseas: row.overseasKimono,
                domestic: row.domesticKimono,
                obi: row.obiKimono
              };
              tailor += row.tailorKimono || 0;
              overseas += row.overseasKimono || 0;
              domestic += row.domesticKimono || 0;
              obi += row.obiKimono || 0;
            }
          });
          fromMonths = { tailor, overseas, domestic, obi, perMonth };
        }
        customerForFy[year] = {
          reportKeys: Object.keys(report || {}),
          found,
          fromMonths,
          selected: report.selectedMetrics || null,
          yearTotals: report.yearTotals || report.year || null,
          conflictCount: report.conflictCount
        };
      }

      // FY windows counts from analyzed
      const inRange = (o, start, end) => o.orderDate >= start && o.orderDate <= end && !o.cancelled;
      const fyStats = (start, end) => {
        const rows = analyzed.filter((o) => inRange(o, start, end) && o.orderDate >= DATA_START);
        return {
          total: rows.length,
          tailor: rows.filter((o) => o.isTailorKimono).length,
          other: rows.filter((o) => o.route === 'other').length,
          conflict: rows.filter((o) => o.route === 'conflict').length,
          overseas: rows.filter((o) => o.route === 'overseas').length,
          domestic: rows.filter((o) => o.route === 'domestic').length,
          obi: rows.filter((o) => o.route === 'obi').length,
        };
      };

      const topUnresolved = Object.entries(unresolvedNameFreq)
        .sort((a, b) => b[1] - a[1]).slice(0, 30)
        .map(([name, n]) => ({ name, n }));

      return {
        ok: true,
        dataStart: DATA_START,
        dashVersion: CFG.VERSION,
        monthlyVersion: Monthly.VERSION,
        orderCount: orders.length,
        overseasNamedInApp13: overseasNamed.slice(0, 40),
        overseasNamedCount: overseasNamed.length,
        topUnresolved,
        otherDueToKaigaiTe,
        otherKaigaiSamples,
        hypoTailorIfAlias,
        hypoGain,
        monthBucket,
        fy2025: fyStats('2025-08-01', '2026-07-31'),
        fy2026: fyStats('2026-08-01', '2027-07-31'),
        allAfterDataStart: fyStats(DATA_START, '2099-12-31'),
        customerForFy,
        sampleNov2026: analyzed.filter((o) => o.orderDate >= '2026-08-01' && o.orderDate <= '2026-11-30')
          .slice(0, 20)
          .map((o) => ({
            manageNo: o.manageNo,
            orderDate: o.orderDate,
            route: o.route,
            isTailor: o.isTailorKimono,
            kimonoType: o.kimonoType
          }))
      };

      function hypoTailorIfAlias() { return null; }
    })().then((r) => {
      // fix hypo fields computed above
      return r;
    })`,
  });

  // The expression has a bug with hypoTailorIfAlias function - let me check result
  let value = result.result && result.result.value;
  // Re-run cleaner if needed
  if (!value || value.ok !== true || typeof value.hypoGain === 'undefined') {
    // parse error path
    fs.writeFileSync(path.join(WORK_DIR, 'raw_error.json'), JSON.stringify(result, null, 2));
  }

  // Fix: the IIFE referenced hypoTailorIfAlias wrongly. Re-evaluate a cleaned script.
  const result2 = await page.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const CODE = ${JSON.stringify(CODE)};
      const api = (p, m, b) => kintone.api(kintone.api.url(p, true), m, b);
      const Monthly = window.CAYANAS_BusinessDashboardMonthly;
      const CFG = window.CAYANAS_BUSINESS_DASHBOARD;
      async function fetchAll(app, query, fields) {
        const out = []; let offset = 0;
        while (true) {
          const res = await api('/k/v1/records.json', 'GET', {
            app, query: query + ' limit 500 offset ' + offset, totalCount: true, fields
          });
          out.push(...(res.records || []));
          if (out.length >= Number(res.totalCount || 0) || !(res.records || []).length) break;
          offset += 500;
        }
        return out;
      }
      const products = await fetchAll(13, 'order by レコード番号 asc', ['item_code','item_name','subcategory']);
      const lookup = Monthly.buildProductLookup(products);
      const orders = await fetchAll(16,
        'customer_code = "' + CODE + '" order by order_date asc',
        ['$id','manage_no','order_date','kimono_type','aggregation_status','detail_table']
      );
      const DATA_START = CFG.MONTHLY.DATA_START_DATE;
      const analyzed = orders.map((rec) => {
        const o = Monthly.analyzeOrder(rec, lookup);
        o.cancelled = String(rec.aggregation_status && rec.aggregation_status.value || '').trim() === '取消';
        return o;
      });

      const resolveSub = (code, name) => {
        if (code && lookup.byCode.has(code)) return lookup.byCode.get(code) || '';
        if (name && lookup.byName.has(name)) return lookup.byName.get(name) || '';
        return '';
      };

      const unresolvedNameFreq = {};
      let otherDueToKaigaiTe = 0;
      const otherKaigaiSamples = [];
      let hypoGain = 0;
      let hypoTailor = 0;

      orders.forEach((rec, idx) => {
        const o = analyzed[idx];
        const rows = (rec.detail_table && rec.detail_table.value) || [];
        const names = [];
        const subs = [];
        rows.forEach((row) => {
          const v = row.value || {};
          const name = String(v.item_name && v.item_name.value || '').trim();
          const code = String(v.item_code && v.item_code.value || '').trim();
          if (!name && !code) return;
          names.push(name);
          let sub = resolveSub(code, name);
          if (!sub) {
            const key = name || ('#' + code);
            unresolvedNameFreq[key] = (unresolvedNameFreq[key] || 0) + 1;
            if (name === '海外仕立て') sub = '海外仕立';
            else if (name === '国内仕立て') sub = '国内仕立';
            else if (name === '帯仕立て') sub = '帯仕立';
          }
          if (sub) subs.push(Monthly.normalizeSubcategory(sub));
        });
        const route2 = Monthly.classifyTailorRouteDetail(subs).route;
        const isT2 = route2 === 'overseas' || route2 === 'domestic' || route2 === 'obi';
        if (!o.cancelled && isT2) hypoTailor += 1;
        if (!o.cancelled && !o.isTailorKimono && isT2) hypoGain += 1;
        if (o.route === 'other' && !o.cancelled && names.some((n) => n === '海外仕立て' || n.indexOf('海外仕立') === 0)) {
          otherDueToKaigaiTe += 1;
          if (otherKaigaiSamples.length < 20) {
            otherKaigaiSamples.push({
              manageNo: o.manageNo, orderDate: o.orderDate, kimonoType: o.kimonoType, names
            });
          }
        }
      });

      const monthBucket = {};
      analyzed.forEach((o) => {
        const ym = (o.orderDate || '').slice(0, 7) || 'unknown';
        if (!monthBucket[ym]) monthBucket[ym] = { total:0, tailor:0, other:0, conflict:0, overseas:0, domestic:0, obi:0 };
        monthBucket[ym].total += 1;
        if (o.route === 'overseas') { monthBucket[ym].overseas += 1; monthBucket[ym].tailor += 1; }
        else if (o.route === 'domestic') { monthBucket[ym].domestic += 1; monthBucket[ym].tailor += 1; }
        else if (o.route === 'obi') { monthBucket[ym].obi += 1; monthBucket[ym].tailor += 1; }
        else if (o.route === 'conflict') monthBucket[ym].conflict += 1;
        else monthBucket[ym].other += 1;
      });

      const fyStats = (start, end) => {
        const rows = analyzed.filter((o) => !o.cancelled && o.orderDate >= start && o.orderDate <= end && o.orderDate >= DATA_START);
        return {
          total: rows.length,
          tailor: rows.filter((o) => o.isTailorKimono).length,
          other: rows.filter((o) => o.route === 'other').length,
          conflict: rows.filter((o) => o.route === 'conflict').length,
          overseas: rows.filter((o) => o.route === 'overseas').length,
          domestic: rows.filter((o) => o.route === 'domestic').length,
          obi: rows.filter((o) => o.route === 'obi').length,
        };
      };

      // buildMonthlyReport for customer
      const customerForFy = {};
      for (const year of [2025, 2026]) {
        const report = await Monthly.buildMonthlyReport({
          fiscalStartYear: year,
          routeFilter: 'all',
          asOfYmd: Monthly.todayYmdJst(),
        });
        let fromMonths = { tailor:0, overseas:0, domestic:0, obi:0, perMonth:{} };
        (report.months || []).forEach((m) => {
          if (m.status && m.status !== 'ready') return;
          const list = m.topCustomers || m.customers || m.customerRanking || [];
          let row = null;
          if (Array.isArray(list)) row = list.find((c) => c.customerCode === CODE);
          // some reports expose byCustomer as array already serialized
          if (!row && Array.isArray(m.byCustomer)) row = m.byCustomer.find((c) => c.customerCode === CODE);
          if (row) {
            fromMonths.perMonth[m.key] = {
              tailor: row.tailorKimono, overseas: row.overseasKimono,
              domestic: row.domesticKimono, obi: row.obiKimono, status: m.status
            };
            fromMonths.tailor += row.tailorKimono || 0;
            fromMonths.overseas += row.overseasKimono || 0;
            fromMonths.domestic += row.domesticKimono || 0;
            fromMonths.obi += row.obiKimono || 0;
          }
        });
        // also search flattened ranking
        const ranking = report.customerRanking || report.topCustomers || [];
        const found = Array.isArray(ranking) ? ranking.find((c) => c.customerCode === CODE) : null;
        customerForFy[year] = {
          keys: Object.keys(report),
          monthKeys: (report.months || []).map((m) => m.key + ':' + m.status),
          found: found ? {
            tailor: found.tailorKimono, overseas: found.overseasKimono,
            domestic: found.domesticKimono, obi: found.obiKimono,
            name: found.customerName
          } : null,
          fromMonths,
          selectedTailor: report.selectedMetrics && report.selectedMetrics.tailorKimono,
          yearTailor: report.yearTotals && report.yearTotals.tailorKimono
        };
      }

      // App13 entries related
      const overseasNamed = products.filter((r) => {
        const n = String(r.item_name && r.item_name.value || '');
        const s = String(r.subcategory && r.subcategory.value || '');
        return n.indexOf('海外') >= 0 || s.indexOf('海外') >= 0;
      }).slice(0, 50).map((r) => ({
        code: r.item_code && r.item_code.value,
        name: r.item_name && r.item_name.value,
        sub: r.subcategory && r.subcategory.value
      }));

      const topUnresolved = Object.entries(unresolvedNameFreq).sort((a,b)=>b[1]-a[1]).slice(0,25)
        .map(([name,n]) => ({ name, n }));

      return {
        ok: true,
        dataStart: DATA_START,
        versions: { dash: CFG.VERSION, monthly: Monthly.VERSION },
        orderCount: orders.length,
        fy2025: fyStats('2025-08-01','2026-07-31'),
        fy2026: fyStats('2026-08-01','2027-07-31'),
        afterDataAll: fyStats(DATA_START, '2099-12-31'),
        monthBucket,
        otherDueToKaigaiTe,
        otherKaigaiSamples,
        hypoTailorIfAliasKaigaiTe: hypoTailor,
        hypoGainFromAlias: hypoGain,
        topUnresolved,
        overseasNamed,
        customerForFy,
        augNov2026: analyzed.filter((o) => o.orderDate >= '2026-08-01' && o.orderDate <= '2026-11-30')
          .reduce((acc, o) => {
            acc.total += 1;
            if (o.isTailorKimono) acc.tailor += 1; else if (o.route==='other') acc.other += 1;
            else if (o.route==='conflict') acc.conflict += 1;
            return acc;
          }, { total:0, tailor:0, other:0, conflict:0 })
      };
    })()`,
  });

  await page.close();
  value = result2.result && result2.result.value;
  fs.writeFileSync(path.join(WORK_DIR, 'probe2.json'), JSON.stringify(value, null, 2));
  console.log(JSON.stringify({
    workDir: WORK_DIR,
    versions: value && value.versions,
    fy2025: value && value.fy2025,
    fy2026: value && value.fy2026,
    afterDataAll: value && value.afterDataAll,
    augNov2026: value && value.augNov2026,
    otherDueToKaigaiTe: value && value.otherDueToKaigaiTe,
    hypoGainFromAlias: value && value.hypoGainFromAlias,
    hypoTailorIfAlias: value && value.hypoTailorIfAliasKaigaiTe,
    topUnresolved: value && value.topUnresolved && value.topUnresolved.slice(0, 10),
    customerForFy: value && value.customerForFy,
    monthBucket: value && value.monthBucket,
  }, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
