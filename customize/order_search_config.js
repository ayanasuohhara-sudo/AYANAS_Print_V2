(function () {
    'use strict';

    /**
     * 受注検索 App88 — 定数。
     * 検索結果は保存しない。正本は App16。
     * v1.1.1: ふりがな欄の漢字入力を client_name OR（かな未登録の過去データを救済）。
     */

    const ORDER_SEARCH_VERSION = '1.1.1';

    const CAYANAS_ORDER_SEARCH = {
        VERSION: ORDER_SEARCH_VERSION,
        SEARCH_APP_ID: 88,
        ORDER_APP_ID: 16,
        /** A550 は店舗。法人問い合わせでは明示的に除外できる */
        STORE_CUSTOMER_CODE: 'A550',
        PAGE_LIMIT: 500,
        MAX_OFFSET: 10000,
        /** 画面に出す最大行（取得上限内） */
        DISPLAY_LIMIT: 500,
        SUGGEST_DEBOUNCE_MS: 300,
        SUGGEST_MIN_CHARS: 2,
        SUGGEST_FETCH_LIMIT: 50,
        SUGGEST_DISPLAY_LIMIT: 20,
        DELIVERY_DONE: '納品済',
        AGGREGATION_CANCELLED: '取消',
        PROCESSING_SEPARATOR: ' / ',
        DUPLICATE_LABEL: '重複',
        KANA_STATUS: {
            confirmed: '確認済',
            unconfirmed: '未確認',
            unknown: '不明',
        },
        MESSAGES: {
            needCondition: '検索条件を1つ以上入力してください。',
            empty: '該当する受注はありません。',
            failed: '検索に失敗しました。再度お試しください。',
            resultPrefix: '検索結果：',
            resultSuffix: '件',
            loading: '検索中…',
            truncatedPrefix: '表示上限 ',
            truncatedMid: ' 件まで表示（取得上限 offset ',
            truncatedSuffix: '）。条件を絞ってください。',
            suggestHint: 'ふりがな入力で候補を表示します（ひらがな・カタカナ同一視）',
            kanaEmptyNote: 'ふりがな未登録の過去データは、お客様名（漢字）・法人コード・管理番号でも探せます。ふりがな欄に漢字を入れても氏名として検索します。',
            excludeA550: '店舗(A550)を除外',
        },
        FIELDS: {
            id: '$id',
            manageNo: 'manage_no',
            orderDate: 'order_date',
            deadline: 'deadline',
            customerCode: 'customer_code',
            customerName: 'customer_name',
            clientName: 'client_name',
            clientNameKana: 'client_name_kana',
            clientNameKanaStatus: 'client_name_kana_status',
            slipNo: 'slip_no',
            kimonoType: 'kimono_type',
            kimonoSpec: 'kimono_spec',
            processStatus: 'process_status',
            workStatus: 'work_status',
            locationStatus: 'location_status',
            deliveryStatus: 'delivery_status',
            aggregationStatus: 'aggregation_status',
            detailTable: 'detail_table',
            itemName: 'item_name',
        },
    };

    window.CAYANAS_ORDER_SEARCH = CAYANAS_ORDER_SEARCH;
    window.CAYANAS_ORDER_SEARCH_VERSION = ORDER_SEARCH_VERSION;

}());
