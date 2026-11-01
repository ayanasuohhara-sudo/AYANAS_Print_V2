(function() {
  'use strict';

  /**
   * App97 店舗会計画面（一覧上にマウント）
   * バーコード / 顧客検索 → 複数選択一括入金 → 引き取り → 日次照合
   * 氏名のみでは入金対象を確定しない。本番 JS 反映は別途承認後。
   */

  const C = window.CAYANAS_StorePayment;
  const Engine = window.CAYANAS_StorePayment_Engine;
  const Api = window.CAYANAS_StorePayment_Api;

  if (!C || !Engine || !Api) {
    console.error('[store_payment_ui] config / engine / api を先に読み込んでください。');
    return;
  }

  const isS1App = () => {
    try {
      return Number(kintone.app.getId()) === Number(C.STORE_PAYMENT_APP_ID) && C.STORE_PAYMENT_APP_ID > 0;
    } catch (err) {
      return false;
    }
  };

  const state = {
    personalCustomerId: '',
    clientName: '',
    focusOrderRecordId: '',
    rows: [],
    selected: {},
    allocate: {},
    busy: false,
    transactionId: '',
    paymentMethod: C.PAYMENT_METHOD.cash,
    paymentTiming: C.PAYMENT_TIMING.pickup,
    posTransactionId: '',
    unpaidHandoverApproved: false,
    message: '',
    messageWarn: false,
    tab: 'account',
    reconcileDate: Engine.todayYmd(),
    smaregiAmount: '',
    reconcile: null,
  };

  const yen = (n) => Number(n || 0).toLocaleString('ja-JP');

  const setMessage = (text, isWarn) => {
    state.message = text || '';
    state.messageWarn = !!isWarn;
  };

  const selectedRows = () => state.rows.filter(function(row) {
    return state.selected[row.orderRecordId];
  });

  const ensureSelectionDefaults = () => {
    state.rows.forEach(function(row) {
      if (state.selected[row.orderRecordId] == null) {
        state.selected[row.orderRecordId] = row.orderRecordId === state.focusOrderRecordId && row.selectable;
      }
      if (state.allocate[row.orderRecordId] == null) {
        state.allocate[row.orderRecordId] = row.selectable ? row.balance : 0;
      }
      if (!row.selectable) {
        state.selected[row.orderRecordId] = false;
      }
    });
  };

  const buildDraftFromUi = () => {
    const rows = selectedRows().map(function(row) {
      return Object.assign({}, row, {
        allocateAmount: state.allocate[row.orderRecordId],
      });
    });
    const built = Engine.buildAllocationLinesFromSelection(rows, 'custom');
    return {
      personalCustomerId: state.personalCustomerId,
      clientNameSnapshot: state.clientName,
      transactionId: state.transactionId || Engine.createTransactionId(),
      paymentDate: Engine.todayYmd(),
      paymentAmount: built.paymentAmount,
      paymentMethod: state.paymentMethod,
      paymentTiming: state.paymentTiming,
      paymentChannel: C.PAYMENT_CHANNEL.store,
      posTransactionId: state.posTransactionId,
      recordKind: C.RECORD_KIND.payment,
      lines: built.lines,
    };
  };

  const render = () => {
    const root = document.getElementById(C.UI.rootId);
    if (!root) {
      return;
    }

    const selectableCount = state.rows.filter(function(r) { return r.selectable; }).length;
    const selected = selectedRows();
    const draftPreview = buildDraftFromUi();
    const totalAlloc = draftPreview.paymentAmount;

    let body = '';
    if (state.tab === 'account') {
      body = renderAccount(selectableCount, selected, totalAlloc);
    } else {
      body = renderReconcile();
    }

    root.innerHTML = ''
      + '<div class="stp-ui">'
      + '  <div class="stp-ui__head">'
      + '    <h2 class="stp-ui__title">店舗会計・入金（A550 / S1）</h2>'
      + '    <p class="stp-ui__lead">スマレジ会計後に S1 へ記録。個人顧客IDと App16 レコードIDで紐付けます。氏名のみでは確定しません。</p>'
      + '    <div class="stp-ui__tabs">'
      + '      <button type="button" class="stp-ui__tab' + (state.tab === 'account' ? ' is-active' : '') + '" data-tab="account">会計・引き取り</button>'
      + '      <button type="button" class="stp-ui__tab' + (state.tab === 'reconcile' ? ' is-active' : '') + '" data-tab="reconcile">日次入金照合</button>'
      + '    </div>'
      + '  </div>'
      + body
      + (state.message
        ? '<div class="stp-ui__msg' + (state.messageWarn ? ' stp-ui__msg--warn' : '') + '">' + escapeHtml(state.message) + '</div>'
        : '')
      + '</div>';

    bind(root);
  };

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const renderAccount = (selectableCount, selected, totalAlloc) => {
    const rowsHtml = state.rows.length === 0
      ? '<tr><td colspan="9" class="stp-ui__empty">バーコードまたは個人顧客IDで商品を読み込んでください。</td></tr>'
      : state.rows.map(function(row) {
        const disabled = !row.selectable;
        const checked = !!state.selected[row.orderRecordId];
        const focus = row.orderRecordId === state.focusOrderRecordId ? ' is-focus' : '';
        return '<tr class="stp-ui__row' + focus + (disabled ? ' is-disabled' : '') + '">'
          + '<td><input type="checkbox" data-select="' + escapeHtml(row.orderRecordId) + '"'
          + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '></td>'
          + '<td>' + escapeHtml(row.manageNo) + '</td>'
          + '<td>' + escapeHtml(row.kimonoType || row.itemNames || '') + '</td>'
          + '<td>' + escapeHtml(row.locationStatus) + '</td>'
          + '<td>' + escapeHtml(row.deliveryStatus) + '</td>'
          + '<td class="stp-ui__num">' + yen(row.billedInclusive) + '</td>'
          + '<td class="stp-ui__num">' + yen(row.paid) + '</td>'
          + '<td class="stp-ui__num">' + yen(row.balance) + '<div class="stp-ui__state">' + escapeHtml(row.state) + '</div></td>'
          + '<td><input type="number" class="stp-ui__alloc" data-alloc="' + escapeHtml(row.orderRecordId) + '"'
          + ' value="' + escapeHtml(state.allocate[row.orderRecordId] || 0) + '"'
          + (disabled || !checked ? ' disabled' : '') + ' min="0" step="1"></td>'
          + '</tr>';
      }).join('');

    return ''
      + '<div class="stp-ui__panel">'
      + '  <div class="stp-ui__search">'
      + '    <label class="stp-ui__field">バーコード / 管理番号'
      + '      <input type="text" id="stp-barcode" class="stp-ui__input" placeholder="スキャンまたは入力して Enter" autocomplete="off">'
      + '    </label>'
      + '    <label class="stp-ui__field">個人顧客ID'
      + '      <input type="text" id="stp-pcm-id" class="stp-ui__input" placeholder="P000001" value="' + escapeHtml(state.personalCustomerId) + '">'
      + '    </label>'
      + '    <label class="stp-ui__field">氏名（検索補助・確定には使わない）'
      + '      <input type="text" id="stp-pcm-name" class="stp-ui__input" placeholder="氏名 like 検索">'
      + '    </label>'
      + '    <div class="stp-ui__actions">'
      + '      <button type="button" class="stp-ui__btn" data-action="load-barcode">バーコード読込</button>'
      + '      <button type="button" class="stp-ui__btn" data-action="load-pcm">顧客ID読込</button>'
      + '      <button type="button" class="stp-ui__btn stp-ui__btn--ghost" data-action="search-pcm">氏名で候補検索</button>'
      + '    </div>'
      + '  </div>'
      + '  <div id="stp-pcm-hits" class="stp-ui__hits"></div>'
      + '  <div class="stp-ui__customer">'
      + (state.personalCustomerId
        ? '<strong>' + escapeHtml(state.personalCustomerId) + '</strong>　'
          + escapeHtml(state.clientName || '') + '　未精算 '
          + selectableCount + ' / 表示 ' + state.rows.length + ' 件'
        : '<span class="stp-ui__muted">顧客未選択</span>')
      + '  </div>'
      + '  <div class="stp-ui__table-wrap"><table class="stp-ui__table">'
      + '    <thead><tr>'
      + '      <th></th><th>管理番号</th><th>商品</th><th>場所</th><th>納品</th>'
      + '      <th>税込請求</th><th>入金済</th><th>残額</th><th>今回充当</th>'
      + '    </tr></thead>'
      + '    <tbody>' + rowsHtml + '</tbody>'
      + '  </table></div>'
      + '  <div class="stp-ui__pay">'
      + '    <label class="stp-ui__field">入金タイミング<select id="stp-timing" class="stp-ui__input">'
      + option(C.PAYMENT_TIMING.intake, '受付時', state.paymentTiming)
      + option(C.PAYMENT_TIMING.pickup, '引き取り時', state.paymentTiming)
      + option(C.PAYMENT_TIMING.other, 'その他', state.paymentTiming)
      + '    </select></label>'
      + '    <label class="stp-ui__field">入金方法<select id="stp-method" class="stp-ui__input">'
      + option(C.PAYMENT_METHOD.cash, '現金', state.paymentMethod)
      + option(C.PAYMENT_METHOD.card, 'クレジットカード', state.paymentMethod)
      + option(C.PAYMENT_METHOD.other, 'その他', state.paymentMethod)
      + '    </select></label>'
      + '    <label class="stp-ui__field">スマレジ取引番号（任意）'
      + '      <input type="text" id="stp-pos" class="stp-ui__input" value="' + escapeHtml(state.posTransactionId) + '">'
      + '    </label>'
      + '    <label class="stp-ui__check"><input type="checkbox" id="stp-unpaid"'
      + (state.unpaidHandoverApproved ? ' checked' : '') + '> 未収入金引き渡し承認（管理者）</label>'
      + '    <div class="stp-ui__total">選択 ' + selected.length + ' 件 / 充当合計 <strong>' + yen(totalAlloc) + '</strong> 円</div>'
      + '    <div class="stp-ui__actions">'
      + '      <button type="button" class="stp-ui__btn stp-ui__btn--primary" data-action="register"'
      + (state.busy || selected.length === 0 ? ' disabled' : '') + '>入金登録</button>'
      + '      <button type="button" class="stp-ui__btn" data-action="pickup"'
      + (state.busy || selected.length === 0 ? ' disabled' : '') + '>入金確認後に引き取り完了</button>'
      + '      <button type="button" class="stp-ui__btn stp-ui__btn--ghost" data-action="reload"'
      + (!state.personalCustomerId || state.busy ? ' disabled' : '') + '>再読込</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  };

  const option = (value, label, current) => (
    '<option value="' + escapeHtml(value) + '"'
    + (value === current ? ' selected' : '') + '>' + escapeHtml(label) + '</option>'
  );

  const renderReconcile = () => {
    const cmp = state.reconcile && state.reconcile.compare;
    const summary = state.reconcile && state.reconcile.summary;
    const rows = (summary && summary.rows) || [];
    return ''
      + '<div class="stp-ui__panel">'
      + '  <div class="stp-ui__search">'
      + '    <label class="stp-ui__field">照合日'
      + '      <input type="date" id="stp-recon-date" class="stp-ui__input" value="' + escapeHtml(state.reconcileDate) + '">'
      + '    </label>'
      + '    <label class="stp-ui__field">スマレジ売上合計（手入力）'
      + '      <input type="number" id="stp-smaregi" class="stp-ui__input" value="' + escapeHtml(state.smaregiAmount) + '" step="1">'
      + '    </label>'
      + '    <div class="stp-ui__actions">'
      + '      <button type="button" class="stp-ui__btn stp-ui__btn--primary" data-action="reconcile">照合する</button>'
      + '    </div>'
      + '  </div>'
      + (cmp
        ? '<div class="stp-ui__recon' + (cmp.matched ? ' is-ok' : ' is-ng') + '">'
          + 'S1 合計 ' + yen(cmp.s1Total) + ' 円（' + (summary ? summary.count : 0) + ' 件） / '
          + 'スマレジ ' + yen(cmp.smaregiTotal) + ' 円 / '
          + '差額 ' + yen(cmp.diff) + ' 円 — '
          + (cmp.matched ? '一致' : '不一致')
          + '</div>'
        : '<p class="stp-ui__muted">スマレジ API は未連携。日計表または CSV 合算値を手入力してください。</p>')
      + '  <div class="stp-ui__table-wrap"><table class="stp-ui__table">'
      + '    <thead><tr><th>入金番号</th><th>個人顧客ID</th><th>方法</th><th>スマレジ取引</th><th>金額</th></tr></thead>'
      + '    <tbody>'
      + (rows.length
        ? rows.map(function(r) {
          return '<tr><td>' + escapeHtml(r.storePaymentNo) + '</td><td>'
            + escapeHtml(r.personalCustomerId) + '</td><td>'
            + escapeHtml(r.paymentMethod) + '</td><td>'
            + escapeHtml(r.posTransactionId) + '</td><td class="stp-ui__num">'
            + yen(r.paymentAmount) + '</td></tr>';
        }).join('')
        : '<tr><td colspan="5" class="stp-ui__empty">データなし</td></tr>')
      + '    </tbody></table></div>'
      + '</div>';
  };

  const bind = (root) => {
    root.querySelectorAll('[data-tab]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        state.tab = btn.getAttribute('data-tab');
        setMessage('');
        render();
      });
    });

    const barcode = root.querySelector('#stp-barcode');
    if (barcode) {
      barcode.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          runLoadBarcode(barcode.value);
        }
      });
    }

    root.querySelectorAll('[data-action]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const action = btn.getAttribute('data-action');
        if (action === 'load-barcode') {
          runLoadBarcode((root.querySelector('#stp-barcode') || {}).value);
        } else if (action === 'load-pcm') {
          runLoadPcm((root.querySelector('#stp-pcm-id') || {}).value);
        } else if (action === 'search-pcm') {
          runSearchPcm(root);
        } else if (action === 'register') {
          runRegister();
        } else if (action === 'pickup') {
          runPickup();
        } else if (action === 'reload') {
          runLoadPcm(state.personalCustomerId);
        } else if (action === 'reconcile') {
          runReconcile(root);
        }
      });
    });

    root.querySelectorAll('[data-select]').forEach(function(el) {
      el.addEventListener('change', function() {
        const id = el.getAttribute('data-select');
        state.selected[id] = el.checked;
        render();
      });
    });

    root.querySelectorAll('[data-alloc]').forEach(function(el) {
      el.addEventListener('change', function() {
        const id = el.getAttribute('data-alloc');
        state.allocate[id] = Engine.toNumber(el.value);
      });
    });

    const timing = root.querySelector('#stp-timing');
    if (timing) {
      timing.addEventListener('change', function() { state.paymentTiming = timing.value; });
    }
    const method = root.querySelector('#stp-method');
    if (method) {
      method.addEventListener('change', function() { state.paymentMethod = method.value; });
    }
    const pos = root.querySelector('#stp-pos');
    if (pos) {
      pos.addEventListener('change', function() { state.posTransactionId = pos.value.trim(); });
    }
    const unpaid = root.querySelector('#stp-unpaid');
    if (unpaid) {
      unpaid.addEventListener('change', function() { state.unpaidHandoverApproved = unpaid.checked; });
    }
  };

  const withBusy = async (fn) => {
    if (state.busy) {
      return;
    }
    state.busy = true;
    render();
    try {
      await fn();
    } finally {
      state.busy = false;
      render();
    }
  };

  const applyLoadResult = (result) => {
    if (!result.ok) {
      setMessage(result.error || '読込に失敗しました。', true);
      return;
    }
    state.personalCustomerId = result.personalCustomerId;
    state.clientName = result.clientName || '';
    state.focusOrderRecordId = result.focusOrderRecordId || '';
    state.rows = result.rows || [];
    state.selected = {};
    state.allocate = {};
    state.transactionId = Engine.createTransactionId();
    ensureSelectionDefaults();
    setMessage(
      '読込完了: ' + state.rows.length + ' 件（入金可能 '
      + state.rows.filter(function(r) { return r.selectable; }).length + ' 件）',
      false
    );
  };

  const runLoadBarcode = (value) => withBusy(async () => {
    applyLoadResult(await Api.loadByBarcode(value));
  });

  const runLoadPcm = (value) => withBusy(async () => {
    applyLoadResult(await Api.loadByPersonalCustomerId(value));
  });

  const runSearchPcm = (root) => withBusy(async () => {
    const name = ((root.querySelector('#stp-pcm-name') || {}).value || '').trim();
    const id = ((root.querySelector('#stp-pcm-id') || {}).value || '').trim();
    if (!name && !id) {
      setMessage('氏名または個人顧客IDを入力してください（氏名だけでは入金確定しません）。', true);
      return;
    }
    const hits = await Api.searchPcm({ customerName: name, personalCustomerId: id });
    const host = document.getElementById('stp-pcm-hits');
    if (!host) {
      return;
    }
    if (!hits.length) {
      host.innerHTML = '<p class="stp-ui__muted">候補なし</p>';
      setMessage('PCM 候補なし', true);
      return;
    }
    host.innerHTML = '<ul class="stp-ui__hitlist">' + hits.map(function(rec) {
      const pid = Engine.readValue(rec, C.PCM_FIELDS.personalCustomerId);
      const nm = Engine.readValue(rec, C.PCM_FIELDS.customerName);
      return '<li><button type="button" class="stp-ui__hit" data-pid="' + escapeHtml(pid) + '">'
        + escapeHtml(pid) + '　' + escapeHtml(nm) + '</button></li>';
    }).join('') + '</ul>';
    host.querySelectorAll('[data-pid]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        runLoadPcm(btn.getAttribute('data-pid'));
      });
    });
    setMessage('候補から個人顧客IDを選択してください。', false);
  });

  const runRegister = () => withBusy(async () => {
    state.transactionId = state.transactionId || Engine.createTransactionId();
    const draft = buildDraftFromUi();
    draft.transactionId = state.transactionId;
    const validated = Engine.validatePaymentDraft(draft);
    if (!validated.ok) {
      setMessage(validated.errors.join('\n'), true);
      return;
    }
    const result = await Api.registerPayment(draft);
    if (!result.ok) {
      setMessage((result.errors || ['入金登録に失敗しました']).join('\n'), true);
      return;
    }
    setMessage(
      (result.idempotent ? '既に登録済み（冪等）: ' : '入金登録完了: ')
      + result.storePaymentNo,
      false
    );
    state.transactionId = Engine.createTransactionId();
    await applyLoadResult(await Api.loadByPersonalCustomerId(state.personalCustomerId));
  });

  const runPickup = () => withBusy(async () => {
    const targets = selectedRows();
    if (!targets.length) {
      setMessage('引き取り対象を選択してください。', true);
      return;
    }
    const errors = [];
    let okCount = 0;
    for (let i = 0; i < targets.length; i += 1) {
      const row = targets[i];
      const result = await Api.completePickup(row.orderRecordId, {
        unpaidHandoverApproved: state.unpaidHandoverApproved,
      });
      if (!result.ok) {
        errors.push(row.manageNo + ': ' + (result.error || '失敗'));
      } else {
        okCount += 1;
      }
    }
    if (errors.length) {
      setMessage('引き取り完了 ' + okCount + ' 件。失敗:\n' + errors.join('\n'), true);
    } else {
      setMessage('引き取り完了: ' + okCount + ' 件（delivery_status=納品済）。App92 納品待ち在庫からも除外されます。', false);
    }
    await applyLoadResult(await Api.loadByPersonalCustomerId(state.personalCustomerId));
  });

  const runReconcile = (root) => withBusy(async () => {
    state.reconcileDate = ((root.querySelector('#stp-recon-date') || {}).value || Engine.todayYmd());
    state.smaregiAmount = ((root.querySelector('#stp-smaregi') || {}).value || '');
    state.reconcile = await Api.loadDailyReconcile(state.reconcileDate, state.smaregiAmount);
    const cmp = state.reconcile.compare;
    setMessage(
      cmp.matched ? '日次照合: 一致' : '日次照合: 差額 ' + yen(cmp.diff) + ' 円',
      !cmp.matched
    );
  });

  kintone.events.on('app.record.index.show', function(event) {
    if (!isS1App()) {
      return event;
    }
    let root = document.getElementById(C.UI.rootId);
    if (!root) {
      root = document.createElement('div');
      root.id = C.UI.rootId;
      const header = document.querySelector('.gaia-argoui-app-index-toolbox')
        || document.querySelector('#header-menu-component')
        || document.querySelector('.contents-actionmenu-gaia')
        || document.body;
      header.parentNode.insertBefore(root, header.nextSibling);
    }
    state.transactionId = state.transactionId || Engine.createTransactionId();
    render();
    return event;
  });
}());
