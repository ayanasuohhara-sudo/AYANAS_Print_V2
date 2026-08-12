(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * templates/template_interface.js
     *
     * 帳票テンプレート共通インターフェース。
     * 全テンプレートは render(data, config, layout) を実装し、HTML 文字列のみ返す。
     */

    const TemplateInterface = {};

    /**
     * render の戻り値が HTML 文字列か検証する
     * @param {*} html - 戻り値
     * @param {string} templateName - テンプレート名
     * @returns {string} HTML 文字列
     * @throws {Error} 文字列でない場合
     */
    TemplateInterface.assertHtmlString = (html, templateName) => {

        if (typeof html !== 'string') {
            throw new Error(`${templateName}.render: 戻り値は HTML 文字列である必要があります。`);
        }

        return html;

    };

    /**
     * 標準インターフェースを持つテンプレートモジュールを生成する
     * @param {string} templateName - テンプレート名
     * @param {Function} renderBody - HTML 生成関数
     * @returns {{ render: Function }} テンプレートモジュール
     */
    TemplateInterface.create = (templateName, renderBody) => {

        const template = {};

        template.render = (data, config = {}, layout = {}) => {

            try {

                const html = renderBody(data, config, layout);

                return TemplateInterface.assertHtmlString(html, templateName);

            } catch (error) {

                if (error instanceof Error && error.message.includes('戻り値は HTML 文字列')) {
                    throw error;
                }

                const message = error instanceof Error ? error.message : '不明なエラー';

                throw new Error(`${templateName}.render: HTML 生成に失敗しました。（${message}）`);

            }

        };

        return template;

    };

    window.TemplateInterface = TemplateInterface;

})();
