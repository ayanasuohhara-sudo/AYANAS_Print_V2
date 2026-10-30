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

    /*
     * 国内外注: App16.outsource_in_date では入庫可否を判定しない。
     * 正本は App27 未入庫明細（listOpenDomestic / line_in_date 空）。
     * outsource_in_date は入庫成功時に「最新入庫日」として上書きするだけ。
     */
    if (route === C.ROUTE.domestic) {
      return '';
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

  const historyWriteAction = (existingDate, today) => {
    const existing = String(existingDate ?? '').trim();
    const target = String(today ?? '').trim();

    if (existing !== '' && existing !== target) {
      return 'keep';
    }

    if (existing === target && target !== '') {
      return 'keep-today';
    }

    return 'write';
  };

  const openItemKey = (item) => [
    item.route,
    String(item.recordId ?? ''),
    String(item.lineRowId ?? ''),
  ].join('|');

  const selectPrimaryOpenItem = (items) => {
    const list = Array.isArray(items) ? items : [];

    if (list.length === 0) {
      return { confident: false, item: null, reason: '未入庫がありません' };
    }

    const routes = new Set(list.map(function(item) { return item.route; }));

    if (routes.size === 1) {
      return { confident: true, item: list[0], reason: '' };
    }

    const missing = list.filter(function(item) {
      return String(item.shipDate ?? '').trim() === ''
        || String(item.createdAt ?? '').trim() === '';
    });

    if (missing.length > 0) {
      return {
        confident: false,
        item: null,
        reason: '出庫日または作成日時が無いため、最新の出庫を特定できません',
      };
    }

    const sorted = list.slice().sort(function(a, b) {
      const byShip = String(b.shipDate).localeCompare(String(a.shipDate));

      if (byShip !== 0) {
        return byShip;
      }

      return String(b.createdAt).localeCompare(String(a.createdAt));
    });

    const top = sorted[0];
    const next = sorted[1];
    const tied = String(top.shipDate) === String(next.shipDate)
      && String(top.createdAt) === String(next.createdAt);

    if (tied) {
      return {
        confident: false,
        item: null,
        reason: '出庫日時が同じため、最新の出庫を特定できません',
      };
    }

    return { confident: true, item: top, reason: '' };
  };

  const summarizeOpenItems = (items) => {
    const summary = {
      total: items.length,
      domestic: 0,
      overseas: 0,
      wasai: 0,
    };

    items.forEach(function(item) {
      if (item.route === C.ROUTE.domestic) {
        summary.domestic += 1;
      } else if (item.route === C.ROUTE.overseas) {
        summary.overseas += 1;
      } else if (item.route === C.ROUTE.wasai) {
        summary.wasai += 1;
      }
    });

    return summary;
  };

  const buildBulkConfirmText = (manageNo, items) => {
    const summary = summarizeOpenItems(items);
    const primary = selectPrimaryOpenItem(items);
    const lines = items.map(function(item) {
      const ship = String(item.shipDate ?? '').trim();
      return '・' + item.route + ' 出庫日 ' + (ship === '' ? 'なし' : ship);
    });
    let text = '管理番号：' + manageNo
      + '\n\nこの管理番号には未入庫の外注履歴が' + summary.total + '件あります。\n'
      + '国内外注 ' + summary.domestic + '件\n'
      + '海外外注 ' + summary.overseas + '件\n'
      + '和裁士 ' + summary.wasai + '件\n\n'
      + lines.join('\n')
      + '\n\n' + summary.total + '件すべてを入庫済みにしますか？';

    if (primary.confident && primary.item) {
      const sameRoute = items.every(function(item) {
        return item.route === primary.item.route;
      });

      if (sameRoute) {
        text += '\n\n受注の工程は、通常の' + primary.item.route + '入庫後の状態に1回だけ更新します。';
      } else {
        const ship = String(primary.item.shipDate ?? '').trim();
        text += '\n\n受注の工程は、最新の' + primary.item.route
          + '（出庫日 ' + (ship === '' ? 'なし' : ship) + '）の通常入庫後の状態に1回だけ更新します。';
      }
    } else {
      text += '\n\n' + (primary.reason || '最新の出庫を特定できません')
        + '。未入庫の履歴だけを入庫済みにし、受注の工程・保管場所は変更しません。';
    }

    return text;
  };

  const planInboundItems = (items) => {
    const list = Array.isArray(items) ? items : [];

    if (list.length === 0) {
      return {
        ok: false,
        errorMessage:
          '現在、未入庫の外注履歴がありません。'
          + '（国内外注・海外外注・和裁士出庫の未入庫明細を確認してください）',
      };
    }

    if (list.length === 1) {
      return { ok: true, bulk: false, items: list };
    }

    return {
      ok: true,
      bulk: true,
      items: list,
      primary: selectPrimaryOpenItem(list),
    };
  };

  const pushOpenOverseas = (found, seen, rec, manageNo) => {
    if (!rec || !rec.$id) {
      return;
    }

    const recordId = String(rec.$id.value);

    if (seen.has(recordId)) {
      return;
    }

    const inDate = String(C.getFieldValue(rec, C.OUT28.overseasInDate) ?? '').trim();

    if (inDate !== '') {
      return;
    }

    if (!overseasRecordMatchesManageNo(rec, manageNo)) {
      return;
    }

    seen.add(recordId);
    found.push({
      route: C.ROUTE.overseas,
      record: rec,
      recordId: rec.$id.value,
      lineRowId: '',
      shipDate: String(C.getFieldValue(rec, C.OUT28.shipDate) ?? '').trim(),
      createdAt: recordCreatedAt(rec),
      manageNoMatched: manageNo,
    });
  };

  const listOpenOverseas = async (manageNo) => {
    const found = [];
    const seen = new Set();
    const candidates = C.expandManageNoCandidates(manageNo);

    for (let i = 0; i < candidates.length; i += 1) {
      const m = candidates[i];
      const escaped = C.escapeQueryValue(m);

      try {
        const byOverseasNo = await C.fetchRecords(
          C.APP.overseasOutbound,
          C.OUT28.overseasManageNo + ' = "' + escaped + '" order by $id desc limit 500'
        );

        byOverseasNo.forEach(function(rec) {
          pushOpenOverseas(found, seen, rec, m);
        });
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
        openRecords.forEach(function(rec) {
          pushOpenOverseas(found, seen, rec, candidates[c]);
        });
      }
    } catch (err) {
      console.warn('[inbound_engine] App28 未入庫走査:', err);
    }

    return found;
  };

  const pushOpenDomesticRows = (found, seen, rec, manageNo) => {
    const table = rec[C.OUT27.detailTable];

    if (!table || !Array.isArray(table.value)) {
      return;
    }

    const candidates = new Set(C.expandManageNoCandidates(manageNo));
    const shipDate = String(C.getFieldValue(rec, C.OUT27.shipDate) ?? '').trim();
    const createdAt = recordCreatedAt(rec);

    table.value.forEach(function(row) {
      const rowManage = String(C.getFieldValue(row.value, C.OUT27.detailManageNo) ?? '').trim();

      if (!candidates.has(rowManage)) {
        return;
      }

      const lineIn = String(C.getFieldValue(row.value, C.OUT27.lineInDate) ?? '').trim();

      if (lineIn !== '') {
        return;
      }

      const key = String(rec.$id.value) + ':' + String(row.id);

      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      found.push({
        route: C.ROUTE.domestic,
        record: rec,
        recordId: rec.$id.value,
        lineRowId: row.id,
        shipDate: shipDate,
        createdAt: createdAt,
        manageNoMatched: rowManage,
      });
    });
  };

  /**
   * App27: サブテーブル条件クエリは環境により 400 になるため使わない。
   * 直近出庫伝票を取得し、明細 manage_no / line_in_date はクライアント側で判定する。
   */
  const listOpenDomestic = async (manageNo) => {
    const found = [];
    const seen = new Set();
    const candidates = C.expandManageNoCandidates(manageNo);

    try {
      const records = await C.fetchRecords(
        C.APP.outsourceOutbound,
        'order by $id desc limit 500'
      );

      for (let c = 0; c < candidates.length; c += 1) {
        records.forEach(function(rec) {
          pushOpenDomesticRows(found, seen, rec, candidates[c]);
        });
      }
    } catch (err) {
      console.warn('[inbound_engine] App27 走査検索:', err);
    }

    return found;
  };

  const recordCreatedAt = (rec) => {
    if (!rec) {
      return '';
    }

    if (rec.$createdAt && rec.$createdAt.value) {
      return String(rec.$createdAt.value).trim();
    }

    return String(
      C.getFieldValue(rec, '作成日時')
      || C.getFieldValue(rec, 'Created_datetime')
      || ''
    ).trim();
  };

  /** 和裁士明細が未入庫として扱えるか（入庫済・検品後は除外） */
  const isOpenWasaiLineStatus = (lineStatus, inboundDate) => {
    if (String(inboundDate ?? '').trim() !== '') {
      return false;
    }

    const st = String(lineStatus ?? '').trim();

    if (st === '' || st === C.WASAI_LINE_OUTBOUND) {
      return true;
    }

    /* 入庫済・検品OK・再加工・保留・支払系は未入庫ではない */
    if (st === C.WASAI_LINE_INBOUND
      || st === '検品OK'
      || st === '再加工'
      || st === '保留'
      || st === '支払対象'
      || st === '計上済'
      || st === '支払済') {
      return false;
    }

    /* 未知の行状態でも入庫日が空なら未入庫候補とする */
    return true;
  };

  /**
   * App74: サブテーブル条件（wasai_outbound_lines.manage_no in/ =）は 400 になる環境がある。
   * ヘッダ条件のみで取得し、管理番号はクライアント側で絞る（wasai_inbound.js と同じ方針）。
   */
  const listOpenWasai = async (manageNo) => {
    const candidates = new Set(C.expandManageNoCandidates(manageNo));
    const found = [];
    const seen = new Set();

    const absorb = (records) => {
      flattenWasaiLines(records).forEach(function(entry) {
        const mn = String(C.getFieldValue(entry.lineValues, C.OUT74.lineManageNo) ?? '').trim();

        if (!candidates.has(mn)) {
          return;
        }

        const inboundDate = String(C.getFieldValue(entry.lineValues, C.OUT74.lineInboundDate) ?? '').trim();
        const lineStatus = String(C.getFieldValue(entry.lineValues, C.OUT74.lineStatus) ?? '').trim();
        const headerStatus = String(
          C.getFieldValue(entry.outboundRecord, C.OUT74.outboundStatus) ?? ''
        ).trim();

        /* 取消伝票は除外。空・出庫確定・その他は候補（下書きに未入庫が残るケースも拾う） */
        if (headerStatus === '取消') {
          return;
        }

        if (!isOpenWasaiLineStatus(lineStatus, inboundDate)) {
          return;
        }

        const key = String(entry.outboundRecordId) + ':' + String(entry.lineRowId);

        if (seen.has(key)) {
          return;
        }

        seen.add(key);
        const rec = entry.outboundRecord;
        found.push({
          route: C.ROUTE.wasai,
          record: rec,
          recordId: entry.outboundRecordId,
          lineRowId: entry.lineRowId,
          lineValues: entry.lineValues,
          shipDate: String(
            C.getFieldValue(rec, C.OUT74.shipDate)
            || C.getFieldValue(rec, C.OUT74.shipDateAlt)
            || ''
          ).trim(),
          createdAt: recordCreatedAt(rec),
          manageNoMatched: mn,
        });
      });
    };

    /* 1) 出庫確定ヘッダのみ（明細条件なし） */
    try {
      absorb(await C.fetchRecords(
        C.APP.wasaiOutbound,
        C.OUT74.outboundStatus + ' = "' + C.escapeQueryValue(C.WASAI_OUTBOUND_HEADER) + '"'
          + ' order by $id desc limit 500'
      ));
    } catch (err) {
      console.warn('[inbound_engine] App74 出庫確定検索:', err);
    }

    /* 2) 直近伝票の走査（下書き等に未入庫が残るケース） */
    if (found.length === 0) {
      try {
        absorb(await C.fetchRecords(
          C.APP.wasaiOutbound,
          'order by $id desc limit 500'
        ));
      } catch (scanErr) {
        console.warn('[inbound_engine] App74 走査検索:', scanErr);
      }
    }

    return found;
  };

  const asRouteHit = (item) => {
    if (item.route === C.ROUTE.wasai) {
      return {
        route: item.route,
        hit: {
          data: {
            outboundRecord: item.record,
            outboundRecordId: item.recordId,
            lineRowId: item.lineRowId,
            lineValues: item.lineValues,
          },
        },
      };
    }

    return {
      route: item.route,
      hit: { data: item },
    };
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
    const items = []
      .concat(await listOpenOverseas(manageNo))
      .concat(await listOpenDomestic(manageNo))
      .concat(await listOpenWasai(manageNo));
    const plan = planInboundItems(items);

    if (!plan.ok) {
      return plan;
    }

    if (!plan.bulk) {
      const dup = orderAlreadyInboundForRoute(orderRecord, items[0].route, inboundDateD);

      if (dup !== '') {
        return { ok: false, errorMessage: dup };
      }
    }

    return plan;
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

  const readDomesticLineInDate = (rec27, lineRowId) => {
    const table = rec27[C.OUT27.detailTable];

    if (!table || !Array.isArray(table.value)) {
      return '';
    }

    for (let i = 0; i < table.value.length; i += 1) {
      const row = table.value[i];

      if (String(row.id) === String(lineRowId)) {
        return String(C.getFieldValue(row.value, C.OUT27.lineInDate) ?? '').trim();
      }
    }

    return '';
  };

  const readWasaiLine = (rec74, lineRowId) => {
    const table = rec74[C.OUT74.outboundLines];

    if (!table || !Array.isArray(table.value)) {
      return { inboundDate: '', lineStatus: '' };
    }

    for (let i = 0; i < table.value.length; i += 1) {
      const row = table.value[i];

      if (String(row.id) === String(lineRowId)) {
        return {
          inboundDate: String(C.getFieldValue(row.value, C.OUT74.lineInboundDate) ?? '').trim(),
          lineStatus: String(C.getFieldValue(row.value, C.OUT74.lineStatus) ?? '').trim(),
        };
      }
    }

    return { inboundDate: '', lineStatus: '' };
  };

  const isDomesticTargetMet = (rec27, orderRec, manageNo, d, lineRowId) => {
    const table = rec27[C.OUT27.detailTable];
    let rowOk = false;

    if (table && Array.isArray(table.value)) {
      table.value.forEach(function(row) {
        if (lineRowId && String(row.id) !== String(lineRowId)) {
          return;
        }

        const mn = String(C.getFieldValue(row.value, C.OUT27.detailManageNo) ?? '').trim();

        if (lineRowId || mn === manageNo) {
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

  const applyOverseasLine = async (lineValues, d, options) => {
    const updateOrder = !options || options.updateOrder !== false;
    const recordId = String(C.getFieldValue(lineValues, C.UL.sourceOutboundRecordId) ?? '').trim();
    const orderId = String(C.getFieldValue(lineValues, C.UL.orderRecordId) ?? '').trim();

    let rec28 = await C.fetchRecord(C.APP.overseasOutbound, recordId);
    let orderRec = await C.fetchRecord(C.APP.order, orderId);

    if (updateOrder && isOverseasTargetMet(rec28, orderRec, d)) {
      return;
    }

    const existingIn = String(C.getFieldValue(rec28, C.OUT28.overseasInDate) ?? '').trim();
    const existingStatus = String(C.getFieldValue(rec28, C.OUT28.overseasStatus) ?? '').trim();
    const action = historyWriteAction(existingIn, d);

    if (action === 'write' || (action === 'keep-today' && existingStatus !== C.OVERSEAS_STATUS_RETURNED)) {
      await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', {
        app: C.APP.overseasOutbound,
        id: recordId,
        record: {
          [C.OUT28.overseasInDate]: { value: d },
          [C.OUT28.overseasStatus]: { value: C.OVERSEAS_STATUS_RETURNED },
        },
      });
      rec28 = await C.fetchRecord(C.APP.overseasOutbound, recordId);
    }

    if (!updateOrder) {
      return;
    }

    orderRec = await C.fetchRecord(C.APP.order, orderId);

    if (!isOverseasTargetMet(rec28, orderRec, d)) {
      const overseasOrderBase = {
        [C.ORDER.processStatus]: { value: C.ORDER_PROCESS.returnOverseas },
        [C.ORDER.locationStatus]: { value: C.ORDER_LOCATION.hq },
        [C.ORDER.overseasInDate]: { value: d },
      };
      const overseasOrderWithWork = {
        ...overseasOrderBase,
        [C.ORDER.workStatus]: { value: C.ORDER_WORK.finishInProgress },
      };

      try {
        await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', {
          app: C.APP.order,
          id: orderId,
          record: overseasOrderWithWork,
        });
      } catch (putErr) {
        console.warn('[inbound_engine] 海外戻り work_status 付き PUT 失敗。work なしで再試行:', putErr);
        await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', {
          app: C.APP.order,
          id: orderId,
          record: overseasOrderBase,
        });
      }
    }
  };

  const applyDomesticLine = async (lineValues, d, options) => {
    const updateOrder = !options || options.updateOrder !== false;
    const recordId = String(C.getFieldValue(lineValues, C.UL.sourceOutboundRecordId) ?? '').trim();
    const lineRowId = String(C.getFieldValue(lineValues, C.UL.sourceOutboundLineId) ?? '').trim();
    const orderId = String(C.getFieldValue(lineValues, C.UL.orderRecordId) ?? '').trim();
    const manageNo = String(C.getFieldValue(lineValues, C.UL.manageNo) ?? '').trim();

    let rec27 = await C.fetchRecord(C.APP.outsourceOutbound, recordId);
    let orderRec = await C.fetchRecord(C.APP.order, orderId);

    if (updateOrder && isDomesticTargetMet(rec27, orderRec, manageNo, d, lineRowId)) {
      return;
    }

    const action = historyWriteAction(readDomesticLineInDate(rec27, lineRowId), d);

    if (action === 'write') {
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
    }
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

    if (!updateOrder) {
      return;
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

  const applyWasaiLine = async (lineValues, d, options) => {
    const updateOrder = !options || options.updateOrder !== false;
    const recordId = String(C.getFieldValue(lineValues, C.UL.sourceOutboundRecordId) ?? '').trim();
    const lineRowId = String(C.getFieldValue(lineValues, C.UL.sourceOutboundLineId) ?? '').trim();
    const orderId = String(C.getFieldValue(lineValues, C.UL.orderRecordId) ?? '').trim();
    const manageNo = String(C.getFieldValue(lineValues, C.UL.manageNo) ?? '').trim();

    let rec74 = await C.fetchRecord(C.APP.wasaiOutbound, recordId);
    let orderRec = await C.fetchRecord(C.APP.order, orderId);

    if (updateOrder && isWasaiTargetMet(rec74, lineRowId, orderRec, d)) {
      return;
    }

    const wasaiLine = readWasaiLine(rec74, lineRowId);
    const action = historyWriteAction(wasaiLine.inboundDate, d);

    if (action === 'write' || (action === 'keep-today' && wasaiLine.lineStatus !== C.WASAI_LINE_INBOUND)) {
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
    }

    if (!updateOrder) {
      return;
    }

    orderRec = await W.fetchOrderByManageNo(manageNo) || await C.fetchRecord(C.APP.order, orderId);
    const upd = await W.updateOrderForWasai(orderRec, 'inbound', d);

    if (upd.skipped) {
      throw new Error(upd.message || 'App16（和裁士戻り）を更新できませんでした');
    }
  };

  const applyLineByRoute = async (lineValues, d, options) => {
    const route = String(C.getFieldValue(lineValues, C.UL.inboundRoute) ?? '').trim();

    if (route === C.ROUTE.overseas) {
      await applyOverseasLine(lineValues, d, options);
      return;
    }

    if (route === C.ROUTE.domestic) {
      await applyDomesticLine(lineValues, d, options);
      return;
    }

    if (route === C.ROUTE.wasai) {
      await applyWasaiLine(lineValues, d, options);
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
      const lineRowId = String(C.getFieldValue(lineValues, C.UL.sourceOutboundLineId) ?? '').trim();
      return isDomesticTargetMet(rec27, orderRec, manageNo, d, lineRowId);
    }

    if (route === C.ROUTE.wasai) {
      const id74 = String(C.getFieldValue(lineValues, C.UL.sourceOutboundRecordId) ?? '').trim();
      const lineRowId = String(C.getFieldValue(lineValues, C.UL.sourceOutboundLineId) ?? '').trim();
      const rec74 = await C.fetchRecord(C.APP.wasaiOutbound, id74);
      return isWasaiTargetMet(rec74, lineRowId, orderRec, d);
    }

    return false;
  };

  const isHistoryOnlyMet = async (lineValues, d) => {
    const route = String(C.getFieldValue(lineValues, C.UL.inboundRoute) ?? '').trim();

    if (route === C.ROUTE.overseas) {
      const id28 = String(C.getFieldValue(lineValues, C.UL.sourceOutboundRecordId) ?? '').trim();
      const rec28 = await C.fetchRecord(C.APP.overseasOutbound, id28);
      const inDate = String(C.getFieldValue(rec28, C.OUT28.overseasInDate) ?? '').trim();

      if (inDate === '') {
        return false;
      }

      if (inDate !== d) {
        return true;
      }

      return String(C.getFieldValue(rec28, C.OUT28.overseasStatus) ?? '').trim() === C.OVERSEAS_STATUS_RETURNED;
    }

    if (route === C.ROUTE.domestic) {
      const id27 = String(C.getFieldValue(lineValues, C.UL.sourceOutboundRecordId) ?? '').trim();
      const lineRowId = String(C.getFieldValue(lineValues, C.UL.sourceOutboundLineId) ?? '').trim();
      const rec27 = await C.fetchRecord(C.APP.outsourceOutbound, id27);
      return readDomesticLineInDate(rec27, lineRowId) !== '';
    }

    if (route === C.ROUTE.wasai) {
      const id74 = String(C.getFieldValue(lineValues, C.UL.sourceOutboundRecordId) ?? '').trim();
      const lineRowId = String(C.getFieldValue(lineValues, C.UL.sourceOutboundLineId) ?? '').trim();
      const rec74 = await C.fetchRecord(C.APP.wasaiOutbound, id74);
      const line = readWasaiLine(rec74, lineRowId);

      if (line.inboundDate === '') {
        return false;
      }

      if (line.inboundDate !== d) {
        return true;
      }

      return line.lineStatus === C.WASAI_LINE_INBOUND;
    }

    return false;
  };

  const lineApplyKey = (lineValues) => openItemKey({
    route: String(C.getFieldValue(lineValues, C.UL.inboundRoute) ?? '').trim(),
    recordId: String(C.getFieldValue(lineValues, C.UL.sourceOutboundRecordId) ?? '').trim(),
    lineRowId: String(C.getFieldValue(lineValues, C.UL.sourceOutboundLineId) ?? '').trim(),
  });

  const sourceAppIdForRoute = (route) => {
    if (route === C.ROUTE.overseas) {
      return C.APP.overseasOutbound;
    }

    if (route === C.ROUTE.wasai) {
      return C.APP.wasaiOutbound;
    }

    return C.APP.outsourceOutbound;
  };

  const shipDateFromOutbound = (route, rec) => {
    if (route === C.ROUTE.overseas) {
      return String(C.getFieldValue(rec, C.OUT28.shipDate) ?? '').trim();
    }

    if (route === C.ROUTE.wasai) {
      return String(
        C.getFieldValue(rec, C.OUT74.shipDate)
        || C.getFieldValue(rec, C.OUT74.shipDateAlt)
        || ''
      ).trim();
    }

    return String(C.getFieldValue(rec, C.OUT27.shipDate) ?? '').trim();
  };

  const assignOrderUpdates = (items) => {
    const list = Array.isArray(items) ? items : [];
    const updateOrderByKey = {};

    if (list.length < 2) {
      list.forEach(function(item) {
        updateOrderByKey[openItemKey(item)] = true;
      });

      return { updateOrderByKey: updateOrderByKey, skipOrder: false };
    }

    const primary = selectPrimaryOpenItem(list);
    const primaryKey = primary.confident ? openItemKey(primary.item) : '';

    list.forEach(function(item) {
      const key = openItemKey(item);
      updateOrderByKey[key] = Boolean(primary.confident && key === primaryKey);
    });

    return {
      updateOrderByKey: updateOrderByKey,
      skipOrder: !primary.confident,
      primary: primary,
    };
  };

  const planOrderUpdates = async (rows) => {
    const groups = {};

    rows.forEach(function(row) {
      const lineValues = row.value;
      const result = String(C.getFieldValue(lineValues, C.UL.lineResult) ?? '').trim();

      if (result === C.LINE_RESULT.error) {
        return;
      }

      const manageNo = String(C.getFieldValue(lineValues, C.UL.manageNo) ?? '').trim();

      if (!groups[manageNo]) {
        groups[manageNo] = [];
      }

      groups[manageNo].push(lineValues);
    });

    const updateOrderByKey = {};
    const skippedOrderManageNos = [];
    const cache = {};
    const manageNos = Object.keys(groups);

    const enrich = async (lineValues) => {
      const route = String(C.getFieldValue(lineValues, C.UL.inboundRoute) ?? '').trim();
      const recordId = String(C.getFieldValue(lineValues, C.UL.sourceOutboundRecordId) ?? '').trim();
      const cacheKey = route + ':' + recordId;

      if (!cache[cacheKey]) {
        cache[cacheKey] = await C.fetchRecord(sourceAppIdForRoute(route), recordId);
      }

      const rec = cache[cacheKey];

      return {
        route: route,
        recordId: recordId,
        lineRowId: String(C.getFieldValue(lineValues, C.UL.sourceOutboundLineId) ?? '').trim(),
        shipDate: shipDateFromOutbound(route, rec)
          || String(C.getFieldValue(lineValues, C.UL.outboundDate) ?? '').trim(),
        createdAt: recordCreatedAt(rec),
      };
    };

    for (let i = 0; i < manageNos.length; i += 1) {
      const manageNo = manageNos[i];
      const group = groups[manageNo];

      if (group.length < 2) {
        group.forEach(function(lineValues) {
          updateOrderByKey[lineApplyKey(lineValues)] = true;
        });
        continue;
      }

      const items = [];

      for (let g = 0; g < group.length; g += 1) {
        items.push(await enrich(group[g]));
      }

      const decision = assignOrderUpdates(items);

      if (decision.skipOrder) {
        skippedOrderManageNos.push(manageNo);
      }

      Object.keys(decision.updateOrderByKey).forEach(function(key) {
        updateOrderByKey[key] = decision.updateOrderByKey[key];
      });
    }

    return {
      updateOrderByKey: updateOrderByKey,
      skippedOrderManageNos: skippedOrderManageNos,
    };
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
    const orderPlan = await planOrderUpdates(table.value);
    const indexes = table.value.map(function(_, index) { return index; });

    indexes.sort(function(a, b) {
      const keyA = lineApplyKey(table.value[a].value);
      const keyB = lineApplyKey(table.value[b].value);
      const rankA = orderPlan.updateOrderByKey[keyA] ? 1 : 0;
      const rankB = orderPlan.updateOrderByKey[keyB] ? 1 : 0;
      return rankA - rankB;
    });

    try {
      for (let n = 0; n < indexes.length; n += 1) {
        const row = table.value[indexes[n]];
        const lineValues = row.value;
        const lineResult = String(C.getFieldValue(lineValues, C.UL.lineResult) ?? '').trim();
        const updateOrder = orderPlan.updateOrderByKey[lineApplyKey(lineValues)] !== false;

        if (lineResult === C.LINE_RESULT.error) {
          continue;
        }

        if (lineResult === C.LINE_RESULT.success) {
          const met = updateOrder
            ? await isLineTargetFullyMet(lineValues, inboundDateD)
            : await isHistoryOnlyMet(lineValues, inboundDateD);

          if (met) {
            continue;
          }
        }

        await applyLineByRoute(lineValues, inboundDateD, { updateOrder: updateOrder });

        const metAfter = updateOrder
          ? await isLineTargetFullyMet(lineValues, inboundDateD)
          : await isHistoryOnlyMet(lineValues, inboundDateD);

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

      return {
        completed: true,
        message: '一括入庫が完了しました（' + finalCounts.success + '件）'
          + (orderPlan.skippedOrderManageNos.length === 0
            ? ''
            : '\n\n次の管理番号は出庫履歴のみ入庫済みにしました。受注の工程は変更していません。\n'
              + orderPlan.skippedOrderManageNos.join('\n')),
      };
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

    const scannedAt = C.nowDatetimeLocal();

    if (!resolved.bulk) {
      const lineRow = buildLineRowValue(
        asRouteHit(resolved.items[0]),
        orders[0],
        normalized,
        scannedAt
      );

      return { ok: true, lineRow: lineRow };
    }

    return {
      ok: true,
      bulk: true,
      confirmText: buildBulkConfirmText(normalized, resolved.items),
      lineRows: resolved.items.map(function(item) {
        return buildLineRowValue(asRouteHit(item), orders[0], normalized, scannedAt);
      }),
    };
  };

  window.CAYANAS_InboundUnifiedEngine = {
    scanManageNo: scanManageNo,
    runBatchConfirm: runBatchConfirm,
    countLineResults: countLineResults,
    historyWriteAction: historyWriteAction,
    selectPrimaryOpenItem: selectPrimaryOpenItem,
    summarizeOpenItems: summarizeOpenItems,
    buildBulkConfirmText: buildBulkConfirmText,
    planInboundItems: planInboundItems,
    assignOrderUpdates: assignOrderUpdates,
    openItemKey: openItemKey,
  };

})();
