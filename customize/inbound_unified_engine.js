(function() {
  'use strict';

  /**
   * 総合入庫 — 判定・一括確定（App78）
   * 依存: inbound_unified_config.js, wasai_config.js（和裁士 App16）
   */

  const C = window.CAYANAS_InboundUnified;
  const W = window.CAYANAS_Wasai;

  if (!C || !W) {
    console.error('[inbound_engine] inbound_unified_config.js / wasai_config.js を先に読み込んでください。');
    return;
  }

  const buildProcessingSummary = (orderRecord) => {
    const table = orderRecord[C.ORDER.detailTable];

    if (!table || !Array.isArray(table.value)) {
      return '';
    }

    const names = [];

    table.value.forEach(function(row) {
      const name = String(C.getFieldValue(row.value, 'item_name') ?? '').trim();

      if (name !== '') {
        names.push(name);
      }
    });

    return names.join('、');
  };

  const orderAlreadyInboundForRoute = (orderRecord, route, inboundDateD) => {
    const process = String(C.getFieldValue(orderRecord, C.ORDER.processStatus) ?? '').trim();
    const location = String(C.getFieldValue(orderRecord, C.ORDER.locationStatus) ?? '').trim();

    if (route === C.ROUTE.wasai) {
      const wasaiIn = String(C.getFieldValue(orderRecord, C.ORDER.wasaiInDate) ?? '').trim();

      if (process === C.ORDER_PROCESS.returnWasai && location === C.ORDER_LOCATION.hq) {
        if (wasaiIn !== '' && wasaiIn !== inboundDateD) {
          return '既に入庫済み（和裁士戻り・入庫日 ' + wasaiIn + '）';
        }

        if (wasaiIn === inboundDateD) {
          return '';
        }
      }

      return '';
    }

    if (route === C.ROUTE.overseas) {
      const od = String(C.getFieldValue(orderRecord, C.ORDER.overseasInDate) ?? '').trim();

      if (od !== '' && od !== inboundDateD) {
        return '既に入庫済み（海外入庫日 ' + od + '）';
      }

      return '';
    }

    const od = String(C.getFieldValue(orderRecord, C.ORDER.outsourceInDate) ?? '').trim();

    if (process === C.ORDER_PROCESS.returnOutsource && location === C.ORDER_LOCATION.hq) {
      if (od !== '' && od !== inboundDateD) {
        return '既に入庫済み（外注入庫日 ' + od + '）';
      }
    }

    if (od !== '' && od !== inboundDateD && route === C.ROUTE.domestic) {
      return '既に入庫済み（外注入庫日 ' + od + '）';
    }

    return '';
  };

  const overseasRecordMatchesManageNo = (rec, manageNo) => {
    const candidates = new Set(C.expandManageNoCandidates(manageNo));
    const topValues = [
      String(C.getFieldValue(rec, C.OUT28.manageNo) ?? '').trim(),
      String(C.getFieldValue(rec, C.OUT28.overseasManageNo) ?? '').trim(),
    ];

    if (topValues.some(function(value) {
      return value !== '' && candidates.has(value);
    })) {
      return true;
    }

    const table = rec[C.OUT28.overseasDetails];

    if (!table || !Array.isArray(table.value)) {
      return false;
    }

    return table.value.some(function(row) {
      const mn = String(C.getFieldValue(row.value, C.OUT28.manageNo) ?? '').trim();
      return mn !== '' && candidates.has(mn);
    });
  };

  const pickOpenOverseasOutbound = (records, manageNo) => {
    for (let r = 0; r < records.length; r += 1) {
      const rec = records[r];
      const inDate = String(C.getFieldValue(rec, C.OUT28.overseasInDate) ?? '').trim();

      if (inDate !== '') {
        continue;
      }

      if (!overseasRecordMatchesManageNo(rec, manageNo)) {
        continue;
      }

      return {
        record: rec,
        recordId: rec.$id.value,
        manageNoMatched: manageNo,
      };
    }

    return null;
  };

  const findOverseasOutbound = async (manageNo) => {
    const candidates = C.expandManageNoCandidates(manageNo);

    for (let i = 0; i < candidates.length; i += 1) {
      const m = candidates[i];
      const escaped = C.escapeQueryValue(m);

      // App28 で manage_no がサブテーブル内のみのとき top-level の manage_no = は GAIA_IQ07
      try {
        const byOverseasNo = await C.fetchRecords(
          C.APP.overseasOutbound,
          C.OUT28.overseasManageNo + ' = "' + escaped + '" order by $id desc limit 10'
        );
        const hit = pickOpenOverseasOutbound(byOverseasNo, m);

        if (hit) {
          return hit;
        }
      } catch (err) {
        console.warn('[inbound_engine] App28 overseas_manage_no 検索:', err);
      }
    }

    try {
      const openRecords = await C.fetchRecords(
        C.APP.overseasOutbound,
        C.OUT28.overseasInDate + ' = "" order by $id desc limit 500'
      );

      for (let c = 0; c < candidates.length; c += 1) {
        const hit = pickOpenOverseasOutbound(openRecords, candidates[c]);

        if (hit) {
          return hit;
        }
      }
    } catch (err) {
      console.warn('[inbound_engine] App28 未入庫走査:', err);
    }

    return null;
  };

  const pickOpenDomesticOutboundRow = (rec, manageNo) => {
    const table = rec[C.OUT27.detailTable];

    if (!table || !Array.isArray(table.value)) {
      return null;
    }

    const candidates = new Set(C.expandManageNoCandidates(manageNo));

    for (let rowIndex = 0; rowIndex < table.value.length; rowIndex += 1) {
      const row = table.value[rowIndex];
      const rowManage = String(C.getFieldValue(row.value, C.OUT27.detailManageNo) ?? '').trim();

      if (!candidates.has(rowManage)) {
        continue;
      }

      const lineIn = String(C.getFieldValue(row.value, C.OUT27.lineInDate) ?? '').trim();

      if (lineIn !== '') {
        continue;
      }

      return {
        record: rec,
        recordId: rec.$id.value,
        lineRowId: row.id,
        manageNoMatched: rowManage,
      };
    }

    return null;
  };

  const findDomesticOutbound = async (manageNo) => {
    const candidates = C.expandManageNoCandidates(manageNo);

    for (let i = 0; i < candidates.length; i += 1) {
      const m = candidates[i];
      const query = C.OUT27.detailTable + '.' + C.OUT27.detailManageNo
        + ' = "' + C.escapeQueryValue(m) + '" order by $id desc limit 20';

      try {
        const records = await C.fetchRecords(C.APP.outsourceOutbound, query);

        for (let r = 0; r < records.length; r += 1) {
          const hit = pickOpenDomesticOutboundRow(records[r], m);

          if (hit) {
            return hit;
          }
        }
      } catch (err) {
        console.warn('[inbound_engine] App27 サブテーブル検索:', query, err);
      }
    }

    try {
      const records = await C.fetchRecords(
        C.APP.outsourceOutbound,
        'order by $id desc limit 400'
      );

      for (let c = 0; c < candidates.length; c += 1) {
        for (let r = 0; r < records.length; r += 1) {
          const hit = pickOpenDomesticOutboundRow(records[r], candidates[c]);

          if (hit) {
            return hit;
          }
        }
      }
    } catch (err) {
      console.warn('[inbound_engine] App27 走査検索:', err);
    }

    return null;
  };

  const flattenWasaiLines = (records) => {
    const lines = [];

    records.forEach(function(rec) {
      const table = rec[C.OUT74.outboundLines];

      if (!table || !Array.isArray(table.value)) {
        return;
      }

      table.value.forEach(function(row) {
        lines.push({
          outboundRecord: rec,
          outboundRecordId: rec.$id.value,
          lineRowId: row.id,
          lineValues: row.value,
        });
      });
    });

    return lines;
  };

  const findWasaiOutbound = async (manageNo) => {
    const candidates = new Set(C.expandManageNoCandidates(manageNo));
    const records = await C.fetchRecords(
      C.APP.wasaiOutbound,
      'order by $id desc limit 400'
    );
    const lines = flattenWasaiLines(records);

    return lines.find(function(entry) {
      const mn = String(C.getFieldValue(entry.lineValues, C.OUT74.lineManageNo) ?? '').trim();

      if (!candidates.has(mn)) {
        return false;
      }

      const inboundDate = String(C.getFieldValue(entry.lineValues, C.OUT74.lineInboundDate) ?? '').trim();
      const lineStatus = String(C.getFieldValue(entry.lineValues, C.OUT74.lineStatus) ?? '').trim();

      if (inboundDate !== '') {
        return false;
      }

      return lineStatus === C.WASAI_LINE_OUTBOUND || lineStatus === '';
    }) ?? null;
  };

  const resolveInboundRoute = async (manageNo, orderRecord, inboundDateD) => {
    const hits = [];

    const overseas = await findOverseasOutbound(manageNo);

    if (overseas) {
      hits.push({ route: C.ROUTE.overseas, data: overseas });
    }

    const domestic = await findDomesticOutbound(manageNo);

    if (domestic) {
      hits.push({ route: C.ROUTE.domestic, data: domestic });
    }

    const wasai = await findWasaiOutbound(manageNo);

    if (wasai) {
      hits.push({ route: C.ROUTE.wasai, data: wasai });
    }

    if (hits.length === 0) {
      return { ok: false, errorMessage: '未入庫の出庫記録がありません' };
    }

    if (hits.length > 1) {
      return {
        ok: false,
        errorMessage: '出庫元が複数あります（'
          + hits.map(function(h) { return h.route; }).join('・')
          + '）。管理者に確認してください。',
      };
    }

    const hit = hits[0];
    const dup = orderAlreadyInboundForRoute(orderRecord, hit.route, inboundDateD);

    if (dup !== '') {
      return { ok: false, errorMessage: dup };
    }

    return { ok: true, route: hit.route, hit: hit };
  };

  const buildLineRowValue = (resolved, orderRecord, manageNo, scanIso) => {
    const route = resolved.route;
    const hit = resolved.hit;
    const row = {};

    row[C.UL.manageNo] = { value: manageNo };
    row[C.UL.inboundRoute] = { value: route };
    row[C.UL.lineResult] = { value: C.LINE_RESULT.waiting };
    row[C.UL.errorMessage] = { value: '' };
    row[C.UL.orderRecordId] = { value: String(orderRecord.$id.value) };
    row[C.UL.scannedAt] = { value: scanIso };

    row[C.UL.customerCode] = { value: C.getFieldValue(orderRecord, C.ORDER.customerCode) };
    row[C.UL.customerName] = { value: C.getFieldValue(orderRecord, C.ORDER.customerName) };
    row[C.UL.clientName] = { value: C.getFieldValue(orderRecord, C.ORDER.clientName) };
    row[C.UL.kimonoType] = { value: C.getFieldValue(orderRecord, C.ORDER.kimonoType) };
    row[C.UL.kimonoSpec] = { value: C.getFieldValue(orderRecord, C.ORDER.kimonoSpec) };
    row[C.UL.processingSummary] = { value: buildProcessingSummary(orderRecord) };

    if (route === C.ROUTE.overseas) {
      const rec = hit.data.record;
      row[C.UL.sourceOutboundApp] = { value: C.SOURCE_APP.overseas };
      row[C.UL.sourceOutboundRecordId] = { value: String(hit.data.recordId) };
      row[C.UL.sourceOutboundLineId] = { value: '' };
      row[C.UL.outboundDate] = { value: C.getFieldValue(rec, C.OUT28.shipDate) };
      row[C.UL.scheduledInboundDate] = { value: C.getFieldValue(rec, C.OUT28.scheduledArrival) };
      row[C.UL.destinationCode] = { value: '' };
      row[C.UL.destinationName] = { value: '' };
    } else if (route === C.ROUTE.domestic) {
      const rec = hit.data.record;
      row[C.UL.sourceOutboundApp] = { value: C.SOURCE_APP.domestic };
      row[C.UL.sourceOutboundRecordId] = { value: String(hit.data.recordId) };
      row[C.UL.sourceOutboundLineId] = { value: String(hit.data.lineRowId) };
      row[C.UL.outboundDate] = { value: C.getFieldValue(rec, C.OUT27.shipDate) };
      row[C.UL.scheduledInboundDate] = { value: C.getFieldValue(rec, C.OUT27.returnDate) };
      row[C.UL.destinationCode] = { value: C.getFieldValue(rec, C.OUT27.companyCode) };
      row[C.UL.destinationName] = { value: C.getFieldValue(rec, C.OUT27.companyName) };
    } else {
      const rec = hit.data.outboundRecord;
      row[C.UL.sourceOutboundApp] = { value: C.SOURCE_APP.wasai };
      row[C.UL.sourceOutboundRecordId] = { value: String(hit.data.outboundRecordId) };
      row[C.UL.sourceOutboundLineId] = { value: String(hit.data.lineRowId) };
      row[C.UL.outboundDate] = {
        value: C.getFieldValue(rec, C.OUT74.shipDate)
          || C.getFieldValue(rec, C.OUT74.shipDateAlt),
      };
      row[C.UL.scheduledInboundDate] = { value: C.getFieldValue(rec, C.OUT74.returnDate) };
      row[C.UL.destinationCode] = { value: C.getFieldValue(rec, C.OUT74.wasaiCode) };
      row[C.UL.destinationName] = { value: C.getFieldValue(rec, C.OUT74.wasaiName) };
    }

    return { value: row };
  };

  const get27HeaderStatusCode = (record) => {
    if (record[C.OUT27.headerStatus]) {
      return C.OUT27.headerStatus;
    }

    if (record[C.OUT27.headerStatusAlt]) {
      return C.OUT27.headerStatusAlt;
    }

    return C.OUT27.headerStatus;
  };

  const isOverseasTargetMet = (rec28, orderRec, d) => {
    const in28 = String(C.getFieldValue(rec28, C.OUT28.overseasInDate) ?? '').trim();
    const st28 = String(C.getFieldValue(rec28, C.OUT28.overseasStatus) ?? '').trim();
    const process = String(C.getFieldValue(orderRec, C.ORDER.processStatus) ?? '').trim();
    const location = String(C.getFieldValue(orderRec, C.ORDER.locationStatus) ?? '').trim();
    const od16 = String(C.getFieldValue(orderRec, C.ORDER.overseasInDate) ?? '').trim();

    return in28 === d
      && st28 === C.OVERSEAS_STATUS_RETURNED
      && process === C.ORDER_PROCESS.returnOverseas
      && location === C.ORDER_LOCATION.hq
      && od16 === d;
  };

  const isDomesticTargetMet = (rec27, orderRec, manageNo, d) => {
    const table = rec27[C.OUT27.detailTable];
    let rowOk = false;

    if (table && Array.isArray(table.value)) {
      table.value.forEach(function(row) {
        const mn = String(C.getFieldValue(row.value, C.OUT27.detailManageNo) ?? '').trim();

        if (mn === manageNo) {
          const lineIn = String(C.getFieldValue(row.value, C.OUT27.lineInDate) ?? '').trim();
          rowOk = lineIn === d;
        }
      });
    }

    const process = String(C.getFieldValue(orderRec, C.ORDER.processStatus) ?? '').trim();
    const location = String(C.getFieldValue(orderRec, C.ORDER.locationStatus) ?? '').trim();
    const od16 = String(C.getFieldValue(orderRec, C.ORDER.outsourceInDate) ?? '').trim();

    return rowOk
      && process === C.ORDER_PROCESS.returnOutsource
      && location === C.ORDER_LOCATION.hq
      && od16 === d;
  };

  const isWasaiTargetMet = (rec74, lineRowId, orderRec, d) => {
    const table = rec74[C.OUT74.outboundLines];
    let lineOk = false;

    if (table && Array.isArray(table.value)) {
      table.value.forEach(function(row) {
        if (String(row.id) === String(lineRowId)) {
          const inD = String(C.getFieldValue(row.value, C.OUT74.lineInboundDate) ?? '').trim();
          const st = String(C.getFieldValue(row.value, C.OUT74.lineStatus) ?? '').trim();
          lineOk = inD === d && st === C.WASAI_LINE_INBOUND;
        }
      });
    }

    const process = String(C.getFieldValue(orderRec, C.ORDER.processStatus) ?? '').trim();
    const location = String(C.getFieldValue(orderRec, C.ORDER.locationStatus) ?? '').trim();

    return lineOk
      && process === C.ORDER_PROCESS.returnWasai
      && location === C.ORDER_LOCATION.hq;
  };

  const applyOverseasLine = async (lineValues, d) => {
    const recordId = String(C.getFieldValue(lineValues, C.UL.sourceOutboundRecordId) ?? '').trim();
    const orderId = String(C.getFieldValue(lineValues, C.UL.orderRecordId) ?? '').trim();

    let rec28 = await C.fetchRecord(C.APP.overseasOutbound, recordId);
    let orderRec = await C.fetchRecord(C.APP.order, orderId);

    if (isOverseasTargetMet(rec28, orderRec, d)) {
      return;
    }

    if (String(C.getFieldValue(rec28, C.OUT28.overseasInDate) ?? '').trim() !== d
      || String(C.getFieldValue(rec28, C.OUT28.overseasStatus) ?? '').trim() !== C.OVERSEAS_STATUS_RETURNED) {
      await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', {
        app: C.APP.overseasOutbound,
        id: recordId,
        record: {
          [C.OUT28.overseasInDate]: { value: d },
          [C.OUT28.overseasStatus]: { value: C.OVERSEAS_STATUS_RETURNED },
        },
      });
    }

    orderRec = await C.fetchRecord(C.APP.order, orderId);

    if (!isOverseasTargetMet(await C.fetchRecord(C.APP.overseasOutbound, recordId), orderRec, d)) {
      await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', {
        app: C.APP.order,
        id: orderId,
        record: {
          [C.ORDER.processStatus]: { value: C.ORDER_PROCESS.returnOverseas },
          [C.ORDER.locationStatus]: { value: C.ORDER_LOCATION.hq },
          [C.ORDER.overseasInDate]: { value: d },
        },
      });
    }
  };

  const applyDomesticLine = async (lineValues, d) => {
    const recordId = String(C.getFieldValue(lineValues, C.UL.sourceOutboundRecordId) ?? '').trim();
    const lineRowId = String(C.getFieldValue(lineValues, C.UL.sourceOutboundLineId) ?? '').trim();
    const orderId = String(C.getFieldValue(lineValues, C.UL.orderRecordId) ?? '').trim();
    const manageNo = String(C.getFieldValue(lineValues, C.UL.manageNo) ?? '').trim();

    let rec27 = await C.fetchRecord(C.APP.outsourceOutbound, recordId);
    let orderRec = await C.fetchRecord(C.APP.order, orderId);

    if (isDomesticTargetMet(rec27, orderRec, manageNo, d)) {
      return;
    }

    const table = rec27[C.OUT27.detailTable];
    const rows = table.value.map(function(row) {
      if (String(row.id) !== String(lineRowId)) {
        return { id: row.id, value: {} };
      }

      return {
        id: row.id,
        value: {
          [C.OUT27.lineInDate]: { value: d },
        },
      };
    });

    await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', {
      app: C.APP.outsourceOutbound,
      id: recordId,
      record: {
        [C.OUT27.detailTable]: { value: rows },
      },
    });

    rec27 = await C.fetchRecord(C.APP.outsourceOutbound, recordId);
    const statusCode = get27HeaderStatusCode(rec27);
    let allInbound = true;

    rec27[C.OUT27.detailTable].value.forEach(function(row) {
      const lineIn = String(C.getFieldValue(row.value, C.OUT27.lineInDate) ?? '').trim();

      if (lineIn === '') {
        allInbound = false;
      }
    });

    if (allInbound && statusCode) {
      const current = String(C.getFieldValue(rec27, statusCode) ?? '').trim();

      if (current !== C.OUT27_STATUS_INBOUND) {
        await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', {
          app: C.APP.outsourceOutbound,
          id: recordId,
          record: {
            [statusCode]: { value: C.OUT27_STATUS_INBOUND },
          },
        });
      }
    }

    orderRec = await C.fetchRecord(C.APP.order, orderId);

    if (String(C.getFieldValue(orderRec, C.ORDER.outsourceInDate) ?? '').trim() !== d
      || String(C.getFieldValue(orderRec, C.ORDER.processStatus) ?? '').trim() !== C.ORDER_PROCESS.returnOutsource) {
      await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', {
        app: C.APP.order,
        id: orderId,
        record: {
          [C.ORDER.processStatus]: { value: C.ORDER_PROCESS.returnOutsource },
          [C.ORDER.locationStatus]: { value: C.ORDER_LOCATION.hq },
          [C.ORDER.outsourceInDate]: { value: d },
        },
      });
    }
  };

  const applyWasaiLine = async (lineValues, d) => {
    const recordId = String(C.getFieldValue(lineValues, C.UL.sourceOutboundRecordId) ?? '').trim();
    const lineRowId = String(C.getFieldValue(lineValues, C.UL.sourceOutboundLineId) ?? '').trim();
    const orderId = String(C.getFieldValue(lineValues, C.UL.orderRecordId) ?? '').trim();
    const manageNo = String(C.getFieldValue(lineValues, C.UL.manageNo) ?? '').trim();

    let rec74 = await C.fetchRecord(C.APP.wasaiOutbound, recordId);
    let orderRec = await C.fetchRecord(C.APP.order, orderId);

    if (isWasaiTargetMet(rec74, lineRowId, orderRec, d)) {
      return;
    }

    const table = rec74[C.OUT74.outboundLines];
    const rows = table.value.map(function(row) {
      if (String(row.id) !== String(lineRowId)) {
        return { id: row.id, value: {} };
      }

      return {
        id: row.id,
        value: {
          [C.OUT74.lineInboundDate]: { value: d },
          [C.OUT74.lineStatus]: { value: C.WASAI_LINE_INBOUND },
        },
      };
    });

    await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', {
      app: C.APP.wasaiOutbound,
      id: recordId,
      record: {
        [C.OUT74.outboundLines]: { value: rows },
      },
    });

    orderRec = await W.fetchOrderByManageNo(manageNo) || await C.fetchRecord(C.APP.order, orderId);
    const upd = await W.updateOrderForWasai(orderRec, 'inbound', d);

    if (upd.skipped) {
      throw new Error(upd.message || 'App16（和裁士戻り）を更新できませんでした');
    }
  };

  const applyLineByRoute = async (lineValues, d) => {
    const route = String(C.getFieldValue(lineValues, C.UL.inboundRoute) ?? '').trim();

    if (route === C.ROUTE.overseas) {
      await applyOverseasLine(lineValues, d);
      return;
    }

    if (route === C.ROUTE.domestic) {
      await applyDomesticLine(lineValues, d);
      return;
    }

    if (route === C.ROUTE.wasai) {
      await applyWasaiLine(lineValues, d);
      return;
    }

    throw new Error('不明な入庫ルート: ' + route);
  };

  const isLineTargetFullyMet = async (lineValues, d) => {
    const route = String(C.getFieldValue(lineValues, C.UL.inboundRoute) ?? '').trim();
    const orderId = String(C.getFieldValue(lineValues, C.UL.orderRecordId) ?? '').trim();
    const orderRec = await C.fetchRecord(C.APP.order, orderId);
    const manageNo = String(C.getFieldValue(lineValues, C.UL.manageNo) ?? '').trim();

    if (route === C.ROUTE.overseas) {
      const id28 = String(C.getFieldValue(lineValues, C.UL.sourceOutboundRecordId) ?? '').trim();
      const rec28 = await C.fetchRecord(C.APP.overseasOutbound, id28);
      return isOverseasTargetMet(rec28, orderRec, d);
    }

    if (route === C.ROUTE.domestic) {
      const id27 = String(C.getFieldValue(lineValues, C.UL.sourceOutboundRecordId) ?? '').trim();
      const rec27 = await C.fetchRecord(C.APP.outsourceOutbound, id27);
      return isDomesticTargetMet(rec27, orderRec, manageNo, d);
    }

    if (route === C.ROUTE.wasai) {
      const id74 = String(C.getFieldValue(lineValues, C.UL.sourceOutboundRecordId) ?? '').trim();
      const lineRowId = String(C.getFieldValue(lineValues, C.UL.sourceOutboundLineId) ?? '').trim();
      const rec74 = await C.fetchRecord(C.APP.wasaiOutbound, id74);
      return isWasaiTargetMet(rec74, lineRowId, orderRec, d);
    }

    return false;
  };

  const buildSubtablePutRows = (table, lineId, patch) => {
    return table.value.map(function(row) {
      if (String(row.id) !== String(lineId)) {
        return { id: row.id, value: {} };
      }

      const value = {};

      Object.keys(patch).forEach(function(key) {
        value[key] = { value: patch[key] };
      });

      return { id: row.id, value: value };
    });
  };

  const countLineResults = (table) => {
    let success = 0;
    let errors = 0;
    let waiting = 0;

    if (!table || !Array.isArray(table.value)) {
      return { success: success, errors: errors, waiting: waiting, total: 0 };
    }

    table.value.forEach(function(row) {
      const result = String(C.getFieldValue(row.value, C.UL.lineResult) ?? '').trim();

      if (result === C.LINE_RESULT.success) {
        success += 1;
      } else if (result === C.LINE_RESULT.error) {
        errors += 1;
      } else if (result === C.LINE_RESULT.waiting) {
        waiting += 1;
      }
    });

    return {
      success: success,
      errors: errors,
      waiting: waiting,
      total: table.value.length,
    };
  };

  const appendRemarksLog = (record, entry) => {
    const prev = String(C.getFieldValue(record, C.UF.inboundRemarks) ?? '').trim();
    let parsed = { batch_no: '', attempts: [] };

    if (prev !== '') {
      try {
        parsed = JSON.parse(prev);
      } catch (e) {
        parsed = { batch_no: '', attempts: [], note: prev };
      }
    }

    if (!Array.isArray(parsed.attempts)) {
      parsed.attempts = [];
    }

    parsed.attempts.push(entry);

    return JSON.stringify(parsed);
  };

  const generateBatchNo = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = d.getFullYear()
      + pad(d.getMonth() + 1)
      + pad(d.getDate())
      + pad(d.getHours())
      + pad(d.getMinutes())
      + pad(d.getSeconds());

    return 'INB-' + stamp + '-' + String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  };

  const runBatchConfirm = async (unifiedRecordId) => {
    const unified = await C.fetchRecord(C.APP.unified, unifiedRecordId);
    const status = String(C.getFieldValue(unified, C.UF.inboundStatus) ?? '').trim();
    const inboundDateD = String(C.getFieldValue(unified, C.UF.inboundDate) ?? '').trim();

    if (status !== C.INBOUND_STATUS.draft) {
      throw new Error('下書きのレコードのみ一括入庫できます');
    }

    if (inboundDateD === '') {
      throw new Error('入庫日を入力してください');
    }

    const table = unified[C.UF.inboundLines];

    if (!table || !Array.isArray(table.value) || table.value.length === 0) {
      throw new Error('入庫明細がありません');
    }

    const counts = countLineResults(table);

    if (counts.errors > 0) {
      throw new Error('エラー行があるため一括入庫できません（' + counts.errors + '件）');
    }

    if (counts.waiting === 0 && counts.success === counts.total) {
      await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', {
        app: C.APP.unified,
        id: unifiedRecordId,
        record: {
          [C.UF.inboundStatus]: { value: C.INBOUND_STATUS.confirmed },
          [C.UF.confirmedAt]: { value: C.nowDatetimeLocal() },
          [C.UF.successCount]: { value: String(counts.success) },
          [C.UF.errorCount]: { value: '0' },
          [C.UF.lineCount]: { value: String(counts.total) },
        },
      });

      return { completed: true, message: 'すべて入庫確定済みです' };
    }

    let batchNo = String(C.getFieldValue(unified, C.UF.inboundBatchNo) ?? '').trim();

    if (batchNo === '') {
      batchNo = generateBatchNo();

      await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', {
        app: C.APP.unified,
        id: unifiedRecordId,
        record: {
          [C.UF.inboundBatchNo]: { value: batchNo },
        },
      });
    }

    const attemptStarted = C.nowIso();

    try {
      for (let i = 0; i < table.value.length; i += 1) {
        const row = table.value[i];
        const lineValues = row.value;
        const lineResult = String(C.getFieldValue(lineValues, C.UL.lineResult) ?? '').trim();

        if (lineResult === C.LINE_RESULT.error) {
          continue;
        }

        if (lineResult === C.LINE_RESULT.success) {
          const met = await isLineTargetFullyMet(lineValues, inboundDateD);

          if (met) {
            continue;
          }
        }

        await applyLineByRoute(lineValues, inboundDateD);

        const metAfter = await isLineTargetFullyMet(lineValues, inboundDateD);

        if (!metAfter) {
          throw new Error('管理番号 '
            + C.getFieldValue(lineValues, C.UL.manageNo)
            + ' の目標状態を確認できませんでした');
        }

        const fresh = await C.fetchRecord(C.APP.unified, unifiedRecordId);
        const freshTable = fresh[C.UF.inboundLines];
        const putRows = buildSubtablePutRows(freshTable, row.id, {
          [C.UL.lineResult]: C.LINE_RESULT.success,
          [C.UL.appliedAt]: C.nowDatetimeLocal(),
        });

        await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', {
          app: C.APP.unified,
          id: unifiedRecordId,
          record: {
            [C.UF.inboundLines]: { value: putRows },
          },
        });
      }

      const finalRec = await C.fetchRecord(C.APP.unified, unifiedRecordId);
      const finalCounts = countLineResults(finalRec[C.UF.inboundLines]);

      if (finalCounts.success !== finalCounts.total) {
        throw new Error('一部明細が未完了のままです');
      }

      await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', {
        app: C.APP.unified,
        id: unifiedRecordId,
        record: {
          [C.UF.inboundStatus]: { value: C.INBOUND_STATUS.confirmed },
          [C.UF.confirmedAt]: { value: C.nowDatetimeLocal() },
          [C.UF.successCount]: { value: String(finalCounts.success) },
          [C.UF.errorCount]: { value: '0' },
          [C.UF.lineCount]: { value: String(finalCounts.total) },
          [C.UF.inboundRemarks]: {
            value: appendRemarksLog(finalRec, {
              started_at: attemptStarted,
              result: 'completed',
              batch_no: batchNo,
            }),
          },
        },
      });

      return { completed: true, message: '一括入庫が完了しました（' + finalCounts.success + '件）' };
    } catch (err) {
      const onFail = await C.fetchRecord(C.APP.unified, unifiedRecordId);
      const failCounts = countLineResults(onFail[C.UF.inboundLines]);

      await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', {
        app: C.APP.unified,
        id: unifiedRecordId,
        record: {
          [C.UF.inboundStatus]: { value: C.INBOUND_STATUS.draft },
          [C.UF.successCount]: { value: String(failCounts.success) },
          [C.UF.errorCount]: { value: String(failCounts.errors) },
          [C.UF.lineCount]: { value: String(failCounts.total) },
          [C.UF.inboundRemarks]: {
            value: appendRemarksLog(onFail, {
              started_at: attemptStarted,
              result: 'interrupted',
              batch_no: batchNo,
              api_message: C.formatKintoneError(err),
            }),
          },
        },
      });

      throw err;
    }
  };

  const scanManageNo = async (manageNo, inboundDateD) => {
    const normalized = String(manageNo ?? '').trim();

    if (!normalized) {
      return { ok: false, errorMessage: '管理番号が空です' };
    }

    if (!inboundDateD) {
      return { ok: false, errorMessage: '入庫日を入力してください' };
    }

    const orders = await C.fetchRecords(
      C.APP.order,
      C.ORDER.manageNo + ' = "' + C.escapeQueryValue(normalized) + '" limit 1'
    );

    if (orders.length === 0) {
      const cands = C.expandManageNoCandidates(normalized);

      for (let i = 0; i < cands.length; i += 1) {
        const alt = await C.fetchRecords(
          C.APP.order,
          C.ORDER.manageNo + ' = "' + C.escapeQueryValue(cands[i]) + '" limit 1'
        );

        if (alt[0]) {
          orders.push(alt[0]);
          break;
        }
      }
    }

    if (!orders[0]) {
      return { ok: false, errorMessage: '受注明細(App16)に管理番号がありません' };
    }

    const resolved = await resolveInboundRoute(normalized, orders[0], inboundDateD);

    if (!resolved.ok) {
      return resolved;
    }

    const lineRow = buildLineRowValue(resolved, orders[0], normalized, C.nowDatetimeLocal());

    return { ok: true, lineRow: lineRow };
  };

  window.CAYANAS_InboundUnifiedEngine = {
    scanManageNo: scanManageNo,
    runBatchConfirm: runBatchConfirm,
    countLineResults: countLineResults,
  };

})();
