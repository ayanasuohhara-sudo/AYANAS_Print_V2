(function () {
    'use strict';

    /**
     * 店舗入庫・ステータス管理（App85・残置）
     * しみ抜き待ち廃止 → 書き込みはしみ抜き中。完了時は仕上げ中（仕上げ待ち廃止）。
     */

    const STORE_WORK_VERSION = '1.1.0';

    const WS = typeof window !== 'undefined' && window.CAYANAS_WORK_STATUS
        ? window.CAYANAS_WORK_STATUS
        : null;

    const WORK = WS
        ? {
            shimiInProgress: WS.LABELS.shimiInProgress,
            finishInProgress: WS.LABELS.finishInProgress,
            /** @deprecated dual-read。開始条件の旧値 */
            shimiWait: 'しみ抜き待ち',
            finishWait: WS.LABELS.finishInProgress,
        }
        : {
            shimiInProgress: 'しみ抜き中',
            finishInProgress: '仕上げ中',
            shimiWait: 'しみ抜き待ち',
            finishWait: '仕上げ中',
        };

    const normalizeWorkStatus = (value) => {

        if (WS) {
            return WS.normalize(value);
        }

        const raw = String(value ?? '').trim();
        const aliases = {
            'しみ抜き待ち': 'しみ抜き中',
            '仕上げ待ち': '仕上げ中',
        };

        return aliases[raw] || raw;

    };

    const workStatusEquals = (left, right) => normalizeWorkStatus(left) === normalizeWorkStatus(right);

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
        WORK,
        normalizeWorkStatus,
        workStatusEquals,
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
