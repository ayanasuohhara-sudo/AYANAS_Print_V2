(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * templates/overseas_outbound_sheet.js
     *
     * 海外外注 出庫表（勝矢和裁用 / 社内保管用）
     */

    const OVERSEAS_OUTBOUND_SHEET_TEMPLATE_VERSION = '3';

    const DETAILS_PER_PAGE_FIRST = 18;
    const DETAILS_PER_PAGE_NEXT = 22;

    const BASE_HEADERS = [
        'カートン番号',
        '管理番号',
        '顧客コード',
        'お客様名',
        '着物種類',
        '着物仕様',
        '入庫予定日',
    ];

    const esc = (value) => Format.escapeHtml(value);

    const formatDate = (value) => {

        try {
            return Format.formatDate(value);
        } catch (error) {
            return String(value ?? '').trim();
        }

    };

    const getTableHeaders = (includeDeadline) => (
        includeDeadline ? [...BASE_HEADERS, '納期'] : BASE_HEADERS
    );

    const buildDetailPages = (details) => {

        if (!Array.isArray(details) || details.length === 0) {
            return [[]];
        }

        const pages = [details.slice(0, DETAILS_PER_PAGE_FIRST)];
        let index = DETAILS_PER_PAGE_FIRST;

        while (index < details.length) {
            pages.push(details.slice(index, index + DETAILS_PER_PAGE_NEXT));
            index += DETAILS_PER_PAGE_NEXT;
        }

        return pages;

    };

    const buildTableHeadHtml = (includeDeadline) => `

<thead>
    <tr>
        ${getTableHeaders(includeDeadline).map((label) => `<th>${esc(label)}</th>`).join('\n        ')}
    </tr>
</thead>`;

    const buildRowHtml = (detail, includeDeadline) => {

        const cells = [
            `<td>${esc(detail.carton_no)}</td>`,
            `<td class="oob-sheet-table__manage-no">${esc(detail.manage_no)}</td>`,
            `<td>${esc(detail.customer_code)}</td>`,
            `<td>${esc(detail.client_name)}</td>`,
            `<td>${esc(detail.kimono_type)}</td>`,
            `<td class="oob-sheet-table__spec">${esc(detail.kimono_spec)}</td>`,
            `<td>${esc(formatDate(detail.scheduled_arrival_date))}</td>`,
        ];

        if (includeDeadline) {
            cells.push(`<td>${esc(formatDate(detail.deadline))}</td>`);
        }

        return `<tr>${cells.join('')}</tr>`;

    };

    const buildTableBodyHtml = (pageDetails, includeDeadline) => {

        if (!Array.isArray(pageDetails) || pageDetails.length === 0) {
            return '<tbody></tbody>';
        }

        const rowsHtml = pageDetails
            .map((detail) => buildRowHtml(detail, includeDeadline))
            .join('\n    ');

        return `<tbody>${rowsHtml}</tbody>`;

    };

    const buildCartonSummaryHtml = (header) => {

        const summary = Array.isArray(header.carton_summary) ? header.carton_summary : [];

        if (summary.length === 0) {
            return '';
        }

        const linesHtml = summary.map((item) => (
            `<li>${esc(item.carton_no)}：${esc(String(item.count))}点</li>`
        )).join('\n            ');

        return `
<ul class="oob-sheet-header__cartons">
            ${linesHtml}
</ul>`;

    };

    const buildPageHeaderHtml = (header, pageNumber) => {

        const shipDateLabel = formatDate(header.ship_date);
        const totalCount = Number(header.total_count ?? 0);
        const title = String(header.sheet_title ?? '海外外注 出庫明細表');

        if (pageNumber === 1) {
            return `
<div class="oob-sheet-header oob-sheet-header--first">
    <h1 class="oob-sheet-header__title">${esc(title)}</h1>
    <p class="oob-sheet-header__ship-date">出庫日：${esc(shipDateLabel)}</p>
    <p class="oob-sheet-header__count">出庫点数：${esc(String(totalCount))}点</p>
    ${buildCartonSummaryHtml(header)}
</div>`;
        }

        return `
<div class="oob-sheet-header oob-sheet-header--continued">
    <p class="oob-sheet-header__continued-title">${esc(title)}　出庫日：${esc(shipDateLabel)}</p>
</div>`;

    };

    const buildPageHtml = (header, pageDetails, pageNumber, totalPages, includeDeadline) => `
<div class="page">
    ${buildPageHeaderHtml(header, pageNumber)}
    <table class="oob-sheet-table">
        ${buildTableHeadHtml(includeDeadline)}
        ${buildTableBodyHtml(pageDetails, includeDeadline)}
    </table>
    <p class="oob-sheet-page-no">${pageNumber} / ${totalPages}</p>
</div>`;

    const OverseasOutboundSheetTemplate = {

        render(data) {

            Validation.assertReportData(data);

            if (!Array.isArray(data.details)) {
                throw new Error('details が不正です。');
            }

            const header = data.header ?? {};
            const includeDeadline = header.include_deadline === true;
            const detailPages = buildDetailPages(data.details);
            const totalPages = detailPages.length;

            const pagesHtml = detailPages.map((pageDetails, index) => (
                buildPageHtml(
                    header,
                    pageDetails,
                    index + 1,
                    totalPages,
                    includeDeadline
                )
            )).join('\n');

            return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title> </title>
</head>
<body class="report-overseas-outbound-sheet">
${pagesHtml}
</body>
</html>`;

        },

    };

    window.OverseasOutboundSheetTemplate = OverseasOutboundSheetTemplate;
    window.OVERSEAS_OUTBOUND_SHEET_TEMPLATE_VERSION = OVERSEAS_OUTBOUND_SHEET_TEMPLATE_VERSION;

})();
