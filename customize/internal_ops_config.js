(function () {
    'use strict';

    /**
     * 社内オペレーション共通 — App34 / App84 / App30
     * work_status 正本は work_status_labels.js（任意読込）と同期。
     */

    const INTERNAL_OPS_VERSION = '1.1.0';

    const WS = typeof window !== 'undefined' && window.CAYANAS_WORK_STATUS
        ? window.CAYANAS_WORK_STATUS
        : null;

    const WORK = WS
        ? {
            sortPending: WS.LABELS.notArrived,
            inquireEstimate: WS.LABELS.inquireEstimate,
            maruWait: WS.LABELS.maruWait,
            maruInProgress: WS.LABELS.maruInProgress,
            shimiInProgress: WS.LABELS.shimiInProgress,
            repairInProgress: WS.LABELS.repairInProgress,
            reworkInProgress: WS.LABELS.reworkInProgress,
            finishInProgress: WS.LABELS.finishInProgress,
            finishDone: WS.LABELS.finishDone,
            /** @deprecated 読み取り互換用。書き込みは shimiInProgress */
            shimiWait: WS.LABELS.shimiInProgress,
        }
        : {
            sortPending: '未着',
            inquireEstimate: '問合せ・見積り',
            maruWait: '丸洗い待ち',
            maruInProgress: '丸洗い中・乾燥',
            shimiInProgress: 'しみ抜き中',
            repairInProgress: '修理中',
            reworkInProgress: '再直し中',
            finishInProgress: '仕上げ中',
            finishDone: '仕上げ完了',
            shimiWait: 'しみ抜き中',
        };

    const WORK_SELECT_OPTIONS = WS
        ? WS.APP84_SELECT_OPTIONS.slice()
        : [
            '未着',
            '問合せ・見積り',
            '丸洗い待ち',
            '丸洗い中・乾燥',
            'しみ抜き中',
            '修理中',
            '再直し中',
            '仕上げ中',
        ];

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
        WORK,
        /** App84 作業登録で選択可能（仕上げ完了は App30） */
        WORK_SELECT_OPTIONS,
        normalizeWorkStatus,
        workStatusEquals,
        DELIVERY: {
            waiting: '納品待ち',
            pickupWaiting: '引き取り待ち',
            delivered: '納品済',
        },
        STORE_CUSTOMER_CODE: 'A550',
        FIELDS: {
            order: {
                manageNo: 'manage_no',
                customerCode: 'customer_code',
                customerName: 'customer_name',
                clientName: 'client_name',
                kimonoType: 'kimono_type',
                locationStatus: 'location_status',
                processStatus: 'process_status',
                workStatus: 'work_status',
                deliveryStatus: 'delivery_status',
                deliveryNo: 'delivery_no',
                completionDate: 'completion_date',
            },
        },
    };

    window.CAYANAS_INTERNAL_OPS = CAYANAS_INTERNAL_OPS;

}());
