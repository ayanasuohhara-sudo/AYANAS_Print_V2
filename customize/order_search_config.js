(function () {
    'use strict';

    /**
     * 受注検索 App88 — 定数。
     * 検索結果は保存しない。正本は App16。
     */

    const ORDER_SEARCH_VERSION = '1.0.0';

    const CAYANAS_ORDER_SEARCH = {
        VERSION: ORDER_SEARCH_VERSION,
        SEARCH_APP_ID: 88,
        ORDER_APP_ID: 16,
        PAGE_LIMIT: 500,
        MAX_OFFSET: 10000,
        DELIVERY_DONE: '納品済',
        AGGREGATION_CANCELLED: '取消',
        PROCESSING_SEPARATOR: ' / ',
        DUPLICATE_LABEL: '重複',
        MESSAGES: {
            needCondition: '検索条件を1つ以上入力してください。',
            empty: '該当する受注はありません。',
            failed: '検索に失敗しました。再度お試しください。',
            resultPrefix: '検索結果：',
            resultSuffix: '件',
            loading: '検索中…',
        },
        FIELDS: {
            id: '$id',
            manageNo: 'manage_no',
            orderDate: 'order_date',
            deadline: 'deadline',
            customerCode: 'customer_code',
            customerName: 'customer_name',
            clientName: 'client_name',
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
