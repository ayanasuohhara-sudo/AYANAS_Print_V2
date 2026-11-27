(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * templates/order_detail.js
     *
     * 受注明細表（A4横・左半分×2・中央カット用）の HTML 文字列を生成する。
     */

    const ORDER_DETAIL_TEMPLATE_VERSION = '10';

    const OrderDetailTemplate = TemplateInterface.create('OrderDetailTemplate', (data, config = {}, layout = {}) => {

        console.info(`[AYANAS Print V3] order detail template v${ORDER_DETAIL_TEMPLATE_VERSION}`);

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
            title: '受注明細表',
            bodyClass: Common.getBodyClass(layout),
            content: `
<div class="order-detail-page">
    ${OrderDetailShared.buildSheetHtml(header, details, manageNo, 'left')}
    ${OrderDetailShared.buildSheetHtml(header, details, manageNo, 'right')}
</div>`,
        });

    });

    window.OrderDetailTemplate = OrderDetailTemplate;

})();
