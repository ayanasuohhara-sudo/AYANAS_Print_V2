(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * templates/order.js
     */

    const getDefinition = (layout) => {

        if (!layout?.definition) {
            throw new Error('OrderTemplate: 帳票定義が指定されていません。');
        }

        return layout.definition;

    };

    const formatValue = (value, format) => {

        if (format === 'date') {
            return Format.formatDate(value);
        }

        if (format === 'money') {
            return Format.formatMoney(value);
        }

        return value;

    };

    const resolveSummaryField = (summary, field) => {

        if (field === 'totalCount') {
            return summary.totalCount ?? summary.count ?? 0;
        }

        return summary[field];

    };

    const resolveFieldValue = (field, format, sources) => {

        const { header, detail, summary } = sources;
        const value = header[field] ?? detail?.[field] ?? '';

        return formatValue(value, format);

    };

    const buildWidthStyle = (width) => {

        if (typeof width === 'number' && width > 0) {
            return ` style="width:${width}px"`;
        }

        return '';

    };

    const buildHeaderHtml = (definition, header, config) => {

        const headerDef = definition.header ?? {};
        const barcodeHtml = headerDef.showBarcodeFromConfig && Common.isBarcodeVisible(config)
            ? `<div class="barcode">
    <svg id="barcode" class="barcode"></svg>
</div>`
            : '';

        const rowsHtml = (headerDef.rows ?? []).map((row) => {

            const cellsHtml = (row.cells ?? []).map((cell) => {

                const colspan = cell.colspan ? ` colspan="${cell.colspan}"` : '';
                const value = resolveFieldValue(cell.field, cell.format, { header });

                if (cell.label && cell.colspan) {
                    return `<th>${Common.esc(cell.label)}</th><td${colspan}>${Common.esc(value)}</td>`;
                }

                if (cell.label) {
                    return `<th>${Common.esc(cell.label)}</th><td>${Common.esc(value)}</td>`;
                }

                return `<td${colspan}>${Common.esc(value)}</td>`;

            }).join('');

            return `<tr>${cellsHtml}</tr>`;

        }).join('\n    ');

        return `
${barcodeHtml}
<table class="header">
    ${rowsHtml}
</table>`;

    };

    const buildColumnHeaderHtml = (columns) => (columns ?? []).map((column) => (
        `<th${buildWidthStyle(column.width)}>${Common.esc(column.title)}</th>`
    )).join('');

    const buildDetailCellHtml = (column, sources) => {

        const { header, detail } = sources;
        const source = column.source === 'header' ? header : detail;
        const rawValue = source?.[column.field] ?? '';
        const value = formatValue(rawValue, column.format);
        const className = column.className ? ` class="${column.className}"` : '';

        return `<td${className}>${Common.esc(value)}</td>`;

    };

    const buildDetailRowsHtml = (definition, details, header) => {

        const columns = definition.columns ?? [];
        const emptyColspan = definition.detailTable?.emptyColspan ?? columns.length;

        if (details.length === 0) {
            return `<tr><td colspan="${emptyColspan}">${Common.esc(definition.detailTable?.emptyMessage ?? '')}</td></tr>`;
        }

        return details.map((detail) => {

            const cellsHtml = columns.map((column) => (
                buildDetailCellHtml(column, { header, detail })
            )).join('');

            return `<tr>${cellsHtml}</tr>`;

        }).join('');

    };

    const buildDetailTableHtml = (definition, details, header) => {

        const columns = definition.columns ?? [];
        const tableClass = definition.detailTable?.tableClass ?? 'detail-table';
        const footerLabel = definition.detailTable?.footerLabel;

        const footerHtml = footerLabel
            ? `
    <tfoot>
        <tr>
            <th colspan="${columns.length}">${Common.esc(footerLabel)}</th>
        </tr>
    </tfoot>`
            : '';

        return `
<table class="${tableClass}">
    <thead>
        <tr>
            ${buildColumnHeaderHtml(columns)}
        </tr>
    </thead>
    <tbody>
${buildDetailRowsHtml(definition, details, header)}
    </tbody>${footerHtml}
</table>`;

    };

    const buildSummaryHtml = (definition, summary) => {

        const summaryDef = definition.summary ?? {};
        const tableClass = summaryDef.tableClass ?? 'summary';

        const rowsHtml = (summaryDef.rows ?? []).map((row) => {

            const cellsHtml = (row.cells ?? []).map((cell) => {

                const rawValue = cell.source === 'summary'
                    ? resolveSummaryField(summary, cell.field)
                    : summary[cell.field];

                const value = formatValue(rawValue, cell.format);

                return `<th>${Common.esc(cell.label)}</th><td>${Common.esc(value)}</td>`;

            }).join('');

            return `<tr>${cellsHtml}</tr>`;

        }).join('');

        return `
<table class="${tableClass}">
    <tbody>
        ${rowsHtml}
    </tbody>
</table>`;

    };

    const OrderTemplate = TemplateInterface.create('OrderTemplate', (data, config = {}, layout = {}) => {

        Common.assertFormatLoaded();
        Validation.assertDetailReportData(data);

        const definition = getDefinition(layout);
        const { header, details, summary } = data;
        const reportTitle = Common.getTitle(layout, config, definition.title);

        return Common.buildDocumentHtml({
            title: reportTitle,
            bodyClass: Common.getBodyClass(layout),
            content: `
    <h1>${Common.esc(reportTitle)}</h1>
    ${buildHeaderHtml(definition, header, config)}
    ${buildDetailTableHtml(definition, details, header)}
    ${buildSummaryHtml(definition, summary)}`,
        });

    });

    window.OrderTemplate = OrderTemplate;

})();
