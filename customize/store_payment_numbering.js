(function() {
  'use strict';

  /**
   * S1 入金番号採番 — 当日プレフィックス + 同一日内の連番（簡易）
   * 本格運用ではカウンタ App 推奨。当面は当日件数+1 + revision 競合時リトライ。
   */

  const cfg = () => {
    if (typeof window.CAYANAS_StorePayment === 'undefined') {
      throw new Error('[store_payment_numbering] store_payment_config.js を先に読み込んでください。');
    }
    return window.CAYANAS_StorePayment;
  };

  const pad = (n, width) => String(Math.floor(Number(n))).padStart(width, '0');

  const todayPrefix = () => {
    const C = cfg();
    const d = new Date();
    const y = String(d.getFullYear()).slice(-2);
    const m = pad(d.getMonth() + 1, 2);
    const day = pad(d.getDate(), 2);
    return C.NUMBERING.prefix + '-' + y + m + day + '-';
  };

  const allocateNextStorePaymentNo = async () => {
    const C = cfg();
    if (!C.STORE_PAYMENT_APP_ID) {
      throw new Error('STORE_PAYMENT_APP_ID が未設定です。');
    }

    const prefix = todayPrefix();
    const Engine = window.CAYANAS_StorePayment_Engine;
    const escaped = Engine.escapeQuery(prefix);

    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', {
          app: C.STORE_PAYMENT_APP_ID,
          query: C.HEADER_FIELDS.storePaymentNo + ' like "' + escaped + '" order by '
            + C.HEADER_FIELDS.storePaymentNo + ' desc limit 1',
          fields: [C.HEADER_FIELDS.storePaymentNo],
        });

        let seq = 1;
        const latest = (resp.records || [])[0];
        if (latest) {
          const v = Engine.readValue(latest, C.HEADER_FIELDS.storePaymentNo);
          const tail = v.slice(prefix.length);
          const n = Number(tail);
          if (Number.isFinite(n) && n >= 1) {
            seq = n + 1;
          }
        }

        return prefix + pad(seq, C.NUMBERING.pad);
      } catch (err) {
        lastError = err;
      }
    }

    throw new Error('入金番号の採番に失敗しました: ' + (lastError && lastError.message ? lastError.message : String(lastError)));
  };

  window.CAYANAS_StorePayment_Numbering = {
    todayPrefix: todayPrefix,
    allocateNextStorePaymentNo: allocateNextStorePaymentNo,
  };
}());
