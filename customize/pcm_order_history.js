(function() {
  'use strict';

  /**
   * PCM 詳細 — 同一 personal_customer_id の App16 受注履歴（読取のみ）
   * 読込順: pcm_config → … → pcm_desktop → 本ファイル
   * App16 に personal_customer_id が無い／権限不足の場合はメッセージのみ。
   */

  const C = window.CAYANAS_PCM;
  if (!C) {
    console.error('[pcm_order_history] pcm_config.js を先に読み込んでください。');
    return;
  }

  const ORDER_APP_ID = C.ORDER_APP_ID || 16;
  const OF = C.ORDER_HISTORY_FIELDS || {
    personalCustomerId: 'personal_customer_id',
    orderDate: 'order_date',
    manageNo: 'manage_no',
    kimonoType: 'kimono_type',
    detailTable: 'detail_table',
    detailItemName: 'item_name',
    deadline: 'deadline',
    processStatus: 'process_status',
    locationStatus: 'location_status',
    deliveryStatus: 'delivery_status',
  };

  const PANEL_ID = 'pcm-order-history-panel';
  const F = C.FIELDS;

  const isPcmApp = () => {
    try {
      return Number(kintone.app.getId()) === Number(C.PCM_APP_ID) && C.PCM_APP_ID > 0;
    } catch (err) {
      return false;
    }
  };

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const escapeQuery = (value) => String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  const readValue = (record, code) => {
    const field = record && record[code];
    if (!field || field.value === null || field.value === undefined) {
      return '';
    }
    return String(field.value).trim();
  };

  const summarizeItems = (record) => {
    const table = record && record[OF.detailTable];
    const rows = (table && table.value) || [];
    const names = [];
    rows.forEach(function(row) {
      const name = readValue(row.value || {}, OF.detailItemName);
      if (name) {
        names.push(name);
      }
    });
    if (names.length <= 3) {
      return names.join('、');
    }
    return names.slice(0, 3).join('、') + ' 他' + (names.length - 3) + '件';
  };

  const loadHistory = async (personalCustomerId, host) => {
    const status = host.querySelector('.pcm-order-history__status');
    const body = host.querySelector('.pcm-order-history__body');
    status.textContent = '読込中…';
    body.innerHTML = '';

    if (!C.ID_PATTERN.test(personalCustomerId)) {
      status.textContent = '個人顧客IDが未採番のため履歴を表示できません。';
      return;
    }

    const query = OF.personalCustomerId
      + ' = "' + escapeQuery(personalCustomerId) + '"'
      + ' order by ' + OF.orderDate + ' desc, ' + OF.manageNo + ' desc limit 50';

    try {
      const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', {
        app: ORDER_APP_ID,
        query: query,
        fields: [
          '$id',
          OF.orderDate,
          OF.manageNo,
          OF.kimonoType,
          OF.detailTable,
          OF.deadline,
          OF.processStatus,
          OF.locationStatus,
          OF.deliveryStatus,
        ],
      });

      const records = resp.records || [];
      if (records.length === 0) {
        status.textContent = 'この個人顧客IDに紐づく受注はまだありません（未連携の旧A550は表示されません）。';
        return;
      }

      status.textContent = records.length + ' 件（最大50件）。PCM氏名変更は過去受注のお客様名へ自動反映しません。';

      const table = document.createElement('table');
      table.className = 'pcm-order-history__table';
      table.innerHTML = '<thead><tr>'
        + '<th>受注日</th><th>管理番号</th><th>着物種類</th><th>加工内容</th>'
        + '<th>納期</th><th>工程</th><th>現物場所</th><th>納品状況</th>'
        + '</tr></thead>';
      const tbody = document.createElement('tbody');

      records.forEach(function(rec) {
        const tr = document.createElement('tr');
        const manageNo = readValue(rec, OF.manageNo);
        const recordId = rec.$id && rec.$id.value;
        const link = manageNo
          ? ('<a href="/k/' + ORDER_APP_ID + '/show#record=' + encodeURIComponent(String(recordId)) + '">'
            + escapeHtml(manageNo) + '</a>')
          : '—';
        tr.innerHTML = ''
          + '<td>' + escapeHtml(readValue(rec, OF.orderDate)) + '</td>'
          + '<td>' + link + '</td>'
          + '<td>' + escapeHtml(readValue(rec, OF.kimonoType)) + '</td>'
          + '<td>' + escapeHtml(summarizeItems(rec)) + '</td>'
          + '<td>' + escapeHtml(readValue(rec, OF.deadline)) + '</td>'
          + '<td>' + escapeHtml(readValue(rec, OF.processStatus)) + '</td>'
          + '<td>' + escapeHtml(readValue(rec, OF.locationStatus)) + '</td>'
          + '<td>' + escapeHtml(readValue(rec, OF.deliveryStatus)) + '</td>';
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      body.appendChild(table);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      status.className = 'pcm-order-history__status pcm-order-history__status--error';
      status.textContent = '受注履歴の取得に失敗しました（App16 の personal_customer_id 未設置や権限の可能性があります）: ' + msg;
    }
  };

  const mountPanel = (event) => {
    if (document.getElementById(PANEL_ID)) {
      return;
    }

    const personalId = readValue(event.record, F.personalCustomerId);
    const host = document.querySelector('.record-gaia')
      || document.querySelector('#record-gaia')
      || document.body;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'pcm-order-history';
    panel.innerHTML = ''
      + '<p class="pcm-order-history__title">受注履歴（App16）</p>'
      + '<p class="pcm-order-history__note">同一 personal_customer_id の店舗受注です。読取のみ。</p>'
      + '<div class="pcm-order-history__status">準備中…</div>'
      + '<div class="pcm-order-history__body"></div>';

    host.appendChild(panel);
    loadHistory(personalId, panel);
  };

  kintone.events.on('app.record.detail.show', function(event) {
    if (!isPcmApp()) {
      return event;
    }
    setTimeout(function() {
      mountPanel(event);
    }, 350);
    return event;
  });
}());
