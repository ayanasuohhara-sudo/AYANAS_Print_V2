#!/usr/bin/env node
'use strict';

/**
 * Invoice template paging smoke test (v63: v59 base + slot-aware padding).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'customize/backups/invoice_print_20261026_final/test_out');
const PRINT_CSS = fs.readFileSync(path.join(ROOT, 'css/print.css'), 'utf8');

const COUNTS = [1, 5, 15, 30, 50];

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

const makeDetail = (index, overrides = {}) => ({
    delivery_date: '2026-10-24',
    delivery_no: `N10261024-${600 + index}`,
    client_name: overrides.client_name || `お客様${index}`,
    manage_no: String(1000 + index),
    item_name: overrides.item_name || '丸洗い',
    kimono_type: '着物',
    kimono_spec: '袷',
    slip_no: overrides.slip_no || '中袖 赤',
    in_charge: '山田',
    unit_price: 4300,
    qty: 1,
    amount: 4300,
    ...overrides,
});

const makeData = (count, opts = {}) => {
    const details = Array.from({ length: count }, (_, i) => makeDetail(i + 1, opts.detailOverrides));
    if (opts.longNameAt === 0 || opts.longNameAt) {
        const idx = opts.longNameAt;
        if (details[idx]) {
            details[idx].client_name = 'あ'.repeat(opts.longNameLen || 40);
        }
    }
    if (opts.longItemAt === 0 || opts.longItemAt) {
        const idx = opts.longItemAt;
        if (details[idx]) {
            details[idx].item_name = '加工'.repeat(opts.longItemLen || 25);
        }
    }
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
            customer_address: opts.customerAddress || '奈良県奈良市テスト町1-2-3',
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

const analyzeHtml = (html) => {
    const pageMatches = [...html.matchAll(/<div class="([^"]*\bpage\b[^"]*)">/g)];
    const pages = pageMatches.map((m) => m[1]);
    const pageChunks = html.split(/<div class="[^"]*\bpage\b[^"]*">/).slice(1);

    const pageStats = pageChunks.map((chunk, index) => {
        const primaryFilled = (chunk.match(/detail-row--primary(?! detail-row--empty)/g) || []).length;
        const primaryEmpty = (chunk.match(/detail-row--primary detail-row--empty/g) || []).length;
        const primaryTotal = (chunk.match(/detail-row--primary/g) || []).length;
        const wrap2 = (chunk.match(/detail-row--wrap-2/g) || []).length;
        const wrap3 = (chunk.match(/detail-row--wrap-3/g) || []).length;

        return {
            index: index + 1,
            className: pages[index] || '',
            isFirst: (pages[index] || '').includes('page--invoice-first'),
            primaryFilled,
            primaryEmpty,
            primaryTotal,
            wrap2,
            wrap3,
            hasFooter: chunk.includes('invoice-page1-footer-table'),
            hasBillingMeta: chunk.includes('invoice-billing-meta'),
            hasOverview: chunk.includes('invoice-amount-overview'),
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
        + '<style>html,body{margin:0;background:#ddd;}</style>\n';

    if (bodyHtml.includes('</head>')) {
        return bodyHtml.replace('</head>', `${styleBlock}</head>`);
    }

    return bodyHtml;
};

const expectedCorporatePagesForNormal = (count) => {
    // normal details = 1 slot; first=16, next=20 (delivery-like density)
    if (count <= 16) {
        return { pages: 1, firstSlots: 16, filledFirst: count };
    }
    const remain = count - 16;
    const nextPages = Math.ceil(remain / 20);
    return {
        pages: 1 + nextPages,
        firstSlots: 16,
        filledFirst: 16,
        nextSlots: 20,
    };
};

const assertCorporateNormal = (label, analysis, count) => {
    const errors = [];
    const expected = expectedCorporatePagesForNormal(count);

    if (analysis.pageCount !== expected.pages) {
        errors.push(`pages ${analysis.pageCount} != ${expected.pages}`);
    }

    const first = analysis.pageStats[0];
    if (!first?.hasFooter) errors.push('page1 missing footer');
    if (!first?.hasBillingMeta || !first?.hasOverview) errors.push('page1 missing meta/overview');
    if (analysis.footerCount !== 1) errors.push(`footerCount ${analysis.footerCount} != 1`);

    analysis.pageStats.slice(1).forEach((page) => {
        if (page.hasFooter) errors.push(`page${page.index} has footer`);
        if (page.hasBillingMeta || page.hasOverview) errors.push(`page${page.index} has meta`);
    });

    if (first.primaryFilled !== Math.min(count, 16)) {
        errors.push(`page1 filled ${first.primaryFilled} != ${Math.min(count, 16)}`);
    }

    // blank rows present when short
    if (count < 16 && first.primaryEmpty < 1) {
        errors.push('page1 expected blank ruled rows');
    }

    // no blank-only pages
    analysis.pageStats.forEach((page) => {
        if (page.primaryFilled === 0 && analysis.pageCount > 1) {
            errors.push(`page${page.index} is blank-only`);
        }
    });

    return { label, ok: errors.length === 0, errors, analysis };
};

const main = () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const sandbox = loadBrowserScripts();
    const template = sandbox.window.InvoiceTemplate;
    const results = [];

    const run = (name, data, layout, assertFn) => {
        const html = template.render(data, {}, layout);
        const analysis = analyzeHtml(html);
        const verdict = assertFn(name, analysis, data);
        fs.writeFileSync(path.join(OUT_DIR, `${name}.html`), wrapPreviewHtml(html));
        results.push(verdict);
        console.log(`[${verdict.ok ? 'PASS' : 'FAIL'}] ${name} pages=${analysis.pageCount}`
            + (verdict.errors.length ? ` :: ${verdict.errors.join('; ')}` : ''));
    };

    const corpLayout = {
        reportType: 'invoice',
        pageClass: 'report-invoice',
        carryOverMode: 'none',
    };
    const generalLayout = {
        reportType: 'invoice',
        pageClass: 'report-invoice',
        recipientMode: 'general',
        carryOverMode: 'none',
    };

    COUNTS.forEach((count) => {
        run(
            `corporate_${String(count).padStart(2, '0')}`,
            makeData(count),
            corpLayout,
            (label, analysis) => assertCorporateNormal(label, analysis, count)
        );
    });

    // long client name / item (multi-slot) should wrap and may change blank count
    run(
        'corporate_long_name',
        makeData(5, { longNameAt: 0, longNameLen: 40 }),
        corpLayout,
        (label, analysis) => {
            const errors = [];
            if (analysis.pageCount !== 1) errors.push(`pages ${analysis.pageCount} != 1`);
            if (!analysis.pageStats[0]?.hasFooter) errors.push('missing footer');
            if ((analysis.pageStats[0]?.wrap2 || 0) + (analysis.pageStats[0]?.wrap3 || 0) < 1) {
                errors.push('expected wrap class on long name');
            }
            // still one page, with blanks reduced vs 17-5=12
            if (analysis.pageStats[0].primaryFilled !== 5) errors.push('filled != 5');
            return { label, ok: errors.length === 0, errors, analysis };
        }
    );

    run(
        'corporate_long_item',
        makeData(5, { longItemAt: 0, longItemLen: 30 }),
        corpLayout,
        (label, analysis) => {
            const errors = [];
            if (analysis.pageCount !== 1) errors.push(`pages ${analysis.pageCount} != 1`);
            if ((analysis.pageStats[0]?.wrap2 || 0) + (analysis.pageStats[0]?.wrap3 || 0) < 1) {
                errors.push('expected wrap class on long item');
            }
            return { label, ok: errors.length === 0, errors, analysis };
        }
    );

    // multi-page with long rows: ensure no item split (each filled row is whole pair)
    run(
        'corporate_30_mixed_long',
        (() => {
            const data = makeData(30);
            data.details[0].client_name = 'あ'.repeat(40);
            data.details[10].item_name = '加工内容がとても長い明細'.repeat(4);
            return data;
        })(),
        corpLayout,
        (label, analysis) => {
            const errors = [];
            if (analysis.pageCount < 2) errors.push('expected multi-page');
            if (analysis.footerCount !== 1) errors.push('footer != 1');
            if (!analysis.pageStats[0]?.hasFooter) errors.push('footer not on page1');
            analysis.pageStats.forEach((page) => {
                if (page.primaryFilled === 0) errors.push(`blank-only page ${page.index}`);
            });
            return { label, ok: errors.length === 0, errors, analysis };
        }
    );

    // general A550
    [1, 5, 15, 30].forEach((count) => {
        run(
            `general_${String(count).padStart(2, '0')}`,
            makeData(count, { customerCode: 'A550', customerName: 'ayanasu', generalClientName: 'ayanasu' }),
            generalLayout,
            (label, analysis) => {
                const errors = [];
                const firstCap = 9;
                const nextCap = 12;
                let expectedPages = 1;
                if (count > firstCap) {
                    expectedPages = 1 + Math.ceil((count - firstCap) / nextCap);
                }
                if (analysis.pageCount !== expectedPages) {
                    errors.push(`pages ${analysis.pageCount} != ${expectedPages}`);
                }
                if (!analysis.pageStats[0]?.hasFooter) errors.push('page1 missing footer');
                if (analysis.footerCount !== 1) errors.push(`footerCount ${analysis.footerCount}`);
                return { label, ok: errors.length === 0, errors, analysis };
            }
        );
    });

    // zero details
    run(
        'corporate_00',
        makeData(0),
        corpLayout,
        (label, analysis) => {
            const errors = [];
            if (analysis.pageCount !== 1) errors.push('expected 1 page');
            if (analysis.pageStats[0].primaryEmpty < 1) errors.push('expected blank table');
            if (!analysis.pageStats[0].hasFooter) errors.push('missing footer');
            return { label, ok: errors.length === 0, errors, analysis };
        }
    );

    fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(results, null, 2));
    const failed = results.filter((r) => !r.ok);
    console.log(`\n=== SUMMARY ${results.length - failed.length}/${results.length} passed ===`);
    if (failed.length) process.exitCode = 1;
};

main();
