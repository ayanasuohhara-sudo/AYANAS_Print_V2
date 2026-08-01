(function (window) {
    'use strict';

    /**
     * AYANAS Print V2
     * table.js
     * 明細テーブル描画
     */

    const Table = {};

    /**
     * 明細描画
     * @param {Array} details
     */
    Table.render = function (details) {

        const tbody = document.getElementById("detail-body");

        if (!tbody) {
            return;
        }

        // 初期化
        tbody.innerHTML = "";

        if (!details || details.length === 0) {

            const tr = document.createElement("tr");

            tr.innerHTML =
                "<td colspan='5' style='text-align:center;'>明細はありません</td>";

            tbody.appendChild(tr);

            return;
        }

        details.forEach(function (detail, index) {

            const tr = document.createElement("tr");

            tr.dataset.row = index + 1;

            tr.innerHTML = `
                <td>${escapeHtml(detail.item_code)}</td>
                <td>${escapeHtml(detail.item_name)}</td>
                <td style="text-align:right;">
                    ${formatMoney(detail.unit_price)}
                </td>
                <td style="text-align:center;">
                    ${detail.qty}
                </td>
                <td style="text-align:right;">
                    ${formatMoney(detail.amount)}
                </td>
            `;

            tbody.appendChild(tr);

        });

    };

    /**
     * HTMLエスケープ
     */
    function escapeHtml(value) {

        if (value === null || value === undefined) {
            return "";
        }

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    }

    /**
     * 金額表示
     */
    function formatMoney(value) {

        return Number(value || 0).toLocaleString();

    }

    window.Table = Table;

})(window);