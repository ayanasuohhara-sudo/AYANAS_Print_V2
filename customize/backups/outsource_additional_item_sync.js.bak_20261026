(function () {
  'use strict';

  /**
   * App27 外注出庫 — 保存成功後に App16 加工明細へ追加加工を同期
   * 依存: additional_item_engine.js
   *
   * gaityuusyuko.js は変更しない（submit でステータス更新）。
   * 本処理は submit.success のみ。ステータスは触らない。
   */

  const Engine = window.CAYANAS_AdditionalItemEngine;

  if (!Engine) {
    console.error('[additional_item_sync] additional_item_engine.js を先に読み込んでください。');
    return;
  }

  if (typeof kintone === 'undefined') {
    return;
  }

  if (Number(kintone.app.getId()) !== Engine.APP.outsourceOutbound) {
    return;
  }

  kintone.events.on([
    'app.record.create.submit.success',
    'app.record.edit.submit.success',
  ], (event) => {
    const record = event.record;

    if (!record) {
      return event;
    }

    return Engine.syncOrderDetailsFromApp27Record(record)
      .then(function (syncResult) {
        const text = Engine.formatSyncAlert(syncResult);

        if (text) {
          window.alert(text);
        }

        if (syncResult.errors.length > 0 || syncResult.warnings.length > 0) {
          console.warn('[additional_item_sync]', syncResult);
        }

        return event;
      })
      .catch(function (err) {
        console.error('[additional_item_sync] 出庫保存は完了済み。App16同期失敗', err);
        window.alert(
          '外注出庫は保存済みです。\n'
          + '受注明細への追加加工の自動登録でエラーがありました。\n'
          + '受注明細の加工明細を確認してください。\n\n'
          + Engine.formatKintoneError(err)
        );
        return event;
      });
  });

})();
