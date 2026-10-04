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

    const hasProcessingUnitPrice = (unitPrice) => {

        if (unitPrice === null || unitPrice === undefined || unitPrice === '') {
            return false;
        }

        const number = Number(unitPrice);

        return !Number.isNaN(number);

    };

    const buildProcessingLineHtml = (detail) => {

        const itemName = String(detail?.item_name ?? '').trim();
        const unitPrice = detail?.unit_price;
        const hasPrice = hasProcessingUnitPrice(unitPrice);

        if (itemName === '' && !hasPrice) {
            return '';
        }

        const priceText = hasPrice ? Format.formatMoney(unitPrice) : '';

        if (priceText === '') {
            return `<div class="order-detail-processing-line">${esc(itemName)}</div>`;
        }

        return (
            `<div class="order-detail-processing-line">`
            + `<span class="order-detail-processing-line__name">${esc(itemName)}</span>`
            + `<span class="order-detail-processing-line__price">${esc(priceText)}</span>`
            + `</div>`
        );

    };

    OrderDetailShared.buildProcessingContentHtml = (details) => {

        if (!Array.isArray(details)) {
            return '';
        }

        return details
            .map((detail) => buildProcessingLineHtml(detail))
            .filter((lineHtml) => lineHtml !== '')
            .join('');

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

    const withHonorific = (value) => {

        const text = String(value ?? '').trim();

        if (text === '') {
            return '';
        }

        return `${text} 様`;

    };

    const joinProductName = (header) => {

        const type = String(header?.kimono_type ?? '').trim();
        const spec = String(header?.kimono_spec ?? '').trim();

        if (type && spec) {
            return `${type}\u3000${spec}`;
        }

        return type || spec;

    };

    OrderDetailShared.buildSleeveTagTableHtml = (header) => {

        const customerName = withHonorific(header?.customer_name);
        const clientName = withHonorific(header?.client_name);
        const productName = joinProductName(header);
        const manageNo = String(header?.manage_no ?? '').trim();
        const slipNo = String(header?.slip_no ?? '').trim();
        const inCharge = String(header?.in_charge ?? '').trim();

        return `
<table class="order-sleeve-tag-table">
    <colgroup>
        <col class="order-sleeve-tag-table__col-label">
        <col class="order-sleeve-tag-table__col-value-wide">
        <col class="order-sleeve-tag-table__col-value-wide">
        <col class="order-sleeve-tag-table__col-label-sub">
        <col class="order-sleeve-tag-table__col-value-sub">
    </colgroup>
    <tbody>
        <tr class="order-sleeve-tag-table__row">
            <th class="order-sleeve-tag-table__label">お得意様名</th>
            <td class="order-sleeve-tag-table__value order-sleeve-tag-table__value--wide" colspan="4">${esc(customerName)}</td>
        </tr>
        <tr class="order-sleeve-tag-table__row">
            <th class="order-sleeve-tag-table__label">お客様名</th>
            <td class="order-sleeve-tag-table__value order-sleeve-tag-table__value--wide" colspan="4">${esc(clientName)}</td>
        </tr>
        <tr class="order-sleeve-tag-table__row">
            <th class="order-sleeve-tag-table__label">商品名</th>
            <td class="order-sleeve-tag-table__value" colspan="2">${esc(productName)}</td>
            <th class="order-sleeve-tag-table__label order-sleeve-tag-table__label--sub">管理番号</th>
            <td class="order-sleeve-tag-table__value order-sleeve-tag-table__value--sub">${esc(manageNo)}</td>
        </tr>
        <tr class="order-sleeve-tag-table__row">
            <th class="order-sleeve-tag-table__label">伝票番号</th>
            <td class="order-sleeve-tag-table__value" colspan="2">${esc(slipNo)}</td>
            <th class="order-sleeve-tag-table__label order-sleeve-tag-table__label--sub">係様名</th>
            <td class="order-sleeve-tag-table__value order-sleeve-tag-table__value--sub">${esc(inCharge)}</td>
        </tr>
    </tbody>
</table>`;

    };

    OrderDetailShared.buildSheetHtml = (header, details, manageNo, side, title = '受注明細表') => {

        const sleeveTagHtml = side === 'left'
            ? OrderDetailShared.buildSleeveTagTableHtml(header)
            : '';

        return `
<div class="order-detail-sheet order-detail-sheet--${esc(side)}">
    <h1 class="order-detail-title">${esc(title)}</h1>
    ${OrderDetailShared.buildTableHtml(header, details)}
    ${OrderDetailShared.buildBarcodeHtml(manageNo, side)}
    ${sleeveTagHtml}
</div>`;

    };

    window.OrderDetailShared = OrderDetailShared;

})();
