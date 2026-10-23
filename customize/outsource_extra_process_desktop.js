(function () {
  'use strict';

  /**
   * 外注追加加工の登録漏れ防止 — 画面フック
   * 依存: config → engine
   *
   * App27: submit.success で App16 明細へ自動追加（gaityuusyuko のステータス更新後）
   * App19: submit で外注履歴と App16 を照合。漏れがあれば保存停止
   *
   * App78・既存ステータス処理・gaityuusyuko.js 本体は変更しない。
   */

  const C = window.CAYANAS_OutsourceExtraProcess;
  const Engine = window.CAYANAS_OutsourceExtraProcessEngine;

  if (!C || !Engine) {
    console.error('[outsource_extra] config / engine を先に読み込んでください。');
    return;
  }

  if (typeof kintone === 'undefined') {
    return;
  }

  const appId = Number(kintone.app.getId());

  const registerApp27 = () => {
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
          const summary = Engine.formatSyncSummary(syncResult);

          if (summary) {
            window.alert('【外注追加加工 → 受注明細】\n' + summary);
          }

          if (syncResult.errors.length > 0) {
            console.warn('[outsource_extra] App27→App16', syncResult);
          }

          return event;
        })
        .catch(function (err) {
          console.error('[outsource_extra] App27→App16 失敗（出庫保存は完了済み）', err);
          window.alert(
            '外注出庫は保存済みです。\n'
            + '受注明細への加工自動追加でエラーがありました。\n'
            + 'App16の加工明細を確認してください。\n\n'
            + Engine.formatKintoneError(err)
          );
          return event;
        });
    });
  };

  const registerApp19 = () => {
    kintone.events.on([
      'app.record.create.submit',
      'app.record.edit.submit',
    ], (event) => {
      const record = event.record;

      if (!record) {
        return event;
      }

      return Engine.findMissingProcessOnDelivery(record)
        .then(function (missing) {
          if (!missing || missing.length === 0) {
            return event;
          }

          event.error = Engine.formatMissingMessage(missing);
          return event;
        })
        .catch(function (err) {
          console.error('[outsource_extra] App19照合エラー', err);
          event.error =
            '外注追加加工の照合中にエラーが発生したため、納品書を保存していません。\n'
            + Engine.formatKintoneError(err);
          return event;
        });
    });
  };

  if (appId === C.APP.outsourceOutbound) {
    registerApp27();
  }

  if (appId === C.APP.delivery) {
    registerApp19();
  }

})();
