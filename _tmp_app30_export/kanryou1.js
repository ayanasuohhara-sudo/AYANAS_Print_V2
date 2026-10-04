(function() {
  'use strict';

  const ORDER_APP_ID = 16;

  async function processBarcode(barcode) {

    if (!barcode) {
      return;
    }

    try {

      // 受注明細検索
      const resp = await kintone.api(
        kintone.api.url('/k/v1/records.json', true),
        'GET',
        {
          app: ORDER_APP_ID,
          query: 'manage_no = "' + barcode + '"'
        }
      );

      if (resp.records.length === 0) {
        alert('管理番号が見つかりません\n' + barcode);
        return;
      }

      const rec = resp.records[0];

      // ステータス更新
      await kintone.api(
        kintone.api.url('/k/v1/record.json', true),
        'PUT',
        {
          app: ORDER_APP_ID,
          id: rec.$id.value,
          record: {

            process_status: {
              value: '完了'
            },

            delivery_status: {
              value: '納品待ち'
            }

          }
        }
      );

      // 成功表示
      const space = kintone.app.record.getSpaceElement('message_space');

      if (space) {
        space.innerHTML =
          '<div style="color:green;font-size:16px;">' +
          barcode +
          ' 更新成功</div>';
      }

      // 入力欄クリア
      const recordObj = kintone.app.record.get();

      recordObj.record.barcode_input.value = '';

      kintone.app.record.set(recordObj);

      // フォーカス復帰
      setTimeout(function() {

        const el = document.querySelector(
          'input[type="text"]'
        );

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

      const barcode = event.record.barcode_input.value;

      processBarcode(barcode);

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

        const el = document.querySelector(
          'input[type="text"]'
        );

        if (el) {
          el.focus();
        }

      }, 300);

      return event;

    }
  );

})();
