(function () {
    'use strict';

    /**
     * App34 社内入庫 — PUT 内容
     */

    const cfg = () => {

        if (typeof CAYANAS_INTERNAL_OPS === 'undefined') {
            throw new Error('CAYANAS_INTERNAL_OPS が未読込です。');
        }

        return CAYANAS_INTERNAL_OPS;

    };

    const norm = (value) => String(value ?? '').trim();

    const isCompletedForInbound = (processStatus, workStatus) => {

        const C = cfg();

        return norm(processStatus) === C.PROCESS.complete
            || norm(workStatus) === C.WORK.finishDone;

    };

    /**
     * @returns {{ record: Object, summary: string, skipReason?: string }}
     */
    const buildInboundPutRecord = (inboundDestination, orderSnapshot) => {

        const C = cfg();
        const F = C.FIELDS.order;
        const dest = norm(inboundDestination);
        const loc = norm(orderSnapshot.locationStatus);
        const process = norm(orderSnapshot.processStatus);
        const work = norm(orderSnapshot.workStatus);

        if (![C.LOCATION.hq, C.LOCATION.factory, C.LOCATION.store].includes(dest)) {
            throw new Error('入庫先が不正です: ' + dest);
        }

        if (loc === dest) {
            return {
                record: null,
                summary: '変更なし（既に ' + dest + '）',
                skipReason: 'same_location',
            };
        }

        if (isCompletedForInbound(process, work)) {
            return {
                record: {
                    [F.locationStatus]: { value: dest },
                },
                summary: dest + ' へ入庫（完了品: location のみ）',
            };
        }

        const record = {
            [F.locationStatus]: { value: dest },
        };

        if (dest === C.LOCATION.factory) {
            record[F.processStatus] = { value: C.PROCESS.factoryWorking };
        } else if (dest === C.LOCATION.store) {
            record[F.processStatus] = { value: C.PROCESS.storeWorking };
        }

        return {
            record,
            summary: dest + ' へ入庫' + (record[F.processStatus] ? '（' + record[F.processStatus].value + '）' : ''),
        };

    };

    window.CAYANAS_LocationInboundEngine = {
        isCompletedForInbound,
        buildInboundPutRecord,
    };

}());
