(function () {
    'use strict';

    /**
     * 社内オペレーション共通 — App34 / App84 / App30
     */

    const INTERNAL_OPS_VERSION = '1.0.4';

    const CAYANAS_INTERNAL_OPS = {
        VERSION: INTERNAL_OPS_VERSION,
        /** App84 旧 factory_inbound / sorting / work / portal_layout を無効化 */
        DISABLE_LEGACY_APP84: true,
        APP: {
            order: 16,
            locationInbound: 34,
            internalWork: 84,
            completeRegister: 30,
        },
        SPACE: {
            locationInbound: 'location_inbound_space',
            internalWork: 'internal_work_space',
            completeRegister: 'complete_register_space',
            messageFallback: 'message_space',
        },
        MANAGE_NO_MIN_LENGTH: 6,
        LOCATION: {
            hq: '本社',
            factory: '工場',
            store: '店舗',
        },
        PROCESS: {
            complete: '完了',
            factoryWorking: '工場作業中',
            storeWorking: '店舗作業中',
        },
        WORK: {
            sortPending: '未着手',
            maruWait: '丸洗い待ち',
            maruInProgress: '丸洗い中・乾燥',
            shimiWait: 'しみ抜き待ち',
            shimiInProgress: 'しみ抜き中',
            repairInProgress: '修理中',
            reworkInProgress: '再直し中',
            finishInProgress: '仕上げ中',
            finishDone: '仕上げ完了',
        },
        /** App84 作業登録で選択可能（仕上げ完了は App30） */
        WORK_SELECT_OPTIONS: [
            '未着手',
            '丸洗い待ち',
            '丸洗い中・乾燥',
            'しみ抜き待ち',
            'しみ抜き中',
            '修理中',
            '再直し中',
            '仕上げ中',
        ],
        DELIVERY: {
            waiting: '納品待ち',
            delivered: '納品済',
        },
        FIELDS: {
            order: {
                manageNo: 'manage_no',
                customerName: 'customer_name',
                clientName: 'client_name',
                kimonoType: 'kimono_type',
                locationStatus: 'location_status',
                processStatus: 'process_status',
                workStatus: 'work_status',
                deliveryStatus: 'delivery_status',
                completionDate: 'completion_date',
            },
        },
    };

    window.CAYANAS_INTERNAL_OPS = CAYANAS_INTERNAL_OPS;

}());
