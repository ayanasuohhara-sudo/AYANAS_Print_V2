#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const OUT_DIR = path.resolve(__dirname, '../customize/backups/invoice_print_20261026/test_out');
const CDP_HOST = '127.0.0.1';
const CDP_PORT = 9222;

const httpJson = (urlPath, method = 'GET', body) => new Promise((resolve, reject) => {
    const req = http.request({
        host: CDP_HOST,
        port: CDP_PORT,
        path: urlPath,
        method,
        headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : undefined,
    }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
            try {
                resolve(JSON.parse(data || 'null'));
            } catch (e) {
                reject(new Error(`JSON parse ${urlPath}: ${e.message}; body=${data.slice(0, 200)}`));
            }
        });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
});

const connect = (wsUrl) => new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();

    ws.on('open', () => resolve({
        ws,
        send: (method, params = {}) => new Promise((res, rej) => {
            const id = nextId;
            nextId += 1;
            pending.set(id, { res, rej });
            ws.send(JSON.stringify({ id, method, params }));
        }),
    }));
    ws.on('error', reject);
    ws.on('message', (raw) => {
        const msg = JSON.parse(String(raw));
        if (msg.id && pending.has(msg.id)) {
            const { res, rej } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) rej(new Error(JSON.stringify(msg.error)));
            else res(msg.result);
        }
    });
});

const MEASURE_FN = `(() => {
  const pages = Array.from(document.querySelectorAll('.page'));
  return pages.map((page, i) => {
    const footer = page.querySelector('.invoice-page1-footer-table');
    const pageRect = page.getBoundingClientRect();
    let contentBottom = 0;
    Array.from(page.children).forEach((child) => {
      const r = child.getBoundingClientRect();
      contentBottom = Math.max(contentBottom, r.bottom);
    });
    const overflowPx = contentBottom - (pageRect.top + pageRect.height);
    const clipped = page.scrollHeight > page.clientHeight + 1;
    return {
      page: i + 1,
      pageHeightPx: Math.round(pageRect.height),
      scrollHeightPx: page.scrollHeight,
      clientHeightPx: page.clientHeight,
      overflowPx: Math.round(overflowPx),
      clipped,
      hasFooter: !!footer,
      detailRows: page.querySelectorAll('tbody .detail-row--primary').length,
      emptyRows: page.querySelectorAll('tbody .detail-row--primary.detail-row--empty').length,
      className: page.className,
    };
  });
})()`;

const measureFile = async (htmlPath) => {
    const fileUrl = `file://${htmlPath}`;
    const target = await httpJson('/json/new?' + encodeURIComponent(fileUrl), 'PUT');
    if (!target?.webSocketDebuggerUrl) {
        throw new Error(`failed to open target for ${htmlPath}: ${JSON.stringify(target)}`);
    }

    const session = await connect(target.webSocketDebuggerUrl);
    try {
        await session.send('Page.enable');
        await session.send('Runtime.enable');

        // Wait for load
        await new Promise((resolve) => {
            const timer = setTimeout(resolve, 1500);
            session.ws.on('message', (raw) => {
                const msg = JSON.parse(String(raw));
                if (msg.method === 'Page.loadEventFired') {
                    clearTimeout(timer);
                    setTimeout(resolve, 200);
                }
            });
        });

        const result = await session.send('Runtime.evaluate', {
            expression: MEASURE_FN,
            returnByValue: true,
            awaitPromise: false,
        });

        return result?.result?.value || null;
    } finally {
        try {
            session.ws.close();
        } catch (_) { /* ignore */ }
        try {
            await httpJson(`/json/close/${target.id}`, 'GET');
        } catch (_) { /* ignore */ }
    }
};

const main = async () => {
    const files = fs.readdirSync(OUT_DIR)
        .filter((f) => f.endsWith('.html') && !f.includes('_measure'))
        .sort();

    const report = [];

    for (const file of files) {
        const full = path.join(OUT_DIR, file);
        process.stdout.write(`measure ${file} ... `);
        try {
            const pages = await measureFile(full);
            const clipped = (pages || []).filter((p) => p.clipped || p.overflowPx > 1);
            const ok = clipped.length === 0;
            console.log(ok ? 'FIT' : 'OVERFLOW');
            if (!ok) {
                console.log(JSON.stringify(clipped, null, 2));
            }
            report.push({ file, ok, pages, clipped });
        } catch (e) {
            console.log('ERROR ' + e.message);
            report.push({ file, ok: false, error: e.message });
        }
    }

    const out = path.join(OUT_DIR, 'fit_report.json');
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`\nwrote ${out}`);
    const failed = report.filter((r) => !r.ok);
    if (failed.length) process.exitCode = 1;
};

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
