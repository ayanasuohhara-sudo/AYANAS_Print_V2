(function () {
    'use strict';

    /**
     * 氏名ふりがな正規化（検索・予測共通）。
     * ひらがな寄せ・カタカナ同一視・全半角・空白除去。
     */

    const KANA_NORMALIZE_VERSION = '1.0.0';

    const toHiragana = (text) => String(text ?? '').replace(/[\u30A1-\u30F6]/g, (ch) => (
        String.fromCharCode(ch.charCodeAt(0) - 0x60)
    ));

    const toHalfWidthAscii = (text) => String(text ?? '').replace(/[\uFF01-\uFF5E]/g, (ch) => (
        String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
    )).replace(/\u3000/g, ' ');

    /**
     * 比較・部分一致用キー。
     * - 全角英数→半角
     * - カタカナ→ひらがな
     * - 空白・中点・長音の除去（検索ゆれ吸収）
     */
    const normalizeKanaKey = (value) => {
        let text = toHalfWidthAscii(value);
        text = toHiragana(text);
        text = text.normalize('NFKC');
        text = text.toLowerCase();
        text = text.replace(/[\s\u3000・･\.．\-ー＿_]/g, '');
        return text;
    };

    const hasKanaChars = (value) => /[\u3040-\u30FF]/.test(String(value ?? ''));

    const hasKanjiChars = (value) => /[\u4E00-\u9FFF]/.test(String(value ?? ''));

    const matchesKana = (stored, query, mode) => {
        const hay = normalizeKanaKey(stored);
        const needle = normalizeKanaKey(query);

        if (!needle) {
            return true;
        }

        if (!hay) {
            return false;
        }

        if (mode === 'prefix') {
            return hay.startsWith(needle);
        }

        return hay.indexOf(needle) !== -1;
    };

    window.CAYANAS_KanaNormalize = {
        VERSION: KANA_NORMALIZE_VERSION,
        toHiragana,
        toHalfWidthAscii,
        normalizeKanaKey,
        hasKanaChars,
        hasKanjiChars,
        matchesKana,
    };

    window.CAYANAS_KANA_NORMALIZE_VERSION = KANA_NORMALIZE_VERSION;
}());
