(function () {
  'use strict';

  /**
   * PCM 詳細 — 現行寸法サマリ + 寸法履歴表（読取）
   * 編集・追加はサブテーブル本体で行い、本パネルは上書きしない。
   * 読込順: pcm_config → pcm_measure_engine → … → pcm_order_history → 本ファイル
   */

  const C = window.CAYANAS_PCM;
  const Measure = window.CAYANAS_PCM_Measure;

  if (!C || !Measure) {
    console.error('[pcm_measure_panel] pcm_config / pcm_measure_engine を先に読み込んでください。');
    return;
  }

  const M = C.MEASURE;
  const PANEL_ID = 'pcm-measure-panel';

  const DIM_LABELS = {
    height_cm: '身長',
    mitake_cm: '身丈',
    yuki_cm: '裄',
    katahaba_cm: '肩幅',
    sode_cm: '袖丈',
    sodehaba_cm: '袖幅',
    maehaba_cm: '前幅',
    ushirohaba_cm: '後幅',
    suso_cm: '裾回り',
    eri_cm: '衿',
    bust_cm: '胸囲',
    waist_cm: 'ウエスト',
    hip_cm: 'ヒップ',
  };

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

  const formatDims = (dims) => {
    const parts = [];
    Measure.dimensionCodes().forEach((code) => {
      if (dims[code] === undefined || dims[code] === '') {
        return;
      }
      const label = DIM_LABELS[code] || code;
      parts.push(label + ' ' + Measure.formatCm(dims[code]));
    });
    return parts.length ? parts.join(' / ') : '—';
  };

  const mountPanel = (event) => {
    if (document.getElementById(PANEL_ID)) {
      return;
    }

    const tableField = event.record && event.record[M.table];
    const host = document.querySelector('.record-gaia')
      || document.querySelector('#record-gaia')
      || document.body;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'pcm-measure-panel';

    if (!tableField || !Array.isArray(tableField.value)) {
      panel.innerHTML = ''
        + '<p class="pcm-measure-panel__title">寸法（カルテ）</p>'
        + '<p class="pcm-measure-panel__note">寸法履歴フィールド（measure_history）がまだないか、権限がありません。'
        + ' フィールド追加後に現行サマリと履歴が表示されます。既存の顧客情報・利用履歴には影響しません。</p>';
      host.appendChild(panel);
      return;
    }

    const currents = Measure.pickCurrentRows(tableField.value);
    const history = Measure.sortHistoryRows(tableField.value);

    const currentCards = currents.length
      ? currents.map((row) => (
        '<div class="pcm-measure-card">'
        + '<div class="pcm-measure-card__head">'
        + '<span class="pcm-measure-card__badge">現行</span>'
        + escapeHtml(row.measureKind || '—') + ' / ' + escapeHtml(row.garmentType || '—')
        + (row.measureLabel ? ' — ' + escapeHtml(row.measureLabel) : '')
        + '</div>'
        + '<div class="pcm-measure-card__meta">採寸日 '
        + escapeHtml(row.measuredAt || '—')
        + (row.manageNo ? ' / 管理番号 ' + escapeHtml(row.manageNo) : '')
        + '</div>'
        + '<div class="pcm-measure-card__dims">' + escapeHtml(formatDims(row.dims)) + '</div>'
        + (row.measureNote
          ? '<div class="pcm-measure-card__note">' + escapeHtml(row.measureNote) + '</div>'
          : '')
        + '</div>'
      )).join('')
      : '<p class="pcm-measure-panel__empty">現行寸法は未設定です。編集画面の寸法履歴で行を追加し「現行」にチェックしてください。</p>';

    const historyRows = history.length
      ? history.map((row) => {
        const value = row.value || {};
        const current = Measure.isCurrentChecked(value);
        const dims = {};
        Measure.dimensionCodes().forEach((code) => {
          const raw = Measure.readCell(value, code);
          if (raw !== '' && raw !== null && raw !== undefined) {
            dims[code] = raw;
          }
        });
        return '<tr' + (current ? ' class="is-current"' : '') + '>'
          + '<td>' + escapeHtml(Measure.readCell(value, M.measuredAt) || '—') + '</td>'
          + '<td>' + escapeHtml(Measure.readCell(value, M.measureKind) || '—') + '</td>'
          + '<td>' + escapeHtml(Measure.readCell(value, M.garmentType) || '—') + '</td>'
          + '<td>' + escapeHtml(Measure.readCell(value, M.measureLabel) || '—') + '</td>'
          + '<td>' + (current ? '現行' : '') + '</td>'
          + '<td>' + escapeHtml(Measure.readCell(value, M.manageNo) || '—') + '</td>'
          + '<td>' + escapeHtml(formatDims(dims)) + '</td>'
          + '<td>' + escapeHtml(Measure.readCell(value, M.measureNote) || '') + '</td>'
          + '</tr>';
      }).join('')
      : '<tr><td colspan="8">寸法履歴はまだありません。</td></tr>';

    panel.innerHTML = ''
      + '<p class="pcm-measure-panel__title">現行寸法サマリ</p>'
      + '<p class="pcm-measure-panel__note">過去行は残します。修正するときは新しい行を追加し、旧行の現行チェックを外してください（上書きしない）。</p>'
      + '<div class="pcm-measure-panel__cards">' + currentCards + '</div>'
      + '<p class="pcm-measure-panel__title pcm-measure-panel__title--sub">寸法履歴</p>'
      + '<div class="pcm-measure-panel__scroll">'
      + '<table class="pcm-measure-panel__table">'
      + '<thead><tr>'
      + '<th>採寸日</th><th>区分</th><th>対象</th><th>名称</th><th>現行</th><th>管理番号</th><th>寸法(cm)</th><th>備考</th>'
      + '</tr></thead><tbody>' + historyRows + '</tbody></table></div>';

    /* 利用履歴の直前に置く（履歴が後から付く場合は先頭寄り） */
    const historyPanel = document.getElementById('pcm-order-history-panel');
    if (historyPanel && historyPanel.parentNode) {
      historyPanel.parentNode.insertBefore(panel, historyPanel);
    } else {
      host.appendChild(panel);
    }
  };

  kintone.events.on('app.record.detail.show', function (event) {
    if (!isPcmApp()) {
      return event;
    }
    setTimeout(function () {
      mountPanel(event);
    }, 400);
    return event;
  });

  const applySubmitNormalize = (event) => {
    if (!isPcmApp()) {
      return event;
    }
    const prepared = Measure.prepareRecordForSubmit(event.record);
    if (!prepared.ok) {
      event.error = prepared.error;
      return event;
    }
    if (!prepared.skipped) {
      event.record = prepared.record;
    }
    return event;
  };

  kintone.events.on(['app.record.create.submit', 'app.record.edit.submit'], applySubmitNormalize);

  /* 編集画面の注意バナー */
  kintone.events.on(['app.record.create.show', 'app.record.edit.show'], function (event) {
    if (!isPcmApp()) {
      return event;
    }
    setTimeout(function () {
      if (document.getElementById('pcm-measure-edit-hint')) {
        return;
      }
      const hint = document.createElement('div');
      hint.id = 'pcm-measure-edit-hint';
      hint.className = 'pcm-banner pcm-banner--info';
      hint.textContent = '寸法履歴: 行の削除は避け、新規行追加で履歴を残してください。'
        + ' 同一の区分・対象・名称では「現行」は1件だけになります。';
      const host = document.querySelector('.record-gaia') || document.body;
      host.insertAdjacentElement('afterbegin', hint);
    }, 250);
    return event;
  });
}());
