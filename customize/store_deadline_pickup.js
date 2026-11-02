(function () {
  'use strict';

  /**
   * App92 バーコード引き取りパネル
   * 依存: store_deadline_config, store_payment_config/engine, store_pickup_shared/api
   */

  const PANEL_ID = 'cayan-sd-pickup-panel';

  const cfg = () => window.CAYANAS_STORE_DEADLINE;

  if (typeof kintone === 'undefined') {
    return;
  }

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const yen = (n) => {
    const v = Math.round(Number(n) || 0);
    return v.toLocaleString('ja-JP');
  };

  const hasDeps = () => !!(
    window.CAYANAS_StorePickup
    && window.CAYANAS_StorePickup_Api
    && window.CAYANAS_StorePayment
    && window.CAYANAS_StorePayment_Engine
  );

  const isPickupAllowedUser = () => {
    const allowed = cfg() && cfg().PICKUP_ALLOWED_LOGIN_CODES;
    // null/undefined = 一般公開（全ユーザー許可）
    if (allowed == null) {
      return true;
    }
    if (!Array.isArray(allowed) || allowed.length === 0) {
      return false;
    }
    const login = (typeof kintone !== 'undefined' && kintone.getLoginUser)
      ? kintone.getLoginUser()
      : null;
    const code = login && login.code ? String(login.code) : '';
    return allowed.indexOf(code) !== -1;
  };

  const state = {
    cart: { items: [] },
    busy: false,
    message: '',
    messageWarn: false,
    clientName: '',
    personalCustomerId: '',
  };

  const setMessage = (text, warn) => {
    state.message = text || '';
    state.messageWarn = !!warn;
  };

  const paint = () => {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) {
      return;
    }

    if (!hasDeps()) {
      panel.innerHTML = (
        '<div class="cayan-sd-pickup">'
        + '<h2 class="cayan-sd-pickup__title">バーコード引き取り</h2>'
        + '<p class="cayan-sd-pickup__warn">'
        + escapeHtml(cfg().MESSAGES.pickupNeedShared)
        + '</p></div>'
      );
      return;
    }

    if (!isPickupAllowedUser()) {
      panel.innerHTML = (
        '<div class="cayan-sd-pickup">'
        + '<h2 class="cayan-sd-pickup__title">バーコード引き取り</h2>'
        + '<p class="cayan-sd-pickup__warn">'
        + escapeHtml(cfg().MESSAGES.pickupDenied || '検証ユーザーのみ利用できます。')
        + '</p></div>'
      );
      return;
    }

    const items = state.cart.items;
    const anyUnpaid = items.some((row) => row.guideToApp97 || !row.paid);
    const canComplete = items.length > 0
      && items.every((row) => row.canComplete)
      && !state.busy;

    const rows = items.length === 0
      ? '<tr><td colspan="8">（未読取）</td></tr>'
      : items.map((row) => (
        '<tr>'
        + '<td>' + escapeHtml(row.manageNo) + '</td>'
        + '<td>' + escapeHtml(row.clientName) + '</td>'
        + '<td>' + escapeHtml(row.productName || row.kimonoType || '—') + '</td>'
        + '<td>' + escapeHtml(row.kimonoType || '—') + '</td>'
        + '<td>' + escapeHtml(row.itemNames || '—') + '</td>'
        + '<td>' + escapeHtml(row.paymentState || '—') + '</td>'
        + '<td class="cayan-sd-pickup__num">' + yen(row.unpaidBalance != null
          ? row.unpaidBalance
          : (row.balance && row.balance.balance)) + '</td>'
        + '<td><button type="button" class="cayan-sd-btn cayan-sd-pickup__remove" data-id="'
        + escapeHtml(row.orderRecordId) + '">削除</button></td>'
        + '</tr>'
      )).join('');

    panel.innerHTML = (
      '<div class="cayan-sd-pickup">'
      + '<h2 class="cayan-sd-pickup__title">バーコード引き取り</h2>'
      + '<p class="cayan-sd-pickup__lead">'
      + escapeHtml(cfg().MESSAGES.pickupLead)
      + '</p>'
      + '<div class="cayan-sd-pickup__scan">'
      + '<label class="cayan-sd-pickup__label" for="cayan-sd-pickup-input">管理番号</label>'
      + '<input type="text" id="cayan-sd-pickup-input" class="cayan-sd-pickup__input"'
      + ' autocomplete="off" inputmode="none"'
      + (state.busy ? ' disabled' : '') + '>'
      + '<button type="button" class="cayan-sd-btn is-primary" id="cayan-sd-pickup-add"'
      + (state.busy ? ' disabled' : '') + '>読取追加</button>'
      + '<button type="button" class="cayan-sd-btn" id="cayan-sd-pickup-clear"'
      + (state.busy || items.length === 0 ? ' disabled' : '') + '>カートクリア</button>'
      + '</div>'
      + (state.personalCustomerId
        ? '<p class="cayan-sd-pickup__customer">お客様: <strong>'
          + escapeHtml(state.clientName || '—')
          + '</strong> / PCM '
          + escapeHtml(state.personalCustomerId)
          + '</p>'
        : '')
      + (anyUnpaid
        ? '<p class="cayan-sd-pickup__guide">'
          + escapeHtml(cfg().MESSAGES.pickupGuideApp97)
          + '</p>'
        : '')
      + '<div class="cayan-sd-pickup__table-wrap"><table class="cayan-sd-pickup__table">'
      + '<thead><tr>'
      + '<th>管理番号</th><th>お客様氏名</th><th>商品名</th><th>着物種類名</th>'
      + '<th>加工内容</th><th>入金状況</th><th>未入金残額</th><th></th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<div class="cayan-sd-pickup__actions">'
      + '<button type="button" class="cayan-sd-btn is-primary" id="cayan-sd-pickup-complete"'
      + (canComplete ? '' : ' disabled') + '>引き取り完了</button>'
      + '<span class="cayan-sd-pickup__count">' + items.length + ' 件</span>'
      + '</div>'
      + (state.message
        ? '<p class="cayan-sd-pickup__msg' + (state.messageWarn ? ' is-warn' : '') + '">'
          + escapeHtml(state.message) + '</p>'
        : '')
      + '</div>'
    );

    bindPanel(panel);
  };

  const focusInput = () => {
    const input = document.getElementById('cayan-sd-pickup-input');
    if (!input) {
      return;
    }
    input.value = '';
    window.setTimeout(() => {
      input.focus();
      if (typeof input.select === 'function') {
        input.select();
      }
    }, 0);
  };

  const addBarcode = async (raw) => {
    if (!hasDeps() || state.busy) {
      return;
    }
    const Api = window.CAYANAS_StorePickup_Api;
    const P = window.CAYANAS_StorePickup;
    const code = window.CAYANAS_StorePayment_Engine.normalizeBarcode(raw);
    if (!code) {
      setMessage('管理番号を入力してください。', true);
      paint();
      return;
    }

    state.busy = true;
    setMessage('読取中…', false);
    paint();

    try {
      const result = await Api.loadPickupByBarcode(code);
      if (!result.ok) {
        setMessage(result.error || '読取に失敗しました。', true);
        return;
      }

      const candidate = result.candidate;
      const cartCheck = P.canAddToPickupCart(state.cart, candidate);
      if (!cartCheck.ok) {
        setMessage(cartCheck.reason, true);
        return;
      }

      state.cart.items.push(candidate);
      state.personalCustomerId = result.personalCustomerId;
      state.clientName = result.clientName || candidate.clientName;

      if (candidate.guideToApp97) {
        setMessage(
          candidate.manageNo + ': '
          + (cfg().MESSAGES.pickupUnpaid || '未入金です。App97で入金してください。'),
          true
        );
      } else if (!candidate.canComplete) {
        setMessage(
          candidate.manageNo + ': '
          + ((candidate.pickupGate && candidate.pickupGate.reason) || '引き取り条件を満たしません。'),
          true
        );
      } else {
        setMessage(candidate.manageNo + ' を追加しました。', false);
      }
    } catch (err) {
      console.error('[store_deadline_pickup] add', err);
      setMessage(err && err.message ? err.message : String(err), true);
    } finally {
      state.busy = false;
      paint();
      focusInput();
    }
  };

  const removeItem = (orderRecordId) => {
    state.cart.items = state.cart.items.filter(
      (row) => String(row.orderRecordId) !== String(orderRecordId)
    );
    if (state.cart.items.length === 0) {
      state.personalCustomerId = '';
      state.clientName = '';
    }
    setMessage('', false);
    paint();
  };

  const clearCart = () => {
    state.cart.items = [];
    state.personalCustomerId = '';
    state.clientName = '';
    setMessage('', false);
    paint();
    focusInput();
  };

  const completePickup = async () => {
    if (!hasDeps() || state.busy) {
      return;
    }
    const items = state.cart.items.slice();
    if (!items.length) {
      setMessage(cfg().MESSAGES.pickupEmpty, true);
      paint();
      return;
    }
    if (items.some((row) => !row.canComplete)) {
      setMessage(cfg().MESSAGES.pickupUnpaid, true);
      paint();
      return;
    }
    if (!window.confirm(items.length + ' 件を引き取り完了（納品済）にします。よろしいですか？')) {
      return;
    }

    state.busy = true;
    setMessage('更新中…', false);
    paint();

    const Api = window.CAYANAS_StorePickup_Api;
    const errors = [];
    let okCount = 0;

    for (let i = 0; i < items.length; i += 1) {
      const row = items[i];
      try {
        const result = await Api.completePickup(row.orderRecordId, {
          unpaidHandoverApproved: false,
          expectedPersonalCustomerId: state.personalCustomerId,
        });
        if (!result.ok) {
          errors.push(row.manageNo + ': ' + (result.error || '失敗'));
        } else {
          okCount += 1;
        }
      } catch (err) {
        errors.push(row.manageNo + ': ' + (err && err.message ? err.message : String(err)));
      }
    }

    state.busy = false;
    if (errors.length) {
      setMessage(
        '完了 ' + okCount + ' 件。失敗:\n' + errors.join('\n'),
        true
      );
      // 成功分をカートから除外
      const failedNos = new Set(errors.map((line) => String(line.split(':')[0])));
      state.cart.items = state.cart.items.filter((row) => failedNos.has(row.manageNo));
    } else {
      setMessage(cfg().MESSAGES.pickupDone + '（' + okCount + ' 件）', false);
      state.cart.items = [];
      state.personalCustomerId = '';
      state.clientName = '';
    }
    paint();
    focusInput();
    // 引き取り待ち在庫 KPI を再読込
    if (okCount > 0
      && window.CAYANAS_StoreDeadlineDesktop
      && typeof window.CAYANAS_StoreDeadlineDesktop.reloadCurrent === 'function') {
      window.CAYANAS_StoreDeadlineDesktop.reloadCurrent({ preferKpi: 'waitingStock' });
    }
  };

  const bindPanel = (panel) => {
    const input = panel.querySelector('#cayan-sd-pickup-input');
    const addBtn = panel.querySelector('#cayan-sd-pickup-add');
    const clearBtn = panel.querySelector('#cayan-sd-pickup-clear');
    const completeBtn = panel.querySelector('#cayan-sd-pickup-complete');

    if (addBtn) {
      addBtn.addEventListener('click', () => addBarcode(input && input.value));
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', clearCart);
    }
    if (completeBtn) {
      completeBtn.addEventListener('click', completePickup);
    }
    if (input) {
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== 'NumpadEnter' && event.keyCode !== 13) {
          return;
        }
        event.preventDefault();
        addBarcode(input.value);
      });
    }
    panel.querySelectorAll('.cayan-sd-pickup__remove').forEach((btn) => {
      btn.addEventListener('click', () => removeItem(btn.getAttribute('data-id')));
    });
  };

  const ensurePanel = (root) => {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      panel.className = 'cayan-sd-pickup-wrap';
      const header = root.querySelector('.cayan-sd-header');
      if (header && header.nextSibling) {
        root.insertBefore(panel, header.nextSibling);
      } else {
        root.insertBefore(panel, root.firstChild);
      }
    }
    paint();
  };

  const mountInto = (root) => {
    if (!root) {
      return;
    }
    ensurePanel(root);
  };

  kintone.events.on('app.record.index.show', (event) => {
    if (!cfg() || Number(kintone.app.getId()) !== Number(cfg().STORE_DEADLINE_APP_ID)) {
      return event;
    }
    window.setTimeout(() => {
      const root = document.getElementById('ayanas-store-deadline-root');
      if (root) {
        mountInto(root);
      }
    }, 0);
    return event;
  });

  window.CAYANAS_StoreDeadlinePickup = {
    mountInto: mountInto,
    paint: paint,
    clearCart: clearCart,
  };
}());
