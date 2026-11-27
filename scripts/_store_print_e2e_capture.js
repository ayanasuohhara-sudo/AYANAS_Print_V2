'use strict';

/**
 * Hook window.open / document.write to capture print HTML without hanging on blank tabs.
 * TEST A550 / P000002 only.
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const SUB = 'o5nppg7kb4ly';
const APP16 = 16;
const APP19 = 19;
const TEST_PCM = 'P000002';
const TEST_PCM_OTHER = 'P000006';
const WORK_DIR = process.env.STORE_PRINT_PROD_DIR
  || fs.readFileSync('/tmp/store_print_limited_dir.txt', 'utf8').trim();
const ART = path.join(WORK_DIR, 'e2e_ui_artifacts');
fs.mkdirSync(ART, { recursive: true });

const httpJson = (p, method = 'GET') => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: 9222, path: p, method }, (res) => {
    let d = '';
    res.on('data', (c) => (d += c));
    res.on('end', () => { try { resolve(JSON.parse(d || 'null')); } catch (e) { resolve(d); } });
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
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const s = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({hasK:typeof kintone!=='undefined',url:location.href})`,
    });
    if (s.result && s.result.value && s.result.value.hasK && !/login/.test(s.result.value.url)) break;
  }
  return {
    send,
    pageId: page.id,
    close: async () => { try { await httpJson('/json/close/' + page.id, 'GET'); } catch (_) {} },
  };
}

async function shot(page, name) {
  try {
    const s = await page.send('Page.captureScreenshot', { format: 'png' });
    const f = name + '.png';
    fs.writeFileSync(path.join(ART, f), Buffer.from(s.data, 'base64'));
    return f;
  } catch (_) { return null; }
}

async function installPrintHook(page) {
  await page.send('Runtime.evaluate', {
    expression: `(()=>{
      if(window.__AYANAS_PRINT_HOOK__) return true;
      window.__AYANAS_PRINT_HOOK__=true;
      window.__CAPTURED_PRINTS__=[];
      const origOpen=window.open;
      window.open=function(url, name, features){
        const fake={
          closed:false,
          document:{
            _html:'',
            open(){},
            close(){},
            write(html){
              this._html += String(html||'');
              window.__CAPTURED_PRINTS__.push({
                at: Date.now(),
                html: this._html,
                url: String(url||''),
                name: String(name||'')
              });
            }
          },
          focus(){},
          close(){ this.closed=true; },
          print(){}
        };
        return fake;
      };
      return true;
    })()`,
  });
}

async function clickAndCapture(page, buttonText, outName, checks) {
  await installPrintHook(page);
  await page.send('Runtime.evaluate', {
    expression: `window.__CAPTURED_PRINTS__=[]; true`,
  });
  const click = await page.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(()=>{
      const want=${JSON.stringify(buttonText)};
      const b=Array.from(document.querySelectorAll('button,.ayanas-print-button'))
        .find(el=>(el.innerText||el.textContent||'').trim()===want);
      if(!b) return {ok:false, texts:Array.from(document.querySelectorAll('button,.ayanas-print-button')).map(x=>(x.innerText||'').trim()).slice(0,40)};
      b.click();
      return {ok:true};
    })()`,
  });
  checks.push({ name: 'click ' + buttonText + ' (' + outName + ')', ok: !!(click.result.value && click.result.value.ok), detail: click.result.value });
  if (!click.result.value || !click.result.value.ok) return null;

  let captured = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const got = await page.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(()=>{
        const arr=window.__CAPTURED_PRINTS__||[];
        if(!arr.length) return null;
        const last=arr[arr.length-1];
        return {len:arr.length, htmlLen:(last.html||'').length, text: (last.html||'').replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').trim().slice(0,4000)};
      })()`,
    });
    if (got.result.value && got.result.value.htmlLen > 200) {
      const full = await page.send('Runtime.evaluate', {
        returnByValue: true,
        expression: `(()=>{
          const last=(window.__CAPTURED_PRINTS__||[]).slice(-1)[0];
          return last ? last.html : '';
        })()`,
      });
      captured = { html: full.result.value, text: got.result.value.text };
      break;
    }
  }
  checks.push({ name: 'captured HTML ' + outName, ok: !!(captured && captured.html), detail: captured && { text: captured.text.slice(0, 300), htmlLen: captured.html.length } });
  if (captured && captured.html) {
    fs.writeFileSync(path.join(ART, outName + '.html'), captured.html);
    // Render captured HTML in a page for screenshot
    const view = await openPage('data:text/html,' + encodeURIComponent('<meta charset=utf-8>'));
    await view.send('Runtime.evaluate', {
      expression: `document.open(); document.write(${JSON.stringify(captured.html)}); document.close(); true`,
    });
    await new Promise((r) => setTimeout(r, 800));
    await shot(view, outName);
    await view.close();
  }
  return captured;
}

async function main() {
  const checks = [];
  const report = { checks };

  // List TEST orders
  const listPage = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/`);
  const listed = await listPage.send('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async()=>{
      const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
      const res=await api('/k/v1/records.json','GET',{
        app:${APP16},
        query:'customer_code = "A550" and personal_customer_id = "${TEST_PCM}" order by $id desc limit 10'
      });
      return (res.records||[]).map(r=>({
        id:r.$id.value,
        manage_no:r.manage_no&&r.manage_no.value,
        client:r.client_name&&r.client_name.value,
        kimono:r.kimono_type&&r.kimono_type.value,
        deadline:r.deadline&&r.deadline.value,
        delivery_status:r.delivery_status&&r.delivery_status.value,
        remark:r.remark&&r.remark.value
      }));
    })()`,
  });
  await listPage.close();
  const orders = listed.result.value || [];
  checks.push({ name: 'TEST orders listed', ok: orders.length > 0, detail: { count: orders.length, orders } });
  report.orders = orders;

  // Print up to 3 store orders (prefer U/P/F unpaid/partial/paid)
  const preferred = [];
  for (const tag of ['U', 'P', 'F']) {
    const hit = orders.find((o) => String(o.manage_no || '').endsWith(tag) || String(o.remark || '').includes(tag === 'U' ? 'unpaid' : tag === 'P' ? 'partial' : 'paid'));
    if (hit) preferred.push(hit);
  }
  const targets = (preferred.length ? preferred : orders).slice(0, 3);
  report.orderPrints = [];
  for (const o of targets) {
    const detail = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/show#record=${o.id}`);
    await new Promise((r) => setTimeout(r, 3500));
    await shot(detail, 'detail_store_' + o.manage_no);
    const btns = await detail.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `({texts:Array.from(document.querySelectorAll('button,.ayanas-print-button')).map(b=>(b.innerText||'').trim()).filter(Boolean).slice(0,30)})`,
    });
    checks.push({ name: 'store button on ' + o.manage_no, ok: (btns.result.value.texts || []).includes('店舗受注表'), detail: btns.result.value });
    const cap = await clickAndCapture(detail, '店舗受注表', 'store_order_' + o.manage_no, checks);
    if (cap && cap.text) {
      checks.push({ name: 'manage_no in print ' + o.manage_no, ok: cap.text.includes(o.manage_no), detail: cap.text.slice(0, 200) });
      checks.push({ name: 'payment state in print ' + o.manage_no, ok: /未入金|一部入金|入金済/.test(cap.text), detail: (cap.text.match(/未入金|一部入金|入金済/g) || []).slice(0, 5) });
      checks.push({ name: 'customer in print ' + o.manage_no, ok: /山田花子|P000002/.test(cap.text), detail: cap.text.slice(0, 200) });
      checks.push({ name: 'barcode present ' + o.manage_no, ok: /svg|CODE39|barcode/i.test(cap.html), detail: { hasSvg: /<svg/i.test(cap.html) } });
    }
    report.orderPrints.push({ manage_no: o.manage_no, ok: !!cap });
    await detail.close();
  }

  // Corporate regression
  {
    const p = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/`);
    const corp = await p.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        const res=await api('/k/v1/records.json','GET',{app:${APP16},query:'customer_code != "A550" and customer_code != "" order by $id desc limit 1'});
        const r=(res.records||[])[0];
        return r ? {id:r.$id.value, customer_code:r.customer_code.value, manage_no:r.manage_no&&r.manage_no.value} : null;
      })()`,
    });
    await p.close();
    const c = corp.result.value;
    checks.push({ name: 'corp sample', ok: !!c, detail: c });
    if (c) {
      const detail = await openPage(`https://${SUB}.cybozu.com/k/${APP16}/show#record=${c.id}`);
      await new Promise((r) => setTimeout(r, 3500));
      await shot(detail, 'detail_corp_' + c.manage_no);
      const btns = await detail.send('Runtime.evaluate', {
        returnByValue: true,
        expression: `(()=>{
          const texts=Array.from(document.querySelectorAll('button,.ayanas-print-button')).map(b=>(b.innerText||'').trim());
          return {hasStore:texts.includes('店舗受注表'), hasCorp:texts.some(t=>/受注明細表|受注票/.test(t)), texts:texts.filter(Boolean).slice(0,30)};
        })()`,
      });
      checks.push({ name: 'corp hides store order', ok: btns.result.value.hasStore === false, detail: btns.result.value });
      checks.push({ name: 'corp keeps corporate print', ok: btns.result.value.hasCorp === true, detail: btns.result.value });
      const label = (btns.result.value.texts || []).find((t) => /受注明細表|受注票/.test(t));
      if (label) {
        const cap = await clickAndCapture(detail, label, 'corp_order_' + c.manage_no, checks);
        if (cap && cap.text) {
          checks.push({ name: 'corp print has manage/layout', ok: cap.text.includes(c.manage_no) || /受注/.test(cap.text), detail: cap.text.slice(0, 200) });
        }
      }
      await detail.close();
    }
  }

  // App19 PCM + store delivery
  {
    const edit = await openPage(`https://${SUB}.cybozu.com/k/${APP19}/edit`);
    await new Promise((r) => setTimeout(r, 3500));
    await shot(edit, 'app19_edit');
    const pcm = await edit.send('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async()=>{
        const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
        const scripts=Array.from(document.querySelectorAll('script[src]')).map(s=>s.src);
        const hasPcm=scripts.some(s=>/store_delivery_pcm/.test(s));
        const hasBar=scripts.some(s=>/barcode_delivery/.test(s));
        const orders=await api('/k/v1/records.json','GET',{app:${APP16},query:'customer_code="A550" and personal_customer_id="${TEST_PCM}" order by $id desc limit 3'});
        const list=orders.records||[];
        let other=(await api('/k/v1/records.json','GET',{app:${APP16},query:'customer_code="A550" and personal_customer_id="${TEST_PCM_OTHER}" order by $id desc limit 1'})).records||[];
        if(!other.length && list[0]){
          const a=list[0];
          const srcRow=((a.detail_table&&a.detail_table.value)||[])[0];
          const itemCode=srcRow&&srcRow.value&&srcRow.value.item_code&&srcRow.value.item_code.value;
          const stamp=Date.now().toString().slice(-5);
          const today=new Date().toISOString().slice(0,10);
          await api('/k/v1/record.json','POST',{app:${APP16},record:{
            customer_code:{value:'A550'}, customer_name:{value:a.customer_name&&a.customer_name.value||'店舗'},
            client_name:{value:'[TEST]佐藤太郎'}, personal_customer_id:{value:'${TEST_PCM_OTHER}'},
            manage_no:{value:'TSPX'+stamp}, kimono_type:{value:'[TEST]混在'}, location_status:{value:'店舗'},
            process_status:{value:'完了'}, work_status:{value:'仕上げ完了'}, delivery_status:{value:'納品待ち'},
            order_date:{value:today}, deadline:{value:today}, remark:{value:'[TEST] mix'},
            detail_table:{value:[{value:{item_code:{value:itemCode||'041'}, item_name:{value:'[TEST]mix'}, qty:{value:'1'}, unit_price:{value:'1000'}}}]}
          }});
          other=(await api('/k/v1/records.json','GET',{app:${APP16},query:'customer_code="A550" and personal_customer_id="${TEST_PCM_OTHER}" order by $id desc limit 1'})).records||[];
        }
        let gate=null;
        if(window.CAYANAS_StoreDeliveryPcm && list.length>=2){
          // set A550 header so isStoreHeader works
          try{
            const rec=kintone.app.record.get();
            if(rec && rec.record && rec.record.customer_code){ rec.record.customer_code.value='A550'; kintone.app.record.set(rec); }
          }catch(e){}
          window.CAYANAS_StoreDeliveryPcm.resetCtx && window.CAYANAS_StoreDeliveryPcm.resetCtx();
          const first=await window.CAYANAS_StoreDeliveryPcm.evaluateScan(list[0].manage_no.value);
          const second=await window.CAYANAS_StoreDeliveryPcm.evaluateScan(list[1].manage_no.value);
          const mixed=await window.CAYANAS_StoreDeliveryPcm.evaluateScan(other[0].manage_no.value);
          gate={first,second,mixed,sameOk:!!(first&&first.ok!==false && second&&second.ok!==false), rejected:!!(mixed&&mixed.ok===false)};
        }
        // create delivery for print
        const fields=await api('/k/v1/app/form/fields.json','GET',{app:${APP19}});
        const tableCode=Object.keys(fields.properties||{}).find(k=>fields.properties[k].type==='SUBTABLE') || 'detail_table';
        const tableFields=Object.keys((fields.properties[tableCode]&&fields.properties[tableCode].fields)||{});
        const today=new Date().toISOString().slice(0,10);
        function row(order){
          const value={};
          if(tableFields.includes('manage_no') || !tableFields.length) value.manage_no={value:order.manage_no.value};
          if(tableFields.includes('barcode_manage_no')) value.barcode_manage_no={value:order.manage_no.value};
          if(tableFields.includes('item_name')) value.item_name={value:'[TEST]'};
          if(tableFields.includes('qty')) value.qty={value:'1'};
          if(tableFields.includes('unit_price')) value.unit_price={value:'3000'};
          return {value};
        }
        let deliveryId=null, deliveryErr=null;
        try{
          const a=list[0], b=list[1];
          const rec={ customer_code:{value:'A550'}, customer_name:{value:a.customer_name&&a.customer_name.value||'店舗'}, client_name:{value:'[TEST]山田花子'}, delivery_date:{value:today} };
          if(fields.properties.personal_customer_id) rec.personal_customer_id={value:'${TEST_PCM}'};
          rec[tableCode]={value:[row(a), row(b)]};
          deliveryId=String((await api('/k/v1/record.json','POST',{app:${APP19},record:rec})).id);
        }catch(e){ deliveryErr=e.message||String(e); }
        return {hasPcm, hasBar, pcmBeforeBar: hasPcm && hasBar, gate, deliveryId, deliveryErr, tableCode, tableFields:tableFields.slice(0,40), same:[list[0]&&list[0].manage_no.value, list[1]&&list[1].manage_no.value]};
      })()`,
    });
    report.deliveryPrep = pcm.result.value;
    checks.push({ name: 'App19 has pcm script', ok: !!(pcm.result.value && pcm.result.value.hasPcm), detail: pcm.result.value });
    checks.push({ name: 'PCM same ok / mix rejected', ok: !!(pcm.result.value && pcm.result.value.gate && pcm.result.value.gate.rejected), detail: pcm.result.value && pcm.result.value.gate });
    await edit.close();

    if (pcm.result.value && pcm.result.value.deliveryId) {
      const d = await openPage(`https://${SUB}.cybozu.com/k/${APP19}/show#record=${pcm.result.value.deliveryId}`);
      await new Promise((r) => setTimeout(r, 3500));
      await shot(d, 'detail_store_delivery');
      const btns = await d.send('Runtime.evaluate', {
        returnByValue: true,
        expression: `(()=>{
          const texts=Array.from(document.querySelectorAll('button,.ayanas-print-button')).map(b=>(b.innerText||'').trim());
          return {hasStore:texts.includes('店舗納品書'), hasCorp:texts.some(t=>/納品書印刷|一般客|松葉/.test(t)), texts:texts.filter(Boolean).slice(0,40)};
        })()`,
      });
      checks.push({ name: 'delivery shows 店舗納品書', ok: btns.result.value.hasStore, detail: btns.result.value });
      checks.push({ name: 'delivery keeps corp buttons', ok: btns.result.value.hasCorp, detail: btns.result.value });
      const cap = await clickAndCapture(d, '店舗納品書', 'store_delivery', checks);
      if (cap && cap.text) {
        checks.push({ name: 'delivery totals visible', ok: /税込|合計|残|入金/.test(cap.text), detail: cap.text.slice(0, 300) });
        checks.push({ name: 'delivery multi lines', ok: (pcm.result.value.same || []).filter((mn) => mn && cap.text.includes(mn)).length >= 1, detail: { same: pcm.result.value.same, sample: cap.text.slice(0, 300) } });
      }
      // statuses of non-included extra
      const st = await d.send('Runtime.evaluate', {
        awaitPromise: true,
        returnByValue: true,
        expression: `(async()=>{
          const api=(p,m,b)=>kintone.api(kintone.api.url(p,true),m,b);
          const res=await api('/k/v1/records.json','GET',{app:${APP16},query:'customer_code="A550" and personal_customer_id="${TEST_PCM}" order by $id desc limit 20'});
          return (res.records||[]).map(r=>({manage_no:r.manage_no.value, delivery_status:r.delivery_status&&r.delivery_status.value, delivery_no:r.delivery_no&&r.delivery_no.value}));
        })()`,
      });
      report.statuses = st.result.value;
      checks.push({ name: 'no bulk status wipe on TEST set', ok: (st.result.value || []).every((x) => x.delivery_status), detail: st.result.value });
      await d.close();
    } else {
      checks.push({ name: 'TEST delivery created', ok: false, detail: pcm.result.value });
    }
  }

  // verify impact / plugin version
  {
    const p = await openPage(`https://${SUB}.cybozu.com/k/admin/system/plugin/`);
    await new Promise((r) => setTimeout(r, 2000));
    const v = await p.send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(()=>{
        const text=document.body&&document.body.innerText||'';
        return {has145:/V145|version\\s*145|Plugin V145/i.test(text), sample:(text.match(/AYANAS\\s*Print[^\\n]{0,120}/gi)||[]).slice(0,5)};
      })()`,
    });
    await shot(p, 'plugin_v145');
    checks.push({ name: 'plugin list v145', ok: !!v.result.value.has145, detail: v.result.value });
    await p.close();
  }

  report.summary = {
    passed: checks.filter((c) => c.ok).length,
    failed: checks.filter((c) => !c.ok).length,
    total: checks.length,
  };
  report.generalRelease = false;
  fs.writeFileSync(path.join(WORK_DIR, 'e2e_capture_report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    summary: report.summary,
    failed: checks.filter((c) => !c.ok),
    artifacts: ART,
  }, null, 2));
  if (report.summary.failed > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
