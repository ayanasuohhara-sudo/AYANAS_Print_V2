(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * template.js
     *
     * 受注票の HTML 文字列を生成する。
     * DOM 操作・Record.get()・kintone・印刷・JsBarcode 描画は行わない。
     */

    const Template = {};

    /**
     * Format モジュールの読み込みを確認する
     * @throws {Error} Format が未読込の場合
     */
    const assertFormatLoaded = () => {

        if (typeof Format === 'undefined') {
            throw new Error('Format モジュールが読み込まれていません。');
        }

        if (typeof Format.escapeHtml !== 'function') {
            throw new Error('Format.escapeHtml が利用できません。');
        }

        if (typeof Format.formatMoney !== 'function') {
            throw new Error('Format.formatMoney が利用できません。');
        }

        if (typeof Format.formatDate !== 'function') {
            throw new Error('Format.formatDate が利用できません。');
        }

    };

    /**
     * 帳票データの妥当性を検証する
     * @param {*} data - 帳票データ
     * @throws {Error} データが不正な場合
     */
    const validateData = (data) => {

        if (!data || typeof data !== 'object') {
            throw new Error('帳票データが指定されていません。');
        }

        if (!data.header || typeof data.header !== 'object') {
            throw new Error('header が不正です。');
        }

        if (!Array.isArray(data.details)) {
            throw new Error('details が不正です。');
        }

        if (!data.summary || typeof data.summary !== 'object') {
            throw new Error('summary が不正です。');
        }

    };

    /**
     * 文字列値を HTML 表示用にエスケープする
     * @param {*} value - 表示値
     * @returns {string} エスケープ後の文字列
     */
    const esc = (value) => Format.escapeHtml(value);

    /**
     * ヘッダーテーブル HTML を生成する
     * @param {Object} header - ヘッダーデータ
     * @returns {string} ヘッダー HTML
     */
    const buildHeaderHtml = (header) => {

        return `
<div class="barcode">
    <svg id="barcode" class="barcode"></svg>
</div>
<table class="header">
    <tr>
        <th>管理番号</th>
        <td>${esc(header.manage_no)}</td>
        <th>受注日</th>
        <td>${esc(Format.formatDate(header.order_date))}</td>
    </tr>
    <tr>
        <th>納期</th>
        <td>${esc(Format.formatDate(header.deadline))}</td>
        <th>顧客コード</th>
        <td>${esc(header.customer_code)}</td>
    </tr>
    <tr>
        <th>顧客名</th>
        <td colspan="3">${esc(header.customer_name)}</td>
    </tr>
    <tr>
        <th>お客様名</th>
        <td colspan="3">${esc(header.client_name)}</td>
    </tr>
    <tr>
        <th>伝票番号</th>
        <td>${esc(header.slip_no)}</td>
        <th>担当</th>
        <td>${esc(header.in_charge)}</td>
    </tr>
    <tr>
        <th>着物種類</th>
        <td>${esc(header.kimono_type)}</td>
        <th>仕様</th>
        <td>${esc(header.kimono_spec)}</td>
    </tr>
</table>`;

    };

    /**
     * 明細行 HTML を生成する
     * @param {Array<Object>} details - 明細データ
     * @returns {string} 明細 tbody HTML
     */
    const buildDetailRowsHtml = (details) => {

        if (details.length === 0) {
            return '<tr><td colspan="6">明細はありません</td></tr>';
        }

        return details.map((detail) => (
            `<tr>`
            + `<td>${esc(detail.rowNo)}</td>`
            + `<td>${esc(detail.item_code)}</td>`
            + `<td>${esc(detail.item_name)}</td>`
            + `<td>${esc(Format.formatMoney(detail.unit_price))}</td>`
            + `<td>${esc(detail.qty)}</td>`
            + `<td>${esc(Format.formatMoney(detail.amount))}</td>`
            + `</tr>`
        )).join('');

    };

    /**
     * 明細テーブル HTML を生成する
     * @param {Array<Object>} details - 明細データ
     * @returns {string} 明細テーブル HTML
     */
    const buildDetailTableHtml = (details) => {

        return `
<table class="detail-table">
    <thead>
        <tr>
            <th>No</th>
            <th>商品コード</th>
            <th>商品名</th>
            <th>単価</th>
            <th>数量</th>
            <th>金額</th>
        </tr>
    </thead>
    <tbody>
${buildDetailRowsHtml(details)}
    </tbody>
    <tfoot>
        <tr>
            <th colspan="6">合計</th>
        </tr>
    </tfoot>
</table>`;

    };

    /**
     * 集計テーブル HTML を生成する
     * @param {Object} summary - 集計データ
     * @returns {string} 集計 HTML
     */
    const buildSummaryHtml = (summary) => {

        const count = summary.totalCount ?? summary.count ?? 0;

        return `
<table class="summary">
    <tbody>
        <tr>
            <th>点数</th>
            <td>${esc(count)}</td>
            <th>数量合計</th>
            <td>${esc(summary.totalQty)}</td>
            <th>金額合計</th>
            <td>${esc(Format.formatMoney(summary.totalAmount))}</td>
        </tr>
    </tbody>
</table>`;

    };

    /**
     * 受注票 HTML を生成する
     * @param {{
     *   header: Object,
     *   details: Array<Object>,
     *   summary: Object
     * }} data - Record.get() の戻り値
     * @returns {string} 受注票 HTML 文字列
     * @throws {Error} データ不正または HTML 生成失敗時
     */
    Template.render = (data) => {

        try {

            assertFormatLoaded();
            validateData(data);

            const { header, details, summary } = data;

            return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>AYANAS Print</title>
</head>
<body>
<div class="page">
    <h1>受 注 票</h1>
    ${buildHeaderHtml(header)}
    ${buildDetailTableHtml(details)}
    ${buildSummaryHtml(summary)}
</div>
</body>
</html>`;

        } catch (error) {

            if (error instanceof Error && (
                error.message.includes('Format')
                || error.message.includes('header')
                || error.message.includes('details')
                || error.message.includes('summary')
                || error.message.includes('帳票データ')
            )) {
                throw error;
            }

            const message = error instanceof Error
                ? error.message
                : '不明なエラー';

            throw new Error(`Template.render: HTML 生成に失敗しました。（${message}）`);

        }

    };

    window.Template = Template;

})();
