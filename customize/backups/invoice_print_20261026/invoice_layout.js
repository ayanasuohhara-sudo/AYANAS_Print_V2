(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * invoice_layout.js
     *
     * 請求書レイアウト種別（通常 / 長形3号窓付き封筒用）。
     * 将来: 顧客管理 App 8 の invoice_layout から自動解決。
     */

    const InvoiceLayout = {};

    /** 通常レイアウト */
    InvoiceLayout.NORMAL = 'normal';

    /** 長形3号窓付き封筒用 */
    InvoiceLayout.WINDOW_ENVELOPE = 'window_envelope';

    InvoiceLayout.LABELS = {
        [InvoiceLayout.NORMAL]: '通常',
        [InvoiceLayout.WINDOW_ENVELOPE]: '窓付き封筒',
    };

    /**
     * 長形3号窓付き封筒・A4縦三つ折り時の窓位置基準（mm）
     * 用紙上端からの絶対位置（@page A4 210×297mm）
     */
    InvoiceLayout.WINDOW_ENVELOPE_SPEC = {
        /** A4 縦の 1/3 折り目（上端基準） */
        foldThirdMm: 99,
        /** 窓表示ゾーン上端（中段パネル内で窓が来る位置） */
        windowTopMm: 99,
        /** 窓表示ゾーン左端 */
        windowLeftMm: 15,
        /** 窓表示ゾーン幅（長3窓 約90mm） */
        windowWidthMm: 90,
        /** 窓表示ゾーン高さ（長3窓 約45mm） */
        windowHeightMm: 45,
    };

    InvoiceLayout.normalize = (value) => {

        const normalized = String(value ?? '').trim();

        if (normalized === InvoiceLayout.WINDOW_ENVELOPE) {
            return InvoiceLayout.WINDOW_ENVELOPE;
        }

        return InvoiceLayout.NORMAL;

    };

    InvoiceLayout.resolve = ({ invoiceLayout, customerInvoiceLayout } = {}) => {

        if (customerInvoiceLayout) {
            return InvoiceLayout.normalize(customerInvoiceLayout);
        }

        return InvoiceLayout.normalize(invoiceLayout);

    };

    InvoiceLayout.isWindowEnvelope = (layoutVariant) => (
        InvoiceLayout.normalize(layoutVariant) === InvoiceLayout.WINDOW_ENVELOPE
    );

    InvoiceLayout.getCssVariables = () => {

        const spec = InvoiceLayout.WINDOW_ENVELOPE_SPEC;

        return [
            `--invoice-fold-third:${spec.foldThirdMm}mm`,
            `--invoice-window-top:${spec.windowTopMm}mm`,
            `--invoice-window-left:${spec.windowLeftMm}mm`,
            `--invoice-window-width:${spec.windowWidthMm}mm`,
            `--invoice-window-height:${spec.windowHeightMm}mm`,
        ].join(';');

    };

    window.InvoiceLayout = InvoiceLayout;

})();
