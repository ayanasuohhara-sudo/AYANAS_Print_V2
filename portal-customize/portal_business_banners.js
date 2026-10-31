(function () {
    'use strict';

    /**
     * AYANAS 標準ポータル — 8分類バナー表示。
     * portal.show + getContentSpaceElement() のみ使用。
     * 既存ウィジェット・お知らせ・portal-apps-readable の左列操作には触れない。
     * エラー時も既存ポータル表示を妨げない。
     */

    if (typeof kintone === 'undefined') {
        return;
    }

    if (typeof CAYANAS_PORTAL_BUSINESS_BANNERS === 'undefined') {
        console.error('[portal_business_banners] portal_business_banners_config.js を先に読み込んでください。');
        return;
    }

    const cfg = () => CAYANAS_PORTAL_BUSINESS_BANNERS;

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const isPortalHash = () => {
        const hash = String(location.hash || '');
        return hash === '#/portal' || hash.startsWith('#/portal/');
    };

    const categoryHref = (category) => {

        if (!category || category.mode === 'soon') {
            return '';
        }

        if (category.mode === 'direct') {
            const appId = Number(category.appId);

            if (!appId) {
                return '';
            }

            return location.origin + '/k/' + appId + '/';
        }

        const menuAppId = Number(cfg().BUSINESS_MENU_APP_ID);
        const key = String(cfg().QUERY_KEY || 'cat');
        const cat = String(category.cat || category.id || '');

        if (!menuAppId || !cat) {
            return '';
        }

        return location.origin + '/k/' + menuAppId + '/?' + key + '=' + encodeURIComponent(cat);

    };

    const itemHtml = (category) => {

        const no = escapeHtml(category.no || '');
        const label = escapeHtml(category.label || '');

        if (category.mode === 'soon') {
            return ''
                + '<div class="ayanas-pbb-item ayanas-pbb-item--soon" aria-disabled="true">'
                + '<span class="ayanas-pbb-item__no">' + no + '</span>'
                + '<span class="ayanas-pbb-item__label">' + label + '</span>'
                + '<span class="ayanas-pbb-item__badge">'
                + escapeHtml(category.soonLabel || '準備中')
                + '</span>'
                + '</div>';
        }

        const href = categoryHref(category);

        if (!href) {
            return '';
        }

        return ''
            + '<a class="ayanas-pbb-item" href="' + escapeHtml(href) + '">'
            + '<span class="ayanas-pbb-item__no">' + no + '</span>'
            + '<span class="ayanas-pbb-item__label">' + label + '</span>'
            + '</a>';

    };

    const shellHtml = () => {

        const categories = Array.isArray(cfg().CATEGORIES) ? cfg().CATEGORIES : [];

        return ''
            + '<div class="ayanas-pbb-inner">'
            + '<h2 class="ayanas-pbb-title">' + escapeHtml(cfg().TITLE || '') + '</h2>'
            + '<p class="ayanas-pbb-lead">' + escapeHtml(cfg().LEAD || '') + '</p>'
            + '<div class="ayanas-pbb-grid" role="navigation" aria-label="業務分類">'
            + categories.map(itemHtml).join('')
            + '</div>'
            + '</div>';

    };

    const injectStyles = () => {

        const styleId = String(cfg().STYLE_ID || 'ayanas-portal-business-banners-style');

        if (document.getElementById(styleId)) {
            return;
        }

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = [
            '#' + cfg().ROOT_ID + ' {',
            '  box-sizing: border-box;',
            '  width: 100%;',
            '  max-width: 100%;',
            '  margin: 0 0 16px;',
            '  padding: 12px 16px 16px;',
            "  font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', Meiryo, sans-serif;",
            '  color: #1a1a1a;',
            '  overflow-x: hidden;',
            '}',
            '#' + cfg().ROOT_ID + ' *, #' + cfg().ROOT_ID + ' *::before, #' + cfg().ROOT_ID + ' *::after { box-sizing: border-box; }',
            '#' + cfg().ROOT_ID + ' .ayanas-pbb-title {',
            '  margin: 0 0 4px;',
            '  font-size: 22px;',
            '  font-weight: 700;',
            '  letter-spacing: 0.04em;',
            '}',
            '#' + cfg().ROOT_ID + ' .ayanas-pbb-lead {',
            '  margin: 0 0 14px;',
            '  font-size: 15px;',
            '  color: #555;',
            '}',
            '#' + cfg().ROOT_ID + ' .ayanas-pbb-grid {',
            '  display: grid;',
            '  grid-template-columns: repeat(4, minmax(0, 1fr));',
            '  gap: 12px;',
            '  width: 100%;',
            '}',
            '#' + cfg().ROOT_ID + ' .ayanas-pbb-item {',
            '  display: flex;',
            '  flex-direction: column;',
            '  justify-content: center;',
            '  gap: 6px;',
            '  min-height: 92px;',
            '  padding: 16px 14px;',
            '  border: 1px solid #c5ced9;',
            '  border-radius: 10px;',
            '  background: #f5f7fa;',
            '  color: #111;',
            '  text-decoration: none;',
            '  font-weight: 700;',
            '}',
            '#' + cfg().ROOT_ID + ' a.ayanas-pbb-item:hover,',
            '#' + cfg().ROOT_ID + ' a.ayanas-pbb-item:focus {',
            '  background: #ffffff;',
            '  border-color: #2f5f8a;',
            '  box-shadow: 0 0 0 2px rgba(47, 95, 138, 0.18);',
            '  outline: none;',
            '}',
            '#' + cfg().ROOT_ID + ' .ayanas-pbb-item--soon {',
            '  opacity: 0.6;',
            '  cursor: not-allowed;',
            '  background: #f0f0f0;',
            '  border-color: #d0d0d0;',
            '  pointer-events: none;',
            '}',
            '#' + cfg().ROOT_ID + ' .ayanas-pbb-item__no {',
            '  font-size: 13px;',
            '  font-weight: 700;',
            '  color: #2f5f8a;',
            '  letter-spacing: 0.06em;',
            '}',
            '#' + cfg().ROOT_ID + ' .ayanas-pbb-item__label {',
            '  font-size: 18px !important;',
            '  font-weight: 700 !important;',
            '  line-height: 1.35;',
            '  word-break: break-word;',
            '}',
            '#' + cfg().ROOT_ID + ' .ayanas-pbb-item__badge {',
            '  display: inline-block;',
            '  width: fit-content;',
            '  margin-top: 2px;',
            '  padding: 2px 8px;',
            '  border-radius: 4px;',
            '  background: #e4e4e4;',
            '  color: #555;',
            '  font-size: 12px;',
            '  font-weight: 700;',
            '}',
            '@media (max-width: 900px) {',
            '  #' + cfg().ROOT_ID + ' { padding: 10px 10px 14px; }',
            '  #' + cfg().ROOT_ID + ' .ayanas-pbb-grid {',
            '    grid-template-columns: repeat(2, minmax(0, 1fr));',
            '    gap: 12px;',
            '  }',
            '  #' + cfg().ROOT_ID + ' .ayanas-pbb-item { min-height: 88px; }',
            '  #' + cfg().ROOT_ID + ' .ayanas-pbb-item__label { font-size: 18px !important; }',
            '}',
        ].join('\n');

        document.head.appendChild(style);

    };

    const mount = () => {

        try {
            if (!isPortalHash()) {
                return;
            }

            if (typeof kintone.portal === 'undefined'
                || typeof kintone.portal.getContentSpaceElement !== 'function') {
                return;
            }

            const space = kintone.portal.getContentSpaceElement();

            if (!space) {
                /* 2枚目以降のポータル・ゲスト等では null。何もしない */
                return;
            }

            const rootId = String(cfg().ROOT_ID || 'ayanas-portal-business-banners');

            /* 二重表示防止 */
            if (document.getElementById(rootId)) {
                return;
            }

            injectStyles();

            const root = document.createElement('div');
            root.id = rootId;
            root.className = 'ayanas-pbb-root';
            root.innerHTML = shellHtml();
            space.appendChild(root);
        } catch (err) {
            console.error('[portal_business_banners] バナー表示に失敗しました（既存ポータルは維持）', err);
        }

    };

    kintone.events.on('portal.show', () => {
        mount();
    });

}());
