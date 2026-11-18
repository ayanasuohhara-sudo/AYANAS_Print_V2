(function() {
  'use strict';

  /**
   * App16 × PCM — A550 時のみ個人顧客検索・選択 UI
   * 読込順: order_pcm_config → order_pcm_engine → 本ファイル → order_pcm.css
   * saiban / order_customer_search は変更しない（イベント競合に注意）。
   */

  const C = window.CAYANAS_OrderPcm;
  const Engine = window.CAYANAS_OrderPcm_Engine;

  if (!C || !Engine) {
    console.error('[order_pcm_desktop] order_pcm_config / order_pcm_engine を先に読み込んでください。');
    return;
  }

  const OF = C.ORDER_FIELDS;
  const PF = C.PCM_FIELDS;
  const UI = C.UI;

  /** 選択時点の氏名（手動変更検知用。submit 時は PCM 再取得も併用） */
  let selectedNameSnapshot = '';
  let emptyEditWarned = false;

  const isOrderApp = () => {
    try {
      return Number(kintone.app.getId()) === Number(C.ORDER_APP_ID);
    } catch (err) {
      return false;
    }
  };

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const getCustomerCode = (record) => Engine.readValue(record, OF.customerCode);

  const lockPersonalIdField = () => {
    try {
      const el = kintone.app.record.getFieldElement(OF.personalCustomerId);
      if (!el) {
        return;
      }
      el.querySelectorAll('input, textarea').forEach(function(input) {
        input.disabled = true;
        input.readOnly = true;
      });
    } catch (err) {
      // ignore
    }
  };

  const setSelectedBanner = (personalId, name) => {
    const box = document.getElementById(UI.selectedId);
    if (!box) {
      return;
    }
    if (!personalId) {
      box.textContent = '個人顧客未選択';
      box.className = 'order-pcm-selected order-pcm-selected--empty';
      return;
    }
    box.textContent = '選択中: ' + personalId + ' / ' + (name || '(氏名なし)');
    box.className = 'order-pcm-selected order-pcm-selected--ok';
  };

  const applyPersonalCustomer = (pcmRecord) => {
    const snap = kintone.app.record.get();
    if (!snap || !snap.record) {
      return;
    }
    const record = snap.record;
    if (!record[OF.personalCustomerId]) {
      window.alert('personal_customer_id フィールドがありません。フォーム設定を確認してください。');
      return;
    }

    const id = Engine.readValue(pcmRecord, PF.personalCustomerId);
    const name = Engine.readValue(pcmRecord, PF.customerName);

    record[OF.personalCustomerId].value = id;
    record[OF.personalCustomerId].disabled = true;
    if (record[OF.clientName]) {
      record[OF.clientName].value = name;
    }

    selectedNameSnapshot = name;
    kintone.app.record.set({ record: record });
    setSelectedBanner(id, name);
    setTimeout(lockPersonalIdField, 50);
  };

  const clearPersonalCustomer = (record) => {
    if (record && record[OF.personalCustomerId]) {
      record[OF.personalCustomerId].value = '';
      record[OF.personalCustomerId].disabled = true;
    }
    selectedNameSnapshot = '';
    setSelectedBanner('', '');
  };

  const hidePanel = () => {
    const panel = document.getElementById(UI.panelId);
    if (panel) {
      panel.hidden = true;
    }
  };

  const showPanel = () => {
    const panel = document.getElementById(UI.panelId);
    if (panel) {
      panel.hidden = false;
    }
  };

  const findMountAnchor = () => {
    for (let i = 0; i < C.SPACE_IDS.length; i += 1) {
      try {
        const space = kintone.app.record.getSpaceElement(C.SPACE_IDS[i]);
        if (space) {
          return { el: space, mode: 'space' };
        }
      } catch (err) {
        // continue
      }
    }

    try {
      const codeEl = kintone.app.record.getFieldElement(OF.customerCode);
      const control = codeEl && (codeEl.closest('.control-gaia') || codeEl.parentElement);
      if (control) {
        return { el: control, mode: 'before' };
      }
    } catch (err) {
      // ignore
    }

    try {
      const clientEl = kintone.app.record.getFieldElement(OF.clientName);
      const control = clientEl && (clientEl.closest('.control-gaia') || clientEl.parentElement);
      if (control) {
        return { el: control, mode: 'before' };
      }
    } catch (err) {
      // ignore
    }

    return null;
  };

  const runSearch = async () => {
    const status = document.getElementById(UI.statusId);
    const results = document.getElementById(UI.resultsId);
    if (!status || !results) {
      return;
    }

    const criteria = {
      personalCustomerId: (document.getElementById('order-pcm-q-id') || {}).value || '',
      customerName: (document.getElementById('order-pcm-q-name') || {}).value || '',
      customerKana: (document.getElementById('order-pcm-q-kana') || {}).value || '',
      phone: (document.getElementById('order-pcm-q-phone') || {}).value || '',
    };

    status.className = 'order-pcm-status';
    status.textContent = '検索中…';
    results.innerHTML = '';

    if (!criteria.personalCustomerId && !criteria.customerName && !criteria.customerKana && !criteria.phone) {
      status.textContent = '氏名・ふりがな・電話・個人顧客IDのいずれかを入力してください。';
      return;
    }

    try {
      const records = await Engine.searchPersonalCustomers(criteria);
      if (records.length === 0) {
        status.innerHTML = '該当なし。PCMに未登録の場合は「PCMで新規登録」から追加し、この画面で再検索してください。';
        return;
      }

      status.textContent = records.length + ' 件。同姓同名は ID・電話を確認して選択してください（自動確定しません）。';

      const table = document.createElement('table');
      table.className = 'order-pcm-results-table';
      table.innerHTML = '<thead><tr>'
        + '<th>個人顧客ID</th><th>氏名</th><th>ふりがな</th><th>電話</th><th>携帯</th><th></th>'
        + '</tr></thead>';
      const tbody = document.createElement('tbody');

      records.forEach(function(rec) {
        const tr = document.createElement('tr');
        const id = Engine.readValue(rec, PF.personalCustomerId);
        tr.innerHTML = ''
          + '<td>' + escapeHtml(id) + '</td>'
          + '<td>' + escapeHtml(Engine.readValue(rec, PF.customerName)) + '</td>'
          + '<td>' + escapeHtml(Engine.readValue(rec, PF.customerKana)) + '</td>'
          + '<td>' + escapeHtml(Engine.readValue(rec, PF.phone)) + '</td>'
          + '<td>' + escapeHtml(Engine.readValue(rec, PF.mobilePhone)) + '</td>'
          + '<td><button type="button" class="order-pcm-select-btn" data-id="' + escapeHtml(id) + '">選択</button></td>';
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      results.appendChild(table);

      results.querySelectorAll('.order-pcm-select-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          const id = String(btn.getAttribute('data-id') || '').trim();
          const selected = records.find(function(r) {
            return Engine.readValue(r, PF.personalCustomerId) === id;
          });
          if (selected) {
            applyPersonalCustomer(selected);
          }
        });
      });

      /* ID 完全一致かつ1件のみのときだけ自動選択を提案（氏名キーワードでは自動確定しない） */
      if (
        records.length === 1
        && Engine.isValidPersonalCustomerId(String(criteria.personalCustomerId || '').trim())
        && Engine.readValue(records[0], PF.personalCustomerId) === String(criteria.personalCustomerId).trim()
      ) {
        /* 候補表示のみ。Enter ハンドラ側で選択可 */
      }
    } catch (err) {
      status.className = 'order-pcm-status order-pcm-status--error';
      status.textContent = '検索に失敗しました: ' + (err && err.message ? err.message : String(err));
    }
  };

  const openPcmCreateTab = () => {
    const url = '/k/' + C.PCM_APP_ID + '/edit';
    window.open(url, '_blank', 'noopener,noreferrer');
    const status = document.getElementById(UI.statusId);
    if (status) {
      status.className = 'order-pcm-status';
      status.textContent = 'PCM新規画面を別タブで開きました。登録後、この画面で氏名や電話を再検索して選択してください。';
    }
  };

  const mountPanel = (record) => {
    if (document.getElementById(UI.panelId)) {
      syncPanelVisibility(record);
      return;
    }

    const anchor = findMountAnchor();
    if (!anchor) {
      console.warn('[order_pcm_desktop] 設置位置が見つかりません。');
      return;
    }

    const panel = document.createElement('div');
    panel.id = UI.panelId;
    panel.className = 'order-pcm-panel';
    panel.innerHTML = ''
      + '<p class="order-pcm-panel__title">店舗個人顧客（PCM）</p>'
      + '<p class="order-pcm-panel__note">customer_code = A550 のときのみ使用します。氏名だけでは自動特定しません。</p>'
      + '<div id="' + UI.selectedId + '" class="order-pcm-selected order-pcm-selected--empty">個人顧客未選択</div>'
      + '<div class="order-pcm-panel__grid">'
      + '  <div><label for="order-pcm-q-id">個人顧客ID</label><input id="order-pcm-q-id" type="text" autocomplete="off" placeholder="P000001"></div>'
      + '  <div><label for="order-pcm-q-name">氏名</label><input id="order-pcm-q-name" type="text" autocomplete="off"></div>'
      + '  <div><label for="order-pcm-q-kana">ふりがな</label><input id="order-pcm-q-kana" type="text" autocomplete="off"></div>'
      + '  <div><label for="order-pcm-q-phone">電話（固定/携帯）</label><input id="order-pcm-q-phone" type="text" autocomplete="off"></div>'
      + '</div>'
      + '<div class="order-pcm-panel__actions">'
      + '  <button type="button" class="order-pcm-btn order-pcm-btn--primary" id="order-pcm-search-btn">検索</button>'
      + '  <button type="button" class="order-pcm-btn" id="order-pcm-clear-btn">条件クリア</button>'
      + '  <button type="button" class="order-pcm-btn" id="order-pcm-new-btn">PCMで新規登録（別タブ）</button>'
      + '  <button type="button" class="order-pcm-btn" id="order-pcm-research-btn">再検索</button>'
      + '</div>'
      + '<div id="' + UI.statusId + '" class="order-pcm-status"></div>'
      + '<div id="' + UI.resultsId + '" class="order-pcm-results"></div>';

    if (anchor.mode === 'space') {
      anchor.el.appendChild(panel);
    } else {
      anchor.el.parentElement.insertBefore(panel, anchor.el);
    }

    document.getElementById('order-pcm-search-btn').addEventListener('click', runSearch);
    document.getElementById('order-pcm-research-btn').addEventListener('click', runSearch);
    document.getElementById('order-pcm-new-btn').addEventListener('click', openPcmCreateTab);
    document.getElementById('order-pcm-clear-btn').addEventListener('click', function() {
      ['order-pcm-q-id', 'order-pcm-q-name', 'order-pcm-q-kana', 'order-pcm-q-phone'].forEach(function(id) {
        const el = document.getElementById(id);
        if (el) {
          el.value = '';
        }
      });
      const status = document.getElementById(UI.statusId);
      const results = document.getElementById(UI.resultsId);
      if (status) {
        status.textContent = '';
      }
      if (results) {
        results.innerHTML = '';
      }
    });

    panel.querySelectorAll('input').forEach(function(input) {
      input.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          runSearch();
        }
      });
    });

    syncPanelVisibility(record);
  };

  const syncPanelVisibility = (record) => {
    const store = Engine.isStoreCustomerCode(getCustomerCode(record));
    if (store) {
      showPanel();
      const id = Engine.readValue(record, OF.personalCustomerId);
      const name = Engine.readValue(record, OF.clientName);
      if (id) {
        selectedNameSnapshot = selectedNameSnapshot || name;
        setSelectedBanner(id, name);
      } else {
        setSelectedBanner('', '');
      }
      setTimeout(lockPersonalIdField, 100);
    } else {
      hidePanel();
    }
  };

  const onShow = (event) => {
    if (!isOrderApp()) {
      return event;
    }

    emptyEditWarned = false;
    const record = event.record;
    const store = Engine.isStoreCustomerCode(getCustomerCode(record));

    if (record[OF.personalCustomerId]) {
      record[OF.personalCustomerId].disabled = true;
    }

    if (store) {
      const id = Engine.readValue(record, OF.personalCustomerId);
      selectedNameSnapshot = id ? Engine.readValue(record, OF.clientName) : '';

      if (event.type.indexOf('edit') >= 0 && !id) {
        emptyEditWarned = true;
        setTimeout(function() {
          window.alert(
            'この受注には個人顧客IDが未設定です（既存データ）。\n'
            + '保存は可能ですが、PCMから顧客を選択することを推奨します。'
          );
        }, 400);
      }
    } else {
      selectedNameSnapshot = '';
    }

    setTimeout(function() {
      mountPanel(record);
    }, 320);

    return event;
  };

  const onCustomerCodeChange = (event) => {
    if (!isOrderApp()) {
      return event;
    }

    const record = event.record;
    const store = Engine.isStoreCustomerCode(getCustomerCode(record));

    if (!store) {
      clearPersonalCustomer(record);
      hidePanel();
    } else {
      if (record[OF.personalCustomerId]) {
        record[OF.personalCustomerId].disabled = true;
      }
      setTimeout(function() {
        mountPanel(record);
        showPanel();
        lockPersonalIdField();
      }, 100);
    }

    return event;
  };

  const onSubmit = async (event) => {
    if (!isOrderApp()) {
      return event;
    }

    const mode = event.type.indexOf('create') >= 0 ? 'create' : 'edit';
    const record = event.record;
    const store = Engine.isStoreCustomerCode(getCustomerCode(record));

    if (!store) {
      return event;
    }

    if (record[OF.personalCustomerId]) {
      record[OF.personalCustomerId].disabled = true;
    }

    const result = await Engine.validateStoreOrderPersonalCustomer(record, mode);
    if (!result.ok) {
      event.error = result.error || '個人顧客の検証に失敗しました。';
      return event;
    }

    if (result.warnEmptyOnEdit && !emptyEditWarned) {
      const cont = window.confirm(
        '個人顧客IDが未設定の既存店舗受注です。このまま保存しますか？\n'
        + '（PCMから選択すると履歴連携できます）'
      );
      if (!cont) {
        event.error = '保存を中止しました。個人顧客を選択するか、内容を確認してください。';
        return event;
      }
    }

    if (result.warnMismatch) {
      const m = result.warnMismatch;
      const cont = window.confirm(
        '個人顧客IDとお客様名が一致しません。\n\n'
        + '個人顧客ID: ' + m.personalCustomerId + '\n'
        + 'PCM上の氏名: ' + m.pcmName + '\n'
        + '受注のお客様名: ' + m.clientName + '\n\n'
        + 'このまま保存する場合は「OK」。\n'
        + '再選択する場合は「キャンセル」してください。\n'
        + '（PCM側の氏名変更で過去受注は自動更新しません）'
      );
      if (!cont) {
        event.error = '個人顧客を再選択するか、お客様名を確認してください。';
        return event;
      }
    } else if (
      selectedNameSnapshot
      && Engine.readValue(record, OF.clientName)
      && selectedNameSnapshot !== Engine.readValue(record, OF.clientName)
      && Engine.readValue(record, OF.personalCustomerId)
    ) {
      const cont = window.confirm(
        '選択後にお客様名が変更されています。\n\n'
        + '選択時の氏名: ' + selectedNameSnapshot + '\n'
        + '現在のお客様名: ' + Engine.readValue(record, OF.clientName) + '\n\n'
        + 'このまま保存しますか？'
      );
      if (!cont) {
        event.error = 'お客様名を確認するか、個人顧客を再選択してください。';
        return event;
      }
    }

    return event;
  };

  kintone.events.on([
    'app.record.create.show',
    'app.record.edit.show',
  ], onShow);

  kintone.events.on([
    'app.record.create.change.' + OF.customerCode,
    'app.record.edit.change.' + OF.customerCode,
  ], onCustomerCodeChange);

  kintone.events.on([
    'app.record.create.submit',
    'app.record.edit.submit',
  ], onSubmit);

  /* 詳細表示: 店舗時のみ選択内容の注記（読取） */
  kintone.events.on('app.record.detail.show', function(event) {
    if (!isOrderApp()) {
      return event;
    }
    const record = event.record;
    if (!Engine.isStoreCustomerCode(getCustomerCode(record))) {
      return event;
    }
    const id = Engine.readValue(record, OF.personalCustomerId);
    setTimeout(function() {
      const host = document.querySelector('.record-gaia') || document.body;
      if (document.getElementById('order-pcm-detail-banner')) {
        return;
      }
      const bar = document.createElement('div');
      bar.id = 'order-pcm-detail-banner';
      bar.className = 'order-pcm-detail-banner';
      bar.textContent = id
        ? ('個人顧客ID: ' + id + '（PCMマスタの氏名変更は本受注のお客様名へ自動反映しません）')
        : '個人顧客ID未設定の店舗受注です。編集画面からPCM選択を推奨します。';
      host.insertAdjacentElement('afterbegin', bar);
    }, 200);
    return event;
  });
}());
