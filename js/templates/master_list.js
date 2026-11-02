(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * templates/master_list.js
     *
     * マスタ一覧（1行にコード・名称 × 3件、A4横）。
     */

    const ROWS_PER_PAGE_FIRST = 26;
    /** 2ページ目以降（表頭・中分類見出しの高さを見込む） */
    const ROWS_PER_PAGE_NEXT = 25;
    const CUSTOMERS_PER_ROW = 3;
    /** 中分類ブロックごとの表頭・余白（データ行換算） */
    const GROUP_BLOCK_TABLE_HEAD_COST = 1;
    const GROUP_BLOCK_TITLE_COST = 2;

    const esc = (value) => Format.escapeHtml(value);

    const customersPerPage = (rowCount) => rowCount * CUSTOMERS_PER_ROW;

    const buildDetailPages = (details) => {

        if (!Array.isArray(details) || details.length === 0) {
            return [[]];
        }

        const pages = [];

        pages.push(details.slice(0, customersPerPage(ROWS_PER_PAGE_FIRST)));

        let index = customersPerPage(ROWS_PER_PAGE_FIRST);

        while (index < details.length) {
            pages.push(details.slice(index, index + customersPerPage(ROWS_PER_PAGE_NEXT)));
            index += customersPerPage(ROWS_PER_PAGE_NEXT);
        }

        return pages;

    };

    const buildRowGroups = (pageDetails) => {

        const groups = [];

        for (let index = 0; index < pageDetails.length; index += CUSTOMERS_PER_ROW) {
            groups.push([
                pageDetails[index] ?? null,
                pageDetails[index + 1] ?? null,
                pageDetails[index + 2] ?? null,
            ]);
        }

        return groups;

    };

    const buildItemCells = (item, slotIndex) => {

        const slotClass = `slot-${slotIndex}`;
        const pairEndClass = slotIndex < CUSTOMERS_PER_ROW - 1
            ? ' customer-list__col-name--pair-end'
            : '';

        if (!item) {
            return `
        <td class="customer-list__col-code customer-list__col-code--${slotClass}"></td>
        <td class="customer-list__col-name customer-list__col-name--${slotClass}${pairEndClass}"></td>`;
        }

        return `
        <td class="customer-list__col-code customer-list__col-code--${slotClass}">${esc(item.code)}</td>
        <td class="customer-list__col-name customer-list__col-name--${slotClass}${pairEndClass}">${esc(item.name)}</td>`;

    };

    const buildPageHeaderHtml = (header, pageNumber, pageCount) => {

        const title = String(header.document_title ?? 'マスタ一覧').trim();
        const printedAt = String(header.printed_at ?? '').trim();
        const filterNote = String(header.filter_note ?? '').trim();
        const count = Number(header.record_count ?? 0);
        const isCompact = pageNumber > 1;

        if (isCompact) {
            const pageLabel = pageCount > 1 ? `${pageNumber} / ${pageCount} ページ` : '';

            return `
<header class="customer-list__header customer-list__header--compact">
    <p class="customer-list__title customer-list__title--compact">${esc(title)}${pageLabel ? `　<span class="customer-list__page-label">${esc(pageLabel)}</span>` : ''}</p>
</header>`;
        }

        const metaLines = [
            printedAt ? `出力日時：${esc(printedAt)}` : '',
            filterNote ? esc(filterNote) : '',
            `件数：${count.toLocaleString()} 件`,
            pageCount > 1 ? `${pageNumber} / ${pageCount} ページ` : '',
        ].filter((line) => line !== '');

        return `
<header class="customer-list__header">
    <h1 class="customer-list__title">${esc(title)}</h1>
    <div class="customer-list__meta">
        ${metaLines.map((line) => `<p>${line}</p>`).join('\n        ')}
    </div>
</header>`;

    };

    const buildTableHeadHtml = (header) => {

        const codeLabel = String(header.code_label ?? 'コード').trim();
        const nameLabel = String(header.name_label ?? '名称').trim();
        const labels = Array.from({ length: CUSTOMERS_PER_ROW }, () => ([
            codeLabel,
            nameLabel,
        ])).flat();

        return `

<thead>
    <tr>
        ${labels.map((label, columnIndex) => {
        const slotIndex = Math.floor(columnIndex / 2);
        const isCode = columnIndex % 2 === 0;
        const colKind = isCode ? 'code' : 'name';
        const pairEndClass = !isCode && slotIndex < CUSTOMERS_PER_ROW - 1
            ? ' customer-list__col-name--pair-end'
            : '';

        return `<th class="customer-list__col-${colKind} customer-list__col-${colKind}--slot-${slotIndex}${pairEndClass}">${esc(label)}</th>`;
    }).join('\n        ')}
    </tr>
</thead>`;

    };

    const buildTableBodyHtml = (pageDetails) => {

        const colSpan = CUSTOMERS_PER_ROW * 2;

        if (!Array.isArray(pageDetails) || pageDetails.length === 0) {
            return `<tbody><tr><td colspan="${colSpan}" class="customer-list__empty">該当データがありません。</td></tr></tbody>`;
        }

        const groups = buildRowGroups(pageDetails);

        const rowsHtml = groups.map((group) => `<tr>
        ${group.map((item, slotIndex) => buildItemCells(item, slotIndex)).join('')}
    </tr>`).join('\n    ');

        return `<tbody>${rowsHtml}</tbody>`;

    };

    const buildPageHtml = (header, pageDetails, pageNumber, pageCount) => `

<section class="page customer-list__page${pageNumber > 1 ? ' customer-list__page--continued' : ''}">
    ${buildPageHeaderHtml(header, pageNumber, pageCount)}
    <table class="customer-list__table">
        ${buildTableHeadHtml(header)}
        ${buildTableBodyHtml(pageDetails)}
    </table>
</section>`;

    const buildGroupedSections = (details) => {

        const sections = [];

        (Array.isArray(details) ? details : []).forEach((item) => {

            const key = String(item.group_key ?? '').trim() || '（未設定）';
            const last = sections[sections.length - 1];

            if (!last || last.key !== key) {
                sections.push({
                    key,
                    label: key,
                    items: [item],
                });
                return;
            }

            last.items.push(item);

        });

        return sections;

    };

    const paginateGroupedSections = (sections) => {

        const pages = [];
        let pageChunks = [];
        let rowBudget = ROWS_PER_PAGE_FIRST;
        const flushPage = () => {

            if (pageChunks.length === 0) {
                return;
            }

            pages.push(pageChunks);
            pageChunks = [];
            rowBudget = ROWS_PER_PAGE_NEXT;

        };

        sections.forEach((section) => {

            let offset = 0;

            while (offset < section.items.length) {

                const includeHeading = offset === 0;
                const remaining = section.items.length - offset;
                const headingCost = (includeHeading ? GROUP_BLOCK_TITLE_COST : 0)
                    + GROUP_BLOCK_TABLE_HEAD_COST;
                const available = rowBudget - headingCost;

                if (available <= 0) {
                    flushPage();
                    continue;
                }

                const maxItems = Math.min(remaining, available * CUSTOMERS_PER_ROW);
                const chunkItems = section.items.slice(offset, offset + maxItems);

                pageChunks.push({
                    label: section.label,
                    items: chunkItems,
                    showHeading: includeHeading,
                });

                offset += maxItems;
                rowBudget -= headingCost + Math.ceil(chunkItems.length / CUSTOMERS_PER_ROW);

                if (offset < section.items.length) {
                    flushPage();
                }

            }

        });

        flushPage();

        return pages.length > 0 ? pages : [[]];

    };

    const buildGroupHeadingHtml = (header, label, itemCount) => {

        const groupLabel = String(header.group_label ?? '分類').trim();

        return `
<p class="customer-list__group-title">${esc(groupLabel)}：${esc(label)}<span class="customer-list__group-count">（${itemCount.toLocaleString()}件）</span></p>`;

    };

    const buildGroupedSectionHtml = (header, chunk, sectionItemCount) => {

        const parts = [];

        if (chunk.showHeading) {
            parts.push(buildGroupHeadingHtml(header, chunk.label, sectionItemCount));
        }

        parts.push(`
<table class="customer-list__table customer-list__table--group">
    ${buildTableHeadHtml(header)}
    ${buildTableBodyHtml(chunk.items)}
</table>`);

        return `<div class="customer-list__group">${parts.join('\n')}</div>`;

    };

    const countSectionItems = (sections, label) => {

        const section = sections.find((entry) => entry.label === label);

        return section ? section.items.length : 0;

    };

    const buildGroupedPageHtml = (header, pageChunks, sections, pageNumber, pageCount) => {

        const bodyHtml = pageChunks.map((chunk) => buildGroupedSectionHtml(
            header,
            chunk,
            countSectionItems(sections, chunk.label)
        )).join('\n');

        return `
<section class="page customer-list__page${pageNumber > 1 ? ' customer-list__page--continued' : ''}">
    ${buildPageHeaderHtml(header, pageNumber, pageCount)}
    ${bodyHtml}
</section>`;

    };

    const MasterListTemplate = TemplateInterface.create(
        'MasterListTemplate',
        (data, config = {}, layout = {}) => {

            if (typeof Format === 'undefined') {
                throw new Error('Format モジュールが読み込まれていません。');
            }

            Validation.assertDetailReportData(data);

            const { header, details } = data;
            let pagesHtml = '';

            if (header.group_mode === true) {

                const sections = buildGroupedSections(details);
                const groupedPages = paginateGroupedSections(sections);
                const pageCount = groupedPages.length;

                pagesHtml = groupedPages.map((pageChunks, index) => buildGroupedPageHtml(
                    header,
                    pageChunks,
                    sections,
                    index + 1,
                    pageCount
                )).join('\n');

            } else {

                const pages = buildDetailPages(details);
                const pageCount = pages.length;

                pagesHtml = pages.map((pageDetails, index) => buildPageHtml(
                    header,
                    pageDetails,
                    index + 1,
                    pageCount
                )).join('\n');

            }

            const multiPage = pagesHtml.split('class="page customer-list__page').length > 2;

            return Common.buildDocumentHtml({
                title: String(header.document_title ?? 'マスタ一覧'),
                bodyClass: Common.getBodyClass(layout),
                content: pagesHtml,
                multiPage,
            });

        }
    );

    window.MasterListTemplate = MasterListTemplate;
    window.CustomerListTemplate = MasterListTemplate;

})();
