(function () {
  'use strict';

  /**
   * 和裁士別仕事予定カレンダー — 一覧 UI（第3段階）
   * ホスト App の index をカレンダーに置換。App73/74/78 は GET のみ。
   * 予定 App（PLAN_APP_ID）があるときのみ予約の読取・登録・取消を行う。
   */

  const ROOT_ID = 'ayanas-wasai-schedule-root';
  const BODY_CLASS = 'ayanas-wasai-schedule-active';

  const Engine = window.CAYANAS_WasaiScheduleEngine;

  if (!Engine || typeof CAYANAS_WASAI_SCHEDULE === 'undefined') {
    console.error('[wasai_schedule] 依存 JS が未読込です。');
    return;
  }

  if (typeof kintone === 'undefined') {
    return;
  }

  const cfg = () => CAYANAS_WASAI_SCHEDULE;

  const resolveHostAppId = () => {
    if (typeof window.CAYANAS_WASAI_SCHEDULE_HOST_APP_ID === 'number') {
      return window.CAYANAS_WASAI_SCHEDULE_HOST_APP_ID;
    }
    return cfg().HOST_APP_ID;
  };

  let requestSerial = 0;
  let viewYear = 0;
  let viewMonth = 0;
  let selectedYmd = '';
  let selectedWasaiCode = '';
  let masters = [];
  let model = null;
  let loading = false;
  let message = '';
  let messageKind = '';
  let showReturned = true;
  let showPlanned = true;
  let planMessage = '';
  let planMessageKind = '';
  let editingPlanId = '';
  let draftPlan = null;

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const kintoneGet = (appId, query, fields) => kintone.api(
    kintone.api.url('/k/v1/records.json', true),
    'GET',
    {
      app: appId,
      query: query,
      fields: fields,
    }
  );

  let masterFieldsIncludeCapacity = true;

  const fetchMasterPage = async (query) => {
    try {
      const response = await kintoneGet(
        cfg().WASAI_MASTER_APP_ID,
        query,
        Engine.masterFetchFields({ includeCapacity: masterFieldsIncludeCapacity })
      );
      return response.records || [];
    } catch (error) {
      // 本番で monthly_capacity 未追加のあいだはフィールド無しで再取得
      if (masterFieldsIncludeCapacity) {
        console.warn('[wasai_schedule] monthly_capacity 未取得のためフォールバック', error);
        masterFieldsIncludeCapacity = false;
        const response = await kintoneGet(
          cfg().WASAI_MASTER_APP_ID,
          query,
          Engine.masterFetchFields({ includeCapacity: false })
        );
        return response.records || [];
      }
      throw error;
    }
  };

  const fetchOutboundPage = async (query) => {
    const response = await kintoneGet(
      cfg().WASAI_OUTBOUND_APP_ID,
      query,
      Engine.outboundFetchFields()
    );
    return response.records || [];
  };

  const fetchInboundPage = async (query) => {
    const response = await kintoneGet(
      cfg().INBOUND_APP_ID,
      query,
      Engine.inboundFetchFields()
    );
    return response.records || [];
  };

  const planAppId = () => {
    if (typeof window.CAYANAS_WASAI_SCHEDULE_PLAN_APP_ID === 'number') {
      return window.CAYANAS_WASAI_SCHEDULE_PLAN_APP_ID;
    }
    return cfg().PLAN_APP_ID;
  };

  const fetchPlanPage = async (query) => {
    const appId = planAppId();
    if (!appId) {
      return [];
    }
    const response = await kintoneGet(
      appId,
      query,
      Engine.planFetchFields()
    );
    return response.records || [];
  };

  const selectedMaster = () => (
    masters.find((row) => row.wasaiCode === selectedWasaiCode) || null
  );

  const cellSummaryHtml = (date) => {
    if (!model) {
      return '';
    }
    const summary = Engine.daySummary(model, date, {
      includeReturned: showReturned,
      includePlanned: showPlanned,
    });
    if (summary.totalPieces <= 0) {
      return '';
    }
    const parts = [];
    if (summary.outboundPieces > 0) {
      parts.push(
        '<span class="cayan-ws-chip is-outbound">'
        + escapeHtml(String(summary.outboundPieces))
        + '枚出庫中</span>'
      );
    }
    if (showPlanned && summary.plannedPieces > 0) {
      parts.push(
        '<span class="cayan-ws-chip is-planned">'
        + escapeHtml(String(summary.plannedPieces))
        + '枚予約</span>'
      );
    }
    if (showReturned && summary.returnedPieces > 0) {
      parts.push(
        '<span class="cayan-ws-chip is-returned">'
        + escapeHtml(String(summary.returnedPieces))
        + '枚返却済</span>'
      );
    }
    if (summary.reworkPieces > 0) {
      parts.push(
        '<span class="cayan-ws-chip is-rework">'
        + escapeHtml(String(summary.reworkPieces))
        + '枚再加工</span>'
      );
    }
    return '<div class="cayan-ws-chips">' + parts.join('') + '</div>';
  };

  const calendarHtml = () => {
    const weeks = Engine.buildCalendarWeeks(viewYear, viewMonth);
    const today = Engine.todayParts(new Date()).ymd;
    const head = cfg().WEEKDAY_LABELS
      .map((label) => '<div class="cayan-ws-dow">' + escapeHtml(label) + '</div>')
      .join('');

    const body = weeks.map((week) => (
      '<div class="cayan-ws-week">'
      + week.map((cell) => {
        if (!cell) {
          return '<div class="cayan-ws-cell is-blank"></div>';
        }
        const classes = ['cayan-ws-cell'];
        if (cell.isSaturday) {
          classes.push('is-sat');
        }
        if (cell.isSunday) {
          classes.push('is-sun');
        }
        if (cell.ymd === today) {
          classes.push('is-today');
        }
        if (cell.ymd === selectedYmd) {
          classes.push('is-selected');
        }
        return '<button type="button" class="' + classes.join(' ') + '"'
          + ' data-ymd="' + escapeHtml(cell.ymd) + '">'
          + '<div class="cayan-ws-day">' + escapeHtml(String(cell.day)) + '</div>'
          + cellSummaryHtml(cell.ymd)
          + '</button>';
      }).join('')
      + '</div>'
    )).join('');

    return '<div class="cayan-ws-grid">'
      + '<div class="cayan-ws-week is-head">' + head + '</div>'
      + body
      + '</div>';
  };

  const detailRowHtml = (row) => {
    const links = [];
    if (row.source === 'outbound' && row.outboundRecordId) {
      links.push(
        '<a class="cayan-ws-link" href="'
        + escapeHtml(Engine.outboundDetailPath(row.outboundRecordId))
        + '" target="_blank" rel="noopener">出庫</a>'
      );
    }
    if (row.orderRecordId) {
      links.push(
        '<a class="cayan-ws-link" href="'
        + escapeHtml(Engine.orderDetailPath(row.orderRecordId))
        + '" target="_blank" rel="noopener">受注</a>'
      );
    }
    if (row.source === 'plan' && row.planRecordId && Engine.planDetailPath(row.planRecordId)) {
      links.push(
        '<a class="cayan-ws-link" href="'
        + escapeHtml(Engine.planDetailPath(row.planRecordId))
        + '" target="_blank" rel="noopener">予定</a>'
      );
    }
    if (row.source === 'plan' && row.planRecordId && planAppId()) {
      links.push(
        '<button type="button" class="cayan-ws-linkbtn" data-edit-plan="'
        + escapeHtml(row.planRecordId) + '">変更</button>'
      );
      links.push(
        '<button type="button" class="cayan-ws-linkbtn" data-cancel-plan="'
        + escapeHtml(row.planRecordId) + '">取消</button>'
      );
    }

    return '<tr class="cayan-ws-row is-' + escapeHtml(row.kind) + '">'
      + '<td>' + escapeHtml(row.manageNo || '—') + '</td>'
      + '<td>' + escapeHtml(row.itemSummary) + '</td>'
      + '<td class="cayan-ws-num">' + escapeHtml(String(row.pieceCount)) + '</td>'
      + '<td>' + escapeHtml(row.kindLabel) + '</td>'
      + '<td>' + escapeHtml(row.shipDate || '—') + '</td>'
      + '<td>' + escapeHtml(row.returnDate || '—') + '</td>'
      + '<td>' + escapeHtml(row.inboundDate || '—') + '</td>'
      + '<td>' + links.join(' · ') + '</td>'
      + '</tr>';
  };

  const detailHtml = () => {
    if (!selectedWasaiCode) {
      return '<p class="cayan-ws-empty">' + escapeHtml(cfg().MESSAGES.selectWasai) + '</p>';
    }
    if (!selectedYmd) {
      return '<p class="cayan-ws-empty">日付を選択すると明細を表示します。</p>';
    }
    const summary = Engine.daySummary(model, selectedYmd, {
      includeReturned: showReturned,
      includePlanned: showPlanned,
    });
    const heading = '<h3 class="cayan-ws-detail-title">'
      + escapeHtml(Engine.formatLongDate(selectedYmd))
      + ' · '
      + escapeHtml(cfg().MESSAGES.detailPrefix)
      + escapeHtml(String(summary.rows.length))
      + escapeHtml(cfg().MESSAGES.detailSuffix)
      + '（'
      + escapeHtml(String(summary.totalPieces))
      + escapeHtml(cfg().MESSAGES.pieceSuffix)
      + '）</h3>';

    if (summary.rows.length === 0) {
      return heading + '<p class="cayan-ws-empty">' + escapeHtml(cfg().MESSAGES.emptyDay) + '</p>';
    }

    return heading
      + '<div class="cayan-ws-table-wrap"><table class="cayan-ws-table">'
      + '<thead><tr>'
      + '<th>管理番号</th><th>品目</th><th>枚数</th><th>状態</th>'
      + '<th>出庫日</th><th>返却予定日</th><th>入庫日</th><th>リンク</th>'
      + '</tr></thead><tbody>'
      + summary.rows.map(detailRowHtml).join('')
      + '</tbody></table></div>';
  };

  const capacityHtml = () => {
    const master = selectedMaster();
    if (!selectedWasaiCode || !master) {
      return '';
    }
    const label = Engine.formatMonthlyCapacity(master.monthlyCapacity);
    const isUnset = master.monthlyCapacity === null || master.monthlyCapacity === undefined;
    return '<div class="cayan-ws-capacity" aria-live="polite">'
      + '<span class="cayan-ws-capacity-main">'
      + escapeHtml(cfg().MESSAGES.capacityLabel)
      + ' <strong class="' + (isUnset ? 'is-unset' : '') + '">'
      + escapeHtml(label)
      + '</strong></span>'
      + '<span class="cayan-ws-capacity-hint">'
      + escapeHtml(cfg().MESSAGES.capacityEditHint)
      + '</span>'
      + '</div>';
  };

  const totalsHtml = () => {
    if (!selectedWasaiCode) {
      return '';
    }
    const capacity = capacityHtml();
    if (!model) {
      return capacity;
    }
    const totals = model.totals || {};
    const visibleReturned = showReturned ? Number(totals.returnedPieces || 0) : 0;
    const visiblePlanned = showPlanned ? Number(totals.plannedPieces || 0) : 0;
    const outbound = Number(totals.outboundPieces || 0);
    const rework = Number(totals.reworkPieces || 0);
    return capacity
      + '<div class="cayan-ws-totals" aria-live="polite">'
      + '<span>出庫中 <strong>' + escapeHtml(String(outbound)) + '</strong>枚</span>'
      + '<span>予約 <strong>' + escapeHtml(String(visiblePlanned)) + '</strong>枚</span>'
      + (showReturned
        ? '<span>返却済 <strong>' + escapeHtml(String(visibleReturned)) + '</strong>枚</span>'
        : '')
      + (rework > 0
        ? '<span>再加工 <strong>' + escapeHtml(String(rework)) + '</strong>枚</span>'
        : '')
      + '</div>';
  };

  const planPanelHtml = () => {
    const master = selectedMaster();
    if (!selectedWasaiCode || !master) {
      return '';
    }
    if (!planAppId()) {
      return '<section class="cayan-ws-plan">'
        + '<h3 class="cayan-ws-plan-title">未出庫予定</h3>'
        + '<p class="cayan-ws-empty">' + escapeHtml(cfg().MESSAGES.planAppUnset) + '</p>'
        + '</section>';
    }
    const draft = draftPlan || {};
    const defaultReturn = draft.plannedReturnDate
      || selectedYmd
      || Engine.todayParts(new Date()).ymd;
    const isEdit = !!editingPlanId;
    return '<section class="cayan-ws-plan">'
      + '<h3 class="cayan-ws-plan-title">'
      + escapeHtml(isEdit ? cfg().MESSAGES.planEditMode : cfg().MESSAGES.planCreateMode)
      + '</h3>'
      + '<p class="cayan-ws-plan-note">登録元は事務所。将来の本人スマホ入力は source=本人 を使用します。取消は削除せず履歴として残します。</p>'
      + (planMessage
        ? '<p class="cayan-ws-message is-' + escapeHtml(planMessageKind || 'info') + '">'
          + escapeHtml(planMessage) + '</p>'
        : '')
      + '<div class="cayan-ws-plan-form">'
      + '<input type="hidden" id="cayan-ws-plan-id" value="' + escapeHtml(editingPlanId) + '" />'
      + '<label>管理番号 <input id="cayan-ws-plan-manage" type="text" value="'
      + escapeHtml(draft.manageNo || '') + '" /></label>'
      + '<label>品目 <input id="cayan-ws-plan-item" type="text" value="'
      + escapeHtml(draft.itemSummary || '') + '" /></label>'
      + '<label>枚数 <input id="cayan-ws-plan-pieces" type="number" min="1" step="1" value="'
      + escapeHtml(String(draft.pieceCount || 1)) + '" /></label>'
      + '<label>開始予定日 <input id="cayan-ws-plan-start" type="date" value="'
      + escapeHtml(draft.plannedStartDate || '') + '" /></label>'
      + '<label>返却予定日 <input id="cayan-ws-plan-return" type="date" value="'
      + escapeHtml(defaultReturn) + '" /></label>'
      + '<label>備考 <input id="cayan-ws-plan-notes" type="text" value="'
      + escapeHtml(draft.notes || '') + '" /></label>'
      + '<button type="button" class="cayan-ws-btn is-primary" id="cayan-ws-plan-save">'
      + (isEdit ? '予約を更新' : '予約を登録') + '</button>'
      + (isEdit
        ? '<button type="button" class="cayan-ws-btn" id="cayan-ws-plan-reset">新規登録に戻す</button>'
        : '')
      + '</div></section>';
  };

  const masterOptionsHtml = () => {
    if (!masters.length) {
      return '<option value="">（和裁士なし）</option>';
    }
    return '<option value="">和裁士を選択</option>'
      + masters.map((row) => (
        '<option value="' + escapeHtml(row.wasaiCode) + '"'
        + (row.wasaiCode === selectedWasaiCode ? ' selected' : '')
        + '>'
        + escapeHtml(row.wasaiCode + ' ' + row.wasaiName)
        + '</option>'
      )).join('');
  };

  const paint = () => {
    const root = document.getElementById(ROOT_ID);
    if (!root) {
      return;
    }

    const title = root.querySelector('#cayan-ws-title');
    const note = root.querySelector('#cayan-ws-message');
    const select = root.querySelector('#cayan-ws-wasai');
    const cal = root.querySelector('#cayan-ws-cal');
    const detail = root.querySelector('#cayan-ws-detail');
    const totals = root.querySelector('#cayan-ws-totals');
    const plan = root.querySelector('#cayan-ws-plan');
    const returnedToggle = root.querySelector('#cayan-ws-show-returned');
    const plannedToggle = root.querySelector('#cayan-ws-show-planned');

    title.textContent = Engine.monthBounds(viewYear, viewMonth).label;
    note.textContent = message;
    note.className = 'cayan-ws-message' + (messageKind ? ' is-' + messageKind : '');
    note.hidden = !message;

    if (select && select.innerHTML !== masterOptionsHtml()) {
      const prev = select.value;
      select.innerHTML = masterOptionsHtml();
      select.value = selectedWasaiCode || prev || '';
    }
    select.disabled = loading || masters.length === 0;

    if (returnedToggle) {
      returnedToggle.checked = showReturned;
      returnedToggle.disabled = loading || !selectedWasaiCode;
    }
    if (plannedToggle) {
      plannedToggle.checked = showPlanned;
      plannedToggle.disabled = loading || !selectedWasaiCode;
    }

    cal.innerHTML = loading || !selectedWasaiCode ? '' : calendarHtml();
    detail.innerHTML = loading ? '' : detailHtml();
    totals.innerHTML = loading ? '' : totalsHtml();
    if (plan) {
      plan.innerHTML = loading ? '' : planPanelHtml();
    }

    root.querySelectorAll('.cayan-ws-nav button').forEach((button) => {
      button.disabled = loading;
    });
  };

  const loadMasters = async (options) => {
    const opts = options || {};
    // 月切替・和裁士切替でも最新の月間処理可能枚数を拾う
    if (opts.force || !masters.length) {
      const fetched = await Engine.fetchAllPages(Engine.masterQuery(), fetchMasterPage);
      masters = Engine.normalizeMasters(fetched.records);
    }
    if (!masters.length) {
      message = cfg().MESSAGES.emptyMaster;
      messageKind = 'warn';
      return;
    }
    if (!selectedWasaiCode || !masters.some((row) => row.wasaiCode === selectedWasaiCode)) {
      selectedWasaiCode = masters[0].wasaiCode;
    }
  };

  const loadMonth = async (year, month, nextSelected) => {
    const ticket = requestSerial + 1;
    requestSerial = ticket;
    viewYear = year;
    viewMonth = month;
    selectedYmd = nextSelected || '';
    loading = true;
    message = cfg().MESSAGES.loading;
    messageKind = 'info';
    model = null;
    paint();

    try {
      await loadMasters({ force: true });

      if (ticket !== requestSerial) {
        return;
      }

      if (!selectedWasaiCode) {
        loading = false;
        message = cfg().MESSAGES.selectWasai;
        messageKind = 'info';
        paint();
        return;
      }

      const outboundFetched = await Engine.fetchAllPages(
        Engine.buildOutboundMonthQuery(selectedWasaiCode, year, month),
        fetchOutboundPage
      );

      if (ticket !== requestSerial) {
        return;
      }

      let inboundRecords = [];
      let inboundTruncated = false;
      try {
        const inboundFetched = await Engine.fetchAllPages(
          Engine.inboundMonthQuery(year, month),
          fetchInboundPage
        );
        inboundRecords = inboundFetched.records;
        inboundTruncated = inboundFetched.truncated;
      } catch (inboundError) {
        console.warn('[wasai_schedule] App78 参照をスキップ', inboundError);
      }

      let planRecords = [];
      let planTruncated = false;
      if (planAppId()) {
        try {
          const planFetched = await Engine.fetchAllPages(
            Engine.buildPlanMonthQuery(selectedWasaiCode, year, month),
            fetchPlanPage
          );
          planRecords = planFetched.records;
          planTruncated = planFetched.truncated;
        } catch (planError) {
          console.warn('[wasai_schedule] 予定 App 参照をスキップ', planError);
        }
      }

      if (ticket !== requestSerial) {
        return;
      }

      model = Engine.aggregateMonth(
        outboundFetched.records,
        inboundRecords,
        selectedWasaiCode,
        year,
        month,
        {
          includeReturned: true,
          planRecords: planRecords,
        }
      );

      loading = false;
      if (outboundFetched.truncated || inboundTruncated || planTruncated) {
        message = cfg().MESSAGES.truncated;
        messageKind = 'warn';
      } else {
        message = '';
        messageKind = '';
      }
      paint();
    } catch (error) {
      if (ticket !== requestSerial) {
        return;
      }
      console.error('[wasai_schedule]', error && error.code, error && error.message, error);
      loading = false;
      model = null;
      message = cfg().MESSAGES.failed;
      messageKind = 'error';
      paint();
    }
  };

  const shellHtml = () => (
    '<header class="cayan-ws-header">'
    + '<h1 class="cayan-ws-title">和裁士別仕事予定カレンダー</h1>'
    + '<p class="cayan-ws-lead">出庫済みの仕事を返却予定日で確認します（App74 正本・App78 で返却済を区別）。</p>'
    + '</header>'
    + '<div class="cayan-ws-toolbar">'
    + '<label class="cayan-ws-label" for="cayan-ws-wasai">和裁士</label>'
    + '<select id="cayan-ws-wasai" class="cayan-ws-select"></select>'
    + '<label class="cayan-ws-check">'
    + '<input type="checkbox" id="cayan-ws-show-returned" checked />'
    + '返却済を表示</label>'
    + '<label class="cayan-ws-check">'
    + '<input type="checkbox" id="cayan-ws-show-planned" checked />'
    + '予約を表示</label>'
    + '</div>'
    + '<div class="cayan-ws-nav">'
    + '<button type="button" class="cayan-ws-btn" id="cayan-ws-prev">＜ 前月</button>'
    + '<h2 class="cayan-ws-month" id="cayan-ws-title"></h2>'
    + '<button type="button" class="cayan-ws-btn" id="cayan-ws-next">翌月 ＞</button>'
    + '<button type="button" class="cayan-ws-btn is-primary" id="cayan-ws-today">今日</button>'
    + '</div>'
    + '<div id="cayan-ws-totals" class="cayan-ws-totals-wrap"></div>'
    + '<p class="cayan-ws-message" id="cayan-ws-message" hidden></p>'
    + '<div class="cayan-ws-cal-wrap"><div id="cayan-ws-cal"></div></div>'
    + '<section class="cayan-ws-detail" id="cayan-ws-detail"></section>'
    + '<div id="cayan-ws-plan"></div>'
  );

  const bind = (root) => {
    if (root.dataset.bound === '1') {
      return;
    }
    root.dataset.bound = '1';

    root.querySelector('#cayan-ws-prev').addEventListener('click', () => {
      const next = Engine.shiftMonth(viewYear, viewMonth, -1);
      loadMonth(next.year, next.month, '');
    });

    root.querySelector('#cayan-ws-next').addEventListener('click', () => {
      const next = Engine.shiftMonth(viewYear, viewMonth, 1);
      loadMonth(next.year, next.month, '');
    });

    root.querySelector('#cayan-ws-today').addEventListener('click', () => {
      const today = Engine.todayParts(new Date());
      loadMonth(today.year, today.month, today.ymd);
    });

    root.querySelector('#cayan-ws-wasai').addEventListener('change', (event) => {
      selectedWasaiCode = String(event.target.value || '').trim();
      selectedYmd = '';
      loadMonth(viewYear, viewMonth, '');
    });

    root.querySelector('#cayan-ws-show-returned').addEventListener('change', (event) => {
      showReturned = !!event.target.checked;
      paint();
    });

    root.querySelector('#cayan-ws-show-planned').addEventListener('change', (event) => {
      showPlanned = !!event.target.checked;
      paint();
    });

    root.querySelector('#cayan-ws-cal').addEventListener('click', (event) => {
      const button = event.target.closest('[data-ymd]');
      if (!button || loading) {
        return;
      }
      selectedYmd = button.getAttribute('data-ymd') || '';
      paint();
    });

    root.addEventListener('click', async (event) => {
      const editBtn = event.target.closest('[data-edit-plan]');
      if (editBtn) {
        beginEditPlan(editBtn.getAttribute('data-edit-plan'));
        return;
      }
      const cancelBtn = event.target.closest('[data-cancel-plan]');
      if (cancelBtn) {
        const planId = cancelBtn.getAttribute('data-cancel-plan');
        await cancelPlan(planId);
        return;
      }
      if (event.target && event.target.id === 'cayan-ws-plan-reset') {
        editingPlanId = '';
        draftPlan = null;
        planMessage = '';
        planMessageKind = '';
        paint();
        return;
      }
      if (event.target && event.target.id === 'cayan-ws-plan-save') {
        await savePlanFromForm(root);
      }
    });
  };

  const beginEditPlan = (planRecordId) => {
    const row = (model && model.items || []).find((item) => (
      item.source === 'plan' && String(item.planRecordId) === String(planRecordId)
    ));
    if (!row) {
      return;
    }
    editingPlanId = String(planRecordId);
    draftPlan = {
      manageNo: row.manageNo || '',
      itemSummary: row.itemSummary || '',
      pieceCount: row.pieceCount || 1,
      plannedStartDate: row.shipDate || '',
      plannedReturnDate: row.returnDate || '',
      notes: row.notes || '',
    };
    selectedYmd = row.calendarDate || selectedYmd;
    planMessage = '';
    planMessageKind = '';
    paint();
  };

  const savePlanFromForm = async (root) => {
    const appId = planAppId();
    const master = selectedMaster();
    if (!appId || !master) {
      planMessage = cfg().MESSAGES.planAppUnset;
      planMessageKind = 'warn';
      paint();
      return;
    }
    const planRecordId = String((root.querySelector('#cayan-ws-plan-id') || {}).value || editingPlanId || '').trim();
    const input = {
      planRecordId: planRecordId,
      wasaiCode: master.wasaiCode,
      wasaiName: master.wasaiName,
      manageNo: (root.querySelector('#cayan-ws-plan-manage') || {}).value,
      itemSummary: (root.querySelector('#cayan-ws-plan-item') || {}).value,
      pieceCount: (root.querySelector('#cayan-ws-plan-pieces') || {}).value,
      plannedStartDate: (root.querySelector('#cayan-ws-plan-start') || {}).value,
      plannedReturnDate: (root.querySelector('#cayan-ws-plan-return') || {}).value,
      planStatus: cfg().PLAN_STATUS.reserved,
      source: cfg().PLAN_SOURCE.office,
      notes: (root.querySelector('#cayan-ws-plan-notes') || {}).value,
    };

    let existing = [];
    try {
      existing = (await Engine.fetchAllPages(
        cfg().FIELDS.wasaiCode + ' = "' + Engine.escapeQueryValue(master.wasaiCode) + '"'
          + ' and ' + cfg().FIELDS.planStatus + ' in ("' + cfg().PLAN_STATUS.reserved + '")',
        fetchPlanPage
      )).records;
    } catch (error) {
      planMessage = cfg().MESSAGES.failed;
      planMessageKind = 'error';
      paint();
      return;
    }

    const validated = Engine.validatePlanInput(input, existing);
    if (!validated.ok) {
      planMessage = validated.errors.join(' / ');
      planMessageKind = 'error';
      paint();
      return;
    }

    try {
      if (planRecordId) {
        await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', {
          app: appId,
          id: planRecordId,
          record: Engine.buildPlanRecordPayload(input),
        });
        planMessage = cfg().MESSAGES.planUpdated;
      } else {
        await kintone.api(kintone.api.url('/k/v1/record.json', true), 'POST', {
          app: appId,
          record: Engine.buildPlanRecordPayload(input),
        });
        planMessage = cfg().MESSAGES.planSaved;
      }
      planMessageKind = 'info';
      editingPlanId = '';
      draftPlan = null;
      await loadMonth(viewYear, viewMonth, selectedYmd || input.plannedReturnDate);
    } catch (error) {
      console.error('[wasai_schedule] plan save', error);
      planMessage = cfg().MESSAGES.failed;
      planMessageKind = 'error';
      paint();
    }
  };

  const cancelPlan = async (planRecordId) => {
    const appId = planAppId();
    if (!appId || !planRecordId) {
      return;
    }
    try {
      await kintone.api(kintone.api.url('/k/v1/record.json', true), 'PUT', {
        app: appId,
        id: planRecordId,
        record: {
          [cfg().FIELDS.planStatus]: { value: cfg().PLAN_STATUS.cancelled },
        },
      });
      planMessage = cfg().MESSAGES.planCancelled;
      planMessageKind = 'info';
      await loadMonth(viewYear, viewMonth, selectedYmd);
    } catch (error) {
      console.error('[wasai_schedule] plan cancel', error);
      planMessage = cfg().MESSAGES.failed;
      planMessageKind = 'error';
      paint();
    }
  };

  const mount = () => {
    document.body.classList.add(BODY_CLASS);

    let root = document.getElementById(ROOT_ID);
    if (!root) {
      const header = kintone.app.getHeaderSpaceElement();
      const mountPoint = header || document.querySelector('.contents-gaia') || document.body;
      root = document.createElement('div');
      root.id = ROOT_ID;
      root.className = 'cayan-ws-root';
      root.innerHTML = shellHtml();
      mountPoint.insertBefore(root, mountPoint.firstChild);
    }

    bind(root);
    const today = Engine.todayParts(new Date());
    loadMonth(today.year, today.month, today.ymd);
  };

  kintone.events.on('app.record.index.show', (event) => {
    const hostId = resolveHostAppId();
    if (hostId === null || hostId === undefined || hostId === '') {
      console.warn('[wasai_schedule]', cfg().MESSAGES.hostUnset);
      return event;
    }
    if (kintone.app.getId() !== Number(hostId)) {
      return event;
    }
    mount();
    return event;
  });

  kintone.events.on('app.record.index.hide', (event) => {
    requestSerial += 1;
    document.body.classList.remove(BODY_CLASS);
    const root = document.getElementById(ROOT_ID);
    if (root) {
      root.remove();
    }
    model = null;
    selectedYmd = '';
    message = '';
    messageKind = '';
    loading = false;
    return event;
  });

}());
