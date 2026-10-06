(function() {
  'use strict';

  /**
   * App19 納品書保存 → App16 納品済連携（法人のみ）
   * A550 / customer_code 空欄は App16 を更新しない。
   */

  const DELIVERY_APP_ID = 19;
  const ORDER_APP_ID = 16;
  const A550_CUSTOMER_CODE = 'A550';
  const PROCESS_COMPLETE = '完了';
  const STATUS_DELIVERED = '納品済';

  const FIELD = {
    customerCode: 'customer_code',
    deliveryNo: 'delivery_no',
    deliveryDate: 'delivery_date',
    detailTable: 'delivery_detail',
    manageNo: 'manage_no',
    processStatus: 'process_status',
    locationStatus: 'location_status',
    deliveryStatus: 'delivery_status',
  };

  function escapeQuery(value) {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"');
  }

  function fieldValue(record, code) {
    const field = record[code];
    if (!field || field.value === null || field.value === undefined) {
      return '';
    }
    return field.value;
  }

  function trimCustomerCode(record) {
    return String(fieldValue(record, FIELD.customerCode) ?? '').trim();
  }

  function isCorporateCustomer(customerCode) {
    return customerCode !== '' && customerCode !== A550_CUSTOMER_CODE;
  }

  function collectManageNos(record) {
    const table = record[FIELD.detailTable];
    const rows = table && Array.isArray(table.value) ? table.value : [];
    const set = new Set();

    rows.forEach(function(row) {
      const manageNo = String(row?.value?.[FIELD.manageNo]?.value ?? '').trim();
      if (manageNo) {
        set.add(manageNo);
      }
    });

    return set;
  }

  async function fetchDeliveryRecord(recordId) {
    const resp = await kintone.api(
      kintone.api.url('/k/v1/record.json', true),
      'GET',
      { app: DELIVERY_APP_ID, id: recordId }
    );
    return resp.record;
  }

  async function assignDeliveryNoIfNeeded(record, recordId, isCreate) {
    const existing = String(fieldValue(record, FIELD.deliveryNo) ?? '').trim();
    if (existing) {
      return existing;
    }

    if (!isCreate) {
      return '';
    }

    const deliveryDate = String(fieldValue(record, FIELD.deliveryDate) ?? '').trim();
    if (!deliveryDate) {
      console.warn(
        '[delivery_complete_sync] delivery_no 未採番: delivery_date が空です (recordId=' +
        recordId +
        ')'
      );
      return '';
    }

    const yyyymmdd = deliveryDate.replace(/-/g, '');
    const deliveryNo = 'N' + yyyymmdd + '-' + recordId;

    await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', {
      app: DELIVERY_APP_ID,
      id: recordId,
      record: {
        [FIELD.deliveryNo]: { value: deliveryNo },
      },
    });

    return deliveryNo;
  }

  function buildCorporateOrderUpdate(deliveryDate, deliveryNo) {
    const record = {
      [FIELD.locationStatus]: { value: STATUS_DELIVERED },
      [FIELD.deliveryStatus]: { value: STATUS_DELIVERED },
    };
    const date = String(deliveryDate ?? '').trim();
    const number = String(deliveryNo ?? '').trim();

    if (date) {
      record[FIELD.deliveryDate] = { value: date };
    }

    if (number) {
      record[FIELD.deliveryNo] = { value: number };
    }

    return record;
  }

  async function fetchOrdersByManageNo(manageNo) {
    const resp = await kintone.api(
      kintone.api.url('/k/v1/records.json', true),
      'GET',
      {
        app: ORDER_APP_ID,
        query: FIELD.manageNo + ' = "' + escapeQuery(manageNo) + '"',
        fields: [
          '$id',
          FIELD.manageNo,
          FIELD.processStatus,
          FIELD.locationStatus,
          FIELD.deliveryStatus,
          FIELD.deliveryDate,
          FIELD.deliveryNo,
        ],
      }
    );
    return resp.records || [];
  }

  function isCorporateDeliveryApplied(orderRec, deliveryDate, deliveryNo) {
    const location = String(fieldValue(orderRec, FIELD.locationStatus) ?? '').trim();
    const delivery = String(fieldValue(orderRec, FIELD.deliveryStatus) ?? '').trim();
    const date = String(deliveryDate ?? '').trim();
    const number = String(deliveryNo ?? '').trim();
    const currentDate = String(fieldValue(orderRec, FIELD.deliveryDate) ?? '').trim();
    const currentNo = String(fieldValue(orderRec, FIELD.deliveryNo) ?? '').trim();

    if (location !== STATUS_DELIVERED || delivery !== STATUS_DELIVERED) {
      return false;
    }

    if (date && currentDate !== date) {
      return false;
    }

    if (number && currentNo !== number) {
      return false;
    }

    return true;
  }

  async function markOrderDelivered(orderRec, manageNo, deliveryDate, deliveryNo) {
    const processStatus = String(fieldValue(orderRec, FIELD.processStatus) ?? '').trim();

    if (processStatus !== PROCESS_COMPLETE) {
      console.warn(
        '[delivery_complete_sync] 完了ではないため納品済更新をスキップ: manage_no=' +
        manageNo +
        ', process_status=' +
        (processStatus || '(空)')
      );
      return { updated: false, skipped: true };
    }

    const putRecord = buildCorporateOrderUpdate(deliveryDate, deliveryNo);

    if (isCorporateDeliveryApplied(orderRec, deliveryDate, deliveryNo)) {
      return { updated: false, skipped: false };
    }

    await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', {
      app: ORDER_APP_ID,
      id: orderRec.$id.value,
      record: putRecord,
    });

    const confirmed = await fetchOrdersByManageNo(manageNo);
    const after = confirmed[0];

    if (!after || !isCorporateDeliveryApplied(after, deliveryDate, deliveryNo)) {
      throw new Error('納品済・納品日・納品番号の反映を確認できません');
    }

    return { updated: true, skipped: false };
  }

  async function syncCorporateDelivery(recordId, isCreate) {
    let record = await fetchDeliveryRecord(recordId);
    const customerCode = trimCustomerCode(record);

    if (!isCorporateCustomer(customerCode)) {
      if (customerCode === A550_CUSTOMER_CODE) {
        console.info(
          '[delivery_complete_sync] A550 のため App16 更新なし (recordId=' + recordId + ')'
        );
      } else if (customerCode === '') {
        console.info(
          '[delivery_complete_sync] customer_code 空のため App16 更新なし (recordId=' +
          recordId +
          ')'
        );
      }
      return;
    }

    const deliveryDate = String(fieldValue(record, FIELD.deliveryDate) ?? '').trim();

    if (deliveryDate) {
      await assignDeliveryNoIfNeeded(record, recordId, isCreate);
      record = await fetchDeliveryRecord(recordId);
    }

    const deliveryNo = String(fieldValue(record, FIELD.deliveryNo) ?? '').trim();
    const manageNos = collectManageNos(record);
    const failures = [];

    for (const manageNo of manageNos) {
      let orders;

      try {
        orders = await fetchOrdersByManageNo(manageNo);
      } catch (err) {
        console.error(
          '[delivery_complete_sync] App16 取得失敗: manage_no=' + manageNo,
          err
        );
        failures.push(manageNo + ' の受注を取得できません');
        continue;
      }

      if (orders.length === 0) {
        console.warn(
          '[delivery_complete_sync] App16 レコードなし: manage_no=' + manageNo
        );
        failures.push(manageNo + ' の受注がありません');
        continue;
      }

      if (orders.length > 1) {
        console.error(
          '[delivery_complete_sync] manage_no重複のため更新停止: manage_no=' +
          manageNo +
          ', 件数=' +
          orders.length
        );
        failures.push(manageNo + ' の受注が複数あります');
        continue;
      }

      try {
        await markOrderDelivered(orders[0], manageNo, deliveryDate, deliveryNo);
      } catch (err) {
        console.error(
          '[delivery_complete_sync] App16 更新失敗: manage_no=' + manageNo,
          err
        );
        failures.push(manageNo + ' ' + (err && err.message ? err.message : String(err)));
      }
    }

    if (failures.length > 0) {
      window.alert(
        '納品書は保存されましたが、受注への納品済反映に失敗しました。\n\n' +
        failures.join('\n')
      );
    }
  }

  kintone.events.on(
    [
      'app.record.create.submit.success',
      'app.record.edit.submit.success',
    ],
    async function(event) {
      if (kintone.app.getId() !== DELIVERY_APP_ID) {
        return event;
      }

      const isCreate = event.type === 'app.record.create.submit.success';

      try {
        await syncCorporateDelivery(event.recordId, isCreate);
      } catch (err) {
        console.error('[delivery_complete_sync] 処理エラー', err);
      }

      return event;
    }
  );

  window.CAYANAS_DeliveryCompleteSync = {
    buildCorporateOrderUpdate: buildCorporateOrderUpdate,
    isCorporateCustomer: isCorporateCustomer,
  };
})();
