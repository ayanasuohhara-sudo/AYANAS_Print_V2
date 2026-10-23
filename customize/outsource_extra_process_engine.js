(function () {
  'use strict';

  /**
   * 外注追加加工の登録漏れ防止 — 共通エンジン
   * 依存: outsource_extra_process_config.js
   *
   * 照合: App27.processing_code → App95.outsource_company_code → App13.item_code → App16.detail_table.item_code
   * 加工名の文字列一致は使わない。subcategory では絞らない。
   */

  const C = window.CAYANAS_OutsourceExtraProcess;

  if (!C) {
    console.error('[outsource_extra] outsource_extra_process_config.js を先に読み込んでください。');
    return;
  }

  const escapeQueryValue = (value) => String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  const getFieldValue = (record, fieldCode) => {
    const field = record?.[fieldCode];

    if (!field || field.value === null || field.value === undefined) {
      return '';
    }

    return field.value;
  };

  const norm = (value) => String(value ?? '').trim();

  const buildPriceKey = (customerCode, kimonoTypeCode, itemCode, kimonoSpec) => (
    (customerCode || '') + '_'
    + (kimonoTypeCode || '') + '_'
    + (itemCode || '') + '_'
    + (kimonoSpec || '')
  );

  const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const fetchRecords = async (appId, query) => {
    const resp = await kintone.api(
      kintone.api.url('/k/v1/records.json', true),
      'GET',
      { app: appId, query: query }
    );

    return resp.records ?? [];
  };

  const fetchRecord = async (appId, id) => {
    const resp = await kintone.api(
      kintone.api.url('/k/v1/record.json', true),
      'GET',
      { app: appId, id: id }
    );

    return resp.record;
  };

  const formatKintoneError = (err) => {
    let message = err?.message || String(err);

    if (err?.errors && typeof err.errors === 'object') {
      const lines = [];

      Object.keys(err.errors).forEach(function (key) {
        const entry = err.errors[key];
        const detail = entry?.messages ? entry.messages.join(', ') : String(entry);
        lines.push(key + ': ' + detail);
      });

      if (lines.length > 0) {
        message += '\n\n' + lines.join('\n');
      }
    }

    return message;
  };

  const getApp27Status = (record) => {
    const primary = norm(getFieldValue(record, C.F27.status));

    if (primary !== '') {
      return primary;
    }

    return norm(getFieldValue(record, C.F27.statusAlt));
  };

  const isCancelledApp27 = (record) => {
    const status = getApp27Status(record);
    return C.CANCEL_STATUS_VALUES.indexOf(status) >= 0;
  };

  const listManageNosFromApp27 = (record) => {
    const table = record?.[C.F27.detailTable];
    const rows = Array.isArray(table?.value) ? table.value : [];
    const list = [];
    const seen = new Set();

    rows.forEach(function (row) {
      const manageNo = norm(getFieldValue(row.value, C.F27.detailManageNo));

      if (manageNo === '' || seen.has(manageNo)) {
        return;
      }

      seen.add(manageNo);
      list.push(manageNo);
    });

    return list;
  };

  const listProcessingCodesFromApp27 = (record) => {
    const table = record?.[C.F27.processingTable];
    const rows = Array.isArray(table?.value) ? table.value : [];
    const list = [];
    const seen = new Set();

    rows.forEach(function (row) {
      const code = norm(getFieldValue(row.value, C.F27.processingCode));

      if (code === '' || seen.has(code)) {
        return;
      }

      seen.add(code);
      list.push(code);
    });

    return list;
  };

  /**
   * processing_code → App95確認 → App13商品
   * @returns {Promise<{ok:boolean, itemCode?:string, itemName?:string, message?:string}>}
   */
  const resolveProductByProcessingCode = async (processingCode) => {
    const code = norm(processingCode);

    if (code === '') {
      return { ok: false, message: '加工コードが空です' };
    }

    const masters = await fetchRecords(
      C.APP.outsourceProcessing,
      C.F95.processingCode + ' = "' + escapeQueryValue(code) + '" limit 1'
    );

    if (!masters[0]) {
      return {
        ok: false,
        message: 'App95に加工コードがありません: ' + code,
      };
    }

    const products = await fetchRecords(
      C.APP.product,
      C.F13.itemCode + ' = "' + escapeQueryValue(code) + '" limit 1'
    );

    if (!products[0]) {
      return {
        ok: false,
        message: 'App13に同一商品番号がありません: ' + code,
      };
    }

    const itemName = norm(getFieldValue(products[0], C.F13.itemName))
      || norm(getFieldValue(masters[0], C.F95.processingName))
      || code;

    return {
      ok: true,
      itemCode: code,
      itemName: itemName,
      product: products[0],
      master: masters[0],
    };
  };

  const fetchUnitPrice = async (orderRecord, itemCode) => {
    const customerCode = norm(getFieldValue(orderRecord, C.F16.customerCode));
    const kimonoTypeCode = norm(getFieldValue(orderRecord, C.F16.kimonoTypeCode));
    const kimonoSpec = norm(getFieldValue(orderRecord, C.F16.kimonoSpec));
    const key = buildPriceKey(customerCode, kimonoTypeCode, itemCode, kimonoSpec);

    if (!customerCode || !itemCode) {
      return { unitPrice: 0, priceKey: key, found: false };
    }

    const records = await fetchRecords(
      C.APP.price,
      C.F14.priceKey + ' = "' + escapeQueryValue(key) + '" limit 1'
    );

    if (!records[0]) {
      return { unitPrice: 0, priceKey: key, found: false };
    }

    return {
      unitPrice: toNumber(getFieldValue(records[0], C.F14.unitPrice)),
      priceKey: key,
      found: true,
    };
  };

  const listItemCodesOnOrder = (orderRecord) => {
    const table = orderRecord?.[C.F16.detailTable];
    const rows = Array.isArray(table?.value) ? table.value : [];
    const codes = new Set();

    rows.forEach(function (row) {
      const code = norm(getFieldValue(row.value, C.F16.itemCode));

      if (code !== '') {
        codes.add(code);
      }
    });

    return codes;
  };

  const fetchOrderByManageNo = async (manageNo) => {
    const records = await fetchRecords(
      C.APP.order,
      C.F16.manageNo + ' = "' + escapeQueryValue(manageNo) + '" limit 2'
    );

    if (records.length === 0) {
      return { ok: false, reason: 'not_found', message: 'App16に管理番号がありません: ' + manageNo };
    }

    if (records.length > 1) {
      return {
        ok: false,
        reason: 'duplicate',
        message: 'App16に同一管理番号が複数あります: ' + manageNo,
      };
    }

    return { ok: true, record: records[0] };
  };

  const buildDetailTablePutValue = (orderRecord, newLines) => {
    const table = orderRecord[C.F16.detailTable];
    const rows = Array.isArray(table?.value) ? table.value : [];
    const putRows = rows.map(function (row) {
      return { id: row.id, value: {} };
    });

    newLines.forEach(function (line) {
      putRows.push({
        value: {
          [C.F16.itemCode]: { value: line.itemCode },
          [C.F16.itemName]: { value: line.itemName },
          [C.F16.unitPrice]: { value: line.unitPrice },
          [C.F16.qty]: { value: line.qty },
          [C.F16.amount]: { value: line.amount },
        },
      });
    });

    return { value: putRows };
  };

  /**
   * App27保存後: 伝票の加工コードを各 manage_no の App16 明細へ不足分だけ追加
   */
  const syncOrderDetailsFromApp27Record = async (app27Record) => {
    const result = {
      added: [],
      skipped: [],
      errors: [],
    };

    if (isCancelledApp27(app27Record)) {
      result.skipped.push({ reason: 'cancelled', message: '取消伝票のため App16 追加をスキップ' });
      return result;
    }

    const manageNos = listManageNosFromApp27(app27Record);
    const processingCodes = listProcessingCodesFromApp27(app27Record);

    if (manageNos.length === 0) {
      result.skipped.push({ reason: 'no_manage_no', message: '管理番号明細がありません' });
      return result;
    }

    if (processingCodes.length === 0) {
      result.skipped.push({ reason: 'no_processing', message: '加工コードがありません' });
      return result;
    }

    const resolved = [];

    for (let i = 0; i < processingCodes.length; i += 1) {
      const code = processingCodes[i];

      try {
        const product = await resolveProductByProcessingCode(code);

        if (!product.ok) {
          result.errors.push({ processingCode: code, message: product.message });
          continue;
        }

        resolved.push(product);
      } catch (err) {
        result.errors.push({
          processingCode: code,
          message: formatKintoneError(err),
        });
      }
    }

    if (resolved.length === 0) {
      return result;
    }

    for (let m = 0; m < manageNos.length; m += 1) {
      const manageNo = manageNos[m];

      try {
        const orderHit = await fetchOrderByManageNo(manageNo);

        if (!orderHit.ok) {
          /* 0件・複数件は既存出庫を壊さないためエラー集約のみ（保存は済） */
          result.errors.push({ manageNo: manageNo, message: orderHit.message });
          continue;
        }

        const orderRecord = orderHit.record;
        const existingCodes = listItemCodesOnOrder(orderRecord);
        const newLines = [];

        for (let r = 0; r < resolved.length; r += 1) {
          const product = resolved[r];

          if (existingCodes.has(product.itemCode)) {
            result.skipped.push({
              manageNo: manageNo,
              itemCode: product.itemCode,
              message: '明細に既存のためスキップ',
            });
            continue;
          }

          const price = await fetchUnitPrice(orderRecord, product.itemCode);
          const qty = 1;
          const unitPrice = price.unitPrice;
          const amount = unitPrice * qty;

          newLines.push({
            itemCode: product.itemCode,
            itemName: product.itemName,
            unitPrice: unitPrice,
            qty: qty,
            amount: amount,
            priceFound: price.found,
          });
          existingCodes.add(product.itemCode);
        }

        if (newLines.length === 0) {
          continue;
        }

        await kintone.api(
          kintone.api.url('/k/v1/record.json', true),
          'PUT',
          {
            app: C.APP.order,
            id: orderRecord.$id.value,
            record: {
              [C.F16.detailTable]: buildDetailTablePutValue(orderRecord, newLines),
            },
          }
        );

        newLines.forEach(function (line) {
          result.added.push({
            manageNo: manageNo,
            itemCode: line.itemCode,
            itemName: line.itemName,
            unitPrice: line.unitPrice,
            priceFound: line.priceFound,
          });
        });
      } catch (err) {
        result.errors.push({
          manageNo: manageNo,
          message: formatKintoneError(err),
        });
      }
    }

    return result;
  };

  /**
   * 管理番号に紐づく App27（取消以外）から加工コードを収集
   */
  const collectProcessingCodesForManageNo = async (manageNo) => {
    const code = norm(manageNo);
    const codes = new Set();
    const query = C.F27.detailTable + '.' + C.F27.detailManageNo
      + ' = "' + escapeQueryValue(code) + '" order by $id desc limit 100';

    let records = [];

    try {
      records = await fetchRecords(C.APP.outsourceOutbound, query);
    } catch (err) {
      console.warn('[outsource_extra] App27 検索失敗、走査に切替', err);

      try {
        const all = await fetchRecords(
          C.APP.outsourceOutbound,
          'order by $id desc limit 500'
        );
        records = all.filter(function (rec) {
          return listManageNosFromApp27(rec).indexOf(code) >= 0;
        });
      } catch (scanErr) {
        throw scanErr;
      }
    }

    records.forEach(function (rec) {
      if (isCancelledApp27(rec)) {
        return;
      }

      listProcessingCodesFromApp27(rec).forEach(function (processingCode) {
        codes.add(processingCode);
      });
    });

    return [...codes];
  };

  /**
   * App19: 納品明細の管理番号について、外注出庫加工が App16 明細に無ければ漏れ一覧を返す
   */
  const findMissingProcessOnDelivery = async (deliveryRecord) => {
    const table = deliveryRecord?.[C.F19.deliveryDetail];
    const rows = Array.isArray(table?.value) ? table.value : [];
    const manageNos = [];
    const seen = new Set();

    rows.forEach(function (row) {
      const manageNo = norm(getFieldValue(row.value, C.F19.manageNo));

      if (manageNo === '' || seen.has(manageNo)) {
        return;
      }

      seen.add(manageNo);
      manageNos.push(manageNo);
    });

    const missing = [];

    for (let i = 0; i < manageNos.length; i += 1) {
      const manageNo = manageNos[i];
      const processingCodes = await collectProcessingCodesForManageNo(manageNo);

      if (processingCodes.length === 0) {
        continue;
      }

      const orderHit = await fetchOrderByManageNo(manageNo);

      if (!orderHit.ok) {
        missing.push({
          manageNo: manageNo,
          itemCode: '',
          message: orderHit.message,
        });
        continue;
      }

      const existingCodes = listItemCodesOnOrder(orderHit.record);

      for (let c = 0; c < processingCodes.length; c += 1) {
        const processingCode = processingCodes[c];
        const resolved = await resolveProductByProcessingCode(processingCode);

        if (!resolved.ok) {
          /* App95↔App13 未解決コードは自動追加対象外。照合対象にもしない（コンソールのみ） */
          console.warn('[outsource_extra] App19照合スキップ:', manageNo, resolved.message);
          continue;
        }

        if (!existingCodes.has(resolved.itemCode)) {
          missing.push({
            manageNo: manageNo,
            itemCode: resolved.itemCode,
            itemName: resolved.itemName,
            message: 'App16加工明細に未登録（外注出庫あり）',
          });
        }
      }
    }

    return missing;
  };

  const formatMissingMessage = (missing) => {
    const lines = missing.map(function (row) {
      const name = row.itemName ? ' ' + row.itemName : '';
      const code = row.itemCode ? ' [' + row.itemCode + ']' : '';
      return '・' + row.manageNo + code + name + ' — ' + row.message;
    });

    return '外注追加加工が受注明細に登録されていません。\n'
      + '納品書は保存していません。App16の加工明細を確認・追加してから再度保存してください。\n\n'
      + lines.join('\n');
  };

  const formatSyncSummary = (syncResult) => {
    const parts = [];

    if (syncResult.added.length > 0) {
      parts.push(
        'App16へ追加: '
        + syncResult.added.map(function (row) {
          return row.manageNo + '/' + row.itemCode
            + (row.priceFound ? '' : '(単価未設定→0)');
        }).join(', ')
      );
    }

    if (syncResult.errors.length > 0) {
      parts.push(
        'エラー: '
        + syncResult.errors.map(function (row) {
          return (row.manageNo || row.processingCode || '') + ' ' + row.message;
        }).join(' / ')
      );
    }

    return parts.join('\n');
  };

  window.CAYANAS_OutsourceExtraProcessEngine = {
    escapeQueryValue: escapeQueryValue,
    getFieldValue: getFieldValue,
    buildPriceKey: buildPriceKey,
    resolveProductByProcessingCode: resolveProductByProcessingCode,
    fetchUnitPrice: fetchUnitPrice,
    syncOrderDetailsFromApp27Record: syncOrderDetailsFromApp27Record,
    findMissingProcessOnDelivery: findMissingProcessOnDelivery,
    formatMissingMessage: formatMissingMessage,
    formatSyncSummary: formatSyncSummary,
    listManageNosFromApp27: listManageNosFromApp27,
    listProcessingCodesFromApp27: listProcessingCodesFromApp27,
    formatKintoneError: formatKintoneError,
  };

})();
