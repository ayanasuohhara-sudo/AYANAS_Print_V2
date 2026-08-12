(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * templates/template_base.js
     *
     * 帳票テンプレート雛形。
     * コピーして InvoiceTemplate / EstimateTemplate 等を作成してください。
     *
     * コピー時の変更点:
     *   1. TEMPLATE_NAME を変更（例: 'InvoiceTemplate'）
     *   2. window.BaseTemplate → window.InvoiceTemplate に変更
     *   3. buildHeader / buildDetail / buildSummary を Definition に合わせて実装
     */

    const TEMPLATE_NAME = 'BaseTemplate';

    const getDefinition = (layout) => {

        if (!layout?.definition) {
            throw new Error(`${TEMPLATE_NAME}: 帳票定義が指定されていません。`);
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

    /**
     * ヘッダー HTML を生成する
     * @param {Object} definition - 帳票定義
     * @param {Object} header - ヘッダーデータ
     * @param {Object} config - プラグイン設定
     * @returns {string} HTML 文字列
     */
    const buildHeader = (definition, header, config) => {

        const headerDef = definition.header ?? {};

        const barcodeHtml = headerDef.showBarcodeFromConfig && Common.isBarcodeVisible(config)
            ? `<div class="barcode">
    <svg id="barcode" class="barcode"></svg>
</div>`
            : '';

        const rowsHtml = (headerDef.rows ?? []).map((row) => {

            const cellsHtml = (row.cells ?? []).map((cell) => {

                const colspan = cell.colspan ? ` colspan="${cell.colspan}"` : '';
                const value = formatValue(header[cell.field], cell.format);

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

        if (rowsHtml === '' && barcodeHtml === '') {
            return '';
        }

        return `
${barcodeHtml}
<table class="header">
    ${rowsHtml}
</table>`;

    };

    /**
     * 明細 HTML を生成する
     * @param {Object} definition - 帳票定義
     * @param {Array} details - 明細データ
     * @param {Object} header - ヘッダーデータ
     * @returns {string} HTML 文字列
     */
    const buildDetail = (definition, details, header) => {

        const columns = definition.columns ?? [];
        const tableClass = definition.detailTable?.tableClass ?? 'detail-table';
        const emptyColspan = definition.detailTable?.emptyColspan ?? columns.length;
        const emptyMessage = definition.detailTable?.emptyMessage ?? '';

        const buildColumnHeaderHtml = () => columns.map((column) => (
            `<th${buildWidthStyle(column.width)}>${Common.esc(column.title)}</th>`
        )).join('');

        const buildDetailCellHtml = (column, detail) => {

            const source = column.source === 'header' ? header : detail;
            const rawValue = source?.[column.field] ?? '';
            const value = formatValue(rawValue, column.format);
            const className = column.className ? ` class="${column.className}"` : '';

            return `<td${className}>${Common.esc(value)}</td>`;

        };

        const rowsHtml = details.length === 0
            ? `<tr><td colspan="${emptyColspan}">${Common.esc(emptyMessage)}</td></tr>`
            : details.map((detail) => {

                const cellsHtml = columns.map((column) => (
                    buildDetailCellHtml(column, detail)
                )).join('');

                return `<tr>${cellsHtml}</tr>`;

            }).join('');

        const footerLabel = definition.detailTable?.footerLabel;
        const footerHtml = footerLabel
            ? `
    <tfoot>
        <tr>
            <th colspan="${columns.length}">${Common.esc(footerLabel)}</th>
        </tr>
    </tfoot>`
            : '';

        if (columns.length === 0) {
            return '';
        }

        return `
<table class="${tableClass}">
    <thead>
        <tr>
            ${buildColumnHeaderHtml()}
        </tr>
    </thead>
    <tbody>
${rowsHtml}
    </tbody>${footerHtml}
</table>`;

    };

    /**
     * 集計 HTML を生成する
     * @param {Object} definition - 帳票定義
     * @param {Object} summary - 集計データ
     * @returns {string} HTML 文字列
     */
    const buildSummary = (definition, summary) => {

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

        if (rowsHtml === '') {
            return '';
        }

        return `
<table class="${tableClass}">
    <tbody>
        ${rowsHtml}
    </tbody>
</table>`;

    };

    const BaseTemplate = TemplateInterface.create(TEMPLATE_NAME, (data, config = {}, layout = {}) => {

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
    ${buildHeader(definition, header, config)}
    ${buildDetail(definition, details, header)}
    ${buildSummary(definition, summary)}`,
        });

    });

    window.BaseTemplate = BaseTemplate;

})();
