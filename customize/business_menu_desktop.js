(function () {
    'use strict';

    /**
     * AYANAS 業務メニュー — 一覧画面。
     * 既存アプリのレコードは更新しない。同一タブで業務アプリへ遷移する。
     * スタイルは JS 内でも注入する（CSS 差し替え遅延時の保険）。
     */

    const ROOT_ID = 'ayanas-business-menu-root';
    const STYLE_ID = 'ayanas-business-menu-style-v2';
    const BODY_CLASS = 'ayanas-bm-v1';
    const LEGACY_STYLE_IDS = ['ayanas-business-menu-style-v1'];

    if (typeof CAYANAS_BUSINESS_MENU === 'undefined') {
        console.error('[business_menu] business_menu_config.js を先に読み込んでください。');
        return;
    }

    if (typeof kintone === 'undefined') {
        return;
    }

    const cfg = () => CAYANAS_BUSINESS_MENU;

    const isMenuApp = () => {

        const appId = Number(cfg().BUSINESS_MENU_APP_ID);

        if (!appId) {
            return false;
        }

        return Number(kintone.app.getId()) === appId;

    };

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const categories = () => {

        const list = cfg().CATEGORIES;

        return Array.isArray(list) ? list : [];

    };

    const findCategory = (id) => categories().find((c) => c && c.id === id) || null;

    const resolveCategoryId = () => {

        const key = String(cfg().QUERY_KEY || 'cat');
        const params = new URLSearchParams(location.search || '');
        const raw = String(params.get(key) || '').trim();
        const fallback = String(cfg().DEFAULT_CATEGORY || 'order');

        if (!raw) {
            return fallback;
        }

        const found = findCategory(raw);

        if (!found || found.mode === 'direct' || found.mode === 'soon') {
            /* direct / soon / 未知はメニュー初期画面へ（エラーにしない） */
            return fallback;
        }

        return found.id;

    };

    const appUrl = (item) => {

        const appId = Number(item.appId);
        const rawPath = String(item.path ?? '').trim().replace(/^\/+|\/+$/g, '');
        const suffix = rawPath ? rawPath + '/' : '';

        return location.origin + '/k/' + appId + '/' + suffix;

    };

    const menuCategoryUrl = (categoryId) => {

        const appId = Number(cfg().BUSINESS_MENU_APP_ID);
        const key = String(cfg().QUERY_KEY || 'cat');

        return location.origin + '/k/' + appId + '/?' + key + '=' + encodeURIComponent(categoryId);

    };

    const topUrl = () => location.origin + '/k/' + String(cfg().TOP_HASH || '#/portal');

    const directUrl = (category) => {

        const appId = Number(category.directAppId);

        if (!appId) {
            return topUrl();
        }

        return location.origin + '/k/' + appId + '/';

    };

    const ICONS = {
        order: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6zm2 2v14h8V5zm2 2h4v2h-4zm0 4h4v2h-4zm0 4h4v2h-4z"/></svg>',
        list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v2H4zm0 6h16v2H4zm0 6h16v2H4z"/></svg>',
        search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4a6 6 0 1 1 0 12A6 6 0 0 1 10 4zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm6.7 10.3 4 4-1.4 1.4-4-4z"/></svg>',
        logistics: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v8H3zm13 2h3.5L22 12v3h-6zM8 17.5a1.5 1.5 0 1 1-1.5 1.5A1.5 1.5 0 0 1 8 17.5zm10 0a1.5 1.5 0 1 1-1.5 1.5A1.5 1.5 0 0 1 18 17.5z"/></svg>',
        outsource: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7V3L7 8l5 5V9c3.3 0 6 2.7 6 6 0 .7-.1 1.3-.3 1.9l1.6 1.2A7.9 7.9 0 0 0 20 15c0-4.4-3.6-8-8-8z"/><path d="M4 12c0-1.1.2-2.1.6-3l-1.6-1.2A9.9 9.9 0 0 0 2 12c0 4.4 3.6 8 8 8v4l5-5-5-5v4c-3.3 0-6-2.7-6-6z"/></svg>',
        overseas: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 2c1.7 0 3.3.5 4.6 1.4L12 10V4zm-2 0v7.2L5.4 5.4A8 8 0 0 1 10 4zm-6 8a7.9 7.9 0 0 1 .3-2.1L9.5 15H4.1A8 8 0 0 1 4 12zm2.1 4H10l-2.2 3.5A8 8 0 0 1 6.1 16zM12 20a7.9 7.9 0 0 1-2.6-.4L12 15.2 14.6 19.6A7.9 7.9 0 0 1 12 20zm4.1-1.5L14 16h3.9a8 8 0 0 1-1.8 2.5zM14.5 15l4.2-5.1A7.9 7.9 0 0 1 20 12a8 8 0 0 1-.1 1.5z"/></svg>',
        wasai: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 7v10l8 5 8-5V7zm0 2.3L18 8v8l-6 3.7L6 16V8z"/><path d="M8 10h8v2H8zm0 3h5v2H8z"/></svg>',
        inbound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10.2l3.6-3.6 1.4 1.4L12 17l-5-5 1.4-1.4 3.6 3.6V3zM5 19h14v2H5z"/></svg>',
        move: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11h11.2l-3.6-3.6L12 6l6 6-6 6-1.4-1.4 3.6-3.6H3zm13 7h5v2h-5z"/></svg>',
        billing: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v4H4zm0 6h16v10H4zm3 3h4v2H7zm6 0h4v2h-4zm-6 4h10v2H7z"/></svg>',
        delivery: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v9H3zm13 3h3.5L22 12.5V15h-6zm-1 8.5a1.5 1.5 0 1 1-1.5-1.5 1.5 1.5 0 0 1 1.5 1.5zm8 0a1.5 1.5 0 1 1-1.5-1.5 1.5 1.5 0 0 1 1.5 1.5z"/></svg>',
        invoice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l3 3v17H6zm2 4v2h8V6zm0 4v2h8v-2zm0 4v2h5v-2z"/></svg>',
        payment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v12H3zm2 2v2h14V8zm0 4v4h6v-4z"/></svg>',
        paymentList: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v3H4zm0 5h16v9H4zm3 2v2h4v-2zm0 4v2h7v-2z"/></svg>',
        ar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v4H4zm0 6h10v2H4zm0 4h16v2H4zm0 4h12v2H4z"/></svg>',
        work: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v4H4V5h4zm-5 8h16v10H4zm4 2v6h2v-6zm6 0v6h2v-6z"/></svg>',
        status: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v4H4zm0 5h10v4H4zm0 5h16v4H4z"/></svg>',
        store: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10 5.5 4h13L20 10v2H4zm0 4h2v6H4zm14 0h2v6h-2zm-8 0h4v6h-4z"/></svg>',
        complete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 16.2 5.8 12.5l1.4-1.4 2.3 2.3 6.3-6.3 1.4 1.4z"/><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/></svg>',
        calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2V3h-2v2H9V3zm12 6H5v10h14z"/></svg>',
        schedule: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5zm2 2v12h10V6zm2 2h6v2H9zm0 4h6v2H9z"/></svg>',
        analytics: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16v2H4zm2-2V9h3v8zm5 0V5h3v12zm5 0v-6h3v6z"/></svg>',
        dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h8v8H3zm10 0h8v5h-8zM3 13h5v8H3zm7 0h11v8H10z"/></svg>',
        wasaiPay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zm2 2v2h12V7zm0 4v6h5v-6zm7 0v6h5v-6z"/></svg>',
        masters: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z"/></svg>',
        customer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4 0-8 2-8 4v2h16v-2c0-2-4-4-8-4z"/></svg>',
        kimono: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 8 6v14h8V6zm0 3.5L14 8v10h-4V8z"/></svg>',
        product: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7 12 3l8 4v10l-8 4-8-4zm2 1.2v7.6l6 3 6-3V8.2l-6-3z"/></svg>',
        price: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 15h-2v-1.1A3.5 3.5 0 0 1 8 12.5h2a1.5 1.5 0 0 0 1.5 1.5H13a1.5 1.5 0 0 0 0-3h-2a3.5 3.5 0 0 1 0-7V4h2v1.1A3.5 3.5 0 0 1 16 8.5h-2a1.5 1.5 0 0 0-1.5-1.5H11a1.5 1.5 0 0 0 0 3h2a3.5 3.5 0 0 1 0 7z"/></svg>',
        process: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6v2H9zm-4 4h14v2H5zm2 4h10v2H7zm-2 4h14v2H5zm4 4h6v2H9z"/></svg>',
        vendor: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10 12 3l9 7v11h-6v-6H9v6H3z"/></svg>',
    };

    const iconHtml = (key) => ICONS[key] || ICONS.order;

    const itemHtml = (item) => (
        '<a class="cayan-bm-btn"'
        + ' href="' + escapeHtml(appUrl(item)) + '"'
        + ' data-app-id="' + escapeHtml(item.appId) + '">'
        + '<span class="cayan-bm-btn__icon">' + iconHtml(item.icon) + '</span>'
        + '<span class="cayan-bm-btn__label">' + escapeHtml(item.label) + '</span>'
        + '</a>'
    );

    const navItemHtml = (category, activeId) => {

        const isActive = category.id === activeId;
        const label = category.shortLabel || category.label;
        const baseClass = 'cayan-bm-nav__item'
            + (isActive ? ' is-active' : '')
            + (category.mode === 'soon' ? ' is-disabled' : '');

        if (category.mode === 'soon') {
            return '<span class="' + baseClass + '" aria-disabled="true" title="準備中">'
                + '<span class="cayan-bm-nav__icon">' + iconHtml(category.icon) + '</span>'
                + '<span class="cayan-bm-nav__label">' + escapeHtml(label) + '</span>'
                + '<span class="cayan-bm-nav__badge">準備中</span>'
                + '</span>';
        }

        const href = category.mode === 'direct'
            ? directUrl(category)
            : menuCategoryUrl(category.id);

        return '<a class="' + baseClass + '"'
            + ' href="' + escapeHtml(href) + '"'
            + (isActive ? ' aria-current="page"' : '')
            + '>'
            + '<span class="cayan-bm-nav__icon">' + iconHtml(category.icon) + '</span>'
            + '<span class="cayan-bm-nav__label">' + escapeHtml(label) + '</span>'
            + '</a>';

    };

    const bodyHtml = (category) => {

        if (!category || category.mode === 'soon') {
            return '<div class="cayan-bm-soon">'
                + '<p class="cayan-bm-soon__title">' + escapeHtml((category && category.label) || '準備中') + '</p>'
                + '<p class="cayan-bm-soon__text">' + escapeHtml(cfg().MESSAGES.soonBody) + '</p>'
                + '</div>';
        }

        if (category.mode === 'direct') {
            /* 通常はポータル／ナビから直接遷移。万一開けた場合の案内 */
            return '<div class="cayan-bm-soon">'
                + '<p class="cayan-bm-soon__title">' + escapeHtml(category.label) + '</p>'
                + '<p class="cayan-bm-soon__text">'
                + '<a class="cayan-bm-btn" href="' + escapeHtml(directUrl(category)) + '">'
                + '<span class="cayan-bm-btn__icon">' + iconHtml(category.icon) + '</span>'
                + '<span class="cayan-bm-btn__label">' + escapeHtml(category.label) + 'を開く</span>'
                + '</a></p>'
                + '</div>';
        }

        const items = Array.isArray(category.items) ? category.items : [];

        return '<div class="cayan-bm-grid">'
            + items.map(itemHtml).join('')
            + '</div>';

    };

    const shellHtml = (activeId) => {

        const category = findCategory(activeId) || findCategory(cfg().DEFAULT_CATEGORY);

        return ''
            + '<div class="cayan-bm-topbar">'
            + '<a class="cayan-bm-top-link" href="' + escapeHtml(topUrl()) + '">'
            + escapeHtml(cfg().TOP_LABEL || 'AYANAS TOPへ戻る')
            + '</a>'
            + '</div>'
            + '<header class="cayan-bm-header">'
            + '<h1 class="cayan-bm-title">' + escapeHtml(cfg().TITLE) + '</h1>'
            + '<p class="cayan-bm-lead">' + escapeHtml(cfg().LEAD) + '</p>'
            + '</header>'
            + '<nav class="cayan-bm-nav" aria-label="業務分類">'
            + categories().map((c) => navItemHtml(c, activeId)).join('')
            + '</nav>'
            + '<section class="cayan-bm-section" data-category="' + escapeHtml(category ? category.id : '') + '">'
            + '<h2 class="cayan-bm-section__title">' + escapeHtml(category ? category.label : '') + '</h2>'
            + bodyHtml(category)
            + '</section>';

    };

    const injectStyles = () => {

        /* 外部CSSより後に注入し、文字サイズを確実に効かせる（!important） */
        [STYLE_ID].concat(LEGACY_STYLE_IDS).forEach((id) => {
            const existing = document.getElementById(id);

            if (existing) {
                existing.remove();
            }
        });

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            'body.' + BODY_CLASS + ' .recordlist-gaia,',
            'body.' + BODY_CLASS + ' .recordlist-header-gaia,',
            'body.' + BODY_CLASS + ' .gaia-argoui-app-index-pager {',
            '  display: none !important;',
            '}',
            '.cayan-bm-root {',
            '  box-sizing: border-box;',
            '  max-width: 1120px;',
            '  width: 100%;',
            '  margin: 0 auto;',
            '  padding: 16px 20px 40px;',
            "  font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', Meiryo, sans-serif;",
            '  font-size: 18px !important;',
            '  line-height: 1.45;',
            '  color: #1a1a1a;',
            '  background: #ffffff;',
            '  overflow-x: hidden;',
            '}',
            '.cayan-bm-root * { box-sizing: border-box; }',
            '.cayan-bm-topbar { margin: 0 0 14px; }',
            '.cayan-bm-top-link {',
            '  display: inline-flex; align-items: center; justify-content: center;',
            '  min-height: 48px !important; padding: 10px 20px;',
            '  border: 1px solid #c5ced9; border-radius: 8px;',
            '  background: #f5f7fa; color: #1a3a5c;',
            '  font-size: 16px !important; font-weight: 700 !important;',
            '  text-decoration: none;',
            '}',
            '.cayan-bm-top-link:hover, .cayan-bm-top-link:focus {',
            '  background: #fff; border-color: #2f5f8a; outline: none;',
            '}',
            '.cayan-bm-header { margin: 0 0 16px; padding: 0 0 14px; border-bottom: 2px solid #e8e8e8; }',
            '.cayan-bm-title {',
            '  margin: 0; font-size: 24px !important; font-weight: 700 !important;',
            '  letter-spacing: 0.04em; color: #111;',
            '}',
            '.cayan-bm-lead { margin: 6px 0 0; font-size: 16px !important; color: #555; }',
            '.cayan-bm-nav {',
            '  display: grid;',
            '  grid-template-columns: repeat(4, minmax(0, 1fr));',
            '  gap: 12px;',
            '  margin: 0 0 24px;',
            '}',
            '.cayan-bm-nav__item {',
            '  display: flex; flex-direction: row; align-items: center; gap: 10px;',
            '  min-height: 65px !important; padding: 10px 14px;',
            '  border: 1px solid #d5d5d5; border-radius: 8px;',
            '  background: #fafafa; color: #222; text-decoration: none;',
            '  font-size: 18px !important; font-weight: 700 !important;',
            '}',
            '.cayan-bm-nav__item.is-active {',
            '  background: #dce8f4; border-color: #2f5f8a; border-width: 2px;',
            '  box-shadow: inset 4px 0 0 #2f5f8a; color: #12304f;',
            '}',
            '.cayan-bm-nav__item.is-disabled {',
            '  opacity: 0.55; cursor: not-allowed; background: #f3f3f3;',
            '}',
            '.cayan-bm-nav__icon {',
            '  flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;',
            '  width: 28px !important; height: 28px !important;',
            '}',
            '.cayan-bm-nav__icon svg { width: 28px !important; height: 28px !important; fill: #2f5f8a; }',
            '.cayan-bm-nav__label {',
            '  flex: 1 1 auto; font-size: 18px !important; font-weight: 700 !important;',
            '  line-height: 1.3; word-break: break-word;',
            '}',
            '.cayan-bm-nav__badge {',
            '  flex: 0 0 auto; font-size: 12px; font-weight: 700; color: #666;',
            '  background: #e8e8e8; border-radius: 4px; padding: 2px 6px;',
            '}',
            '.cayan-bm-section__title { margin: 0 0 16px; font-size: 20px !important; font-weight: 700 !important; color: #222; }',
            '.cayan-bm-grid {',
            '  display: grid;',
            '  grid-template-columns: repeat(2, minmax(0, 1fr));',
            '  gap: 16px;',
            '}',
            '.cayan-bm-btn {',
            '  display: flex; align-items: center; gap: 16px;',
            '  min-height: 80px !important; width: 100%; padding: 16px 20px;',
            '  border: 1px solid #c5ced9; border-radius: 10px;',
            '  background: #f5f7fa; color: #111; text-decoration: none; cursor: pointer;',
            '}',
            '.cayan-bm-btn:hover, .cayan-bm-btn:focus {',
            '  background: #fff; border-color: #2f5f8a;',
            '  box-shadow: 0 0 0 2px rgba(47, 95, 138, 0.18); outline: none;',
            '}',
            '.cayan-bm-btn__icon {',
            '  flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;',
            '  width: 56px !important; height: 56px !important; border-radius: 8px;',
            '  background: #fff; border: 1px solid #d8d8d8; pointer-events: none;',
            '}',
            '.cayan-bm-btn__icon svg { width: 32px !important; height: 32px !important; fill: #2f5f8a; }',
            '.cayan-bm-btn__label {',
            '  flex: 1 1 auto; font-size: 20px !important; font-weight: 700 !important;',
            '  line-height: 1.35; word-break: break-word; pointer-events: none;',
            '}',
            '.cayan-bm-soon {',
            '  padding: 28px 20px; border: 1px dashed #c5c5c5; border-radius: 10px;',
            '  background: #fafafa; text-align: center;',
            '}',
            '.cayan-bm-soon__title { margin: 0 0 8px; font-size: 20px !important; font-weight: 700 !important; }',
            '.cayan-bm-soon__text { margin: 0; color: #555; font-size: 16px !important; }',
            '@media (max-width: 900px) {',
            '  .cayan-bm-root { padding: 14px 12px 32px; font-size: 18px !important; }',
            '  .cayan-bm-title { font-size: 24px !important; }',
            '  .cayan-bm-top-link { min-height: 48px !important; font-size: 16px !important; }',
            '  .cayan-bm-nav { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }',
            '  .cayan-bm-nav__item { min-height: 65px !important; font-size: 18px !important; }',
            '  .cayan-bm-nav__label { font-size: 18px !important; }',
            '  .cayan-bm-grid { grid-template-columns: 1fr; gap: 14px; }',
            '  .cayan-bm-btn { min-height: 80px !important; }',
            '  .cayan-bm-btn__label { font-size: 20px !important; }',
            '}',
        ].join('\n');

        document.head.appendChild(style);

    };

    const removeRoot = () => {

        document.body.classList.remove(BODY_CLASS);

        const root = document.getElementById(ROOT_ID);

        if (root) {
            root.remove();
        }

    };

    const mount = () => {

        if (!isMenuApp()) {
            return;
        }

        injectStyles();
        document.body.classList.add(BODY_CLASS);

        const activeId = resolveCategoryId();
        let root = document.getElementById(ROOT_ID);

        if (!root) {
            const mountPoint = document.querySelector('.contents-gaia') || document.body;
            root = document.createElement('div');
            root.id = ROOT_ID;
            root.className = 'cayan-bm-root';
            mountPoint.insertBefore(root, mountPoint.firstChild);
        }

        root.innerHTML = shellHtml(activeId);

    };

    kintone.events.on('app.record.index.show', (event) => {

        if (!Number(cfg().BUSINESS_MENU_APP_ID)) {
            console.warn('[business_menu]', cfg().MESSAGES.noAppId);
            return event;
        }

        if (!isMenuApp()) {
            return event;
        }

        mount();

        return event;

    });

    kintone.events.on('app.record.index.hide', (event) => {

        if (!isMenuApp()) {
            return event;
        }

        removeRoot();

        return event;

    });

}());
