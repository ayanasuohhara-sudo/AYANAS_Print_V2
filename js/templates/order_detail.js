(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * templates/order_detail.js
     *
     * 受注明細表（A4横・左半分）の HTML 文字列を生成する。
     */

    const ORDER_DETAIL_TEMPLATE_VERSION = '2';

    const ROW_DEFINITIONS = [
        { type: 'single', label: '管理番号', field: 'manage_no' },
        { type: 'single', label: '受注日', field: 'order_date', format: 'date' },
        { type: 'single', label: '納期', field: 'deadline', format: 'date' },
        {
            type: 'pair',
            items: [
                { label: '顧客コード', field: 'customer_code' },
                { label: '顧客名', field: 'customer_name', wrap: true },
            ],
        },
        { type: 'single', label: 'お客様名', field: 'client_name', wrap: true },
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

    const formatFieldValue = (value, format) => {

        if (format === 'date') {
            return Format.formatDate(value);
        }

        return String(value ?? '').trim();

    };

    const buildProcessingContentHtml = (details) => {

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
            const value = formatFieldValue(header[item.field], item.format);

            return `<th class="order-detail-table__label order-detail-table__label--pair">${esc(item.label)}</th>`
                + `<td class="order-detail-table__value order-detail-table__value--pair${wrapClass}">${esc(value)}</td>`;

        }).join('');

        return `<tr class="order-detail-table__row order-detail-table__row--pair">${cellsHtml}</tr>`;

    };

    const buildProcessingRowHtml = (details) => `

        <tr class="order-detail-table__row order-detail-table__row--single">
            <th class="order-detail-table__label order-detail-table__label--single">加工内容</th>
            <td class="order-detail-table__value order-detail-table__value--single order-detail-table__value--wrap order-detail-table__value--multiline" colspan="3">${buildProcessingContentHtml(details)}</td>
        </tr>`;

    const buildTableHtml = (header, details) => {

        const rowsHtml = ROW_DEFINITIONS.map((row) => {

            if (row.type === 'pair') {
                return buildPairRowHtml(row.items, header);
            }

            return buildSingleRowHtml(
                row.label,
                formatFieldValue(header[row.field], row.format),
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

    const buildBarcodeHtml = (manageNo) => `

<div class="order-detail-barcode">
    <svg id="barcode" class="order-detail-barcode__svg" aria-hidden="true"></svg>
    <p class="order-detail-barcode__value">${esc(manageNo)}</p>
</div>`;

    const OrderDetailTemplate = TemplateInterface.create('OrderDetailTemplate', (data, config = {}, layout = {}) => {

        console.info(`[AYANAS Print V3] order detail template v${ORDER_DETAIL_TEMPLATE_VERSION}`);

        if (typeof Format === 'undefined') {
            throw new Error('Format モジュールが読み込まれていません。');
        }

        Validation.assertDetailReportData(data);

        const { header, details } = data;
        const manageNo = String(header?.manage_no ?? '').trim();

        return Common.buildDocumentHtml({
            title: '受注明細表',
            bodyClass: Common.getBodyClass(layout),
            content: `
<div class="order-detail-sheet">
    <h1 class="order-detail-title">受注明細表</h1>
    ${buildTableHtml(header, details)}
    ${buildBarcodeHtml(manageNo)}
</div>
<div class="order-detail-blank" aria-hidden="true"></div>`,
        });

    });

    window.OrderDetailTemplate = OrderDetailTemplate;

})();
