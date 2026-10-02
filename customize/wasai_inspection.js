(function() {
  'use strict';

  /**
   * 和裁士出庫 App 74 — 入庫・検品（詳細 / 編集画面）
   * 依存: wasai_config.js
   */

  if (!window.CAYANAS_Wasai) {
    console.error('[wasai_inspection] wasai_config.js を先に読み込んでください。');
    return;
  }

  const W = window.CAYANAS_Wasai;

  if (kintone.app.getId() !== W.APP.wasaiOutbound) {
    return;
  }

  const ACTION_SPACE_ID = 'action_space';
  const MESSAGE_SPACE_ID = 'message_space';
  const PANEL_ID = 'wasai-inbound-inspection-panel';

  const resolveActionSpace = () => (
    kintone.app.record.getSpaceElement(ACTION_SPACE_ID)
    || kintone.app.record.getSpaceElement(MESSAGE_SPACE_ID)
  );

  let outboundFormProperties = null;

  const todayYmd = () => {
    const d = new Date();
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  };

  const loadOutboundFormProperties = async () => {
    if (outboundFormProperties) {
      return outboundFormProperties;
    }

    const resp = await kintone.api(
      kintone.api.url('/k/v1/app/form/fields.json', true),
      'GET',
      { app: W.APP.wasaiOutbound }
    );

    outboundFormProperties = resp.properties || {};
    return outboundFormProperties;
  };

  const getOutboundLinesTableCode = (properties) => {
    if (properties[W.F.outboundLines]) {
      return W.F.outboundLines;
    }

    return W.F.outboundLines;
  };

  const pickLineFieldValue = (properties, tableCode, fieldCode, preferredValues) => {
    const tableProp = properties[tableCode];
    const fieldProp = tableProp?.fields?.[fieldCode];

    if (fieldProp && (fieldProp.type === 'DROP_DOWN' || fieldProp.type === 'RADIO_BUTTON')) {
      const picked = W.pickDropdownValue(fieldProp, preferredValues, preferredValues[0], false);
      return picked || preferredValues[0];
    }

    return preferredValues[0];
  };

  const fetchOutboundRecord = async (recordId) => {
    const resp = await kintone.api(
      kintone.api.url('/k/v1/record.json', true),
      'GET',
      { app: W.APP.wasaiOutbound, id: recordId }
    );

    return resp.record;
  };

  const buildLineUpdates = (record, tableCode, lineId, patch) => {
    const table = record[tableCode];

    return table.value.map(function(row) {
      if (String(row.id) !== String(lineId)) {
        return { id: row.id, value: {} };
      }

      const value = {};

      Object.keys(patch).forEach(function(key) {
        value[key] = { value: patch[key] };
      });

      return { id: row.id, value: value };
    });
  };

  const putOutboundLinePatch = async (recordId, tableCode, lineId, patch) => {
    const record = await fetchOutboundRecord(recordId);

    await kintone.api(
      kintone.api.url('/k/v1/record.json', true),
      'PUT',
      {
        app: W.APP.wasaiOutbound,
        id: recordId,
        record: {
          [tableCode]: {
            value: buildLineUpdates(record, tableCode, lineId, patch),
          },
        },
      }
    );
  };

  const notifyApp16Skip = (contextLabel) => {
    alert(
      contextLabel + '\n\n'
      + '受注明細(App16)は更新できませんでした。App74は更新済みです。\n'
      + 'App16の選択肢: process_status に「和裁士戻り」、location_status に「本社」'
    );
  };

  const ORDER_RETURN_PROCESS_NAMES = [W.ORDER_WASAI_RETURN_PROCESS, '和裁士戻り', '外注戻り'];
  const ORDER_HQ_LOCATION_NAMES = [W.ORDER_HQ_LOCATION, '本社'];

  const getOrderInboundSyncState = (orderRecord) => {
    if (!orderRecord) {
      return { code: 'no_order', processStatus: '', locationStatus: '' };
    }

    const processStatus = String(W.getFieldValue(orderRecord, W.ORDER.processStatus) ?? '').trim();
    const locationStatus = String(W.getFieldValue(orderRecord, W.ORDER.locationStatus) ?? '').trim();

    if (ORDER_RETURN_PROCESS_NAMES.indexOf(processStatus) >= 0
      && ORDER_HQ_LOCATION_NAMES.indexOf(locationStatus) >= 0) {
      return { code: 'synced', processStatus: processStatus, locationStatus: locationStatus };
    }

    if (processStatus === W.ORDER_WASAI_PROCESS && locationStatus === W.ORDER_WASAI_LOCATION) {
      return { code: 'wasai_outbound', processStatus: processStatus, locationStatus: locationStatus };
    }

    return { code: 'other', processStatus: processStatus, locationStatus: locationStatus };
  };

  const lineHasInboundData = (lineStatus, inboundDate) => {
    if (inboundDate === '') {
      return false;
    }

    return !isStillOutboundPhase(lineStatus);
  };

  const pushApp16Inbound = async (manageNo, inboundDateYmd, contextLabel) => {
    const orderRecord = await W.fetchOrderByManageNo(manageNo);

    if (!orderRecord) {
      alert(contextLabel + '\n\n受注明細(App16)が見つかりません。');
      return false;
    }

    const orderUpdate = await W.updateOrderForWasai(orderRecord, 'inbound', inboundDateYmd);

    if (orderUpdate.skipped) {
      notifyApp16Skip(contextLabel);
      return false;
    }

    return true;
  };

  const applyInbound = async (recordId, lineId, manageNo, inboundDateYmd) => {
    const normalizedDate = String(inboundDateYmd ?? '').trim();
    const normalizedManageNo = String(manageNo ?? '').trim();

    if (!normalizedDate) {
      throw new Error('入庫日を入力してください。');
    }

    const properties = await loadOutboundFormProperties();
    const tableCode = getOutboundLinesTableCode(properties);
    const lineStatusValue = pickLineFieldValue(
      properties,
      tableCode,
      W.LINE.lineStatus,
      [W.LINE_STATUS.inbound]
    );

    await putOutboundLinePatch(recordId, tableCode, lineId, {
      [W.LINE.inboundDate]: normalizedDate,
      [W.LINE.lineStatus]: lineStatusValue,
    });

    await pushApp16Inbound(normalizedManageNo, normalizedDate, 'App74に入庫を登録しました。');
    location.reload();
  };

  const syncApp16InboundOnly = async (manageNo, inboundDateYmd) => {
    const normalizedDate = String(inboundDateYmd ?? '').trim();
    const normalizedManageNo = String(manageNo ?? '').trim();

    if (!normalizedDate) {
      throw new Error('入庫日が空です。');
    }

    const ok = await pushApp16Inbound(
      normalizedManageNo,
      normalizedDate,
      'App16を入庫状態に更新しました。'
    );

    if (ok) {
      alert('App16を更新しました（和裁士戻り / 本社）。');
      location.reload();
    }
  };

  const applyInspection = async (recordId, lineId, inspectionResult, nextLineStatus, extraPatch) => {
    const properties = await loadOutboundFormProperties();
    const tableCode = getOutboundLinesTableCode(properties);
    const inspectionResultValue = pickLineFieldValue(
      properties,
      tableCode,
      W.LINE.inspectionResult,
      [inspectionResult]
    );
    const lineStatusValue = pickLineFieldValue(
      properties,
      tableCode,
      W.LINE.lineStatus,
      [nextLineStatus]
    );

    const patch = {
      [W.LINE.inspectionResult]: inspectionResultValue,
      [W.LINE.inspectionDate]: todayYmd(),
      [W.LINE.lineStatus]: lineStatusValue,
    };

    if (extraPatch && typeof extraPatch === 'object') {
      const tableProp = properties[tableCode];
      const subFields = tableProp?.fields || {};

      Object.keys(extraPatch).forEach(function(key) {
        if (subFields[key]) {
          patch[key] = extraPatch[key];
        }
      });
    }

    await putOutboundLinePatch(recordId, tableCode, lineId, patch);
    location.reload();
  };

  const isInspectionLocked = (lineStatus, billingStatus) => {
    if (billingStatus === W.BILLING_STATUS.billed || billingStatus === W.BILLING_STATUS.paid) {
      return true;
    }

    if (lineStatus === W.LINE_STATUS.billed || lineStatus === W.LINE_STATUS.paid) {
      return true;
    }

    return false;
  };

  const normalizeLineStatus = (lineStatus) => {
    const status = String(lineStatus ?? '').trim();

    return status === '' ? W.LINE_STATUS.outbound : status;
  };

  const isStillOutboundPhase = (lineStatus) => (
    normalizeLineStatus(lineStatus) === W.LINE_STATUS.outbound
  );

  /** 出庫中 → 入庫済（入庫日だけ手入力で行状態が出庫中のまま、も含む） */
  const canShowInboundAction = (lineStatus, inboundDate) => {
    if (!isStillOutboundPhase(lineStatus)) {
      return false;
    }

    return true;
  };

  const canInspectLine = (lineStatus, inboundDate, locked) => {
    if (locked) {
      return false;
    }

    if (inboundDate === '') {
      return false;
    }

    return lineStatus === W.LINE_STATUS.inbound;
  };

  const renderPanel = async (recordId, record) => {
    const space = resolveActionSpace();

    if (!space) {
      console.warn(
        '[wasai_inspection] スペースフィールドがありません。'
        + ' 要素ID「' + ACTION_SPACE_ID + '」または「' + MESSAGE_SPACE_ID + '」を App74 に追加してください。'
      );
      return;
    }

    const existing = document.getElementById(PANEL_ID);

    if (existing) {
      existing.remove();
    }

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = 'padding:12px;border:1px solid #ccc;margin:8px 0;background:#fafafa;';

    const title = document.createElement('p');
    title.textContent = '和裁士 — 入庫・検品';
    title.style.fontWeight = 'bold';
    panel.appendChild(title);

    const hint = document.createElement('p');
    hint.style.cssText = 'font-size:12px;color:#555;margin:4px 0 12px;';
    hint.textContent =
      'App16連携は下のボタンから行います（サブテーブルを手入力して保存しただけでは App16 は変わりません）。'
      + ' 検品OKのみ支払対象（billing_status は未計上のまま）。';
    panel.appendChild(hint);

    const table = record[W.F.outboundLines];

    if (!table || !Array.isArray(table.value) || table.value.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = '出庫明細がありません。';
      panel.appendChild(empty);
      space.appendChild(panel);
      return;
    }

    let hasAnyAction = false;

    for (let rowIndex = 0; rowIndex < table.value.length; rowIndex += 1) {
      const row = table.value[rowIndex];
      const manageNo = String(W.getFieldValue(row.value, W.LINE.manageNo) ?? '').trim();
      const lineStatus = String(W.getFieldValue(row.value, W.LINE.lineStatus) ?? '').trim();
      const inboundDate = String(W.getFieldValue(row.value, W.LINE.inboundDate) ?? '').trim();
      const billingStatus = String(W.getFieldValue(row.value, W.LINE.billingStatus) ?? '').trim();
      const inspectionResult = String(W.getFieldValue(row.value, W.LINE.inspectionResult) ?? '').trim();
      const locked = isInspectionLocked(lineStatus, billingStatus);
      let lineHasAction = false;

      if (canShowInboundAction(lineStatus, inboundDate)) {
        lineHasAction = true;
        hasAnyAction = true;
        const rowBox = document.createElement('div');
        rowBox.style.cssText = 'margin-bottom:10px;padding:8px;border:1px solid #ddd;background:#fff;';

        const label = document.createElement('div');
        const statusLabel = normalizeLineStatus(lineStatus);

        if (inboundDate !== '') {
          label.textContent = '【入庫】' + manageNo + ' — 入庫日は入力済みですが行状態が「'
            + statusLabel + '」のままです';
        } else {
          label.textContent = '【入庫】' + manageNo + '（' + statusLabel + '）';
        }

        label.style.fontWeight = 'bold';
        rowBox.appendChild(label);

        const controls = document.createElement('div');
        controls.style.marginTop = '6px';

        const dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.value = inboundDate !== '' ? inboundDate : todayYmd();
        dateInput.style.marginRight = '8px';
        controls.appendChild(dateInput);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = '入庫登録';
        btn.className = 'kintoneplugin-button-normal';
        btn.onclick = function() {
          if (!window.confirm(manageNo + ' を入庫済にしますか？\n入庫日: ' + dateInput.value)) {
            return;
          }

          btn.disabled = true;
          applyInbound(recordId, row.id, manageNo, dateInput.value).catch(function(err) {
            btn.disabled = false;
            alert(W.formatKintoneError(err));
          });
        };
        controls.appendChild(btn);
        rowBox.appendChild(controls);
        panel.appendChild(rowBox);
      }

      if (lineHasInboundData(lineStatus, inboundDate) && manageNo !== '') {
        let orderRecord = null;
        let syncState = { code: 'no_order', processStatus: '', locationStatus: '' };

        try {
          orderRecord = await W.fetchOrderByManageNo(manageNo);
          syncState = getOrderInboundSyncState(orderRecord);
        } catch (fetchErr) {
          console.warn('[wasai_inspection] App16 fetch', manageNo, fetchErr);
          syncState = { code: 'fetch_error', processStatus: '', locationStatus: '' };
        }

        if (syncState.code !== 'synced') {
          lineHasAction = true;
          hasAnyAction = true;
          const rowBox = document.createElement('div');
          rowBox.style.cssText = 'margin-bottom:10px;padding:8px;border:1px solid #f90;background:#fff8e6;';

          const label = document.createElement('div');
          label.style.fontWeight = 'bold';

          if (syncState.code === 'wasai_outbound') {
            label.textContent = '【App16連携】' + manageNo + ' — 和裁士出庫のまま（要反映）';
          } else if (syncState.code === 'no_order') {
            label.textContent = '【App16連携】' + manageNo + ' — 受注が見つかりません（反映を試す）';
          } else if (syncState.code === 'fetch_error') {
            label.textContent = '【App16連携】' + manageNo + ' — App16参照エラー（権限を確認）';
          } else {
            label.textContent = '【App16連携】' + manageNo
              + ' — 現在 ' + syncState.processStatus + ' / ' + syncState.locationStatus;
          }

          rowBox.appendChild(label);

          const note = document.createElement('div');
          note.style.cssText = 'font-size:12px;margin:4px 0 6px;';
          note.textContent = 'App74は入庫済（' + inboundDate + '）。App16 を和裁士戻り / 本社に更新します。';
          rowBox.appendChild(note);

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = 'App16へ入庫を反映';
          btn.className = 'kintoneplugin-button-normal';
          btn.onclick = function() {
            if (!window.confirm(manageNo + ' の入庫を App16 に反映しますか？')) {
              return;
            }

            btn.disabled = true;
            syncApp16InboundOnly(manageNo, inboundDate).catch(function(err) {
              btn.disabled = false;
              alert(W.formatKintoneError(err));
            });
          };
          rowBox.appendChild(btn);
          panel.appendChild(rowBox);
        } else {
          lineHasAction = true;
          const synced = document.createElement('div');
          synced.style.cssText = 'margin-bottom:8px;font-size:13px;color:#060;';
          synced.textContent = manageNo + ' — App16連携済（'
            + syncState.processStatus + ' / ' + syncState.locationStatus + '）';
          panel.appendChild(synced);
        }
      }

      if (canInspectLine(lineStatus, inboundDate, locked)) {
        lineHasAction = true;
        hasAnyAction = true;
        const rowBox = document.createElement('div');
        rowBox.style.cssText = 'margin-bottom:10px;padding:8px;border:1px solid #ddd;background:#fff;';

        const label = document.createElement('div');
        label.textContent = '【検品】' + manageNo + '（入庫済 / 入庫日 ' + inboundDate + '）';
        label.style.fontWeight = 'bold';
        rowBox.appendChild(label);

        const controls = document.createElement('div');
        controls.style.marginTop = '6px';

        const mkBtn = (text, onClick) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = text;
          b.className = 'kintoneplugin-button-normal';
          b.style.marginRight = '6px';
          b.onclick = onClick;
          return b;
        };

        controls.appendChild(mkBtn('検品OK', function() {
          if (!window.confirm(manageNo + ' を検品OKにしますか？')) {
            return;
          }

          applyInspection(
            recordId,
            row.id,
            W.INSPECTION.ok,
            W.LINE_STATUS.inspectionOk
          ).catch(function(err) {
            alert(W.formatKintoneError(err));
          });
        }));

        controls.appendChild(mkBtn('再加工', function() {
          const note = window.prompt(manageNo + ' の再加工理由（rework_note）を入力してください。', '');

          if (note === null) {
            return;
          }

          if (String(note).trim() === '') {
            alert('再加工の場合は rework_note を入力してください。');
            return;
          }

          applyInspection(
            recordId,
            row.id,
            W.INSPECTION.rework,
            W.LINE_STATUS.rework,
            { [W.LINE.reworkNote]: String(note).trim() }
          ).catch(function(err) {
            alert(W.formatKintoneError(err));
          });
        }));

        controls.appendChild(mkBtn('保留', function() {
          if (!window.confirm(manageNo + ' を保留にしますか？')) {
            return;
          }

          applyInspection(
            recordId,
            row.id,
            W.INSPECTION.hold,
            W.LINE_STATUS.hold
          ).catch(function(err) {
            alert(W.formatKintoneError(err));
          });
        }));

        rowBox.appendChild(controls);
        panel.appendChild(rowBox);
      }

      if (!lineHasAction) {
        const done = document.createElement('div');
        done.style.cssText = 'margin-bottom:6px;font-size:13px;color:#666;';
        done.textContent = manageNo + ' — ' + lineStatus
          + (inspectionResult ? ' / 検品:' + inspectionResult : '')
          + (inboundDate ? ' / 入庫:' + inboundDate : '');
        panel.appendChild(done);
      }
    }

    if (!hasAnyAction) {
      const note = document.createElement('p');
      note.style.color = '#666';
      note.textContent = '操作できる明細がありません（出庫中→入庫、入庫済→検品）。';
      panel.appendChild(note);
    }

    space.appendChild(panel);
  };

  const onRecordShow = (event) => {
    const recordId = event.record.$id.value;

    loadFormPropertiesSafe()
      .then(function() {
        return renderPanel(recordId, event.record);
      })
      .catch(function(err) {
        console.error('[wasai_inspection] renderPanel', err);
        const space = resolveActionSpace();

        if (space) {
          space.innerHTML = '<div style="padding:8px;color:#c00;">入庫・検品パネルエラー: '
            + String(err?.message || err).replace(/</g, '&lt;')
            + '</div>';
        }
      });

    return event;
  };

  const loadFormPropertiesSafe = () => {
    return loadOutboundFormProperties().catch(function(err) {
      console.warn('[wasai_inspection] form fields', err);
      return {};
    });
  };

  kintone.events.on('app.record.detail.show', onRecordShow);
  kintone.events.on('app.record.edit.show', onRecordShow);

})();
