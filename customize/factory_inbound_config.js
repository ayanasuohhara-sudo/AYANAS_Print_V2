(function () {
    'use strict';

    /**
     * 工場入庫 V1
     * kintone に「工場入庫」用アプリを作成し、FACTORY_INBOUND_APP_ID を設定してください。
     *
     * 仕上げ待ちは廃止。丸洗いなし入庫・振り分け「仕上げへ」・丸洗い完了の書込先は仕上げ中。
     * （docs/INTERNAL_OPS_SETUP.md: 仕上げ待ちは使わない）
     */

    const FACTORY_INBOUND_VERSION = '1.3.0';

    const WS = typeof window !== 'undefined' && window.CAYANAS_WORK_STATUS
        ? window.CAYANAS_WORK_STATUS
        : null;

    const WORK = WS
        ? {
            sortPending: WS.LABELS.notArrived,
            maruWait: WS.LABELS.maruWait,
            maruInProgress: WS.LABELS.maruInProgress,
            shimiInProgress: WS.LABELS.shimiInProgress,
            finishInProgress: WS.LABELS.finishInProgress,
            finishDone: WS.LABELS.finishDone,
            /** @deprecated 書き込みは shimiInProgress / finishInProgress */
            shimiWait: WS.LABELS.shimiInProgress,
            finishWait: WS.LABELS.finishInProgress,
        }
        : {
            sortPending: '未着',
            maruWait: '丸洗い待ち',
            maruInProgress: '丸洗い中・乾燥',
            shimiInProgress: 'しみ抜き中',
            finishInProgress: '仕上げ中',
            finishDone: '仕上げ完了',
            shimiWait: 'しみ抜き中',
            finishWait: '仕上げ中',
        };

    const normalizeWorkStatus = (value) => {

        if (WS) {
            return WS.normalize(value);
        }

        const raw = String(value ?? '').trim();
        const aliases = {
            '未着手': '未着',
            '振り分け待ち': '未着',
            'しみ抜き待ち': 'しみ抜き中',
            '仕上げ待ち': '仕上げ中',
            '丸洗い中': '丸洗い中・乾燥',
        };

        return aliases[raw] || raw;

    };

    const workStatusEquals = (left, right) => normalizeWorkStatus(left) === normalizeWorkStatus(right);

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
        WORK,
        normalizeWorkStatus,
        workStatusEquals,
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
