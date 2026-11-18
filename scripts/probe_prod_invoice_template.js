#!/usr/bin/env node
'use strict';

const http = require('http');
const WebSocket = require('ws');

const httpJson = (p, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 9222, path: p, method }, (res) => {
        let d = '';
        res.on('data', (c) => { d += c; });
        res.on('end', () => {
            try { resolve(JSON.parse(d || 'null')); }
            catch (e) { resolve(d); }
        });
    });
    req.on('error', reject);
    req.end();
});

const connect = (wsUrl) => new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 1;
    const pending = new Map();
    ws.on('open', () => resolve({
        ws,
        send: (method, params = {}) => new Promise((res, rej) => {
            const i = id;
            id += 1;
            const timer = setTimeout(() => {
                pending.delete(i);
                rej(new Error(`timeout ${method}`));
            }, 20000);
            pending.set(i, {
                res: (v) => { clearTimeout(timer); res(v); },
                rej: (e) => { clearTimeout(timer); rej(e); },
            });
            ws.send(JSON.stringify({ id: i, method, params }));
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

(async () => {
    const list = await httpJson('/json/list');
    let page = (list || []).find((t) => t.type === 'page' && /\/k\/35\//.test(t.url || ''));
    if (!page) {
        page = await httpJson(`/json/new?${encodeURIComponent('https://o5nppg7kb4ly.cybozu.com/k/35/show#record=192')}`, 'PUT');
    }
    const session = await connect(page.webSocketDebuggerUrl);
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Page.navigate', { url: 'https://o5nppg7kb4ly.cybozu.com/k/35/show#record=192' });
    await new Promise((r) => setTimeout(r, 4000));

    const result = await session.send('Runtime.evaluate', {
        awaitPromise: true,
        returnByValue: true,
        expression: `(() => {
  const scripts = Array.from(document.querySelectorAll('script[src*="plugin/content/download"]'))
    .map((s) => s.src);
  const invoiceSrc = scripts.find((s) => /contentId=/.test(s)) || null;
  return (async () => {
    let found = null;
    for (const src of scripts) {
      const text = await (await fetch(src, { credentials: 'include', cache: 'no-store' })).text();
      if (text.includes('INVOICE_TEMPLATE_VERSION')) {
        found = {
          src: src.replace(/^https:\\/\\/[^/]+/, ''),
          ver: (text.match(/INVOICE_TEMPLATE_VERSION\\s*=\\s*'(\\d+)'/) || [])[1] || null,
          first: (text.match(/DETAILS_PER_PAGE_FIRST\\s*=\\s*(\\d+)/) || [])[1] || null,
          next: (text.match(/DETAILS_PER_PAGE_NEXT\\s*=\\s*(\\d+)/) || [])[1] || null,
          lastPageFooter: text.includes('isLastPage ? buildPage1FooterHtml'),
          page1Footer: /isPage1 \\? buildPage1FooterHtml/.test(text),
        };
        break;
      }
    }
    let render = null;
    if (typeof InvoiceTemplate !== 'undefined') {
      const html = InvoiceTemplate.render({
        header: {
          invoice_no: 'T', invoice_date: '2026-10-24', customer_code: 'C001',
          customer_name: 'テスト法人', customer_postal: '', customer_address: '',
        },
        summary: { subtotal: 100, tax: 10, total: 110, currentBillingAmount: 110 },
        details: Array.from({ length: 5 }, (_, i) => ({
          delivery_date: '2026-10-24', delivery_no: 'N' + i, client_name: 'x',
          manage_no: String(i), item_name: 'a', kimono_type: '', kimono_spec: '',
          slip_no: '', in_charge: '', unit_price: 1, qty: 1, amount: 1,
        })),
      }, {}, { reportType: 'invoice', pageClass: 'report-invoice', carryOverMode: 'none' });
      render = {
        primaryTotal: (html.match(/detail-row--primary/g) || []).length,
        emptyRows: (html.match(/detail-row--primary detail-row--empty/g) || []).length,
        footerCount: (html.match(/invoice-page1-footer-table/g) || []).length,
        hasLastClass: /page--invoice-last/.test(html),
      };
    }
    return {
      scriptCount: scripts.length,
      found,
      render,
      hasInvoiceTemplate: typeof InvoiceTemplate !== 'undefined',
    };
  })();
})()`,
    });

    console.log(JSON.stringify(result.result.value, null, 2));
    session.ws.close();
})().catch((e) => {
    console.error(e);
    process.exit(1);
});
