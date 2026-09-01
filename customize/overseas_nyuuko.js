(function() {
  'use strict';

  /**
   * 海外入庫（App 29）
   * 管理番号入力時に受注明細（16）・海外外注出庫（28）の overseas_in_date を更新する。
   */

  const INBOUND_APP_ID = 29;
  const ORDER_APP_ID = 16;
  const OVERSEAS_APP_ID = 28;

  const INPUT_FIELD_CODES = [
    'barcode_input',
    'manage_no',
    'barcode',
  ];

  const MESSAGE_SPACE_ID = 'message_space';

  let isProcessing = false;
  let debounceTimer = null;

  const escapeQueryValue = (value) => String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  const getToday = () => {

    const formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    return formatter.format(new Date());

  };

  const isInboundApp = () => kintone.app.getId() === INBOUND_APP_ID;

  const getInputFieldCode = (record) => {

    for (let index = 0; index < INPUT_FIELD_CODES.length; index += 1) {
      const fieldCode = INPUT_FIELD_CODES[index];

      if (record[fieldCode]) {
        return fieldCode;
      }

    }

    return INPUT_FIELD_CODES[0];

  };

  const getManageNoFromRecord = (record) => {

    for (let index = 0; index < INPUT_FIELD_CODES.length; index += 1) {
      const fieldCode = INPUT_FIELD_CODES[index];
      const field = record[fieldCode];

      if (!field) {
        continue;
      }

      const value = String(field.value ?? '').trim();

      if (value !== '') {
        return value;
      }

    }

    return '';

  };

  const clearManageNoInput = () => {

    const recordObj = kintone.app.record.get();
    const fieldCode = getInputFieldCode(recordObj.record);

    if (!recordObj.record[fieldCode]) {
      return;
    }

    recordObj.record[fieldCode].value = '';
    kintone.app.record.set(recordObj);

  };

  const focusInput = () => {

    setTimeout(function() {

      const input = document.querySelector('input[type="text"]');

      if (input) {
        input.focus();
      }

    }, 100);

  };

  const showMessage = (manageNo, messageType, detail) => {

    const space = kintone.app.record.getSpaceElement(MESSAGE_SPACE_ID);

    if (!space) {
      return;
    }

    const color = messageType === 'success' ? 'green' : 'crimson';
    const text = messageType === 'success'
      ? manageNo + ' 海外入庫完了'
      : manageNo + ' ' + detail;

    space.innerHTML =
      '<div style="color:' + color + ';font-size:16px;">' +
      text +
      '</div>';

  };

  const fetchRecords = (appId, query) => kintone.api(
    kintone.api.url('/k/v1/records', true),
    'GET',
    {
      app: appId,
      query: query,
    }
  );

  const updateRecord = (appId, recordId, record) => kintone.api(
    kintone.api.url('/k/v1/record', true),
    'PUT',
    {
      app: appId,
      id: recordId,
      record: record,
    }
  );

  const findOverseasRecord = async (manageNo) => {

    const escapedManageNo = escapeQueryValue(manageNo);
    const queries = [
      'manage_no = "' + escapedManageNo + '" order by $id desc limit 1',
      'overseas_manage_no = "' + escapedManageNo + '" order by $id desc limit 1',
    ];

    for (let index = 0; index < queries.length; index += 1) {

      const response = await fetchRecords(OVERSEAS_APP_ID, queries[index]);

      if (response.records.length > 0) {
        return response.records[0];
      }

    }

    return null;

  };

  const processManageNo = async (manageNo) => {

    const normalizedManageNo = String(manageNo ?? '').trim();

    if (!normalizedManageNo || isProcessing) {
      return false;
    }

    isProcessing = true;

    try {

      const orderResponse = await fetchRecords(
        ORDER_APP_ID,
        'manage_no = "' + escapeQueryValue(normalizedManageNo) + '" limit 1'
      );

      if (orderResponse.records.length === 0) {
        alert('管理番号が見つかりません\n' + normalizedManageNo);
        showMessage(normalizedManageNo, 'error', '受注明細が見つかりません');
        return false;
      }

      const orderRecord = orderResponse.records[0];
      const today = getToday();

      await updateRecord(ORDER_APP_ID, orderRecord.$id.value, {
        process_status: {
          value: '外注戻り',
        },
        location_status: {
          value: '本社',
        },
        overseas_in_date: {
          value: today,
        },
      });

      const overseasRecord = await findOverseasRecord(normalizedManageNo);

      if (overseasRecord) {
        await updateRecord(OVERSEAS_APP_ID, overseasRecord.$id.value, {
          overseas_in_date: {
            value: today,
          },
          overseas_status: {
            value: '全戻り',
          },
        });
      } else {
        console.warn('[海外入庫] 海外外注出庫レコードが見つかりません:', normalizedManageNo);
      }

      showMessage(normalizedManageNo, 'success');
      clearManageNoInput();
      focusInput();

      return true;

    } catch (error) {

      console.error('[海外入庫]', error);

      alert('更新エラー\n' + (error.message || error));

      showMessage(
        normalizedManageNo,
        'error',
        error.message || '更新エラー'
      );

      return false;

    } finally {
      isProcessing = false;
    }

  };

  const queueProcessManageNo = (manageNo) => {

    const normalizedManageNo = String(manageNo ?? '').trim();

    if (!normalizedManageNo) {
      return;
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(function() {
      processManageNo(normalizedManageNo);
    }, 200);

  };

  const buildChangeEvents = () => INPUT_FIELD_CODES.map(function(fieldCode) {
    return [
      'app.record.create.change.' + fieldCode,
      'app.record.edit.change.' + fieldCode,
    ];
  }).flat();

  kintone.events.on(buildChangeEvents(), function(event) {

    if (!isInboundApp()) {
      return event;
    }

    queueProcessManageNo(getManageNoFromRecord(event.record));

    return event;

  });

  kintone.events.on([
    'app.record.create.submit',
    'app.record.edit.submit',
  ], function(event) {

    if (!isInboundApp()) {
      return event;
    }

    const manageNo = getManageNoFromRecord(event.record);

    if (!manageNo) {
      alert('管理番号を入力してください');
      return false;
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    return processManageNo(manageNo).then(function(success) {
      return success ? event : false;
    });

  });

  kintone.events.on([
    'app.record.create.show',
    'app.record.edit.show',
  ], function(event) {

    if (!isInboundApp()) {
      return event;
    }

    setTimeout(function() {
      focusInput();
    }, 300);

    return event;

  });

})();
