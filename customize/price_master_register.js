(function() {
  'use strict';

  const DELIVERY_APP_ID = 19;
  const PRICE_MASTER_APP_ID = 14;
  const PRODUCT_APP_ID = 13;
  const ORDER_APP_ID = 16;

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

  function seedFromRecord(record) {
    if (!record.delivery_detail) {
      return;
    }

    record.delivery_detail.value.forEach(function(row, index) {
      const key = row.id || ('row-' + index);
      rowPrices.set(key, toNumber(row.value.unit_price.value));
    });
  }

  async function fetchSavedRecord(recordId) {
    const resp = await kintone.api(
      kintone.api.url('/k/v1/record.json', true),
      'GET',
      {
        app: DELIVERY_APP_ID,
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

  function resolveItemCode(order, itemName, product) {
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

  async function collectPendingRegistrations(record) {
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
      const itemCode = resolveItemCode(order, itemName, product);

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

  async function processAfterSave(recordId) {
    try {
      const record = await fetchSavedRecord(recordId);
      const pending = await collectPendingRegistrations(record);

      if (pending.length === 0) {
        return;
      }

      const message =
        '以下の価格を価格マスタに登録しますか？\n\n' +
        pending.map(function(item) {
          return (
            '・' +
            item.itemName +
            '：' +
            item.unitPrice.toLocaleString() +
            '円'
          );
        }).join('\n');

      if (!window.confirm(message)) {
        return;
      }

      const result = await registerToPriceMaster(pending);

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
      rowPrices.clear();
      seedFromRecord(event.record);
      return event;
    }
  );

  kintone.events.on(
    [
      'app.record.create.change.unit_price',
      'app.record.edit.change.unit_price',
      'app.record.create.change.delivery_detail',
      'app.record.edit.change.delivery_detail'
    ],
    function(event) {
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
      await processAfterSave(event.recordId);
      return event;
    }
  );

})();
