(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * utils/common.js
     *
     * 帳票テンプレート共通ユーティリティ。
     */

    const Common = {};

    /**
     * Format モジュールの読み込みを確認する
     * @throws {Error} Format が未読込の場合
     */
    Common.assertFormatLoaded = () => {

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
     * HTML エスケープする
     * @param {*} value - 表示値
     * @returns {string} エスケープ後文字列
     */
    Common.esc = (value) => Format.escapeHtml(value);

    /**
     * ドット記法で値を取得する
     * @param {Object} source - 参照元
     * @param {string} path - フィールドパス
     * @returns {*} 値
     */
    Common.getValueByPath = (source, path) => {

        if (!source || typeof source !== 'object' || typeof path !== 'string' || path === '') {
            return '';
        }

        return path.split('.').reduce((current, key) => {

            if (current === null || current === undefined) {
                return '';
            }

            return current[key];

        }, source);

    };

    /**
     * 帳票タイトルを取得する
     * @param {Object} layout - レイアウト情報
     * @param {Object} config - プラグイン設定
     * @param {string} fallback - デフォルトタイトル
     * @returns {string} タイトル
     */
    Common.getTitle = (layout = {}, config = {}, fallback = '') => {

        if (typeof layout.title === 'string' && layout.title.trim() !== '') {
            return layout.title.trim();
        }

        const title = config.report_title;

        if (typeof title === 'string' && title.trim() !== '') {
            return title.trim();
        }

        return fallback;

    };

    /**
     * body クラス名を取得する
     * @param {Object} layout - レイアウト情報
     * @returns {string} body クラス名
     */
    Common.getBodyClass = (layout = {}) => {

        if (typeof layout.pageClass === 'string' && layout.pageClass.trim() !== '') {
            return layout.pageClass.trim();
        }

        return `report-${layout.reportType || 'order'}`;

    };

    /**
     * バーコード表示有無を判定する
     * @param {Object} config - プラグイン設定
     * @returns {boolean} 表示する場合 true
     */
    Common.isBarcodeVisible = (config = {}) => config.barcode_visible !== '0';

    /**
     * 帳票 HTML ドキュメントを生成する
     * @param {Object} options - 生成オプション
     * @param {string} options.title - ページタイトル
     * @param {string} options.bodyClass - body クラス
     * @param {string} options.content - 本文 HTML
     * @returns {string} HTML 文字列
     */
    Common.buildDocumentHtml = ({ title, bodyClass, content }) => {

        const safeTitle = Common.esc(title);
        const safeBodyClass = Common.esc(bodyClass);

        return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${safeTitle}</title>
</head>
<body class="${safeBodyClass}">
<div class="page">
${content}
</div>
</body>
</html>`;

    };

    /**
     * 設定値をマージする
     * @param {Object} base - ベース設定
     * @param {Object} overrides - 上書き設定
     * @returns {Object} マージ後設定
     */
    Common.mergeConfig = (...sources) => Object.assign({}, ...sources);

    window.Common = Common;

})();
