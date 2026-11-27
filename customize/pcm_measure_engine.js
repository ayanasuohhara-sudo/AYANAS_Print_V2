(function () {
  'use strict';

  /**
   * PCM 寸法履歴 — 純ロジック（現行フラグ・区分検証）
   * 読込順: pcm_config → 本ファイル → pcm_measure_panel
   *
   * サブテーブル保全:
   * - 行の削除・数値のクリアは行わない
   * - 現行フラグの付け替えのみ（他行の is_current から「現行」を外す）
   */

  const C = window.CAYANAS_PCM;
  if (!C || !C.MEASURE) {
    console.error('[pcm_measure_engine] pcm_config.js（MEASURE）を先に読み込んでください。');
    return;
  }

  const M = C.MEASURE;

  const readCell = (rowValue, code) => {
    const field = rowValue && rowValue[code];
    if (!field || field.value === null || field.value === undefined) {
      return '';
    }
    if (Array.isArray(field.value)) {
      return field.value;
    }
    return field.value;
  };

  const isCurrentChecked = (rowValue) => {
    const value = readCell(rowValue, M.isCurrent);
    if (Array.isArray(value)) {
      return value.indexOf(M.currentOption) >= 0;
    }
    return String(value) === M.currentOption;
  };

  const normalizeLabel = (label) => String(label || '').trim();

  /**
   * 現行の一意キー: 寸法区分 × 対象 × 寸法名称
   * （名称空は「（無名称）」として同一グループ）
   */
  const currentGroupKey = (kind, garment, label) => {
    const k = String(kind || '').trim();
    const g = String(garment || '').trim();
    const l = normalizeLabel(label) || '（無名称）';
    return k + '\u0001' + g + '\u0001' + l;
  };

  const rowGroupKey = (rowValue) => currentGroupKey(
    readCell(rowValue, M.measureKind),
    readCell(rowValue, M.garmentType),
    readCell(rowValue, M.measureLabel)
  );

  const validateKindGarment = (kind, garment) => {
    if (!kind) {
      return '寸法区分を選んでください。';
    }
    if (!garment) {
      return '対象（身体・長着など）を選んでください。';
    }
    if (kind === M.kinds.body && garment !== M.garments.body) {
      return '身体寸法の対象は「身体」にしてください。';
    }
    if (kind === M.kinds.finish && garment === M.garments.body) {
      return '仕上がり寸法の対象に「身体」は使えません。';
    }
    return '';
  };

  /**
   * サブテーブル行配列を走査し、同一グループ内の現行を最新1件に正規化。
   * @param {Array} tableRows kintone subtable value [{id, value}]
   * @param {{preferIndex?: number}} options preferIndex を現行にしたい行（編集中の行）
   * @returns {{rows: Array, changed: boolean, warnings: string[]}}
   */
  const normalizeCurrentFlags = (tableRows, options) => {
    const opts = options || {};
    const rows = Array.isArray(tableRows) ? tableRows : [];
    const warnings = [];
    const preferIndex = Number.isInteger(opts.preferIndex) ? opts.preferIndex : -1;

    const groups = new Map();
    rows.forEach((row, index) => {
      const value = row && row.value ? row.value : {};
      if (!isCurrentChecked(value)) {
        return;
      }
      const key = rowGroupKey(value);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(index);
    });

    let changed = false;
    const next = rows.map((row) => {
      const clone = {
        id: row.id,
        value: Object.assign({}, row.value),
      };
      Object.keys(row.value || {}).forEach((code) => {
        const src = row.value[code];
        clone.value[code] = {
          type: src.type,
          value: Array.isArray(src.value) ? src.value.slice() : src.value,
        };
      });
      return clone;
    });

    groups.forEach((indexes) => {
      let keep = indexes[indexes.length - 1];
      if (preferIndex >= 0 && indexes.indexOf(preferIndex) >= 0) {
        keep = preferIndex;
      }
      if (indexes.length > 1) {
        warnings.push('同一の区分・対象・名称で現行が複数あったため、1件に揃えました。');
      }
      indexes.forEach((index) => {
        const cell = next[index].value[M.isCurrent];
        if (!cell) {
          return;
        }
        if (index === keep) {
          if (!Array.isArray(cell.value) || cell.value.indexOf(M.currentOption) < 0) {
            cell.value = [M.currentOption];
            changed = true;
          }
        } else if (Array.isArray(cell.value) && cell.value.indexOf(M.currentOption) >= 0) {
          cell.value = cell.value.filter((v) => v !== M.currentOption);
          changed = true;
        }
      });
    });

    return { rows: next, changed: changed, warnings: warnings };
  };

  /**
   * 保存前検証。行データは消さず、エラー文字列を返す。
   */
  const validateMeasureTable = (tableRows) => {
    const rows = Array.isArray(tableRows) ? tableRows : [];
    const errors = [];
    rows.forEach((row, index) => {
      const value = row && row.value ? row.value : {};
      const kind = String(readCell(value, M.measureKind) || '').trim();
      const garment = String(readCell(value, M.garmentType) || '').trim();
      const measuredAt = String(readCell(value, M.measuredAt) || '').trim();
      const emptyRow = !kind && !garment && !measuredAt
        && !normalizeLabel(readCell(value, M.measureLabel));
      if (emptyRow) {
        return;
      }
      if (!measuredAt) {
        errors.push('寸法履歴 ' + (index + 1) + '行目: 採寸日は必須です。');
      }
      const vg = validateKindGarment(kind, garment);
      if (vg) {
        errors.push('寸法履歴 ' + (index + 1) + '行目: ' + vg);
      }
    });
    return errors;
  };

  const dimensionCodes = () => ([
    M.heightCm, M.mitakeCm, M.yukiCm, M.katahabaCm, M.sodeCm, M.sodehabaCm,
    M.maehabaCm, M.ushirohabaCm, M.susoCm, M.eriCm, M.bustCm, M.waistCm, M.hipCm,
  ]);

  const formatCm = (value) => {
    if (value === null || value === undefined || value === '') {
      return '';
    }
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return String(value);
    }
    return String(n);
  };

  const pickCurrentRows = (tableRows) => {
    const rows = Array.isArray(tableRows) ? tableRows : [];
    return rows.filter((row) => isCurrentChecked(row && row.value)).map((row) => {
      const value = row.value || {};
      const dims = {};
      dimensionCodes().forEach((code) => {
        const raw = readCell(value, code);
        if (raw !== '' && raw !== null && raw !== undefined) {
          dims[code] = raw;
        }
      });
      return {
        measuredAt: readCell(value, M.measuredAt),
        measureKind: readCell(value, M.measureKind),
        garmentType: readCell(value, M.garmentType),
        measureLabel: readCell(value, M.measureLabel),
        manageNo: readCell(value, M.manageNo),
        measureNote: readCell(value, M.measureNote),
        dims: dims,
      };
    });
  };

  const sortHistoryRows = (tableRows) => {
    const rows = (Array.isArray(tableRows) ? tableRows : []).slice();
    rows.sort((a, b) => {
      const da = String(readCell(a.value, M.measuredAt) || '');
      const db = String(readCell(b.value, M.measuredAt) || '');
      if (da !== db) {
        return db.localeCompare(da);
      }
      return String(b.id || '').localeCompare(String(a.id || ''));
    });
    return rows;
  };

  /**
   * submit 時: 検証＋現行フラグ正規化。テーブル欠落時は何もしない（履歴保護）。
   */
  const prepareRecordForSubmit = (record) => {
    const tableField = record && record[M.table];
    if (!tableField || !Array.isArray(tableField.value)) {
      return { ok: true, skipped: true, record: record, warnings: [] };
    }
    const errors = validateMeasureTable(tableField.value);
    if (errors.length) {
      return { ok: false, error: errors.join('\n'), record: record, warnings: [] };
    }
    const normalized = normalizeCurrentFlags(tableField.value, {});
    const next = Object.assign({}, record);
    next[M.table] = {
      type: tableField.type || 'SUBTABLE',
      value: normalized.rows,
    };
    return {
      ok: true,
      skipped: false,
      record: next,
      warnings: normalized.warnings,
      changed: normalized.changed,
    };
  };

  window.CAYANAS_PCM_Measure = {
    readCell: readCell,
    isCurrentChecked: isCurrentChecked,
    normalizeLabel: normalizeLabel,
    currentGroupKey: currentGroupKey,
    rowGroupKey: rowGroupKey,
    validateKindGarment: validateKindGarment,
    normalizeCurrentFlags: normalizeCurrentFlags,
    validateMeasureTable: validateMeasureTable,
    dimensionCodes: dimensionCodes,
    formatCm: formatCm,
    pickCurrentRows: pickCurrentRows,
    sortHistoryRows: sortHistoryRows,
    prepareRecordForSubmit: prepareRecordForSubmit,
  };
}());
