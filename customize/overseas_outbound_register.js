(function() {
  'use strict';

  /**
   * 海外外注出庫（App 28）連続バーコード出庫登録
   */

  const OVERSEAS_APP_ID = 28;
  const ORDER_APP_ID = 16;

  const FIELDS = {
    shipDate: 'ship_date',
    scheduledArrivalDate: 'scheduled_arrival_date',
    cartonNo: 'carton_no',
    manageNo: 'manage_no',
    customerCode: 'customer_code',
    clientName: 'client_name',
    kimonoType: 'kimono_type',
    kimonoSpec: 'kimono_spec',
    deadline: 'deadline',
    overseasInDate: 'overseas_in_date',
    overseasStatus: 'overseas_status',
    processStatus: 'process_status',
    locationStatus: 'location_status',
  };

  const BARCODE_FIELD_CODES = ['barcode_input', 'manage_no', 'barcode'];
  const MESSAGE_SPACE_ID = 'message_space';

  const ORDER_OUTBOUND_PROCESS_STATUS = '海外外注中';
  const ORDER_OUTBOUND_LOCATION_STATUS = '海外';
  const OVERSEAS_OUTBOUND_STATUS = '出庫中';

  let sessionRegisteredManageNos = new Set();
  let isProcessing = false;
  let debounceTimer = null;

  const escapeQueryValue = (value) => String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  const isOutboundApp = () => kintone.app.getId() === OVERSEAS_APP_ID;

  const getFieldValue = (record, fieldCode) => {

    const field = record?.[fieldCode];

    if (!field || field.value === null || field.value === undefined) {
      return '';
    }

    return field.value;

  };

  const getBarcodeFieldCode = (record) => {

    for (let index = 0; index < BARCODE_FIELD_CODES.length; index += 1) {
      const fieldCode = BARCODE_FIELD_CODES[index];

      if (record[fieldCode]) {
        return fieldCode;
      }

    }

    return BARCODE_FIELD_CODES[0];

  };

  const getBarcodeValue = (record) => {

    for (let index = 0; index < BARCODE_FIELD_CODES.length; index += 1) {
      const fieldCode = BARCODE_FIELD_CODES[index];
      const value = String(getFieldValue(record, fieldCode) ?? '').trim();

      if (value !== '') {
        return value;
      }

    }

    return '';

  };

  const clearBarcodeInput = (record) => {

    BARCODE_FIELD_CODES.forEach((fieldCode) => {

      if (record[fieldCode]) {
        record[fieldCode].value = '';
      }

    });

  };

  const focusBarcodeInput = () => {

    setTimeout(function() {

      const barcodeFieldCode = getBarcodeFieldCode(kintone.app.record.get().record);
      const fieldElement = kintone.app.record.getFieldElement(barcodeFieldCode);
      const input = fieldElement?.querySelector('input');

      if (input) {
        input.focus();
      }

    }, 100);

  };

  const showMessage = (message, isError) => {

    const space = kintone.app.record.getSpaceElement(MESSAGE_SPACE_ID);

    if (!space) {
      return;
    }

    const color = isError ? 'crimson' : 'green';

    space.innerHTML =
      '<div style="color:' + color + ';font-size:16px;">' +
      message +
      '</div>';

  };

  const validateHeaderFields = (record) => {

    const shipDate = String(getFieldValue(record, FIELDS.shipDate) ?? '').trim();
    const scheduledArrivalDate = String(getFieldValue(record, FIELDS.scheduledArrivalDate) ?? '').trim();
    const cartonNo = String(getFieldValue(record, FIELDS.cartonNo) ?? '').trim();

    if (!shipDate) {
      alert('出庫日を入力してください。');
      return false;
    }

    if (!scheduledArrivalDate) {
      alert('入庫予定日を入力してください。');
      return false;
    }

    if (!cartonNo) {
      alert('カートン番号を入力してください。');
      return false;
    }

    return true;

  };

  const fetchRecords = (appId, query) => kintone.api(
    kintone.api.url('/k/v1/records', true),
    'GET',
    {
      app: appId,
      query: query,
    }
  );

  const fetchOrderRecord = async (manageNo) => {

    const response = await fetchRecords(
      ORDER_APP_ID,
      FIELDS.manageNo + ' = "' + escapeQueryValue(manageNo) + '" limit 1'
    );

    return response.records?.[0] ?? null;

  };

  const findActiveOutboundRecord = async (manageNo) => {

    const queries = [
      FIELDS.manageNo + ' = "' + escapeQueryValue(manageNo) + '" and ' + FIELDS.overseasInDate + ' = "" order by $id desc limit 1',
      'overseas_manage_no = "' + escapeQueryValue(manageNo) + '" and ' + FIELDS.overseasInDate + ' = "" order by $id desc limit 1',
    ];

    for (let index = 0; index < queries.length; index += 1) {

      const response = await fetchRecords(OVERSEAS_APP_ID, queries[index]);

      if (response.records.length > 0) {
        return response.records[0];
      }

    }

    return null;

  };

  const isAlreadyOutboundOrder = (orderRecord) => {

    const processStatus = String(getFieldValue(orderRecord, FIELDS.processStatus) ?? '').trim();
    const locationStatus = String(getFieldValue(orderRecord, FIELDS.locationStatus) ?? '').trim();

    return processStatus === ORDER_OUTBOUND_PROCESS_STATUS
      && locationStatus === ORDER_OUTBOUND_LOCATION_STATUS;

  };

  const createOutboundRecord = async (headerRecord, orderRecord, manageNo) => kintone.api(
    kintone.api.url('/k/v1/record', true),
    'POST',
    {
      app: OVERSEAS_APP_ID,
      record: {
        [FIELDS.shipDate]: {
          value: getFieldValue(headerRecord, FIELDS.shipDate),
        },
        [FIELDS.scheduledArrivalDate]: {
          value: getFieldValue(headerRecord, FIELDS.scheduledArrivalDate),
        },
        [FIELDS.cartonNo]: {
          value: getFieldValue(headerRecord, FIELDS.cartonNo),
        },
        [FIELDS.manageNo]: {
          value: manageNo,
        },
        [FIELDS.customerCode]: {
          value: getFieldValue(orderRecord, FIELDS.customerCode),
        },
        [FIELDS.clientName]: {
          value: getFieldValue(orderRecord, FIELDS.clientName),
        },
        [FIELDS.kimonoType]: {
          value: getFieldValue(orderRecord, FIELDS.kimonoType),
        },
        [FIELDS.kimonoSpec]: {
          value: getFieldValue(orderRecord, FIELDS.kimonoSpec),
        },
        [FIELDS.deadline]: {
          value: getFieldValue(orderRecord, FIELDS.deadline),
        },
        [FIELDS.overseasStatus]: {
          value: OVERSEAS_OUTBOUND_STATUS,
        },
      },
    }
  );

  const updateOrderForOutbound = async (orderRecord) => kintone.api(
    kintone.api.url('/k/v1/record', true),
    'PUT',
    {
      app: ORDER_APP_ID,
      id: orderRecord.$id.value,
      record: {
        [FIELDS.processStatus]: {
          value: ORDER_OUTBOUND_PROCESS_STATUS,
        },
        [FIELDS.locationStatus]: {
          value: ORDER_OUTBOUND_LOCATION_STATUS,
        },
      },
    }
  );

  const processBarcode = async (record) => {

    const manageNo = getBarcodeValue(record);

    if (!manageNo || isProcessing) {
      return;
    }

    if (!validateHeaderFields(record)) {
      clearBarcodeInput(record);
      kintone.app.record.set({ record: record });
      focusBarcodeInput();
      return;
    }

    isProcessing = true;

    try {

      if (sessionRegisteredManageNos.has(manageNo)) {
        alert('管理番号 ' + manageNo + ' は既に今回の出庫に登録されています。');
        showMessage('管理番号 ' + manageNo + ' は既に今回の出庫に登録されています。', true);
        clearBarcodeInput(record);
        kintone.app.record.set({ record: record });
        focusBarcodeInput();
        return;
      }

      const orderRecord = await fetchOrderRecord(manageNo);

      if (!orderRecord) {
        alert('管理番号が見つかりません\n' + manageNo);
        showMessage('管理番号 ' + manageNo + ' は受注明細に存在しません。', true);
        clearBarcodeInput(record);
        kintone.app.record.set({ record: record });
        focusBarcodeInput();
        return;
      }

      const activeOutboundRecord = await findActiveOutboundRecord(manageNo);

      if (activeOutboundRecord || isAlreadyOutboundOrder(orderRecord)) {
        alert('管理番号 ' + manageNo + ' は既に海外出庫中です。');
        showMessage('管理番号 ' + manageNo + ' は既に海外出庫中です。', true);
        clearBarcodeInput(record);
        kintone.app.record.set({ record: record });
        focusBarcodeInput();
        return;
      }

      await createOutboundRecord(record, orderRecord, manageNo);
      await updateOrderForOutbound(orderRecord);

      sessionRegisteredManageNos.add(manageNo);
      showMessage('管理番号 ' + manageNo + ' を出庫登録しました。', false);

      clearBarcodeInput(record);
      kintone.app.record.set({ record: record });
      focusBarcodeInput();

    } catch (error) {

      console.error('[海外外注出庫]', error);
      alert('出庫登録エラー\n' + (error.message || error));
      showMessage('出庫登録エラー: ' + (error.message || error), true);

    } finally {
      isProcessing = false;
    }

  };

  const queueProcessBarcode = (record) => {

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(function() {
      processBarcode(record);
    }, 200);

  };

  const buildChangeEvents = () => BARCODE_FIELD_CODES.map(function(fieldCode) {
    return 'app.record.create.change.' + fieldCode;
  });

  kintone.events.on('app.record.create.show', function(event) {

    if (!isOutboundApp()) {
      return event;
    }

    sessionRegisteredManageNos = new Set();

    setTimeout(function() {
      focusBarcodeInput();
    }, 300);

    return event;

  });

  kintone.events.on(buildChangeEvents(), function(event) {

    if (!isOutboundApp()) {
      return event;
    }

    queueProcessBarcode(event.record);

    return event;

  });

  kintone.events.on('app.record.create.submit', function(event) {

    if (!isOutboundApp()) {
      return event;
    }

    alert('バーコード読取で1件ずつ登録してください。保存ボタンは使用しません。');
    return false;

  });

})();
