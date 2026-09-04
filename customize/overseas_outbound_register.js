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
    overseasManageNo: 'overseas_manage_no',
    customerCode: 'customer_code',
    clientName: 'client_name',
    customerName: 'customer_name',
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
  const REGISTER_BUTTON_ID = 'outbound-register-button';
  const MANAGE_NO_MIN_LENGTH = 6;

  const ORDER_OUTBOUND_PROCESS_STATUS = '海外外注中';
  const ORDER_OUTBOUND_LOCATION_STATUS = '海外';
  const OVERSEAS_OUTBOUND_STATUS = '出庫中';

  let sessionRegisteredManageNos = new Set();
  let sessionShipDateLocked = false;
  let sessionShipDate = '';
  let isProcessing = false;
  let debounceTimer = null;
  let app28FieldCodes = null;

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

  const getBarcodeInputElement = () => {

    const barcodeFieldCode = getBarcodeFieldCode(kintone.app.record.get().record);
    const fieldElement = kintone.app.record.getFieldElement(barcodeFieldCode);

    return fieldElement?.querySelector('input') ?? null;

  };

  const focusBarcodeInput = () => {

    setTimeout(function() {

      const input = getBarcodeInputElement();

      if (input) {
        input.focus();
      }

    }, 100);

  };

  const bindManualInputHandlers = () => {

    setTimeout(function() {

      BARCODE_FIELD_CODES.forEach(function(fieldCode) {

        const fieldElement = kintone.app.record.getFieldElement(fieldCode);
        const input = fieldElement?.querySelector('input');

        if (!input || input.dataset.outboundInputBound === '1') {
          return;
        }

        input.dataset.outboundInputBound = '1';

        input.addEventListener('keydown', function(event) {

          if (event.key !== 'Enter') {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          triggerRegistration();

        });

      });

    }, 350);

  };

  const ensureRegisterButton = () => {

    const space = kintone.app.record.getSpaceElement(MESSAGE_SPACE_ID);

    if (!space || document.getElementById(REGISTER_BUTTON_ID)) {
      return;
    }

    const button = document.createElement('button');

    button.id = REGISTER_BUTTON_ID;
    button.type = 'button';
    button.textContent = '登録';
    button.style.margin = '8px 0';
    button.style.padding = '8px 20px';
    button.style.fontSize = '15px';
    button.style.cursor = 'pointer';

    button.addEventListener('click', function() {
      triggerRegistration();
    });

    space.appendChild(button);

  };

  const triggerRegistration = () => {

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    processBarcode(kintone.app.record.get().record);

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
      alert('出荷日を入力してください。');
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

  const lockShipDateField = (record) => {

    sessionShipDate = String(getFieldValue(record, FIELDS.shipDate) ?? '').trim();

    if (record[FIELDS.shipDate]) {
      record[FIELDS.shipDate].disabled = true;
    }

    sessionShipDateLocked = true;

  };

  const fetchRecords = (appId, query) => kintone.api(
    kintone.api.url('/k/v1/records', true),
    'GET',
    {
      app: appId,
      query: query,
    }
  );

  const loadApp28FieldCodes = () => {

    if (app28FieldCodes) {
      return Promise.resolve(app28FieldCodes);
    }

    return kintone.api(
      kintone.api.url('/k/v1/app/form/fields', true),
      'GET',
      {
        app: OVERSEAS_APP_ID,
      }
    ).then(function(response) {

      app28FieldCodes = new Set();
      const properties = response.properties || {};

      Object.keys(properties).forEach(function(fieldCode) {
        app28FieldCodes.add(fieldCode);

        const field = properties[fieldCode];

        if (field && field.type === 'SUBTABLE' && field.fields) {
          Object.keys(field.fields).forEach(function(subFieldCode) {
            app28FieldCodes.add(subFieldCode);
          });
        }

      });

      return app28FieldCodes;

    }).catch(function(error) {

      console.warn('[海外外注出庫] App28フィールド定義取得失敗。既定フィールドを使用します。', error);

      app28FieldCodes = new Set([
        FIELDS.shipDate,
        FIELDS.scheduledArrivalDate,
        FIELDS.cartonNo,
        FIELDS.manageNo,
        FIELDS.overseasManageNo,
        FIELDS.customerCode,
        FIELDS.customerName,
        FIELDS.clientName,
        FIELDS.kimonoType,
        FIELDS.kimonoSpec,
        FIELDS.deadline,
        FIELDS.overseasStatus,
        'overseas_details',
      ]);

      return app28FieldCodes;

    });

  };

  const hasApp28Field = (fieldCode) => (
    app28FieldCodes !== null && app28FieldCodes.has(fieldCode)
  );

  const setPayloadField = (payload, fieldCode, value) => {

    if (!hasApp28Field(fieldCode)) {
      return;
    }

    payload[fieldCode] = {
      value: value ?? '',
    };

  };

  const setPayloadManageNo = (payload, manageNo) => {

    if (hasApp28Field(FIELDS.manageNo)) {
      setPayloadField(payload, FIELDS.manageNo, manageNo);
      return;
    }

    if (hasApp28Field(FIELDS.overseasManageNo)) {
      setPayloadField(payload, FIELDS.overseasManageNo, manageNo);
    }

  };

  const setPayloadClientName = (payload, clientName) => {

    if (hasApp28Field(FIELDS.clientName)) {
      setPayloadField(payload, FIELDS.clientName, clientName);
    }

  };

  const getOrderClientName = (orderRecord) => (
    getOrderFieldValue(orderRecord, FIELDS.clientName)
  );

  const getSubtableClientNameFieldCode = () => {

    if (hasApp28Field(FIELDS.clientName)) {
      return FIELDS.clientName;
    }

    return null;

  };

  const getOrderFieldValue = (orderRecord, fieldCodes) => {

    const codes = Array.isArray(fieldCodes) ? fieldCodes : [fieldCodes];

    for (let index = 0; index < codes.length; index += 1) {
      const value = String(getFieldValue(orderRecord, codes[index]) ?? '').trim();

      if (value !== '') {
        return value;
      }

    }

    return '';

  };

  const buildOverseasDetailsValue = (orderRecord, manageNo) => {

    const clientName = getOrderClientName(orderRecord);
    const clientNameFieldCode = getSubtableClientNameFieldCode();

    const rowValue = {};

    const subtableFields = {
      manage_no: manageNo,
      customer_code: getOrderFieldValue(orderRecord, FIELDS.customerCode),
      kimono_type: getOrderFieldValue(orderRecord, FIELDS.kimonoType),
    };

    if (clientNameFieldCode) {
      subtableFields[clientNameFieldCode] = clientName;
    }

    Object.keys(subtableFields).forEach(function(fieldCode) {
      rowValue[fieldCode] = {
        value: subtableFields[fieldCode] ?? '',
      };
    });

    return [{
      value: rowValue,
    }];

  };

  const fetchOrderRecord = async (manageNo) => {

    const response = await fetchRecords(
      ORDER_APP_ID,
      FIELDS.manageNo + ' = "' + escapeQueryValue(manageNo) + '" limit 1'
    );

    return response.records?.[0] ?? null;

  };

  const isUnreceivedOutboundRecord = (record) => (
    String(getFieldValue(record, FIELDS.overseasInDate) ?? '').trim() === ''
  );

  const findActiveOutboundRecord = async (manageNo) => {

    const escapedManageNo = escapeQueryValue(manageNo);
    const queries = [
      FIELDS.manageNo + ' = "' + escapedManageNo + '" order by $id desc limit 10',
      FIELDS.overseasManageNo + ' = "' + escapedManageNo + '" order by $id desc limit 10',
      'overseas_manage_no = "' + escapedManageNo + '" order by $id desc limit 10',
    ];

    for (let index = 0; index < queries.length; index += 1) {

      try {

        const response = await fetchRecords(OVERSEAS_APP_ID, queries[index]);
        const activeRecord = (response.records ?? []).find(isUnreceivedOutboundRecord);

        if (activeRecord) {
          return activeRecord;
        }

      } catch (error) {

        console.warn('[海外外注出庫] 出庫中レコード検索:', queries[index], error);

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

  const buildOutboundRecordPayload = (formRecord, orderRecord, manageNo) => {

    const payload = {};
    const clientName = getOrderClientName(orderRecord);

    setPayloadField(
      payload,
      FIELDS.shipDate,
      getFieldValue(formRecord, FIELDS.shipDate)
    );
    setPayloadField(
      payload,
      FIELDS.scheduledArrivalDate,
      getFieldValue(formRecord, FIELDS.scheduledArrivalDate)
    );
    setPayloadField(
      payload,
      FIELDS.cartonNo,
      getFieldValue(formRecord, FIELDS.cartonNo)
    );
    setPayloadManageNo(payload, manageNo);
    setPayloadField(
      payload,
      FIELDS.customerCode,
      getOrderFieldValue(orderRecord, FIELDS.customerCode)
    );
    setPayloadClientName(payload, clientName);
    setPayloadField(
      payload,
      FIELDS.kimonoType,
      getOrderFieldValue(orderRecord, FIELDS.kimonoType)
    );
    setPayloadField(
      payload,
      FIELDS.kimonoSpec,
      getOrderFieldValue(orderRecord, FIELDS.kimonoSpec)
    );
    setPayloadField(
      payload,
      FIELDS.deadline,
      getOrderFieldValue(orderRecord, FIELDS.deadline)
    );
    setPayloadField(payload, FIELDS.overseasStatus, OVERSEAS_OUTBOUND_STATUS);

    const hasTopLevelDetailFields = hasApp28Field(FIELDS.customerCode)
      || hasApp28Field(FIELDS.customerName)
      || hasApp28Field(FIELDS.clientName)
      || hasApp28Field(FIELDS.kimonoType);

    if (hasApp28Field('overseas_details') && !hasTopLevelDetailFields) {
      payload.overseas_details = {
        value: buildOverseasDetailsValue(orderRecord, manageNo),
      };
    }

    return payload;

  };

  const createOutboundRecord = async (formRecord, orderRecord, manageNo) => {

    const record = buildOutboundRecordPayload(formRecord, orderRecord, manageNo);

    if (Object.keys(record).length === 0) {
      throw new Error('App28に登録可能なフィールドがありません。フォーム設定を確認してください。');
    }

    return kintone.api(
      kintone.api.url('/k/v1/record', true),
      'POST',
      {
        app: OVERSEAS_APP_ID,
        record: record,
      }
    );

  };

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

      await loadApp28FieldCodes();

      if (sessionRegisteredManageNos.has(manageNo)) {
        alert('管理番号 ' + manageNo + ' は今回の出庫に既に登録されています。');
        showMessage('管理番号 ' + manageNo + ' は今回の出庫に既に登録されています。', true);
        clearBarcodeInput(record);
        kintone.app.record.set({ record: record });
        focusBarcodeInput();
        return;
      }

      const orderRecord = await fetchOrderRecord(manageNo);

      if (!orderRecord) {
        alert('管理番号 ' + manageNo + ' は受注明細に存在しません。');
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
      showMessage('登録済：' + manageNo, false);

      if (!sessionShipDateLocked) {
        lockShipDateField(record);
      }

      clearBarcodeInput(record);
      kintone.app.record.set({ record: record });
      focusBarcodeInput();

    } catch (error) {

      console.error('[海外外注出庫]', error);

      const apiMessage = error?.message || String(error);
      const invalidFieldMatch = apiMessage.match(/\[([^\]]+)\]/);
      const detailMessage = invalidFieldMatch
        ? '\nフィールド「' + invalidFieldMatch[1] + '」が App28 に存在しない可能性があります。'
        : '';

      alert('出庫登録エラー\n' + apiMessage + detailMessage);
      showMessage('出庫登録エラー: ' + apiMessage, true);
      clearBarcodeInput(record);
      kintone.app.record.set({ record: record });
      focusBarcodeInput();

    } finally {
      isProcessing = false;
    }

  };

  const queueProcessBarcode = (record) => {

    const manageNo = getBarcodeValue(record);

    if (!manageNo || isProcessing) {
      return;
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(function() {

      const currentRecord = kintone.app.record.get().record;
      const currentManageNo = getBarcodeValue(currentRecord);

      if (!currentManageNo || currentManageNo.length < MANAGE_NO_MIN_LENGTH) {
        return;
      }

      processBarcode(currentRecord);

    }, 350);

  };

  const buildChangeEvents = () => BARCODE_FIELD_CODES.map(function(fieldCode) {
    return 'app.record.create.change.' + fieldCode;
  });

  kintone.events.on('app.record.create.show', function(event) {

    if (!isOutboundApp()) {
      return event;
    }

    sessionRegisteredManageNos = new Set();
    sessionShipDateLocked = false;
    sessionShipDate = '';
    loadApp28FieldCodes();

    setTimeout(function() {
      ensureRegisterButton();
      focusBarcodeInput();
      bindManualInputHandlers();
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

  kintone.events.on('app.record.create.change.' + FIELDS.shipDate, function(event) {

    if (!isOutboundApp() || !sessionShipDateLocked) {
      return event;
    }

    if (event.record[FIELDS.shipDate]) {
      event.record[FIELDS.shipDate].value = sessionShipDate;
      event.record[FIELDS.shipDate].disabled = true;
    }

    alert('出荷日はバーコード読取開始後は変更できません。');
    return event;

  });

  kintone.events.on('app.record.create.submit', function(event) {

    if (!isOutboundApp()) {
      return event;
    }

    const manageNo = getBarcodeValue(event.record);

    if (manageNo) {

      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      processBarcode(event.record);
      return false;

    }

    alert('管理番号を入力し、Enterキー・登録ボタン・または保存ボタンで登録してください。');
    return false;

  });

})();
