(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * batch_history.js
     *
     * 請求締め実行履歴 App 38
     * 請求書一括作成の実行結果を記録する。
     */

    const BatchHistory = {};

    const BATCH_HISTORY_APP_ID = 38;

    const BATCH_HISTORY_FIELDS = {
        batchNo: 'batch_no',
        executedAt: 'executed_at',
        executedBy: 'executed_by',
        closingDay: 'closing_day',
        billingFrom: 'billing_from',
        billingTo: 'billing_to',
        invoiceCount: 'invoice_count',
        deliveryCount: 'delivery_count',
        totalAmount: 'total_amount',
        status: 'status',
    };

    const BATCH_STATUS_RUNNING = '処理中';
    const BATCH_STATUS_SUCCESS = '成功';
    const BATCH_STATUS_PARTIAL = '一部失敗';
    const BATCH_STATUS_FAILED = '失敗';

    const kintoneApi = (path, method, body) => new Promise((resolve, reject) => {
        kintone.api(path, method, body, resolve, reject);
    });

    const escapeQueryValue = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const pad2 = (value) => String(value).padStart(2, '0');

    const pad3 = (value) => String(value).padStart(3, '0');

    const formatDateTime = (date = new Date()) => {

        const year = date.getFullYear();
        const month = pad2(date.getMonth() + 1);
        const day = pad2(date.getDate());
        const hour = pad2(date.getHours());
        const minute = pad2(date.getMinutes());
        const second = pad2(date.getSeconds());

        return `${year}-${month}-${day}T${hour}:${minute}:${second}`;

    };

    const formatBatchNoPrefix = (date = new Date()) => {

        const year = String(date.getFullYear()).slice(-2);
        const month = pad2(date.getMonth() + 1);
        const day = pad2(date.getDate());

        return `${year}${month}${day}`;

    };

    const parseBatchNoSequence = (batchNo, prefix) => {

        const normalized = String(batchNo ?? '').trim();
        const pattern = new RegExp(`^${prefix}-(\\d{3})$`);
        const match = normalized.match(pattern);

        if (!match) {
            return 0;
        }

        return Number(match[1]);

    };

    BatchHistory.getExecutorName = () => {

        try {

            if (typeof kintone === 'undefined' || typeof kintone.getLoginUser !== 'function') {
                return '';
            }

            const user = kintone.getLoginUser();

            return String(user?.name || user?.code || '').trim();

        } catch (error) {

            return '';

        }

    };

    BatchHistory.generateBatchNo = async () => {

        const prefix = formatBatchNoPrefix();
        const query = [
            `${BATCH_HISTORY_FIELDS.batchNo} like "${escapeQueryValue(prefix)}-%"`,
            `order by ${BATCH_HISTORY_FIELDS.batchNo} desc`,
            'limit 500',
        ].join(' ');

        const response = await kintoneApi(
            kintone.api.url('/k/v1/records', true),
            'GET',
            {
                app: BATCH_HISTORY_APP_ID,
                query,
                fields: [BATCH_HISTORY_FIELDS.batchNo],
            }
        );

        let maxSequence = 0;

        response.records.forEach((record) => {

            const batchNo = record[BATCH_HISTORY_FIELDS.batchNo]?.value;
            const sequence = parseBatchNoSequence(batchNo, prefix);

            if (sequence > maxSequence) {
                maxSequence = sequence;
            }

        });

        return `${prefix}-${pad3(maxSequence + 1)}`;

    };

    BatchHistory.determineStatus = (createdCount, errorCount) => {

        if (createdCount > 0 && errorCount === 0) {
            return BATCH_STATUS_SUCCESS;
        }

        if (createdCount > 0 && errorCount > 0) {
            return BATCH_STATUS_PARTIAL;
        }

        return BATCH_STATUS_FAILED;

    };

    /**
     * 一括作成開始時に履歴レコードを作成する
     */
    BatchHistory.start = async ({
        closingDay,
        billingFrom,
        billingTo,
        executedBy,
    }) => {

        const batchNo = await BatchHistory.generateBatchNo();
        const executedAt = formatDateTime();

        const response = await kintoneApi(
            kintone.api.url('/k/v1/record', true),
            'POST',
            {
                app: BATCH_HISTORY_APP_ID,
                record: {
                    [BATCH_HISTORY_FIELDS.batchNo]: { value: batchNo },
                    [BATCH_HISTORY_FIELDS.executedAt]: { value: executedAt },
                    [BATCH_HISTORY_FIELDS.executedBy]: { value: executedBy || BatchHistory.getExecutorName() },
                    [BATCH_HISTORY_FIELDS.closingDay]: { value: closingDay },
                    [BATCH_HISTORY_FIELDS.billingFrom]: { value: billingFrom },
                    [BATCH_HISTORY_FIELDS.billingTo]: { value: billingTo },
                    [BATCH_HISTORY_FIELDS.invoiceCount]: { value: 0 },
                    [BATCH_HISTORY_FIELDS.deliveryCount]: { value: 0 },
                    [BATCH_HISTORY_FIELDS.totalAmount]: { value: 0 },
                    [BATCH_HISTORY_FIELDS.status]: { value: BATCH_STATUS_RUNNING },
                },
            }
        );

        return {
            recordId: response.id,
            batchNo,
            executedAt,
        };

    };

    /**
     * 一括作成完了時に履歴を更新する
     */
    BatchHistory.complete = async (recordId, {
        invoiceCount,
        deliveryCount,
        totalAmount,
        status,
    }) => {

        await kintoneApi(
            kintone.api.url('/k/v1/record', true),
            'PUT',
            {
                app: BATCH_HISTORY_APP_ID,
                id: recordId,
                record: {
                    [BATCH_HISTORY_FIELDS.invoiceCount]: { value: invoiceCount },
                    [BATCH_HISTORY_FIELDS.deliveryCount]: { value: deliveryCount },
                    [BATCH_HISTORY_FIELDS.totalAmount]: { value: totalAmount },
                    [BATCH_HISTORY_FIELDS.status]: { value: status },
                },
            }
        );

    };

    BatchHistory.fail = async (recordId, {
        invoiceCount = 0,
        deliveryCount = 0,
        totalAmount = 0,
    } = {}) => BatchHistory.complete(recordId, {
        invoiceCount,
        deliveryCount,
        totalAmount,
        status: BATCH_STATUS_FAILED,
    });

    BatchHistory.fetchRecent = async (limit = 20) => {

        const query = [
            `order by ${BATCH_HISTORY_FIELDS.executedAt} desc`,
            `limit ${limit}`,
        ].join(' ');

        const response = await kintoneApi(
            kintone.api.url('/k/v1/records', true),
            'GET',
            {
                app: BATCH_HISTORY_APP_ID,
                query,
            }
        );

        return response.records.map((record) => ({
            record_id: record.$id?.value,
            batch_no: record[BATCH_HISTORY_FIELDS.batchNo]?.value ?? '',
            executed_at: record[BATCH_HISTORY_FIELDS.executedAt]?.value ?? '',
            executed_by: record[BATCH_HISTORY_FIELDS.executedBy]?.value ?? '',
            closing_day: record[BATCH_HISTORY_FIELDS.closingDay]?.value ?? '',
            billing_from: record[BATCH_HISTORY_FIELDS.billingFrom]?.value ?? '',
            billing_to: record[BATCH_HISTORY_FIELDS.billingTo]?.value ?? '',
            invoice_count: Number(record[BATCH_HISTORY_FIELDS.invoiceCount]?.value ?? 0),
            delivery_count: Number(record[BATCH_HISTORY_FIELDS.deliveryCount]?.value ?? 0),
            total_amount: Number(record[BATCH_HISTORY_FIELDS.totalAmount]?.value ?? 0),
            status: record[BATCH_HISTORY_FIELDS.status]?.value ?? '',
        }));

    };

    BatchHistory.getBatchHistoryAppId = () => BATCH_HISTORY_APP_ID;

    BatchHistory.BATCH_HISTORY_FIELDS = BATCH_HISTORY_FIELDS;

    BatchHistory.BATCH_STATUS_SUCCESS = BATCH_STATUS_SUCCESS;

    BatchHistory.BATCH_STATUS_PARTIAL = BATCH_STATUS_PARTIAL;

    BatchHistory.BATCH_STATUS_FAILED = BATCH_STATUS_FAILED;

    window.BatchHistory = BatchHistory;

})();
