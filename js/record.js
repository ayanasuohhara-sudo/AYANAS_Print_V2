(() => {
    'use strict';

    /**
     * AYANAS Print V2
     * record.js
     *
     * kintone レコードから帳票用データを取得する。
     * HTML 生成・DOM 操作・Format.js の利用は行わない。
     */

    const Record = {};

    const DELIVERY_APP_ID = 19;
    const INVOICE_APP_ID = 35;
    const OUTSOURCE_OUTBOUND_APP_ID = 27;
    const WASAI_OUTBOUND_APP_ID = 74;
    const WASAI_PAYMENT_APP_ID = 75;

    /** App75 payment_statement_lines（wasai_payment_create.js と同一コード） */
    const WASAI_PAYMENT_LINES_TABLE = 'payment_statement_lines';
    const WASAI_PAYMENT_LINE_FIELD = {
        manageNo: 'manage_no',
        inboundDate: 'inbound_date',
        kimonoType: 'kimono_type',
        kimonoSpec: 'kimono_spec',
        processingSummary: 'processing_summary',
        transactionPrice: 'transaction_price',
        paymentRate: 'payment_rate',
        basePaymentAmount: 'base_payment_amount',
        linePaymentAmount: 'line_payment_amount',
    };
    const WASAI_PAYMENT_PERIOD_FROM_CODES = ['period_fro', 'period_from'];
    const ORDER_APP_ID = 16;
    const PRODUCT_APP_ID = 13;
    const CUSTOMER_APP_ID = 8;

    const OUTSOURCE_DETAIL_TABLE_CODE = 'outsource_detail';
    const OUTSOURCE_PROCESSING_TABLE_CODE = 'processing_details_0';

    const WASAI_OUTBOUND_LINES_TABLE_CODE = 'wasai_outbound_lines';
    const WASAI_PAYMENT_SNAPSHOTS_TABLE_CODE = 'wasai_payment_item_snapshots';
    const WASAI_SHIP_DATE_FIELD_CODES = ['日ship_date', 'ship_date'];
    const WASAI_ELIGIBLE_SUBCATEGORIES = new Set(['国内仕立', '修理', '修理・直し']);
    const WASAI_REMARKS_FIELD_CODES = ['remarks', 'note', 'Notes_for_processing'];

    const CUSTOMER_ADDRESS_FIELDS = [
        'post_no',
        'prefecture',
        'city',
        'address',
        'building',
    ];

    /** 受注票（App 16）備考 — いずれかが入っていれば帳票に印刷 */
    const ORDER_REMARK_FIELD_CODES = ['remark', 'remarks'];

    /** 受注票（App 16）ヘッダーフィールド */
    const ORDER_HEADER_FIELDS = [
        'manage_no',
        'order_date',
        'deadline',
        'customer_code',
        'customer_name',
        'client_name',
        'slip_no',
        'in_charge',
        'kimono_type',
        'kimono_spec',
    ];

    /** 海外用受注表（App 16・右半分） */
    const OVERSEAS_ORDER_HEADER_FIELDS = [
        'overseas_color',
        'overseas_pattern',
        'overseas_embroidery',
        'overseas_tailoring',
        'overseas_mat_seiden',
        'overseas_weave_chirimen',
        'overseas_acc_douura',
        'overseas_mat_kasen',
        'overseas_weave_hiraori',
        'overseas_acc_eriura',
        'overseas_mat_asu',
        'overseas_weave_ayaori',
        'overseas_acc_hgake',
        'overseas_mat_wata',
        'overseas_weave_shaori',
        'overseas_acc_hiyoku',
        'overseas_weave_tsumugi',
        'overseas_acc_sefuse',
        'overseas_acc_haneri',
        'overseas_acc_erinuno',
        'overseas_acc_erishin',
        'overseas_acc_emon',
        'overseas_acc_iseshiki',
        'overseas_acc_kataura',
    ];

    /** 受注票（App 16）明細フィールド */
    const ORDER_DETAIL_FIELDS = {
        string: ['item_code', 'item_name'],
        number: ['unit_price', 'qty', 'amount'],
    };

    /** 受注票（App 16）明細テーブル */
    const ORDER_DETAIL_TABLE_CODE = 'detail_table';

    /**
     * 納品管理（App 19）フィールドマッピング
     * kintone フィールドコード → 帳票データキー
     */
    const DELIVERY_HEADER_MAP = {
        delivery_no: 'delivery_no',
        delivery_date: 'delivery_date',
        customer_name: 'customer_name',
        customer_code: 'customer_code',
    };

    /** 請求書（App 35）ヘッダーフィールド */
    const INVOICE_HEADER_FIELDS = [
        'invoice_no',
        'invoice_date',
        'closing_date',
        'billing_from',
        'billing_to',
        'customer_code',
        'customer_name',
        'due_date',
        'remarks',
        'item_count',
        'qty_total',
        'subtotal',
        'tax',
        'total',
        'carry_over',
        'invoice_amount',
        'payment_amount',
        'discount_amount',
        'adjustment_amount',
    ];

    /** 請求書（App 35）明細テーブル */
    const INVOICE_DETAIL_TABLE_CODE = 'invoice_detail';

    /** 請求書（App 35）明細フィールド */
    const INVOICE_DETAIL_FIELDS = {
        string: [
            'delivery_no',
            'delivery_date',
            'manage_no',
            'client_name',
            'kimono_type',
            'kimono_spec',
            'item_name',
            'slip_no',
            'in_charge',
        ],
        number: ['qty', 'unit_price', 'amount'],
    };

    /** 納品管理（App 19）明細テーブル */
    const DELIVERY_DETAIL_TABLE_CODE = 'delivery_detail';

    /** 納品管理（App 19）明細フィールド */
    const DELIVERY_DETAIL_FIELDS = {
        string: [
            'manage_no',
            'client_name',
            'item_name',
            'kimono_type',
            'kimono_spec',
            'slip_no',
            'in_charge',
        ],
        number: ['qty', 'unit_price', 'amount'],
    };

    const getFieldValue = (fields, fieldCode) => {

        if (!fields || typeof fields !== 'object') {
            return '';
        }

        const field = fields[fieldCode];

        if (!field || field.value === null || field.value === undefined) {
            return '';
        }

        return field.value;

    };

    const toNumber = (value) => {

        if (value === null || value === undefined || value === '') {
            return 0;
        }

        const number = Number(value);

        if (Number.isNaN(number)) {
            throw new Error(`数値に変換できません。（${value}）`);
        }

        return number;

    };

    const normalizeAppId = (appId) => {

        if (appId === null || appId === undefined || appId === '') {
            return null;
        }

        const normalized = Number(appId);

        return Number.isNaN(normalized) ? null : normalized;

    };

    const getCurrentRecord = (record) => {

        if (record && typeof record === 'object') {
            return record;
        }

        const current = kintone.app.record.get();

        if (!current || !current.record) {
            throw new Error('レコードを取得できません。');
        }

        return current.record;

    };

    const getRecordId = (record) => {

        const id = record?.$id?.value;

        if (id === null || id === undefined || id === '') {
            return null;
        }

        const normalized = Number(id);

        return Number.isNaN(normalized) || normalized <= 0 ? null : normalized;

    };

    const fetchInvoiceRecordFromApi = async (recordId) => {

        const response = await kintone.api(
            kintone.api.url('/k/v1/record', true),
            'GET',
            {
                app: INVOICE_APP_ID,
                id: recordId,
            }
        );

        if (!response?.record) {
            throw new Error('請求書レコードを取得できません。');
        }

        return response.record;

    };

    const resolveInvoiceRecordForPrint = async (record) => {

        const sourceRecord = getCurrentRecord(record);
        const recordId = getRecordId(sourceRecord);

        if (!recordId) {
            return sourceRecord;
        }

        try {
            return await fetchInvoiceRecordFromApi(recordId);
        } catch (error) {

            console.warn('[AYANAS Print] billing_from / billing_to 取得のため API 再取得に失敗しました。', error);

            return sourceRecord;

        }

    };

    const resolveOrderRemark = (record) => {

        for (const fieldCode of ORDER_REMARK_FIELD_CODES) {
            const text = String(getFieldValue(record, fieldCode) ?? '').trim();

            if (text !== '' && text !== '-') {
                return text;
            }
        }

        return '';

    };

    const buildOrderHeader = (record) => {

        const header = {};

        [...ORDER_HEADER_FIELDS, ...OVERSEAS_ORDER_HEADER_FIELDS].forEach((fieldCode) => {
            header[fieldCode] = getFieldValue(record, fieldCode);
        });

        header.remark = resolveOrderRemark(record);

        return header;

    };

    const buildDeliveryHeader = (record) => {

        const header = {};

        Object.entries(DELIVERY_HEADER_MAP).forEach(([dataKey, fieldCode]) => {
            header[dataKey] = getFieldValue(record, fieldCode);
        });

        return header;

    };

    const buildDetailRow = (row, detailFields) => {

        const rowFields = row?.value ?? {};
        const detail = {};

        detailFields.string.forEach((fieldCode) => {
            detail[fieldCode] = getFieldValue(rowFields, fieldCode);
        });

        detailFields.number.forEach((fieldCode) => {
            detail[fieldCode] = toNumber(getFieldValue(rowFields, fieldCode));
        });

        return detail;

    };

    const isEmptyDeliveryDetailRow = (detail) => {

        const itemName = String(detail.item_name ?? '').trim();

        if (itemName !== '') {
            return false;
        }

        if (detail.qty !== 0) {
            return false;
        }

        if (detail.amount !== 0) {
            return false;
        }

        return true;

    };

    const countUniqueDeliveryManageNos = (details) => {

        const manageNos = new Set();

        details.forEach((detail) => {

            const manageNo = String(detail.manage_no ?? '').trim();

            if (manageNo !== '') {
                manageNos.add(manageNo);
            }

        });

        return manageNos.size;

    };

    const buildDeliveryDetails = (record) => {

        const tableField = record[DELIVERY_DETAIL_TABLE_CODE];
        const rows = Array.isArray(tableField?.value) ? tableField.value : [];

        const details = [];
        let totalQty = 0;
        let totalAmount = 0;

        rows.forEach((row) => {

            const detail = buildDetailRow(row, DELIVERY_DETAIL_FIELDS);

            if (isEmptyDeliveryDetailRow(detail)) {
                return;
            }

            detail.rowNo = details.length + 1;

            totalQty += detail.qty;
            totalAmount += detail.amount;

            details.push(detail);

        });

        const deliveryPointCount = countUniqueDeliveryManageNos(details);

        return {
            details,
            summary: {
                count: deliveryPointCount,
                totalCount: deliveryPointCount,
                totalQty,
                totalAmount,
            },
        };

    };

    const buildDetails = (record, tableCode, detailFields) => {

        const tableField = record[tableCode];
        const rows = Array.isArray(tableField?.value) ? tableField.value : [];

        const details = [];
        let totalQty = 0;
        let totalAmount = 0;

        rows.forEach((row, index) => {

            const detail = buildDetailRow(row, detailFields);

            detail.rowNo = index + 1;

            totalQty += detail.qty;
            totalAmount += detail.amount;

            details.push(detail);

        });

        return {
            details,
            summary: {
                count: details.length,
                totalCount: details.length,
                totalQty,
                totalAmount,
            },
        };

    };

    const buildOrderReportData = (record) => {

        const { details, summary } = buildDetails(
            record,
            ORDER_DETAIL_TABLE_CODE,
            ORDER_DETAIL_FIELDS
        );

        return {
            header: buildOrderHeader(record),
            details,
            summary,
        };

    };

    const isEmptyInvoiceDetailRow = (detail) => {

        const deliveryNo = String(detail.delivery_no ?? '').trim();
        const itemName = String(detail.item_name ?? '').trim();

        if (deliveryNo !== '') {
            return false;
        }

        if (itemName !== '') {
            return false;
        }

        if (detail.qty !== 0) {
            return false;
        }

        if (detail.amount !== 0) {
            return false;
        }

        return true;

    };

    const getFirstFieldValue = (record, fieldCodes) => {

        const codes = Array.isArray(fieldCodes) ? fieldCodes : [fieldCodes];

        for (const fieldCode of codes) {

            const value = String(getFieldValue(record, fieldCode) ?? '').trim();

            if (value) {
                return value;
            }

        }

        return '';

    };

    const escapeQueryValue = (value) => String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

    const kintoneApi = (path, method, body) => new Promise((resolve, reject) => {
        kintone.api(path, method, body, resolve, reject);
    });

    const fetchCustomerRecord = async (customerCode) => {

        const code = String(customerCode ?? '').trim();

        if (!code) {
            return null;
        }

        const query = `customer_code = "${escapeQueryValue(code)}" limit 1`;
        const response = await kintoneApi(
            kintone.api.url('/k/v1/records', true),
            'GET',
            {
                app: CUSTOMER_APP_ID,
                query,
                fields: ['customer_code', ...CUSTOMER_ADDRESS_FIELDS],
            }
        );

        return response.records?.[0] ?? null;

    };

    const buildCustomerAddressFromMaster = (customerRecord) => {

        if (!customerRecord) {
            return {
                customer_postal_code: '',
                customer_address: '',
            };
        }

        const postNo = String(getFieldValue(customerRecord, 'post_no') ?? '').trim();
        const prefecture = String(getFieldValue(customerRecord, 'prefecture') ?? '').trim();
        const city = String(getFieldValue(customerRecord, 'city') ?? '').trim();
        const address = String(getFieldValue(customerRecord, 'address') ?? '').trim();
        const building = String(getFieldValue(customerRecord, 'building') ?? '').trim();
        const addressLine = [prefecture, city, address, building]
            .filter((part) => part !== '')
            .join('');

        return {
            customer_postal_code: postNo,
            customer_post_no: postNo,
            customer_prefecture: prefecture,
            customer_city: city,
            customer_address_line: address,
            customer_building: building,
            customer_address: addressLine,
        };

    };

    const enrichInvoiceHeaderWithCustomerMaster = async (header) => {

        const customerRecord = await fetchCustomerRecord(header.customer_code);

        if (!customerRecord) {
            return header;
        }

        const masterAddress = buildCustomerAddressFromMaster(customerRecord);

        if (masterAddress.customer_postal_code) {
            header.customer_postal_code = masterAddress.customer_postal_code;
        }

        if (masterAddress.customer_address) {
            header.customer_address = masterAddress.customer_address;
        }

        header.customer_post_no = masterAddress.customer_post_no;
        header.customer_prefecture = masterAddress.customer_prefecture;
        header.customer_city = masterAddress.customer_city;
        header.customer_address_line = masterAddress.customer_address_line;
        header.customer_building = masterAddress.customer_building;

        return header;

    };

    const buildInvoiceHeader = (record, details) => {

        const header = {};

        INVOICE_HEADER_FIELDS.forEach((fieldCode) => {
            header[fieldCode] = getFieldValue(record, fieldCode);
        });

        const billingFrom = String(header.billing_from ?? '').trim();
        const billingTo = String(header.billing_to ?? '').trim();

        header.billing_period = billingFrom && billingTo
            ? `${billingFrom} ～ ${billingTo}`
            : '';

        header.customer_postal_code = getFirstFieldValue(record, [
            'customer_postal_code',
            'postal_code',
            'zip_code',
        ]);

        header.customer_address = getFirstFieldValue(record, [
            'customer_address',
            'address',
        ]);

        const inCharge = details
            .map((detail) => String(detail.in_charge ?? '').trim())
            .find((value) => value !== '') ?? '';

        header.in_charge = inCharge;

        return header;

    };

    const buildInvoiceDetails = (record) => {

        const tableField = record[INVOICE_DETAIL_TABLE_CODE];
        const rows = Array.isArray(tableField?.value) ? tableField.value : [];

        const details = [];

        rows.forEach((row) => {

            const detail = buildDetailRow(row, INVOICE_DETAIL_FIELDS);

            if (isEmptyInvoiceDetailRow(detail)) {
                return;
            }

            details.push(detail);

        });

        return details;

    };

    const buildInvoiceSummary = (record, details) => {

        const itemCount = toNumber(getFieldValue(record, 'item_count'));
        const qtyTotal = toNumber(getFieldValue(record, 'qty_total'));
        const subtotal = toNumber(getFieldValue(record, 'subtotal'));
        const tax = toNumber(getFieldValue(record, 'tax'));
        const total = toNumber(getFieldValue(record, 'total'));
        const carryOver = toNumber(getFieldValue(record, 'carry_over'));
        const paymentAmount = toNumber(getFieldValue(record, 'payment_amount'));
        const adjustmentAmount = toNumber(getFieldValue(record, 'adjustment_amount'))
            || toNumber(getFieldValue(record, 'discount_amount'));
        const invoiceAmount = toNumber(getFieldValue(record, 'invoice_amount'));
        const resolvedSubtotal = subtotal || details.reduce((sum, detail) => sum + detail.amount, 0);
        const resolvedTotal = total || (resolvedSubtotal + tax);
        const currentBillingAmount = invoiceAmount || resolvedTotal;

        return {
            totalCount: itemCount || details.length,
            totalQty: qtyTotal || details.reduce((sum, detail) => sum + detail.qty, 0),
            subtotal: resolvedSubtotal,
            tax,
            total: resolvedTotal,
            carryOver,
            paymentAmount,
            adjustmentAmount,
            invoiceAmount: currentBillingAmount,
            currentBillingAmount,
            monthlyBillingAmount: currentBillingAmount,
            totalAmount: resolvedSubtotal,
        };

    };

    const buildInvoiceReportData = (record) => {

        const details = buildInvoiceDetails(record);
        const header = buildInvoiceHeader(record, details);
        const summary = buildInvoiceSummary(record, details);

        return {
            header,
            details,
            summary,
        };

    };

    const buildDeliveryReportData = (record) => {

        const { details, summary } = buildDeliveryDetails(record);

        const header = buildDeliveryHeader(record);

        if (details.length > 0 && details[0].manage_no) {
            header.barcode_manage_no = details[0].manage_no;
        }

        return {
            header,
            details,
            summary,
        };

    };

    const wrapRecordError = (error, methodName) => {

        if (error instanceof Error && (
            error.message === 'レコードを取得できません。'
            || error.message.startsWith('数値に変換できません。')
            || error.message.includes('未実装')
        )) {
            throw error;
        }

        const message = error instanceof Error ? error.message : '不明なエラー';

        throw new Error(`${methodName}: データ取得に失敗しました。（${message}）`);

    };

    /**
     * 受注票データを取得する
     * @returns {Object} 帳票データ
     */
    Record.getOrderData = (record) => {

        try {

            return buildOrderReportData(getCurrentRecord(record));

        } catch (error) {

            wrapRecordError(error, 'Record.getOrderData');

        }

    };

    const buildOutsourceProcessingDetails = (record) => {

        const tableField = record[OUTSOURCE_PROCESSING_TABLE_CODE];
        const rows = Array.isArray(tableField?.value) ? tableField.value : [];

        return rows.map((row) => {

            const fields = row?.value ?? {};
            const processingDetails = String(getFieldValue(fields, 'processing_details') ?? '').trim();
            const processingCode = String(getFieldValue(fields, 'processing_code') ?? '').trim();
            const itemName = processingDetails !== '' ? processingDetails : processingCode;

            return { item_name: itemName };

        }).filter((detail) => String(detail.item_name ?? '').trim() !== '');

    };

    const buildOutsourceOutboundSlipPages = (record) => {

        const source = getCurrentRecord(record);
        const sharedHeader = {
            outsource_company_code: getFieldValue(source, 'outsource_company_code'),
            outsource_company: getFieldValue(source, 'outsource_company'),
            ship_date: getFieldValue(source, 'ship_date'),
            return_date: getFieldValue(source, 'return_date'),
            remarks: getFieldValue(source, 'Notes_for_processing'),
        };

        const processingDetails = buildOutsourceProcessingDetails(source);
        const barcodeFilter = String(getFieldValue(source, 'barcode_input') ?? '').trim();

        const tableField = source[OUTSOURCE_DETAIL_TABLE_CODE];
        const rows = Array.isArray(tableField?.value) ? tableField.value : [];

        const pages = [];

        rows.forEach((row) => {

            const fields = row?.value ?? {};
            const manageNo = String(getFieldValue(fields, 'manage_no') ?? '').trim();

            if (manageNo === '') {
                return;
            }

            if (barcodeFilter !== '' && manageNo !== barcodeFilter) {
                return;
            }

            pages.push({
                header: {
                    ...sharedHeader,
                    manage_no: manageNo,
                    customer_code: getFieldValue(fields, 'customer_code'),
                    client_name: getFieldValue(fields, 'client_name'),
                    kimono_type: getFieldValue(fields, 'kimono_type'),
                },
                details: processingDetails,
            });

        });

        if (pages.length === 0) {
            throw new Error('印刷対象の外注明細がありません。（管理番号を確認してください）');
        }

        return pages;

    };

    const buildOutsourceOutboundSlipReportData = (record) => {

        const pages = buildOutsourceOutboundSlipPages(record);
        const first = pages[0];

        return {
            header: first.header,
            details: first.details,
            summary: {
                count: pages.length,
                totalCount: pages.length,
                totalQty: 0,
                totalAmount: 0,
            },
            pages,
        };

    };

    const escapeKintoneQueryValue = (value) => String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

    const fetchKintoneRecords = async (appId, query) => {

        const response = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', {
            app: appId,
            query,
        });

        return Array.isArray(response.records) ? response.records : [];

    };

    const fetchOrderRecordByManageNo = async (manageNo) => {

        const normalized = String(manageNo ?? '').trim();

        if (normalized === '') {
            return null;
        }

        const records = await fetchKintoneRecords(
            ORDER_APP_ID,
            `manage_no = "${escapeKintoneQueryValue(normalized)}" limit 1`
        );

        return records[0] ?? null;

    };

    const fetchProductRecord = async (itemCode, itemName) => {

        const code = String(itemCode ?? '').trim();

        if (code !== '') {
            const byCode = await fetchKintoneRecords(
                PRODUCT_APP_ID,
                `item_code = "${escapeKintoneQueryValue(code)}" limit 1`
            );

            if (byCode[0]) {
                return byCode[0];
            }
        }

        const name = String(itemName ?? '').trim();

        if (name === '') {
            return null;
        }

        const byName = await fetchKintoneRecords(
            PRODUCT_APP_ID,
            `item_name = "${escapeKintoneQueryValue(name)}" limit 1`
        );

        return byName[0] ?? null;

    };

    const getWasaiShipDate = (record) => {

        for (let index = 0; index < WASAI_SHIP_DATE_FIELD_CODES.length; index += 1) {
            const value = String(getFieldValue(record, WASAI_SHIP_DATE_FIELD_CODES[index]) ?? '').trim();

            if (value !== '') {
                return value;
            }
        }

        return '';

    };

    const isEligibleWasaiSubcategory = (subcategory) => {

        const text = String(subcategory ?? '').trim();

        return WASAI_ELIGIBLE_SUBCATEGORIES.has(text);

    };

    const formatWasaiProcessingLine = (itemName) => String(itemName ?? '').trim();

    const getWasaiRemarks = (record) => {

        for (let index = 0; index < WASAI_REMARKS_FIELD_CODES.length; index += 1) {
            const code = WASAI_REMARKS_FIELD_CODES[index];
            const value = String(getFieldValue(record, code) ?? '').trim();

            if (value !== '' && value !== '-') {
                return value;
            }
        }

        return '';

    };

    const buildWasaiProcessingDetailsFromSnapshots = (record, manageNo) => {

        const tableField = record[WASAI_PAYMENT_SNAPSHOTS_TABLE_CODE];
        const rows = Array.isArray(tableField?.value) ? tableField.value : [];
        const normalizedManageNo = String(manageNo ?? '').trim();
        const details = [];

        rows.forEach((row) => {

            const fields = row?.value ?? {};
            const snapshotManageNo = String(
                getFieldValue(fields, 'manage_no_0')
                ?? getFieldValue(fields, 'manage_no')
                ?? ''
            ).trim();

            if (snapshotManageNo !== normalizedManageNo) {
                return;
            }

            const lineText = formatWasaiProcessingLine(getFieldValue(fields, 'item_name'));

            if (lineText !== '') {
                details.push({ item_name: lineText });
            }

        });

        return details;

    };

    const buildWasaiProcessingDetailsFromOrder = async (orderRecord) => {

        const tableField = orderRecord[ORDER_DETAIL_TABLE_CODE];
        const rows = Array.isArray(tableField?.value) ? tableField.value : [];
        const details = [];

        for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index];
            const rowValue = row?.value ?? {};
            const itemCode = String(getFieldValue(rowValue, 'item_code') ?? '').trim();
            const itemName = String(getFieldValue(rowValue, 'item_name') ?? '').trim();

            if (itemCode === '' && itemName === '') {
                continue;
            }

            const product = await fetchProductRecord(itemCode, itemName);
            const subcategory = String(getFieldValue(product, 'subcategory') ?? '').trim();

            if (!isEligibleWasaiSubcategory(subcategory)) {
                continue;
            }

            const lineText = formatWasaiProcessingLine(
                itemName || String(getFieldValue(product, 'item_name') ?? '').trim()
            );

            if (lineText !== '') {
                details.push({ item_name: lineText });
            }
        }

        return details;

    };

    const resolveWasaiProcessingDetails = async (record, manageNo, lineFields) => {

        const fromSnapshots = buildWasaiProcessingDetailsFromSnapshots(record, manageNo);

        if (fromSnapshots.length > 0) {
            return fromSnapshots;
        }

        const orderRecord = await fetchOrderRecordByManageNo(manageNo);
        const fromOrder = orderRecord
            ? await buildWasaiProcessingDetailsFromOrder(orderRecord)
            : [];

        if (fromOrder.length > 0) {
            return fromOrder;
        }

        const summary = String(getFieldValue(lineFields, 'processing_summary') ?? '').trim();

        if (summary !== '') {
            return [{ item_name: summary }];
        }

        return [];

    };

    const buildWasaiOutboundSlipPages = async (record) => {

        const source = getCurrentRecord(record);
        const sharedHeader = {
            wasai_code: getFieldValue(source, 'wasai_code'),
            wasai_name: getFieldValue(source, 'wasai_name'),
            trade_name: getFieldValue(source, 'trade_name'),
            ship_date: getWasaiShipDate(source),
            return_date: getFieldValue(source, 'return_date'),
            remarks: getWasaiRemarks(source),
        };

        const barcodeFilter = String(getFieldValue(source, 'barcode_input') ?? '').trim();
        const tableField = source[WASAI_OUTBOUND_LINES_TABLE_CODE];
        const rows = Array.isArray(tableField?.value) ? tableField.value : [];
        const pages = [];

        for (let index = 0; index < rows.length; index += 1) {
            const fields = rows[index]?.value ?? {};
            const manageNo = String(getFieldValue(fields, 'manage_no') ?? '').trim();

            if (manageNo === '') {
                continue;
            }

            if (barcodeFilter !== '' && manageNo !== barcodeFilter) {
                continue;
            }

            const processingDetails = await resolveWasaiProcessingDetails(source, manageNo, fields);

            if (processingDetails.length === 0) {
                throw new Error(
                    `管理番号 ${manageNo} の加工内容がありません（国内仕立・修理・直しの明細を確認してください）。`
                );
            }

            pages.push({
                header: {
                    ...sharedHeader,
                    manage_no: manageNo,
                    customer_code: getFieldValue(fields, 'customer_code'),
                    client_name: getFieldValue(fields, 'client_name'),
                    kimono_type: getFieldValue(fields, 'kimono_type'),
                },
                details: processingDetails,
            });

        }

        if (pages.length === 0) {
            throw new Error('印刷対象の和裁士出庫明細がありません。（管理番号を確認してください）');
        }

        return pages;

    };

    const buildWasaiOutboundSlipReportData = async (record) => {

        const pages = await buildWasaiOutboundSlipPages(record);
        const first = pages[0];

        return {
            header: first.header,
            details: first.details,
            summary: {
                count: pages.length,
                totalCount: pages.length,
                totalQty: 0,
                totalAmount: 0,
            },
            pages,
        };

    };

    /**
     * 外注出庫伝票（App 27）データを取得する
     * @returns {Object} 帳票データ
     */
    Record.getOutsourceOutboundSlipData = (record) => {

        try {

            return buildOutsourceOutboundSlipReportData(record);

        } catch (error) {

            wrapRecordError(error, 'Record.getOutsourceOutboundSlipData');

        }

    };

    const getFirstScalarFromRecord = (record, fieldCodes) => {

        const codes = Array.isArray(fieldCodes) ? fieldCodes : [fieldCodes];

        for (let index = 0; index < codes.length; index += 1) {
            const value = String(getFieldValue(record, codes[index]) ?? '').trim();

            if (value !== '') {
                return value;
            }
        }

        return '';

    };

    const formatWasaiPaymentPeriodLabel = (record) => {

        const periodFrom = getFirstScalarFromRecord(record, WASAI_PAYMENT_PERIOD_FROM_CODES);
        const periodTo = String(getFieldValue(record, 'period_to') ?? '').trim();

        if (periodFrom !== '' && periodTo !== '') {
            return `${periodFrom} ～ ${periodTo}`;
        }

        const inboundYm = String(getFieldValue(record, 'inbound_period_ym') ?? '').trim();

        if (inboundYm !== '') {
            const parts = inboundYm.split('-');

            if (parts.length === 2) {
                return `${parts[0]}年${Number(parts[1])}月入庫分`;
            }

            return `${inboundYm} 入庫分`;
        }

        if (periodFrom !== '') {
            return periodFrom;
        }

        return '';

    };

    const formatIssueDateYmd = () => {

        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');

        return `${y}-${m}-${d}`;

    };

    const readWasaiPaymentLineAmount = (rowValue, rowIndex) => {

        const raw = getFieldValue(rowValue, WASAI_PAYMENT_LINE_FIELD.linePaymentAmount);

        if (raw === null || raw === undefined || String(raw).trim() === '') {
            throw new Error(`支払明細 ${rowIndex + 1} 行目: line_payment_amount が空です。`);
        }

        return toNumber(raw);

    };

    const buildWasaiPaymentStatementReportData = (record) => {

        const source = getCurrentRecord(record);
        const tableField = source[WASAI_PAYMENT_LINES_TABLE];
        const rows = Array.isArray(tableField?.value) ? tableField.value : [];

        if (rows.length === 0) {
            throw new Error('payment_statement_lines に明細がありません。');
        }

        const details = rows.map((row, index) => {

            const fields = row?.value ?? {};

            return {
                manage_no: getFieldValue(fields, WASAI_PAYMENT_LINE_FIELD.manageNo),
                inbound_date: getFieldValue(fields, WASAI_PAYMENT_LINE_FIELD.inboundDate),
                kimono_type: getFieldValue(fields, WASAI_PAYMENT_LINE_FIELD.kimonoType),
                kimono_spec: getFieldValue(fields, WASAI_PAYMENT_LINE_FIELD.kimonoSpec),
                processing_summary: getFieldValue(fields, WASAI_PAYMENT_LINE_FIELD.processingSummary),
                transaction_price: toNumber(getFieldValue(fields, WASAI_PAYMENT_LINE_FIELD.transactionPrice)),
                payment_rate: getFieldValue(fields, WASAI_PAYMENT_LINE_FIELD.paymentRate),
                base_payment_amount: toNumber(getFieldValue(fields, WASAI_PAYMENT_LINE_FIELD.basePaymentAmount)),
                line_payment_amount: readWasaiPaymentLineAmount(fields, index),
            };

        });

        const transactionTotal = details.reduce(
            (sum, detail) => sum + toNumber(detail.transaction_price),
            0
        );
        const paymentSum = details.reduce(
            (sum, detail) => sum + toNumber(detail.line_payment_amount),
            0
        );
        const headerPaymentTotal = toNumber(getFieldValue(source, 'payment_total'));

        if (Math.abs(paymentSum - headerPaymentTotal) > 0.009) {
            throw new Error(
                '支払金額合計が一致しません。'
                + ` App75 payment_total=${headerPaymentTotal}、`
                + ` payment_statement_lines の line_payment_amount 合計=${paymentSum}。`
                + ' データを確認してください（自動補正は行いません）。'
            );
        }

        const header = {
            wasai_name: getFieldValue(source, 'wasai_name'),
            period_label: formatWasaiPaymentPeriodLabel(source),
            payment_due_date: getFieldValue(source, 'payment_due_date'),
            issue_date: formatIssueDateYmd(),
        };

        const summary = {
            line_count: details.length,
            transaction_total: transactionTotal,
            payment_total: headerPaymentTotal,
        };

        return {
            header,
            details,
            summary,
        };

    };

    /**
     * 和裁士支払明細書（App 75）データを取得する
     * @returns {Object} 帳票データ
     */
    Record.getWasaiPaymentStatementData = (record) => {

        try {

            return buildWasaiPaymentStatementReportData(record);

        } catch (error) {

            wrapRecordError(error, 'Record.getWasaiPaymentStatementData');

        }

    };

    /**
     * 和裁士出庫伝票（App 74）データを取得する
     * @returns {Promise<Object>} 帳票データ
     */
    Record.getWasaiOutboundSlipData = async (record) => {

        try {

            return await buildWasaiOutboundSlipReportData(record);

        } catch (error) {

            wrapRecordError(error, 'Record.getWasaiOutboundSlipData');

        }

    };

    /**
     * 一般客帳票の宛名（明細 client_name）を判定する
     * @param {Array<Object>} details - 明細
     * @param {string} multipleMessage - 複数名時の警告文
     * @returns {{ ok: true, clientName: string } | { ok: false, message: string }}
     */
    const resolveGeneralClientRecipient = (details, multipleMessage) => {

        const names = new Set();

        (Array.isArray(details) ? details : []).forEach((detail) => {

            const name = String(detail?.client_name ?? '').trim();

            if (name !== '') {
                names.add(name);
            }

        });

        if (names.size === 0) {
            return {
                ok: false,
                message: 'お客様名が入力されていません。',
            };
        }

        if (names.size > 1) {
            return {
                ok: false,
                message: multipleMessage,
            };
        }

        return {
            ok: true,
            clientName: names.values().next().value,
        };

    };

    /**
     * 一般客納品書の宛名（delivery_detail.client_name）を判定する
     * @param {Array<Object>} details - 納品明細
     * @returns {{ ok: true, clientName: string } | { ok: false, message: string }}
     */
    Record.resolveGeneralDeliveryRecipient = (details) => (
        resolveGeneralClientRecipient(
            details,
            '複数のお客様名が含まれています。一般客納品書を確認してください。'
        )
    );

    /**
     * 一般客請求書の宛名（invoice_detail.client_name）を判定する
     * @param {Array<Object>} details - 請求明細
     * @returns {{ ok: true, clientName: string } | { ok: false, message: string }}
     */
    Record.resolveGeneralInvoiceRecipient = (details) => (
        resolveGeneralClientRecipient(
            details,
            '複数のお客様名が含まれています。一般客請求書を確認してください。'
        )
    );

    /**
     * 納品書データを取得する
     * @returns {Object} 帳票データ
     */
    Record.getDeliveryData = (record) => {

        try {

            const data = buildDeliveryReportData(getCurrentRecord(record));

            console.log(data.details);

            return data;

        } catch (error) {

            wrapRecordError(error, 'Record.getDeliveryData');

        }

    };

    /**
     * 請求書データを取得する
     * @returns {Object} 帳票データ
     */
    Record.getInvoiceData = (record) => {

        try {

            return buildInvoiceReportData(getCurrentRecord(record));

        } catch (error) {

            wrapRecordError(error, 'Record.getInvoiceData');

        }

    };

    Record.getInvoiceDataAsync = async (record) => {

        try {

            const sourceRecord = await resolveInvoiceRecordForPrint(record);
            const data = buildInvoiceReportData(sourceRecord);

            data.header = await enrichInvoiceHeaderWithCustomerMaster(data.header);

            return data;

        } catch (error) {

            wrapRecordError(error, 'Record.getInvoiceDataAsync');

        }

    };

    /**
     * 見積書データを取得する
     * @returns {Object} 帳票データ
     */
    Record.getEstimateData = () => {
        throw new Error('Record.getEstimateData: 見積書データ取得は未実装です。');
    };

    /**
     * インボイスデータを取得する
     * @returns {Object} 帳票データ
     */
    Record.getInvoiceExportData = () => {
        throw new Error('Record.getInvoiceExportData: インボイスデータ取得は未実装です。');
    };

    /**
     * 外注伝票データを取得する
     * @returns {Object} 帳票データ
     */
    Record.getPurchaseData = () => {
        throw new Error('Record.getPurchaseData: 外注伝票データ取得は未実装です。');
    };

    /**
     * ラベルデータを取得する
     * @returns {Object} 帳票データ
     */
    Record.getLabelData = () => {
        throw new Error('Record.getLabelData: ラベルデータ取得は未実装です。');
    };

    /**
     * 現在のアプリに応じた帳票データを取得する
     * @returns {Object} 帳票データ
     */
    Record.get = async (record) => {

        try {

            const appId = normalizeAppId(
                typeof kintone !== 'undefined' && typeof kintone.app?.getId === 'function'
                    ? kintone.app.getId()
                    : null
            );

            if (appId === DELIVERY_APP_ID) {
                return Record.getDeliveryData(record);
            }

            if (appId === INVOICE_APP_ID) {
                return Record.getInvoiceDataAsync(record);
            }

            if (appId === OUTSOURCE_OUTBOUND_APP_ID) {
                return Record.getOutsourceOutboundSlipData(record);
            }

            if (appId === WASAI_OUTBOUND_APP_ID) {
                return Record.getWasaiOutboundSlipData(record);
            }

            if (appId === WASAI_PAYMENT_APP_ID) {
                return Record.getWasaiPaymentStatementData(record);
            }

            return Record.getOrderData(record);

        } catch (error) {

            wrapRecordError(error, 'Record.get');

        }

    };

    window.Record = Record;

})();
