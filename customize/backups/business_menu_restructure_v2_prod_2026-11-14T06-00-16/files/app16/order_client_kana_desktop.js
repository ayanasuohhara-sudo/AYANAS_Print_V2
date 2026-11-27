(function () {
    'use strict';

    /**
     * App16 新規／編集 — お客様名ふりがな入力パネル。
     * client_name_kana 未設置時はパネルを出さず、既存登録を壊さない。
     */

    if (typeof kintone === 'undefined') {
        return;
    }

    if (typeof CAYANAS_ORDER_CLIENT_KANA === 'undefined' || !window.CAYANAS_OrderClientKanaEngine) {
        console.error('[order_client_kana] 依存 JS が未読込です。');
        return;
    }

    const cfg = () => CAYANAS_ORDER_CLIENT_KANA;
    const Engine = window.CAYANAS_OrderClientKanaEngine;

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const getMount = () => {

        for (const spaceId of cfg().SPACE_IDS) {
            try {
                const el = kintone.app.record.getSpaceElement(spaceId);

                if (el) {
                    return el;
                }
            } catch (_) {
                // ignore
            }
        }

        return kintone.app.record.getHeaderMenuSpaceElement
            ? kintone.app.record.getHeaderMenuSpaceElement()
            : null;

    };

    const removePanel = () => {

        const existing = document.getElementById(cfg().UI.panelId);

        if (existing) {
            existing.remove();
        }

    };

    const paintHints = (panel, hints) => {

        const box = panel.querySelector('#ock-hints');

        if (!box) {
            return;
        }

        if (!hints.length) {
            box.hidden = true;
            box.innerHTML = '';
            return;
        }

        box.hidden = false;
        box.innerHTML = hints.map((hint, index) => (
            '<button type="button" class="ock-hint" data-index="' + index + '">'
            + escapeHtml(hint.label)
            + (hint.unconfirmed ? ' <span class="ock-badge">未確認候補</span>' : '')
            + '</button>'
        )).join('');

        box._hints = hints;

    };

    const syncFromRecord = (panel, record) => {

        const F = cfg().FIELDS;
        const kanaInput = panel.querySelector('#ock-kana');
        const statusSelect = panel.querySelector('#ock-status');
        const note = panel.querySelector('#ock-note');

        if (!Engine.fieldExistsInRecord(record, F.clientNameKana)) {
            note.textContent = cfg().MESSAGES.fieldMissing;
            note.className = 'ock-note is-warn';
            kanaInput.disabled = true;
            statusSelect.disabled = true;
            return;
        }

        kanaInput.disabled = false;
        statusSelect.disabled = !Engine.fieldExistsInRecord(record, F.clientNameKanaStatus);
        kanaInput.value = Engine.readField(record, F.clientNameKana);
        statusSelect.value = Engine.readField(record, F.clientNameKanaStatus) || cfg().STATUS.unconfirmed;

        const customerCode = Engine.readField(record, F.customerCode);

        if (customerCode === cfg().STORE_CUSTOMER_CODE) {
            note.textContent = cfg().MESSAGES.a550Note;
            note.className = 'ock-note is-info';
        } else {
            note.textContent = cfg().MESSAGES.lead;
            note.className = 'ock-note';
        }

        const hints = Engine.buildReadingHints(
            Engine.readField(record, F.clientName),
            kanaInput.value
        );

        paintHints(panel, hints);

    };

    const writeIntoEventRecord = (record, panel) => {

        const kanaValue = panel.querySelector('#ock-kana').value;
        const statusValue = panel.querySelector('#ock-status').value;

        return Engine.applyToRecord(record, kanaValue, statusValue);

    };

    const shellHtml = () => {

        const options = Engine.statusOptions().map((value) => (
            '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + '</option>'
        )).join('');

        return ''
            + '<div class="ock-inner">'
            + '<h3 class="ock-title">' + escapeHtml(cfg().MESSAGES.title) + '</h3>'
            + '<p class="ock-note" id="ock-note"></p>'
            + '<div class="ock-row">'
            + '<label class="ock-field"><span>ふりがな</span>'
            + '<input id="ock-kana" type="text" autocomplete="off" placeholder="やまもときよこ"></label>'
            + '<label class="ock-field"><span>確認状態</span>'
            + '<select id="ock-status">' + options + '</select></label>'
            + '<button type="button" class="ock-btn" id="ock-normalize">ひらがなに整える</button>'
            + '</div>'
            + '<div class="ock-hints" id="ock-hints" hidden></div>'
            + '</div>';

    };

    const bind = (panel, event) => {

        if (panel.dataset.bound === '1') {
            return;
        }

        panel.dataset.bound = '1';

        panel.querySelector('#ock-normalize').addEventListener('click', () => {

            const input = panel.querySelector('#ock-kana');

            input.value = Engine.normalizeForSave(input.value);
            const rec = kintone.app.record.get().record;
            const hints = Engine.buildReadingHints(
                Engine.readField(rec, cfg().FIELDS.clientName),
                input.value
            );

            paintHints(panel, hints);

        });

        panel.querySelector('#ock-kana').addEventListener('input', () => {

            const rec = kintone.app.record.get().record;
            const hints = Engine.buildReadingHints(
                Engine.readField(rec, cfg().FIELDS.clientName),
                panel.querySelector('#ock-kana').value
            );

            paintHints(panel, hints);

        });

        panel.querySelector('#ock-hints').addEventListener('click', (ev) => {

            const button = ev.target.closest('.ock-hint');
            const box = panel.querySelector('#ock-hints');

            if (!button || !box._hints) {
                return;
            }

            const hint = box._hints[Number(button.getAttribute('data-index'))];

            if (!hint) {
                return;
            }

            panel.querySelector('#ock-kana').value = hint.kana;
            panel.querySelector('#ock-status').value = cfg().STATUS.unconfirmed;

        });

    };

    const mount = (event) => {

        if (kintone.app.getId() !== cfg().ORDER_APP_ID) {
            return event;
        }

        removePanel();

        const mountPoint = getMount();

        if (!mountPoint) {
            return event;
        }

        const panel = document.createElement('div');

        panel.id = cfg().UI.panelId;
        panel.className = 'ock-panel';
        panel.innerHTML = shellHtml();
        mountPoint.appendChild(panel);
        bind(panel, event);
        syncFromRecord(panel, event.record);

        return event;

    };

    const onSubmit = (event) => {

        if (kintone.app.getId() !== cfg().ORDER_APP_ID) {
            return event;
        }

        const panel = document.getElementById(cfg().UI.panelId);

        if (!panel) {
            return event;
        }

        const result = writeIntoEventRecord(event.record, panel);

        if (!result.ok && result.reason === 'missing_field') {
            // フィールド未設置でも受注保存は通す
            return event;
        }

        return event;

    };

    kintone.events.on([
        'app.record.create.show',
        'app.record.edit.show',
    ], mount);

    kintone.events.on([
        'app.record.create.submit',
        'app.record.edit.submit',
    ], onSubmit);

    kintone.events.on([
        'app.record.create.hide',
        'app.record.edit.hide',
    ], (event) => {
        removePanel();
        return event;
    });

}());
