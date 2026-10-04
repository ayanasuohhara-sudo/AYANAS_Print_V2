(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * templates/overseas_order.js
     *
     * 海外用受注表（A4横・左:受注明細表 / 右:海外右.xlsx レイアウト）
     *
     * App 16 フィールドコード（チェックボックスは ON 時に ○ 表示）:
     *   overseas_color, overseas_pattern
     *   overseas_embroidery（有り/無し）, overseas_tailoring（ミシン/手縫い）
     *   overseas_mat_seiden, overseas_weave_chirimen, overseas_acc_douura,
     *   overseas_mat_kasen, overseas_weave_hiraori, overseas_acc_eriura,
     *   overseas_mat_asu, overseas_weave_ayaori, overseas_acc_hgake,
     *   overseas_mat_wata, overseas_weave_shaori, overseas_acc_hiyoku,
     *   overseas_weave_tsumugi, overseas_acc_sefuse,
     *   overseas_acc_haneri, overseas_acc_erinuno, overseas_acc_erishin,
     *   overseas_acc_emon, overseas_acc_iseshiki, overseas_acc_kataura
     */

    const OVERSEAS_ORDER_TEMPLATE_VERSION = '4';

    const esc = (value) => Format.escapeHtml(value);

    const isMarked = (value) => {

        if (Array.isArray(value)) {
            return value.length > 0;
        }

        const normalized = String(value ?? '').trim();

        if (normalized === '' || normalized === '0') {
            return false;
        }

        return true;

    };

    const markCell = (value) => (isMarked(value) ? '○' : '');

    const choiceMark = (actual, expected) => (
        String(actual ?? '').trim() === expected ? '○' : ''
    );

    const GRID_ROWS = [
        {
            cells: [
                { label: '正絹', field: 'overseas_mat_seiden' },
                { label: '縮緬', field: 'overseas_weave_chirimen' },
                { label: '胴裏', field: 'overseas_acc_douura' },
            ],
        },
        {
            cells: [
                { label: '化繊', field: 'overseas_mat_kasen' },
                { label: '平織', field: 'overseas_weave_hiraori' },
                { label: '衿裏', field: 'overseas_acc_eriura' },
            ],
        },
        {
            cells: [
                { label: '麻', field: 'overseas_mat_asu' },
                { label: '絽織', field: 'overseas_weave_ayaori' },
                { label: '八掛', field: 'overseas_acc_hgake' },
            ],
        },
        {
            cells: [
                { label: '綿', field: 'overseas_mat_wata' },
                { label: '紗織', field: 'overseas_weave_shaori' },
                { label: '比翼', field: 'overseas_acc_hiyoku' },
            ],
        },
        {
            cells: [
                { label: '', field: '' },
                { label: '紬', field: 'overseas_weave_tsumugi' },
                { label: '背伏', field: 'overseas_acc_sefuse' },
            ],
        },
        {
            cells: [
                { label: '', field: '' },
                { label: '', field: '' },
                { label: '半衿', field: 'overseas_acc_haneri' },
            ],
        },
        {
            cells: [
                { label: '', field: '' },
                { label: '', field: '' },
                { label: '衿布', field: 'overseas_acc_erinuno' },
            ],
        },
        {
            cells: [
                { label: '', field: '' },
                { label: '', field: '' },
                { label: '衿芯', field: 'overseas_acc_erishin' },
            ],
        },
        {
            cells: [
                { label: '', field: '' },
                { label: '', field: '' },
                { label: 'えもん', field: 'overseas_acc_emon' },
            ],
        },
        {
            cells: [
                { label: '', field: '' },
                { label: '', field: '' },
                { label: '居敷当', field: 'overseas_acc_iseshiki' },
            ],
        },
        {
            cells: [
                { label: '', field: '' },
                { label: '', field: '' },
                { label: '肩裏', field: 'overseas_acc_kataura' },
            ],
        },
    ];

    const buildGridRowHtml = (row, header) => {

        const cells = row.cells.map((cell) => {

            if (cell.label === '' && cell.field === '') {
                return '<td class="overseas-order-table__cell overseas-order-table__cell--empty"></td>';
            }

            const labelHtml = cell.label !== ''
                ? `<span class="overseas-order-table__item-label">${esc(cell.label)}</span>`
                : '';
            const mark = cell.field ? markCell(header[cell.field]) : '';

            return `<td class="overseas-order-table__cell">`
                + `${labelHtml}`
                + `<span class="overseas-order-table__mark">${esc(mark)}</span>`
                + `</td>`;

        }).join('');

        return `<tr class="overseas-order-table__row">${cells}</tr>`;

    };

    const buildRightTableHtml = (header) => {

        const color = String(header.overseas_color ?? '').trim();
        const pattern = String(header.overseas_pattern ?? '').trim();
        const embroidery = String(header.overseas_embroidery ?? '').trim();
        const tailoring = String(header.overseas_tailoring ?? '').trim();

        const gridBody = GRID_ROWS.map((row) => buildGridRowHtml(row, header)).join('\n        ');

        return `
<table class="overseas-order-table">
    <tbody>
        <tr class="overseas-order-table__row">
            <th class="overseas-order-table__label" colspan="1">色</th>
            <td class="overseas-order-table__value overseas-order-table__value--wide" colspan="2">${esc(color)}</td>
        </tr>
        <tr class="overseas-order-table__row">
            <th class="overseas-order-table__label">柄</th>
            <td class="overseas-order-table__value overseas-order-table__value--wide" colspan="2">${esc(pattern)}</td>
        </tr>
        <tr class="overseas-order-table__row overseas-order-table__row--choice">
            <th class="overseas-order-table__label">刺繍</th>
            <td class="overseas-order-table__choice">${esc(choiceMark(embroidery, '有り'))}<span class="overseas-order-table__choice-label">有り</span></td>
            <td class="overseas-order-table__choice">${esc(choiceMark(embroidery, '無し'))}<span class="overseas-order-table__choice-label">無し</span></td>
        </tr>
        <tr class="overseas-order-table__row overseas-order-table__row--choice">
            <th class="overseas-order-table__label">仕立</th>
            <td class="overseas-order-table__choice">${esc(choiceMark(tailoring, 'ミシン'))}<span class="overseas-order-table__choice-label">ミシン</span></td>
            <td class="overseas-order-table__choice">${esc(choiceMark(tailoring, '手縫い'))}<span class="overseas-order-table__choice-label">手縫い</span></td>
        </tr>
        <tr class="overseas-order-table__row overseas-order-table__row--spacer"><td colspan="3"></td></tr>
        <tr class="overseas-order-table__row overseas-order-table__row--header">
            <th class="overseas-order-table__head">素材</th>
            <th class="overseas-order-table__head">織</th>
            <th class="overseas-order-table__head">付属品</th>
        </tr>
        ${gridBody}
    </tbody>
</table>`;

    };

    const buildRightSheetHtml = (header) => `
<div class="order-detail-sheet order-detail-sheet--right overseas-order-sheet">
    ${buildRightTableHtml(header)}
</div>`;

    const OverseasOrderTemplate = TemplateInterface.create('OverseasOrderTemplate', (data, config = {}, layout = {}) => {

        console.info(`[AYANAS Print V3] overseas order template v${OVERSEAS_ORDER_TEMPLATE_VERSION}`);

        if (typeof Format === 'undefined') {
            throw new Error('Format モジュールが読み込まれていません。');
        }

        if (typeof OrderDetailShared === 'undefined') {
            throw new Error('OrderDetailShared モジュールが読み込まれていません。');
        }

        Validation.assertDetailReportData(data);

        const { header, details } = data;
        const manageNo = String(header?.manage_no ?? '').trim();

        return Common.buildDocumentHtml({
            title: '海外用受注表',
            bodyClass: Common.getBodyClass(layout),
            content: `
<div class="order-detail-page overseas-order-page">
    ${OrderDetailShared.buildSheetHtml(header, details, manageNo, 'left', '受注明細表')}
    ${buildRightSheetHtml(header)}
</div>`,
        });

    });

    window.OverseasOrderTemplate = OverseasOrderTemplate;

})();
