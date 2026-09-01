(function() {
  'use strict';

  /**
   * 海外入庫（App 29）バーコード処理
   * 入庫時に受注明細（16）・海外外注出庫（28）の overseas_in_date を更新する。
   */

  const ORDER_APP_ID = 16;
  const OVERSEAS_APP_ID = 28;

  const escapeQueryValue = (value) => String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  async function updateOverseasInDate(appId, recordId, today) {

    await kintone.api(
      kintone.api.url('/k/v1/record.json', true),
      'PUT',
      {
        app: appId,
        id: recordId,
        record: {
          overseas_in_date: {
            value: today
          }
        }
      }
    );

  }

  async function processBarcode(barcode) {

    if (!barcode) {
      return;
    }

    try {

      const resp = await kintone.api(
        kintone.api.url('/k/v1/records.json', true),
        'GET',
        {
          app: ORDER_APP_ID,
          query: 'manage_no = "' + escapeQueryValue(barcode) + '"'
        }
      );

      if (resp.records.length === 0) {
        alert('管理番号が見つかりません\n' + barcode);
        return;
      }

      const rec = resp.records[0];

      const today = new Date()
        .toISOString()
        .split('T')[0];

      await kintone.api(
        kintone.api.url('/k/v1/record.json', true),
        'PUT',
        {
          app: ORDER_APP_ID,
          id: rec.$id.value,
          record: {
            process_status: {
              value: '外注戻り'
            },
            location_status: {
              value: '本社'
            },
            overseas_in_date: {
              value: today
            }
          }
        }
      );

      const overseasResp = await kintone.api(
        kintone.api.url('/k/v1/records.json', true),
        'GET',
        {
          app: OVERSEAS_APP_ID,
          query: 'manage_no = "' + escapeQueryValue(barcode) + '" order by $id desc limit 1'
        }
      );

      if (overseasResp.records.length > 0) {
        await updateOverseasInDate(
          OVERSEAS_APP_ID,
          overseasResp.records[0].$id.value,
          today
        );
      }

      const space =
        kintone.app.record.getSpaceElement('message_space');

      if (space) {
        space.innerHTML =
          '<div style="color:green;font-size:16px;">' +
          barcode +
          ' 海外入庫完了</div>';
      }

      const recordObj = kintone.app.record.get();

      recordObj.record.barcode_input.value = '';

      kintone.app.record.set(recordObj);

      setTimeout(function() {

        const el =
          document.querySelector('input[type="text"]');

        if (el) {
          el.focus();
        }

      }, 100);

    } catch (err) {

      console.error(err);

      alert(
        '更新エラー\n' +
        err.message
      );

    }

  }

  kintone.events.on(
    [
      'app.record.create.change.barcode_input',
      'app.record.edit.change.barcode_input'
    ],
    function(event) {

      processBarcode(
        event.record.barcode_input.value
      );

      return event;

    }
  );

  kintone.events.on(
    [
      'app.record.create.show',
      'app.record.edit.show'
    ],
    function(event) {

      setTimeout(function() {

        const el =
          document.querySelector('input[type="text"]');

        if (el) {
          el.focus();
        }

      }, 300);

      return event;

    }
  );

})();
