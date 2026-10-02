(function() {
  'use strict';

  /**
   * 和裁士出庫 App 74 — 連続バーコード出庫登録
   * 依存: wasai_config.js（先に読み込む）
   */

  if (!window.CAYANAS_Wasai) {
    console.error('[wasai_outbound] wasai_config.js を先に読み込んでください。');
    return;
  }

  const W = window.CAYANAS_Wasai;
  const APP_ID = W.APP.wasaiOutbound;

  if (kintone.app.getId() !== APP_ID) {
    return;
  }

  const BARCODE_FIELDS = [W.F.barcodeInput, 'manage_no', 'barcode'];
  const SHIP_DATE_FIELD_CODES = [W.F.shipDate, '日ship_date', 'ship_date', 'syukko_date', 'outbound_date'];
  const MANAGE_NO_MIN_LENGTH = 6;

  const todayYmd = () => {
    const d = new Date();
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  };

  const readInputValueFromDom = (fieldCode) => {
    try {
      const el = kintone.app.record.getFieldElement(fieldCode);

      if (!el) {
        return '';
      }

      const input = el.querySelector('input');

      return input ? String(input.value ?? '').trim() : '';
    } catch (error) {
      return '';
    }
  };

  const findShipDateFieldOnRecord = (record) => {
    for (let i = 0; i < SHIP_DATE_FIELD_CODES.length; i += 1) {
      const code = SHIP_DATE_FIELD_CODES[i];

      if (record && record[code]) {
        return code;
      }
    }

    return null;
  };

  /**
   * 出庫日の取得（POST用）。フォームに存在するフィールドだけ record.value を更新する。
   * 存在しないフィールドコード（例: ship_date）を新規追加しない（kintone「不正」エラー防止）。
   */
  const getShipDateValueForOutbound = (record, options) => {
    const syncToRecord = Boolean(options && options.syncToRecord);
    const fieldCodeOnForm = findShipDateFieldOnRecord(record);
    let value = '';

    if (fieldCodeOnForm) {
      value = String(W.getFieldValue(record, fieldCodeOnForm) ?? '').trim();
    }

    if (!value && fieldCodeOnForm) {
      value = readInputValueFromDom(fieldCodeOnForm);
    }

    if (!value) {
      for (let i = 0; i < SHIP_DATE_FIELD_CODES.length; i += 1) {
        const fromDom = readInputValueFromDom(SHIP_DATE_FIELD_CODES[i]);

        if (fromDom !== '') {
          value = fromDom;
          break;
        }
      }
    }

    if (!value) {
      value = todayYmd();
    }

    if (syncToRecord && fieldCodeOnForm && !String(record[fieldCodeOnForm].value ?? '').trim()) {
      record[fieldCodeOnForm].value = value;
    }

    return {
      fieldCode: fieldCodeOnForm || W.F.shipDate,
      value: value,
    };
  };

  let sessionRegistered = new Set();
  let isProcessing = false;
  let debounceTimer = null;
  let formProperties = null;

  const WASAI_NAME_FIELD_CODES = [W.F.wasaiName, 'wasai_name', 'wasai_name_copy'];
  const OUTBOUND_LINES_TABLE_CODES = [W.F.outboundLines, 'wasai_outbound_lines'];
  const PAYMENT_SNAPSHOT_TABLE_CODES = [W.F.paymentSnapshots, 'wasai_payment_item_snapshots'];

  const loadFormProperties = async () => {
    if (formProperties) {
      return formProperties;
    }

    const resp = await kintone.api(
      kintone.api.url('/k/v1/app/form/fields.json', true),
      'GET',
      { app: APP_ID }
    );

    formProperties = resp.properties || {};
    return formProperties;
  };

  const resolveTableCode = (candidates, properties) => {
    for (let i = 0; i < candidates.length; i += 1) {
      const code = candidates[i];

      if (properties[code] && properties[code].type === 'SUBTABLE') {
        return code;
      }
    }

    return candidates[0];
  };

  const getFormFieldValue = (formRecord, fieldCodes) => {
    const codes = Array.isArray(fieldCodes) ? fieldCodes : [fieldCodes];

    for (let i = 0; i < codes.length; i += 1) {
      const value = String(W.getFieldValue(formRecord, codes[i]) ?? '').trim();

      if (value !== '') {
        return value;
      }
    }

    return '';
  };

  const isEmptyFieldValue = (value, fieldProp) => {
    if (value === null || value === undefined) {
      return true;
    }

    if (value === '') {
      return true;
    }

    if ((fieldProp?.type === 'NUMBER' || fieldProp?.type === 'CALC') && value === 0) {
      return false;
    }

    return false;
  };

  const getSnapshotScalar = (fieldCode, manageNo, item) => {
    const map = {
      [W.LINE.snapshotManageNo]: manageNo,
      manage_no_0: manageNo,
      manage_no: manageNo,
      [W.LINE.orderDetailRowId]: item.orderDetailRowId || '',
      order_detail_row_id: item.orderDetailRowId || '',
      [W.LINE.itemCode]: item.itemCode || '',
      item_code: item.itemCode || '',
      [W.LINE.itemName]: item.itemName || '',
      item_name: item.itemName || '',
      [W.LINE.subcategory]: item.subcategory || '',
      subcategory: item.subcategory || '',
      [W.LINE.snapshotTransactionPrice]: item.transactionPrice,
      transaction_price_0: item.transactionPrice,
      transaction_price: item.transactionPrice,
      [W.LINE.snapshotPaymentRate]: item.paymentRate,
      payment_rate_0: item.paymentRate,
      payment_rate: item.paymentRate,
      [W.LINE.lineBasePaymentAmount]: item.lineBasePaymentAmount,
      line_base_payment_amount: item.lineBasePaymentAmount,
      [W.LINE.outboundLineKey]: '',
      outbound_line_key: '',
    };

    if (Object.prototype.hasOwnProperty.call(map, fieldCode)) {
      return map[fieldCode];
    }

    return null;
  };

  const buildPaymentSnapshotRows = (manageNo, items, subtableProp) => {
    const fields = subtableProp?.fields || {};

    return items.map(function(item) {
      const rowValue = {};

      Object.keys(fields).forEach(function(fieldCode) {
        const fieldProp = fields[fieldCode];
        let scalar = getSnapshotScalar(fieldCode, manageNo, item);

        if (scalar === null || scalar === undefined || scalar === '') {
          if (!fieldProp.required) {
            return;
          }

          scalar = '';
        }

        if (fieldProp.type === 'DROP_DOWN') {
          scalar = W.pickDropdownValue(fieldProp, [String(scalar)], String(scalar));
        } else if (fieldProp.type === 'NUMBER' || fieldProp.type === 'CALC') {
          scalar = String(scalar);
        } else {
          scalar = String(scalar);
        }

        if (isEmptyFieldValue(scalar, fieldProp) && !fieldProp.required) {
          return;
        }

        rowValue[fieldCode] = { value: scalar };
      });

      return { value: rowValue };
    });
  };

  const filterRecordForForm = (record, properties) => {
    const filtered = {};

    Object.keys(record).forEach(function(fieldCode) {
      const prop = properties[fieldCode];

      if (!prop) {
        return;
      }

      if (prop.type === 'SUBTABLE') {
        if (record[fieldCode] && Array.isArray(record[fieldCode].value)) {
          filtered[fieldCode] = record[fieldCode];
        }

        return;
      }

      const rawValue = record[fieldCode]?.value;

      if (rawValue === null || rawValue === undefined || rawValue === '') {
        return;
      }

      if (prop.type === 'DROP_DOWN') {
        const picked = W.pickDropdownValue(prop, [rawValue], rawValue);
        filtered[fieldCode] = { value: picked };
        return;
      }

      filtered[fieldCode] = { value: rawValue };
    });

    return filtered;
  };

  const getBarcodeFieldCode = (record) => {
    for (let i = 0; i < BARCODE_FIELDS.length; i += 1) {
      if (record[BARCODE_FIELDS[i]]) {
        return BARCODE_FIELDS[i];
      }
    }

    return BARCODE_FIELDS[0];
  };

  const getBarcodeValue = (record) => {
    for (let i = 0; i < BARCODE_FIELDS.length; i += 1) {
      const value = String(W.getFieldValue(record, BARCODE_FIELDS[i]) ?? '').trim();

      if (value !== '') {
        return value;
      }
    }

    return '';
  };

  const clearBarcodeInput = (record) => {
    const code = getBarcodeFieldCode(record);

    if (record[code]) {
      record[code].value = '';
    }
  };

  const focusBarcodeInput = () => {
    setTimeout(function() {
      const record = kintone.app.record.get().record;
      const code = getBarcodeFieldCode(record);
      const el = kintone.app.record.getFieldElement(code);
      const input = el?.querySelector('input');

      if (input) {
        input.focus();
      }
    }, 100);
  };

  const showMessage = (text, isError) => {
    const space = kintone.app.record.getSpaceElement('message_space');

    if (!space) {
      return;
    }

    space.innerHTML = '<div style="padding:8px;color:' + (isError ? '#c00' : '#060') + ';">'
      + String(text).replace(/</g, '&lt;')
      + '</div>';
  };

  const validateHeader = (record) => {
    const shipDate = getShipDateValueForOutbound(record, { syncToRecord: true }).value;
    const wasaiCode = String(W.getFieldValue(record, W.F.wasaiCode) ?? '').trim();

    if (!shipDate) {
      alert('出庫日を入力してください。');
      return false;
    }

    if (!wasaiCode) {
      alert('和裁士コードを入力してから、管理番号をスキャンしてください。');
      return false;
    }

    return true;
  };

  const fetchWasaiMaster = async (wasaiCode) => {
    const records = await W.fetchRecords(
      W.APP.wasaiMaster,
      W.F.wasaiCode + ' = "' + W.escapeQueryValue(wasaiCode) + '" limit 1'
    );

    return records[0] ?? null;
  };

  const isOrderAlreadyWasaiOutbound = (orderRecord) => {
    const processStatus = String(W.getFieldValue(orderRecord, W.ORDER.processStatus) ?? '').trim();
    const locationStatus = String(W.getFieldValue(orderRecord, W.ORDER.locationStatus) ?? '').trim();

    return processStatus === W.ORDER_WASAI_PROCESS
      && locationStatus === W.ORDER_WASAI_LOCATION;
  };

  const flattenOutboundLines = (records) => {
    const lines = [];

    records.forEach(function(rec) {
      const table = rec[W.F.outboundLines];

      if (!table || !Array.isArray(table.value)) {
        return;
      }

      table.value.forEach(function(row) {
        lines.push({
          outboundRecord: rec,
          outboundRecordId: rec.$id.value,
          lineRow: row,
          lineId: row.id,
          manageNo: String(W.getFieldValue(row.value, W.LINE.manageNo) ?? '').trim(),
          lineStatus: String(W.getFieldValue(row.value, W.LINE.lineStatus) ?? '').trim(),
          inboundDate: String(W.getFieldValue(row.value, W.LINE.inboundDate) ?? '').trim(),
        });
      });
    });

    return lines;
  };

  const findActiveWasaiLine = async (manageNo) => {
    const candidates = new Set(W.expandManageNoCandidates(manageNo));
    const records = await W.fetchRecords(
      APP_ID,
      'order by $id desc limit 300'
    );

    const lines = flattenOutboundLines(records);

    return lines.find(function(entry) {
      if (!candidates.has(entry.manageNo)) {
        return false;
      }

      if (entry.inboundDate !== '') {
        return false;
      }

      return entry.lineStatus === W.LINE_STATUS.outbound
        || entry.lineStatus === '';
    }) ?? null;
  };

  const isBlockedByOtherOutbound = async (orderRecord, manageNo) => {
    const processStatus = String(W.getFieldValue(orderRecord, W.ORDER.processStatus) ?? '').trim();
    const locationStatus = String(W.getFieldValue(orderRecord, W.ORDER.locationStatus) ?? '').trim();

    if (processStatus === '外注中' && locationStatus === '外注先') {
      return '国内外注出庫中';
    }

    if (processStatus === '海外外注中' && locationStatus === '海外') {
      return '海外外注出庫中';
    }

    if (isOrderAlreadyWasaiOutbound(orderRecord)) {
      const active = await findActiveWasaiLine(manageNo);

      if (active) {
        return '和裁士出庫中（未入庫）';
      }
    }

    return '';
  };

  const buildOutboundLineRow = (orderRecord, manageNo, items, properties, linesTableCode) => {
    const summary = items.map(function(item) { return item.itemName; }).join('、');
    const transactionPrice = W.sumField(items, 'transactionPrice');
    const paymentRate = items[0] ? items[0].paymentRate : W.getPaymentRate(W.getFieldValue(orderRecord, W.ORDER.customerCode));
    const basePaymentAmount = W.sumField(items, 'lineBasePaymentAmount');
    const lineTableProp = properties[linesTableCode] || {};
    const lineFields = lineTableProp.fields || {};

    const lineStatus = W.pickDropdownValue(
      lineFields[W.LINE.lineStatus],
      [W.LINE_STATUS.outbound, '出庫中'],
      W.LINE_STATUS.outbound
    );
    const billingStatus = W.pickDropdownValue(
      lineFields[W.LINE.billingStatus],
      [W.BILLING_STATUS.unbilled, '未計上'],
      W.BILLING_STATUS.unbilled
    );
    const kimonoSpecRaw = String(W.getFieldValue(orderRecord, W.ORDER.kimonoSpec) ?? '').trim();
    const kimonoSpec = W.pickDropdownValue(
      lineFields[W.LINE.kimonoSpec],
      [kimonoSpecRaw, '袷', '単衣'],
      kimonoSpecRaw || '袷'
    );

    return {
      value: {
        [W.LINE.manageNo]: { value: manageNo },
        [W.LINE.orderRecordId]: { value: String(orderRecord.$id.value) },
        [W.LINE.customerCode]: { value: W.getFieldValue(orderRecord, W.ORDER.customerCode) },
        [W.LINE.customerName]: { value: W.getFieldValue(orderRecord, W.ORDER.customerName) },
        [W.LINE.clientName]: { value: W.getFieldValue(orderRecord, W.ORDER.clientName) },
        [W.LINE.kimonoTypeCode]: { value: W.getFieldValue(orderRecord, W.ORDER.kimonoTypeCode) },
        [W.LINE.kimonoSpec]: { value: kimonoSpec },
        [W.LINE.deadline]: { value: W.getFieldValue(orderRecord, W.ORDER.deadline) },
        [W.LINE.processingSummary]: { value: summary },
        [W.LINE.lineStatus]: { value: lineStatus },
        [W.LINE.billingStatus]: { value: billingStatus },
        [W.LINE.eligibleLineCount]: { value: String(items.length) },
        [W.LINE.transactionPrice]: { value: String(transactionPrice) },
        [W.LINE.paymentRate]: { value: String(paymentRate) },
        [W.LINE.basePaymentAmount]: { value: String(basePaymentAmount) },
        [W.LINE.adjustmentAmount]: { value: '0' },
        [W.LINE.paymentAmount]: { value: String(basePaymentAmount) },
      },
    };
  };

  const buildPostRecord = (formRecord, orderRecord, manageNo, items, properties) => {
    const record = {};
    const linesTableCode = resolveTableCode(OUTBOUND_LINES_TABLE_CODES, properties);
    const snapshotsTableCode = resolveTableCode(PAYMENT_SNAPSHOT_TABLE_CODES, properties);

    const shipDateMeta = getShipDateValueForOutbound(formRecord);

    if (properties[shipDateMeta.fieldCode]) {
      record[shipDateMeta.fieldCode] = { value: shipDateMeta.value };
    }

    const returnDate = String(W.getFieldValue(formRecord, W.F.returnDate) ?? '').trim()
      || shipDateMeta.value;

    if (properties[W.F.returnDate]) {
      record[W.F.returnDate] = { value: returnDate };
    }

    if (properties.outbound_no) {
      const outboundNo = String(W.getFieldValue(formRecord, 'outbound_no') ?? '').trim();

      record.outbound_no = {
        value: outboundNo || ('O-' + String(Date.now()).slice(-10)),
      };
    }

    if (properties[W.F.wasaiCode]) {
      record[W.F.wasaiCode] = { value: W.getFieldValue(formRecord, W.F.wasaiCode) };
    }

    const wasaiName = getFormFieldValue(formRecord, WASAI_NAME_FIELD_CODES);

    if (properties[W.F.wasaiName]) {
      record[W.F.wasaiName] = { value: wasaiName || '-' };
    }

    if (properties[W.F.tradeName]) {
      const tradeName = String(W.getFieldValue(formRecord, W.F.tradeName) ?? '').trim();
      record[W.F.tradeName] = { value: tradeName || '-' };
    }

    if (properties[W.F.barcodeInput]) {
      record[W.F.barcodeInput] = { value: ' ' };
    }

    if (properties.remarks) {
      const remarks = String(W.getFieldValue(formRecord, 'remarks') ?? '').trim();
      record.remarks = { value: remarks || '-' };
    }

    if (properties[W.F.outboundStatus]) {
      record[W.F.outboundStatus] = {
        value: W.pickDropdownValue(
          properties[W.F.outboundStatus],
          [W.OUTBOUND_HEADER_STATUS, '出庫確定', '下書き'],
          W.OUTBOUND_HEADER_STATUS
        ),
      };
    }

    if (properties[linesTableCode]) {
      record[linesTableCode] = {
        value: [buildOutboundLineRow(orderRecord, manageNo, items, properties, linesTableCode)],
      };
    }

    if (properties[snapshotsTableCode]) {
      record[snapshotsTableCode] = {
        value: buildPaymentSnapshotRows(
          manageNo,
          items,
          properties[snapshotsTableCode]
        ),
      };
    }

    return filterRecordForForm(record, properties);
  };

  const processBarcode = async (record) => {
    const manageNo = getBarcodeValue(record);

    if (!manageNo || isProcessing) {
      return;
    }

    if (!validateHeader(record)) {
      clearBarcodeInput(record);
      kintone.app.record.set({ record: record });
      focusBarcodeInput();
      return;
    }

    isProcessing = true;

    try {
      const wasaiCode = String(W.getFieldValue(record, W.F.wasaiCode) ?? '').trim();
      const master = await fetchWasaiMaster(wasaiCode);

      if (!master) {
        throw new Error('和裁士マスタに存在しません: ' + wasaiCode);
      }

      const regStatus = String(W.getFieldValue(master, W.F.registrationStatus) ?? '').trim();

      if (regStatus !== '' && regStatus !== '有効') {
        throw new Error('和裁士の登録状態が「有効」ではありません: ' + regStatus);
      }

      if (sessionRegistered.has(manageNo)) {
        alert('管理番号 ' + manageNo + ' は今回のセッションで既に登録済みです。');
        showMessage('重複: ' + manageNo, true);
        clearBarcodeInput(record);
        kintone.app.record.set({ record: record });
        focusBarcodeInput();
        return;
      }

      const orderRecord = await W.fetchOrderByManageNo(manageNo);

      if (!orderRecord) {
        alert('管理番号 ' + manageNo + ' は受注明細(App16)に存在しません。');
        showMessage('受注なし: ' + manageNo, true);
        clearBarcodeInput(record);
        kintone.app.record.set({ record: record });
        focusBarcodeInput();
        return;
      }

      const blocked = await isBlockedByOtherOutbound(orderRecord, manageNo);

      if (blocked) {
        alert('管理番号 ' + manageNo + ' は出庫できません（' + blocked + '）。');
        showMessage(blocked, true);
        clearBarcodeInput(record);
        kintone.app.record.set({ record: record });
        focusBarcodeInput();
        return;
      }

      const activeLine = await findActiveWasaiLine(manageNo);

      if (activeLine) {
        alert('管理番号 ' + manageNo + ' は和裁士出庫中（未入庫）です。');
        showMessage('未入庫の出庫あり', true);
        clearBarcodeInput(record);
        kintone.app.record.set({ record: record });
        focusBarcodeInput();
        return;
      }

      const properties = await loadFormProperties();
      const items = await W.buildEligiblePaymentItems(orderRecord);

      if (items.length === 0) {
        alert(
          '和裁士出庫対象の加工がありません。\n'
          + '（App13中分類が「国内仕立」または「修理」の明細が必要です）'
        );
        showMessage('対象加工なし', true);
        clearBarcodeInput(record);
        kintone.app.record.set({ record: record });
        focusBarcodeInput();
        return;
      }

      const payload = buildPostRecord(record, orderRecord, manageNo, items, properties);

      if (Object.keys(payload).length === 0) {
        throw new Error('App74にPOST可能なフィールドがありません。フォーム設定を確認してください。');
      }

      await kintone.api(
        kintone.api.url('/k/v1/record.json', true),
        'POST',
        { app: APP_ID, record: payload }
      );

      const orderUpdate = await W.updateOrderForWasai(orderRecord, 'outbound');

      sessionRegistered.add(manageNo);

      if (orderUpdate.skipped) {
        const app16Note =
          '受注明細(App16)のドロップダウンに次を追加すると、出庫時に受注も自動更新されます。\n'
          + '・process_status（工程）: 和裁士作業中\n'
          + '・location_status（保管場所）: 和裁士';

        showMessage('登録済：' + manageNo + '（App16は未更新）', false);
        alert('App74に出庫を登録しました。\n\n' + app16Note);
      } else {
        showMessage('登録済：' + manageNo + '（' + items.length + '明細）', false);
      }

      clearBarcodeInput(record);
      kintone.app.record.set({ record: record });
      focusBarcodeInput();

    } catch (error) {
      console.error('[wasai_outbound]', error);
      const detail = W.formatKintoneError(error);
      alert('出庫登録エラー\n' + detail);
      showMessage(detail, true);
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
      const appRecord = kintone.app.record.get();
      const current = appRecord.record;
      const currentManageNo = getBarcodeValue(current);

      if (!currentManageNo || currentManageNo.length < MANAGE_NO_MIN_LENGTH) {
        return;
      }

      getShipDateValueForOutbound(current, { syncToRecord: true });
      processBarcode(current);
    }, 350);
  };

  const buildChangeEvents = () => BARCODE_FIELDS.map(function(fieldCode) {
    return 'app.record.create.change.' + fieldCode;
  });

  kintone.events.on('app.record.create.show', function(event) {
    sessionRegistered = new Set();
    loadFormProperties().catch(function(err) {
      console.warn('[wasai_outbound] form fields load', err);
    });
    getShipDateValueForOutbound(event.record, { syncToRecord: true });
    showMessage(
      '和裁士コードを入力後、管理番号をスキャンすると1件ずつ登録されます。'
      + '登録後は「キャンセル」で一覧へ（保存ボタンは使わないでください）。',
      false
    );
    setTimeout(focusBarcodeInput, 300);
    return event;
  });

  kintone.events.on(buildChangeEvents(), function(event) {
    queueProcessBarcode(event.record);
    return event;
  });

  kintone.events.on('app.record.create.submit', function(event) {
    const manageNo = getBarcodeValue(event.record);

    if (manageNo) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      processBarcode(event.record);
    }

    event.error =
      'この画面では「保存」は使いません。\n'
      + '管理番号のスキャンで1件ずつ App74 に登録されます。\n'
      + '登録後は「キャンセル」で一覧を開き、登録内容を確認してください。';
    return event;
  });

})();
