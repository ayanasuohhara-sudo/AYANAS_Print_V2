(function () {
  'use strict';

  /**
   * App19 店舗納品書作成 — 同一 PCM 拘束（A550 のみ）
   * 法人経路は検査しない。印刷では App16 を更新しない。
   */

  const DELIVERY_APP_ID = 19;
  const ORDER_APP_ID = 16;
  const STORE_CUSTOMER_CODE = 'A550';
  const CTX_KEY = '__CAYANAS_STORE_DELIVERY_CTX';

  const readValue = (record, code) => {
    const field = record && record[code];
    if (!field || field.value === null || field.value === undefined) {
      return '';
    }
    return String(field.value).trim();
  };

  const escapeQuery = (value) => String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  const getCtx = () => {
    if (!window[CTX_KEY]) {
      window[CTX_KEY] = {
        personalCustomerId: '',
        clientName: '',
      };
    }
    return window[CTX_KEY];
  };

  const resetCtx = () => {
    window[CTX_KEY] = {
      personalCustomerId: '',
      clientName: '',
    };
  };

  const isStoreHeader = (record) => (
    readValue(record, 'customer_code') === STORE_CUSTOMER_CODE
  );

  /**
   * バーコード読取前チェック。
   * @returns {{ ok: boolean, reason?: string, setContext?: boolean }}
   */
  const evaluateScan = (orderRecord, deliveryRecord) => {
    const customerCode = readValue(orderRecord, 'customer_code');
    const pcm = readValue(orderRecord, 'personal_customer_id');
    const headerCode = readValue(deliveryRecord, 'customer_code');
    const ctx = getCtx();

    // ヘッダ未設定: 初回。A550 なら PCM 必須でコンテキスト開始
    if (!headerCode) {
      if (customerCode === STORE_CUSTOMER_CODE) {
        if (!pcm) {
          return {
            ok: false,
            reason: '店舗商品に個人顧客IDがありません。PCM連携後に追加してください。',
          };
        }
        return { ok: true, setContext: true };
      }
      // 法人初回 — PCM 拘束なし
      return { ok: true, setContext: false };
    }

    // ヘッダが店舗
    if (headerCode === STORE_CUSTOMER_CODE) {
      if (customerCode !== STORE_CUSTOMER_CODE) {
        return {
          ok: false,
          reason: '店舗納品書に法人商品は追加できません。',
        };
      }
      if (!pcm) {
        return {
          ok: false,
          reason: '店舗商品に個人顧客IDがありません。',
        };
      }
      const expected = ctx.personalCustomerId || '';
      if (expected && expected !== pcm) {
        return {
          ok: false,
          reason: '別のお客様（PCM不一致）の商品は同じ納品書に追加できません。',
        };
      }
      return { ok: true, setContext: !expected };
    }

    // ヘッダが法人 — 店舗商品混入拒否
    if (customerCode === STORE_CUSTOMER_CODE) {
      return {
        ok: false,
        reason: '法人納品書に店舗（A550）商品は追加できません。',
      };
    }

    return { ok: true, setContext: false };
  };

  const applyContextFromOrder = (orderRecord) => {
    const ctx = getCtx();
    ctx.personalCustomerId = readValue(orderRecord, 'personal_customer_id');
    ctx.clientName = readValue(orderRecord, 'client_name');
  };

  const collectManageNos = (deliveryRecord) => {
    const table = deliveryRecord && deliveryRecord.delivery_detail;
    const rows = table && Array.isArray(table.value) ? table.value : [];
    const set = new Set();
    rows.forEach((row) => {
      const mn = String(row?.value?.manage_no?.value ?? '').trim();
      if (mn) {
        set.add(mn);
      }
    });
    return Array.from(set);
  };

  /**
   * 保存前: A550 明細の PCM が一意か再確認
   */
  const validateStoreSlipBeforeSave = async (deliveryRecord) => {
    if (!isStoreHeader(deliveryRecord)) {
      return { ok: true };
    }

    const manageNos = collectManageNos(deliveryRecord);
    if (!manageNos.length) {
      return { ok: true };
    }

    const query = 'manage_no in ('
      + manageNos.map((m) => '"' + escapeQuery(m) + '"').join(',')
      + ')';
    const resp = await kintone.api(
      kintone.api.url('/k/v1/records.json', true),
      'GET',
      {
        app: ORDER_APP_ID,
        query: query,
        fields: ['$id', 'manage_no', 'customer_code', 'personal_customer_id', 'client_name'],
      }
    );
    const records = resp.records || [];
    const pcmSet = new Set();
    const missing = [];
    records.forEach((rec) => {
      if (readValue(rec, 'customer_code') !== STORE_CUSTOMER_CODE) {
        missing.push(readValue(rec, 'manage_no') + '（店舗以外）');
        return;
      }
      const pcm = readValue(rec, 'personal_customer_id');
      if (!pcm) {
        missing.push(readValue(rec, 'manage_no') + '（PCMなし）');
        return;
      }
      pcmSet.add(pcm);
    });

    if (missing.length) {
      return {
        ok: false,
        reason: '店舗納品書の明細に問題があります:\n' + missing.join('\n'),
      };
    }
    if (pcmSet.size > 1) {
      return {
        ok: false,
        reason: '同一PCMの商品のみ保存できます。別お客様の商品が混在しています。',
      };
    }
    return { ok: true, personalCustomerId: Array.from(pcmSet)[0] || '' };
  };

  const ensureBanner = (isStore) => {
    const space = document.querySelector('.gaia-argoui-app-toolbar')
      || document.querySelector('.contents-gaia')
      || document.body;
    let el = document.getElementById('cayan-store-delivery-banner');
    if (!isStore) {
      if (el) {
        el.remove();
      }
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'cayan-store-delivery-banner';
      el.style.cssText = 'margin:8px 12px;padding:10px 12px;border:1px solid #94a3b8;'
        + 'background:#f8fafc;color:#0f172a;font-size:14px;font-weight:700;';
      space.insertBefore(el, space.firstChild);
    }
    const ctx = getCtx();
    el.textContent = '店舗納品書作成: 同一PCMの商品のみ追加できます。'
      + (ctx.personalCustomerId
        ? ' 現在 PCM ' + ctx.personalCustomerId
          + (ctx.clientName ? '（' + ctx.clientName + '）' : '')
        : ' バーコードで商品を追加してください。');
  };

  window.CAYANAS_StoreDeliveryPcm = {
    STORE_CUSTOMER_CODE: STORE_CUSTOMER_CODE,
    evaluateScan: evaluateScan,
    applyContextFromOrder: applyContextFromOrder,
    validateStoreSlipBeforeSave: validateStoreSlipBeforeSave,
    resetCtx: resetCtx,
    getCtx: getCtx,
    ensureBanner: ensureBanner,
    isStoreHeader: isStoreHeader,
  };

  if (typeof kintone === 'undefined') {
    return;
  }

  if (Number(kintone.app.getId()) !== DELIVERY_APP_ID) {
    return;
  }

  kintone.events.on(['app.record.create.show', 'app.record.edit.show'], (event) => {
    if (isStoreHeader(event.record)) {
      // 編集時は明細から PCM を推定しない（保存時に検証）。バナーのみ。
      ensureBanner(true);
    } else if (!readValue(event.record, 'customer_code')) {
      ensureBanner(true);
    } else {
      ensureBanner(false);
    }
    return event;
  });

  kintone.events.on(
    ['app.record.create.submit', 'app.record.edit.submit'],
    async (event) => {
      try {
        const result = await validateStoreSlipBeforeSave(event.record);
        if (!result.ok) {
          event.error = result.reason;
          return event;
        }
      } catch (err) {
        event.error = '店舗納品書のPCM確認に失敗しました: '
          + (err && err.message ? err.message : String(err));
        return event;
      }
      return event;
    }
  );

  kintone.events.on(['app.record.create.submit.success', 'app.record.index.show'], () => {
    resetCtx();
  });

}());
