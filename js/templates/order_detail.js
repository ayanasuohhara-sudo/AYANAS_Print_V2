(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * templates/order_detail.js
     *
     * 受注明細表（A4横・左半分）の HTML 文字列を生成する。
     */

    const ORDER_DETAIL_TEMPLATE_VERSION = '1';

    const ROW_DEFINITIONS = [
        { label: '管理番号', field: 'manage_no' },
        { label: '受注日', field: 'order_date', format: 'date' },
        { label: '納期', field: 'deadline', format: 'date' },
        { label: '顧客コード', field: 'customer_code' },
        { label: '顧客名', field: 'customer_name', wrap: true },
        { label: 'お客様名', field: 'client_name', wrap: true },
        { label: '得意先伝票番号', field: 'slip_no' },
        { label: '得意先担当・係', field: 'in_charge' },
        { label: '着物種類名', field: 'kimono_type', wrap: true },
        { label: '着物仕様', field: 'kimono_spec', wrap: true },
    ];

    const esc = (value) => Format.escapeHtml(value);

    const formatFieldValue = (value, format) => {

        if (format === 'date') {
            return Format.formatDate(value);
        }

        return String(value ?? '').trim();

    };

    const buildProcessingContent = (details) => {

        if (!Array.isArray(details)) {
            return '';
        }

        return details
            .map((detail) => String(detail?.item_name ?? '').trim())
            .filter((itemName) => itemName !== '')
            .join('・');

    };

    const buildRowHtml = (label, value, options = {}) => {

        const wrapClass = options.wrap ? ' order-detail-table__value--wrap' : '';

        return `<tr>`
            + `<th class="order-detail-table__label">${esc(label)}</th>`
            + `<td class="order-detail-table__value${wrapClass}">${esc(value)}</td>`
            + `</tr>`;

    };

    const buildTableHtml = (header, details) => {

        const rowsHtml = ROW_DEFINITIONS.map((row) => (
            buildRowHtml(
                row.label,
                formatFieldValue(header[row.field], row.format),
                { wrap: row.wrap }
            )
        )).join('\n        ');

        const processingContent = buildProcessingContent(details);

        return `
<table class="order-detail-table">
    <tbody>
        ${rowsHtml}
        ${buildRowHtml('加工内容', processingContent, { wrap: true })}
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
