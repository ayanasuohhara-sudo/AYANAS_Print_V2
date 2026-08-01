(function (window) {
    'use strict';

    /**
     * AYANAS Print V2
     * preview.js
     * Part1
     * 印刷プレビュー生成
     */

    const Preview = {};

    /**
     * プレビューを開く
     */
    Preview.open = function (data) {

        const printWindow = window.open(
            "",
            "_blank",
            "width=1200,height=900"
        );

        if (!printWindow) {

            alert("印刷ウィンドウを開けません。");

            return;

        }

        const html = createHtml(data);

        printWindow.document.open();

        printWindow.document.write(html);

        printWindow.document.close();

    };

    /**
     * HTML生成
     */
    function createHtml(data) {

        return `
<!DOCTYPE html>

<html lang="ja">

<head>

<meta charset="UTF-8">

<title>AYANAS Print</title>

<style>

body{

    margin:20px;

    font-family:
    "Yu Gothic",
    Meiryo,
    sans-serif;

}

.page{

    width:277mm;

    margin:auto;

}

h1{

    text-align:center;

}

table{

    width:100%;

    border-collapse:collapse;

}

th{

    background:#eeeeee;

}

th,td{

    border:1px solid #000;

    padding:6px;

}

.header{

    margin-bottom:20px;

}

.detail{

    margin-top:15px;

}

tfoot th{

    text-align:right;

}

</style>

</head>

<body>

<div class="page">

<h1>

受 注 票

</h1>

<table class="header">

<tr>

<th>管理番号</th>

<td>${data.header.manage_no}</td>

<th>受注日</th>

<td>${data.header.order_date}</td>

</tr>

<tr>

<th>納期</th>

<td>${data.header.deadline}</td>

<th>顧客コード</th>

<td>${data.header.customer_code}</td>

</tr>

<tr>

<th>顧客名</th>

<td colspan="3">

${data.header.customer_name}

</td>

</tr>

<tr>

<th>お客様名</th>

<td colspan="3">

${data.header.client_name}

</td>

</tr>

</table>

<table class="detail">

<thead>

<tr>

<th>商品コード</th>

<th>商品名</th>

<th>単価</th>

<th>数量</th>

<th>金額</th>

</tr>

</thead>

<tbody id="detailBody">

<!-- Part2で生成 -->

</tbody>

<tfoot>

<tr>

<th colspan="4">

合計

</th>

<th>

<!-- Part2 -->

</th>

</tr>

</tfoot>

</table>

</div>

</body>

</html>

`;

    }

    window.Preview = Preview;

})(window);