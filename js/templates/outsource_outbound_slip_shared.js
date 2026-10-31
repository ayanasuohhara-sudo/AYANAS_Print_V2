(() => {
    'use strict';

    /**
     * 外注出庫伝票（左半分）共通 HTML 生成 — App 27
     */

    const OutsourceOutboundSlipShared = {};

    OutsourceOutboundSlipShared.ROW_DEFINITIONS = [
        { type: 'single', label: '外注先コード', field: 'outsource_company_code' },
        { type: 'single', label: '外注先名', field: 'outsource_company', wrap: true },
        {
            type: 'pair',
            items: [
                { label: '出庫日', field: 'ship_date', format: 'date' },
                { label: '納期', field: 'return_date', format: 'date' },
            ],
        },
        {
            type: 'pair',
            items: [
                { label: '管理番号', field: 'manage_no' },
                { label: '顧客コード', field: 'customer_code' },
            ],
        },
        { type: 'single', label: 'お客様名', field: 'client_name', wrap: true, suffix: ' 様' },
        { type: 'single', label: '着物種類', field: 'kimono_type', wrap: true },
    ];

    const esc = (value) => Format.escapeHtml(value);

    OutsourceOutboundSlipShared.formatFieldValue = (value, format, suffix = '') => {

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

    OutsourceOutboundSlipShared.buildProcessingContentHtml = (details) => {

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
        const multilineClass = options.multiline ? ' order-detail-table__value--multiline' : '';

        return `<tr class="order-detail-table__row order-detail-table__row--single">`
            + `<th class="order-detail-table__label order-detail-table__label--single">${esc(label)}</th>`
            + `<td class="order-detail-table__value order-detail-table__value--single${wrapClass}${multilineClass}" colspan="3">${esc(value)}</td>`
            + `</tr>`;

    };

    const buildPairRowHtml = (items, header) => {

        const cellsHtml = items.map((item) => {

            const wrapClass = item.wrap ? ' order-detail-table__value--wrap' : '';
            const value = OutsourceOutboundSlipShared.formatFieldValue(
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
            <td class="order-detail-table__value order-detail-table__value--single order-detail-table__value--wrap order-detail-table__value--multiline" colspan="3">${OutsourceOutboundSlipShared.buildProcessingContentHtml(details)}</td>
        </tr>`;

    const buildRemarksRowHtml = (remarks) => {

        const text = String(remarks ?? '').trim();

        if (text === '' || text === '-') {
            return '';
        }

        return buildSingleRowHtml('備考', text, { wrap: true, multiline: true });

    };

    const buildTableHtmlWithRowDefinitions = (header, details, rowDefinitions) => {

        const rowsHtml = rowDefinitions.map((row) => {

            if (row.type === 'pair') {
                return buildPairRowHtml(row.items, header);
            }

            const cellValue = OutsourceOutboundSlipShared.formatFieldValue(
                header[row.field],
                row.format,
                row.suffix
            );

            if (row.skipIfEmpty && cellValue === '') {
                return '';
            }

            return buildSingleRowHtml(
                row.label,
                cellValue,
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
        ${buildRemarksRowHtml(header.remarks)}
    </tbody>
</table>`;

    };

    OutsourceOutboundSlipShared.buildTableHtml = (header, details) => (
        buildTableHtmlWithRowDefinitions(header, details, OutsourceOutboundSlipShared.ROW_DEFINITIONS)
    );

    const WasaiOutboundSlipShared = {};

    WasaiOutboundSlipShared.ROW_DEFINITIONS = [
        { type: 'single', label: '和裁士コード', field: 'wasai_code' },
        { type: 'single', label: '和裁士名', field: 'wasai_name', wrap: true },
        { type: 'single', label: '屋号', field: 'trade_name', wrap: true, skipIfEmpty: true },
        {
            type: 'pair',
            items: [
                { label: '出庫日', field: 'ship_date', format: 'date' },
                { label: '納期', field: 'return_date', format: 'date' },
            ],
        },
        {
            type: 'pair',
            items: [
                { label: '管理番号', field: 'manage_no' },
                { label: '顧客コード', field: 'customer_code' },
            ],
        },
        { type: 'single', label: 'お客様名', field: 'client_name', wrap: true, suffix: ' 様' },
        {
            type: 'pair',
            items: [
                { label: '着物種類名', field: 'kimono_type', wrap: true },
                { label: '着物仕様名', field: 'kimono_spec', wrap: true },
            ],
        },
    ];

    WasaiOutboundSlipShared.buildTableHtml = (header, details) => (
        buildTableHtmlWithRowDefinitions(header, details, WasaiOutboundSlipShared.ROW_DEFINITIONS)
    );

    WasaiOutboundSlipShared.buildSheetHtml = (
        header,
        details,
        manageNo,
        layoutSide,
        title = '和裁士出庫伝票',
        barcodeId = layoutSide
    ) => `
<div class="order-detail-sheet order-detail-sheet--${esc(layoutSide)}">
    <h1 class="order-detail-title">${esc(title)}</h1>
    ${WasaiOutboundSlipShared.buildTableHtml(header, details)}
    ${OutsourceOutboundSlipShared.buildBarcodeHtml(manageNo, barcodeId)}
</div>`;

    OutsourceOutboundSlipShared.buildBarcodeHtml = (manageNo, side) => `

<div class="order-detail-barcode">
    <svg id="barcode-${esc(side)}" class="order-detail-barcode__svg" data-barcode-value="${esc(manageNo)}" aria-hidden="true"></svg>
    <p class="order-detail-barcode__value">${esc(manageNo)}</p>
</div>`;

    OutsourceOutboundSlipShared.buildSheetHtml = (
        header,
        details,
        manageNo,
        layoutSide,
        title = '外注出庫伝票',
        barcodeId = layoutSide
    ) => `
<div class="order-detail-sheet order-detail-sheet--${esc(layoutSide)}">
    <h1 class="order-detail-title">${esc(title)}</h1>
    ${OutsourceOutboundSlipShared.buildTableHtml(header, details)}
    ${OutsourceOutboundSlipShared.buildBarcodeHtml(manageNo, barcodeId)}
</div>`;

    window.OutsourceOutboundSlipShared = OutsourceOutboundSlipShared;
    window.WasaiOutboundSlipShared = WasaiOutboundSlipShared;

})();
