'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;
global.kintone = {};

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/pcm_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/pcm_measure_engine.js'), 'utf8'));

const C = global.CAYANAS_PCM;
const M = C.MEASURE;
const Eng = global.CAYANAS_PCM_Measure;

let failed = 0;
const assert = (name, cond) => {
  if (cond) {
    console.log('OK  ' + name);
    return;
  }
  failed += 1;
  console.error('FAIL ' + name);
};

assert('config version p1', C.VERSION === '1.2.0-p1-measure');
assert('MEASURE table code', M.table === 'measure_history');
assert('kinds body/finish', M.kinds.body === '身体寸法' && M.kinds.finish === '仕上がり寸法');
assert('garments include hakama', M.garments.hakama === '袴');

assert(
  'validate body needs garment 身体',
  Eng.validateKindGarment(M.kinds.body, M.garments.nagagi).indexOf('身体') >= 0
);
assert(
  'validate finish rejects 身体',
  Eng.validateKindGarment(M.kinds.finish, M.garments.body).indexOf('身体') >= 0
);
assert('validate ok body', Eng.validateKindGarment(M.kinds.body, M.garments.body) === '');
assert('validate ok finish nagagi', Eng.validateKindGarment(M.kinds.finish, M.garments.nagagi) === '');

const cell = (type, value) => ({ type: type, value: value });

const makeRow = (opts) => ({
  id: opts.id || null,
  value: {
    measured_at: cell('DATE', opts.measuredAt || ''),
    measure_kind: cell('DROP_DOWN', opts.kind || ''),
    garment_type: cell('DROP_DOWN', opts.garment || ''),
    measure_label: cell('SINGLE_LINE_TEXT', opts.label || ''),
    is_current: cell('CHECK_BOX', opts.current ? [M.currentOption] : []),
    manage_no: cell('SINGLE_LINE_TEXT', opts.manageNo || ''),
    mitake_cm: cell('NUMBER', opts.mitake === undefined ? '' : opts.mitake),
    yuki_cm: cell('NUMBER', opts.yuki === undefined ? '' : opts.yuki),
    measure_note: cell('MULTI_LINE_TEXT', opts.note || ''),
  },
});

const rowsDup = [
  makeRow({
    id: '1',
    measuredAt: '2024-01-01',
    kind: M.kinds.finish,
    garment: M.garments.nagagi,
    label: '訪問着',
    current: true,
    mitake: 158.5,
  }),
  makeRow({
    id: '2',
    measuredAt: '2025-06-01',
    kind: M.kinds.finish,
    garment: M.garments.nagagi,
    label: '訪問着',
    current: true,
    mitake: 159,
  }),
  makeRow({
    id: '3',
    measuredAt: '2025-06-01',
    kind: M.kinds.body,
    garment: M.garments.body,
    label: '初回',
    current: true,
    yuki: 64.5,
  }),
];

const normalized = Eng.normalizeCurrentFlags(rowsDup, {});
assert('normalize changed', normalized.changed === true);
assert('normalize keeps last finish current', Eng.isCurrentChecked(normalized.rows[1].value) === true);
assert('normalize clears older finish current', Eng.isCurrentChecked(normalized.rows[0].value) === false);
assert('normalize keeps body current', Eng.isCurrentChecked(normalized.rows[2].value) === true);
assert('normalize does not drop rows', normalized.rows.length === 3);
assert('normalize preserves mitake history', Eng.readCell(normalized.rows[0].value, M.mitakeCm) === 158.5);

const prefer = Eng.normalizeCurrentFlags(rowsDup, { preferIndex: 0 });
assert('preferIndex keeps first', Eng.isCurrentChecked(prefer.rows[0].value) === true);
assert('preferIndex clears second', Eng.isCurrentChecked(prefer.rows[1].value) === false);

const missingDate = [
  makeRow({
    kind: M.kinds.finish,
    garment: M.garments.juban,
    label: 'x',
    measuredAt: '',
  }),
];
const errs = Eng.validateMeasureTable(missingDate);
assert('validate requires measured_at', errs.length >= 1 && errs[0].indexOf('採寸日') >= 0);

const badPair = [
  makeRow({
    measuredAt: '2025-01-01',
    kind: M.kinds.body,
    garment: M.garments.nagagi,
  }),
];
assert('validate kind/garment', Eng.validateMeasureTable(badPair).some((e) => e.indexOf('身体') >= 0));

const currents = Eng.pickCurrentRows(normalized.rows);
assert('pickCurrent has 2', currents.length === 2);
assert('formatCm decimal', Eng.formatCm(158.5) === '158.5');

const preparedBad = Eng.prepareRecordForSubmit({
  measure_history: { type: 'SUBTABLE', value: missingDate },
});
assert('prepare fails on invalid', preparedBad.ok === false);

const preparedOk = Eng.prepareRecordForSubmit({
  measure_history: { type: 'SUBTABLE', value: rowsDup },
});
assert('prepare ok', preparedOk.ok === true && preparedOk.changed === true);

const skipped = Eng.prepareRecordForSubmit({ customer_name: { value: 'x' } });
assert('prepare skips missing table (history safe)', skipped.ok === true && skipped.skipped === true);

const sorted = Eng.sortHistoryRows([
  makeRow({ id: 'a', measuredAt: '2024-01-01' }),
  makeRow({ id: 'b', measuredAt: '2025-01-01' }),
]);
assert('sort newest first', Eng.readCell(sorted[0].value, M.measuredAt) === '2025-01-01');

assert('order history fields amount', C.ORDER_HISTORY_FIELDS.detailAmount === 'amount');
assert('order history fields deliveryDate', C.ORDER_HISTORY_FIELDS.deliveryDate === 'delivery_date');

if (failed > 0) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('all passed');
