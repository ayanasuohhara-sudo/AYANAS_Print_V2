(function () {
    'use strict';

    /**
     * App84 社内作業ステータス — PUT 正本。
     * 初期は work_status のみ。完了登録（App30）と同型で保管場所を同時更新できる。
     * process / delivery / completion_date は変更しない。
     */

    const cfg = () => CAYANAS_INTERNAL_OPS;

    const norm = (value) => String(value ?? '').trim();

    const BULK_MODE = {
        work: 'work',
        workWithLocation: 'work_with_location',
        locationOnly: 'location_only',
    };

    const orderFields = () => cfg().FIELDS.order;

    const readField = (record, code) => {
        const field = record?.[code];

        if (!field || field.value === null || field.value === undefined) {
            return '';
        }

        return String(field.value).trim();
    };

    const allowedLocations = () => {
        const C = cfg();
        return [C.LOCATION.factory, C.LOCATION.hq, C.LOCATION.store];
    };

    const isAllowedWorkSelection = (workStatus) => {
        const C = cfg();
        return C.WORK_SELECT_OPTIONS.includes(norm(workStatus));
    };

    const isDeliveredStatus = (deliveryStatus) => {
        const C = cfg();
        const delivered = C.DELIVERY.delivered || '納品済';
        return norm(deliveryStatus) === delivered;
    };

    const buildWorkPutRecord = (selectedWorkStatus) => {
        const C = cfg();
        const work = norm(selectedWorkStatus);

        if (!isAllowedWorkSelection(work)) {
            throw new Error('選択できない作業ステータスです: ' + work);
        }

        return {
            [C.FIELDS.order.workStatus]: { value: work },
        };
    };

    const buildLocationOnlyPutRecord = (location) => {
        const C = cfg();
        const F = C.FIELDS.order;
        const loc = norm(location);

        if (!allowedLocations().includes(loc)) {
            throw new Error('保管場所を選択してください。');
        }

        return {
            [F.locationStatus]: { value: loc },
        };
    };

    /**
     * @param {{ mode: string, workStatus?: string, location?: string }} options
     */
    const buildBulkPutRecord = (options) => {
        const opts = options || {};
        const mode = norm(opts.mode || BULK_MODE.work);
        const location = norm(opts.location);
        const workStatus = norm(opts.workStatus);

        if (mode === BULK_MODE.locationOnly) {
            return buildLocationOnlyPutRecord(location);
        }

        if (mode === BULK_MODE.workWithLocation) {
            return Object.assign(
                {},
                buildWorkPutRecord(workStatus),
                buildLocationOnlyPutRecord(location)
            );
        }

        if (mode === BULK_MODE.work) {
            return buildWorkPutRecord(workStatus);
        }

        throw new Error('処理内容が不正です: ' + mode);
    };

    const validateBulkSelection = (mode, workStatus, location) => {
        const value = norm(mode);
        const work = norm(workStatus);
        const loc = norm(location);

        if (value === BULK_MODE.work) {
            if (!isAllowedWorkSelection(work)) {
                return { ok: false, reason: '作業ステータスを選択してください。' };
            }
            return { ok: true };
        }

        if (value === BULK_MODE.workWithLocation) {
            if (!isAllowedWorkSelection(work)) {
                return { ok: false, reason: '作業ステータスを選択してください。' };
            }
            if (!allowedLocations().includes(loc)) {
                return { ok: false, reason: '保管場所を工場・本社・店舗から選択してください。' };
            }
            return { ok: true };
        }

        if (value === BULK_MODE.locationOnly) {
            if (!allowedLocations().includes(loc)) {
                return { ok: false, reason: '保管場所を工場・本社・店舗から選択してください。' };
            }
            return { ok: true };
        }

        return { ok: false, reason: '処理内容を選択してください。' };
    };

    const isPutApplied = (record, putRecord) => {
        const expected = putRecord || {};
        const keys = Object.keys(expected);

        if (keys.length === 0) {
            return false;
        }

        return keys.every((code) => {
            const want = expected[code] && expected[code].value !== undefined
                ? String(expected[code].value).trim()
                : '';
            return readField(record, code) === want;
        });
    };

    /**
     * @returns {{ action: 'skip'|'fail'|'put', reason?: string, putRecord?: Object }}
     */
    const planBulkItemAction = (options) => {
        const opts = options || {};
        const mode = norm(opts.mode || BULK_MODE.work);
        const workStatus = norm(opts.workStatus);
        const location = norm(opts.location);
        const snapshot = opts.snapshot || {};
        const currentWork = norm(snapshot.workStatus);
        const currentLoc = norm(snapshot.locationStatus);

        if (isDeliveredStatus(snapshot.deliveryStatus)) {
            return {
                action: 'fail',
                reason: '納品済のため更新できません',
            };
        }

        if (mode === BULK_MODE.work) {
            if (currentWork === workStatus) {
                return { action: 'skip', reason: '作業ステータス同一' };
            }
            return {
                action: 'put',
                putRecord: buildWorkPutRecord(workStatus),
            };
        }

        if (mode === BULK_MODE.workWithLocation) {
            if (currentWork === workStatus) {
                if (currentLoc === location) {
                    return { action: 'skip', reason: '作業・保管場所とも同一' };
                }
                return {
                    action: 'put',
                    putRecord: buildLocationOnlyPutRecord(location),
                };
            }
            return {
                action: 'put',
                putRecord: buildBulkPutRecord({
                    mode: BULK_MODE.workWithLocation,
                    workStatus,
                    location,
                }),
            };
        }

        if (mode === BULK_MODE.locationOnly) {
            if (currentLoc === location) {
                return { action: 'skip', reason: '保管場所同一' };
            }
            return {
                action: 'put',
                putRecord: buildLocationOnlyPutRecord(location),
            };
        }

        return {
            action: 'fail',
            reason: '処理内容が不正です',
        };
    };

    const toOrderSnapshot = (record) => {
        const F = orderFields();

        return {
            recordId: record?.$id?.value,
            manageNo: readField(record, F.manageNo),
            customerName: readField(record, F.customerName),
            clientName: readField(record, F.clientName),
            kimonoType: readField(record, F.kimonoType),
            locationStatus: readField(record, F.locationStatus),
            processStatus: readField(record, F.processStatus),
            workStatus: readField(record, F.workStatus),
            deliveryStatus: readField(record, F.deliveryStatus),
        };
    };

    const orderFetchFields = () => {
        const F = orderFields();

        return [
            '$id',
            F.manageNo,
            F.customerName,
            F.clientName,
            F.kimonoType,
            F.locationStatus,
            F.processStatus,
            F.workStatus,
            F.deliveryStatus,
        ];
    };

    window.CAYANAS_InternalWorkEngine = {
        BULK_MODE,
        isAllowedWorkSelection,
        buildWorkPutRecord,
        buildLocationOnlyPutRecord,
        buildBulkPutRecord,
        validateBulkSelection,
        isPutApplied,
        isDeliveredStatus,
        planBulkItemAction,
        allowedLocations,
        toOrderSnapshot,
        orderFetchFields,
    };

}());
