(function () {
    'use strict';

    /**
     * AYANASU — アプリリンクバナー（各アプリの JavaScript に共通登録）
     * 先に app_nav_banner_config.js / app_nav_banner.css を登録してください。
     */

    const ROOT_ID = 'ayanas-app-nav-banner';

    const cfg = () => {

        if (typeof CAYANAS_APP_NAV === 'undefined') {
            throw new Error('CAYANAS_APP_NAV が未読込です。app_nav_banner_config.js を先に登録してください。');
        }

        return CAYANAS_APP_NAV;

    };

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const buildAppUrl = (appId) => `${location.origin}/k/${appId}/`;

    const sanitizeTone = (tone) => {

        const key = String(tone ?? 'slate').toLowerCase().replace(/[^a-z0-9-]/g, '');

        return key || 'slate';

    };

    const getCurrentAppId = () => {

        if (typeof kintone !== 'undefined' && typeof kintone.app?.getId === 'function') {
            return kintone.app.getId();
        }

        return 0;

    };

    const renderHtml = () => {

        const config = cfg();
        const currentAppId = getCurrentAppId();
        const groupsHtml = (config.groups || []).map((group) => {

            const linksHtml = (group.links || []).map((link) => {

                const appId = Number(link.appId);

                if (!appId) {
                    return '';
                }

                const isCurrent = config.highlightCurrent !== false && appId === currentAppId;
                const tone = sanitizeTone(link.tone);
                const className = [
                    'ayanas-app-nav__link',
                    `ayanas-app-nav__link--${tone}`,
                    isCurrent ? 'is-current' : '',
                ].filter(Boolean).join(' ');

                return `<a class="${className}" href="${escapeHtml(buildAppUrl(appId))}">${escapeHtml(link.label || appId)}</a>`;

            }).join('');

            if (!linksHtml) {
                return '';
            }

            return `
<div class="ayanas-app-nav__group">
  <span class="ayanas-app-nav__group-label">${escapeHtml(group.label || '')}</span>
  <div class="ayanas-app-nav__links">${linksHtml}</div>
</div>`;

        }).join('');

        const portal = config.portalLink;

        const portalHtml = portal
            ? `<a class="ayanas-app-nav__portal" href="${escapeHtml(`${location.origin}/k/${portal.hash || '#/portal'}`)}">${escapeHtml(portal.label || 'TOPメニューへ戻る')}</a>`
            : '';

        return `
<nav class="ayanas-app-nav" aria-label="アプリリンク">
  <div class="ayanas-app-nav__head">
    <p class="ayanas-app-nav__title">${escapeHtml(config.title || 'AYANASU')}</p>
    ${portalHtml}
  </div>
  <div class="ayanas-app-nav__groups">${groupsHtml}</div>
</nav>`;

    };

    const isRecordSurfaceEvent = (eventType) => /^(mobile\.)?app\.record\.(detail|edit)\.show$/.test(String(eventType || ''));

    const getMountElement = (eventType) => {

        /**
         * 詳細・編集では getHeaderSpaceElement がレコードツールバーに隠れやすいため、
         * コンテンツ領域先頭へ出す。
         */
        if (isRecordSurfaceEvent(eventType)) {
            const contents = document.querySelector('.contents-gaia');

            if (contents) {
                return contents;
            }
        }

        if (typeof kintone !== 'undefined' && typeof kintone.app?.getHeaderSpaceElement === 'function') {
            const header = kintone.app.getHeaderSpaceElement();

            if (header) {
                return header;
            }
        }

        return document.querySelector('.contents-gaia') || document.body;

    };

    const removeBanner = () => {

        const node = document.getElementById(ROOT_ID);

        if (node) {
            node.remove();
        }

    };

    const renderBanner = (eventType) => {

        removeBanner();

        const mount = getMountElement(eventType);

        if (!mount) {
            return;
        }

        const wrapper = document.createElement('div');
        const onRecordSurface = isRecordSurfaceEvent(eventType);

        wrapper.id = ROOT_ID;
        wrapper.className = onRecordSurface ? 'is-record-surface' : 'is-list-surface';
        wrapper.innerHTML = renderHtml();

        if (mount.firstChild) {
            mount.insertBefore(wrapper, mount.firstChild);
        } else {
            mount.appendChild(wrapper);
        }

    };

    const onShow = (event) => {

        const eventType = event?.type || '';

        const run = () => {

            try {
                renderBanner(eventType);
            } catch (error) {
                console.error('[ayanas-app-nav]', error);
            }

        };

        run();

        if (isRecordSurfaceEvent(eventType)) {
            setTimeout(run, 0);
            setTimeout(run, 200);
        }

        return event;

    };

    const onHide = (event) => {

        removeBanner();

        return event;

    };

    const eventsShow = [
        'app.record.index.show',
        'app.record.detail.show',
        'app.record.edit.show',
        'mobile.app.record.index.show',
        'mobile.app.record.detail.show',
        'mobile.app.record.edit.show',
    ];

    const eventsHide = [
        'app.record.index.hide',
        'app.record.detail.hide',
        'app.record.edit.hide',
        'mobile.app.record.index.hide',
        'mobile.app.record.detail.hide',
        'mobile.app.record.edit.hide',
    ];

    kintone.events.on(eventsShow, onShow);
    kintone.events.on(eventsHide, onHide);

}());
