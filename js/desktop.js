(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * desktop.js
     *
     * kintone レコード詳細画面に印刷ボタンを配置し、
     * Record.get() でデータ取得 → Preview.open() でプレビュー表示を行う。
     */

    /** 印刷ボタンの DOM id（二重生成防止用） */
    const BUTTON_ID = 'ayanas-print-button';

    /** 印刷ボタンの CSS クラス名 */
    const BUTTON_CLASS = 'ayanas-print-button';

    /**
     * Record モジュールの読み込みを確認する
     * @throws {Error} Record が未読込の場合
     */
    const assertRecordLoaded = () => {

        if (typeof Record === 'undefined' || typeof Record.get !== 'function') {
            throw new Error('Record モジュールが読み込まれていません。');
        }

    };

    /**
     * Preview モジュールの読み込みを確認する
     * @throws {Error} Preview が未読込の場合
     */
    const assertPreviewLoaded = () => {

        if (typeof Preview === 'undefined' || typeof Preview.open !== 'function') {
            throw new Error('Preview モジュールが読み込まれていません。');
        }

        if (typeof Preview.initialize !== 'function') {
            throw new Error('Preview.initialize が利用できません。');
        }

    };

    /**
     * desktop.js の script URL から pluginBaseUrl を取得する
     * @returns {string} pluginBaseUrl
     * @throws {Error} 取得に失敗した場合
     */
    const getPluginBaseUrl = () => {

        const script = document.currentScript;

        if (!(script instanceof HTMLScriptElement) || !script.src) {
            throw new Error('pluginBaseUrl を取得できません。');
        }

        return script.src;

    };

    assertPreviewLoaded();
    Preview.initialize(getPluginBaseUrl());

    /**
     * レコード詳細画面表示時に印刷ボタンを追加する
     */
    kintone.events.on('app.record.detail.show', (event) => {

        // 既にボタンが存在する場合は何もしない
        if (document.getElementById(BUTTON_ID)) {
            return event;
        }

        const space = kintone.app.record.getHeaderMenuSpaceElement();

        if (!space) {
            return event;
        }

        const button = document.createElement('button');

        button.id = BUTTON_ID;
        button.type = 'button';
        button.className = BUTTON_CLASS;
        button.textContent = '受注票印刷';

        button.addEventListener('click', () => {

            try {

                // Record モジュールの読み込み確認
                assertRecordLoaded();

                // レコードデータ取得
                const data = Record.get();

                // Preview モジュールの読み込み確認
                assertPreviewLoaded();

                // 印刷プレビュー表示
                Preview.open(data);

            } catch (error) {

                console.error('[AYANAS Print]', error);

                const message = error instanceof Error
                    ? error.message
                    : '不明なエラーが発生しました。';

                alert(`印刷エラー\n\n${message}`);

            }

        });

        space.appendChild(button);

        return event;

    });

})();