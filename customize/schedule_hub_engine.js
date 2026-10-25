(function () {
  'use strict';

  /**
   * 納期・納品スケジュール — クエリ・分類・集計・ページング。
   * App16 / App13 は更新しない。
   */

  const cfg = () => {
    if (typeof CAYANAS_SCHEDULE_HUB === 'undefined') {
      throw new Error('CAYANAS_SCHEDULE_HUB が未読込です。schedule_hub_config.js を先に登録してください。');
    }
    return CAYANAS_SCHEDULE_HUB;
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

  const todayParts = (date) => {
    const current = date instanceof Date ? date : new Date();
    return {
      year: current.getFullYear(),
      month: current.getMonth() + 1,
      day: current.getDate(),
      ymd: ymd(current.getFullYear(), current.getMonth() + 1, current.getDate()),
    };
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

  /**
   * 取消は選択肢「取消」のみ。空欄・有効・その他は対象。
   * 空白付き「 取消 」も取消扱い。
   */
  const isCancelled = (record) => {
    const value = readValue(record, cfg().FIELDS.aggregationStatus);
    return value === cfg().AGGREGATION_CANCELLED;
  };

  const isDelivered = (record) => (
    readValue(record, cfg().FIELDS.deliveryStatus) === cfg().DELIVERY_DONE
  );

  const isReady = (record) => (
    readValue(record, cfg().FIELDS.deliveryStatus) === cfg().DELIVERY_READY
  );

  const isOpenOrder = (record) => !isCancelled(record) && !isDelivered(record);

  const undeliveredCondition = () => (
    '(delivery_status not in (' + quote(cfg().DELIVERY_DONE) + ')'
    + ' or delivery_status in (""))'
  );

  /**
   * 未納品系。取消はクライアントで除外（空欄を落とさないため query に取消条件を載せない）。
   * deadline 空欄も取得対象（条件に deadline を付けない）。
   */
  const buildOpenOrdersQuery = () => undeliveredCondition();

  const buildReadyOrdersQuery = () => (
    'delivery_status in (' + quote(cfg().DELIVERY_READY) + ')'
  );

  const buildCustomerSearchQuery = (customerCode) => {
    const code = String(customerCode ?? '').trim();
    if (!code) {
      return '';
    }
    return 'customer_code = ' + quote(code) + ' and ' + undeliveredCondition();
  };

  const buildFinishInProgressQuery = () => (
    'work_status in (' + quote(cfg().WORK_FINISH_IN_PROGRESS) + ')'
    + ' and ' + undeliveredCondition()
  );

  /**
   * 漏れ候補の候補母集団（分類・work≠仕上げ中はクライアント）。
   */
  const buildLeakCandidateQuery = () => (
    'process_status in (' + quote(cfg().PROCESS_RETURN_OUTSOURCE) + ')'
    + ' and location_status in (' + quote(cfg().LOCATION_HQ) + ')'
    + ' and ' + undeliveredCondition()
  );

  const detailRows = (record) => {
    const table = record?.[cfg().FIELDS.detailTable];
    return Array.isArray(table?.value) ? table.value : [];
  };

  const joinProcessing = (record) => {
    const names = [];
    detailRows(record).forEach((row) => {
      const name = String(row?.value?.[cfg().FIELDS.itemName]?.value ?? '').trim();
      if (name) {
        names.push(name);
      }
    });
    return names.join(cfg().PROCESSING_SEPARATOR);
  };

  const productLabel = (record) => {
    const type = readValue(record, cfg().FIELDS.kimonoType);
    const spec = readValue(record, cfg().FIELDS.kimonoSpec);
    if (type && spec) {
      return type + ' ' + spec;
    }
    return type || spec || '';
  };

  const categoryByKey = (key) => (
    cfg().CATEGORIES.find((category) => category.key === key) || null
  );

  const subcategoriesForRecord = (record, subcategoryByCode) => {
    const found = [];
    const seen = new Set();
    const map = subcategoryByCode instanceof Map ? subcategoryByCode : new Map();

    detailRows(record).forEach((row) => {
      const code = String(row?.value?.[cfg().FIELDS.itemCode]?.value ?? '').trim();
      if (!code || !map.has(code)) {
        return;
      }
      const subcategory = String(map.get(code) ?? '').trim();
      if (!subcategory || seen.has(subcategory)) {
        return;
      }
      seen.add(subcategory);
      found.push(subcategory);
    });

    return found;
  };

  const pickPriorityCategoryKey = (keys) => {
    const matched = new Set(Array.isArray(keys) ? keys : []);
    const priority = Array.isArray(cfg().CATEGORY_PRIORITY)
      ? cfg().CATEGORY_PRIORITY
      : [];

    for (let index = 0; index < priority.length; index += 1) {
      const key = priority[index];
      if (matched.has(key)) {
        return key;
      }
    }
    return '';
  };

  /**
   * 1 manage_no = 1分類。複数 subcategory 時は CATEGORY_PRIORITY。
   */
  const matchingCategoryKeys = (record, subcategoryByCode) => {
    const subs = new Set(subcategoriesForRecord(record, subcategoryByCode));
    const matched = cfg().CATEGORIES
      .filter((category) => category.subcategories.some((name) => subs.has(name)))
      .map((category) => category.key);
    const chosen = pickPriorityCategoryKey(matched);
    return chosen ? [chosen] : [];
  };

  const categoryLabel = (keys) => (
    (Array.isArray(keys) ? keys : [])
      .map((key) => categoryByKey(key)?.label || '')
      .filter(Boolean)
      .join(cfg().CATEGORY_SEPARATOR)
  );

  const isFinishCategory = (categoryKeys) => {
    const allowed = new Set(cfg().FINISH_CATEGORY_KEYS || []);
    return (Array.isArray(categoryKeys) ? categoryKeys : [])
      .some((key) => allowed.has(key));
  };

  const collectItemCodes = (records) => {
    const codes = [];
    const seen = new Set();
    (Array.isArray(records) ? records : []).forEach((record) => {
      detailRows(record).forEach((row) => {
        const code = String(row?.value?.[cfg().FIELDS.itemCode]?.value ?? '').trim();
        if (!code || seen.has(code)) {
          return;
        }
        seen.add(code);
        codes.push(code);
      });
    });
    return codes;
  };

  const chunkItemCodes = (codes) => {
    const size = cfg().PRODUCT_BATCH;
    const chunks = [];
    for (let index = 0; index < codes.length; index += size) {
      chunks.push(codes.slice(index, index + size));
    }
    return chunks;
  };

  const buildProductQuery = (codes) => {
    const list = (Array.isArray(codes) ? codes : [])
      .map((code) => quote(code))
      .join(', ');
    return cfg().FIELDS.productCode + ' in (' + list + ') order by '
      + cfg().FIELDS.productCode + ' asc';
  };

  const buildSubcategoryMap = (productRecords) => {
    const map = new Map();
    (Array.isArray(productRecords) ? productRecords : []).forEach((record) => {
      const code = readValue(record, cfg().FIELDS.productCode);
      if (!code || map.has(code)) {
        return;
      }
      map.set(code, readValue(record, cfg().FIELDS.subcategory));
    });
    return map;
  };

  const compareManageNo = (left, right) => {
    const leftText = String(left ?? '');
    const rightText = String(right ?? '');
    if (leftText === rightText) {
      return 0;
    }
    if (!leftText) {
      return 1;
    }
    if (!rightText) {
      return -1;
    }
    return leftText.localeCompare(rightText, 'ja', { numeric: true });
  };

  /**
   * 納期昇順。空欄（未設定）は最後。同日は manage_no。
   */
  const compareDeadlineThenManageNo = (left, right) => {
    const ld = String(left?.deadline ?? '').trim();
    const rd = String(right?.deadline ?? '').trim();
    if (!ld && !rd) {
      return compareManageNo(left?.manageNo, right?.manageNo);
    }
    if (!ld) {
      return 1;
    }
    if (!rd) {
      return -1;
    }
    if (ld !== rd) {
      return ld < rd ? -1 : 1;
    }
    return compareManageNo(left?.manageNo, right?.manageNo);
  };

  const deadlineBucket = (deadlineYmd, todayYmd, nearDays) => {
    const d = String(deadlineYmd ?? '').trim().slice(0, 10);
    const today = String(todayYmd ?? '').trim().slice(0, 10);
    if (!d) {
      return 'unset';
    }
    if (!today) {
      return 'other';
    }
    if (d < today) {
      return 'overdue';
    }
    if (d === today) {
      return 'today';
    }
    const near = Number(nearDays);
    if (Number.isFinite(near) && near >= 0) {
      const base = new Date(
        Number(today.slice(0, 4)),
        Number(today.slice(5, 7)) - 1,
        Number(today.slice(8, 10))
      );
      base.setDate(base.getDate() + near);
      const end = ymd(base.getFullYear(), base.getMonth() + 1, base.getDate());
      if (d <= end) {
        return 'near';
      }
    }
    return 'other';
  };

  const toRow = (record, subcategoryByCode, todayYmd) => {
    const F = cfg().FIELDS;
    const categoryKeys = matchingCategoryKeys(record, subcategoryByCode);
    const deadline = readValue(record, F.deadline).slice(0, 10);
    const deliveryStatus = readValue(record, F.deliveryStatus);
    const ready = deliveryStatus === cfg().DELIVERY_READY;
    const bucket = deadlineBucket(deadline, todayYmd, cfg().NEAR_DAYS);

    return {
      recordId: readValue(record, F.id),
      manageNo: readValue(record, F.manageNo),
      slipNo: readValue(record, F.slipNo),
      deadline: deadline,
      deadlineLabel: deadline || cfg().DEADLINE_UNSET_LABEL,
      deadlineUnset: !deadline,
      customerCode: readValue(record, F.customerCode),
      customerName: readValue(record, F.customerName),
      clientName: readValue(record, F.clientName),
      product: productLabel(record),
      processing: joinProcessing(record),
      categoryKeys: categoryKeys,
      categoriesLabel: categoryLabel(categoryKeys),
      processStatus: readValue(record, F.processStatus),
      workStatus: readValue(record, F.workStatus),
      locationStatus: readValue(record, F.locationStatus),
      deliveryStatus: deliveryStatus,
      isReady: ready,
      isWorking: !ready,
      bucket: bucket,
      isOverdue: bucket === 'overdue',
    };
  };

  /**
   * manage_no 単位で1行。同一 manage_no が複数レコードなら先勝ち（通常は1件）。
   */
  const dedupeByManageNo = (rows) => {
    const seen = new Set();
    const out = [];
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const key = String(row?.manageNo ?? '').trim() || ('id:' + String(row?.recordId ?? ''));
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      out.push(row);
    });
    return out;
  };

  const openRowsFromRecords = (records, subcategoryByCode, todayYmd) => {
    const rows = [];
    (Array.isArray(records) ? records : []).forEach((record) => {
      if (!isOpenOrder(record)) {
        return;
      }
      rows.push(toRow(record, subcategoryByCode, todayYmd));
    });
    return dedupeByManageNo(rows);
  };

  const buildFinishQueues = (records, subcategoryByCode, todayYmd) => {
    const open = openRowsFromRecords(records, subcategoryByCode, todayYmd);
    const finishWork = cfg().WORK_FINISH_IN_PROGRESS;
    const main = [];
    const leak = [];
    const mainKeys = new Set();

    open.forEach((row) => {
      if (!isFinishCategory(row.categoryKeys)) {
        return;
      }
      if (row.workStatus === finishWork) {
        main.push(row);
        mainKeys.add(row.manageNo);
      }
    });

    open.forEach((row) => {
      if (!isFinishCategory(row.categoryKeys)) {
        return;
      }
      if (mainKeys.has(row.manageNo)) {
        return;
      }
      if (row.processStatus !== cfg().PROCESS_RETURN_OUTSOURCE) {
        return;
      }
      if (row.locationStatus !== cfg().LOCATION_HQ) {
        return;
      }
      if (row.workStatus === finishWork) {
        return;
      }
      leak.push(row);
    });

    main.sort(compareDeadlineThenManageNo);
    leak.sort(compareDeadlineThenManageNo);

    const unset = main.filter((row) => row.deadlineUnset)
      .concat(leak.filter((row) => row.deadlineUnset));

    return {
      main: main,
      leak: leak,
      unset: dedupeByManageNo(unset).sort(compareManageNo),
      overdueCount: main.filter((row) => row.isOverdue).length,
    };
  };

  const buildCustomerMap = (rows) => {
    const customers = {};
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const code = String(row?.customerCode ?? '').trim();
      const name = String(row?.customerName ?? '').trim();
      if (code) {
        customers[code] = name;
      }
    });
    return customers;
  };

  const filterByCustomer = (rows, customerCode) => {
    const code = String(customerCode ?? '').trim();
    if (!code) {
      return [];
    }
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => row.customerCode === code)
      .sort(compareDeadlineThenManageNo);
  };

  const buildCustomerGroups = (rows) => {
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const code = String(row.customerCode || '').trim() || '(未設定)';
      if (!map.has(code)) {
        map.set(code, {
          customerCode: code,
          customerName: row.customerName || '',
          rows: [],
          readyCount: 0,
          workingCount: 0,
          earliestDeadline: '',
          earliestLabel: cfg().DEADLINE_UNSET_LABEL,
          hasOverdue: false,
        });
      }
      const group = map.get(code);
      if (!group.customerName && row.customerName) {
        group.customerName = row.customerName;
      }
      group.rows.push(row);
      if (row.isReady) {
        group.readyCount += 1;
      } else {
        group.workingCount += 1;
      }
      if (row.isOverdue) {
        group.hasOverdue = true;
      }
      if (row.deadline) {
        if (!group.earliestDeadline || row.deadline < group.earliestDeadline) {
          group.earliestDeadline = row.deadline;
          group.earliestLabel = row.deadline;
        }
      }
    });

    const groups = Array.from(map.values());
    groups.forEach((group) => {
      group.rows.sort(compareDeadlineThenManageNo);
      if (!group.earliestDeadline) {
        group.earliestLabel = cfg().DEADLINE_UNSET_LABEL;
      }
    });

    groups.sort((a, b) => {
      const ad = a.earliestDeadline;
      const bd = b.earliestDeadline;
      if (!ad && !bd) {
        return String(a.customerCode).localeCompare(String(b.customerCode), 'ja');
      }
      if (!ad) {
        return 1;
      }
      if (!bd) {
        return -1;
      }
      if (ad !== bd) {
        return ad < bd ? -1 : 1;
      }
      return String(a.customerCode).localeCompare(String(b.customerCode), 'ja');
    });

    return groups;
  };

  /**
   * mode: 'all' | 'ready'
   */
  const buildDeliveryModel = (records, subcategoryByCode, todayYmd, mode) => {
    let rows = openRowsFromRecords(records, subcategoryByCode, todayYmd);
    if (mode === 'ready') {
      rows = rows.filter((row) => row.isReady);
    }
    rows.sort(compareDeadlineThenManageNo);

    const groups = buildCustomerGroups(rows);
    const unset = rows.filter((row) => row.deadlineUnset)
      .sort(compareManageNo);

    const byDeadline = new Map();
    rows.forEach((row) => {
      if (!row.deadline) {
        return;
      }
      if (!byDeadline.has(row.deadline)) {
        byDeadline.set(row.deadline, []);
      }
      byDeadline.get(row.deadline).push(row);
    });

    return {
      mode: mode === 'ready' ? 'ready' : 'all',
      rows: rows,
      groups: groups,
      unset: unset,
      byDeadline: byDeadline,
      counts: {
        total: rows.length,
        ready: rows.filter((row) => row.isReady).length,
        working: rows.filter((row) => row.isWorking).length,
        overdue: rows.filter((row) => row.isOverdue).length,
        today: rows.filter((row) => row.bucket === 'today').length,
        near: rows.filter((row) => row.bucket === 'near').length,
        unset: unset.length,
      },
    };
  };

  const dayCount = (model, dateYmd) => {
    const list = model?.byDeadline?.get(String(dateYmd || '').slice(0, 10));
    return Array.isArray(list) ? list.length : 0;
  };

  const dayRows = (model, dateYmd) => {
    const list = model?.byDeadline?.get(String(dateYmd || '').slice(0, 10));
    return Array.isArray(list) ? list.slice() : [];
  };

  const orderDetailPath = (recordId) => (
    '/k/' + cfg().ORDER_APP_ID + '/show#record=' + encodeURIComponent(String(recordId || ''))
  );

  const orderFetchFields = () => {
    const F = cfg().FIELDS;
    return [
      F.id,
      F.manageNo,
      F.slipNo,
      F.deadline,
      F.customerCode,
      F.customerName,
      F.clientName,
      F.kimonoType,
      F.kimonoSpec,
      F.processStatus,
      F.workStatus,
      F.locationStatus,
      F.deliveryStatus,
      F.aggregationStatus,
      F.detailTable,
    ];
  };

  const productFetchFields = () => ([
    cfg().FIELDS.productCode,
    cfg().FIELDS.subcategory,
  ]);

  /**
   * offset ページング（上限 MAX_OFFSET）。
   */
  const fetchAllByOffset = async (baseQuery, fetchPage) => {
    const limit = cfg().PAGE_LIMIT;
    const maxOffset = cfg().MAX_OFFSET;
    const all = [];
    let offset = 0;
    let truncated = false;
    let calls = 0;

    while (true) {
      const query = baseQuery + ' limit ' + limit + ' offset ' + offset;
      const records = await fetchPage(query);
      calls += 1;
      const list = Array.isArray(records) ? records : [];
      all.push(...list);
      if (list.length < limit) {
        break;
      }
      if (offset + limit > maxOffset) {
        truncated = true;
        break;
      }
      offset += limit;
    }

    return { records: all, truncated: truncated, calls: calls, method: 'offset' };
  };

  /**
   * $id カーソル相当のページング（offset 上限回避）。
   */
  const fetchAllByRecordId = async (baseCondition, fetchPage) => {
    const limit = cfg().PAGE_LIMIT;
    const all = [];
    let lastId = '';
    let truncated = false;
    let calls = 0;
    const maxLoops = 500;

    for (let loop = 0; loop < maxLoops; loop += 1) {
      let query = baseCondition
        ? baseCondition + ' and $id > ' + lastId
        : '$id > ' + lastId;
      if (!lastId) {
        query = baseCondition || '';
      }
      query = (query ? query + ' ' : '')
        + 'order by $id asc limit ' + limit;

      const records = await fetchPage(query);
      calls += 1;
      const list = Array.isArray(records) ? records : [];
      all.push(...list);
      if (list.length < limit) {
        return { records: all, truncated: false, calls: calls, method: 'id' };
      }
      lastId = readValue(list[list.length - 1], cfg().FIELDS.id);
      if (!lastId) {
        truncated = true;
        break;
      }
    }

    return { records: all, truncated: true, calls: calls, method: 'id' };
  };

  /**
   * kintone カーソル API。
   * api.createCursor / api.getCursor / api.deleteCursor を注入。
   */
  const fetchAllByCursor = async (baseQuery, fields, api) => {
    const size = cfg().CURSOR_SIZE;
    let calls = 1;
    const created = await api.createCursor({
      app: cfg().ORDER_APP_ID,
      query: baseQuery || undefined,
      fields: fields,
      size: size,
    });
    const cursorId = created?.id;
    if (!cursorId) {
      throw new Error('cursor id が取得できませんでした');
    }

    const all = [];
    try {
      while (true) {
        const page = await api.getCursor(cursorId);
        calls += 1;
        const list = Array.isArray(page?.records) ? page.records : [];
        all.push(...list);
        if (!page || page.next === false || list.length === 0) {
          break;
        }
      }
    } finally {
      try {
        await api.deleteCursor(cursorId);
        calls += 1;
      } catch (err) {
        /* ignore */
      }
    }

    return { records: all, truncated: false, calls: calls, method: 'cursor' };
  };

  /**
   * 取得戦略: cursor → 失敗時 $id → さらに失敗時 offset。
   * fetchPage(query) / cursorApi を desktop から注入。
   */
  const fetchAllOpenOrders = async (baseQuery, fields, deps) => {
    const started = Date.now();
    const fetchPage = deps.fetchPage;
    const cursorApi = deps.cursorApi;
    let result = null;
    const errors = [];

    if (cursorApi && typeof cursorApi.createCursor === 'function') {
      try {
        result = await fetchAllByCursor(baseQuery, fields, cursorApi);
      } catch (err) {
        errors.push(err);
        result = null;
      }
    }

    if (!result) {
      try {
        result = await fetchAllByRecordId(baseQuery, fetchPage);
      } catch (err) {
        errors.push(err);
        result = null;
      }
    }

    if (!result) {
      try {
        result = await fetchAllByOffset(
          baseQuery ? baseQuery + ' order by $id asc' : 'order by $id asc',
          fetchPage
        );
      } catch (err) {
        errors.push(err);
        result = null;
      }
    }

    if (!result) {
      const detail = errors.map((err) => (
        err && err.message ? err.message : String(err || 'unknown')
      )).join(' / ');
      const failure = new Error(
        cfg().MESSAGES.fetchAllFailed + (detail ? ' (' + detail + ')' : '')
      );
      failure.code = 'FETCH_ALL_FAILED';
      failure.causes = errors;
      throw failure;
    }

    return {
      records: result.records || [],
      truncated: Boolean(result.truncated),
      calls: Number(result.calls) || 0,
      method: result.method || 'unknown',
      elapsedMs: Date.now() - started,
    };
  };

  const formatApiError = (err) => {
    if (!err) {
      return cfg().MESSAGES.failed;
    }
    const status = err.code || err.status || err.statusCode
      || (err.error && err.error.code);
    const message = err.message
      || (err.error && (err.error.message || err.error.code))
      || String(err);
    const text = String(message);
    if (
      status === 403
      || status === 'CB_NO02'
      || text.indexOf('権限') !== -1
      || text.indexOf('privilege') !== -1
      || text.indexOf('Permission') !== -1
      || text.indexOf('403') !== -1
    ) {
      return cfg().MESSAGES.permissionDenied + ' (' + text + ')';
    }
    if (err.code === 'FETCH_ALL_FAILED') {
      return text;
    }
    return cfg().MESSAGES.failed + ' (' + text + ')';
  };

  const formatFetchStats = (stats) => {
    const template = cfg().MESSAGES.fetchStats;
    return template
      .replace('{count}', String(stats?.count ?? 0))
      .replace('{calls}', String(stats?.calls ?? 0))
      .replace('{ms}', String(stats?.elapsedMs ?? 0));
  };

  window.CAYANAS_ScheduleHubEngine = {
    escapeQueryValue,
    quote,
    readValue,
    todayParts,
    monthBounds,
    shiftMonth,
    weekdayIndexMonday,
    buildCalendarWeeks,
    isCancelled,
    isDelivered,
    isReady,
    isOpenOrder,
    undeliveredCondition,
    buildOpenOrdersQuery,
    buildReadyOrdersQuery,
    buildCustomerSearchQuery,
    buildFinishInProgressQuery,
    buildLeakCandidateQuery,
    joinProcessing,
    productLabel,
    subcategoriesForRecord,
    pickPriorityCategoryKey,
    matchingCategoryKeys,
    categoryLabel,
    isFinishCategory,
    collectItemCodes,
    chunkItemCodes,
    buildProductQuery,
    buildSubcategoryMap,
    compareManageNo,
    compareDeadlineThenManageNo,
    deadlineBucket,
    toRow,
    dedupeByManageNo,
    openRowsFromRecords,
    buildFinishQueues,
    buildCustomerMap,
    filterByCustomer,
    buildCustomerGroups,
    buildDeliveryModel,
    dayCount,
    dayRows,
    orderDetailPath,
    orderFetchFields,
    productFetchFields,
    fetchAllByOffset,
    fetchAllByRecordId,
    fetchAllByCursor,
    fetchAllOpenOrders,
    formatFetchStats,
    formatApiError,
  };

}());
