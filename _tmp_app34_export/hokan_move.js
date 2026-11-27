(function() {
  'use strict';

  const ORDER_APP_ID = 16;

  async function processBarcode(barcode, moveLocation) {

    if (!barcode) return;

    if (!moveLocation) {
      alert('移動先を選択してください');
      return;
    }

    try {

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

      await kintone.api(
        kintone.api.url('/k/v1/record.json', true),
        'PUT',
        {
          app: ORDER_APP_ID,
          id: rec.$id.value,
          record: {

            location_status: {
              value: moveLocation
            }

          }
        }
      );

      const space =
        kintone.app.record.getSpaceElement('message_space');

      if (space) {
        space.innerHTML =
          '<div style="color:green;font-size:16px;">' +
          barcode +
          ' → ' +
          moveLocation +
          ' へ移動完了</div>';
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

      const barcode =
        event.record.barcode_input.value;

      const moveLocation =
        event.record.location_status.value;

      processBarcode(
        barcode,
        moveLocation
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
