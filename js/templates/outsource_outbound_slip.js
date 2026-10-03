(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * templates/outsource_outbound_slip.js
     *
     * 外注出庫伝票（App 27・A4横・左半分×2・中央カット用）
     */

    const OUTSOURCE_OUTBOUND_SLIP_TEMPLATE_VERSION = '3';

    const OutsourceOutboundSlipTemplate = TemplateInterface.create('OutsourceOutboundSlipTemplate', (data, config = {}, layout = {}) => {

        console.info(`[AYANAS Print V3] outsource outbound slip template v${OUTSOURCE_OUTBOUND_SLIP_TEMPLATE_VERSION}`);

        if (typeof Format === 'undefined') {
            throw new Error('Format モジュールが読み込まれていません。');
        }

        if (typeof OutsourceOutboundSlipShared === 'undefined') {
            throw new Error('OutsourceOutboundSlipShared モジュールが読み込まれていません。');
        }

        Validation.assertDetailReportData(data);

        const pages = Array.isArray(data.pages) && data.pages.length > 0
            ? data.pages
            : [{
                header: data.header,
                details: data.details,
            }];

        const pagesHtml = pages.map((page, index) => {

            const header = page.header ?? {};
            const details = page.details ?? [];
            const manageNo = String(header.manage_no ?? '').trim();
            const sideSuffix = String(index);

            return `<div class="page">
<div class="order-detail-page">
    ${OutsourceOutboundSlipShared.buildSheetHtml(header, details, manageNo, 'left', undefined, `left-${sideSuffix}`)}
    ${OutsourceOutboundSlipShared.buildSheetHtml(header, details, manageNo, 'right', undefined, `right-${sideSuffix}`)}
</div>
</div>`;

        }).join('\n');

        return Common.buildDocumentHtml({
            title: '外注出庫伝票',
            bodyClass: Common.getBodyClass(layout),
            content: pagesHtml,
            multiPage: true,
        });

    });

    window.OutsourceOutboundSlipTemplate = OutsourceOutboundSlipTemplate;

    const WASAI_OUTBOUND_SLIP_TEMPLATE_VERSION = '1';

    const WasaiOutboundSlipTemplate = TemplateInterface.create('WasaiOutboundSlipTemplate', (data, config = {}, layout = {}) => {

        console.info(`[AYANAS Print V3] wasai outbound slip template v${WASAI_OUTBOUND_SLIP_TEMPLATE_VERSION}`);

        if (typeof WasaiOutboundSlipShared === 'undefined') {
            throw new Error('WasaiOutboundSlipShared モジュールが読み込まれていません。');
        }

        Validation.assertDetailReportData(data);

        const pages = Array.isArray(data.pages) && data.pages.length > 0
            ? data.pages
            : [{
                header: data.header,
                details: data.details,
            }];

        const pagesHtml = pages.map((page, index) => {

            const header = page.header ?? {};
            const details = page.details ?? [];
            const manageNo = String(header.manage_no ?? '').trim();
            const sideSuffix = String(index);

            return `<div class="page">
<div class="order-detail-page">
    ${WasaiOutboundSlipShared.buildSheetHtml(header, details, manageNo, 'left', undefined, `wasai-left-${sideSuffix}`)}
    ${WasaiOutboundSlipShared.buildSheetHtml(header, details, manageNo, 'right', undefined, `wasai-right-${sideSuffix}`)}
</div>
</div>`;

        }).join('\n');

        return Common.buildDocumentHtml({
            title: '和裁士出庫伝票',
            bodyClass: Common.getBodyClass(layout),
            content: pagesHtml,
            multiPage: true,
        });

    });

    window.WasaiOutboundSlipTemplate = WasaiOutboundSlipTemplate;

})();
