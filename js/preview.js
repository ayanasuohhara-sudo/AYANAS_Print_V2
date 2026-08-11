(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * preview.js
     *
     * Template.render() で取得した HTML を別ウィンドウでプレビュー表示する。
     * Record.get() は呼び出さない。
     */

    const Preview = {};

    /** プレビューウィンドウのサイズ */
    const PREVIEW_WINDOW_FEATURES = 'width=1200,height=900';

    /** print.css のパス */
    const PRINT_CSS_PATH = 'css/print.css';

    /** JsBarcode ライブラリのパス */
    const JSBARCODE_PATH = 'lib/JsBarcode.all.min.js';

    /** barcode.js のパス */
    const BARCODE_JS_PATH = 'js/barcode.js';

    /**
     * Template モジュールの読み込みを確認する
     * @throws {Error} Template が未読込の場合
     */
    const assertTemplateLoaded = () => {

        if (typeof Template === 'undefined') {
            throw new Error('Template モジュールが読み込まれていません。');
        }

        if (typeof Template.render !== 'function') {
            throw new Error('Template.render が利用できません。');
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

    };

    /**
     * プラグインリソースの URL を取得する
     * @param {string} filePath - プラグイン内ファイルパス
     * @returns {string} リソース URL
     * @throws {Error} URL を取得できない場合
     */
    const getPluginResourceUrl = (filePath) => {

        if (typeof kintone === 'undefined') {
            throw new Error('kintone が読み込まれていません。');
        }

        if (!kintone.$PLUGIN_ID) {
            throw new Error('プラグイン ID を取得できません。');
        }

        return `/k/plugin/${kintone.$PLUGIN_ID}/${filePath}`;

    };

    /**
     * バーコード描画用文字列を取得する
     * @param {Object} data - 帳票データ
     * @returns {string} バーコード値
     */
    const getBarcodeValue = (data) => String(data.header.manage_no ?? '');

    /**
     * 印刷・閉じるボタン HTML を生成する
     * @returns {string} ボタン HTML
     */
    const buildButtonsHtml = () => `

    <div class="buttons">
        <button type="button" id="ayanas-print-btn">印刷</button>
        <button type="button" id="ayanas-close-btn">閉じる</button>
    </div>`;

    /**
     * プレビュー用スクリプト HTML を生成する
     * @param {string} barcodeValue - バーコード値
     * @returns {string} スクリプト HTML
     */
    const buildScriptHtml = (barcodeValue) => `

<script src="${getPluginResourceUrl(JSBARCODE_PATH)}"><\/script>
<script src="${getPluginResourceUrl(BARCODE_JS_PATH)}"><\/script>
<script>
window.addEventListener('load', function () {

    try {

        var svg = document.getElementById('barcode');

        Barcode.draw(svg, ${JSON.stringify(barcodeValue)});

    } catch (error) {

        console.error('[AYANAS Print]', error);

        var message = error instanceof Error
            ? error.message
            : '不明なエラーが発生しました。';

        alert('バーコード描画エラー\\n\\n' + message);

    }

    document.getElementById('ayanas-print-btn').addEventListener('click', function () {
        window.print();
    });

    document.getElementById('ayanas-close-btn').addEventListener('click', function () {
        window.close();
    });

});
<\/script>`;

    /**
     * プレビュー用 HTML を組み立てる
     * @param {Object} data - 帳票データ
     * @returns {string} プレビュー HTML
     */
    const buildPreviewHtml = (data) => {

        const barcodeValue = getBarcodeValue(data);
        let html = Template.render(data);

        html = html.replace(
            '</head>',
            `<link rel="stylesheet" href="${getPluginResourceUrl(PRINT_CSS_PATH)}">\n</head>`
        );

        html = html.replace(
            /<\/div>\s*<\/body>/,
            `${buildButtonsHtml()}\n</div>\n</body>`
        );

        html = html.replace(
            '</body>',
            `${buildScriptHtml(barcodeValue)}\n</body>`
        );

        return html;

    };

    /**
     * 印刷プレビューを別ウィンドウで開く
     * @param {{
     *   header: Object,
     *   details: Array<Object>,
     *   summary: Object
     * }} data - 帳票データ
     * @throws {Error} プレビュー表示に失敗した場合
     */
    Preview.open = (data) => {

        try {

            assertTemplateLoaded();
            validateData(data);

            const printWindow = window.open('', '_blank', PREVIEW_WINDOW_FEATURES);

            if (!printWindow) {
                throw new Error('印刷ウィンドウを開けません。');
            }

            const html = buildPreviewHtml(data);

            printWindow.document.open();
            printWindow.document.write(html);
            printWindow.document.close();

        } catch (error) {

            if (error instanceof Error && (
                error.message.includes('Template')
                || error.message.includes('帳票データ')
                || error.message.includes('header')
                || error.message.includes('印刷ウィンドウ')
                || error.message.includes('kintone')
                || error.message.includes('プラグイン ID')
            )) {
                throw error;
            }

            const message = error instanceof Error
                ? error.message
                : '不明なエラー';

            throw new Error(`Preview.open: プレビュー表示に失敗しました。（${message}）`);

        }

    };

    window.Preview = Preview;

})();
