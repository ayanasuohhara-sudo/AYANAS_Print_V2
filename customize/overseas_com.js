(function() {
'use strict';

/**
 * 海外入庫（保存処理版）
 * 入庫時に受注明細（16）・海外外注出庫（28）の overseas_in_date を更新する。
 */

const ORDER_APP_ID = 16;
const OVERSEAS_APP_ID = 28;

const escapeQueryValue = (value) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/"/g, '\\"');

kintone.events.on('app.record.create.show', function(event) {

setTimeout(function() {

  const input = document.querySelector(
    'input[type="text"]'
  );

  if (!input) {
    return;
  }

  input.focus();

  input.addEventListener('keypress', function(e) {

    if (e.key === 'Enter') {

      const saveButton = document.querySelector(
        '.gaia-ui-actionmenu-save'
      );

      if (saveButton) {
        saveButton.click();
      }

    }

  });

}, 500);

return event;

});

kintone.events.on([
'app.record.create.submit',
'app.record.edit.submit'
], function(event) {

const barcode = event.record.barcode_input.value;

if (!barcode) {
  alert('管理番号を入力してください');
  return false;
}

const today = new Date().toISOString().split('T')[0];

return kintone.api(
  kintone.api.url('/k/v1/records.json', true),
  'GET',
  {
    app: ORDER_APP_ID,
    query: 'manage_no = "' + escapeQueryValue(barcode) + '"'
  }
).then(function(orderResp) {

  if (orderResp.records.length === 0) {
    alert('受注明細が見つかりません');
    return false;
  }

  const orderRec = orderResp.records[0];

  return kintone.api(
    kintone.api.url('/k/v1/record.json', true),
    'PUT',
    {
      app: ORDER_APP_ID,
      id: orderRec.$id.value,
      record: {
        process_status: {
          value: '検品仕上中'
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

}).then(function() {

  return kintone.api(
    kintone.api.url('/k/v1/records.json', true),
    'GET',
    {
      app: OVERSEAS_APP_ID,
      query: 'manage_no = "' + escapeQueryValue(barcode) + '" order by $id desc limit 1'
    }
  );

}).then(function(overseasResp) {

  if (overseasResp.records.length === 0) {
    return event;
  }

  const overseasRec = overseasResp.records[0];

  return kintone.api(
    kintone.api.url('/k/v1/record.json', true),
    'PUT',
    {
      app: OVERSEAS_APP_ID,
      id: overseasRec.$id.value,
      record: {
        overseas_in_date: {
          value: today
        },
        overseas_status: {
          value: '全戻り'
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

kintone.events.on(
'app.record.create.submit.success',
function(event) {

  window.location.href =
    '/k/' + kintone.app.getId() + '/edit';

  return event;

}

);

})();
