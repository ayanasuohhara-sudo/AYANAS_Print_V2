/**
 * kintone トップポータル（PC）
 * 1) 標準の「アプリ」ウィジェットを左列の下（通知の下）へ移動
 * 2) 任意: 左列に大きな文字のスクロール付きアプリ一覧を追加（USE_CUSTOM_LIST = true）
 *
 * 適用: kintoneシステム管理 → JavaScript / CSSでカスタマイズ → kintone全体（PC用JS）
 * 先に portal-apps-readable.css を同じく PC 用 CSS に登録してください。
 */
(function () {
    'use strict';

    /** true にすると API で取得した一覧を左列先頭付近に追加（標準アプリウィジェットは非表示） */
    const USE_CUSTOM_LIST = false;

    const CUSTOM_LIST_ID = 'ayanas-portal-apps-list-root';

    const isPortalPage = () => {
        const hash = location.hash || '';
        return hash === '#/portal' || hash.startsWith('#/portal/');
    };

    const getLeftColumn = () => document.querySelector('.ocean-portal-body-left');

    const getAppWidget = () => {
        const appEl = document.querySelector('.ocean-portal-app');
        if (!appEl) {
            return null;
        }
        return appEl.closest('.ocean-portal-widget') || appEl;
    };

    const moveAppWidgetToLeft = () => {
        const left = getLeftColumn();
        const widget = getAppWidget();
        if (!left || !widget) {
            return;
        }
        if (widget.parentElement === left) {
            return;
        }
        left.appendChild(widget);
    };

    const hideDefaultAppWidget = () => {
        const widget = getAppWidget();
        if (widget && widget instanceof HTMLElement) {
            widget.style.display = 'none';
        }
    };

    const buildAppUrl = (appId) => `${location.origin}/k/${appId}/`;

    const fetchAllApps = () => {
        const apps = [];
        const load = (offset) => kintone.api(kintone.api.url('/k/v1/apps', true), 'GET', { offset })
            .then((resp) => {
                apps.push(...resp.apps);
                if (resp.apps.length === 100) {
                    return load(offset + 100);
                }
                return apps;
            });
        return load(0);
    };

    const renderCustomAppList = (apps) => {
        const left = getLeftColumn();
        if (!left) {
            return;
        }

        let root = document.getElementById(CUSTOM_LIST_ID);
        if (!root) {
            root = document.createElement('div');
            root.id = CUSTOM_LIST_ID;
            root.className = 'ayanas-portal-apps';
            left.appendChild(root);
        }

        const sorted = apps.slice().sort((a, b) => a.name.localeCompare(b.name, 'ja'));

        const itemsHtml = sorted.map((app) => (
            `<li class="ayanas-portal-apps__item">`
            + `<a class="ayanas-portal-apps__link" href="${buildAppUrl(app.appId)}">${app.name}</a>`
            + `</li>`
        )).join('');

        root.innerHTML = `
<h2 class="ayanas-portal-apps__title">アプリ</h2>
<ul class="ayanas-portal-apps__list" aria-label="アプリ一覧">
${itemsHtml}
</ul>`;
    };

    const applyPortalLayout = () => {
        if (!isPortalPage()) {
            return;
        }

        if (USE_CUSTOM_LIST) {
            hideDefaultAppWidget();
            fetchAllApps()
                .then(renderCustomAppList)
                .catch((err) => {
                    console.error('[ayanas portal] アプリ一覧の取得に失敗しました', err);
                    moveAppWidgetToLeft();
                });
            return;
        }

        moveAppWidgetToLeft();
    };

    kintone.events.on('portal.show', () => {
        window.setTimeout(applyPortalLayout, 100);
    });
})();
