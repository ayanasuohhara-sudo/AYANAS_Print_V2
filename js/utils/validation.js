(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * utils/validation.js
     *
     * 帳票フレームワーク共通の検証処理。
     */

    const Validation = {};

    /**
     * モジュールの読み込みを確認する
     * @param {Object|null|undefined} moduleRef - モジュール
     * @param {string} moduleName - モジュール名
     * @param {string} [methodName='render'] - 必須メソッド名
     * @throws {Error} 未読込の場合
     */
    Validation.assertModule = (moduleRef, moduleName, methodName = 'render') => {

        if (!moduleRef || typeof moduleRef[methodName] !== 'function') {
            throw new Error(`${moduleName} が読み込まれていません。`);
        }

    };

    /**
     * オブジェクトの存在を確認する
     * @param {*} value - 検証対象
     * @param {string} name - 項目名
     * @throws {Error} 不正な場合
     */
    Validation.assertObject = (value, name) => {

        if (!value || typeof value !== 'object') {
            throw new Error(`${name} が指定されていません。`);
        }

    };

    /**
     * 帳票データの最小要件を検証する
     * @param {*} data - 帳票データ
     * @throws {Error} データが不正な場合
     */
    Validation.assertReportData = (data) => {

        Validation.assertObject(data, '帳票データ');
        Validation.assertObject(data.header, 'header');

    };

    /**
     * 明細付き帳票データを検証する
     * @param {*} data - 帳票データ
     * @throws {Error} データが不正な場合
     */
    Validation.assertDetailReportData = (data) => {

        Validation.assertReportData(data);

        if (!Array.isArray(data.details)) {
            throw new Error('details が不正です。');
        }

        if (!data.summary || typeof data.summary !== 'object') {
            throw new Error('summary が不正です。');
        }

    };

    /**
     * レイアウト情報を検証する
     * @param {Object} layout - レイアウト情報
     * @throws {Error} レイアウトが不正な場合
     */
    Validation.assertLayout = (layout) => {

        Validation.assertObject(layout, 'レイアウト情報');
        Validation.assertModule(layout.template, 'テンプレート');

    };

    window.Validation = Validation;

})();
