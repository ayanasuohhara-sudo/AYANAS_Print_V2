(function() {
  'use strict';

  /**
   * 海外外注出庫（App 28）一覧画面
   * サブテーブル overseas_details / App 16 受注の値を一覧列へ表示する。
   */

  const OVERSEAS_APP_ID = 28;
  const ORDER_APP_ID = 16;
  const LIST_VERSION = '3';

  const DISPLAY_FIELD_CODES = [
    'manage_no',
    'overseas_manage_no',
    'customer_code',
    'client_name',
    'customer_name',
    'kimono_type',
    'kimono_spec',
  ];

  const isOutboundApp = () => kintone.app.getId() === OVERSEAS_APP_ID;

  const expandManageNoCandidates = (manageNo) => {

    const normalized = String(manageNo ?? '').trim();

    if (normalized === '') {
      return [];
    }

    const candidates = [normalized];
    const withoutLeadingZeros = normalized.replace(/^0+(?=\d)/, '');

    if (withoutLeadingZeros !== '' && withoutLeadingZeros !== normalized) {
      candidates.push(withoutLeadingZeros);
    }

    if (/^\d+$/.test(normalized)) {
      const padded9 = normalized.padStart(9, '0');

      if (padded9 !== normalized && !candidates.includes(padded9)) {
        candidates.push(padded9);
      }
    }

    return candidates;

  };

  const getSubtableRows = (record) => {

    const rows = record?.overseas_details?.value;

    return Array.isArray(rows) ? rows : [];

  };

  const getSubtableFieldValue = (subtableRow, fieldCode) => (
    String(subtableRow?.value?.[fieldCode]?.value ?? '').trim()
  );

  const getTopLevelValue = (record, fieldCode) => (
    String(record?.[fieldCode]?.value ?? '').trim()
  );

  const getManageNoFromRecord = (record) => {

    const topLevelValues = [
      getTopLevelValue(record, 'manage_no'),
      getTopLevelValue(record, 'overseas_manage_no'),
    ].filter(function(value) {
      return value !== '';
    });

    if (topLevelValues.length > 0) {
      return topLevelValues[0];
    }

    const subtableRows = getSubtableRows(record);

    for (let index = 0; index < subtableRows.length; index += 1) {
      const subtableManageNo = getSubtableFieldValue(subtableRows[index], 'manage_no');

      if (subtableManageNo !== '') {
        return subtableManageNo;
      }
    }

    return '';

  };

  const getOrderFieldValue = (orderRecord, fieldCodes) => {

    const codes = Array.isArray(fieldCodes) ? fieldCodes : [fieldCodes];

    for (let index = 0; index < codes.length; index += 1) {
      const value = String(orderRecord?.[codes[index]]?.value ?? '').trim();

      if (value !== '') {
        return value;
      }

    }

    return '';

  };

  const getClientNameFromOrder = (orderRecord) => (
    getOrderFieldValue(orderRecord, 'client_name')
  );

  const getCustomerNameFromOrder = (orderRecord) => (
    getOrderFieldValue(orderRecord, 'customer_name')
  );

  const getNameFromOrder = (orderRecord, fieldCode) => {

    if (fieldCode === 'customer_name') {
      return getCustomerNameFromOrder(orderRecord);
    }

    if (fieldCode === 'client_name') {
      const clientName = getClientNameFromOrder(orderRecord);

      if (clientName !== '') {
        return clientName;
      }

      return getCustomerNameFromOrder(orderRecord);
    }

    return '';

  };

  const getDisplayValue = (record, fieldCode, orderMap) => {

    const topLevelValue = getTopLevelValue(record, fieldCode);

    if (topLevelValue !== '') {
      return topLevelValue;
    }

    const subtableRows = getSubtableRows(record);

    for (let index = 0; index < subtableRows.length; index += 1) {
      const subtableValue = getSubtableFieldValue(subtableRows[index], fieldCode);

      if (subtableValue !== '') {
        return subtableValue;
      }
    }

    if (fieldCode === 'client_name') {
      const customerName = getDisplayValue(record, 'customer_name', orderMap);

      if (customerName !== '') {
        return customerName;
      }
    }

    if (fieldCode === 'manage_no') {
      return getDisplayValue(record, 'overseas_manage_no', orderMap);
    }

    if ((fieldCode === 'client_name' || fieldCode === 'customer_name') && orderMap) {
      const manageNo = getManageNoFromRecord(record);
      const candidates = expandManageNoCandidates(manageNo);

      for (let index = 0; index < candidates.length; index += 1) {
        const orderRecord = orderMap.get(candidates[index]);

        if (!orderRecord) {
          continue;
        }

        const orderName = getNameFromOrder(orderRecord, fieldCode);

        if (orderName !== '') {
          return orderName;
        }

      }

    }

    return '';

  };

  const fetchRecordsByIds = async (recordIds) => {

    if (recordIds.length === 0) {
      return [];
    }

    const response = await kintone.api(
      kintone.api.url('/k/v1/records', true),
      'GET',
      {
        app: OVERSEAS_APP_ID,
        query: '$id in (' + recordIds.join(',') + ')',
      }
    );

    return Array.isArray(response.records) ? response.records : [];

  };

  const fetchOrderMapByManageNos = async (manageNos) => {

    const orderMap = new Map();
    const uniqueManageNos = [...new Set(
      manageNos
        .flatMap(function(manageNo) {
          return expandManageNoCandidates(manageNo);
        })
        .filter(function(manageNo) {
          return manageNo !== '';
        })
    )];

    for (let index = 0; index < uniqueManageNos.length; index += 100) {
      const chunk = uniqueManageNos.slice(index, index + 100);
      const inValues = chunk.map(function(manageNo) {
        return '"' + String(manageNo).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
      }).join(', ');

      const response = await kintone.api(
        kintone.api.url('/k/v1/records', true),
        'GET',
        {
          app: ORDER_APP_ID,
          query: 'manage_no in (' + inValues + ')',
        }
      );

      (response.records ?? []).forEach(function(orderRecord) {
        const manageNo = String(orderRecord?.manage_no?.value ?? '').trim();

        expandManageNoCandidates(manageNo).forEach(function(candidate) {
          if (!orderMap.has(candidate)) {
            orderMap.set(candidate, orderRecord);
          }
        });

      });

    }

    return orderMap;

  };

  const findRowElement = (recordId) => {

    const selector = 'a[href*="record=' + recordId + '"]';
    const link = document.querySelector(selector);

    if (!link) {
      return null;
    }

    return link.closest('tr');

  };

  const findFieldIndexMap = () => {

    const headerCells = document.querySelectorAll('.recordlist-header-cell-gaia');
    const fieldIndexMap = new Map();

    headerCells.forEach(function(headerCell, index) {

      const className = headerCell.className || '';
      const match = className.match(/field-(\d+)/);

      if (!match) {
        return;
      }

      fieldIndexMap.set(match[1], index);

    });

    return fieldIndexMap;

  };

  const loadFieldCodeByIdMap = async () => {

    const response = await kintone.api(
      kintone.api.url('/k/v1/app/form/fields', true),
      'GET',
      {
        app: OVERSEAS_APP_ID,
      }
    );

    const fieldCodeById = new Map();
    const properties = response.properties || {};

    Object.keys(properties).forEach(function(fieldCode) {
      const field = properties[fieldCode];

      if (!field || !field.id) {
        return;
      }

      fieldCodeById.set(String(field.id), fieldCode);

    });

    return fieldCodeById;

  };

  const setCellText = (rowElement, columnIndex, text) => {

    const cells = rowElement.querySelectorAll('.recordlist-cell-gaia');

    if (!cells[columnIndex]) {
      return;
    }

    const valueElement = cells[columnIndex].querySelector('.recordlist-cell-value-gaia')
      || cells[columnIndex];

    if (text === '') {
      return;
    }

    valueElement.textContent = text;

  };

  const enrichRecordList = async (records) => {

    if (!Array.isArray(records) || records.length === 0) {
      return;
    }

    const recordIds = records
      .map(function(record) {
        return Number(record.$id.value);
      })
      .filter(function(recordId) {
        return !Number.isNaN(recordId);
      });

    const fullRecords = await fetchRecordsByIds(recordIds);
    const manageNos = fullRecords.map(getManageNoFromRecord).filter(function(manageNo) {
      return manageNo !== '';
    });
    const [fieldCodeById, orderMap] = await Promise.all([
      loadFieldCodeByIdMap(),
      fetchOrderMapByManageNos(manageNos),
    ]);
    const fieldIndexMap = findFieldIndexMap();
    const recordMap = new Map();

    fullRecords.forEach(function(record) {
      recordMap.set(String(record.$id.value), record);
    });

    recordIds.forEach(function(recordId) {

      const record = recordMap.get(String(recordId));
      const rowElement = findRowElement(recordId);

      if (!record || !rowElement) {
        return;
      }

      fieldIndexMap.forEach(function(columnIndex, fieldId) {
        const fieldCode = fieldCodeById.get(fieldId);

        if (!fieldCode || !DISPLAY_FIELD_CODES.includes(fieldCode)) {
          return;
        }

        const displayValue = getDisplayValue(record, fieldCode, orderMap);
        const currentTopLevelValue = getTopLevelValue(record, fieldCode);

        if (currentTopLevelValue !== '') {
          return;
        }

        setCellText(rowElement, columnIndex, displayValue);

      });

    });

  };

  kintone.events.on('app.record.index.show', function(event) {

    if (!isOutboundApp()) {
      return event;
    }

    console.info('[海外外注出庫] list version', LIST_VERSION);

    setTimeout(function() {

      enrichRecordList(event.records).catch(function(error) {
        console.warn('[海外外注出庫] 一覧表示更新失敗', error);
      });

    }, 300);

    return event;

  });

})();
