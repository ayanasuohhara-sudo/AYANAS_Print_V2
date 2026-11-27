(function() {
  'use strict';

  const ORDER_APP_ID = 16;

  kintone.events.on([
    'app.record.create.submit',
    'app.record.edit.submit'
  ], function(event) {

    const barcode = event.record.barcode_input.value;

    if (!barcode) {
      alert('管理番号を入力してください');
      return false;
    }

    return kintone.api(
      kintone.api.url('/k/v1/records.json', true),
      'GET',
      {
        app: ORDER_APP_ID,
        query: 'manage_no = "' + barcode + '"'
      }
    ).then(function(resp) {

      if (resp.records.length === 0) {
        alert('管理番号が見つかりません');
        return false;
      }

      const rec = resp.records[0];

      return kintone.api(
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

    }).then(function() {

      return event;

    }).catch(function(err) {

      console.error(err);
      alert(err.message);

      return false;

    });

  });

})();
