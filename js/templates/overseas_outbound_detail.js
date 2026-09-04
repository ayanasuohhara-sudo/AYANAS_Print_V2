(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * templates/overseas_outbound_detail.js
     *
     * 海外外注 出庫明細表（A4横・全面）の HTML 文字列を生成する。
     */

    const OVERSEAS_OUTBOUND_DETAIL_TEMPLATE_VERSION = '3';

    const DETAILS_PER_PAGE_FIRST = 20;
    const DETAILS_PER_PAGE_NEXT = 24;

    const TABLE_HEADERS = [
        'No.',
        '管理番号',
        '顧客コード',
        'お客様名',
        '着物種類',
        '着物仕様',
        '納期',
    ];

    const esc = (value) => Format.escapeHtml(value);

    const formatDate = (value) => {

        try {
            return Format.formatDate(value);
        } catch (error) {
            return String(value ?? '').trim();
        }

    };

    const buildDetailPages = (details) => {

        if (!Array.isArray(details) || details.length === 0) {
            return [[]];
        }

        const pages = [];
        const firstChunk = details.slice(0, DETAILS_PER_PAGE_FIRST);

        pages.push(firstChunk);

        let index = DETAILS_PER_PAGE_FIRST;

        while (index < details.length) {
            pages.push(details.slice(index, index + DETAILS_PER_PAGE_NEXT));
            index += DETAILS_PER_PAGE_NEXT;
        }

        return pages;

    };

    const buildTableHeadHtml = () => `

<thead>
    <tr>
        ${TABLE_HEADERS.map((label) => `<th>${esc(label)}</th>`).join('\n        ')}
    </tr>
</thead>`;

    const buildTableBodyHtml = (pageDetails, startNo) => {

        if (!Array.isArray(pageDetails) || pageDetails.length === 0) {
            return '<tbody></tbody>';
        }

        const rowsHtml = pageDetails.map((detail, index) => {

            const rowNo = startNo + index;

            return `<tr>
        <td class="oob-detail-table__no">${rowNo}</td>
        <td class="oob-detail-table__manage-no">${esc(detail.manage_no)}</td>
        <td>${esc(detail.customer_code)}</td>
        <td>${esc(detail.client_name)}</td>
        <td>${esc(detail.kimono_type)}</td>
        <td class="oob-detail-table__spec">${esc(detail.kimono_spec)}</td>
        <td>${esc(formatDate(detail.deadline))}</td>
    </tr>`;

        }).join('\n    ');

        return `<tbody>${rowsHtml}</tbody>`;

    };

    const buildPageHeaderHtml = (header, pageNumber) => {

        const shipDateLabel = formatDate(header.ship_date);
        const unreceivedCount = Number(header.unreceived_count ?? 0);

        if (pageNumber === 1) {
            return `
<div class="oob-detail-header oob-detail-header--first">
    <h1 class="oob-detail-header__title">海外外注 出庫明細表</h1>
    <p class="oob-detail-header__ship-date">出庫日：${esc(shipDateLabel)}</p>
    <p class="oob-detail-header__count">未入庫件数：${esc(String(unreceivedCount))}点</p>
</div>`;
        }

        return `
<div class="oob-detail-header oob-detail-header--continued">
    <p class="oob-detail-header__continued-title">海外外注 出庫明細表　出庫日：${esc(shipDateLabel)}</p>
</div>`;

    };

    const buildPageHtml = (header, pageDetails, pageNumber, startNo, totalPages) => `
<div class="page">
    ${buildPageHeaderHtml(header, pageNumber)}
    <table class="oob-detail-table">
        ${buildTableHeadHtml()}
        ${buildTableBodyHtml(pageDetails, startNo)}
    </table>
    <p class="oob-detail-page-no">${pageNumber} / ${totalPages}</p>
</div>`;

    const OverseasOutboundDetailTemplate = {

        render(data) {

            Validation.assertReportData(data);

            if (!Array.isArray(data.details)) {
                throw new Error('details が不正です。');
            }

            const header = data.header ?? {};
            const detailPages = buildDetailPages(data.details);
            const totalPages = detailPages.length;
            let startNo = 1;

            const pagesHtml = detailPages.map((pageDetails, index) => {

                const pageNumber = index + 1;
                const pageHtml = buildPageHtml(
                    header,
                    pageDetails,
                    pageNumber,
                    startNo,
                    totalPages
                );

                startNo += pageDetails.length;

                return pageHtml;

            }).join('\n');

            return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title> </title>
</head>
<body class="report-overseas-outbound-detail">
${pagesHtml}
</body>
</html>`;

        },

    };

    window.OverseasOutboundDetailTemplate = OverseasOutboundDetailTemplate;
    window.OVERSEAS_OUTBOUND_DETAIL_TEMPLATE_VERSION = OVERSEAS_OUTBOUND_DETAIL_TEMPLATE_VERSION;

})();
