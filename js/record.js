(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * record.js
     *
     * kintone レコードから帳票用データを取得する。
     * HTML 生成・DOM 操作・Format.js の利用は行わない。
     */

    const Record = {};

    /** ヘッダーフィールドコード一覧 */
    const HEADER_FIELDS = [
        'manage_no',
        'order_date',
        'deadline',
        'customer_code',
        'customer_name',
        'client_name',
        'slip_no',
        'in_charge',
        'kimono_type',
        'kimono_spec',
    ];

    /** 明細フィールドコード一覧 */
    const DETAIL_FIELDS = {
        string: ['item_code', 'item_name'],
        number: ['unit_price', 'qty', 'amount'],
    };

    /** 明細テーブルフィールドコード */
    const DETAIL_TABLE_CODE = 'detail_table';

    /**
     * フィールド値を加工せず取得する
     * @param {Object|null|undefined} fields - kintone フィールドオブジェクト
     * @param {string} fieldCode - フィールドコード
     * @returns {string|number|Array|Object} フィールド値（未設定時は空文字）
     */
    const getFieldValue = (fields, fieldCode) => {

        if (!fields || typeof fields !== 'object') {
            return '';
        }

        const field = fields[fieldCode];

        if (!field || field.value === null || field.value === undefined) {
            return '';
        }

        return field.value;

    };

    /**
     * 数値フィールドを Number 型に変換する
     * @param {*} value - 変換対象
     * @returns {number} 変換後の数値
     * @throws {Error} 数値変換に失敗した場合
     */
    const toNumber = (value) => {

        if (value === null || value === undefined || value === '') {
            return 0;
        }

        const number = Number(value);

        if (Number.isNaN(number)) {
            throw new Error(`数値に変換できません。（${value}）`);
        }

        return number;

    };

    /**
     * ヘッダーデータを取得する
     * @param {Object} record - kintone レコード
     * @returns {Object} ヘッダー情報
     */
    const buildHeader = (record) => {

        const header = {};

        HEADER_FIELDS.forEach((fieldCode) => {
            header[fieldCode] = getFieldValue(record, fieldCode);
        });

        return header;

    };

    /**
     * 明細1行を取得する
     * @param {Object} row - サブテーブル行
     * @returns {Object} 明細データ
     */
    const buildDetailRow = (row) => {

        const rowFields = row?.value ?? {};

        const detail = {};

        DETAIL_FIELDS.string.forEach((fieldCode) => {
            detail[fieldCode] = getFieldValue(rowFields, fieldCode);
        });

        DETAIL_FIELDS.number.forEach((fieldCode) => {
            detail[fieldCode] = toNumber(getFieldValue(rowFields, fieldCode));
        });

        return detail;

    };

    /**
     * 明細データと集計情報を取得する
     * @param {Object} record - kintone レコード
     * @returns {{ details: Array<Object>, summary: Object }} 明細と集計
     */
    const buildDetails = (record) => {

        const tableField = record[DETAIL_TABLE_CODE];
        const rows = Array.isArray(tableField?.value) ? tableField.value : [];

        const details = [];
        let totalQty = 0;
        let totalAmount = 0;

        rows.forEach((row, index) => {

            const detail = buildDetailRow(row);

            detail.rowNo = index + 1;

            totalQty += detail.qty;
            totalAmount += detail.amount;

            details.push(detail);

        });

        return {
            details,
            summary: {
                count: details.length,
                totalCount: details.length,
                totalQty,
                totalAmount,
            },
        };

    };

    /**
     * kintone レコードから帳票用データを取得する
     * @returns {{
     *   header: Object,
     *   details: Array<Object>,
     *   summary: { count: number, totalQty: number, totalAmount: number }
     * }} 帳票用データ
     * @throws {Error} レコード取得またはデータ変換に失敗した場合
     */
    Record.get = () => {

        try {

            const current = kintone.app.record.get();

            if (!current || !current.record) {
                throw new Error('レコードを取得できません。');
            }

            const record = current.record;
            const header = buildHeader(record);
            const { details, summary } = buildDetails(record);

            return {
                header,
                details,
                summary,
            };

        } catch (error) {

            if (error instanceof Error && (
                error.message === 'レコードを取得できません。'
                || error.message.startsWith('数値に変換できません。')
            )) {
                throw error;
            }

            const message = error instanceof Error
                ? error.message
                : '不明なエラー';

            throw new Error(`Record.get: データ取得に失敗しました。（${message}）`);

        }

    };

    window.Record = Record;

})();