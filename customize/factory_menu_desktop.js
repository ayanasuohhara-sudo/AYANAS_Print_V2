(function () {
    'use strict';

    /**
     * AYANAS 工場ポータル App90 — 一覧画面メニュー。
     * 既存アプリのレコードは更新しない。同一タブで一覧へ遷移する。
     *
     * スタイルは JS 内で注入する（旧 CSS が歯車・ツールバーを隠しても上書きできる）。
     * CSS ファイルを差し替えられなくても、この JS の入れ直しだけで復旧できる。
     */

    const ROOT_ID = 'ayanas-factory-menu-root';
    const STYLE_ID = 'ayanas-factory-menu-style-v3';
    /** 旧 CSS（ayanas-factory-menu-active）とは別名にし、古い非表示指定を無効化する */
    const BODY_CLASS = 'ayanas-fm-v3';
    const LEGACY_BODY_CLASS = 'ayanas-factory-menu-active';

    if (typeof CAYANAS_FACTORY_MENU === 'undefined') {
        console.error('[factory_menu] factory_menu_config.js を先に読み込んでください。');
        return;
    }

    if (typeof kintone === 'undefined') {
        return;
    }

    const cfg = () => CAYANAS_FACTORY_MENU;

    const isPortalApp = () => {

        const appId = Number(cfg().FACTORY_MENU_APP_ID);

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

    const appUrl = (item) => {

        const appId = Number(item.appId);
        const rawPath = String(item.path ?? '').trim().replace(/^\/+|\/+$/g, '');
        const suffix = rawPath ? rawPath + '/' : '';

        return location.origin + '/k/' + appId + '/' + suffix;

    };

    const ICONS = {
        status: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v4H4zm0 5h10v4H4zm0 5h16v4H4z"/></svg>',
        calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2V3h-2v2H9V3zm12 6H5v10h14z"/></svg>',
        search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4a6 6 0 1 1 0 12A6 6 0 0 1 10 4zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm6.7 10.3 4 4-1.4 1.4-4-4z"/></svg>',
        order: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18H6zm2 2v14h8V5zm2 2h4v2h-4zm0 4h4v2h-4zm0 4h4v2h-4z"/></svg>',
        complete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 16.2 5.8 12.5l1.4-1.4 2.3 2.3 6.3-6.3 1.4 1.4z"/><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/></svg>',
        work: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v4H4V5h4zm-5 8h16v10H4zm4 2v6h2v-6zm6 0v6h2v-6z"/></svg>',
        inbound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10.2l3.6-3.6 1.4 1.4L12 17l-5-5 1.4-1.4 3.6 3.6V3zM5 19h14v2H5z"/></svg>',
        outsource: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7V3L7 8l5 5V9c3.3 0 6 2.7 6 6 0 .7-.1 1.3-.3 1.9l1.6 1.2A7.9 7.9 0 0 0 20 15c0-4.4-3.6-8-8-8z"/><path d="M4 12c0-1.1.2-2.1.6-3l-1.6-1.2A9.9 9.9 0 0 0 2 12c0 4.4 3.6 8 8 8v4l5-5-5-5v4c-3.3 0-6-2.7-6-6z"/></svg>',
        wasai: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 7v10l8 5 8-5V7zm0 2.3L18 8v8l-6 3.7L6 16V8z"/><path d="M8 10h8v2H8zm0 3h5v2H8z"/></svg>',
        move: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11h11.2l-3.6-3.6L12 6l6 6-6 6-1.4-1.4 3.6-3.6H3zm13 7h5v2h-5z"/></svg>',
        delivery: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v9H3zm13 3h3.5L22 12.5V15h-6zm-1 8.5a1.5 1.5 0 1 1-1.5-1.5 1.5 1.5 0 0 1 1.5 1.5zm8 0a1.5 1.5 0 1 1-1.5-1.5 1.5 1.5 0 0 1 1.5 1.5z"/></svg>',
        invoice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l3 3v17H6zm2 4v2h8V6zm0 4v2h8v-2zm0 4v2h5v-2z"/></svg>',
    };

    const iconHtml = (key) => ICONS[key] || ICONS.order;

    const itemHtml = (item, size) => (
        '<a class="cayan-fm-btn cayan-fm-btn--' + escapeHtml(size) + '"'
        + ' href="' + escapeHtml(appUrl(item)) + '"'
        + ' data-app-id="' + escapeHtml(item.appId) + '">'
        + '<span class="cayan-fm-btn__icon">' + iconHtml(item.icon) + '</span>'
        + '<span class="cayan-fm-btn__label">' + escapeHtml(item.label) + '</span>'
        + '</a>'
    );

    const sectionHtml = (section) => {

        const size = section.size || 'normal';
        const items = Array.isArray(section.items) ? section.items : [];

        return '<section class="cayan-fm-section" data-section="' + escapeHtml(section.id) + '">'
            + '<h2 class="cayan-fm-section__title">' + escapeHtml(section.label) + '</h2>'
            + '<div class="cayan-fm-grid cayan-fm-grid--' + escapeHtml(size) + '">'
            + items.map((item) => itemHtml(item, size)).join('')
            + '</div>'
            + '</section>';

    };

    const shellHtml = () => {

        const sections = Array.isArray(cfg().SECTIONS) ? cfg().SECTIONS : [];

        return '<header class="cayan-fm-header">'
            + '<h1 class="cayan-fm-title">' + escapeHtml(cfg().TITLE) + '</h1>'
            + '<p class="cayan-fm-lead">' + escapeHtml(cfg().LEAD) + '</p>'
            + '</header>'
            + sections.map(sectionHtml).join('');

    };

    const injectStyles = () => {

        ['ayanas-factory-menu-style-v2', STYLE_ID].forEach((id) => {
            const existing = document.getElementById(id);

            if (existing) {
                existing.remove();
            }
        });

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            /* ツールバー／アプリ設定には一切触らない（display 上書きでアイコンが崩れる） */
            /* 旧 body クラスは JS で外す。ここでは一覧だけ隠す */
            'body.' + BODY_CLASS + ' .recordlist-gaia,',
            'body.' + BODY_CLASS + ' .recordlist-header-gaia,',
            'body.' + BODY_CLASS + ' .gaia-argoui-app-index-pager {',
            '  display: none !important;',
            '}',
            '.cayan-fm-root {',
            '  box-sizing: border-box;',
            '  max-width: 1120px;',
            '  margin: 0 auto;',
            '  padding: 20px 20px 40px;',
            "  font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic', Meiryo, sans-serif;",
            '  font-size: 17px;',
            '  line-height: 1.5;',
            '  color: #1a1a1a;',
            '  background: #ffffff;',
            '}',
            '.cayan-fm-root * { box-sizing: border-box; }',
            '.cayan-fm-header { margin: 0 0 28px; padding: 8px 0 20px; border-bottom: 2px solid #e8e8e8; }',
            '.cayan-fm-title { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 0.04em; color: #111; }',
            '.cayan-fm-lead { margin: 8px 0 0; font-size: 16px; color: #555; }',
            '.cayan-fm-section { margin: 0 0 28px; }',
            '.cayan-fm-section__title { margin: 0 0 12px; font-size: 18px; font-weight: 700; color: #222; }',
            '.cayan-fm-grid { display: grid; gap: 14px; }',
            '.cayan-fm-grid--large { grid-template-columns: repeat(3, minmax(0, 1fr)); }',
            '.cayan-fm-grid--normal { grid-template-columns: repeat(3, minmax(0, 1fr)); }',
            '.cayan-fm-grid--wide { grid-template-columns: repeat(2, minmax(0, 1fr)); }',
            '.cayan-fm-btn { display: flex; align-items: center; gap: 14px; min-height: 72px;',
            '  padding: 16px 18px; border: 1px solid #d0d0d0; border-radius: 10px;',
            '  background: #fafafa; color: #111; text-decoration: none; }',
            '.cayan-fm-btn--large { min-height: 96px; padding: 20px 22px; background: #f5f7fa; border-color: #c5ced9; }',
            '.cayan-fm-btn--wide { min-height: 88px; padding: 18px 20px; }',
            '.cayan-fm-btn:hover, .cayan-fm-btn:focus { background: #fff; border-color: #2f5f8a;',
            '  box-shadow: 0 0 0 2px rgba(47, 95, 138, 0.18); outline: none; }',
            '.cayan-fm-btn__icon { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;',
            '  width: 44px; height: 44px; border-radius: 8px; background: #fff; border: 1px solid #d8d8d8; }',
            '.cayan-fm-btn--large .cayan-fm-btn__icon { width: 52px; height: 52px; }',
            '.cayan-fm-btn__icon svg { width: 24px; height: 24px; fill: #2f5f8a; }',
            '.cayan-fm-btn__label { flex: 1 1 auto; font-size: 18px; font-weight: 700; line-height: 1.35; word-break: break-word; }',
            '.cayan-fm-btn--large .cayan-fm-btn__label { font-size: 20px; }',
            '@media (max-width: 900px) {',
            '  .cayan-fm-root { padding: 16px 14px 32px; font-size: 16px; }',
            '  .cayan-fm-title { font-size: 24px; }',
            '  .cayan-fm-grid--large, .cayan-fm-grid--normal, .cayan-fm-grid--wide { grid-template-columns: 1fr; }',
            '  .cayan-fm-btn, .cayan-fm-btn--large, .cayan-fm-btn--wide { min-height: 64px; }',
            '  .cayan-fm-btn__label, .cayan-fm-btn--large .cayan-fm-btn__label { font-size: 17px; }',
            '}',
            '@media (min-width: 901px) and (max-width: 1100px) {',
            '  .cayan-fm-grid--normal { grid-template-columns: repeat(2, minmax(0, 1fr)); }',
            '}',
        ].join('\n');

        document.head.appendChild(style);

    };

    const removeRoot = () => {

        document.body.classList.remove(BODY_CLASS);
        document.body.classList.remove('ayanas-fm-v2');
        document.body.classList.remove(LEGACY_BODY_CLASS);

        const root = document.getElementById(ROOT_ID);

        if (root) {
            root.remove();
        }

    };

    const mount = () => {

        if (!isPortalApp()) {
            return;
        }

        injectStyles();
        document.body.classList.remove(LEGACY_BODY_CLASS);
        document.body.classList.remove('ayanas-fm-v2');
        document.body.classList.add(BODY_CLASS);

        if (document.getElementById(ROOT_ID)) {
            return;
        }

        const mountPoint = document.querySelector('.contents-gaia') || document.body;
        const root = document.createElement('div');

        root.id = ROOT_ID;
        root.className = 'cayan-fm-root';
        root.innerHTML = shellHtml();
        mountPoint.insertBefore(root, mountPoint.firstChild);

    };

    kintone.events.on('app.record.index.show', (event) => {

        if (!Number(cfg().FACTORY_MENU_APP_ID)) {
            console.warn('[factory_menu]', cfg().MESSAGES.noAppId);
            return event;
        }

        if (!isPortalApp()) {
            return event;
        }

        mount();

        return event;

    });

    kintone.events.on('app.record.index.hide', (event) => {

        if (!isPortalApp()) {
            return event;
        }

        removeRoot();

        return event;

    });

}());
