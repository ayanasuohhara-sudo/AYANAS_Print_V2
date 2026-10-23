(function() {
  'use strict';

  /**
   * 総合入庫 App78 — スキャン・一括入庫確定 UI
   * 読込順: wasai_config.js → inbound_unified_config.js → inbound_unified_engine.js → 本ファイル
   */

  const C = window.CAYANAS_InboundUnified;
  const Engine = window.CAYANAS_InboundUnifiedEngine;
  const W = window.CAYANAS_Wasai;

  if (!C || !Engine || !W) {
    console.error('[inbound_desktop] wasai_config / inbound_unified_config / inbound_unified_engine を先に読み込んでください。');
    return;
  }

  if (kintone.app.getId() !== C.APP.unified) {
    return;
  }

  const MESSAGE_SPACE_ID = 'message_space';
  const ACTION_SPACE_ID = 'action_space';
  const BATCH_BUTTON_ID = 'inbound-unified-batch-btn';
  const BARCODE_FIELDS = [C.UF.barcodeInput, 'manage_no', 'barcode'];
  const MANAGE_NO_MIN_LENGTH = 6;

  let isProcessing = false;
  let debounceTimer = null;
  let inboundLineFieldMeta = null;
  let inboundLineFieldMetaPromise = null;
  let blockSubmitForBarcodeEnter = false;

  const isEnterKey = (ev) => (
    ev.key === 'Enter'
    || ev.key === 'NumpadEnter'
    || ev.keyCode === 13
  );

  const BARCODE_INPUT_MARK = 'data-cayan-inbound-barcode';

  const isBarcodeFieldTarget = (target) => {
    if (!target) {
      return false;
    }

    const el = target.nodeType === 1 ? target : target.parentElement;

    if (!el) {
      return false;
    }

    if (el.getAttribute(BARCODE_INPUT_MARK) === '1') {
      return true;
    }

    const closest = el.closest && el.closest('[' + BARCODE_INPUT_MARK + '="1"]');

    return Boolean(closest);
  };

  const isInboundLineManageNoInput = (target) => {
    if (!target || String(target.tagName ?? '').toUpperCase() !== 'INPUT') {
      return false;
    }

    if (isBarcodeFieldTarget(target)) {
      return false;
    }

    const id = String(target.id ?? '');
    const name = String(target.name ?? '');
    const hint = id + ' ' + name;

    if (hint.indexOf('manage_no') < 0) {
      return false;
    }

    if (hint.indexOf('barcode_input') >= 0) {
      return false;
    }

    return hint.indexOf('inbound_lines') >= 0
      || Boolean(target.closest && target.closest('.subtable-gaia'));
  };

  const readManageNoFromSubtableInput = (target) => {
    if (!target) {
      return '';
    }

    return String(target.value ?? '').trim();
  };

  let pendingManageNoOverride = null;

  const scheduleProcessScan = (manageNoOverride) => {
    if (manageNoOverride) {
      pendingManageNoOverride = manageNoOverride;
    }

    setTimeout(function() {
      const override = pendingManageNoOverride;
      pendingManageNoOverride = null;
      runProcessScan(override);
    }, 20);
  };

  const triggerBarcodeScanFromEnter = (manageNoOverride) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    blockSubmitForBarcodeEnter = true;
    setTimeout(function() {
      blockSubmitForBarcodeEnter = false;
    }, 1500);

    scheduleProcessScan(manageNoOverride);
  };

  const installGlobalBarcodeEnterHandler = () => {
    if (window.__CAYANAS_INBOUND_ENTER_INSTALLED) {
      return;
    }

    window.__CAYANAS_INBOUND_ENTER_INSTALLED = true;

    document.addEventListener('keydown', function(ev) {
      if (kintone.app.getId() !== C.APP.unified) {
        return;
      }

      if (!isEnterKey(ev)) {
        return;
      }

      let manageNoOverride = '';

      if (isBarcodeFieldTarget(ev.target)) {
        manageNoOverride = '';
      } else if (isInboundLineManageNoInput(ev.target)) {
        manageNoOverride = readManageNoFromSubtableInput(ev.target);

        if (manageNoOverride.length < MANAGE_NO_MIN_LENGTH) {
          return;
        }
      } else {
        return;
      }

      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      triggerBarcodeScanFromEnter(manageNoOverride || undefined);
    }, true);
  };

  const installSaveButtonEmptyRowCleanup = () => {
    if (window.__CAYANAS_INBOUND_SAVE_CLEANUP) {
      return;
    }

    window.__CAYANAS_INBOUND_SAVE_CLEANUP = true;

    document.addEventListener('click', function(ev) {
      if (kintone.app.getId() !== C.APP.unified) {
        return;
      }

      const target = ev.target;

      if (!target || !target.closest) {
        return;
      }

      const saveBtn = target.closest(
        '.gaia-argoui-app-toolbar-statusmenu-save, .gaia-ui-actionmenu-save'
      );

      if (!saveBtn) {
        return;
      }

      setTimeout(function() {
        try {
          const snapshot = kintone.app.record.get();
          removeEmptySubtableRows(snapshot.record);
          syncHeaderCounts(snapshot.record);
          kintone.app.record.set(snapshot);
        } catch (error) {
          // ハンドラ処理中は get/set 不可 — submit 側で再実行
        }
      }, 0);
    }, true);
  };

  installGlobalBarcodeEnterHandler();
  installSaveButtonEmptyRowCleanup();

  const loadInboundLineFieldMeta = () => {
    if (inboundLineFieldMeta) {
      return Promise.resolve(inboundLineFieldMeta);
    }

    if (inboundLineFieldMetaPromise) {
      return inboundLineFieldMetaPromise;
    }

    inboundLineFieldMetaPromise = kintone.api(
      kintone.api.url('/k/v1/app/form/fields.json', true),
      'GET',
      { app: C.APP.unified }
    ).then(function(resp) {
      const tableProp = resp.properties?.[C.UF.inboundLines];
      inboundLineFieldMeta = tableProp?.fields || {};
      return inboundLineFieldMeta;
    }).catch(function(err) {
      inboundLineFieldMetaPromise = null;
      throw err;
    });

    return inboundLineFieldMetaPromise;
  };

  const OPTIONAL_LINE_DROPDOWNS = new Set([
    C.UL.sourceOutboundApp,
  ]);

  const emptyValueForFieldType = (type) => {
    if (type === 'DATE' || type === 'DATETIME' || type === 'TIME') {
      return null;
    }

    if (type === 'NUMBER' || type === 'CALC') {
      return null;
    }

    return '';
  };

  const sourceAppForRoute = (route) => {
    const r = String(route ?? '').trim();

    if (r === C.ROUTE.overseas) {
      return C.SOURCE_APP.overseas;
    }

    if (r === C.ROUTE.wasai) {
      return C.SOURCE_APP.wasai;
    }

    return C.SOURCE_APP.domestic;
  };

  const enrichPlainRowBeforeWrap = (plainRow) => {
    const row = Object.assign({}, plainRow || {});
    const route = row[C.UL.inboundRoute];
    const sourceApp = row[C.UL.sourceOutboundApp];

    if ((sourceApp === undefined || sourceApp === null || sourceApp === '') && route) {
      row[C.UL.sourceOutboundApp] = sourceAppForRoute(route);
    }

    return row;
  };

  const buildDropdownPreferredValues = (fieldCode, rawValue) => {
    const preferred = [];

    if (rawValue !== null && rawValue !== undefined && rawValue !== '') {
      preferred.push(rawValue, String(rawValue));
    }

    if (fieldCode === C.UL.sourceOutboundApp) {
      preferred.push(
        C.SOURCE_APP.domestic,
        C.SOURCE_APP.overseas,
        C.SOURCE_APP.wasai,
        '27',
        '28',
        '74',
        'App27',
        'App28',
        'App74'
      );
    }

    if (fieldCode === C.UL.inboundRoute) {
      preferred.push(C.ROUTE.domestic, C.ROUTE.overseas, C.ROUTE.wasai);
    }

    if (fieldCode === C.UL.lineResult) {
      preferred.push(C.LINE_RESULT.waiting, C.LINE_RESULT.success, C.LINE_RESULT.error);
    }

    return preferred;
  };

  const wrapLineFieldCell = (fieldCode, rawValue, typeHint) => {
    const meta = inboundLineFieldMeta?.[fieldCode];
    const type = meta?.type || typeHint || 'SINGLE_LINE_TEXT';
    const isOptionalDropdown = OPTIONAL_LINE_DROPDOWNS.has(fieldCode);
    let value = rawValue;
    const rawMissing = value === undefined;

    if (rawMissing) {
      if (isOptionalDropdown && meta && (type === 'DROP_DOWN' || type === 'RADIO_BUTTON')) {
        return null;
      }

      value = emptyValueForFieldType(type);
    }

    if ((type === 'DATE' || type === 'DATETIME' || type === 'TIME') && value === '') {
      value = null;
    }

    if (meta && (type === 'DROP_DOWN' || type === 'RADIO_BUTTON')) {
      const preferred = buildDropdownPreferredValues(fieldCode, value);
      const rawForFallback = value === null || value === undefined ? '' : String(value);
      /* 和裁士ルートを国内外注へ勝手に落とさない（選択肢不一致時は元値を残す） */
      const strictRoute = fieldCode === C.UL.inboundRoute
        || fieldCode === C.UL.sourceOutboundApp;

      value = W.pickDropdownValue(
        meta,
        preferred,
        rawForFallback,
        strictRoute
      );

      if (value === '' || value === null || value === undefined) {
        if (isOptionalDropdown) {
          return null;
        }

        if (strictRoute && rawForFallback !== '') {
          value = rawForFallback;
        } else {
          value = W.pickDropdownValue(meta, preferred, '', false);
        }
      }

      if ((value === '' || value === null) && isOptionalDropdown) {
        return null;
      }
    } else if (type === 'NUMBER' || type === 'CALC') {
      if (value === null || value === '') {
        value = null;
      } else {
        value = String(value);
      }
    } else if (value !== null && value !== undefined) {
      value = String(value);
    }

    return { type: type, value: value };
  };

  const wrapLineRowFromPlain = (plainRow, typeTemplateRow) => {
    const enriched = enrichPlainRowBeforeWrap(plainRow);
    const wrapped = {};
    const keys = Object.keys(inboundLineFieldMeta || {});

    const assignCell = (fieldCode, raw) => {
      const typeHint = typeTemplateRow?.value?.[fieldCode]?.type;
      const cell = wrapLineFieldCell(fieldCode, raw, typeHint);

      if (cell !== null) {
        wrapped[fieldCode] = cell;
      }
    };

    keys.forEach(function(fieldCode) {
      const source = enriched?.[fieldCode];
      const raw = source && typeof source === 'object' && 'value' in source
        ? source.value
        : source;

      assignCell(fieldCode, raw);
    });

    Object.keys(enriched || {}).forEach(function(fieldCode) {
      if (wrapped[fieldCode]) {
        return;
      }

      const source = enriched[fieldCode];
      const raw = source && typeof source === 'object' && 'value' in source
        ? source.value
        : source;

      assignCell(fieldCode, raw);
    });

    return { value: wrapped };
  };

  const readBarcodeFromDom = () => {
    for (let i = 0; i < BARCODE_FIELDS.length; i += 1) {
      try {
        const el = kintone.app.record.getFieldElement(BARCODE_FIELDS[i]);

        if (!el) {
          continue;
        }

        const input = el.querySelector('input');

        if (input) {
          const value = String(input.value ?? '').trim();

          if (value !== '') {
            return value;
          }
        }
      } catch (error) {
        // ignore
      }
    }

    return '';
  };

  const syncBarcodeDomToRecord = (record) => {
    const fromDom = readBarcodeFromDom();

    if (fromDom === '') {
      return;
    }

    BARCODE_FIELDS.forEach(function(fieldCode) {
      if (record[fieldCode]) {
        record[fieldCode].value = fromDom;
      }
    });
  };

  const resolveBarcodeValue = (record) => {
    const fromDom = readBarcodeFromDom();

    if (fromDom !== '') {
      return fromDom;
    }

    return getBarcodeFromRecord(record);
  };

  const normalizeInboundLinesTable = (record) => {
    const table = record[C.UF.inboundLines];

    if (!table || !Array.isArray(table.value) || !inboundLineFieldMeta) {
      return;
    }

    table.type = 'SUBTABLE';
    table.value = table.value
      .filter(function(row) {
        const mn = String(row?.value?.[C.UL.manageNo]?.value ?? '').trim();
        return mn !== '';
      })
      .map(function(row) {
        const plain = {};

        Object.keys(row.value || {}).forEach(function(fieldCode) {
          const cell = row.value[fieldCode];
          plain[fieldCode] = cell?.value;
        });

        const wrapped = wrapLineRowFromPlain(plain);

        if (row.id) {
          wrapped.id = row.id;
        }

        return wrapped;
      });
  };

  const getStatus = (record) => String(C.getFieldValue(record, C.UF.inboundStatus) ?? '').trim();

  const isDraft = (record) => getStatus(record) === C.INBOUND_STATUS.draft || getStatus(record) === '';

  const isConfirmed = (record) => getStatus(record) === C.INBOUND_STATUS.confirmed;

  const getInboundDate = (record) => String(C.getFieldValue(record, C.UF.inboundDate) ?? '').trim();

  const getBarcodeFromRecord = (record) => {
    for (let i = 0; i < BARCODE_FIELDS.length; i += 1) {
      const code = BARCODE_FIELDS[i];
      const value = String(C.getFieldValue(record, code) ?? '').trim();

      if (value !== '') {
        return value;
      }
    }

    return '';
  };

  const clearBarcode = (record) => {
    BARCODE_FIELDS.forEach(function(code) {
      if (record[code]) {
        record[code].value = '';
      }
    });
  };

  const focusBarcode = () => {
    setTimeout(function() {
      for (let i = 0; i < BARCODE_FIELDS.length; i += 1) {
        let el;

        try {
          el = kintone.app.record.getFieldElement(BARCODE_FIELDS[i]);
        } catch (error) {
          continue;
        }

        if (!el) {
          continue;
        }

        const input = el.querySelector('input');

        if (input) {
          input.focus();
          input.select();
          return;
        }
      }
    }, 120);
  };

  const showMessage = (text, isError) => {
    const space = kintone.app.record.getSpaceElement(MESSAGE_SPACE_ID);

    if (!space) {
      return;
    }

    const color = isError ? '#c0392b' : '#2e7d32';
    space.innerHTML = '<div style="color:' + color + ';font-size:15px;line-height:1.5;white-space:pre-wrap;">'
      + text
      + '</div>';
  };

  const syncHeaderCounts = (record) => {
    const table = record[C.UF.inboundLines];
    const counts = Engine.countLineResults(table);

    if (record[C.UF.lineCount]) {
      record[C.UF.lineCount].value = String(counts.total);
    }

    if (record[C.UF.successCount]) {
      record[C.UF.successCount].value = String(counts.success);
    }

    if (record[C.UF.errorCount]) {
      record[C.UF.errorCount].value = String(counts.errors);
    }
  };

  const ensureDefaultHeader = (record) => {
    if (record[C.UF.inboundStatus] && getStatus(record) === '') {
      record[C.UF.inboundStatus].value = C.INBOUND_STATUS.draft;
    }

    if (record[C.UF.lineCount] && String(record[C.UF.lineCount].value ?? '') === '') {
      record[C.UF.lineCount].value = '0';
    }

    if (record[C.UF.successCount] && String(record[C.UF.successCount].value ?? '') === '') {
      record[C.UF.successCount].value = '0';
    }

    if (record[C.UF.errorCount] && String(record[C.UF.errorCount].value ?? '') === '') {
      record[C.UF.errorCount].value = '0';
    }
  };

  const getLineManageNo = (row) => String(row?.value?.[C.UL.manageNo]?.value ?? '').trim();

  const getLineInboundRoute = (row) => String(row?.value?.[C.UL.inboundRoute]?.value ?? '').trim();

  const removeEmptySubtableRows = (record) => {
    const table = record[C.UF.inboundLines];

    if (!table || !Array.isArray(table.value)) {
      return;
    }

    table.type = 'SUBTABLE';
    table.value = table.value.filter(function(row) {
      return getLineManageNo(row) !== '';
    });
  };

  const hasValidInboundLine = (record) => {
    const table = record[C.UF.inboundLines];

    if (!table || !Array.isArray(table.value)) {
      return false;
    }

    return table.value.some(function(row) {
      return getLineManageNo(row) !== '' && getLineInboundRoute(row) !== '';
    });
  };

  const replaceInboundLines = (record, rows) => {
    record[C.UF.inboundLines] = {
      type: 'SUBTABLE',
      value: rows,
    };
  };

  const listManageNosInTable = (record) => {
    const table = record[C.UF.inboundLines];
    const set = new Set();

    if (!table || !Array.isArray(table.value)) {
      return set;
    }

    table.value.forEach(function(row) {
      const mn = String(C.getFieldValue(row.value, C.UL.manageNo) ?? '').trim();

      if (mn !== '') {
        set.add(mn);
      }
    });

    return set;
  };

  const findTypeTemplateRow = (record) => {
    const table = record[C.UF.inboundLines];

    if (!table || !Array.isArray(table.value)) {
      return null;
    }

    for (let i = 0; i < table.value.length; i += 1) {
      const row = table.value[i];
      const mn = String(row?.value?.[C.UL.manageNo]?.value ?? '').trim();

      if (mn !== '') {
        return row;
      }

      if (row?.value?.[C.UL.manageNo]?.type) {
        return row;
      }
    }

    return table.value[0] || null;
  };

  const upsertInboundLineRow = (record, plainRow) => {
    if (!record[C.UF.inboundLines]) {
      throw new Error('サブテーブル inbound_lines がありません');
    }

    if (!Array.isArray(record[C.UF.inboundLines].value)) {
      record[C.UF.inboundLines].value = [];
    }

    const templateRow = findTypeTemplateRow(record);
    const wrapped = wrapLineRowFromPlain(plainRow, templateRow);
    record[C.UF.inboundLines].type = 'SUBTABLE';

    let targetIndex = -1;

    for (let i = record[C.UF.inboundLines].value.length - 1; i >= 0; i -= 1) {
      const mn = String(
        record[C.UF.inboundLines].value[i]?.value?.[C.UL.manageNo]?.value ?? ''
      ).trim();

      if (mn === '') {
        targetIndex = i;
        break;
      }
    }

    const rows = record[C.UF.inboundLines].value.slice();

    if (targetIndex >= 0) {
      const existing = rows[targetIndex];

      if (existing?.id) {
        wrapped.id = existing.id;
      }

      rows[targetIndex] = wrapped;
    } else {
      rows.push(wrapped);
    }

    replaceInboundLines(record, rows);
  };

  const addScannedLineToRecord = async (record, manageNo, inboundDate) => {
    const normalized = String(manageNo ?? '').trim();

    if (!normalized) {
      return { ok: false, errorMessage: '管理番号が空です' };
    }

    const existing = listManageNosInTable(record);

    if (existing.has(normalized)) {
      upsertInboundLineRow(
        record,
        buildErrorRowPlain(normalized, '同一レコード内で管理番号が重複しています')
      );
      return { ok: false, errorMessage: '同一レコード内で重複しています' };
    }

    const result = await Engine.scanManageNo(normalized, inboundDate);

    if (result.cancelled) {
      return result;
    }

    if (!result.ok) {
      upsertInboundLineRow(
        record,
        buildErrorRowPlain(normalized, result.errorMessage || 'スキャンエラー')
      );
      return result;
    }

    const toPlain = (lineRow) => {
      const plain = {};

      Object.keys(lineRow.value || {}).forEach(function(fieldCode) {
        const cell = lineRow.value[fieldCode];
        plain[fieldCode] = cell?.value;
      });

      return plain;
    };

    if (result.bulk) {
      const accepted = window.confirm(result.confirmText || '未入庫をまとめて入庫しますか？');

      if (!accepted) {
        return {
          ok: false,
          cancelled: true,
          errorMessage: '入庫処理をキャンセルしました',
        };
      }

      (result.lineRows || []).forEach(function(lineRow) {
        upsertInboundLineRow(record, toPlain(lineRow));
      });

      return {
        ok: true,
        bulk: true,
        route: '未入庫' + (result.lineRows || []).length + '件',
      };
    }

    upsertInboundLineRow(record, toPlain(result.lineRow));
    return { ok: true, route: C.getFieldValue(result.lineRow.value, C.UL.inboundRoute) };
  };

  const buildErrorRowPlain = (manageNo, message) => ({
    [C.UL.manageNo]: manageNo,
    [C.UL.inboundRoute]: C.ROUTE.domestic,
    [C.UL.lineResult]: C.LINE_RESULT.error,
    [C.UL.errorMessage]: message,
    [C.UL.sourceOutboundApp]: C.SOURCE_APP.domestic,
    [C.UL.scannedAt]: C.nowDatetimeLocal(),
  });

  const runProcessScan = async (manageNoOverride) => {
    if (isProcessing) {
      return;
    }

    let snapshot;

    try {
      snapshot = kintone.app.record.get();
    } catch (err) {
      showMessage(C.formatKintoneError(err), true);
      return;
    }

    const record = snapshot.record;
    removeEmptySubtableRows(record);
    syncBarcodeDomToRecord(record);

    const manageNo = String(manageNoOverride ?? '').trim() || resolveBarcodeValue(record);

    if (manageNo && record[C.UF.barcodeInput]) {
      record[C.UF.barcodeInput].value = manageNo;
    }

    if (!manageNo || manageNo.length < MANAGE_NO_MIN_LENGTH) {
      return;
    }

    if (!isDraft(record)) {
      window.alert('下書き以外ではスキャンできません');
      clearBarcode(record);
      kintone.app.record.set(snapshot);
      return;
    }

    const inboundDate = getInboundDate(record);

    if (!inboundDate) {
      window.alert('入庫日を入力してからスキャンしてください');
      clearBarcode(record);
      kintone.app.record.set(snapshot);
      focusBarcode();
      return;
    }

    isProcessing = true;

    try {
      await loadInboundLineFieldMeta();

      const result = await addScannedLineToRecord(record, manageNo, inboundDate);
      syncHeaderCounts(record);
      clearBarcode(record);
      kintone.app.record.set(snapshot);

      if (result.cancelled) {
        showMessage(manageNo + ' — 入庫処理をキャンセルしました', false);
      } else if (!result.ok) {
        showMessage(manageNo + ' — ' + (result.errorMessage || 'エラー'), true);
      } else if (result.bulk) {
        showMessage(manageNo + ' — ' + result.route + 'を明細に追加しました（待機）', false);
      } else {
        showMessage(manageNo + ' — ' + result.route + '（待機・明細自動入力）', false);
      }

      focusBarcode();
    } catch (err) {
      window.alert(C.formatKintoneError(err));
      showMessage(C.formatKintoneError(err), true);
    } finally {
      isProcessing = false;
    }
  };

  const queueScanFromChange = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(function() {
      debounceTimer = null;
      runProcessScan();
    }, 900);
  };

  const bindBarcodeInputHandlers = () => {
    BARCODE_FIELDS.forEach(function(fieldCode) {
      let el;

      try {
        el = kintone.app.record.getFieldElement(fieldCode);
      } catch (error) {
        return;
      }

      if (!el) {
        return;
      }

      el.setAttribute(BARCODE_INPUT_MARK, '1');

      const input = el.querySelector('input');

      if (!input) {
        return;
      }

      input.setAttribute(BARCODE_INPUT_MARK, '1');

      if (input.dataset.inboundBarcodeBound === '1') {
        return;
      }

      input.dataset.inboundBarcodeBound = '1';

      input.addEventListener('keydown', function(ev) {
        if (!isEnterKey(ev)) {
          return;
        }

        ev.preventDefault();
        ev.stopPropagation();
        triggerBarcodeScanFromEnter();
      });
    });
  };

  const scheduleBarcodeInputBind = () => {
    let attempts = 0;

    const tick = function() {
      bindBarcodeInputHandlers();
      attempts += 1;

      if (attempts < 10) {
        setTimeout(tick, 400);
      }
    };

    setTimeout(tick, 250);
  };

  const appendScanActionButton = (space) => {
    const btn = document.createElement('button');
    btn.id = 'inbound-unified-scan-btn';
    btn.type = 'button';
    btn.className = 'kintoneplugin-button-normal';
    btn.style.marginBottom = '8px';
    btn.textContent = 'バーコードを明細へ反映';
    btn.onclick = function() {
      scheduleProcessScan();
    };

    space.appendChild(btn);
  };

  const renderBatchButton = (recordId, record) => {
    const space = kintone.app.record.getSpaceElement(ACTION_SPACE_ID);

    if (!space) {
      return;
    }

    space.innerHTML = '';

    if (isDraft(record)) {
      appendScanActionButton(space);
    }

    if (!isDraft(record)) {
      const note = document.createElement('div');
      note.style.fontSize = '14px';
      note.style.color = '#555';
      note.textContent = isConfirmed(record)
        ? '入庫確定済みです。一括入庫は実行できません。'
        : 'この状態では一括入庫できません（' + getStatus(record) + '）';
      space.appendChild(note);
      return;
    }

    const counts = Engine.countLineResults(record[C.UF.inboundLines]);
    const hint = document.createElement('div');
    hint.style.marginBottom = '8px';
    hint.style.fontSize = '13px';
    hint.textContent = '明細 ' + counts.total + ' 件（成功 ' + counts.success
      + ' / エラー ' + counts.errors + ' / 待機 ' + counts.waiting + '）';
    space.appendChild(hint);

    if (counts.errors > 0) {
      const err = document.createElement('div');
      err.style.color = '#c0392b';
      err.style.marginBottom = '8px';
      err.textContent = 'エラー行があるため一括入庫できません。行を削除するか原因を解消して再スキャンしてください。';
      space.appendChild(err);
    }

    const btn = document.createElement('button');
    btn.id = BATCH_BUTTON_ID;
    btn.type = 'button';
    btn.className = 'kintoneplugin-button-dialog-ok';
    btn.textContent = '一括入庫確定';
    const canRun = counts.total > 0 && counts.errors === 0
      && (counts.waiting > 0 || counts.success === counts.total);
    btn.disabled = !canRun;
    btn.onclick = function() {
      if (!window.confirm('一括入庫を実行します。App16 / 27 / 28 / 74 を更新します。\nよろしいですか？')) {
        return;
      }

      btn.disabled = true;
      btn.textContent = '処理中…';

      Engine.runBatchConfirm(recordId)
        .then(function(res) {
          window.alert(res.message || '完了しました');
          window.location.reload();
        })
        .catch(function(err) {
          window.alert('一括入庫が中断されました\n\n' + C.formatKintoneError(err));
          showMessage('中断: ' + C.formatKintoneError(err), true);
          renderBatchButton(recordId, kintone.app.record.get().record);
        });
    };

    space.appendChild(btn);
  };

  const buildChangeEvents = () => BARCODE_FIELDS.map(function(fieldCode) {
    return [
      'app.record.create.change.' + fieldCode,
      'app.record.edit.change.' + fieldCode,
    ];
  }).flat();

  kintone.events.on(buildChangeEvents(), function(event) {
    if (!isDraft(event.record)) {
      return event;
    }

    queueScanFromChange();
    return event;
  });

  kintone.events.on([
    'app.record.create.show',
    'app.record.edit.show',
  ], function(event) {
    loadInboundLineFieldMeta().catch(function(err) {
      console.warn('[inbound_desktop] 明細フィールド定義の取得に失敗:', err);
    });

    removeEmptySubtableRows(event.record);
    ensureDefaultHeader(event.record);
    syncHeaderCounts(event.record);

    if (isDraft(event.record)) {
      showMessage(
        '【バーコード入力】に管理番号 → Enter で明細追加（連続可）。\n'
        + '国内外注・海外外注・和裁士の未入庫を自動判定します（和裁士入庫もこの画面で可）。\n'
        + '未入庫が1件のときは確認なし。複数あるときだけまとめて入庫するか確認します。\n'
        + '明細の管理番号欄で Enter も可。空の明細行（＋）は使わないでください。',
        false
      );
      setTimeout(function() {
        focusBarcode();
        scheduleBarcodeInputBind();
        const space = kintone.app.record.getSpaceElement(ACTION_SPACE_ID);

        if (space && !space.querySelector('#inbound-unified-scan-btn')) {
          space.innerHTML = '';
          appendScanActionButton(space);
        }
      }, 300);
    } else if (isConfirmed(event.record)) {
      showMessage('入庫確定済み — 編集・スキャンはできません', false);
    }

    if (event.type.indexOf('edit.show') >= 0 && event.recordId) {
      setTimeout(function() {
        renderBatchButton(event.recordId, kintone.app.record.get().record);
      }, 400);
    }

    return event;
  });

  kintone.events.on('app.record.detail.show', function(event) {
    setTimeout(function() {
      renderBatchButton(event.recordId, event.record);
    }, 300);
    return event;
  });

  kintone.events.on([
    'app.record.create.submit',
    'app.record.edit.submit',
  ], async function(event) {
    try {
      if (blockSubmitForBarcodeEnter) {
        blockSubmitForBarcodeEnter = false;
        return false;
      }

      removeEmptySubtableRows(event.record);
      syncHeaderCounts(event.record);

      if (isConfirmed(event.record)) {
        event.error = '入庫確定済みのため保存できません';
        return event;
      }

      await loadInboundLineFieldMeta();

      const pendingBarcode = resolveBarcodeValue(event.record);
      const inboundDate = getInboundDate(event.record);

      if (pendingBarcode && pendingBarcode.length >= MANAGE_NO_MIN_LENGTH) {
        if (!inboundDate) {
          event.error = '入庫日を入力してから保存してください';
          return event;
        }

        const scanResult = await addScannedLineToRecord(
          event.record,
          pendingBarcode,
          inboundDate
        );

        if (!scanResult.ok && !hasValidInboundLine(event.record)) {
          event.error = '明細を自動作成できませんでした: '
            + (scanResult.errorMessage || 'スキャンエラー');
          return event;
        }
      }

      removeEmptySubtableRows(event.record);
      normalizeInboundLinesTable(event.record);
      ensureDefaultHeader(event.record);
      syncHeaderCounts(event.record);
      clearBarcode(event.record);

      if (!hasValidInboundLine(event.record)) {
        const table = event.record[C.UF.inboundLines];
        const rowCount = table?.value?.length ?? 0;

        if (rowCount > 0) {
          event.error = '明細に空行があります。【バーコード入力】にスキャンしてから保存してください'
            + '（サブテーブルの「＋」で空行を足さないでください）';
          return event;
        }
      }

      const counts = Engine.countLineResults(event.record[C.UF.inboundLines]);

      if (counts.errors > 0) {
        showMessage('エラー行が ' + counts.errors + ' 件あります。一括入庫前に解消してください。', true);
      }

      return event;
    } catch (err) {
      event.error = '明細の整形に失敗しました: ' + C.formatKintoneError(err);
      return event;
    }
  });

})();
