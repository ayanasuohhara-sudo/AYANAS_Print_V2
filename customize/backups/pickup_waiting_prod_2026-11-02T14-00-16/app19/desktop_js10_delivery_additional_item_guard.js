(function () {
  'use strict';

  /**
   * App19 納品 — 外注追加加工ガード（保存前）
   * 依存: additional_item_engine.js
   *
   * ① 加工登録漏れ（App27 vs App16 item_code）
   * ② 価格未定（App16 price_unconfirmed = 価格未定）
   *
   * unit_price の 0 / 空欄だけでは止めない。
   * 自動追加・価格決定・App27書換はしない。
   */

  const Engine = window.CAYANAS_AdditionalItemEngine;

  if (!Engine) {
    console.error('[additional_item_guard] additional_item_engine.js を先に読み込んでください。');
    return;
  }

  if (typeof kintone === 'undefined') {
    return;
  }

  if (Number(kintone.app.getId()) !== Engine.APP.delivery) {
    return;
  }

  kintone.events.on([
    'app.record.create.submit',
    'app.record.edit.submit',
  ], (event) => {
    const record = event.record;

    if (!record) {
      return event;
    }

    return Promise.all([
      Engine.findMissingProcessOnDelivery(record),
      Engine.findPriceUnconfirmedOnDelivery(record),
    ])
      .then(function (results) {
        const missingByManageNo = results[0];
        const pendingByManageNo = results[1];
        const hasMissing = missingByManageNo && missingByManageNo.size > 0;
        const hasPending = pendingByManageNo && pendingByManageNo.size > 0;

        if (!hasMissing && !hasPending) {
          return event;
        }

        event.error = Engine.buildDeliveryGuardError(missingByManageNo, pendingByManageNo);
        return event;
      })
      .catch(function (err) {
        console.error('[additional_item_guard]', err);
        event.error =
          '外注追加加工の照合中にエラーが発生したため、納品書を保存していません。\n'
          + Engine.formatKintoneError(err);
        return event;
      });
  });

})();
