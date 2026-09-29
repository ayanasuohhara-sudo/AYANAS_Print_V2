(() => {
    'use strict';

    /**
     * 受注明細表（左半分）共通 HTML 生成
     */

    const OrderDetailShared = {};

    OrderDetailShared.ROW_DEFINITIONS = [
        {
            type: 'pair',
            items: [
                { label: '管理番号', field: 'manage_no' },
                { label: '受注日', field: 'order_date', format: 'date' },
            ],
        },
        {
            type: 'pair',
            items: [
                { label: '顧客コード', field: 'customer_code' },
                { label: '納期', field: 'deadline', format: 'date' },
            ],
        },
        { type: 'single', label: '顧客名', field: 'customer_name', wrap: true, suffix: ' 様' },
        { type: 'single', label: 'お客様名', field: 'client_name', wrap: true, suffix: ' 様' },
        { type: 'single', label: '得意先伝票番号', field: 'slip_no' },
        { type: 'single', label: '得意先担当・係', field: 'in_charge' },
        {
            type: 'pair',
            items: [
                { label: '着物種類名', field: 'kimono_type', wrap: true },
                { label: '着物仕様', field: 'kimono_spec', wrap: true },
            ],
        },
    ];

    const esc = (value) => Format.escapeHtml(value);

    OrderDetailShared.formatFieldValue = (value, format, suffix = '') => {

        let text = '';

        if (format === 'date') {
            text = Format.formatDate(value);
        } else {
            text = String(value ?? '').trim();
        }

        const normalizedSuffix = String(suffix ?? '');

        if (normalizedSuffix !== '' && text !== '') {
            return `${text}${normalizedSuffix}`;
        }

        return text;

    };

    OrderDetailShared.buildProcessingContentHtml = (details) => {

        if (!Array.isArray(details)) {
            return '';
        }

        return details
            .map((detail) => String(detail?.item_name ?? '').trim())
            .filter((itemName) => itemName !== '')
            .map((itemName) => esc(itemName))
            .join('<br>');

    };

    const buildSingleRowHtml = (label, value, options = {}) => {

        const wrapClass = options.wrap ? ' order-detail-table__value--wrap' : '';

        return `<tr class="order-detail-table__row order-detail-table__row--single">`
            + `<th class="order-detail-table__label order-detail-table__label--single">${esc(label)}</th>`
            + `<td class="order-detail-table__value order-detail-table__value--single${wrapClass}" colspan="3">${esc(value)}</td>`
            + `</tr>`;

    };

    const buildPairRowHtml = (items, header) => {

        const cellsHtml = items.map((item) => {

            const wrapClass = item.wrap ? ' order-detail-table__value--wrap' : '';
            const value = OrderDetailShared.formatFieldValue(
                header[item.field],
                item.format,
                item.suffix
            );

            return `<th class="order-detail-table__label order-detail-table__label--pair">${esc(item.label)}</th>`
                + `<td class="order-detail-table__value order-detail-table__value--pair${wrapClass}">${esc(value)}</td>`;

        }).join('');

        return `<tr class="order-detail-table__row order-detail-table__row--pair">${cellsHtml}</tr>`;

    };

    const buildProcessingRowHtml = (details) => `

        <tr class="order-detail-table__row order-detail-table__row--single">
            <th class="order-detail-table__label order-detail-table__label--single">加工内容</th>
            <td class="order-detail-table__value order-detail-table__value--single order-detail-table__value--wrap order-detail-table__value--multiline" colspan="3">${OrderDetailShared.buildProcessingContentHtml(details)}</td>
        </tr>`;

    OrderDetailShared.buildTableHtml = (header, details) => {

        const rowsHtml = OrderDetailShared.ROW_DEFINITIONS.map((row) => {

            if (row.type === 'pair') {
                return buildPairRowHtml(row.items, header);
            }

            return buildSingleRowHtml(
                row.label,
                OrderDetailShared.formatFieldValue(header[row.field], row.format, row.suffix),
                { wrap: row.wrap }
            );

        }).join('\n        ');

        return `
<table class="order-detail-table">
    <colgroup>
        <col class="order-detail-table__col-label-single">
        <col class="order-detail-table__col-value-single">
        <col class="order-detail-table__col-label-pair">
        <col class="order-detail-table__col-value-pair">
    </colgroup>
    <tbody>
        ${rowsHtml}
        ${buildProcessingRowHtml(details)}
    </tbody>
</table>`;

    };

    OrderDetailShared.buildBarcodeHtml = (manageNo, side) => `

<div class="order-detail-barcode">
    <svg id="barcode-${esc(side)}" class="order-detail-barcode__svg" aria-hidden="true"></svg>
    <p class="order-detail-barcode__value">${esc(manageNo)}</p>
</div>`;

    OrderDetailShared.buildSheetHtml = (header, details, manageNo, side, title = '受注明細表') => `
<div class="order-detail-sheet order-detail-sheet--${esc(side)}">
    <h1 class="order-detail-title">${esc(title)}</h1>
    ${OrderDetailShared.buildTableHtml(header, details)}
    ${OrderDetailShared.buildBarcodeHtml(manageNo, side)}
</div>`;

    window.OrderDetailShared = OrderDetailShared;

})();
