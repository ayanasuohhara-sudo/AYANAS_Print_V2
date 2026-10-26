#!/usr/bin/env node
'use strict';

/**
 * Invoice template paging / footer placement smoke test (corporate + general).
 * Logic assertions are primary. A4 fit is measured via Chrome headless with inlined CSS.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'customize/backups/invoice_print_20261026/test_out');
const PRINT_CSS = fs.readFileSync(path.join(ROOT, 'css/print.css'), 'utf8');

const COUNTS = [5, 17, 18, 44, 45, 71, 98];

const loadBrowserScripts = () => {
    const sandbox = {
        console,
        Number,
        String,
        Array,
        Object,
        Math,
        JSON,
        Date,
        Error,
        RegExp,
        parseInt,
        parseFloat,
        isNaN,
        undefined,
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.global = sandbox;

    const runFile = (rel) => {
        const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        vm.runInNewContext(code, sandbox, { filename: rel });
    };

    runFile('js/core.js');
    runFile('js/templates/invoice.js');
    return sandbox;
};

const makeDetail = (index) => ({
    delivery_date: '2026-10-24',
    delivery_no: `N10261024-${600 + index}`,
    client_name: `お客様${index}`,
    manage_no: String(1000 + index),
    item_name: '丸洗い',
    kimono_type: '着物',
    kimono_spec: '袷',
    slip_no: '中袖 赤',
    in_charge: '山田',
    unit_price: 4300,
    qty: 1,
    amount: 4300,
});

const makeData = (count, opts = {}) => {
    const details = Array.from({ length: count }, (_, i) => makeDetail(i + 1));
    const subtotal = details.reduce((sum, d) => sum + d.amount, 0);
    const tax = Math.floor(subtotal * 0.1);
    const total = subtotal + tax;

    return {
        header: {
            invoice_no: '2610-042',
            invoice_date: '2026-10-24',
            closing_date: '月末',
            billing_from: '2026-10-24',
            billing_to: '2026-10-24',
            customer_code: opts.customerCode || 'C001',
            customer_name: opts.customerName || 'テスト法人',
            customer_postal: '〒630-0000',
            customer_address: '奈良県奈良市テスト町1-2-3',
            general_client_name: opts.generalClientName || 'ayanasu',
        },
        summary: {
            subtotal,
            tax,
            total,
            currentBillingAmount: total,
            carryOver: 0,
            paymentAmount: 0,
        },
        details,
    };
};

const expectedCorporatePages = (count) => {
    const first = 17;
    const next = 27;

    if (count <= first) {
        return { pages: 1, slots: [first], filled: [count] };
    }

    const remain = count - first;
    const nextPages = Math.ceil(remain / next);
    const slots = [first];
    const filled = [first];
    let left = remain;

    for (let i = 0; i < nextPages; i += 1) {
        const take = Math.min(next, left);
        slots.push(next);
        filled.push(take);
        left -= take;
    }

    return { pages: slots.length, slots, filled };
};

const expectedGeneralPages = (count) => {
    const first = 10;
    const next = 14;

    if (count <= first) {
        return { pages: 1, slots: [first], filled: [count] };
    }

    const remain = count - first;
    const nextPages = Math.ceil(remain / next);
    const slots = [first];
    const filled = [first];
    let left = remain;

    for (let i = 0; i < nextPages; i += 1) {
        const take = Math.min(next, left);
        slots.push(next);
        filled.push(take);
        left -= take;
    }

    return { pages: slots.length, slots, filled };
};

const analyzeHtml = (html) => {
    const pageMatches = [...html.matchAll(/<div class="([^"]*\bpage\b[^"]*)">/g)];
    const pages = pageMatches.map((m) => m[1]);
    const pageChunks = html.split(/<div class="[^"]*\bpage\b[^"]*">/).slice(1);

    const pageStats = pageChunks.map((chunk, index) => {
        const primaryFilled = (chunk.match(/detail-row--primary(?! detail-row--empty)/g) || []).length;
        const primaryEmpty = (chunk.match(/detail-row--primary detail-row--empty/g) || []).length;
        const primaryTotal = (chunk.match(/detail-row--primary/g) || []).length;

        return {
            index: index + 1,
            className: pages[index] || '',
            isFirst: (pages[index] || '').includes('page--invoice-first'),
            isLast: (pages[index] || '').includes('page--invoice-last'),
            primaryFilled,
            primaryEmpty,
            primaryTotal,
            hasFooter: chunk.includes('invoice-page1-footer-table'),
            hasBillingMeta: chunk.includes('invoice-billing-meta'),
            hasOverview: chunk.includes('invoice-amount-overview'),
            amountTexts: {
                subtotal: /税抜合計<\/th>\s*<td class="num invoice-page1-totals__value">([^<]*)</.exec(chunk)?.[1] || null,
                tax: /消費税（10％）<\/th>\s*<td class="num invoice-page1-totals__value">([^<]*)</.exec(chunk)?.[1] || null,
                total: /税込合計<\/th>\s*<td class="num invoice-page1-totals__value">([^<]*)</.exec(chunk)?.[1] || null,
            },
        };
    });

    return {
        pageCount: pageStats.length,
        pageStats,
        footerCount: (html.match(/invoice-page1-footer-table/g) || []).length,
    };
};

const wrapPreviewHtml = (bodyHtml) => {
    const styleBlock = `<style>\n${PRINT_CSS}\n</style>\n`
        + '<style>html,body{margin:0;background:#ddd;} .buttons{display:none!important;}</style>\n';

    if (bodyHtml.includes('</head>')) {
        return bodyHtml.replace('</head>', `${styleBlock}</head>`);
    }

    return bodyHtml;
};

const buildSelfMeasureHtml = (docHtml) => {
    const injected = `
<script>
(function () {
  function measure() {
    var pages = Array.prototype.slice.call(document.querySelectorAll('.page'));
    var results = pages.map(function (page, i) {
      var footer = page.querySelector('.invoice-page1-footer-table');
      var pageRect = page.getBoundingClientRect();
      var contentBottom = 0;
      Array.prototype.forEach.call(page.children, function (child) {
        var r = child.getBoundingClientRect();
        contentBottom = Math.max(contentBottom, r.bottom);
      });
      var overflowPx = contentBottom - (pageRect.top + pageRect.height);
      var clipped = page.scrollHeight > page.clientHeight + 1;
      return {
        page: i + 1,
        pageHeightPx: Math.round(pageRect.height),
        scrollHeightPx: page.scrollHeight,
        clientHeightPx: page.clientHeight,
        overflowPx: Math.round(overflowPx),
        clipped: clipped,
        hasFooter: !!footer,
        detailRows: page.querySelectorAll('tbody .detail-row--primary').length,
        emptyRows: page.querySelectorAll('tbody .detail-row--primary.detail-row--empty').length
      };
    });
    var pre = document.createElement('pre');
    pre.id = 'measure-json';
    pre.textContent = JSON.stringify(results);
    document.body.appendChild(pre);
  }
  if (document.readyState === 'complete') measure();
  else window.addEventListener('load', measure);
})();
</script>`;

    if (docHtml.includes('</body>')) {
        return docHtml.replace('</body>', `${injected}\n</body>`);
    }

    return `${docHtml}\n${injected}`;
};

const decodeHtmlEntities = (raw) => raw
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const measureWithChrome = (htmlPath) => {
    const dump = spawnSync(
        'google-chrome',
        [
            '--headless=new',
            '--disable-gpu',
            '--no-sandbox',
            '--disable-dev-shm-usage',
            '--virtual-time-budget=3000',
            '--timeout=15000',
            '--dump-dom',
            `file://${htmlPath}`,
        ],
        {
            encoding: 'utf8',
            maxBuffer: 30 * 1024 * 1024,
            timeout: 20000,
            killSignal: 'SIGKILL',
        }
    );

    if (dump.error) {
        return { error: String(dump.error) };
    }

    if (dump.status !== 0 && !dump.stdout) {
        return { error: dump.stderr || `chrome exit ${dump.status}` };
    }

    const match = dump.stdout.match(/<pre id="measure-json">([\s\S]*?)<\/pre>/);
    if (!match) {
        return { error: 'measure-json not found', stderr: (dump.stderr || '').slice(0, 300) };
    }

    try {
        return { pages: JSON.parse(decodeHtmlEntities(match[1])) };
    } catch (e) {
        return { error: `json parse failed: ${e.message}` };
    }
};

const formatMoney = (n) => Number(n).toLocaleString('en-US');

const assertCase = (label, analysis, expected, data) => {
    const errors = [];

    if (analysis.pageCount !== expected.pages) {
        errors.push(`pages ${analysis.pageCount} != ${expected.pages}`);
    }

    analysis.pageStats.forEach((page, i) => {
        const slot = expected.slots[i];
        if (page.primaryTotal !== slot) {
            errors.push(`page${page.index} rows ${page.primaryTotal} != ${slot}`);
        }
        if (page.primaryFilled !== expected.filled[i]) {
            errors.push(`page${page.index} filled ${page.primaryFilled} != ${expected.filled[i]}`);
        }
        if (page.primaryEmpty !== slot - expected.filled[i]) {
            errors.push(`page${page.index} empty ${page.primaryEmpty} != ${slot - expected.filled[i]}`);
        }
    });

    if (analysis.footerCount !== 1) {
        errors.push(`footerCount ${analysis.footerCount} != 1`);
    }

    const first = analysis.pageStats[0];
    if (!first?.hasFooter) {
        errors.push('page1 missing footer (振込先)');
    }

    analysis.pageStats.slice(1).forEach((page) => {
        if (page.hasFooter) {
            errors.push(`page${page.index} has footer (should be page1 only)`);
        }
    });

    if (!first?.hasBillingMeta || !first?.hasOverview) {
        errors.push('page1 missing billing meta/overview');
    }

    analysis.pageStats.slice(1).forEach((page) => {
        if (page.hasBillingMeta || page.hasOverview) {
            errors.push(`page${page.index} unexpectedly has meta/overview`);
        }
    });

    if (first?.hasFooter) {
        const expectedTotal = formatMoney(data.summary.total);
        const expectedSub = formatMoney(data.summary.subtotal);
        const expectedTax = formatMoney(data.summary.tax);
        if (first.amountTexts.total !== expectedTotal) {
            errors.push(`total ${first.amountTexts.total} != ${expectedTotal}`);
        }
        if (first.amountTexts.subtotal !== expectedSub) {
            errors.push(`subtotal ${first.amountTexts.subtotal} != ${expectedSub}`);
        }
        if (first.amountTexts.tax !== expectedTax) {
            errors.push(`tax ${first.amountTexts.tax} != ${expectedTax}`);
        }
    }

    return { label, ok: errors.length === 0, errors, analysis, expected };
};

const main = () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const sandbox = loadBrowserScripts();
    const template = sandbox.window.InvoiceTemplate;

    if (!template || typeof template.render !== 'function') {
        throw new Error('InvoiceTemplate.render unavailable');
    }

    const results = [];
    const measureAll = process.argv.includes('--measure');

    const runMode = (mode) => {
        const isGeneral = mode === 'general';
        const layout = {
            reportType: 'invoice',
            pageClass: 'report-invoice',
            recipientMode: isGeneral ? 'general' : undefined,
            carryOverMode: 'none',
        };

        COUNTS.forEach((count) => {
            const data = makeData(count, {
                customerCode: isGeneral ? 'A550' : 'C001',
                customerName: isGeneral ? 'ayanasu' : 'テスト法人',
                generalClientName: 'ayanasu',
            });
            const html = template.render(data, {}, layout);
            const analysis = analyzeHtml(html);
            const expected = isGeneral
                ? expectedGeneralPages(count)
                : expectedCorporatePages(count);
            const verdict = assertCase(`${mode}:${count}`, analysis, expected, data);

            const base = `${mode}_${String(count).padStart(2, '0')}`;
            const preview = wrapPreviewHtml(html);
            fs.writeFileSync(path.join(OUT_DIR, `${base}.html`), preview);

            if (measureAll) {
                const measurePath = path.join(OUT_DIR, `${base}_measure.html`);
                fs.writeFileSync(measurePath, buildSelfMeasureHtml(preview));
                const measure = measureWithChrome(measurePath);
                verdict.measure = measure;
                if (measure.pages) {
                    const clipped = measure.pages.filter((p) => p.clipped || p.overflowPx > 1);
                    verdict.fitOk = clipped.length === 0;
                    verdict.clippedPages = clipped;
                } else {
                    verdict.fitOk = null;
                    verdict.measureError = measure.error;
                }
            }

            results.push(verdict);
            const mark = verdict.ok ? 'PASS' : 'FAIL';
            const fit = !measureAll
                ? 'SKIP'
                : verdict.fitOk === true
                    ? 'FIT'
                    : verdict.fitOk === false
                        ? 'OVERFLOW'
                        : 'FIT?';
            console.log(`[${mark}/${fit}] ${verdict.label} pages=${analysis.pageCount} footer=${analysis.footerCount}`
                + (verdict.errors.length ? ` :: ${verdict.errors.join('; ')}` : ''));
            if (verdict.clippedPages?.length) {
                console.log(`  overflow detail: ${JSON.stringify(verdict.clippedPages)}`);
            }
        });
    };

    runMode('corporate');
    runMode('general');

    const summaryPath = path.join(OUT_DIR, 'summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));

    const failed = results.filter((r) => !r.ok);
    console.log('\n=== SUMMARY ===');
    console.log(`logic: ${results.length - failed.length}/${results.length} passed`);
    if (measureAll) {
        const measured = results.filter((r) => r.fitOk !== null && r.fitOk !== undefined);
        console.log(`fit:   ${results.filter((r) => r.fitOk).length}/${measured.length} no-overflow`);
    }
    console.log(`wrote: ${summaryPath}`);

    if (failed.length || results.some((r) => r.fitOk === false)) {
        process.exitCode = 1;
    }
};

main();
