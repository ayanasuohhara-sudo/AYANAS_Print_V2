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

    const FIELDS = {
        shipDate: 'ship_date',
        manageNo: 'manage_no',
        customerCode: 'customer_code',
        clientName: 'client_name',
        kimonoType: 'kimono_type',
        kimonoSpec: 'kimono_spec',
        deadline: 'deadline',
        overseasInDate: 'overseas_in_date',
    };

    const FETCH_FIELDS = [
        FIELDS.shipDate,
        FIELDS.manageNo,
        FIELDS.customerCode,
        FIELDS.clientName,
        FIELDS.kimonoType,
        FIELDS.kimonoSpec,
        FIELDS.deadline,
    ];

    const RECORDS_LIMIT = 500;

    const escapeQueryValue = (value) => String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

    const getFieldValue = (record, fieldCode) => {

        const field = record?.[fieldCode];

        if (!field || field.value === null || field.value === undefined) {
            return '';
        }

        return field.value;

    };

    const kintoneApi = (path, method, body) => new Promise((resolve, reject) => {
        kintone.api(path, method, body, resolve, reject);
    });

    const fetchRecordsPage = async (query, offset = 0) => kintoneApi(
        kintone.api.url('/k/v1/records', true),
        'GET',
        {
            app: OVERSEAS_APP_ID,
            query: `${query} limit ${RECORDS_LIMIT} offset ${offset}`,
            fields: FETCH_FIELDS,
        }
    );

    const fetchAllRecords = async (query) => {

        const allRecords = [];
        let offset = 0;

        while (true) {

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

    const buildDetailRow = (record) => ({
        manage_no: String(getFieldValue(record, FIELDS.manageNo) ?? '').trim(),
        customer_code: String(getFieldValue(record, FIELDS.customerCode) ?? '').trim(),
        client_name: String(getFieldValue(record, FIELDS.clientName) ?? '').trim(),
        kimono_type: String(getFieldValue(record, FIELDS.kimonoType) ?? '').trim(),
        kimono_spec: String(getFieldValue(record, FIELDS.kimonoSpec) ?? '').trim(),
        deadline: String(getFieldValue(record, FIELDS.deadline) ?? '').trim(),
    });

    const compareManageNo = (left, right) => String(left.manage_no ?? '')
        .localeCompare(String(right.manage_no ?? ''), 'ja', { numeric: true });

    const groupRecordsByShipDate = (records) => {

        const counts = new Map();

        records.forEach((record) => {

            const shipDate = String(getFieldValue(record, FIELDS.shipDate) ?? '').trim();

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

    /**
     * 未入庫品が存在する出庫日一覧を取得する
     * @returns {Promise<Array<{shipDate: string, count: number}>>}
     */
    OverseasOutbound.fetchShipDateList = async () => {

        const query = `${FIELDS.shipDate} != "" and ${FIELDS.overseasInDate} = "" order by ${FIELDS.shipDate} desc, ${FIELDS.manageNo} asc`;
        const records = await fetchAllRecords(query);

        return groupRecordsByShipDate(records);

    };

    /**
     * 指定出庫日の未入庫明細を取得する
     * @param {string} shipDate - YYYY-MM-DD
     * @returns {Promise<Object>} 帳票データ
     */
    OverseasOutbound.fetchReportDataByShipDate = async (shipDate) => {

        const normalizedDate = String(shipDate ?? '').trim();

        if (!normalizedDate) {
            throw new Error('出庫日が指定されていません。');
        }

        const query = `${FIELDS.shipDate} = "${escapeQueryValue(normalizedDate)}" and ${FIELDS.overseasInDate} = "" order by ${FIELDS.manageNo} asc`;
        const records = await fetchAllRecords(query);
        const details = records
            .map(buildDetailRow)
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
