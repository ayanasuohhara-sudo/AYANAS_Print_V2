(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * config.js
     *
     * プラグイン設定画面の読込・保存を行う。
     */

    /** フォーム要素 ID */
    const FIELD_IDS = {
        report_title: 'report-title',
        barcode_type: 'barcode-type',
        barcode_visible: 'barcode-visible',
        print_orientation: 'print-orientation',
        paper_size: 'paper-size',
    };

    /** 保存ボタン ID */
    const SAVE_BUTTON_ID = 'save-button';

    /** キャンセルボタン ID */
    const CANCEL_BUTTON_ID = 'cancel-button';

    /** 設定フォーム ID */
    const FORM_ID = 'ayanas-print-config-form';

    /**
     * kintone プラグイン API の読み込みを確認する
     * @throws {Error} kintone API が利用できない場合
     */
    const assertKintonePluginApi = () => {

        if (typeof kintone === 'undefined') {
            throw new Error('kintone が読み込まれていません。');
        }

        if (!kintone.plugin?.app?.getConfig || !kintone.plugin?.app?.setConfig) {
            throw new Error('kintone プラグイン API が利用できません。');
        }

        if (!kintone.$PLUGIN_ID) {
            throw new Error('プラグイン ID が取得できません。');
        }

    };

    /**
     * フォーム要素を取得する
     * @param {string} elementId - 要素 ID
     * @returns {HTMLElement} DOM 要素
     * @throws {Error} 要素が取得できない場合
     */
    const getElement = (elementId) => {

        const element = document.getElementById(elementId);

        if (!element) {
            throw new Error(`要素が取得できません。（${elementId}）`);
        }

        return element;

    };

    /**
     * 保存済み設定を画面へ反映する
     */
    const loadConfig = () => {

        try {

            assertKintonePluginApi();

            const config = kintone.plugin.app.getConfig(kintone.$PLUGIN_ID);

            if (!config || typeof config !== 'object') {
                return;
            }

            // 帳票タイトル
            if (config.report_title !== undefined && config.report_title !== '') {
                getElement(FIELD_IDS.report_title).value = config.report_title;
            }

            // バーコード種類
            if (config.barcode_type !== undefined && config.barcode_type !== '') {
                getElement(FIELD_IDS.barcode_type).value = config.barcode_type;
            }

            // バーコード表示
            if (config.barcode_visible !== undefined && config.barcode_visible !== '') {
                getElement(FIELD_IDS.barcode_visible).checked = config.barcode_visible === '1';
            }

            // 印刷方向
            if (config.print_orientation !== undefined && config.print_orientation !== '') {
                getElement(FIELD_IDS.print_orientation).value = config.print_orientation;
            }

            // 用紙サイズ
            if (config.paper_size !== undefined && config.paper_size !== '') {
                getElement(FIELD_IDS.paper_size).value = config.paper_size;
            }

        } catch (error) {

            console.error('[AYANAS Print]', error);

            const message = error instanceof Error
                ? error.message
                : '不明なエラーが発生しました。';

            alert(`設定の読込に失敗しました。\n\n${message}`);

        }

    };

    /**
     * 画面の設定値を収集する
     * @returns {Object<string, string>} 保存用設定
     */
    const collectConfigValues = () => {

        const reportTitle = getElement(FIELD_IDS.report_title);
        const barcodeType = getElement(FIELD_IDS.barcode_type);
        const barcodeVisible = getElement(FIELD_IDS.barcode_visible);
        const printOrientation = getElement(FIELD_IDS.print_orientation);
        const paperSize = getElement(FIELD_IDS.paper_size);

        return {
            report_title: reportTitle.value.trim(),
            barcode_type: barcodeType.value,
            barcode_visible: barcodeVisible.checked ? '1' : '0',
            print_orientation: printOrientation.value,
            paper_size: paperSize.value,
        };

    };

    /**
     * 設定値の妥当性を検証する
     * @param {Object<string, string>} config - 設定値
     * @throws {Error} 設定値が不正な場合
     */
    const validateConfigValues = (config) => {

        if (!config.report_title) {
            throw new Error('帳票タイトルを入力してください。');
        }

        const allowedBarcodeTypes = ['CODE39', 'CODE128'];

        if (!allowedBarcodeTypes.includes(config.barcode_type)) {
            throw new Error('バーコード種類が不正です。');
        }

        const allowedOrientations = ['landscape', 'portrait'];

        if (!allowedOrientations.includes(config.print_orientation)) {
            throw new Error('印刷方向が不正です。');
        }

        const allowedPaperSizes = ['A4', 'A5'];

        if (!allowedPaperSizes.includes(config.paper_size)) {
            throw new Error('用紙サイズが不正です。');
        }

        if (!['0', '1'].includes(config.barcode_visible)) {
            throw new Error('バーコード表示が不正です。');
        }

    };

    /**
     * 設定を保存する
     */
    const saveConfig = () => {

        try {

            assertKintonePluginApi();

            const config = collectConfigValues();

            validateConfigValues(config);

            kintone.plugin.app.setConfig(config, () => {
                alert('設定を保存しました。');
            });

        } catch (error) {

            console.error('[AYANAS Print]', error);

            const message = error instanceof Error
                ? error.message
                : '不明なエラーが発生しました。';

            alert(`設定の保存に失敗しました。\n\n${message}`);

        }

    };

    /**
     * 設定画面を閉じる
     */
    const closeWindow = () => {

        try {

            window.close();

        } catch (error) {

            console.error('[AYANAS Print]', error);

            const message = error instanceof Error
                ? error.message
                : '不明なエラーが発生しました。';

            alert(`画面を閉じられませんでした。\n\n${message}`);

        }

    };

    /**
     * 設定画面を初期化する
     */
    const initialize = () => {

        try {

            const form = getElement(FORM_ID);
            const saveButton = getElement(SAVE_BUTTON_ID);
            const cancelButton = getElement(CANCEL_BUTTON_ID);

            loadConfig();

            form.addEventListener('submit', (event) => {

                event.preventDefault();
                saveConfig();

            });

            saveButton.addEventListener('click', (event) => {

                event.preventDefault();
                saveConfig();

            });

            cancelButton.addEventListener('click', () => {
                closeWindow();
            });

        } catch (error) {

            console.error('[AYANAS Print]', error);

            const message = error instanceof Error
                ? error.message
                : '不明なエラーが発生しました。';

            alert(`設定画面の初期化に失敗しました。\n\n${message}`);

        }

    };

    document.addEventListener('DOMContentLoaded', initialize);

})();
