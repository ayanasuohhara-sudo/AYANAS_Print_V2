(function () {
    'use strict';

    /**
     * App16 お客様名ふりがな — 正規化・候補・フィールド有無判定。
     */

    const cfg = () => {

        if (typeof CAYANAS_ORDER_CLIENT_KANA === 'undefined') {
            throw new Error('CAYANAS_ORDER_CLIENT_KANA が未読込です。');
        }

        return CAYANAS_ORDER_CLIENT_KANA;

    };

    const kana = () => (typeof CAYANAS_KanaNormalize !== 'undefined' ? CAYANAS_KanaNormalize : null);

    const normalizeForSave = (value) => {

        const kn = kana();
        const raw = String(value ?? '').trim();

        if (!raw) {
            return '';
        }

        if (!kn) {
            return raw;
        }

        // 保存はひらがな＋空白除去（人が見やすい最小正規化）
        return kn.toHiragana(kn.toHalfWidthAscii(raw)).replace(/[\s\u3000]+/g, '');

    };

    const statusOptions = () => {

        const s = cfg().STATUS;

        return [s.unconfirmed, s.confirmed, s.unknown];

    };

    /**
     * カタカナ入力などをひらがな候補として返す（漢字からの自動推測はしない）。
     */
    const buildReadingHints = (clientName, typedKana) => {

        const kn = kana();
        const hints = [];
        const normalizedTyped = normalizeForSave(typedKana);

        if (normalizedTyped) {
            hints.push({
                kana: normalizedTyped,
                label: normalizedTyped,
                source: 'typed',
                unconfirmed: true,
            });
        }

        // 漢字からの機械推測は行わない（誤読確定を防ぐ）
        if (clientName && kn && kn.hasKanaChars(clientName)) {
            const fromName = normalizeForSave(clientName);

            if (fromName && fromName !== normalizedTyped) {
                hints.push({
                    kana: fromName,
                    label: fromName + '（氏名欄のかな）',
                    source: 'client_name',
                    unconfirmed: true,
                });
            }
        }

        return hints;

    };

    const fieldExistsInRecord = (record, code) => Boolean(record && Object.prototype.hasOwnProperty.call(record, code));

    const readField = (record, code) => {

        if (!fieldExistsInRecord(record, code)) {
            return '';
        }

        const value = record[code] && record[code].value;

        if (value === null || value === undefined) {
            return '';
        }

        return String(value);

    };

    const applyToRecord = (record, kanaValue, statusValue) => {

        const F = cfg().FIELDS;

        if (!fieldExistsInRecord(record, F.clientNameKana)) {
            return { ok: false, reason: 'missing_field', record };
        }

        const next = record;
        const normalized = normalizeForSave(kanaValue);

        next[F.clientNameKana].value = normalized;

        if (fieldExistsInRecord(record, F.clientNameKanaStatus)) {
            next[F.clientNameKanaStatus].value = statusValue || cfg().STATUS.unconfirmed;
        }

        return { ok: true, record: next, normalized };

    };

    window.CAYANAS_OrderClientKanaEngine = {
        normalizeForSave,
        statusOptions,
        buildReadingHints,
        fieldExistsInRecord,
        readField,
        applyToRecord,
    };
}());
