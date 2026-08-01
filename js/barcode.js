(function (window) {
    'use strict';

    /**
     * AYANAS Print V2
     * barcode.js
     * Code39バーコード生成
     */

    const Barcode = {};

    /**
     * バーコード描画
     * @param {String} value
     */
    Barcode.render = function (value) {

        const svg = document.getElementById("barcode");

        if (!svg) {
            return;
        }

        if (!value) {
            svg.innerHTML = "";
            return;
        }

        JsBarcode(svg, String(value), {

            format: "CODE39",

            displayValue: true,

            fontSize: 16,

            height: 50,

            width: 2,

            margin: 0,

            textMargin: 5,

            background: "#ffffff",

            lineColor: "#000000"

        });

    };

    window.Barcode = Barcode;

})(window);