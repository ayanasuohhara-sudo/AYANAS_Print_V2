(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * format.js
     *
     * 帳票表示用のフォーマットユーティリティ。
     */

    const Format = {};

    /**
     * 値が空かどうかを判定する
     * @param {*} value - 判定対象
     * @returns {boolean} 空の場合 true
     * @throws {Error} 判定処理中にエラーが発生した場合
     */
    Format.isEmpty = (value) => {

        try {

            if (value === null || value === undefined) {
                return true;
            }

            if (typeof value === 'string') {
                return value.trim() === '';
            }

            if (Array.isArray(value)) {
                return value.length === 0;
            }

            if (typeof value === 'object') {
                return Object.keys(value).length === 0;
            }

            return false;

        } catch (error) {

            const message = error instanceof Error
                ? error.message
                : '不明なエラー';

            throw new Error(`isEmpty: 判定に失敗しました。（${message}）`);

        }

    };

    /**
     * HTML 特殊文字をエスケープする
     * @param {*} value - エスケープ対象
     * @returns {string} エスケープ後の文字列
     * @throws {Error} 変換処理中にエラーが発生した場合
     */
    Format.escapeHtml = (value) => {

        try {

            if (Format.isEmpty(value)) {
                return '';
            }

            // 必要ならバッククォートも追加可能
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');

        } catch (error) {

            if (error instanceof Error && error.message.startsWith('isEmpty:')) {
                throw error;
            }

            const message = error instanceof Error
                ? error.message
                : '不明なエラー';

            throw new Error(`escapeHtml: 変換に失敗しました。（${message}）`);

        }

    };

    /**
     * 金額をカンマ区切りで表示する
     * @param {*} value - 金額
     * @returns {string} フォーマット後の金額文字列
     * @throws {Error} 数値変換に失敗した場合
     */
    Format.formatMoney = (value) => {

        try {

            if (Format.isEmpty(value)) {
                return '0';
            }

            const number = Number(value);

            if (Number.isNaN(number)) {
                throw new Error(`数値に変換できません。（${value}）`);
            }

            return number.toLocaleString('ja-JP');

        } catch (error) {

            if (error instanceof Error && error.message.startsWith('isEmpty:')) {
                throw error;
            }

            const message = error instanceof Error
                ? error.message
                : '不明なエラー';

            throw new Error(`formatMoney: 変換に失敗しました。（${message}）`);

        }

    };

    /**
     * 日付を yyyy/mm/dd 形式で表示する
     * @param {*} value - 日付文字列（yyyy-mm-dd 等）
     * @returns {string} フォーマット後の日付文字列
     * @throws {Error} 変換処理中にエラーが発生した場合
     */
    Format.formatDate = (value) => {

        try {

            if (Format.isEmpty(value)) {
                return '';
            }

            const text = String(value).trim();

            // kintone 日付形式（yyyy-mm-dd）を yyyy/mm/dd に変換
            if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
                return text.replace(/-/g, '/');
            }

            // スラッシュ区切りはそのまま返す
            if (/^\d{4}\/\d{2}\/\d{2}$/.test(text)) {
                return text;
            }

            // ISO8601（例: 2026-08-11T00:00:00Z）を yyyy/mm/dd に変換
            if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
                return text.slice(0, 10).replace(/-/g, '/');
            }

            throw new Error(`日付形式が不正です。（${text}）`);

        } catch (error) {

            if (error instanceof Error && error.message.startsWith('isEmpty:')) {
                throw error;
            }

            const message = error instanceof Error
                ? error.message
                : '不明なエラー';

            throw new Error(`formatDate: 変換に失敗しました。（${message}）`);

        }

    };

    window.Format = Format;

})();