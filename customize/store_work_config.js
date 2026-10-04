(function () {
    'use strict';

    /**
     * 店舗入庫・ステータス管理（App85）
     */

    const STORE_WORK_VERSION = '1.0.0';

    const CAYANAS_STORE_WORK = {
        STORE_WORK_APP_ID: 85,
        ORDER_APP_ID: 16,
        PRODUCT_APP_ID: 13,
        WORK_SPACE_ID: 'store_work_space',
        MESSAGE_SPACE_ID: 'message_space',
        MANAGE_NO_MIN_LENGTH: 6,
        LOCATION: {
            factory: '工場',
            store: '店舗',
        },
        WORK: {
            shimiWait: 'しみ抜き待ち',
            shimiInProgress: 'しみ抜き中',
            finishWait: '仕上げ待ち',
        },
        MARUARAI_SUBCATEGORY: '丸洗い',
        SHIMINUKI_SUBCATEGORY: 'しみぬき',
        FIELDS: {
            order: {
                manageNo: 'manage_no',
                customerName: 'customer_name',
                clientName: 'client_name',
                kimonoType: 'kimono_type',
                locationStatus: 'location_status',
                workStatus: 'work_status',
                detailTable: 'detail_table',
                itemCode: 'item_code',
                itemName: 'item_name',
                qty: 'qty',
            },
            product: {
                itemCode: 'item_code',
                itemName: 'item_name',
                subcategory: 'subcategory',
            },
        },
    };

    window.CAYANAS_STORE_WORK = CAYANAS_STORE_WORK;
    window.CAYANAS_STORE_WORK_VERSION = STORE_WORK_VERSION;

}());
