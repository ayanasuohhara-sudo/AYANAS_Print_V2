'use strict';

/**
 * App91 flat-11: desktop が組み立てる HTML / href を検証（本番未デプロイ）。
 * DOM は innerHTML 文字列保持の最小モック。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const rootDir = path.join(__dirname, '..');

function createEnvironment(search) {
    const nodes = Object.create(null);

    const makeEl = (tag) => {
        const el = {
            tagName: String(tag).toUpperCase(),
            id: '',
            className: '',
            _html: '',
            style: {},
            children: [],
            setAttribute() {},
            appendChild(child) {
                this.children.push(child);
                if (child.id) nodes[child.id] = child;
                return child;
            },
            remove() {
                if (this.id) delete nodes[this.id];
            },
            querySelector() {
                return null;
            },
            querySelectorAll() {
                return [];
            },
        };
        Object.defineProperty(el, 'innerHTML', {
            get() {
                return this._html;
            },
            set(v) {
                this._html = String(v || '');
            },
        });
        return el;
    };

    const body = makeEl('body');
    const contents = makeEl('div');
    contents.className = 'contents-gaia';
    contents.firstChild = null;
    contents.insertBefore = function (node) {
        if (node.id) nodes[node.id] = node;
        this.children.unshift(node);
        this.firstChild = node;
        return node;
    };
    body.children.push(contents);
    body.firstChild = contents;
    body.insertBefore = contents.insertBefore.bind(contents);
    body.classList = { add() {}, remove() {} };

    const document = {
        body,
        head: {
            appendChild(node) {
                if (node.id) nodes[node.id] = node;
            },
        },
        getElementById(id) {
            return nodes[id] || null;
        },
        createElement(tag) {
            return makeEl(tag);
        },
        querySelector(sel) {
            if (sel === '.contents-gaia') return contents;
            return null;
        },
    };

    const sandbox = {
        console,
        window: null,
        document,
        URLSearchParams,
        location: {
            origin: 'https://example.cybozu.com',
            search: search || '',
        },
        kintone: {
            app: { getId: () => 91 },
            events: {
                _h: {},
                on(name, fn) {
                    this._h[name] = this._h[name] || [];
                    this._h[name].push(fn);
                },
                trigger(name, event) {
                    (this._h[name] || []).forEach((fn) => fn(event || {}));
                },
            },
        },
    };
    sandbox.window = sandbox;
    const ctx = vm.createContext(sandbox);
    const load = (rel) => {
        vm.runInContext(fs.readFileSync(path.join(rootDir, rel), 'utf8'), ctx, { filename: rel });
    };
    load('customize/hub_nav_config.js');
    load('customize/hub_nav.js');
    load('customize/business_menu_config.js');
    load('customize/business_menu_desktop.js');
    ctx.kintone.events.trigger('app.record.index.show', {});
    const root = document.getElementById('ayanas-business-menu-root');
    return { html: root ? root.innerHTML : '', version: ctx.CAYANAS_BUSINESS_MENU.VERSION };
}

function extractHrefs(html, className) {
    const re = new RegExp(
        '<a class="' + className + '"[^>]*href="([^"]+)"[^>]*>[\\s\\S]*?<span class="cayan-bm-(?:home__|btn__)label">([^<]*)</span>',
        'g'
    );
    const out = [];
    let m;
    while ((m = re.exec(html))) {
        out.push({ href: m[1], label: m[2] });
    }
    return out;
}

let failed = 0;
const assert = (name, cond) => {
    if (cond) {
        console.log('OK  ' + name);
        return;
    }
    failed += 1;
    console.error('FAIL ' + name);
};

const home = createEnvironment('');
assert('VERSION 3.0.0', home.version === '3.0.0');
assert('hub nav present', home.html.indexOf('cayan-hub-nav') >= 0);
assert('TOP aria-current', home.html.indexOf('aria-current="page"') >= 0);

const tiles = extractHrefs(home.html, 'cayan-bm-home__tile');
assert('11 tiles', tiles.length === 11);

const expected = [
    ['受注登録', '/k/16/'],
    ['外注出庫', '/k/27/'],
    ['和裁士出庫', '/k/74/'],
    ['外注入庫', '/k/78/'],
    ['海外出庫', '/k/28/'],
    ['納品書', '/k/19/'],
    ['請求書', '/k/35/'],
    ['納期', 'cat=deadline'],
    ['店舗', '/k/87/'],
    ['工場', '/k/90/'],
    ['マスタ', 'cat=masters'],
];

expected.forEach(([labelPart, hrefPart], i) => {
    const tile = tiles[i];
    assert(
        '#' + (i + 1) + ' ' + labelPart,
        !!tile
            && tile.label.indexOf(labelPart) >= 0
            && tile.href.indexOf(hrefPart) >= 0
    );
});

assert('no /k/85/', home.html.indexOf('/k/85/') < 0);
assert('no /k/95/', home.html.indexOf('/k/95/') < 0);
assert('no /k/99/', home.html.indexOf('/k/99/') < 0);

const deadline = createEnvironment('?cat=deadline');
const dBtns = extractHrefs(deadline.html, 'cayan-bm-btn');
assert('deadline 3 buttons', dBtns.length === 3);
assert('deadline App89 first', dBtns[0] && dBtns[0].href.indexOf('/k/89/') >= 0);
assert('deadline App94', dBtns[1] && dBtns[1].href.indexOf('/k/94/') >= 0);
assert('deadline App98', dBtns[2] && dBtns[2].href.indexOf('/k/98/') >= 0);
assert('deadline back home', deadline.html.indexOf('業務メニューへ戻る') >= 0);
assert('deadline lead', deadline.html.indexOf('納期負荷カレンダー') >= 0);

const masters = createEnvironment('?cat=masters');
const mBtns = extractHrefs(masters.html, 'cayan-bm-btn');
assert('masters 8 buttons', mBtns.length === 8);
assert('masters first App8', mBtns[0] && mBtns[0].href.indexOf('/k/8/') >= 0);

const alias = createEnvironment('?cat=store');
assert('alias store → 11 home tiles', extractHrefs(alias.html, 'cayan-bm-home__tile').length === 11);

const oldSchedule = createEnvironment('?cat=schedule');
assert('alias schedule → deadline', extractHrefs(oldSchedule.html, 'cayan-bm-btn').length === 3
    && oldSchedule.html.indexOf('/k/89/') >= 0);

if (failed) {
    process.exit(1);
}
console.log('\nRender verification passed.');
console.log('Home links:');
tiles.forEach((t, i) => console.log('  ' + (i + 1) + '. ' + t.label + ' → ' + t.href));
