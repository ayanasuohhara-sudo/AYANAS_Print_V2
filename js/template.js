(function (window) {
    'use strict';

    /**
     * AYANAS Print V2
     * template.js
     * HTMLへデータを表示
     */

    const Template = {};

    /**
     * HTMLへデータをセット
     * @param {Object} data Record.get() の戻り値
     */
    Template.render = function (data) {

        const h = data.header;

        // ヘッダー
        setText("manage_no", h.manage_no);
        setText("order_date", formatDate(h.order_date));
        setText("deadline", formatDate(h.deadline));
        setText("customer_code", h.customer_code);
        setText("customer_name", h.customer_name);
        setText("client_name", h.client_name);
        setText("slip_no", h.slip_no);
        setText("in_charge", h.in_charge);
        setText("kimono_type", h.kimono_type);
        setText("kimono_spec", h.kimono_spec);

        // 合計金額
        setText("total_amount", formatMoney(data.totalAmount));

    };

    /**
     * idへ文字をセット
     */
    function setText(id, value) {

        const el = document.getElementById(id);

        if (!el) return;

        el.textContent = value || "";

    }

    /**
     * 日付
     * yyyy-mm-dd → yyyy/mm/dd
     */
    function formatDate(value) {

        if (!value) return "";

        return value.replace(/-/g, "/");

    }

    /**
     * 金額
     */
    function formatMoney(value) {

        return Number(value || 0).toLocaleString();

    }

    window.Template = Template;

})(window);