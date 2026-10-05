(function () {
    'use strict';

    /**
     * 完了登録の正本。
     * App30 と App19 の補完は、どちらも buildCompletePutRecord の戻り値だけを PUT する。
     */

    const completableProcessValues = () => [
        config().PROCESS.factoryWorking,
        config().PROCESS.storeWorking,
        '外注戻り',
        '海外戻り',
        '和裁士戻り',
        '検品仕上中',
    ];

    const DELIVERY_DETAIL_TABLE = 'delivery_detail';
    const DELIVERY_MANAGE_NO = 'manage_no';

    const config = () => CAYANAS_INTERNAL_OPS;

    const orderFields = () => config().FIELDS.order;

    const formatKintoneDate = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
    };

    const readField = (record, code) => {
        const field = record?.[code];

        if (!field || field.value === null || field.value === undefined) {
            return '';
        }

        return String(field.value).trim();
    };

    const buildCompletePutRecord = (date) => {
        const C = config();
        const F = C.FIELDS.order;
        const when = date instanceof Date ? date : new Date();

        return {
            [F.processStatus]: { value: C.PROCESS.complete },
            [F.workStatus]: { value: C.WORK.finishDone },
            [F.deliveryStatus]: { value: C.DELIVERY.waiting },
            [F.completionDate]: { value: formatKintoneDate(when) },
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
            F.completionDate,
        ];
    };

    const escapeQueryValue = (value) => String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

    const buildManageNoQuery = (manageNo) => (
        orderFields().manageNo + ' = "' + escapeQueryValue(manageNo) + '" limit 2'
    );

    const classifyProcessStatus = (processStatus) => {
        const value = String(processStatus ?? '').trim();

        if (value === config().PROCESS.complete) {
            return 'complete';
        }

        if (completableProcessValues().indexOf(value) !== -1) {
            return 'completable';
        }

        return 'blocked';
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
            completionDate: readField(record, F.completionDate),
        };
    };

    const collectDistinctManageNos = (detailRows) => {
        const manageNos = [];
        const seen = new Set();
        const rows = Array.isArray(detailRows) ? detailRows : [];

        rows.forEach((row) => {
            const manageNo = String(row?.value?.[DELIVERY_MANAGE_NO]?.value ?? '').trim();

            if (!manageNo || seen.has(manageNo)) {
                return;
            }

            seen.add(manageNo);
            manageNos.push(manageNo);
        });

        return manageNos;
    };

    const collectDistinctManageNosFromRecord = (record) => {
        const table = record?.[DELIVERY_DETAIL_TABLE];
        const rows = table && Array.isArray(table.value) ? table.value : [];
        return collectDistinctManageNos(rows);
    };

    const isCompletePutApplied = (record, putRecord) => {
        const expected = putRecord || buildCompletePutRecord();
        const F = orderFields();
        const processOk = readField(record, F.processStatus) === String(expected[F.processStatus].value);
        const workOk = readField(record, F.workStatus) === String(expected[F.workStatus].value);
        const deliveryOk = readField(record, F.deliveryStatus) === String(expected[F.deliveryStatus].value);
        const completionDate = readField(record, F.completionDate);

        return processOk
            && workOk
            && deliveryOk
            && completionDate !== ''
            && completionDate === String(expected[F.completionDate].value);
    };

    const evaluateOrderLookups = (lookups) => {
        const missing = [];
        const duplicates = [];
        const fetchErrors = [];
        const blocked = [];
        const completable = [];
        const alreadyComplete = [];

        (lookups || []).forEach((item) => {
            if (item.error) {
                fetchErrors.push({
                    manageNo: item.manageNo,
                    reason: item.error,
                });
                return;
            }

            const records = item.records || [];

            if (records.length === 0) {
                missing.push(item.manageNo);
                return;
            }

            if (records.length > 1) {
                duplicates.push(item.manageNo);
                return;
            }

            const snapshot = toOrderSnapshot(records[0]);
            const kind = classifyProcessStatus(snapshot.processStatus);

            if (kind === 'complete') {
                alreadyComplete.push(snapshot);
                return;
            }

            if (kind === 'completable') {
                completable.push(snapshot);
                return;
            }

            blocked.push(snapshot);
        });

        const hardStop = missing.length > 0
            || duplicates.length > 0
            || fetchErrors.length > 0
            || blocked.length > 0;

        return {
            hardStop,
            missing,
            duplicates,
            fetchErrors,
            blocked,
            completable,
            alreadyComplete,
        };
    };

    const formatItemLine = (item) => (
        item.manageNo
        + '　' + (item.customerName || '')
        + '　' + (item.clientName || '')
        + '　' + (item.kimonoType || '')
        + '　' + (item.processStatus || '(空欄)')
        + '／' + (item.workStatus || '')
        + '　保管場所:' + (item.locationStatus || '')
    );

    const buildHardStopMessage = (evaluation) => {
        const lines = [];

        evaluation.missing.forEach((manageNo) => {
            lines.push('管理番号 ' + manageNo + ' が受注明細に見つかりません。納品書を保存できません。');
        });

        evaluation.duplicates.forEach((manageNo) => {
            lines.push('管理番号 ' + manageNo + ' が受注明細に複数存在します。確認してください。');
        });

        evaluation.fetchErrors.forEach((item) => {
            lines.push('管理番号 ' + item.manageNo + ' の受注明細を取得できませんでした。納品書を保存できません。');
            if (item.reason) {
                lines.push(item.reason);
            }
        });

        if (evaluation.blocked.length > 0) {
            lines.push('納品できない工程の商品が含まれています。');
            lines.push('');
            evaluation.blocked.forEach((item) => {
                lines.push('管理番号：' + item.manageNo);
                lines.push('現在工程：' + (item.processStatus || '(空欄)'));
                lines.push('');
            });
            lines.push('工程状態を確認してください。');
        }

        if (lines.length > 0) {
            lines.push('');
            lines.push('受注の完了登録は行っていません。');
        }

        return lines.join('\n').trim();
    };

    const buildConfirmMessage = (items) => {
        const lines = [
            '完了登録されていない商品が' + items.length + '件あります。',
            '',
        ];

        items.forEach((item) => {
            lines.push(formatItemLine(item));
        });

        lines.push('');
        lines.push('検品・仕上げが完了している場合は［OK］を押してください。');
        lines.push('完了登録後、納品書の保存を続行します。');
        lines.push('');
        lines.push('まだ完了していない場合は［キャンセル］を押してください。');

        return lines.join('\n');
    };

    const buildPartialFailureMessage = (succeeded, failed) => {
        const lines = [
            '完了登録の途中で失敗したため、納品書は保存しません。',
            '成功した商品は完了のままです。工程は戻していません。',
            '',
            '成功：' + (succeeded.length > 0 ? succeeded.join('、') : 'なし'),
            '失敗：',
        ];

        failed.forEach((item) => {
            lines.push(item.manageNo + (item.reason ? '　' + item.reason : ''));
        });

        lines.push('');
        lines.push('再度保存すると、すでに完了の商品はスキップされます。');

        return lines.join('\n');
    };

    const planDeliveryCompletion = (lookups) => {
        const evaluation = evaluateOrderLookups(lookups);

        if (evaluation.hardStop) {
            return {
                action: 'stop',
                message: buildHardStopMessage(evaluation),
                completable: [],
                evaluation,
            };
        }

        if (evaluation.completable.length > 0) {
            return {
                action: 'confirm',
                message: buildConfirmMessage(evaluation.completable),
                completable: evaluation.completable,
                evaluation,
            };
        }

        return {
            action: 'save',
            message: '',
            completable: [],
            evaluation,
        };
    };

    const applyCompletableUpdates = async (items, putRecord, api) => {
        const succeeded = [];
        const failed = [];

        for (let i = 0; i < items.length; i += 1) {
            const item = items[i];

            try {
                await api.putOrder(item, putRecord);
                const after = await api.fetchOrder(item.manageNo);

                if (!isCompletePutApplied(after, putRecord)) {
                    failed.push({
                        manageNo: item.manageNo,
                        reason: '完了内容を確認できません',
                    });
                } else {
                    succeeded.push(item.manageNo);
                }
            } catch (error) {
                failed.push({
                    manageNo: item.manageNo,
                    reason: error && error.message ? error.message : String(error),
                });
            }
        }

        return {
            succeeded,
            failed,
            save: failed.length === 0,
            message: failed.length > 0 ? buildPartialFailureMessage(succeeded, failed) : '',
        };
    };

    window.CAYANAS_CompleteRegisterEngine = {
        completableProcessValues,
        buildCompletePutRecord,
        orderFetchFields,
        buildManageNoQuery,
        classifyProcessStatus,
        toOrderSnapshot,
        collectDistinctManageNos,
        collectDistinctManageNosFromRecord,
        isCompletePutApplied,
        evaluateOrderLookups,
        planDeliveryCompletion,
        applyCompletableUpdates,
        buildHardStopMessage,
        buildConfirmMessage,
        buildPartialFailureMessage,
    };

}());
