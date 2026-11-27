(function () {
    'use strict';

    /**
     * App34 社内入庫 — PUT 内容
     * A550 完了品が店舗到着し delivery_no がある場合、delivery_status=引き取り待ち も設定。
     * 法人・他顧客の delivery_status は変更しない。
     */

    const cfg = () => {

        if (typeof CAYANAS_INTERNAL_OPS === 'undefined') {
            throw new Error('CAYANAS_INTERNAL_OPS が未読込です。');
        }

        return CAYANAS_INTERNAL_OPS;

    };

    const pickup = () => (
        typeof window.CAYANAS_StorePickup !== 'undefined'
            ? window.CAYANAS_StorePickup
            : null
    );

    const norm = (value) => String(value ?? '').trim();

    const isCompletedForInbound = (processStatus, workStatus) => {

        const C = cfg();

        return norm(processStatus) === C.PROCESS.complete
            || norm(workStatus) === C.WORK.finishDone;

    };

    const applyPickupWaitingIfNeeded = (record, dest, orderSnapshot) => {

        const C = cfg();
        const F = C.FIELDS.order;
        const P = pickup();
        const snap = orderSnapshot || {};
        let nextStatus = null;

        if (P) {
            nextStatus = P.resolveInboundDeliveryStatusPatch(dest, {
                customerCode: snap.customerCode,
                processStatus: snap.processStatus,
                locationStatus: dest,
                deliveryStatus: snap.deliveryStatus,
                deliveryNo: snap.deliveryNo,
            });
        } else if (
            norm(dest) === C.LOCATION.store
            && norm(snap.customerCode) === (C.STORE_CUSTOMER_CODE || 'A550')
            && norm(snap.processStatus) === C.PROCESS.complete
            && norm(snap.deliveryNo)
            && norm(snap.deliveryStatus) !== C.DELIVERY.delivered
            && norm(snap.deliveryStatus) !== (C.DELIVERY.pickupWaiting || '引き取り待ち')
        ) {
            nextStatus = C.DELIVERY.pickupWaiting || '引き取り待ち';
        }

        if (!nextStatus || !record) {
            return false;
        }

        record[F.deliveryStatus] = { value: nextStatus };
        return true;

    };

    /**
     * @returns {{ record: Object|null, summary: string, skipReason?: string }}
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
            // 同一場所でも A550 完了品の「納品待ち→引き取り待ち」昇格のみ許可
            if (dest === C.LOCATION.store) {
                const upgrade = {};
                const patched = applyPickupWaitingIfNeeded(upgrade, dest, orderSnapshot);
                if (patched) {
                    return {
                        record: upgrade,
                        summary: '店舗到着済: delivery_status を引き取り待ちへ',
                    };
                }
            }
            return {
                record: null,
                summary: '変更なし（既に ' + dest + '）',
                skipReason: 'same_location',
            };
        }

        if (isCompletedForInbound(process, work)) {
            const record = {
                [F.locationStatus]: { value: dest },
            };
            const patched = applyPickupWaitingIfNeeded(record, dest, orderSnapshot);
            return {
                record: record,
                summary: dest + ' へ入庫（完了品: location'
                    + (patched ? ' + 引き取り待ち' : ' のみ') + '）',
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

        // 未完了は引き取り待ち条件を満たさない（process≠完了）
        return {
            record,
            summary: dest + ' へ入庫' + (record[F.processStatus] ? '（' + record[F.processStatus].value + '）' : ''),
        };

    };

    window.CAYANAS_LocationInboundEngine = {
        isCompletedForInbound,
        buildInboundPutRecord,
        applyPickupWaitingIfNeeded,
    };

}());
