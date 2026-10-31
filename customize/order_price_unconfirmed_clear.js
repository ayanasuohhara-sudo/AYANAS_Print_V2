(function () {
  'use strict';

  /**
   * App16 受注明細 — 価格未定の手動解除
   * 依存: additional_item_engine.js（任意。無くても単体動作）
   *
   * detail_table.unit_price の変更イベントは kintone で安全に取れる
   * （既存 price_master_register.js も同イベントを使用）。
   *
   * price_unconfirmed が ON の行で unit_price が変わったときだけ確認する。
   * API 経由の自動追加では本画面の change は発火しない。
   */

  const ORDER_APP_ID = 16;
  const DETAIL_TABLE = 'detail_table';
  const UNIT_PRICE = 'unit_price';
  const PRICE_UNCONFIRMED = 'price_unconfirmed';
  const OPTION = '価格未定';

  if (typeof kintone === 'undefined') {
    return;
  }

  if (Number(kintone.app.getId()) !== ORDER_APP_ID) {
    return;
  }

  const Engine = window.CAYANAS_AdditionalItemEngine;
  const optionLabel = (Engine && Engine.PRICE_UNCONFIRMED_OPTION) || OPTION;

  /** rowId（または仮キー）→ 直近の unit_price 文字列 */
  const previousUnitPriceByRow = new Map();

  /** プログラムからの復元中は確認を出さない */
  let suppressConfirm = false;

  const getFieldValue = (rowValue, fieldCode) => {
    if (Engine && typeof Engine.getFieldValue === 'function') {
      return Engine.getFieldValue(rowValue, fieldCode);
    }

    const field = rowValue?.[fieldCode];

    if (!field || field.value === null || field.value === undefined) {
      return '';
    }

    return field.value;
  };

  const isUnconfirmed = (rowValue) => {
    if (Engine && typeof Engine.isPriceUnconfirmedRow === 'function') {
      return Engine.isPriceUnconfirmedRow(rowValue);
    }

    const raw = getFieldValue(rowValue, PRICE_UNCONFIRMED);
    return Array.isArray(raw) && raw.indexOf(optionLabel) >= 0;
  };

  const rowKey = (row, index) => {
    if (row && row.id !== undefined && row.id !== null && String(row.id) !== '') {
      return 'id:' + String(row.id);
    }

    return 'idx:' + String(index);
  };

  const unitPriceText = (rowValue) => {
    const raw = getFieldValue(rowValue, UNIT_PRICE);

    if (raw === null || raw === undefined) {
      return '';
    }

    return String(raw);
  };

  const seedPreviousPrices = (record) => {
    previousUnitPriceByRow.clear();
    const table = record?.[DETAIL_TABLE];
    const rows = Array.isArray(table?.value) ? table.value : [];

    rows.forEach(function (row, index) {
      previousUnitPriceByRow.set(rowKey(row, index), unitPriceText(row.value));
    });
  };

  const findRowIndex = (record, changedRow) => {
    const table = record?.[DETAIL_TABLE];
    const rows = Array.isArray(table?.value) ? table.value : [];

    if (!changedRow) {
      return -1;
    }

    if (changedRow.id !== undefined && changedRow.id !== null) {
      for (let i = 0; i < rows.length; i += 1) {
        if (String(rows[i].id) === String(changedRow.id)) {
          return i;
        }
      }
    }

    return rows.indexOf(changedRow);
  };

  kintone.events.on([
    'app.record.create.show',
    'app.record.edit.show',
  ], (event) => {
    seedPreviousPrices(event.record);
    return event;
  });

  kintone.events.on([
    'app.record.create.change.' + UNIT_PRICE,
    'app.record.edit.change.' + UNIT_PRICE,
  ], (event) => {
    if (suppressConfirm) {
      return event;
    }

    const changedRow = event.changes && event.changes.row;

    if (!changedRow || !changedRow.value) {
      return event;
    }

    if (!isUnconfirmed(changedRow.value)) {
      const index = findRowIndex(event.record, changedRow);
      previousUnitPriceByRow.set(rowKey(changedRow, index), unitPriceText(changedRow.value));
      return event;
    }

    const index = findRowIndex(event.record, changedRow);
    const key = rowKey(changedRow, index);
    const prev = previousUnitPriceByRow.has(key)
      ? previousUnitPriceByRow.get(key)
      : '';
    const next = unitPriceText(changedRow.value);

    if (prev === next) {
      return event;
    }

    const itemCode = String(getFieldValue(changedRow.value, 'item_code') ?? '').trim();
    const itemName = String(getFieldValue(changedRow.value, 'item_name') ?? '').trim();
    const label = [itemCode, itemName].filter(Boolean).join(' ');

    const accepted = window.confirm(
      'この加工の価格未定を解除しますか？\n'
      + (label ? '\n対象：' + label + '\n' : '\n')
      + '\nOK：価格未定を解除します\n'
      + 'キャンセル：価格未定のままにし、単価を元に戻します'
    );

    if (accepted) {
      if (!changedRow.value[PRICE_UNCONFIRMED]) {
        changedRow.value[PRICE_UNCONFIRMED] = { type: 'CHECK_BOX', value: [] };
      }

      changedRow.value[PRICE_UNCONFIRMED].value = [];
      previousUnitPriceByRow.set(key, next);
      return event;
    }

    suppressConfirm = true;

    try {
      if (!changedRow.value[UNIT_PRICE]) {
        changedRow.value[UNIT_PRICE] = { type: 'NUMBER', value: null };
      }

      if (prev === '') {
        changedRow.value[UNIT_PRICE].value = null;
      } else {
        const asNum = Number(prev);
        changedRow.value[UNIT_PRICE].value = Number.isFinite(asNum) ? asNum : prev;
      }
    } finally {
      setTimeout(function () {
        suppressConfirm = false;
      }, 0);
    }

    return event;
  });

})();
