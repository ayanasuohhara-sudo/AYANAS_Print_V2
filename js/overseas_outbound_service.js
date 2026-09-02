(() => {
    'use strict';

    /**
     * AYANAS Print V3
     * overseas_outbound_service.js
     *
     * 海外外注（App 28）出庫明細表のデータ取得。
     * 入庫済み判定は overseas_in_date（入庫日）が入力済みかどうかで行う。
     */

    const OverseasOutbound = {};

    const OVERSEAS_APP_ID = 28;
    const ORDER_APP_ID = 16;

    const FIELDS = {
        shipDate: 'ship_date',
        manageNo: 'manage_no',
        customerCode: 'customer_code',
        clientName: 'client_name',
        kimonoType: 'kimono_type',
        kimonoSpec: 'kimono_spec',
        deadline: 'deadline',
        overseasInDate: 'overseas_in_date',
        scheduledArrivalDate: 'scheduled_arrival_date',
        cartonNo: 'carton_no',
    };

    const RECORDS_LIMIT = 500;
    const MAX_OFFSET = 10000;
    const SHIP_DATE_MIN = '2000-01-01';
    const ORDER_LOOKUP_CHUNK_SIZE = 100;

    const escapeQueryValue = (value) => String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

    const normalizeDateValue = (value) => {

        const text = String(value ?? '').trim();

        if (!text) {
            return '';
        }

        if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
            return text.slice(0, 10);
        }

        if (/^\d{4}\/\d{2}\/\d{2}/.test(text)) {
            return text.slice(0, 10).replace(/\//g, '-');
        }

        return text;

    };

    const addDaysToDateString = (dateString, days) => {

        const parts = String(dateString ?? '').split('-').map(Number);

        if (parts.length !== 3 || parts.some(Number.isNaN)) {
            return dateString;
        }

        const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + days));

        return date.toISOString().slice(0, 10);

    };

    const getFieldValue = (record, fieldCode) => {

        const field = record?.[fieldCode];

        if (!field || field.value === null || field.value === undefined) {
            return '';
        }

        return field.value;

    };

    const getShipDate = (record) => normalizeDateValue(getFieldValue(record, FIELDS.shipDate));

    const isUnreceivedRecord = (record) => {
        return normalizeDateValue(getFieldValue(record, FIELDS.overseasInDate)) === '';
    };

    const hasShipDate = (record) => getShipDate(record) !== '';

    const kintoneApi = (path, method, body) => new Promise((resolve, reject) => {
        kintone.api(path, method, body, resolve, reject);
    });

    const fetchRecordsPage = async (query, offset = 0) => kintoneApi(
        kintone.api.url('/k/v1/records', true),
        'GET',
        {
            app: OVERSEAS_APP_ID,
            query: `${query} limit ${RECORDS_LIMIT} offset ${offset}`,
        }
    );

    const fetchAllRecords = async (query) => {

        const allRecords = [];
        let offset = 0;

        while (offset <= MAX_OFFSET) {

            const response = await fetchRecordsPage(query, offset);
            const records = Array.isArray(response.records) ? response.records : [];

            allRecords.push(...records);

            if (records.length < RECORDS_LIMIT) {
                break;
            }

            offset += RECORDS_LIMIT;

        }

        return allRecords;

    };

    const isQueryError = (error) => {

        if (!error || typeof error !== 'object') {
            return false;
        }

        return error.code === 'CB_IL02'
            || error.code === 'GAIA_IQ03'
            || error.code === 'GAIA_IQ04'
            || error.code === 'GAIA_AP01'
            || String(error.message ?? '').includes('query')
            || String(error.message ?? '').includes('フィールド');

    };

    const filterUnreceivedRecords = (records, shipDateFilter = null) => records.filter((record) => {

        if (!isUnreceivedRecord(record) || !hasShipDate(record)) {
            return false;
        }

        if (shipDateFilter === null) {
            return true;
        }

        return getShipDate(record) === shipDateFilter;

    });

    const dedupeRecordsById = (records) => {

        const recordMap = new Map();

        records.forEach((record) => {

            const recordId = String(record?.$id?.value ?? '');

            if (!recordId) {
                return;
            }

            recordMap.set(recordId, record);

        });

        return Array.from(recordMap.values());

    };

    const fetchRecordsWithFallback = async (queryCandidates, shipDateFilter = null) => {

        let lastError = null;
        let bestRecords = [];

        for (let index = 0; index < queryCandidates.length; index += 1) {

            try {

                const records = await fetchAllRecords(queryCandidates[index]);
                const filteredRecords = filterUnreceivedRecords(records, shipDateFilter);

                if (filteredRecords.length > bestRecords.length) {
                    bestRecords = filteredRecords;
                }

                const isCatchAllQuery = index === queryCandidates.length - 1;

                if (!isCatchAllQuery && filteredRecords.length > 0) {
                    return filteredRecords;
                }

            } catch (error) {

                lastError = error;

                if (!isQueryError(error)) {
                    throw error;
                }

            }

        }

        if (bestRecords.length > 0) {
            return bestRecords;
        }

        if (lastError) {
            throw lastError;
        }

        return [];

    };

    const buildShipDateRangeCondition = (shipDate) => {

        const nextDay = addDaysToDateString(shipDate, 1);

        return `${FIELDS.shipDate} >= "${escapeQueryValue(shipDate)}" and ${FIELDS.shipDate} < "${escapeQueryValue(nextDay)}"`;

    };

    const buildShipDateListQueries = () => [
        `${FIELDS.shipDate} >= "${SHIP_DATE_MIN}" order by $id desc`,
        'order by $id desc',
    ];

    const buildShipDateDetailQueries = (shipDate) => {

        const rangeCondition = buildShipDateRangeCondition(shipDate);
        const exactCondition = `${FIELDS.shipDate} = "${escapeQueryValue(shipDate)}"`;

        return [
            `${rangeCondition} order by $id desc`,
            `${exactCondition} order by $id desc`,
            'order by $id desc',
        ];

    };

    const getManageNo = (record, subtableRow = null) => {

        if (subtableRow?.value?.[FIELDS.manageNo]) {
            const subtableManageNo = String(subtableRow.value[FIELDS.manageNo].value ?? '').trim();

            if (subtableManageNo !== '') {
                return subtableManageNo;
            }

        }

        return String(
            getFieldValue(record, FIELDS.manageNo)
            || getFieldValue(record, 'overseas_manage_no')
            || ''
        ).trim();

    };

    const getSubtableFieldValue = (subtableRow, fieldCode) => {

        if (!subtableRow?.value?.[fieldCode]) {
            return '';
        }

        return String(subtableRow.value[fieldCode].value ?? '').trim();

    };

    const getOrderFieldValue = (orderRecord, fieldCodes) => {

        const codes = Array.isArray(fieldCodes) ? fieldCodes : [fieldCodes];

        for (let index = 0; index < codes.length; index += 1) {
            const value = String(getFieldValue(orderRecord, codes[index]) ?? '').trim();

            if (value !== '') {
                return value;
            }

        }

        return '';

    };

    const getDetailFieldValue = (record, orderRecord, fieldCode, subtableRow = null) => {

        const subtableValue = getSubtableFieldValue(subtableRow, fieldCode);

        if (subtableValue !== '') {
            return subtableValue;
        }

        if (fieldCode === FIELDS.clientName && subtableRow) {
            const subtableCustomerName = getSubtableFieldValue(subtableRow, 'customer_name');

            if (subtableCustomerName !== '') {
                return subtableCustomerName;
            }

        }

        const localValue = String(getFieldValue(record, fieldCode) ?? '').trim();

        if (localValue !== '') {
            return localValue;
        }

        if (fieldCode === FIELDS.clientName) {
            const localCustomerName = String(getFieldValue(record, 'customer_name') ?? '').trim();

            if (localCustomerName !== '') {
                return localCustomerName;
            }

        }

        if (!orderRecord) {
            return '';
        }

        if (fieldCode === FIELDS.clientName) {
            return getOrderFieldValue(orderRecord, ['customer_name', FIELDS.clientName]);
        }

        return String(getFieldValue(orderRecord, fieldCode) ?? '').trim();

    };

    const flattenOutboundRecords = (records) => {

        const flattened = [];

        records.forEach((record) => {

            const subtableRows = record?.overseas_details?.value;

            if (Array.isArray(subtableRows) && subtableRows.length > 0) {

                subtableRows.forEach((subtableRow) => {
                    flattened.push({
                        record,
                        subtableRow,
                    });
                });

                return;

            }

            flattened.push({
                record,
                subtableRow: null,
            });

        });

        return flattened;

    };

    const fetchOrderRecordsPage = async (query, offset = 0) => kintoneApi(
        kintone.api.url('/k/v1/records', true),
        'GET',
        {
            app: ORDER_APP_ID,
            query: `${query} limit ${RECORDS_LIMIT} offset ${offset}`,
        }
    );

    const fetchOrderMapByManageNos = async (manageNos) => {

        const orderMap = new Map();
        const uniqueManageNos = [...new Set(
            manageNos
                .map((manageNo) => String(manageNo ?? '').trim())
                .filter((manageNo) => manageNo !== '')
        )];

        for (let index = 0; index < uniqueManageNos.length; index += ORDER_LOOKUP_CHUNK_SIZE) {

            const chunk = uniqueManageNos.slice(index, index + ORDER_LOOKUP_CHUNK_SIZE);
            const inValues = chunk
                .map((manageNo) => `"${escapeQueryValue(manageNo)}"`)
                .join(', ');
            const query = `${FIELDS.manageNo} in (${inValues}) order by $id desc`;
            const response = await fetchOrderRecordsPage(query);

            (response.records ?? []).forEach((orderRecord) => {

                const manageNo = String(getFieldValue(orderRecord, FIELDS.manageNo) ?? '').trim();

                if (manageNo !== '' && !orderMap.has(manageNo)) {
                    orderMap.set(manageNo, orderRecord);
                }

            });

        }

        return orderMap;

    };

    const buildDetailRow = (record, orderRecord = null, subtableRow = null) => {

        const manageNo = getManageNo(record, subtableRow);

        return {
            manage_no: manageNo,
            customer_code: getDetailFieldValue(record, orderRecord, FIELDS.customerCode, subtableRow),
            client_name: getDetailFieldValue(record, orderRecord, FIELDS.clientName, subtableRow),
            kimono_type: getDetailFieldValue(record, orderRecord, FIELDS.kimonoType, subtableRow),
            kimono_spec: getDetailFieldValue(record, orderRecord, FIELDS.kimonoSpec, subtableRow),
            deadline: normalizeDateValue(
                getDetailFieldValue(record, orderRecord, FIELDS.deadline, subtableRow)
            ),
        };

    };

    const compareManageNo = (left, right) => String(left.manage_no ?? '')
        .localeCompare(String(right.manage_no ?? ''), 'ja', { numeric: true });

    const groupRecordsByShipDate = (records) => {

        const counts = new Map();

        records.forEach((record) => {

            const shipDate = getShipDate(record);

            if (!shipDate) {
                return;
            }

            counts.set(shipDate, (counts.get(shipDate) ?? 0) + 1);

        });

        return Array.from(counts.entries())
            .map(([shipDate, count]) => ({
                shipDate,
                count,
            }))
            .sort((left, right) => right.shipDate.localeCompare(left.shipDate));

    };

    const filterRecordsByShipDate = (records, shipDateFilter) => records.filter((record) => {
        return hasShipDate(record) && getShipDate(record) === shipDateFilter;
    });

    const fetchAllRecordsWithFallback = async (queryCandidates, shipDateFilter = null) => {

        let lastError = null;
        let bestRecords = [];

        for (let index = 0; index < queryCandidates.length; index += 1) {

            try {

                const records = await fetchAllRecords(queryCandidates[index]);
                const filteredRecords = shipDateFilter === null
                    ? records.filter(hasShipDate)
                    : filterRecordsByShipDate(records, shipDateFilter);

                if (filteredRecords.length > bestRecords.length) {
                    bestRecords = filteredRecords;
                }

                const isCatchAllQuery = index === queryCandidates.length - 1;

                if (!isCatchAllQuery && filteredRecords.length > 0) {
                    return filteredRecords;
                }

            } catch (error) {

                lastError = error;

                if (!isQueryError(error)) {
                    throw error;
                }

            }

        }

        if (bestRecords.length > 0) {
            return bestRecords;
        }

        if (lastError) {
            throw lastError;
        }

        return [];

    };

    const buildOutboundSheetQueries = (shipDate) => {

        const rangeCondition = buildShipDateRangeCondition(shipDate);
        const exactCondition = `${FIELDS.shipDate} = "${escapeQueryValue(shipDate)}"`;

        return [
            `${rangeCondition} order by $id asc`,
            `${exactCondition} order by $id asc`,
            'order by $id asc',
        ];

    };

    const buildAllShipDateListQueries = () => [
        `${FIELDS.shipDate} >= "${SHIP_DATE_MIN}" order by $id desc`,
        'order by $id desc',
    ];

    const getRecordId = (record) => {

        const recordId = Number(record?.$id?.value ?? 0);

        return Number.isNaN(recordId) ? 0 : recordId;

    };

    const buildOutboundSheetRow = (record, orderRecord = null, subtableRow = null) => {

        const manageNo = getManageNo(record, subtableRow);

        return {
            record_id: getRecordId(record),
            carton_no: getDetailFieldValue(record, orderRecord, FIELDS.cartonNo, subtableRow),
            manage_no: manageNo,
            customer_code: getDetailFieldValue(record, orderRecord, FIELDS.customerCode, subtableRow),
            client_name: getDetailFieldValue(record, orderRecord, FIELDS.clientName, subtableRow),
            kimono_type: getDetailFieldValue(record, orderRecord, FIELDS.kimonoType, subtableRow),
            kimono_spec: getDetailFieldValue(record, orderRecord, FIELDS.kimonoSpec, subtableRow),
            scheduled_arrival_date: normalizeDateValue(
                getDetailFieldValue(record, orderRecord, FIELDS.scheduledArrivalDate, subtableRow)
            ),
            deadline: normalizeDateValue(
                getDetailFieldValue(record, orderRecord, FIELDS.deadline, subtableRow)
            ),
        };

    };

    const compareCartonThenRecordId = (left, right) => {

        const cartonCompare = String(left.carton_no ?? '')
            .localeCompare(String(right.carton_no ?? ''), 'ja', { numeric: true });

        if (cartonCompare !== 0) {
            return cartonCompare;
        }

        return (left.record_id ?? 0) - (right.record_id ?? 0);

    };

    const buildCartonSummary = (details) => {

        const counts = new Map();

        details.forEach((detail) => {

            const cartonNo = String(detail.carton_no ?? '').trim() || '（未設定）';

            counts.set(cartonNo, (counts.get(cartonNo) ?? 0) + 1);

        });

        return Array.from(counts.entries())
            .map(([cartonNo, count]) => ({
                carton_no: cartonNo,
                count,
            }))
            .sort((left, right) => String(left.carton_no)
                .localeCompare(String(right.carton_no), 'ja', { numeric: true }));

    };

    const SHEET_VARIANTS = {
        katsuya: {
            title: '海外外注 出庫明細表（勝矢和裁用）',
            includeDeadline: false,
        },
        internal: {
            title: '海外外注 出庫明細表（社内保管用）',
            includeDeadline: true,
        },
    };

    /**
     * 未入庫品が存在する出庫日一覧を取得する
     * @returns {Promise<Array<{shipDate: string, count: number}>>}
     */
    OverseasOutbound.fetchShipDateList = async () => {

        const records = await fetchRecordsWithFallback(buildShipDateListQueries());

        return groupRecordsByShipDate(records);

    };

    /**
     * 出庫実績の出庫日一覧を取得する
     * @returns {Promise<Array<{shipDate: string, count: number}>>}
     */
    OverseasOutbound.fetchOutboundShipDateList = async () => {

        const records = await fetchAllRecordsWithFallback(buildAllShipDateListQueries());

        return groupRecordsByShipDate(records);

    };

    /**
     * 指定出庫日の出庫表データを取得する
     * @param {string} shipDate
     * @param {'katsuya'|'internal'} variant
     * @returns {Promise<Object>}
     */
    OverseasOutbound.fetchOutboundSheetDataByShipDate = async (shipDate, variant = 'katsuya') => {

        const normalizedDate = normalizeDateValue(shipDate);
        const sheetVariant = SHEET_VARIANTS[variant] ?? SHEET_VARIANTS.katsuya;

        if (!normalizedDate) {
            throw new Error('出庫日が指定されていません。');
        }

        const records = dedupeRecordsById(
            await fetchAllRecordsWithFallback(
                buildOutboundSheetQueries(normalizedDate),
                normalizedDate
            )
        );
        const flattenedRecords = flattenOutboundRecords(records);
        const manageNos = flattenedRecords.map((item) => getManageNo(item.record, item.subtableRow));
        const orderMap = await fetchOrderMapByManageNos(manageNos);
        const details = flattenedRecords
            .map((item) => buildOutboundSheetRow(
                item.record,
                orderMap.get(getManageNo(item.record, item.subtableRow)),
                item.subtableRow
            ))
            .filter((detail) => detail.manage_no !== '')
            .sort(compareCartonThenRecordId);

        return {
            header: {
                ship_date: normalizedDate,
                total_count: details.length,
                sheet_variant: variant,
                sheet_title: sheetVariant.title,
                include_deadline: sheetVariant.includeDeadline,
                carton_summary: buildCartonSummary(details),
            },
            details,
            summary: {
                totalCount: details.length,
            },
        };

    };

    /**
     * 指定出庫日の未入庫明細を取得する
     * @param {string} shipDate - YYYY-MM-DD
     * @returns {Promise<Object>} 帳票データ
     */
    OverseasOutbound.fetchReportDataByShipDate = async (shipDate) => {

        const normalizedDate = normalizeDateValue(shipDate);

        if (!normalizedDate) {
            throw new Error('出庫日が指定されていません。');
        }

        const records = dedupeRecordsById(
            await fetchRecordsWithFallback(
                buildShipDateDetailQueries(normalizedDate),
                normalizedDate
            )
        );
        const flattenedRecords = flattenOutboundRecords(records);
        const manageNos = flattenedRecords.map((item) => getManageNo(item.record, item.subtableRow));
        const orderMap = await fetchOrderMapByManageNos(manageNos);
        const details = flattenedRecords
            .map((item) => buildDetailRow(
                item.record,
                orderMap.get(getManageNo(item.record, item.subtableRow)),
                item.subtableRow
            ))
            .filter((detail) => detail.manage_no !== '')
            .sort(compareManageNo);

        return {
            header: {
                ship_date: normalizedDate,
                unreceived_count: details.length,
            },
            details,
            summary: {
                totalCount: details.length,
            },
        };

    };

    OverseasOutbound.APP_ID = OVERSEAS_APP_ID;
    OverseasOutbound.FIELDS = FIELDS;

    window.OverseasOutbound = OverseasOutbound;

})();
