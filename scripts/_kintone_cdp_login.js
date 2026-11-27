'use strict';

/**
 * CDP Chrome で kintone にログイン
 * 環境変数: KINTONE_USERNAME / KINTONE_PASSWORD
 *   CDP_PORT=9399 node scripts/_kintone_cdp_login.js
 */

const http = require('http');
const WebSocket = require('ws');

const SUB = process.env.KINTONE_SUBDOMAIN || 'o5nppg7kb4ly';
const USER = process.env.KINTONE_USERNAME || '';
const PASS = process.env.KINTONE_PASSWORD || '';
const CDP_PORT = Number(process.env.CDP_PORT || 9399);

if (!USER || !PASS) {
  console.error('NEED_SECRETS: set KINTONE_USERNAME and KINTONE_PASSWORD');
  process.exit(2);
}

const httpJson = (p, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: CDP_PORT, path: p, method }, (res) => {
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

(async () => {
  const page = await httpJson(
    '/json/new?' + encodeURIComponent(`https://${SUB}.cybozu.com/login`),
    'PUT'
  );
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.on('open', res);
    ws.on('error', rej);
  });
  let id = 1;
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = id++;
      const t = setTimeout(() => rej(new Error('timeout ' + method)), 120000);
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
  await new Promise((r) => setTimeout(r, 1500));

  const filled = await send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const user = ${JSON.stringify(USER)};
      const pass = ${JSON.stringify(PASS)};
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 40; i++) {
        const u = document.querySelector('input[name="username"], input[type="email"], input#username, input[name="login-name"]');
        const p = document.querySelector('input[type="password"], input[name="password"]');
        if (u && p) {
          u.focus();
          u.value = '';
          u.dispatchEvent(new Event('input', { bubbles: true }));
          u.value = user;
          u.dispatchEvent(new Event('input', { bubbles: true }));
          u.dispatchEvent(new Event('change', { bubbles: true }));
          p.focus();
          p.value = '';
          p.dispatchEvent(new Event('input', { bubbles: true }));
          p.value = pass;
          p.dispatchEvent(new Event('input', { bubbles: true }));
          p.dispatchEvent(new Event('change', { bubbles: true }));
          const btn = document.querySelector('input[type="submit"], button[type="submit"], .login-button, button.gaia-ui-actionmenu-action');
          if (btn) btn.click();
          else p.form && p.form.submit();
          break;
        }
        await wait(250);
      }
      for (let i = 0; i < 60; i++) {
        await wait(500);
        if (!/login/i.test(location.href) && typeof kintone !== 'undefined') {
          return { ok: true, url: location.href };
        }
        if (!/login/i.test(location.href) && location.pathname.indexOf('/k') === 0) {
          return { ok: true, url: location.href, hasK: typeof kintone !== 'undefined' };
        }
      }
      return { ok: false, url: location.href, title: document.title };
    })()`,
  });

  const v = filled.result && filled.result.value;
  console.log(JSON.stringify(v, null, 2));
  if (!v || !v.ok) process.exit(1);

  await send('Page.navigate', { url: `https://${SUB}.cybozu.com/k/19/` });
  await new Promise((r) => setTimeout(r, 3000));
  const check = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `({url:location.href,hasK:typeof kintone!=='undefined',login:!!document.querySelector('input[type=password]')})`,
  });
  console.log('after nav', JSON.stringify(check.result && check.result.value));
  if (check.result && check.result.value && check.result.value.login) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
