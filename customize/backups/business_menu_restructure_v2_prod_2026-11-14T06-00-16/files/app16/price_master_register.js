(function() {
  'use strict';

  const DELIVERY_APP_ID = 19;
  const ORDER_APP_ID = 16;
  const PRICE_MASTER_APP_ID = 14;
  const PRODUCT_APP_ID = 13;

  const EXCLUDE_SUBCATEGORIES = ['しみぬき'];

  const rowPrices = new Map();

  function escapeQuery(value) {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
  }

  function rowKey(manageNo, itemName, kimonoSpec) {
    return [
      manageNo || '',
      itemName || '',
      kimonoSpec || ''
    ].join('|');
  }

  function orderRowKey(itemName, itemCode, kimonoSpec) {
    return [
      itemName || '',
      itemCode || '',
      kimonoSpec || ''
    ].join('|');
  }

  function buildPriceKey(customerCode, kimonoTypeCode, itemCode, kimonoSpec) {
    return (
      (customerCode || '') + '_' +
      (kimonoTypeCode || '') + '_' +
      (itemCode || '') + '_' +
      (kimonoSpec || '')
    );
  }

  function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function isDeliveryApp() {
    return kintone.app.getId() === DELIVERY_APP_ID;
  }

  function isOrderApp() {
    return kintone.app.getId() === ORDER_APP_ID;
  }

  function seedFromRecord(record) {
    rowPrices.clear();

    if (isDeliveryApp() && record.delivery_detail) {
      record.delivery_detail.value.forEach(function(row, index) {
        const key = row.id || ('row-' + index);
        rowPrices.set(key, toNumber(row.value.unit_price.value));
      });
      return;
    }

    if (isOrderApp() && record.detail_table) {
      record.detail_table.value.forEach(function(row, index) {
        const key = row.id || ('row-' + index);
        rowPrices.set(key, toNumber(row.value.unit_price.value));
      });
    }
  }

  async function fetchSavedRecord(appId, recordId) {
    const resp = await kintone.api(
      kintone.api.url('/k/v1/record.json', true),
      'GET',
      {
        app: appId,
        id: recordId
      }
    );

    return resp.record;
  }

  async function fetchOrder(manageNo, cache) {
    if (cache[manageNo] !== undefined) {
      return cache[manageNo];
    }

    const resp = await kintone.api(
      kintone.api.url('/k/v1/records.json', true),
      'GET',
      {
        app: ORDER_APP_ID,
        query:
          'manage_no = "' +
          escapeQuery(manageNo) +
          '" limit 1'
      }
    );

    cache[manageNo] =
      resp.records.length > 0
        ? resp.records[0]
        : null;

    return cache[manageNo];
  }

  async function fetchProduct(itemName) {
    const resp = await kintone.api(
      kintone.api.url('/k/v1/records.json', true),
      'GET',
      {
        app: PRODUCT_APP_ID,
        query:
          'item_name = "' +
          escapeQuery(itemName) +
          '" limit 1'
      }
    );

    return resp.records.length > 0
      ? resp.records[0]
      : null;
  }

  async function priceMasterExists(
    customerCode,
    kimonoTypeCode,
    itemCode,
    kimonoSpec
  ) {
    const key = buildPriceKey(
      customerCode,
      kimonoTypeCode,
      itemCode,
      kimonoSpec
    );

    const resp = await kintone.api(
      kintone.api.url('/k/v1/records.json', true),
      'GET',
      {
        app: PRICE_MASTER_APP_ID,
        query:
          'price_key = "' +
          escapeQuery(key) +
          '" limit 1'
      }
    );

    return resp.records.length > 0;
  }

  function getOrderDetailUnitPrice(order, itemName) {
    if (!order || !order.detail_table) {
      return 0;
    }

    for (let i = 0; i < order.detail_table.value.length; i++) {
      const detailRow = order.detail_table.value[i];

      if (detailRow.value.item_name.value === itemName) {
        return toNumber(detailRow.value.unit_price.value);
      }
    }

    return 0;
  }

  function resolveItemCodeFromOrder(order, itemName, product) {
    if (order && order.detail_table) {
      for (let i = 0; i < order.detail_table.value.length; i++) {
        const detailRow = order.detail_table.value[i];

        if (detailRow.value.item_name.value === itemName) {
          const code = detailRow.value.item_code.value || '';
          if (code) {
            return code;
          }
        }
      }
    }

    if (product && product.item_code) {
      return product.item_code.value || '';
    }

    return '';
  }

  function resolveItemCodeFromRow(row, product) {
    const code = row.value.item_code
      ? row.value.item_code.value || ''
      : '';

    if (code) {
      return code;
    }

    if (product && product.item_code) {
      return product.item_code.value || '';
    }

    return '';
  }

  function isRegistrationExcluded(product) {
    if (!product) {
      return true;
    }

    const subcategory =
      product.subcategory
        ? product.subcategory.value
        : '';

    return EXCLUDE_SUBCATEGORIES.indexOf(subcategory) >= 0;
  }

  async function collectPendingFromDelivery(record) {
    const customerCode = record.customer_code.value || '';

    if (!customerCode || !record.delivery_detail) {
      return [];
    }

    const orderCache = {};
    const pending = [];
    const seenKeys = new Set();

    for (let i = 0; i < record.delivery_detail.value.length; i++) {
      const row = record.delivery_detail.value[i];
      const manageNo = row.value.manage_no.value || '';
      const itemName = row.value.item_name.value || '';
      const kimonoSpec = row.value.kimono_spec.value || '';
      const unitPrice = toNumber(row.value.unit_price.value);

      if (!manageNo || !itemName || unitPrice <= 0) {
        continue;
      }

      const key = rowKey(manageNo, itemName, kimonoSpec);

      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);

      const order = await fetchOrder(manageNo, orderCache);

      if (!order) {
        continue;
      }

      const orderUnitPrice = getOrderDetailUnitPrice(order, itemName);

      if (orderUnitPrice > 0) {
        continue;
      }

      const product = await fetchProduct(itemName);

      if (isRegistrationExcluded(product)) {
        continue;
      }

      const kimonoTypeCode = order.kimono_type_code.value || '';
      const resolvedKimonoSpec =
        kimonoSpec || order.kimono_spec.value || '';
      const itemCode = resolveItemCodeFromOrder(order, itemName, product);

      if (!itemCode) {
        continue;
      }

      if (
        await priceMasterExists(
          customerCode,
          kimonoTypeCode,
          itemCode,
          resolvedKimonoSpec
        )
      ) {
        continue;
      }

      pending.push({
        itemName: itemName,
        unitPrice: unitPrice,
        customerCode: customerCode,
        kimonoTypeCode: kimonoTypeCode,
        itemCode: itemCode,
        kimonoSpec: resolvedKimonoSpec
      });
    }

    return pending;
  }

  async function collectPendingFromOrder(record) {
    const customerCode = record.customer_code.value || '';
    const kimonoTypeCode = record.kimono_type_code.value || '';
    const kimonoSpec = record.kimono_spec.value || '';

    if (!customerCode || !record.detail_table) {
      return [];
    }

    const pending = [];
    const seenKeys = new Set();

    for (let i = 0; i < record.detail_table.value.length; i++) {
      const row = record.detail_table.value[i];
      const itemName = row.value.item_name.value || '';
      const unitPrice = toNumber(row.value.unit_price.value);

      if (!itemName || unitPrice <= 0) {
        continue;
      }

      const product = await fetchProduct(itemName);

      if (isRegistrationExcluded(product)) {
        continue;
      }

      const itemCode = resolveItemCodeFromRow(row, product);

      if (!itemCode) {
        continue;
      }

      const key = orderRowKey(itemName, itemCode, kimonoSpec);

      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);

      if (
        await priceMasterExists(
          customerCode,
          kimonoTypeCode,
          itemCode,
          kimonoSpec
        )
      ) {
        continue;
      }

      pending.push({
        itemName: itemName,
        unitPrice: unitPrice,
        customerCode: customerCode,
        kimonoTypeCode: kimonoTypeCode,
        itemCode: itemCode,
        kimonoSpec: kimonoSpec
      });
    }

    return pending;
  }

  async function collectPendingRegistrations(record, appId) {
    if (appId === DELIVERY_APP_ID) {
      return collectPendingFromDelivery(record);
    }

    if (appId === ORDER_APP_ID) {
      return collectPendingFromOrder(record);
    }

    return [];
  }

  async function registerToPriceMaster(pending) {
    const errors = [];
    let registeredCount = 0;

    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];

      try {
        if (
          await priceMasterExists(
            item.customerCode,
            item.kimonoTypeCode,
            item.itemCode,
            item.kimonoSpec
          )
        ) {
          continue;
        }

        await kintone.api(
          kintone.api.url('/k/v1/record.json', true),
          'POST',
          {
            app: PRICE_MASTER_APP_ID,
            record: {
              customer_code: {
                value: item.customerCode
              },
              kimono_type_code: {
                value: item.kimonoTypeCode
              },
              item_code: {
                value: item.itemCode
              },
              kimono_spec: {
                value: item.kimonoSpec
              },
              unit_price: {
                value: String(item.unitPrice)
              }
            }
          }
        );

        registeredCount += 1;

      } catch (err) {
        errors.push(
          item.itemName +
          '：' +
          (err.message || String(err))
        );
      }
    }

    return {
      registeredCount: registeredCount,
      errors: errors
    };
  }

  function promptSelectedRegistrations(pending) {
    if (pending.length === 1) {
      const item = pending[0];
      const message =
        item.itemName +
        '：' +
        item.unitPrice.toLocaleString() +
        '円\n\n価格マスタに登録しますか？';

      return window.confirm(message) ? [item] : [];
    }

    const selected = [];

    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      const message =
        '（' +
        (i + 1) +
        '/' +
        pending.length +
        '）\n' +
        item.itemName +
        '：' +
        item.unitPrice.toLocaleString() +
        '円\n\nこの価格を価格マスタに登録しますか？';

      if (window.confirm(message)) {
        selected.push(item);
      }
    }

    return selected;
  }

  async function processAfterSave(recordId) {
    const appId = kintone.app.getId();

    if (appId !== DELIVERY_APP_ID && appId !== ORDER_APP_ID) {
      return;
    }

    try {
      const record = await fetchSavedRecord(appId, recordId);
      const pending = await collectPendingRegistrations(record, appId);

      if (pending.length === 0) {
        return;
      }

      const selected = promptSelectedRegistrations(pending);

      if (selected.length === 0) {
        return;
      }

      const result = await registerToPriceMaster(selected);

      if (result.errors.length > 0) {
        alert(
          '価格マスタ登録で一部エラーがありました。\n\n' +
          result.errors.join('\n')
        );
        return;
      }

      if (result.registeredCount > 0) {
        alert('価格マスタに登録しました。');
      }

    } catch (err) {
      console.error(err);
      alert(
        '価格マスタ登録処理でエラーが発生しました。\n\n' +
        (err.message || String(err))
      );
    }
  }

  window.CAYANAS_priceMasterRegister = {
    seedFromRecord: seedFromRecord
  };

  kintone.events.on(
    [
      'app.record.create.show',
      'app.record.edit.show'
    ],
    function(event) {
      if (!isDeliveryApp() && !isOrderApp()) {
        return event;
      }

      seedFromRecord(event.record);
      return event;
    }
  );

  kintone.events.on(
    [
      'app.record.create.change.unit_price',
      'app.record.edit.change.unit_price',
      'app.record.create.change.delivery_detail',
      'app.record.edit.change.delivery_detail',
      'app.record.create.change.detail_table',
      'app.record.edit.change.detail_table'
    ],
    function(event) {
      if (!isDeliveryApp() && !isOrderApp()) {
        return event;
      }

      seedFromRecord(event.record);
      return event;
    }
  );

  kintone.events.on(
    [
      'app.record.create.submit.success',
      'app.record.edit.submit.success'
    ],
    async function(event) {
      if (!isDeliveryApp() && !isOrderApp()) {
        return event;
      }

      await processAfterSave(event.recordId);
      return event;
    }
  );

})();
