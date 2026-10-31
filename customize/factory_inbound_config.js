(function () {
    'use strict';

    /**
     * 工場入庫 V1
     * kintone に「工場入庫」用アプリを作成し、FACTORY_INBOUND_APP_ID を設定してください。
     */

    const FACTORY_INBOUND_VERSION = '1.2.0';

    const CAYANAS_FACTORY_INBOUND = {
        /** 工場入庫操作画面（専用アプリ）の App ID — 未設定(0)のとき UI は起動しません */
        FACTORY_INBOUND_APP_ID: 84,
        ORDER_APP_ID: 16,
        PRODUCT_APP_ID: 13,
        UI_SPACE_ID: 'factory_inbound_space',
        SORTING_SPACE_ID: 'factory_sorting_space',
        WORK_SPACE_ID: 'factory_work_space',
        MESSAGE_SPACE_ID: 'message_space',
        BARCODE_FIELDS: ['barcode_input', 'manage_no', 'barcode'],
        MANAGE_NO_MIN_LENGTH: 6,
        LOCATION: {
            factory: '工場',
            store: '店舗',
            hq: '本社',
        },
        WORK: {
            sortPending: '未着手',
            maruWait: '丸洗い待ち',
            shimiWait: 'しみ抜き待ち',
            finishWait: '仕上げ待ち',
            maruInProgress: '丸洗い中',
            finishDone: '仕上げ完了',
        },
        MARUARAI_SUBCATEGORY: '丸洗い',
        SHIMINUKI_SUBCATEGORY: 'しみぬき',
        /** V1 工場入庫の移動元として許可 */
        ALLOWED_SOURCE_LOCATIONS: ['店舗', '本社'],
        /** 自動処理対象外（警告のみ） */
        BLOCKED_SOURCE_LOCATIONS: ['外注先', '海外', '和裁士', '納品済'],
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

    window.CAYANAS_FACTORY_INBOUND = CAYANAS_FACTORY_INBOUND;
    window.CAYANAS_FACTORY_INBOUND_VERSION = FACTORY_INBOUND_VERSION;

}());
