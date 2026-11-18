(function () {
  'use strict';

  /**
   * App27 外注出庫 — 保存成功後に App16 加工明細へ追加加工を同期
   * 依存: additional_item_engine.js（VERSION 1.2.2+ / 外注加工マスタ=App23）
   *
   * gaityuusyuko.js は変更しない（submit でステータス更新）。
   * 本処理は submit.success のみ。ステータスは触らない。
   *
   * 注意: 出庫本体は既に保存済み。ここでの alert は同期結果の通知であり、
   * 「キャンセル」で出庫が取り消されることはない。
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

  const prependSavedNotice = (body) => (
    '【外注出庫は保存済みです】\n'
    + 'このメッセージは受注明細への追加加工同期の結果です。\n'
    + '出庫伝票自体は取り消されません。\n\n'
    + body
  );

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
          window.alert(prependSavedNotice(text));
        }

        if (syncResult.errors.length > 0 || syncResult.warnings.length > 0) {
          console.warn('[additional_item_sync]', syncResult);
        }

        return event;
      })
      .catch(function (err) {
        console.error('[additional_item_sync] 出庫保存は完了済み。App16同期失敗', err);
        window.alert(
          prependSavedNotice(
            '受注明細への追加加工の自動登録でエラーがありました。\n'
            + '受注明細の加工明細を確認してください。\n\n'
            + Engine.formatKintoneError(err)
          )
        );
        return event;
      });
  });

})();
