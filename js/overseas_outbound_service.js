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

    const SERVICE_VERSION = '7';

    const FIELDS = {
        shipDate: 'ship_date',
        manageNo: 'manage_no',
        customerCode: 'customer_code',
        clientName: 'client_name',
        customerName: 'customer_name',
        slipNo: 'slip_no',
        inCharge: 'in_charge',
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

    const INSPECT_NAME_FIELDS = [
        FIELDS.manageNo,
        FIELDS.clientName,
        FIELDS.customerName,
        FIELDS.slipNo,
        FIELDS.inCharge,
        FIELDS.customerCode,
        FIELDS.kimonoType,
    ];

    const expandManageNoCandidates = (manageNo) => {

        const normalized = String(manageNo ?? '').trim();

        if (normalized === '') {
            return [];
        }

        const candidates = [normalized];
        const withoutLeadingZeros = normalized.replace(/^0+(?=\d)/, '');

        if (withoutLeadingZeros !== '' && withoutLeadingZeros !== normalized) {
            candidates.push(withoutLeadingZeros);
        }

        if (/^\d+$/.test(normalized)) {
            const padded9 = normalized.padStart(9, '0');

            if (padded9 !== normalized && !candidates.includes(padded9)) {
                candidates.push(padded9);
            }
        }

        return candidates;

    };

    const pickNameFields = (record) => {

        const picked = {};

        INSPECT_NAME_FIELDS.forEach((fieldCode) => {
            picked[fieldCode] = String(getFieldValue(record, fieldCode) ?? '').trim();
        });

        return picked;

    };

    const registerOrderInMap = (orderMap, orderRecord) => {

        const manageNo = String(getFieldValue(orderRecord, FIELDS.manageNo) ?? '').trim();

        if (manageNo === '') {
            return;
        }

        expandManageNoCandidates(manageNo).forEach((candidate) => {

            if (!orderMap.has(candidate)) {
                orderMap.set(candidate, orderRecord);
            }

        });

    };

    const fetchRecordsByQuery = async (appId, query, limit = 20) => {

        const response = await kintoneApi(
            kintone.api.url('/k/v1/records', true),
            'GET',
            {
                app: appId,
                query: `${query} limit ${limit}`,
            }
        );

        return Array.isArray(response.records) ? response.records : [];

    };

    const recordMatchesManageNo = (record, manageNo) => {

        const candidates = new Set(expandManageNoCandidates(manageNo));
        const topLevelValues = [
            String(getFieldValue(record, FIELDS.manageNo) ?? '').trim(),
            String(getFieldValue(record, 'overseas_manage_no') ?? '').trim(),
        ];

        if (topLevelValues.some((value) => value !== '' && candidates.has(value))) {
            return true;
        }

        const subtableRows = record?.overseas_details?.value;

        if (!Array.isArray(subtableRows)) {
            return false;
        }

        return subtableRows.some((subtableRow) => {
            const subtableManageNo = getSubtableFieldValue(subtableRow, FIELDS.manageNo);
            return subtableManageNo !== '' && candidates.has(subtableManageNo);
        });

    };

    const fetchOutboundRecordsByScan = async (manageNo) => {

        const found = [];
        const seenIds = new Set();
        let offset = 0;

        while (offset <= MAX_OFFSET) {

            const response = await fetchRecordsPage('order by $id desc', offset);
            const records = Array.isArray(response.records) ? response.records : [];

            records.forEach((record) => {

                if (!recordMatchesManageNo(record, manageNo)) {
                    return;
                }

                const recordId = String(record?.$id?.value ?? '');

                if (recordId !== '' && !seenIds.has(recordId)) {
                    seenIds.add(recordId);
                    found.push(record);
                }

            });

            if (records.length < RECORDS_LIMIT) {
                break;
            }

            offset += RECORDS_LIMIT;

        }

        return found;

    };

    const fetchOrderRecordDirect = async (manageNo) => {

        const candidates = expandManageNoCandidates(manageNo);

        for (let index = 0; index < candidates.length; index += 1) {
            const candidate = candidates[index];
            const records = await fetchRecordsByQuery(
                ORDER_APP_ID,
                `${FIELDS.manageNo} = "${escapeQueryValue(candidate)}" order by $id desc`
            );

            if (records.length > 0) {
                return records[0];
            }

        }

        return null;

    };

    const fetchOutboundRecordsDirect = async (manageNo) => {

        const candidates = expandManageNoCandidates(manageNo);
        const found = [];
        const seenIds = new Set();

        const addRecords = (records) => {

            records.forEach((record) => {

                const recordId = String(record?.$id?.value ?? '');

                if (recordId !== '' && !seenIds.has(recordId)) {
                    seenIds.add(recordId);
                    found.push(record);
                }

            });

        };

        // App 28 の manage_no は overseas_details サブテーブル内のため = クエリ不可。
        // トップレベルの overseas_manage_no のみ試し、なければサブテーブル走査する。
        for (let index = 0; index < candidates.length; index += 1) {
            const candidate = candidates[index];

            try {

                const records = await fetchRecordsByQuery(
                    OVERSEAS_APP_ID,
                    `overseas_manage_no = "${escapeQueryValue(candidate)}" order by $id desc`
                );

                addRecords(records);

            } catch (error) {

                if (!isQueryError(error)) {
                    throw error;
                }

            }

        }

        if (found.length === 0) {
            addRecords(await fetchOutboundRecordsByScan(manageNo));
        }

        return found;

    };

    const extractOutboundNameSources = (record) => {

        const sources = {
            top: pickNameFields(record),
            subtable: [],
        };

        const subtableRows = record?.overseas_details?.value;

        if (!Array.isArray(subtableRows)) {
            return sources;
        }

        subtableRows.forEach((subtableRow) => {

            const rowValues = {
                manage_no: getSubtableFieldValue(subtableRow, FIELDS.manageNo),
            };

            INSPECT_NAME_FIELDS.forEach((fieldCode) => {

                if (fieldCode === FIELDS.manageNo) {
                    return;
                }

                rowValues[fieldCode] = getSubtableFieldValue(subtableRow, fieldCode);

            });

            sources.subtable.push(rowValues);

        });

        return sources;

    };

    const getManageNoCandidates = (record, subtableRow = null) => {

        const candidates = [];

        const appendCandidate = (value) => {

            expandManageNoCandidates(value).forEach((candidate) => {

                if (candidate !== '' && !candidates.includes(candidate)) {
                    candidates.push(candidate);
                }

            });

        };

        appendCandidate(getSubtableFieldValue(subtableRow, FIELDS.manageNo));
        appendCandidate(getFieldValue(record, FIELDS.manageNo));
        appendCandidate(getFieldValue(record, 'overseas_manage_no'));

        return candidates;

    };

    const getManageNo = (record, subtableRow = null) => {

        const candidates = getManageNoCandidates(record, subtableRow);

        return candidates.length > 0 ? candidates[0] : '';

    };

    const resolveOrderRecord = async (record, subtableRow, orderMap) => {

        const candidates = getManageNoCandidates(record, subtableRow);

        for (let index = 0; index < candidates.length; index += 1) {
            const orderRecord = orderMap.get(candidates[index]);

            if (orderRecord) {
                return orderRecord;
            }

        }

        for (let index = 0; index < candidates.length; index += 1) {
            const orderRecord = await fetchOrderRecordDirect(candidates[index]);

            if (orderRecord) {
                registerOrderInMap(orderMap, orderRecord);
                return orderRecord;
            }

        }

        return null;

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

    const getClientName = (record, orderRecord, subtableRow = null) => {

        if (!orderRecord) {
            return '';
        }

        const clientName = String(getFieldValue(orderRecord, FIELDS.clientName) ?? '').trim();

        if (clientName === '') {
            return '';
        }

        const orderCustomerName = String(
            getFieldValue(orderRecord, FIELDS.customerName) ?? ''
        ).trim();
        const orderSlipNo = String(getFieldValue(orderRecord, FIELDS.slipNo) ?? '').trim();
        const orderInCharge = String(getFieldValue(orderRecord, FIELDS.inCharge) ?? '').trim();

        if (orderSlipNo !== '' && clientName === orderSlipNo) {
            return '';
        }

        if (orderInCharge !== '' && clientName === orderInCharge) {
            return '';
        }

        if (orderCustomerName !== '' && clientName === orderCustomerName) {
            return '';
        }

        return clientName;

    };

    const getDetailFieldValue = (record, orderRecord, fieldCode, subtableRow = null) => {

        const subtableValue = getSubtableFieldValue(subtableRow, fieldCode);

        if (subtableValue !== '') {
            return subtableValue;
        }

        const localValue = String(getFieldValue(record, fieldCode) ?? '').trim();

        if (localValue !== '') {
            return localValue;
        }

        if (!orderRecord) {
            return '';
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
                .flatMap((manageNo) => expandManageNoCandidates(manageNo))
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
                registerOrderInMap(orderMap, orderRecord);
            });

        }

        return orderMap;

    };

    const buildDetailRow = (record, orderRecord = null, subtableRow = null) => {

        const manageNo = getManageNo(record, subtableRow);

        return {
            manage_no: manageNo,
            customer_code: getDetailFieldValue(record, orderRecord, FIELDS.customerCode, subtableRow),
            client_name: getClientName(record, orderRecord, subtableRow),
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
            client_name: getClientName(record, orderRecord, subtableRow),
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
        const manageNos = flattenedRecords.flatMap((item) => (
            getManageNoCandidates(item.record, item.subtableRow)
        ));
        const orderMap = await fetchOrderMapByManageNos(manageNos);
        const details = (await Promise.all(
            flattenedRecords.map(async (item) => {

                const orderRecord = await resolveOrderRecord(
                    item.record,
                    item.subtableRow,
                    orderMap
                );

                return buildOutboundSheetRow(
                    item.record,
                    orderRecord,
                    item.subtableRow
                );

            })
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
        const manageNos = flattenedRecords.flatMap((item) => (
            getManageNoCandidates(item.record, item.subtableRow)
        ));
        const orderMap = await fetchOrderMapByManageNos(manageNos);
        const details = (await Promise.all(
            flattenedRecords.map(async (item) => {

                const orderRecord = await resolveOrderRecord(
                    item.record,
                    item.subtableRow,
                    orderMap
                );

                return buildDetailRow(
                    item.record,
                    orderRecord,
                    item.subtableRow
                );

            })
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

    /**
     * 管理番号ごとのお客様名データを調査する（ブラウザコンソール用）
     * @param {string[]} manageNos
     * @returns {Promise<Array<Object>>}
     */
    OverseasOutbound.inspectManageNos = async (manageNos) => {

        const targets = [...new Set(
            (Array.isArray(manageNos) ? manageNos : [manageNos])
                .map((manageNo) => String(manageNo ?? '').trim())
                .filter((manageNo) => manageNo !== '')
        )];

        const orderMap = new Map();
        const results = [];

        for (let index = 0; index < targets.length; index += 1) {
            const manageNo = targets[index];
            const orderRecord = await fetchOrderRecordDirect(manageNo);

            if (orderRecord) {
                registerOrderInMap(orderMap, orderRecord);
            }

            const outboundRecords = await fetchOutboundRecordsDirect(manageNo);
            const outboundSources = outboundRecords.map((record) => ({
                record_id: String(record?.$id?.value ?? ''),
                ship_date: getShipDate(record),
                sources: extractOutboundNameSources(record),
            }));

            const flattenedRecords = outboundRecords.flatMap((record) => {

                const subtableRows = record?.overseas_details?.value;

                if (Array.isArray(subtableRows) && subtableRows.length > 0) {
                    return subtableRows.map((subtableRow) => ({
                        record,
                        subtableRow,
                    }));
                }

                return [{
                    record,
                    subtableRow: null,
                }];

            });

            const printRows = [];

            for (let rowIndex = 0; rowIndex < flattenedRecords.length; rowIndex += 1) {
                const item = flattenedRecords[rowIndex];
                const resolvedOrder = await resolveOrderRecord(
                    item.record,
                    item.subtableRow,
                    orderMap
                );

                printRows.push({
                    manage_no: getManageNo(item.record, item.subtableRow),
                    print_client_name: getClientName(
                        item.record,
                        resolvedOrder,
                        item.subtableRow
                    ),
                    order_found: resolvedOrder !== null,
                    app28_top: pickNameFields(item.record),
                    app28_subtable: item.subtableRow
                        ? INSPECT_NAME_FIELDS.reduce((rowValues, fieldCode) => {
                            rowValues[fieldCode] = getSubtableFieldValue(
                                item.subtableRow,
                                fieldCode
                            );
                            return rowValues;
                        }, {})
                        : null,
                });

            }

            if (printRows.length === 0 && orderRecord) {
                printRows.push({
                    manage_no: manageNo,
                    print_client_name: getClientName(null, orderRecord, null),
                    order_found: true,
                    app28_top: null,
                    app28_subtable: null,
                    note: 'App28レコードはサブテーブル走査でも未検出',
                });
            }

            results.push({
                manage_no: manageNo,
                order: orderRecord ? pickNameFields(orderRecord) : null,
                outbound_records: outboundSources,
                print_rows: printRows,
            });

        }

        return results;

    };

    OverseasOutbound.APP_ID = OVERSEAS_APP_ID;
    OverseasOutbound.FIELDS = FIELDS;
    OverseasOutbound.SERVICE_VERSION = SERVICE_VERSION;

    window.OverseasOutbound = OverseasOutbound;

})();
