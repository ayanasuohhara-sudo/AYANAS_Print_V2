(function () {
  'use strict';

  /**
   * 納期・納品スケジュール管理 — ホストアプリ一覧 UI。
   * App16 / App13 は GET のみ。PUT/POST は行わない。
   */

  const ROOT_ID = 'ayanas-schedule-hub-root';
  const BODY_CLASS = 'ayanas-schedule-hub-active';

  const Engine = window.CAYANAS_ScheduleHubEngine;

  if (!Engine || typeof CAYANAS_SCHEDULE_HUB === 'undefined') {
    console.error('[schedule_hub] 依存 JS が未読込です。');
    return;
  }

  if (typeof kintone === 'undefined') {
    return;
  }

  const cfg = () => CAYANAS_SCHEDULE_HUB;

  const state = {
    tab: 'finish',
    loading: false,
    message: '',
    messageKind: '',
    fetchStats: null,
    truncated: false,
    subcategoryByCode: new Map(),
    openRecords: [],
    finish: null,
    deliveryMode: 'all',
    viewMode: 'list',
    calYear: 0,
    calMonth: 0,
    selectedYmd: '',
    customerCode: '',
    customerMap: {},
    expandedCustomers: {},
    requestSerial: 0,
  };

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const isHostApp = (appId) => {
    const host = cfg().HOST_APP_ID;
    if (host === null || host === undefined || host === '') {
      return true;
    }
    return Number(appId) === Number(host);
  };

  /** 読取専用: GET のみ */
  const kintoneGet = (appId, query, fields) => kintone.api(
    kintone.api.url('/k/v1/records.json', true),
    'GET',
    {
      app: appId,
      query: query,
      fields: fields,
    }
  );

  const fetchOrderPage = async (query) => {
    const response = await kintoneGet(
      cfg().ORDER_APP_ID,
      query,
      Engine.orderFetchFields()
    );
    return response.records || [];
  };

  const fetchProductPage = async (query) => {
    const response = await kintoneGet(
      cfg().PRODUCT_APP_ID,
      query,
      Engine.productFetchFields()
    );
    return response.records || [];
  };

  const cursorApi = {
    createCursor: (params) => kintone.api(
      kintone.api.url('/k/v1/records/cursor.json', true),
      'POST',
      params
    ),
    getCursor: (id) => kintone.api(
      kintone.api.url('/k/v1/records/cursor.json', true),
      'GET',
      { id: id }
    ),
    deleteCursor: (id) => kintone.api(
      kintone.api.url('/k/v1/records/cursor.json', true),
      'DELETE',
      { id: id }
    ),
  };

  const loadSubcategoryMap = async (records) => {
    const codes = Engine.collectItemCodes(records);
    if (!codes.length) {
      return { map: new Map(), failed: false };
    }

    try {
      const chunks = Engine.chunkItemCodes(codes);
      const products = [];

      for (let index = 0; index < chunks.length; index += 1) {
        const baseQuery = Engine.buildProductQuery(chunks[index]);
        const page = await Engine.fetchAllByOffset(baseQuery, fetchProductPage);
        products.push(...page.records);
      }

      return { map: Engine.buildSubcategoryMap(products), failed: false };
    } catch (err) {
      console.warn('[schedule_hub] App13 subcategory load failed', err);
      return { map: new Map(), failed: true, error: err };
    }
  };

  const clearLoadedData = () => {
    state.subcategoryByCode = new Map();
    state.openRecords = [];
    state.finish = null;
    state.customerMap = {};
    state.fetchStats = null;
    state.truncated = false;
    state.expandedCustomers = {};
  };

  const ensureCalendarMonth = () => {
    if (state.calYear && state.calMonth) {
      return;
    }
    const today = Engine.todayParts(new Date());
    state.calYear = today.year;
    state.calMonth = today.month;
  };

  const reload = async () => {
    const serial = ++state.requestSerial;
    state.loading = true;
    state.message = cfg().MESSAGES.loading;
    state.messageKind = '';
    /* 取得完了まで前回の件数を出さない */
    clearLoadedData();
    render();

    try {
      const query = Engine.buildOpenOrdersQuery();
      const fetched = await Engine.fetchAllOpenOrders(
        query,
        Engine.orderFetchFields(),
        {
          fetchPage: fetchOrderPage,
          cursorApi: cursorApi,
        }
      );

      if (serial !== state.requestSerial) {
        return;
      }

      const productResult = await loadSubcategoryMap(fetched.records);
      if (serial !== state.requestSerial) {
        return;
      }

      const map = productResult.map;
      state.subcategoryByCode = map;
      state.openRecords = fetched.records;
      state.truncated = fetched.truncated;
      state.fetchStats = {
        count: fetched.records.length,
        calls: fetched.calls,
        elapsedMs: fetched.elapsedMs,
        method: fetched.method,
      };

      const today = Engine.todayParts(new Date()).ymd;
      const openRows = Engine.openRowsFromRecords(
        fetched.records,
        map,
        today
      );
      state.customerMap = Engine.buildCustomerMap(openRows);
      state.finish = Engine.buildFinishQueues(fetched.records, map, today);
      ensureCalendarMonth();

      let message = Engine.formatFetchStats(state.fetchStats)
        + '（方式: ' + fetched.method + '）';
      let kind = '';
      if (fetched.truncated) {
        message += ' / ' + cfg().MESSAGES.truncated;
        kind = 'warn';
      }
      if (productResult.failed) {
        message += ' / ' + cfg().MESSAGES.productMapFailed;
        kind = 'warn';
      }
      state.message = message;
      state.messageKind = kind;
      state.loading = false;
      render();
    } catch (err) {
      if (serial !== state.requestSerial) {
        return;
      }
      console.error('[schedule_hub] load failed', err);
      clearLoadedData();
      state.loading = false;
      state.message = Engine.formatApiError(err);
      state.messageKind = 'error';
      render();
    }
  };

  const deliveryModel = () => {
    const today = Engine.todayParts(new Date()).ymd;
    return Engine.buildDeliveryModel(
      state.openRecords,
      state.subcategoryByCode,
      today,
      state.deliveryMode
    );
  };

  const openOrderDetail = (recordId) => {
    const path = Engine.orderDetailPath(recordId);
    window.open(location.origin + path, '_blank');
  };

  const renderStatus = () => {
    if (!state.message) {
      return '';
    }
    const kind = state.messageKind ? ' is-' + state.messageKind : '';
    return '<p class="cayan-sh-status' + kind + '">' + escapeHtml(state.message) + '</p>';
  };

  const renderTabs = () => (
    '<div class="cayan-sh-tabs" role="tablist">'
    + cfg().TABS.map((tab) => (
      '<button type="button" class="cayan-sh-tab'
      + (state.tab === tab.id ? ' is-active' : '')
      + '" data-action="tab" data-tab="' + tab.id + '">'
      + escapeHtml(tab.label)
      + '</button>'
    )).join('')
    + '</div>'
  );

  const renderRowCells = (row, columns) => columns.map((col) => {
    if (col === 'manageNo') {
      return '<td><button type="button" class="cayan-sh-link" data-action="open" data-id="'
        + escapeHtml(row.recordId) + '">'
        + escapeHtml(row.manageNo || '(なし)')
        + '</button></td>';
    }
    if (col === 'slipNo') {
      return '<td>' + escapeHtml(row.slipNo || '') + '</td>';
    }
    if (col === 'client') {
      return '<td>' + escapeHtml(row.clientName || '') + '</td>';
    }
    if (col === 'deadline') {
      const badge = row.isOverdue
        ? '<span class="cayan-sh-badge">超過</span>'
        : (row.deadlineUnset
          ? '<span class="cayan-sh-badge is-unset">未設定</span>'
          : '');
      return '<td>' + escapeHtml(row.deadlineLabel) + badge + '</td>';
    }
    if (col === 'delivery') {
      const badge = row.isReady
        ? '<span class="cayan-sh-badge is-ready">完成</span>'
        : '<span class="cayan-sh-badge is-work">作業中</span>';
      return '<td>' + escapeHtml(row.deliveryStatus || '(空)') + badge + '</td>';
    }
    if (col === 'customer') {
      return '<td>' + escapeHtml(
        (row.customerCode ? row.customerCode + ' ' : '') + (row.customerName || '')
      ) + '</td>';
    }
    if (col === 'product') {
      return '<td>' + escapeHtml(row.product || '') + '</td>';
    }
    if (col === 'processing') {
      return '<td>' + escapeHtml(row.processing || row.categoriesLabel || '') + '</td>';
    }
    if (col === 'location') {
      return '<td>' + escapeHtml(row.locationStatus || '') + '</td>';
    }
    if (col === 'process') {
      return '<td>' + escapeHtml(row.processStatus || '') + '</td>';
    }
    if (col === 'work') {
      return '<td>' + escapeHtml(row.workStatus || '') + '</td>';
    }
    return '<td></td>';
  }).join('');

  const renderTable = (rows, columns, headers) => {
    if (!rows.length) {
      return '<div class="cayan-sh-empty">' + escapeHtml(cfg().MESSAGES.empty) + '</div>';
    }
    return '<div class="cayan-sh-table-wrap"><table class="cayan-sh-table"><thead><tr>'
      + headers.map((h) => '<th>' + escapeHtml(h) + '</th>').join('')
      + '</tr></thead><tbody>'
      + rows.map((row) => {
        const cls = row.isOverdue ? ' is-overdue' : (row.isReady ? ' is-ready' : '');
        return '<tr class="' + cls.trim() + '">'
          + renderRowCells(row, columns)
          + '</tr>';
      }).join('')
      + '</tbody></table></div>';
  };

  const renderFinishTab = () => {
    const finish = state.finish || { main: [], leak: [], unset: [], overdueCount: 0 };
    return ''
      + '<div class="cayan-sh-kpi">'
      + '<div class="cayan-sh-kpi-card"><div class="cayan-sh-kpi-label">仕上げ中</div>'
      + '<div class="cayan-sh-kpi-count">' + finish.main.length + '</div></div>'
      + '<div class="cayan-sh-kpi-card is-overdue"><div class="cayan-sh-kpi-label">超過</div>'
      + '<div class="cayan-sh-kpi-count">' + finish.overdueCount + '</div></div>'
      + '<div class="cayan-sh-kpi-card"><div class="cayan-sh-kpi-label">漏れ候補</div>'
      + '<div class="cayan-sh-kpi-count">' + finish.leak.length + '</div></div>'
      + '<div class="cayan-sh-kpi-card"><div class="cayan-sh-kpi-label">納期未設定</div>'
      + '<div class="cayan-sh-kpi-count">' + finish.unset.length + '</div></div>'
      + '</div>'
      + '<p class="cayan-sh-hint">対象: 国内仕立・海外仕立・帯仕立・修理 / 並び: 納期昇順（未設定は末尾）</p>'
      + '<div class="cayan-sh-section">'
      + '<h3 class="cayan-sh-section-title">仕上げ予定（仕上げ中）</h3>'
      + renderTable(
        finish.main,
        ['manageNo', 'slipNo', 'customer', 'client', 'product', 'processing', 'deadline', 'location'],
        ['管理番号', '伝票番号', '得意先', 'お客様名', '商品', '加工内容', '納期', '保管場所']
      )
      + '</div>'
      + '<div class="cayan-sh-section is-leak">'
      + '<h3 class="cayan-sh-section-title">' + escapeHtml(cfg().MESSAGES.leakTitle) + '</h3>'
      + '<p class="cayan-sh-hint">本体（仕上げ中）との重複は除外済み。既存入庫処理は変更しません。</p>'
      + renderTable(
        finish.leak,
        ['manageNo', 'slipNo', 'customer', 'client', 'product', 'processing', 'deadline', 'process', 'work', 'location'],
        ['管理番号', '伝票番号', '得意先', 'お客様名', '商品', '加工内容', '納期', '工程', '作業', '保管場所']
      )
      + '</div>'
      + '<div class="cayan-sh-section is-unset">'
      + '<h3 class="cayan-sh-section-title">' + escapeHtml(cfg().MESSAGES.unsetTitle) + '（仕上げ関連）</h3>'
      + renderTable(
        finish.unset,
        ['manageNo', 'slipNo', 'customer', 'client', 'product', 'processing', 'work', 'location'],
        ['管理番号', '伝票番号', '得意先', 'お客様名', '商品', '加工内容', '作業', '保管場所']
      )
      + '</div>';
  };

  const renderCustomerTab = () => {
    const options = Object.keys(state.customerMap).sort((a, b) => (
      a.localeCompare(b, 'ja', { numeric: true })
    ));
    const rows = state.customerCode
      ? Engine.filterByCustomer(
        Engine.openRowsFromRecords(
          state.openRecords,
          state.subcategoryByCode,
          Engine.todayParts(new Date()).ymd
        ),
        state.customerCode
      )
      : [];

    return ''
      + '<div class="cayan-sh-toolbar">'
      + '<label for="cayan-sh-customer-select">顧客選択</label>'
      + '<select id="cayan-sh-customer-select" data-action="customer-select">'
      + '<option value="">（選択）</option>'
      + options.map((code) => (
        '<option value="' + escapeHtml(code) + '"'
        + (state.customerCode === code ? ' selected' : '') + '>'
        + escapeHtml(code + ' ' + (state.customerMap[code] || ''))
        + '</option>'
      )).join('')
      + '</select>'
      + '<label for="cayan-sh-customer-code">顧客コード</label>'
      + '<input type="text" id="cayan-sh-customer-code" value="'
      + escapeHtml(state.customerCode) + '" placeholder="例: m032" />'
      + '<button type="button" class="cayan-sh-btn is-primary" data-action="customer-search">検索</button>'
      + '<button type="button" class="cayan-sh-btn" data-action="customer-clear">クリア</button>'
      + '</div>'
      + (state.customerCode
        ? '<p class="cayan-sh-hint">得意先 '
          + escapeHtml(state.customerCode + ' ' + (state.customerMap[state.customerCode] || ''))
          + ' / 未納品 ' + rows.length + ' 件'
          + '（App16 VIEW 5521026 と同等条件。schedule_customer.js は未変更）</p>'
          + renderTable(
            rows,
            ['manageNo', 'slipNo', 'client', 'product', 'deadline', 'process', 'work', 'location', 'delivery'],
            ['管理番号', '伝票番号', 'お客様名', '商品', '納期', '工程', '作業', '保管場所', '納品状態']
          )
        : '<div class="cayan-sh-empty">' + escapeHtml(cfg().MESSAGES.customerPrompt) + '</div>');
  };

  const renderCalendar = (model) => {
    ensureCalendarMonth();
    const weeks = Engine.buildCalendarWeeks(state.calYear, state.calMonth);
    const bounds = Engine.monthBounds(state.calYear, state.calMonth);
    const today = Engine.todayParts(new Date()).ymd;

    return ''
      + '<div class="cayan-sh-toolbar">'
      + '<button type="button" class="cayan-sh-btn" data-action="cal-prev">前月</button>'
      + '<strong>' + escapeHtml(bounds.label) + '</strong>'
      + '<button type="button" class="cayan-sh-btn" data-action="cal-next">翌月</button>'
      + '<button type="button" class="cayan-sh-btn" data-action="cal-today">今月</button>'
      + '</div>'
      + '<table class="cayan-sh-cal"><thead><tr>'
      + cfg().WEEKDAY_LABELS.map((label) => '<th>' + escapeHtml(label) + '</th>').join('')
      + '</tr></thead><tbody>'
      + weeks.map((week) => (
        '<tr>'
        + week.map((cell) => {
          if (!cell) {
            return '<td class="is-blank"></td>';
          }
          const count = Engine.dayCount(model, cell.ymd);
          const cls = [
            cell.isSaturday ? 'is-sat' : '',
            cell.isSunday ? 'is-sun' : '',
            cell.ymd === today ? 'is-today' : '',
            cell.ymd === state.selectedYmd ? 'is-selected' : '',
          ].filter(Boolean).join(' ');
          return '<td class="' + cls + '">'
            + '<button type="button" class="cayan-sh-cal-btn" data-action="cal-day" data-ymd="'
            + escapeHtml(cell.ymd) + '">'
            + '<div class="cayan-sh-cal-day">' + cell.day + '</div>'
            + (count
              ? '<div class="cayan-sh-cal-count">' + count + '</div>'
              : '')
            + '</button></td>';
        }).join('')
        + '</tr>'
      )).join('')
      + '</tbody></table>';
  };

  const renderDeliveryTab = () => {
    const model = deliveryModel();
    const modeAll = state.deliveryMode !== 'ready';
    const listMode = state.viewMode !== 'calendar';

    let body = '';
    if (listMode) {
      if (modeAll) {
        body = model.groups.map((group) => {
          const key = group.customerCode;
          const open = state.expandedCustomers[key];
          return '<div class="cayan-sh-group">'
            + '<button type="button" class="cayan-sh-group-head" data-action="toggle-group" data-code="'
            + escapeHtml(key) + '">'
            + '<span class="cayan-sh-group-title">'
            + escapeHtml(key + ' ' + (group.customerName || ''))
            + (group.hasOverdue ? '<span class="cayan-sh-badge">超過あり</span>' : '')
            + '</span>'
            + '<span class="cayan-sh-group-meta">完成 '
            + group.readyCount + ' / 作業中 ' + group.workingCount
            + ' / 最短納期 ' + escapeHtml(group.earliestLabel)
            + '</span></button>'
            + (open
              ? '<div class="cayan-sh-group-body">'
                + renderTable(
                  group.rows,
                  ['manageNo', 'slipNo', 'client', 'product', 'deadline', 'process', 'work', 'location', 'delivery'],
                  ['管理番号', '伝票番号', 'お客様名', '商品', '納期', '工程', '作業', '保管場所', '納品状態']
                )
                + '</div>'
              : '')
            + '</div>';
        }).join('') || ('<div class="cayan-sh-empty">' + escapeHtml(cfg().MESSAGES.empty) + '</div>');
      } else {
        body = '<div class="cayan-sh-table-wrap"><table class="cayan-sh-table"><thead><tr>'
          + '<th>得意先</th><th>完成点</th><th>最短納期</th><th></th>'
          + '</tr></thead><tbody>'
          + model.groups.map((group) => {
            const key = group.customerCode;
            const open = state.expandedCustomers[key];
            return '<tr class="' + (group.hasOverdue ? 'is-overdue' : '') + '">'
              + '<td>' + escapeHtml(key + ' ' + (group.customerName || '')) + '</td>'
              + '<td>' + group.readyCount + '</td>'
              + '<td>' + escapeHtml(group.earliestLabel)
              + (group.hasOverdue ? '<span class="cayan-sh-badge">超過</span>' : '')
              + '</td>'
              + '<td><button type="button" class="cayan-sh-btn" data-action="toggle-group" data-code="'
              + escapeHtml(key) + '">' + (open ? '閉じる' : '明細') + '</button></td>'
              + '</tr>'
              + (open
                ? '<tr><td colspan="4">'
                  + renderTable(
                    group.rows,
                    ['manageNo', 'slipNo', 'client', 'product', 'deadline', 'location', 'delivery'],
                    ['管理番号', '伝票番号', 'お客様名', '商品', '納期', '保管場所', '納品状態']
                  )
                  + '</td></tr>'
                : '');
          }).join('')
          + '</tbody></table></div>';
        if (!model.groups.length) {
          body = '<div class="cayan-sh-empty">' + escapeHtml(cfg().MESSAGES.empty) + '</div>';
        }
      }
    } else {
      body = renderCalendar(model);
      if (state.selectedYmd) {
        const dayRows = Engine.dayRows(model, state.selectedYmd);
        body += '<div class="cayan-sh-section" style="margin-top:12px">'
          + '<h3 class="cayan-sh-section-title">納期 ' + escapeHtml(state.selectedYmd)
          + '（' + dayRows.length + ' 件）</h3>'
          + renderTable(
            dayRows,
            ['manageNo', 'slipNo', 'customer', 'client', 'product', 'deadline', 'delivery', 'location'],
            ['管理番号', '伝票番号', '得意先', 'お客様名', '商品', '納期', '納品状態', '保管場所']
          )
          + '</div>';
      }
    }

    return ''
      + '<div class="cayan-sh-toolbar">'
      + '<span><strong>表示</strong></span>'
      + '<button type="button" class="cayan-sh-btn'
      + (modeAll ? ' is-active' : '')
      + '" data-action="delivery-mode" data-mode="all">全商品</button>'
      + '<button type="button" class="cayan-sh-btn'
      + (!modeAll ? ' is-active' : '')
      + '" data-action="delivery-mode" data-mode="ready">納品可能のみ</button>'
      + '<span><strong>形式</strong></span>'
      + '<button type="button" class="cayan-sh-btn'
      + (listMode ? ' is-active' : '')
      + '" data-action="view-mode" data-mode="list">一覧</button>'
      + '<button type="button" class="cayan-sh-btn'
      + (!listMode ? ' is-active' : '')
      + '" data-action="view-mode" data-mode="calendar">カレンダー</button>'
      + '</div>'
      + '<div class="cayan-sh-kpi">'
      + '<div class="cayan-sh-kpi-card"><div class="cayan-sh-kpi-label">合計</div>'
      + '<div class="cayan-sh-kpi-count">' + model.counts.total + '</div></div>'
      + '<div class="cayan-sh-kpi-card is-ready"><div class="cayan-sh-kpi-label">完成(納品待ち)</div>'
      + '<div class="cayan-sh-kpi-count">' + model.counts.ready + '</div></div>'
      + '<div class="cayan-sh-kpi-card"><div class="cayan-sh-kpi-label">作業中</div>'
      + '<div class="cayan-sh-kpi-count">' + model.counts.working + '</div></div>'
      + '<div class="cayan-sh-kpi-card is-overdue"><div class="cayan-sh-kpi-label">超過</div>'
      + '<div class="cayan-sh-kpi-count">' + model.counts.overdue + '</div></div>'
      + '<div class="cayan-sh-kpi-card"><div class="cayan-sh-kpi-label">本日</div>'
      + '<div class="cayan-sh-kpi-count">' + model.counts.today + '</div></div>'
      + '<div class="cayan-sh-kpi-card"><div class="cayan-sh-kpi-label">近日</div>'
      + '<div class="cayan-sh-kpi-count">' + model.counts.near + '</div></div>'
      + '<div class="cayan-sh-kpi-card"><div class="cayan-sh-kpi-label">納期未設定</div>'
      + '<div class="cayan-sh-kpi-count">' + model.counts.unset + '</div></div>'
      + '</div>'
      + body
      + '<div class="cayan-sh-section is-unset">'
      + '<h3 class="cayan-sh-section-title">' + escapeHtml(cfg().MESSAGES.unsetTitle)
      + '（カレンダー対象外）</h3>'
      + renderTable(
        model.unset,
        ['manageNo', 'slipNo', 'customer', 'client', 'product', 'delivery', 'location'],
        ['管理番号', '伝票番号', '得意先', 'お客様名', '商品', '納品状態', '保管場所']
      )
      + '</div>'
      + '<p class="cayan-sh-hint">発送判断用。負荷カレンダー(App89)とは別。発送確定は App19 の既存納品処理を使用。</p>';
  };

  const renderBody = () => {
    if (state.loading && !state.openRecords.length) {
      return '<div class="cayan-sh-empty">' + escapeHtml(cfg().MESSAGES.loading) + '</div>';
    }
    if (state.tab === 'customer') {
      return renderCustomerTab();
    }
    if (state.tab === 'delivery') {
      return renderDeliveryTab();
    }
    return renderFinishTab();
  };

  const render = () => {
    const root = document.getElementById(ROOT_ID);
    if (!root) {
      return;
    }

    root.innerHTML = ''
      + '<div class="cayan-sh-header">'
      + '<h1 class="cayan-sh-title">納期・納品スケジュール管理</h1>'
      + '<span class="cayan-sh-meta">v' + escapeHtml(cfg().VERSION)
      + ' / ' + escapeHtml(cfg().MESSAGES.readOnly) + '</span>'
      + '<div class="cayan-sh-actions">'
      + '<button type="button" class="cayan-sh-btn is-primary" data-action="reload">再読込</button>'
      + '</div></div>'
      + renderTabs()
      + renderStatus()
      + renderBody();
  };

  const onClick = (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) {
      return;
    }
    const action = target.getAttribute('data-action');

    if (action === 'reload') {
      reload();
      return;
    }
    if (action === 'tab') {
      state.tab = target.getAttribute('data-tab') || 'finish';
      render();
      return;
    }
    if (action === 'open') {
      openOrderDetail(target.getAttribute('data-id'));
      return;
    }
    if (action === 'customer-select') {
      return;
    }
    if (action === 'customer-search') {
      const input = document.getElementById('cayan-sh-customer-code');
      state.customerCode = String(input?.value || '').trim();
      render();
      return;
    }
    if (action === 'customer-clear') {
      state.customerCode = '';
      render();
      return;
    }
    if (action === 'delivery-mode') {
      state.deliveryMode = target.getAttribute('data-mode') === 'ready' ? 'ready' : 'all';
      state.expandedCustomers = {};
      render();
      return;
    }
    if (action === 'view-mode') {
      state.viewMode = target.getAttribute('data-mode') === 'calendar' ? 'calendar' : 'list';
      render();
      return;
    }
    if (action === 'toggle-group') {
      const code = target.getAttribute('data-code') || '';
      state.expandedCustomers[code] = !state.expandedCustomers[code];
      render();
      return;
    }
    if (action === 'cal-prev') {
      const next = Engine.shiftMonth(state.calYear, state.calMonth, -1);
      state.calYear = next.year;
      state.calMonth = next.month;
      state.selectedYmd = '';
      render();
      return;
    }
    if (action === 'cal-next') {
      const next = Engine.shiftMonth(state.calYear, state.calMonth, 1);
      state.calYear = next.year;
      state.calMonth = next.month;
      state.selectedYmd = '';
      render();
      return;
    }
    if (action === 'cal-today') {
      const today = Engine.todayParts(new Date());
      state.calYear = today.year;
      state.calMonth = today.month;
      state.selectedYmd = '';
      render();
      return;
    }
    if (action === 'cal-day') {
      state.selectedYmd = target.getAttribute('data-ymd') || '';
      render();
    }
  };

  const onChange = (event) => {
    if (event.target && event.target.getAttribute('data-action') === 'customer-select') {
      state.customerCode = String(event.target.value || '').trim();
      render();
    }
  };

  const mount = (event) => {
    if (!isHostApp(event.appId)) {
      return event;
    }

    /*
     * 標準一覧の非表示は body.ayanas-schedule-hub-active 配下のみ。
     * 本 JS/CSS はホストアプリにだけ登録するため、他アプリの一覧には影響しない。
     */
    document.body.classList.add(BODY_CLASS);

    let root = document.getElementById(ROOT_ID);
    if (!root) {
      const space = kintone.app.getHeaderSpaceElement()
        || kintone.app.getHeaderMenuSpaceElement();
      if (!space) {
        return event;
      }
      root = document.createElement('div');
      root.id = ROOT_ID;
      root.className = 'cayan-sh-root';
      space.appendChild(root);
      root.addEventListener('click', onClick);
      root.addEventListener('change', onChange);
    }

    if (!state.openRecords.length && !state.loading) {
      reload();
    } else {
      render();
    }

    return event;
  };

  kintone.events.on('app.record.index.show', mount);

}());
