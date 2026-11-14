(function () {
  'use strict';

  /**
   * AYANASU 共通ハブナビ — 描画部品
   * hub_nav_config.js のあとに読み込む。
   * 使い方: CAYANAS_HubNav.renderHtml({ activeAppId }) または mount(el, opts)
   */

  if (typeof CAYANAS_HUB_NAV === 'undefined') {
    console.error('[hub_nav] hub_nav_config.js を先に読み込んでください。');
    return;
  }

  const cfg = () => CAYANAS_HUB_NAV;

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const resolveActiveId = (options) => {
    const opts = options || {};
    if (opts.activeId) {
      return String(opts.activeId);
    }
    const appId = Number(opts.activeAppId);
    const map = cfg().ACTIVE_BY_APP || {};
    if (appId && map[appId]) {
      return map[appId];
    }
    return '';
  };

  const appHref = (appId) => {
    const origin = (typeof location !== 'undefined' && location.origin)
      ? location.origin
      : '';
    return origin + '/k/' + Number(appId) + '/';
  };

  /**
   * @param {{ activeAppId?: number, activeId?: string, title?: string }} options
   * @returns {string}
   */
  const renderHtml = (options) => {
    const opts = options || {};
    const activeId = resolveActiveId(opts);
    const title = opts.title != null ? opts.title : cfg().TITLE;
    const links = Array.isArray(cfg().LINKS) ? cfg().LINKS : [];

    const buttons = links.map((link) => {
      const isActive = link.id === activeId;
      const classes = [
        'cayan-hub-nav__btn',
        'is-' + String(link.tone || 'slate'),
        isActive ? 'is-active' : '',
      ].filter(Boolean).join(' ');

      if (isActive) {
        return '<span class="' + classes + '" aria-current="page">'
          + escapeHtml(link.label)
          + '</span>';
      }

      return '<a class="' + classes + '" href="' + escapeHtml(appHref(link.appId)) + '">'
        + escapeHtml(link.label)
        + '</a>';
    }).join('');

    return '<nav class="' + escapeHtml(cfg().ROOT_CLASS) + '"'
      + ' aria-label="' + escapeHtml(cfg().ARIA_LABEL) + '"'
      + ' data-hub-nav-version="' + escapeHtml(cfg().VERSION) + '">'
      + (title
        ? '<span class="cayan-hub-nav__brand">' + escapeHtml(title) + '</span>'
        : '')
      + '<div class="cayan-hub-nav__links">' + buttons + '</div>'
      + '</nav>';
  };

  const mount = (element, options) => {
    if (!element) {
      return null;
    }
    element.innerHTML = renderHtml(options);
    return element;
  };

  window.CAYANAS_HubNav = {
    renderHtml: renderHtml,
    mount: mount,
    resolveActiveId: resolveActiveId,
  };

}());
