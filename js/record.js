(function (window) {
    'use strict';

    /**
     * AYANAS Print V2
     * record.js
     * kintoneレコード取得モジュール
     */

    const Record = {};

    /**
     * 数値変換
     */
    function toNumber(value) {

        if (value === null || value === undefined || value === "") {
            return 0;
        }

        return Number(value);

    }

    /**
     * 値取得
     */
    function getValue(record, fieldCode) {

        if (!record[fieldCode]) {
            return "";
        }

        return record[fieldCode].value;

    }

    /**
     * レコード取得
     */
    Record.get = function () {

        const current = kintone.app.record.get();

        if (!current) {
            throw new Error("レコードを取得できません。");
        }

        const record = current.record;

        //--------------------------------
        // ヘッダー
        //--------------------------------

        const header = {

            manage_no: getValue(record, "manage_no"),

            order_date: getValue(record, "order_date"),

            deadline: getValue(record, "deadline"),

            customer_code: getValue(record, "customer_code"),

            customer_name: getValue(record, "customer_name"),

            client_name: getValue(record, "client_name"),

            slip_no: getValue(record, "slip_no"),

            in_charge: getValue(record, "in_charge"),

            kimono_type: getValue(record, "kimono_type"),

            kimono_spec: getValue(record, "kimono_spec")

        };

        //--------------------------------
        // 明細
        //--------------------------------

        const details = [];

        let totalQty = 0;
        let totalAmount = 0;

        const table = record.detail_table
            ? record.detail_table.value
            : [];

        table.forEach(function (row, index) {

            const detail = {

                rowNo: index + 1,

                item_code: getValue(row.value, "item_code"),

                item_name: getValue(row.value, "item_name"),

                unit_price: toNumber(
                    getValue(row.value, "unit_price")
                ),

                qty: toNumber(
                    getValue(row.value, "qty")
                ),

                amount: toNumber(
                    getValue(row.value, "amount")
                )

            };

            totalQty += detail.qty;
            totalAmount += detail.amount;

            details.push(detail);

        });

        //--------------------------------
        // 戻り値
        //--------------------------------

        return {

            header: header,

            details: details,

            summary: {

                count: details.length,

                totalQty: totalQty,

                totalAmount: totalAmount

            }

        };

    };

    window.Record = Record;

})(window);