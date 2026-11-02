(function() {
  'use strict';

  /**
   * PCM 画面 — 採番・複製対策・類似候補・一覧検索 UI
   * 読込順: pcm_config → pcm_numbering → pcm_engine → 本ファイル → pcm.css
   */

  const C = window.CAYANAS_PCM;
  const Numbering = window.CAYANAS_PCM_Numbering;
  const Engine = window.CAYANAS_PCM_Engine;

  if (!C || !Numbering || !Engine) {
    console.error('[pcm_desktop] pcm_config / pcm_numbering / pcm_engine を先に読み込んでください。');
    return;
  }

  const F = C.FIELDS;
  const PANEL_ID = 'pcm-index-search-panel';
  let allocating = false;

  const isPcmApp = () => {
    try {
      return Number(kintone.app.getId()) === Number(C.PCM_APP_ID) && C.PCM_APP_ID > 0;
    } catch (err) {
      return false;
    }
  };

  const disableField = (code) => {
    try {
      kintone.app.record.setFieldShown(code, true);
      const el = kintone.app.record.getFieldElement(code);
      if (!el) {
        return;
      }
      el.querySelectorAll('input, textarea, select').forEach(function(input) {
        input.disabled = true;
        input.readOnly = true;
      });
    } catch (err) {
      // ignore
    }
  };

  const lockSensitiveFields = () => {
    C.LOCKED_FIELDS_STAFF.forEach(disableField);
  };

  const showRecordBanner = (text, isWarn) => {
    const existing = document.getElementById('pcm-record-banner');
    if (existing) {
      existing.remove();
    }
    const bar = document.createElement('div');
    bar.id = 'pcm-record-banner';
    bar.className = 'pcm-banner ' + (isWarn ? 'pcm-banner--warn' : 'pcm-banner--info');
    bar.textContent = text;
    const header = document.querySelector('.record-gaia') || document.querySelector('#record-gaia') || document.body;
    header.insertAdjacentElement('afterbegin', bar);
  };

  const ensureConfigReady = () => {
    if (!C.PCM_APP_ID || !C.COUNTER_APP_ID) {
      window.alert(
        'PCM_APP_ID / COUNTER_APP_ID が未設定です。\n'
        + 'アプリ作成後に customize/pcm_config.js を更新して再登録してください。'
      );
      return false;
    }
    return true;
  };

  /* ---------- create / edit ---------- */

  kintone.events.on(['app.record.create.show', 'app.record.edit.show'], function(event) {
    if (!isPcmApp()) {
      return event;
    }

    if (event.type.indexOf('create') >= 0) {
      /* 複製時も ID を引き継がない */
      if (event.record[F.personalCustomerId]) {
        event.record[F.personalCustomerId].value = '';
        event.record[F.personalCustomerId].disabled = true;
      }
      if (event.record[F.registrationSource] && !event.record[F.registrationSource].value) {
        event.record[F.registrationSource].value = C.REGISTRATION_SOURCE.store;
      }
      if (event.record[F.webVerified] && !event.record[F.webVerified].value) {
        event.record[F.webVerified].value = C.WEB_VERIFIED.none;
      }
      if (event.record[F.memberStatus] && !event.record[F.memberStatus].value) {
        event.record[F.memberStatus].value = C.MEMBER_STATUS.nonMember;
      }
      if (event.record[F.dormantStatus] && !event.record[F.dormantStatus].value) {
        event.record[F.dormantStatus].value = C.DORMANT.normal;
      }
      setTimeout(function() {
        showRecordBanner(
          '個人顧客IDは保存時に自動採番されます（P000001形式）。'
          + ' 利用回数・累計金額は App16 未連携のため自動更新されません。',
          false
        );
        lockSensitiveFields();
      }, 200);
    } else {
      if (event.record[F.personalCustomerId]) {
        event.record[F.personalCustomerId].disabled = true;
      }
      setTimeout(function() {
        lockSensitiveFields();
        showRecordBanner(
          '個人顧客ID・WEBアカウントID・利用集計は一般編集を制限しています。'
          + ' 氏名・電話のみでの顧客自動統合は行いません。',
          false
        );
      }, 200);
    }

    return event;
  });

  kintone.events.on('app.record.create.submit', async function(event) {
    if (!isPcmApp()) {
      return event;
    }
    if (!ensureConfigReady()) {
      event.error = 'PCM / カウンタ App ID が未設定です。';
      return event;
    }

    const name = Engine.readValue(event.record, F.customerName);
    if (!name) {
      event.error = '氏名は必須です。';
      return event;
    }

    try {
      const candidates = await Engine.findSimilarCandidates(event.record, null);
      if (candidates.length > 0) {
        const lines = candidates.slice(0, 8).map(Engine.formatCandidateLine).join('\n');
        const ok = window.confirm(
          '類似する顧客候補があります（自動統合はしません）。\n\n'
          + lines
          + '\n\n別人として新規登録する場合は「OK」。\n'
          + '既存を使う・登録中止する場合は「キャンセル」して検索から開いてください。'
        );
        if (!ok) {
          event.error = '登録を中止しました。既存顧客を検索して選択するか、内容を見直してください。';
          return event;
        }
      }
    } catch (err) {
      console.warn('[pcm_desktop] 類似候補検索失敗（登録は継続）', err);
    }

    if (allocating) {
      event.error = '採番処理中です。しばらくしてから再度保存してください。';
      return event;
    }

    allocating = true;
    try {
      const allocated = await Numbering.allocateNextPersonalCustomerId();
      event.record[F.personalCustomerId].value = allocated.personalCustomerId;
      event.record[F.personalCustomerId].disabled = true;
    } catch (err) {
      event.error = '個人顧客IDの採番に失敗しました: '
        + (err && err.message ? err.message : String(err));
      return event;
    } finally {
      allocating = false;
    }

    return event;
  });

  kintone.events.on('app.record.edit.submit', function(event) {
    if (!isPcmApp()) {
      return event;
    }

    const id = Engine.readValue(event.record, F.personalCustomerId);
    if (!id || !Numbering.isValidPersonalCustomerId(id)) {
      event.error = '個人顧客IDが不正です。管理者に連絡してください。';
      return event;
    }

    /* 画面上で改ざんされた場合のガード（disabled でも API 改ざん対策は限定的） */
    event.record[F.personalCustomerId].disabled = true;
    event.record[F.personalCustomerId].value = id;

    return event;
  });

  kintone.events.on('app.record.detail.show', function(event) {
    if (!isPcmApp()) {
      return event;
    }
    setTimeout(function() {
      showRecordBanner(
        'この画面の個人顧客IDは店舗・将来のWEBで共通利用します。'
        + ' App16 / 法人入金との自動連携は第1段階では未実装です。',
        false
      );
    }, 200);
    return event;
  });

  /* ---------- index search ---------- */

  const renderSearchPanel = () => {
    if (document.getElementById(PANEL_ID)) {
      return;
    }

    const host = document.querySelector('.gaia-argoui-app-index-toolbar')
      || document.querySelector('#contents-body-gaia')
      || document.querySelector('.contents-body-gaia')
      || document.body;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'pcm-search-panel';
    panel.innerHTML = ''
      + '<p class="pcm-search-panel__title">個人顧客検索</p>'
      + '<div class="pcm-search-panel__grid">'
      + '  <div><label for="pcm-q-id">個人顧客ID</label><input id="pcm-q-id" type="text" autocomplete="off"></div>'
      + '  <div><label for="pcm-q-name">氏名</label><input id="pcm-q-name" type="text" autocomplete="off"></div>'
      + '  <div><label for="pcm-q-kana">ふりがな</label><input id="pcm-q-kana" type="text" autocomplete="off"></div>'
      + '  <div><label for="pcm-q-phone">電話番号</label><input id="pcm-q-phone" type="text" autocomplete="off"></div>'
      + '  <div><label for="pcm-q-mobile">携帯電話</label><input id="pcm-q-mobile" type="text" autocomplete="off"></div>'
      + '  <div><label for="pcm-q-member">会員番号</label><input id="pcm-q-member" type="text" autocomplete="off"></div>'
      + '</div>'
      + '<div class="pcm-search-panel__actions">'
      + '  <button type="button" class="pcm-search-panel__btn-primary" id="pcm-search-btn">検索</button>'
      + '  <button type="button" class="pcm-search-panel__btn-secondary" id="pcm-search-clear">クリア</button>'
      + '  <button type="button" class="pcm-search-panel__btn-secondary" id="pcm-new-btn">新規登録</button>'
      + '</div>'
      + '<div id="pcm-search-status" class="pcm-search-empty"></div>'
      + '<div id="pcm-search-results" class="pcm-search-results"></div>';

    host.insertAdjacentElement('afterbegin', panel);

    const runSearch = async () => {
      const status = document.getElementById('pcm-search-status');
      const results = document.getElementById('pcm-search-results');
      if (!ensureConfigReady()) {
        return;
      }

      const criteria = {
        personalCustomerId: document.getElementById('pcm-q-id').value,
        customerName: document.getElementById('pcm-q-name').value,
        customerKana: document.getElementById('pcm-q-kana').value,
        phone: document.getElementById('pcm-q-phone').value,
        mobilePhone: document.getElementById('pcm-q-mobile').value,
        memberNo: document.getElementById('pcm-q-member').value,
      };

      status.className = 'pcm-search-empty';
      status.textContent = '検索中…';
      results.innerHTML = '';

      try {
        const records = await Engine.searchCustomers(criteria);
        if (records.length === 0) {
          status.textContent = '該当する顧客がありません。新規登録するか条件を変えてください。';
          return;
        }

        status.textContent = records.length + ' 件（最大50件）。同姓同名は住所・電話を確認して選択してください。';
        const table = document.createElement('table');
        table.innerHTML = '<thead><tr>'
          + '<th>個人顧客ID</th><th>氏名</th><th>ふりがな</th><th>電話</th><th>携帯</th>'
          + '<th>住所</th><th>会員</th><th></th>'
          + '</tr></thead>';
        const tbody = document.createElement('tbody');

        records.forEach(function(rec) {
          const tr = document.createElement('tr');
          const id = Engine.readValue(rec, F.personalCustomerId);
          const url = Engine.recordDetailUrl(rec.$id.value);
          const addr = [
            Engine.readValue(rec, F.prefecture),
            Engine.readValue(rec, F.city),
            Engine.readValue(rec, F.addressLine),
            Engine.readValue(rec, F.buildingName),
          ].filter(Boolean).join(' ');

          tr.innerHTML = ''
            + '<td>' + escapeHtml(id) + '</td>'
            + '<td>' + escapeHtml(Engine.readValue(rec, F.customerName)) + '</td>'
            + '<td>' + escapeHtml(Engine.readValue(rec, F.customerKana)) + '</td>'
            + '<td>' + escapeHtml(Engine.readValue(rec, F.phone)) + '</td>'
            + '<td>' + escapeHtml(Engine.readValue(rec, F.mobilePhone)) + '</td>'
            + '<td>' + escapeHtml(addr) + '</td>'
            + '<td>' + escapeHtml(Engine.readValue(rec, F.memberStatus) || Engine.readValue(rec, F.memberNo)) + '</td>'
            + '<td><a href="' + url + '">詳細</a></td>';
          tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        results.appendChild(table);
      } catch (err) {
        status.className = 'pcm-search-error';
        status.textContent = '検索に失敗しました: ' + (err && err.message ? err.message : String(err));
      }
    };

    document.getElementById('pcm-search-btn').addEventListener('click', runSearch);
    document.getElementById('pcm-search-clear').addEventListener('click', function() {
      ['pcm-q-id', 'pcm-q-name', 'pcm-q-kana', 'pcm-q-phone', 'pcm-q-mobile', 'pcm-q-member']
        .forEach(function(id) {
          const el = document.getElementById(id);
          if (el) {
            el.value = '';
          }
        });
      document.getElementById('pcm-search-status').textContent = '';
      document.getElementById('pcm-search-results').innerHTML = '';
    });
    document.getElementById('pcm-new-btn').addEventListener('click', function() {
      if (!ensureConfigReady()) {
        return;
      }
      location.href = '/k/' + C.PCM_APP_ID + '/edit';
    });

    panel.querySelectorAll('input').forEach(function(input) {
      input.addEventListener('keydown', function(ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          runSearch();
        }
      });
    });
  };

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  kintone.events.on('app.record.index.show', function(event) {
    if (!isPcmApp()) {
      return event;
    }
    setTimeout(renderSearchPanel, 100);
    return event;
  });
}());
