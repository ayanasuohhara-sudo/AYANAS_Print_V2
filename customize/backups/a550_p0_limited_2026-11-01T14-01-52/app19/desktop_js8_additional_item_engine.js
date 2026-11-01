(function () {
  'use strict';

  /**
   * 外注追加加工 — 共通エンジン
   * VERSION: 1.2.0
   *
   * 照合: App27.processing_code → App95.outsource_company_code → App13.item_code → App16.detail_table.item_code
   * 価格未定の正本: detail_table.price_unconfirmed（選択肢「価格未定」）
   * 名称一致・subcategory 絞り込みはしない。ステータスは変更しない。
   */

  const VERSION = '1.2.0';

  const APP = {
    product: 13,
    price: 14,
    order: 16,
    delivery: 19,
    outsourceOutbound: 27,
    outsourceProcessing: 95,
  };

  const F27 = {
    detailTable: 'outsource_detail',
    detailManageNo: 'manage_no',
    processingTable: 'processing_details_0',
    processingCode: 'processing_code',
    processingDetails: 'processing_details',
    status: 'ドロップダウン_0',
    statusAlt: 'outsourcing_status',
  };

  const F95 = {
    processingCode: 'outsource_company_code',
    processingName: 'processing_details',
  };

  const F13 = {
    itemCode: 'item_code',
    itemName: 'item_name',
  };

  const F14 = {
    unitPrice: 'unit_price',
    priceKey: 'price_key',
  };

  const F16 = {
    manageNo: 'manage_no',
    customerCode: 'customer_code',
    kimonoTypeCode: 'kimono_type_code',
    kimonoSpec: 'kimono_spec',
    detailTable: 'detail_table',
    itemCode: 'item_code',
    itemName: 'item_name',
    unitPrice: 'unit_price',
    qty: 'qty',
    amount: 'amount',
    priceUnconfirmed: 'price_unconfirmed',
  };

  /** チェックボックス選択肢（正本） */
  const PRICE_UNCONFIRMED_OPTION = '価格未定';

  const F19 = {
    deliveryDetail: 'delivery_detail',
    manageNo: 'manage_no',
  };

  const CANCEL_STATUS_VALUES = ['取消', 'キャンセル'];
  const MAX_REVISION_RETRY = 3;

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

  /** price_master_register.js と同一 */
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

  const isRevisionConflict = (err) => {
    const text = String(err?.message || '') + JSON.stringify(err?.errors || {});
    return /revision|リビジョン|GAIA_RE|CB_VA01|排他|競合/i.test(text);
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

  const getApp27Status = (record) => {
    const primary = norm(getFieldValue(record, F27.status));

    if (primary !== '') {
      return primary;
    }

    return norm(getFieldValue(record, F27.statusAlt));
  };

  const isCancelledApp27 = (record) => (
    CANCEL_STATUS_VALUES.indexOf(getApp27Status(record)) >= 0
  );

  const listManageNosFromApp27 = (record) => {
    const table = record?.[F27.detailTable];
    const rows = Array.isArray(table?.value) ? table.value : [];
    const list = [];
    const seen = new Set();

    rows.forEach(function (row) {
      const manageNo = norm(getFieldValue(row.value, F27.detailManageNo));

      if (manageNo === '' || seen.has(manageNo)) {
        return;
      }

      seen.add(manageNo);
      list.push(manageNo);
    });

    return list;
  };

  const listProcessingCodesFromApp27 = (record) => {
    const table = record?.[F27.processingTable];
    const rows = Array.isArray(table?.value) ? table.value : [];
    const list = [];
    const seen = new Set();

    rows.forEach(function (row) {
      const code = norm(getFieldValue(row.value, F27.processingCode));

      if (code === '' || seen.has(code)) {
        return;
      }

      seen.add(code);
      list.push({
        code: code,
        name: norm(getFieldValue(row.value, F27.processingDetails)),
      });
    });

    return list;
  };

  const resolveProductByProcessingCode = async (processingCode) => {
    const code = norm(processingCode);

    if (code === '') {
      return { ok: false, kind: 'empty', message: '加工コードが空です' };
    }

    const masters = await fetchRecords(
      APP.outsourceProcessing,
      F95.processingCode + ' = "' + escapeQueryValue(code) + '" limit 5'
    );

    if (masters.length === 0) {
      return {
        ok: false,
        kind: 'master_missing',
        processingCode: code,
        message:
          '加工コード ' + code
          + ' が外注加工マスタ（App95）にありません。受注明細へ自動追加できません。',
      };
    }

    const products = await fetchRecords(
      APP.product,
      F13.itemCode + ' = "' + escapeQueryValue(code) + '" limit 5'
    );

    if (products.length === 0) {
      return {
        ok: false,
        kind: 'product_missing',
        processingCode: code,
        message:
          '加工コード ' + code
          + ' に対応する商品が商品マスタにありません。受注明細へ自動追加できません。',
      };
    }

    if (products.length > 1) {
      return {
        ok: false,
        kind: 'product_duplicate',
        processingCode: code,
        message:
          '商品マスタに商品番号 ' + code
          + ' が複数あります。自動追加を中止しました。商品マスタを確認してください。',
      };
    }

    const itemName = norm(getFieldValue(products[0], F13.itemName))
      || norm(getFieldValue(masters[0], F95.processingName))
      || code;

    return {
      ok: true,
      itemCode: code,
      itemName: itemName,
      masterName: norm(getFieldValue(masters[0], F95.processingName)),
    };
  };

  const fetchUnitPrice = async (orderRecord, itemCode) => {
    const customerCode = norm(getFieldValue(orderRecord, F16.customerCode));
    const kimonoTypeCode = norm(getFieldValue(orderRecord, F16.kimonoTypeCode));
    const kimonoSpec = norm(getFieldValue(orderRecord, F16.kimonoSpec));
    const key = buildPriceKey(customerCode, kimonoTypeCode, itemCode, kimonoSpec);

    if (!customerCode || !itemCode) {
      return { found: false, duplicate: false, unitPrice: null, priceKey: key };
    }

    const records = await fetchRecords(
      APP.price,
      F14.priceKey + ' = "' + escapeQueryValue(key) + '" limit 5'
    );

    if (records.length === 0) {
      return { found: false, duplicate: false, unitPrice: null, priceKey: key };
    }

    if (records.length > 1) {
      return { found: false, duplicate: true, unitPrice: null, priceKey: key };
    }

    return {
      found: true,
      duplicate: false,
      unitPrice: toNumber(getFieldValue(records[0], F14.unitPrice)),
      priceKey: key,
    };
  };

  const listItemCodesOnOrder = (orderRecord) => {
    const table = orderRecord?.[F16.detailTable];
    const rows = Array.isArray(table?.value) ? table.value : [];
    const codes = new Set();

    rows.forEach(function (row) {
      const code = norm(getFieldValue(row.value, F16.itemCode));

      if (code !== '') {
        codes.add(code);
      }
    });

    return codes;
  };

  const fetchOrderByManageNo = async (manageNo) => {
    const records = await fetchRecords(
      APP.order,
      F16.manageNo + ' = "' + escapeQueryValue(manageNo) + '" limit 5'
    );

    if (records.length === 0) {
      return {
        ok: false,
        reason: 'not_found',
        message: '管理番号 ' + manageNo + ' が受注明細にありません。自動追加しません。',
      };
    }

    if (records.length > 1) {
      return {
        ok: false,
        reason: 'duplicate',
        message:
          '管理番号 ' + manageNo
          + ' が受注明細に複数あります。最新を勝手に選ばず自動追加を中止しました。',
      };
    }

    return { ok: true, record: records[0] };
  };

  const isPriceUnconfirmedValue = (raw) => {
    if (!Array.isArray(raw)) {
      return false;
    }

    return raw.indexOf(PRICE_UNCONFIRMED_OPTION) >= 0;
  };

  const isPriceUnconfirmedRow = (rowValue) => (
    isPriceUnconfirmedValue(getFieldValue(rowValue, F16.priceUnconfirmed))
  );

  const buildNewLineValue = (line) => {
    const value = {
      [F16.itemCode]: { value: line.itemCode },
      [F16.itemName]: { value: line.itemName },
      [F16.qty]: { value: 1 },
    };

    if (line.priceFound && line.unitPrice !== null && line.unitPrice !== undefined) {
      value[F16.unitPrice] = { value: line.unitPrice };
      value[F16.amount] = { value: toNumber(line.unitPrice) * 1 };
      value[F16.priceUnconfirmed] = { value: [] };
    } else {
      /* 価格未定: 空欄 + フラグON（0円は使わない） */
      value[F16.unitPrice] = { value: null };
      value[F16.amount] = { value: null };
      value[F16.priceUnconfirmed] = { value: [PRICE_UNCONFIRMED_OPTION] };
    }

    return value;
  };

  const buildDetailTablePutValue = (orderRecord, newLines) => {
    const table = orderRecord[F16.detailTable];
    const rows = Array.isArray(table?.value) ? table.value : [];
    const putRows = rows.map(function (row) {
      return { id: row.id, value: {} };
    });

    newLines.forEach(function (line) {
      putRows.push({ value: buildNewLineValue(line) });
    });

    return { value: putRows };
  };

  /**
   * 最新GET → 重複再確認 → revision付きPUT。競合時は再GETして再試行。
   */
  const putOrderDetailLines = async (orderId, resolveNewLines) => {
    let lastError = null;

    for (let attempt = 0; attempt < MAX_REVISION_RETRY; attempt += 1) {
      const latest = await fetchRecord(APP.order, orderId);
      const revision = latest.$revision && latest.$revision.value;
      const newLines = await Promise.resolve(resolveNewLines(latest));

      if (!newLines || newLines.length === 0) {
        return { ok: true, added: [] };
      }

      try {
        await kintone.api(
          kintone.api.url('/k/v1/record.json', true),
          'PUT',
          {
            app: APP.order,
            id: orderId,
            revision: revision,
            record: {
              [F16.detailTable]: buildDetailTablePutValue(latest, newLines),
            },
          }
        );

        return { ok: true, added: newLines };
      } catch (err) {
        lastError = err;

        if (isRevisionConflict(err) && attempt < MAX_REVISION_RETRY - 1) {
          continue;
        }

        throw err;
      }
    }

    throw lastError || new Error('App16更新に失敗しました');
  };

  const syncOrderDetailsFromApp27Record = async (app27Record) => {
    const result = {
      added: [],
      skippedExisting: [],
      pricePending: [],
      warnings: [],
      errors: [],
    };

    if (isCancelledApp27(app27Record)) {
      result.warnings.push('取消伝票のため、受注明細への自動追加をスキップしました。');
      return result;
    }

    const manageNos = listManageNosFromApp27(app27Record);
    const processingList = listProcessingCodesFromApp27(app27Record);

    if (manageNos.length === 0) {
      result.warnings.push('管理番号明細が空のため、自動追加をスキップしました。');
      return result;
    }

    if (processingList.length === 0) {
      result.warnings.push('加工コードが空のため、自動追加をスキップしました。');
      return result;
    }

    const resolved = [];

    for (let i = 0; i < processingList.length; i += 1) {
      const entry = processingList[i];

      try {
        const product = await resolveProductByProcessingCode(entry.code);

        if (!product.ok) {
          result.warnings.push(product.message);
          continue;
        }

        resolved.push(product);
      } catch (err) {
        result.errors.push(entry.code + ': ' + formatKintoneError(err));
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
          result.errors.push(orderHit.message);
          continue;
        }

        const priceByCode = {};

        for (let r = 0; r < resolved.length; r += 1) {
          const product = resolved[r];
          const price = await fetchUnitPrice(orderHit.record, product.itemCode);

          if (price.duplicate) {
            result.warnings.push(
              manageNo + ' / ' + product.itemCode + ' ' + product.itemName
              + ': 価格マスタが重複しているため単価を自動設定しませんでした。'
            );
          }

          priceByCode[product.itemCode] = {
            itemCode: product.itemCode,
            itemName: product.itemName,
            unitPrice: price.found ? price.unitPrice : null,
            priceFound: price.found,
          };
        }

        let skipsThisManage = [];

        const putResult = await putOrderDetailLines(
          orderHit.record.$id.value,
          function (latest) {
            const existingCodes = listItemCodesOnOrder(latest);
            const newLines = [];
            skipsThisManage = [];

            resolved.forEach(function (product) {
              if (existingCodes.has(product.itemCode)) {
                skipsThisManage.push({
                  manageNo: manageNo,
                  itemCode: product.itemCode,
                  itemName: product.itemName,
                });
                return;
              }

              newLines.push(priceByCode[product.itemCode]);
              existingCodes.add(product.itemCode);
            });

            return newLines;
          }
        );

        skipsThisManage.forEach(function (row) {
          result.skippedExisting.push(row);
        });

        (putResult.added || []).forEach(function (line) {
          result.added.push({
            manageNo: manageNo,
            itemCode: line.itemCode,
            itemName: line.itemName,
            priceFound: line.priceFound,
          });

          if (!line.priceFound) {
            result.pricePending.push({
              manageNo: manageNo,
              itemCode: line.itemCode,
              itemName: line.itemName,
            });
          }
        });
      } catch (err) {
        result.errors.push(manageNo + ': ' + formatKintoneError(err));
      }
    }

    return result;
  };

  const collectProcessingCodesForManageNo = async (manageNo) => {
    const code = norm(manageNo);
    const codes = new Map();
    const query = F27.detailTable + '.' + F27.detailManageNo
      + ' = "' + escapeQueryValue(code) + '" order by $id desc limit 100';

    let records = [];

    try {
      records = await fetchRecords(APP.outsourceOutbound, query);
    } catch (err) {
      console.warn('[additional_item] App27 検索失敗、走査に切替', err);
      const all = await fetchRecords(APP.outsourceOutbound, 'order by $id desc limit 500');
      records = all.filter(function (rec) {
        return listManageNosFromApp27(rec).indexOf(code) >= 0;
      });
    }

    records.forEach(function (rec) {
      if (isCancelledApp27(rec)) {
        return;
      }

      listProcessingCodesFromApp27(rec).forEach(function (entry) {
        if (!codes.has(entry.code)) {
          codes.set(entry.code, entry.name);
        }
      });
    });

    return codes;
  };

  const findMissingProcessOnDelivery = async (deliveryRecord) => {
    const table = deliveryRecord?.[F19.deliveryDetail];
    const rows = Array.isArray(table?.value) ? table.value : [];
    const manageNos = [];
    const seen = new Set();

    rows.forEach(function (row) {
      const manageNo = norm(getFieldValue(row.value, F19.manageNo));

      if (manageNo === '' || seen.has(manageNo)) {
        return;
      }

      seen.add(manageNo);
      manageNos.push(manageNo);
    });

    const missingByManageNo = new Map();

    for (let i = 0; i < manageNos.length; i += 1) {
      const manageNo = manageNos[i];
      const codeMap = await collectProcessingCodesForManageNo(manageNo);

      if (codeMap.size === 0) {
        continue;
      }

      const orderHit = await fetchOrderByManageNo(manageNo);

      if (!orderHit.ok) {
        if (!missingByManageNo.has(manageNo)) {
          missingByManageNo.set(manageNo, []);
        }

        missingByManageNo.get(manageNo).push({
          itemCode: '',
          itemName: '',
          message: orderHit.message,
        });
        continue;
      }

      const existingCodes = listItemCodesOnOrder(orderHit.record);

      for (const [processingCode, processingName] of codeMap.entries()) {
        const resolved = await resolveProductByProcessingCode(processingCode);

        if (!resolved.ok) {
          console.warn('[additional_item] App19照合スキップ:', manageNo, resolved.message);
          continue;
        }

        if (!existingCodes.has(resolved.itemCode)) {
          if (!missingByManageNo.has(manageNo)) {
            missingByManageNo.set(manageNo, []);
          }

          missingByManageNo.get(manageNo).push({
            itemCode: resolved.itemCode,
            itemName: resolved.itemName || processingName,
            message: '受注明細に未登録',
          });
        }
      }
    }

    return missingByManageNo;
  };

  /**
   * App19: price_unconfirmed に「価格未定」がある行のみ（unit_price の 0/空では判定しない）
   */
  const findPriceUnconfirmedOnDelivery = async (deliveryRecord) => {
    const table = deliveryRecord?.[F19.deliveryDetail];
    const rows = Array.isArray(table?.value) ? table.value : [];
    const manageNos = [];
    const seen = new Set();

    rows.forEach(function (row) {
      const manageNo = norm(getFieldValue(row.value, F19.manageNo));

      if (manageNo === '' || seen.has(manageNo)) {
        return;
      }

      seen.add(manageNo);
      manageNos.push(manageNo);
    });

    const pendingByManageNo = new Map();

    for (let i = 0; i < manageNos.length; i += 1) {
      const manageNo = manageNos[i];
      const orderHit = await fetchOrderByManageNo(manageNo);

      if (!orderHit.ok) {
        continue;
      }

      const detail = orderHit.record[F16.detailTable];
      const detailRows = Array.isArray(detail?.value) ? detail.value : [];

      detailRows.forEach(function (row) {
        if (!isPriceUnconfirmedRow(row.value)) {
          return;
        }

        if (!pendingByManageNo.has(manageNo)) {
          pendingByManageNo.set(manageNo, []);
        }

        pendingByManageNo.get(manageNo).push({
          itemCode: norm(getFieldValue(row.value, F16.itemCode)),
          itemName: norm(getFieldValue(row.value, F16.itemName)),
        });
      });
    }

    return pendingByManageNo;
  };

  const formatSyncAlert = (syncResult) => {
    const blocks = [];

    if (syncResult.added.length > 0) {
      const withPrice = syncResult.added.filter(function (row) {
        return row.priceFound;
      });
      const pending = syncResult.pricePending;

      if (withPrice.length > 0 && pending.length === 0) {
        blocks.push(
          '【追加加工を受注明細へ登録しました】\n\n'
          + withPrice.map(function (row) {
            return '管理番号：' + row.manageNo + '\n加工：' + row.itemCode + ' ' + row.itemName;
          }).join('\n\n')
        );
      } else if (withPrice.length > 0) {
        blocks.push(
          '【追加加工を受注明細へ登録しました】\n\n'
          + withPrice.map(function (row) {
            return '管理番号：' + row.manageNo + '\n加工：' + row.itemCode + ' ' + row.itemName;
          }).join('\n\n')
        );
      }

      if (pending.length > 0) {
        const byManage = new Map();

        pending.forEach(function (row) {
          if (!byManage.has(row.manageNo)) {
            byManage.set(row.manageNo, []);
          }

          byManage.get(row.manageNo).push('・' + row.itemCode + ' ' + row.itemName);
        });

        let text = '【価格未確定の追加加工があります】\n\n';

        byManage.forEach(function (lines, manageNo) {
          text += manageNo + '\n' + lines.join('\n') + '\n\n';
        });

        text += '価格マスタに該当価格がありません。\n'
          + '単価は未確定です。\n'
          + '受注明細で価格を確認してください。';
        blocks.push(text);
      }
    }

    if (syncResult.warnings.length > 0) {
      blocks.push('【警告】\n' + syncResult.warnings.join('\n'));
    }

    if (syncResult.errors.length > 0) {
      blocks.push('【エラー】\n' + syncResult.errors.join('\n'));
    }

    return blocks.join('\n\n');
  };

  const formatMissingAlert = (missingByManageNo) => {
    let text = '【追加加工の登録漏れがあります】\n\n';

    missingByManageNo.forEach(function (items, manageNo) {
      text += '管理番号：' + manageNo + '\n\n';
      text += '受注明細に登録されていない外注加工：\n';
      items.forEach(function (item) {
        if (item.itemCode) {
          text += '・' + item.itemCode + '　' + (item.itemName || '') + '\n';
        } else {
          text += '・' + item.message + '\n';
        }
      });
      text += '\n';
    });

    text += '受注明細を確認してから、\nもう一度納品処理を行ってください。';
    return text;
  };

  const formatPriceUnconfirmedAlert = (pendingByManageNo) => {
    let text = '【価格未確定の加工があります】\n\n';

    pendingByManageNo.forEach(function (items, manageNo) {
      text += '管理番号：' + manageNo + '\n\n';
      items.forEach(function (item) {
        text += '・' + (item.itemCode || '') + '　' + (item.itemName || '') + '\n';
      });
      text += '\n';
    });

    text += '受注明細で単価を確認してください。\n'
      + '価格を確定して「価格未定」を解除してから、もう一度納品処理を行ってください。';
    return text;
  };

  const buildDeliveryGuardError = (missingByManageNo, pendingByManageNo) => {
    const parts = [];

    if (missingByManageNo && missingByManageNo.size > 0) {
      parts.push(formatMissingAlert(missingByManageNo));
    }

    if (pendingByManageNo && pendingByManageNo.size > 0) {
      parts.push(formatPriceUnconfirmedAlert(pendingByManageNo));
    }

    return parts.join('\n\n');
  };

  window.CAYANAS_AdditionalItemEngine = {
    VERSION: VERSION,
    APP: APP,
    F16: F16,
    PRICE_UNCONFIRMED_OPTION: PRICE_UNCONFIRMED_OPTION,
    buildPriceKey: buildPriceKey,
    formatKintoneError: formatKintoneError,
    getFieldValue: getFieldValue,
    isPriceUnconfirmedValue: isPriceUnconfirmedValue,
    isPriceUnconfirmedRow: isPriceUnconfirmedRow,
    syncOrderDetailsFromApp27Record: syncOrderDetailsFromApp27Record,
    findMissingProcessOnDelivery: findMissingProcessOnDelivery,
    findPriceUnconfirmedOnDelivery: findPriceUnconfirmedOnDelivery,
    formatSyncAlert: formatSyncAlert,
    formatMissingAlert: formatMissingAlert,
    formatPriceUnconfirmedAlert: formatPriceUnconfirmedAlert,
    buildDeliveryGuardError: buildDeliveryGuardError,
    resolveProductByProcessingCode: resolveProductByProcessingCode,
    fetchUnitPrice: fetchUnitPrice,
  };

})();

