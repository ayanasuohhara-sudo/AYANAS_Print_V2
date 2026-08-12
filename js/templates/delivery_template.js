(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * templates/delivery_template.js
     */

    const getDefinition = (layout) => {

        if (!layout?.definition) {
            throw new Error('DeliveryTemplate: 帳票定義が指定されていません。');
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

    const buildWidthStyle = (width) => {

        if (typeof width === 'number' && width > 0) {
            return ` style="width:${width}px"`;
        }

        return '';

    };

    const getCompanyInfo = (definition, layout = {}, config = {}) => {

        const source = layout.company ?? config.company ?? definition.company ?? {};

        return {
            name: source.name ?? '',
            address: source.address ?? '',
            tel: source.tel ?? '',
            fax: source.fax ?? '',
            registrationNo: source.registrationNo ?? '',
        };

    };

    const buildHeaderHtml = (definition, header, layout, config) => {

        const headerDef = definition.header ?? {};
        const company = getCompanyInfo(definition, layout, config);
        const displayTitle = headerDef.displayTitle ?? definition.title;

        const metaHtml = (headerDef.meta ?? []).map((item) => {

            const value = formatValue(header[item.field], item.format);

            return `
            <div class="delivery-meta__item">
                <dt>${Common.esc(item.label)}</dt>
                <dd>${Common.esc(value)}</dd>
            </div>`;

        }).join('');

        const barcodeHtml = headerDef.showBarcode
            ? `<div class="delivery-barcode">
            <svg id="barcode" class="barcode"></svg>
        </div>`
            : '';

        return `
<header class="delivery-header">
    <div class="delivery-header__main">
        <h1 class="delivery-title">${Common.esc(displayTitle)}</h1>
        <dl class="delivery-meta">${metaHtml}
        </dl>
    </div>
    <div class="delivery-header__aside">
        ${barcodeHtml}
        <div class="delivery-header__company">
            <p class="company-name">${Common.esc(company.name)}</p>
            <p class="company-address">${Common.esc(company.address)}</p>
            <p class="company-contact">${Common.esc(company.tel)}</p>
            <p class="company-contact">${Common.esc(company.fax)}</p>
            <p class="company-registration">${Common.esc(company.registrationNo)}</p>
        </div>
    </div>
</header>`;

    };

    const buildColumnHeaderHtml = (columnGroup) => (columnGroup.columns ?? []).map((column) => {

        const colspan = column.colspan ? ` colspan="${column.colspan}"` : '';

        return `<th${colspan}${buildWidthStyle(column.width)}>${Common.esc(column.title)}</th>`;

    }).join('');

    const buildDetailCellHtml = (column, sources) => {

        const { header, detail } = sources;
        const source = column.source === 'header' ? header : detail;
        const rawValue = source?.[column.field] ?? '';
        const value = formatValue(rawValue, column.format);
        const className = column.className ? ` class="${column.className}"` : '';
        const colspan = column.colspan ? ` colspan="${column.colspan}"` : '';

        return `<td${className}${colspan}>${Common.esc(value)}</td>`;

    };

    const buildDetailRowsHtml = (definition, details, header) => {

        const columnGroups = definition.detailTables ?? [];
        const emptyColspan = definition.detailTable?.emptyColspan ?? columnGroups[0]?.columns?.length ?? 1;

        if (details.length === 0) {
            return `<tr class="${Common.esc(columnGroups[0]?.rowClass ?? 'detail-row')}"><td colspan="${emptyColspan}">${Common.esc(definition.detailTable?.emptyMessage ?? '')}</td></tr>`;
        }

        return details.map((detail) => columnGroups.map((columnGroup) => {

            const cellsHtml = (columnGroup.columns ?? []).map((column) => (
                buildDetailCellHtml(column, { header, detail })
            )).join('');

            const rowClass = columnGroup.rowClass ? ` class="${columnGroup.rowClass}"` : '';

            return `<tr${rowClass}>${cellsHtml}</tr>`;

        }).join('')).join('');

    };

    const buildDetailTableHtml = (definition, details, header) => {

        const columnGroups = definition.detailTables ?? [];
        const tableClass = definition.detailTable?.tableClass ?? 'delivery-detail-table';

        const headHtml = columnGroups.map((columnGroup) => {

            const headClass = columnGroup.headClass ? ` class="${columnGroup.headClass}"` : '';

            return `<tr${headClass}>${buildColumnHeaderHtml(columnGroup)}</tr>`;

        }).join('\n        ');

        return `
<table class="${tableClass}">
    <thead>
        ${headHtml}
    </thead>
    <tbody>
${buildDetailRowsHtml(definition, details, header)}
    </tbody>
</table>`;

    };

    const buildSummaryHtml = (definition, summary) => {

        const summaryDef = definition.summary ?? {};
        const tableClass = summaryDef.tableClass ?? 'delivery-summary';
        const wrapperClass = summaryDef.wrapperClass ?? 'delivery-footer';
        const subtotal = summary.totalAmount ?? 0;
        const taxRate = summaryDef.taxRate ?? 0;
        const tax = Math.floor(subtotal * taxRate);
        const total = subtotal + tax;

        const computedValues = {
            subtotal,
            tax,
            total,
        };

        const rowsHtml = (summaryDef.items ?? []).map((item) => {

            let rawValue = '';

            if (item.role === 'tax') {
                rawValue = computedValues.tax;
            } else if (item.role === 'total') {
                rawValue = computedValues.total;
            } else if (item.role === 'subtotal') {
                rawValue = computedValues.subtotal;
            } else if (item.source === 'summary') {
                rawValue = resolveSummaryField(summary, item.field);
            }

            const value = formatValue(rawValue, item.format);
            const rowClass = item.role === 'total' ? ` class="${summaryDef.totalRowClass ?? ''}"` : '';

            return `
            <tr${rowClass}>
                <th>${Common.esc(item.label)}</th>
                <td>${Common.esc(value)}</td>
            </tr>`;

        }).join('');

        return `
<footer class="${wrapperClass}">
    <table class="${tableClass}">
        <tbody>${rowsHtml}
        </tbody>
    </table>
</footer>`;

    };

    const DeliveryTemplate = TemplateInterface.create('DeliveryTemplate', (data, config = {}, layout = {}) => {

        Common.assertFormatLoaded();
        Validation.assertDetailReportData(data);

        const definition = getDefinition(layout);
        const { header, details, summary } = data;
        const reportTitle = Common.getTitle(layout, config, definition.title);

        return Common.buildDocumentHtml({
            title: reportTitle,
            bodyClass: Common.getBodyClass(layout),
            content: `
    ${buildHeaderHtml(definition, header, layout, config)}
    ${buildDetailTableHtml(definition, details, header)}
    ${buildSummaryHtml(definition, summary)}`,
        });

    });

    window.DeliveryTemplate = DeliveryTemplate;

})();
