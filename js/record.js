(function (window) {
    'use strict';

    /**
     * AYANAS Print V2
     * record.js
     * kintoneレコード取得モジュール
     */

    const Record = {};

    /**
     * 現在表示中のレコードを取得
     */
    Record.get = function () {

        const record = kintone.app.record.get().record;

        // ヘッダー情報
        const header = {
            manage_no: record.manage_no ? record.manage_no.value : "",
            order_date: record.order_date ? record.order_date.value : "",
            deadline: record.deadline ? record.deadline.value : "",
            customer_code: record.customer_code ? record.customer_code.value : "",
            customer_name: record.customer_name ? record.customer_name.value : "",
            client_name: record.client_name ? record.client_name.value : "",
            slip_no: record.slip_no ? record.slip_no.value : "",
            in_charge: record.in_charge ? record.in_charge.value : "",
            kimono_type: record.kimono_type ? record.kimono_type.value : "",
            kimono_spec: record.kimono_spec ? record.kimono_spec.value : ""
        };

        // 明細
        const details = [];

        let totalAmount = 0;

        if (record.detail_table && record.detail_table.value) {

            record.detail_table.value.forEach(function (row) {

                const detail = {

                    item_code:
                        row.value.item_code ?
                        row.value.item_code.value :
                        "",

                    item_name:
                        row.value.item_name ?
                        row.value.item_name.value :
                        "",

                    unit_price:
                        Number(
                            row.value.unit_price ?
                            row.value.unit_price.value :
                            0
                        ),

                    qty:
                        Number(
                            row.value.qty ?
                            row.value.qty.value :
                            0
                        ),

                    amount:
                        Number(
                            row.value.amount ?
                            row.value.amount.value :
                            0
                        )

                };

                totalAmount += detail.amount;

                details.push(detail);

            });

        }

        return {

            header: header,

            details: details,

            totalAmount: totalAmount

        };

    };

    window.Record = Record;

})(window);