(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * barcode.js
     *
     * Code39 バーコードを SVG 要素へ描画する。
     * HTML 生成・印刷・Record.get()・Template.render()・kintone API は使用しない。
     */

    const Barcode = {};

    /** Code39 描画オプション */
    const BARCODE_OPTIONS = {
        format: 'CODE39',
        displayValue: true,
        textAlign: 'center',
        height: 40,
        width: 2,
        margin: 8,
        fontSize: 16,
        background: '#ffffff',
        lineColor: '#000000',
    };

    /**
     * JsBarcode ライブラリの読み込みを確認する
     * @throws {Error} JsBarcode が未読込の場合
     */
    const assertJsBarcodeLoaded = () => {

        if (typeof window.JsBarcode !== 'function') {
            throw new Error('JsBarcode ライブラリが読み込まれていません。');
        }

    };

    /**
     * SVG 要素の妥当性を検証する
     * @param {*} svgElement - SVG 要素
     * @throws {Error} SVG 要素が取得できない場合
     */
    const assertSvgElement = (svgElement) => {

        if (svgElement === null || svgElement === undefined) {
            throw new Error('SVG 要素が取得できません。');
        }

        if (String(svgElement.tagName).toLowerCase() !== 'svg') {
            throw new Error('SVG 要素が不正です。');
        }

    };

    /**
     * バーコード値の妥当性を検証する
     * @param {*} value - バーコード文字列
     * @returns {string} 検証済みバーコード文字列
     * @throws {Error} 値が未指定または空の場合
     */
    const assertValue = (value) => {

        if (value === null || value === undefined) {
            throw new Error('バーコード値が指定されていません。');
        }

        const text = String(value).trim();

        if (text === '') {
            throw new Error('バーコード値が空です。');
        }

        return text;

    };

    /**
     * バーコード種類を解決する
     * @param {Object} config - プラグイン設定または描画オプション
     * @returns {'CODE39'|'CODE128'|'EAN13'} バーコード種類
     */
    Barcode.resolveFormat = (config = {}) => {

        if (config.barcode_type === 'CODE128') {
            return 'CODE128';
        }

        if (config.barcode_type === 'EAN13') {
            return 'EAN13';
        }

        return 'CODE39';

    };

    /**
     * Code39 / Code128 / EAN13 バーコードを SVG 要素へ描画する
     * @param {SVGElement} svgElement - 描画先 SVG 要素
     * @param {string} value - バーコード文字列
     * @param {Object} [options={}] - 描画オプション（format / barcode_type）
     * @throws {Error} JsBarcode 未読込・SVG 未取得・値未指定時
     */
    Barcode.draw = (svgElement, value, options = {}) => {

        try {

            assertJsBarcodeLoaded();
            assertSvgElement(svgElement);

            const barcodeValue = assertValue(value);

            const drawOptions = {
                ...BARCODE_OPTIONS,
                ...options,
                format: options.format ?? Barcode.resolveFormat(options),
            };

            window.JsBarcode(svgElement, barcodeValue, drawOptions);

        } catch (error) {

            if (error instanceof Error && (
                error.message.includes('JsBarcode')
                || error.message.includes('SVG')
                || error.message.includes('バーコード値')
            )) {
                throw error;
            }

            const message = error instanceof Error
                ? error.message
                : '不明なエラー';

            throw new Error(`Barcode.draw: 描画に失敗しました。（${message}）`);

        }

    };

    window.Barcode = Barcode;

})();