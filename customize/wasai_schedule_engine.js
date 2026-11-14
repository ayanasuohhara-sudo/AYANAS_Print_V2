(function () {
  'use strict';

  /**
   * 和裁士別仕事予定カレンダー — 集計エンジン（第1段階）
   * App74 出庫実績を正本とし、App78 入庫確定で返却済みを補強する。
   * レコードの PUT/POST は行わない。
   */

  const cfg = () => {
    if (typeof CAYANAS_WASAI_SCHEDULE === 'undefined') {
      throw new Error('CAYANAS_WASAI_SCHEDULE が未読込です。wasai_schedule_config.js を先に登録してください。');
    }
    return CAYANAS_WASAI_SCHEDULE;
  };

  const pad2 = (value) => String(value).padStart(2, '0');

  const ymd = (year, month, day) => (
    year + '-' + pad2(month) + '-' + pad2(day)
  );

  const escapeQueryValue = (value) => String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  const quote = (value) => '"' + escapeQueryValue(value) + '"';

  const readValue = (record, code) => {
    const field = record?.[code];
    if (!field || field.value === null || field.value === undefined) {
      return '';
    }
    return String(field.value).trim();
  };

  const readNumber = (record, code, fallback) => {
    const raw = readValue(record, code);
    if (raw === '') {
      return fallback;
    }
    const num = Number(raw);
    return Number.isFinite(num) ? num : fallback;
  };

  const monthBounds = (year, month) => {
    const y = Number(year);
    const m = Number(month);
    const last = new Date(y, m, 0).getDate();
    return {
      year: y,
      month: m,
      start: ymd(y, m, 1),
      end: ymd(y, m, last),
      label: y + '年' + m + '月',
    };
  };

  const shiftMonth = (year, month, delta) => {
    const date = new Date(Number(year), Number(month) - 1 + Number(delta), 1);
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
    };
  };

  const todayParts = (date) => {
    const current = date instanceof Date ? date : new Date();
    return {
      year: current.getFullYear(),
      month: current.getMonth() + 1,
      day: current.getDate(),
      ymd: ymd(current.getFullYear(), current.getMonth() + 1, current.getDate()),
    };
  };

  const weekdayIndexMonday = (year, month, day) => {
    const jsDay = new Date(Number(year), Number(month) - 1, Number(day)).getDay();
    return (jsDay + 6) % 7;
  };

  const buildCalendarWeeks = (year, month) => {
    const bounds = monthBounds(year, month);
    const last = Number(bounds.end.slice(8, 10));
    const lead = weekdayIndexMonday(bounds.year, bounds.month, 1);
    const cells = [];

    for (let index = 0; index < lead; index += 1) {
      cells.push(null);
    }

    for (let day = 1; day <= last; day += 1) {
      const index = weekdayIndexMonday(bounds.year, bounds.month, day);
      cells.push({
        ymd: ymd(bounds.year, bounds.month, day),
        day: day,
        weekdayIndex: index,
        isSaturday: index === 5,
        isSunday: index === 6,
      });
    }

    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    const weeks = [];
    for (let index = 0; index < cells.length; index += 7) {
      weeks.push(cells.slice(index, index + 7));
    }
    return weeks;
  };

  const isYmdInMonth = (value, bounds) => {
    const text = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return false;
    }
    return text >= bounds.start && text <= bounds.end;
  };

  /**
   * カレンダー表示日: 入庫予定日 → 無ければ出庫日。
   * 月をまたぐ仕事は「返却予定月」に載せる（第4段階 KPI と同じ軸）。
   */
  const calendarDateForLine = (shipDate, returnDate) => {
    const ret = String(returnDate || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ret)) {
      return ret;
    }
    const ship = String(shipDate || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ship)) {
      return ship;
    }
    return '';
  };

  const registrationStatusOf = (record) => {
    const codes = cfg().REGISTRATION_STATUS_CODES;
    for (let index = 0; index < codes.length; index += 1) {
      const value = readValue(record, codes[index]);
      if (value) {
        return value;
      }
    }
    return '';
  };

  const isActiveWasai = (record) => (
    registrationStatusOf(record) === cfg().REGISTRATION_ACTIVE
  );

  const masterQuery = () => (
    'order by ' + cfg().FIELDS.wasaiCode + ' asc'
  );

  const masterFetchFields = (options) => {
    const opts = options || {};
    const F = cfg().FIELDS;
    const fields = [F.id, F.wasaiCode, F.wasaiName, F.tradeName]
      .concat(cfg().REGISTRATION_STATUS_CODES);
    if (opts.includeCapacity !== false) {
      fields.push(F.monthlyCapacity);
    }
    return fields;
  };

  /**
   * monthly_capacity: 空／欠落 → null（未設定）。0 は有効な 0 枚。
   * 負数・非整数は未設定扱い（表示用。入力制約は App73 側）。
   */
  const parseMonthlyCapacity = (record) => {
    const code = cfg().FIELDS.monthlyCapacity;
    if (!record || !Object.prototype.hasOwnProperty.call(record, code)) {
      return null;
    }
    const field = record[code];
    if (!field || field.value === null || field.value === undefined || field.value === '') {
      return null;
    }
    const num = Number(field.value);
    if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
      return null;
    }
    return num;
  };

  const formatMonthlyCapacity = (capacity) => {
    if (capacity === null || capacity === undefined) {
      return cfg().MESSAGES.capacityUnset;
    }
    return String(capacity) + cfg().MESSAGES.pieceSuffix;
  };

  const normalizeMasters = (records) => {
    const list = Array.isArray(records) ? records : [];
    return list
      .filter((record) => isActiveWasai(record))
      .map((record) => ({
        recordId: readValue(record, cfg().FIELDS.id),
        wasaiCode: readValue(record, cfg().FIELDS.wasaiCode),
        wasaiName: readValue(record, cfg().FIELDS.wasaiName),
        tradeName: readValue(record, cfg().FIELDS.tradeName),
        registrationStatus: registrationStatusOf(record),
        monthlyCapacity: parseMonthlyCapacity(record),
        monthlyCapacityLabel: formatMonthlyCapacity(parseMonthlyCapacity(record)),
      }))
      .filter((row) => row.wasaiCode)
      .sort((left, right) => (
        left.wasaiCode.localeCompare(right.wasaiCode, 'ja')
      ));
  };

  /**
   * 表示月に載りうる出庫を広く取る。
   * return_date または 日ship_date が月内（どちらか一方で足りる）。
   */
  const buildOutboundMonthQuery = (wasaiCode, year, month) => {
    const bounds = monthBounds(year, month);
    const F = cfg().FIELDS;
    const code = quote(wasaiCode);
    const start = quote(bounds.start);
    const end = quote(bounds.end);
    return F.outboundStatus + ' in (' + quote(cfg().OUTBOUND_STATUS_CONFIRMED) + ')'
      + ' and ' + F.wasaiCode + ' = ' + code
      + ' and ((' + F.returnDate + ' >= ' + start + ' and ' + F.returnDate + ' <= ' + end + ')'
      + ' or (' + F.shipDate + ' >= ' + start + ' and ' + F.shipDate + ' <= ' + end + '))'
      + ' order by ' + F.returnDate + ' asc, ' + F.shipDate + ' asc';
  };

  const outboundFetchFields = () => {
    const F = cfg().FIELDS;
    return [
      F.id,
      F.wasaiCode,
      F.wasaiName,
      F.shipDate,
      F.returnDate,
      F.outboundStatus,
      F.outboundLines,
    ];
  };

  const inboundMonthQuery = (year, month) => {
    const bounds = monthBounds(year, month);
    const F = cfg().FIELDS;
    // 入庫日が前後にずれるケース向けに前後1か月も取る
    const startDate = new Date(bounds.year, bounds.month - 2, 1);
    const endDate = new Date(bounds.year, bounds.month + 1, 0);
    const start = quote(ymd(startDate.getFullYear(), startDate.getMonth() + 1, 1));
    const end = quote(ymd(endDate.getFullYear(), endDate.getMonth() + 1, endDate.getDate()));
    return F.inboundStatus + ' in (' + quote(cfg().INBOUND_STATUS_CONFIRMED) + ')'
      + ' and ' + F.inboundDate + ' >= ' + start
      + ' and ' + F.inboundDate + ' <= ' + end
      + ' order by ' + F.inboundDate + ' asc';
  };

  const inboundFetchFields = () => {
    const F = cfg().FIELDS;
    return [F.id, F.inboundStatus, F.inboundDate, F.inboundLines];
  };

  /**
   * App78 入庫確定・和裁士ルートの manage_no → 入庫日マップ。
   * App74 を書き換えず、返却済み判定の補強にだけ使う。
   */
  const buildInboundConfirmMap = (inboundRecords) => {
    const map = new Map();
    const F = cfg().FIELDS;
    const list = Array.isArray(inboundRecords) ? inboundRecords : [];

    list.forEach((record) => {
      if (readValue(record, F.inboundStatus) !== cfg().INBOUND_STATUS_CONFIRMED) {
        return;
      }
      const inboundDate = readValue(record, F.inboundDate).slice(0, 10);
      const table = record?.[F.inboundLines];
      const rows = Array.isArray(table?.value) ? table.value : [];

      rows.forEach((row) => {
        const values = row?.value || {};
        const route = String(values[F.inboundRoute]?.value ?? '').trim();
        if (route !== cfg().INBOUND_ROUTE_WASAI) {
          return;
        }
        const manageNo = String(values[F.inboundManageNo]?.value ?? '').trim();
        if (!manageNo) {
          return;
        }
        const result = String(values[F.inboundLineResult]?.value ?? '').trim();
        if (result && result !== '確定成功' && result !== '') {
          // エラー行は無視。空は旧データ想定で許容
          if (result === 'エラー' || result === '待機') {
            return;
          }
        }
        const prev = map.get(manageNo);
        if (!prev || (inboundDate && inboundDate > prev)) {
          map.set(manageNo, inboundDate || prev || '');
        }
      });
    });

    return map;
  };

  const classifyLineKind = (lineStatus, manageNo, inboundConfirmMap) => {
    const status = String(lineStatus || '').trim();
    const LS = cfg().LINE_STATUS;
    const KIND = cfg().WORK_KIND;

    if (status === LS.rework) {
      return KIND.rework;
    }

    const confirmedInbound = inboundConfirmMap instanceof Map
      && manageNo
      && inboundConfirmMap.has(manageNo);

    // App74 検品・入庫と同じ: 空/出庫中は手元。ただし App78 で確定入庫済みなら返却済とみなす
    if (status === '' || status === LS.outbound) {
      return confirmedInbound ? KIND.returned : KIND.outbound;
    }

    if (
      status === LS.inbound
      || status === LS.inspectionOk
      || status === LS.payTarget
      || status === LS.billed
      || status === LS.paid
    ) {
      return KIND.returned;
    }

    return confirmedInbound ? KIND.returned : KIND.outbound;
  };

  const pieceCountOf = (lineValues) => {
    const F = cfg().FIELDS;
    const count = Number(lineValues?.[F.lineEligibleCount]?.value);
    if (Number.isFinite(count) && count > 0) {
      return count;
    }
    return 1;
  };

  const extractWorkItemsFromOutbound = (outboundRecords, options) => {
    const opts = options || {};
    const bounds = opts.bounds || null;
    const inboundConfirmMap = opts.inboundConfirmMap instanceof Map
      ? opts.inboundConfirmMap
      : new Map();
    const includeReturned = opts.includeReturned !== false;
    const F = cfg().FIELDS;
    const KIND = cfg().WORK_KIND;
    const items = [];
    const list = Array.isArray(outboundRecords) ? outboundRecords : [];

    list.forEach((record) => {
      const outboundStatus = readValue(record, F.outboundStatus);
      if (outboundStatus !== cfg().OUTBOUND_STATUS_CONFIRMED) {
        return;
      }

      const outboundRecordId = readValue(record, F.id);
      const wasaiCode = readValue(record, F.wasaiCode);
      const wasaiName = readValue(record, F.wasaiName);
      const shipDate = readValue(record, F.shipDate).slice(0, 10);
      const returnDate = readValue(record, F.returnDate).slice(0, 10);
      const table = record?.[F.outboundLines];
      const rows = Array.isArray(table?.value) ? table.value : [];

      rows.forEach((row) => {
        const values = row?.value || {};
        const lineId = String(row.id || '').trim();
        const manageNo = String(values[F.lineManageNo]?.value ?? '').trim();
        const lineStatus = String(values[F.lineStatus]?.value ?? '').trim();
        const kind = classifyLineKind(lineStatus, manageNo, inboundConfirmMap);

        if (!includeReturned && kind === KIND.returned) {
          return;
        }

        const calendarDate = calendarDateForLine(shipDate, returnDate);
        if (bounds && (!calendarDate || !isYmdInMonth(calendarDate, bounds))) {
          return;
        }

        const inboundDate = String(values[F.lineInboundDate]?.value ?? '').trim().slice(0, 10)
          || (inboundConfirmMap.get(manageNo) || '');
        const pieces = pieceCountOf(values);
        const itemSummary = String(values[F.lineProcessing]?.value ?? '').trim();

        items.push({
          key: outboundRecordId + ':' + (lineId || manageNo || items.length),
          outboundRecordId: outboundRecordId,
          outboundLineId: lineId,
          wasaiCode: wasaiCode,
          wasaiName: wasaiName,
          manageNo: manageNo,
          shipDate: shipDate,
          returnDate: returnDate || shipDate,
          calendarDate: calendarDate,
          inboundDate: inboundDate,
          lineStatus: lineStatus || cfg().LINE_STATUS.outbound,
          kind: kind,
          kindLabel: cfg().WORK_KIND_LABEL[kind] || kind,
          pieceCount: pieces,
          itemSummary: itemSummary || '（品目未設定）',
          deadline: String(values[F.lineDeadline]?.value ?? '').trim().slice(0, 10),
          orderRecordId: String(values[F.lineOrderRecordId]?.value ?? '').trim(),
          customerName: String(values[F.lineCustomerName]?.value ?? '').trim(),
          clientName: String(values[F.lineClientName]?.value ?? '').trim(),
          confirmedVia78: inboundConfirmMap.has(manageNo),
          source: 'outbound',
        });
      });
    });

    return items;
  };

  const compareManageNo = (left, right) => (
    String(left || '').localeCompare(String(right || ''), 'ja', { numeric: true })
  );

  const kindSortRank = (kind) => {
    if (kind === cfg().WORK_KIND.outbound) return 0;
    if (kind === cfg().WORK_KIND.planned) return 1;
    if (kind === cfg().WORK_KIND.rework) return 2;
    return 3;
  };

  const buildOutboundManageIndex = (outboundItems) => {
    const map = new Map();
    (outboundItems || []).forEach((item) => {
      const manageNo = String(item.manageNo || '').trim();
      if (!manageNo) {
        return;
      }
      if (!map.has(manageNo)) {
        map.set(manageNo, item);
      }
    });
    return map;
  };

  const buildPlanMonthQuery = (wasaiCode, year, month) => {
    const bounds = monthBounds(year, month);
    const F = cfg().FIELDS;
    const PS = cfg().PLAN_STATUS;
    return F.wasaiCode + ' = ' + quote(wasaiCode)
      + ' and ' + F.planStatus + ' in ('
      + quote(PS.reserved) + ', ' + quote(PS.shipped)
      + ')'
      + ' and ' + F.planReturnDate + ' >= ' + quote(bounds.start)
      + ' and ' + F.planReturnDate + ' <= ' + quote(bounds.end)
      + ' order by ' + F.planReturnDate + ' asc';
  };

  const planFetchFields = () => {
    const F = cfg().FIELDS;
    return [
      F.id,
      F.wasaiCode,
      F.wasaiName,
      F.planManageNo,
      F.planItemSummary,
      F.planPieceCount,
      F.planStartDate,
      F.planReturnDate,
      F.planStatus,
      F.planLinkedOutboundRecordId,
      F.planLinkedOutboundLineId,
      F.planSource,
      F.planNotes,
    ];
  };

  /**
   * 予約の manage_no 重複（空以外）。excludePlanId は編集中レコード除外。
   */
  const findDuplicateReservedPlans = (planRecords, wasaiCode, manageNo, excludePlanId) => {
    const target = String(manageNo || '').trim();
    if (!target) {
      return [];
    }
    const F = cfg().FIELDS;
    const reserved = cfg().PLAN_STATUS.reserved;
    const exclude = String(excludePlanId || '').trim();
    return (planRecords || []).filter((record) => {
      const id = readValue(record, F.id);
      if (exclude && id === exclude) {
        return false;
      }
      if (wasaiCode && readValue(record, F.wasaiCode) !== wasaiCode) {
        return false;
      }
      if (readValue(record, F.planStatus) !== reserved) {
        return false;
      }
      return readValue(record, F.planManageNo) === target;
    });
  };

  const validatePlanInput = (input, existingPlans) => {
    const value = input || {};
    const errors = [];
    if (!String(value.wasaiCode || '').trim()) {
      errors.push('和裁士コードが必要です');
    }
    if (!String(value.plannedReturnDate || '').trim()) {
      errors.push('返却予定日が必要です');
    }
    const pieces = Number(value.pieceCount);
    if (!Number.isFinite(pieces) || !Number.isInteger(pieces) || pieces < 1) {
      errors.push('予定枚数は1以上の整数です');
    }
    const status = String(value.planStatus || cfg().PLAN_STATUS.reserved).trim();
    if (status === cfg().PLAN_STATUS.reserved) {
      const dupes = findDuplicateReservedPlans(
        existingPlans,
        value.wasaiCode,
        value.manageNo,
        value.planRecordId
      );
      if (dupes.length) {
        errors.push(cfg().MESSAGES.planDuplicate);
      }
    }
    return {
      ok: errors.length === 0,
      errors: errors,
    };
  };

  const buildPlanRecordPayload = (input) => {
    const F = cfg().FIELDS;
    const value = input || {};
    const pieces = Number(value.pieceCount);
    return {
      [F.wasaiCode]: { value: String(value.wasaiCode || '').trim() },
      [F.wasaiName]: { value: String(value.wasaiName || '').trim() },
      [F.planManageNo]: { value: String(value.manageNo || '').trim() },
      [F.planItemSummary]: { value: String(value.itemSummary || '').trim() },
      [F.planPieceCount]: { value: Number.isFinite(pieces) ? pieces : 1 },
      [F.planStartDate]: { value: String(value.plannedStartDate || '').slice(0, 10) },
      [F.planReturnDate]: { value: String(value.plannedReturnDate || '').slice(0, 10) },
      [F.planStatus]: { value: String(value.planStatus || cfg().PLAN_STATUS.reserved) },
      [F.planLinkedOutboundRecordId]: { value: String(value.linkedOutboundRecordId || '').trim() },
      [F.planLinkedOutboundLineId]: { value: String(value.linkedOutboundLineId || '').trim() },
      [F.planSource]: { value: String(value.source || cfg().PLAN_SOURCE.office) },
      [F.planNotes]: { value: String(value.notes || '') },
    };
  };

  /**
   * 予定レコード → カレンダー行。
   * App74 に同一 manage_no の出庫がある予約は二重計上しない（除外）。
   */
  const extractWorkItemsFromPlans = (planRecords, options) => {
    const opts = options || {};
    const bounds = opts.bounds || null;
    const outboundByManageNo = opts.outboundByManageNo instanceof Map
      ? opts.outboundByManageNo
      : new Map();
    const includeShippedPlans = opts.includeShippedPlans === true;
    const F = cfg().FIELDS;
    const PS = cfg().PLAN_STATUS;
    const items = [];
    const suppressed = [];

    (planRecords || []).forEach((record) => {
      const planRecordId = readValue(record, F.id);
      const wasaiCode = readValue(record, F.wasaiCode);
      const wasaiName = readValue(record, F.wasaiName);
      const manageNo = readValue(record, F.planManageNo);
      const planStatus = readValue(record, F.planStatus) || PS.reserved;
      if (planStatus === PS.cancelled) {
        return;
      }

      const linkedOutbound = manageNo ? outboundByManageNo.get(manageNo) : null;
      const linkedByOutbound = !!linkedOutbound;
      const explicitlyShipped = planStatus === PS.shipped
        || !!readValue(record, F.planLinkedOutboundRecordId);

      // 予約かつ出庫実績あり → 出庫側のみ残し予定は落とす
      if (planStatus === PS.reserved && linkedByOutbound) {
        suppressed.push({
          planRecordId: planRecordId,
          manageNo: manageNo,
          reason: 'linked_to_outbound',
          outboundRecordId: linkedOutbound.outboundRecordId,
        });
        return;
      }

      if (explicitlyShipped && !includeShippedPlans) {
        suppressed.push({
          planRecordId: planRecordId,
          manageNo: manageNo,
          reason: 'already_shipped',
        });
        return;
      }

      if (planStatus !== PS.reserved && !includeShippedPlans) {
        return;
      }

      const startDate = readValue(record, F.planStartDate).slice(0, 10);
      const returnDate = readValue(record, F.planReturnDate).slice(0, 10);
      const calendarDate = calendarDateForLine(startDate, returnDate);
      if (bounds && (!calendarDate || !isYmdInMonth(calendarDate, bounds))) {
        return;
      }

      const pieceRaw = readNumber(record, F.planPieceCount, 1);
      const pieceCount = pieceRaw > 0 ? pieceRaw : 1;
      const itemSummary = readValue(record, F.planItemSummary) || '（品目未設定）';

      items.push({
        key: 'plan:' + planRecordId,
        planRecordId: planRecordId,
        outboundRecordId: readValue(record, F.planLinkedOutboundRecordId),
        outboundLineId: readValue(record, F.planLinkedOutboundLineId),
        wasaiCode: wasaiCode,
        wasaiName: wasaiName,
        manageNo: manageNo,
        shipDate: startDate,
        returnDate: returnDate || startDate,
        calendarDate: calendarDate,
        inboundDate: '',
        lineStatus: planStatus,
        kind: cfg().WORK_KIND.planned,
        kindLabel: cfg().WORK_KIND_LABEL.planned,
        pieceCount: pieceCount,
        itemSummary: itemSummary,
        deadline: '',
        orderRecordId: '',
        customerName: '',
        clientName: '',
        confirmedVia78: false,
        source: 'plan',
        planStatus: planStatus,
        planSource: readValue(record, F.planSource) || cfg().PLAN_SOURCE.office,
        notes: readValue(record, F.planNotes),
      });
    });

    return {
      items: items,
      suppressed: suppressed,
    };
  };

  /**
   * 予約を出庫済にリンクするペイロード（保存用）。App74 は変更しない。
   */
  const buildLinkPlanToOutboundPayload = (outboundItem) => {
    const F = cfg().FIELDS;
    const item = outboundItem || {};
    return {
      [F.planStatus]: { value: cfg().PLAN_STATUS.shipped },
      [F.planLinkedOutboundRecordId]: { value: String(item.outboundRecordId || '') },
      [F.planLinkedOutboundLineId]: { value: String(item.outboundLineId || '') },
    };
  };

  const aggregateMonth = (outboundRecords, inboundRecords, wasaiCode, year, month, options) => {
    const opts = options || {};
    const bounds = monthBounds(year, month);
    const inboundConfirmMap = buildInboundConfirmMap(inboundRecords);
    const outboundItems = extractWorkItemsFromOutbound(outboundRecords, {
      bounds: bounds,
      inboundConfirmMap: inboundConfirmMap,
      includeReturned: opts.includeReturned !== false,
    }).filter((item) => (
      !wasaiCode || item.wasaiCode === wasaiCode
    ));

    const outboundByManageNo = buildOutboundManageIndex(outboundItems);
    const planExtract = extractWorkItemsFromPlans(opts.planRecords || [], {
      bounds: bounds,
      outboundByManageNo: outboundByManageNo,
      includeShippedPlans: opts.includeShippedPlans === true,
    });
    const planItems = planExtract.items.filter((item) => (
      !wasaiCode || item.wasaiCode === wasaiCode
    ));

    const items = outboundItems.concat(planItems);
    const days = {};
    let outboundPieces = 0;
    let returnedPieces = 0;
    let reworkPieces = 0;
    let plannedPieces = 0;

    items.forEach((item) => {
      const date = item.calendarDate;
      if (!days[date]) {
        days[date] = {
          rows: [],
          outboundPieces: 0,
          returnedPieces: 0,
          reworkPieces: 0,
          plannedPieces: 0,
          totalPieces: 0,
        };
      }
      days[date].rows.push(item);
      days[date].totalPieces += item.pieceCount;

      if (item.kind === cfg().WORK_KIND.outbound) {
        days[date].outboundPieces += item.pieceCount;
        outboundPieces += item.pieceCount;
      } else if (item.kind === cfg().WORK_KIND.planned) {
        days[date].plannedPieces += item.pieceCount;
        plannedPieces += item.pieceCount;
      } else if (item.kind === cfg().WORK_KIND.rework) {
        days[date].reworkPieces += item.pieceCount;
        reworkPieces += item.pieceCount;
      } else {
        days[date].returnedPieces += item.pieceCount;
        returnedPieces += item.pieceCount;
      }
    });

    Object.keys(days).forEach((date) => {
      days[date].rows.sort((left, right) => (
        (kindSortRank(left.kind) - kindSortRank(right.kind))
        || compareManageNo(left.manageNo, right.manageNo)
        || compareManageNo(left.outboundRecordId || left.planRecordId, right.outboundRecordId || right.planRecordId)
      ));
    });

    return {
      year: bounds.year,
      month: bounds.month,
      start: bounds.start,
      end: bounds.end,
      label: bounds.label,
      wasaiCode: wasaiCode || '',
      days: days,
      totals: {
        outboundPieces: outboundPieces,
        returnedPieces: returnedPieces,
        reworkPieces: reworkPieces,
        plannedPieces: plannedPieces,
        totalPieces: outboundPieces + returnedPieces + reworkPieces + plannedPieces,
        itemCount: items.length,
      },
      suppressedPlans: planExtract.suppressed,
      items: items,
    };
  };

  const dayRows = (model, date, options) => {
    const opts = options || {};
    let rows = model?.days?.[date]?.rows ? model.days[date].rows.slice() : [];
    if (opts.includeReturned === false) {
      rows = rows.filter((row) => row.kind !== cfg().WORK_KIND.returned);
    }
    if (opts.includePlanned === false) {
      rows = rows.filter((row) => row.kind !== cfg().WORK_KIND.planned);
    }
    return rows;
  };

  const daySummary = (model, date, options) => {
    const rows = dayRows(model, date, options);
    let outboundPieces = 0;
    let returnedPieces = 0;
    let reworkPieces = 0;
    let plannedPieces = 0;
    rows.forEach((row) => {
      if (row.kind === cfg().WORK_KIND.outbound) {
        outboundPieces += row.pieceCount;
      } else if (row.kind === cfg().WORK_KIND.planned) {
        plannedPieces += row.pieceCount;
      } else if (row.kind === cfg().WORK_KIND.rework) {
        reworkPieces += row.pieceCount;
      } else {
        returnedPieces += row.pieceCount;
      }
    });
    return {
      rows: rows,
      outboundPieces: outboundPieces,
      returnedPieces: returnedPieces,
      reworkPieces: reworkPieces,
      plannedPieces: plannedPieces,
      totalPieces: outboundPieces + returnedPieces + reworkPieces + plannedPieces,
    };
  };

  const formatLongDate = (date) => {
    const parts = String(date ?? '').split('-');
    if (parts.length !== 3) {
      return '';
    }
    return Number(parts[0]) + '年' + Number(parts[1]) + '月' + Number(parts[2]) + '日';
  };

  const outboundDetailPath = (recordId) => (
    '/k/' + cfg().WASAI_OUTBOUND_APP_ID + '/show#record=' + encodeURIComponent(String(recordId ?? ''))
  );

  const orderDetailPath = (recordId) => (
    '/k/' + cfg().ORDER_APP_ID + '/show#record=' + encodeURIComponent(String(recordId ?? ''))
  );

  const planDetailPath = (recordId) => {
    const appId = cfg().PLAN_APP_ID;
    if (!appId) {
      return '';
    }
    return '/k/' + appId + '/show#record=' + encodeURIComponent(String(recordId ?? ''));
  };

  const fetchAllPages = async (baseQuery, fetchPage) => {
    const limit = cfg().PAGE_LIMIT;
    const maxOffset = cfg().MAX_OFFSET;
    const all = [];
    let offset = 0;
    let truncated = false;

    while (true) {
      const query = baseQuery + ' limit ' + limit + ' offset ' + offset;
      const records = await fetchPage(query);
      const list = Array.isArray(records) ? records : [];
      all.push(...list);

      if (list.length < limit) {
        break;
      }
      if (offset >= maxOffset) {
        truncated = true;
        break;
      }
      offset += limit;
    }

    return {
      records: all,
      truncated: truncated,
    };
  };

  /**
   * 第4段階向けスタブ: 月またぎを返却予定月で帰属させる前提を明示。
   * 第1段階では KPI を計算しない。
   */
  const capacityAttributionMonth = (shipDate, returnDate) => {
    const calendarDate = calendarDateForLine(shipDate, returnDate);
    if (!calendarDate) {
      return null;
    }
    return {
      year: Number(calendarDate.slice(0, 4)),
      month: Number(calendarDate.slice(5, 7)),
      ymd: calendarDate,
    };
  };

  window.CAYANAS_WasaiScheduleEngine = {
    escapeQueryValue,
    monthBounds,
    shiftMonth,
    todayParts,
    weekdayIndexMonday,
    buildCalendarWeeks,
    calendarDateForLine,
    isYmdInMonth,
    registrationStatusOf,
    isActiveWasai,
    masterQuery,
    masterFetchFields,
    parseMonthlyCapacity,
    formatMonthlyCapacity,
    normalizeMasters,
    buildOutboundMonthQuery,
    outboundFetchFields,
    inboundMonthQuery,
    inboundFetchFields,
    buildInboundConfirmMap,
    classifyLineKind,
    pieceCountOf,
    extractWorkItems: extractWorkItemsFromOutbound,
    buildOutboundManageIndex,
    buildPlanMonthQuery,
    planFetchFields,
    findDuplicateReservedPlans,
    validatePlanInput,
    buildPlanRecordPayload,
    extractWorkItemsFromPlans,
    buildLinkPlanToOutboundPayload,
    aggregateMonth,
    dayRows,
    daySummary,
    formatLongDate,
    outboundDetailPath,
    orderDetailPath,
    planDetailPath,
    fetchAllPages,
    capacityAttributionMonth,
    readValue,
    readNumber,
  };

}());
