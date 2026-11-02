(function () {
    'use strict';

    /**
     * App16 明細 × App13 中分類（App82 business_dashboard_engine と同型）
     * CAYANAS_OrderLineClassifier
     */

    const VERSION = '1.1.0';

    const getFieldValue = (record, fieldCode) => {

        const field = record?.[fieldCode];

        if (!field || field.value === null || field.value === undefined) {
            return '';
        }

        return field.value;

    };

    const buildProductLookup = (productRecords, fieldMap) => {

        const pf = fieldMap || {
            itemCode: 'item_code',
            itemName: 'item_name',
            subcategory: 'subcategory',
        };

        const byCode = new Map();
        const byName = new Map();
        const subcategorySet = new Set();

        (productRecords || []).forEach((record) => {

            const code = String(getFieldValue(record, pf.itemCode)).trim();
            const name = String(getFieldValue(record, pf.itemName)).trim();
            const subcategory = String(getFieldValue(record, pf.subcategory)).trim();

            if (subcategory) {
                subcategorySet.add(subcategory);
            }

            if (code) {
                byCode.set(code, subcategory);
            }

            if (name && !byName.has(name)) {
                byName.set(name, subcategory);
            }

        });

        return {
            byCode,
            byName,
            subcategories: [...subcategorySet].sort((a, b) => a.localeCompare(b, 'ja')),
        };

    };

    const resolveSubcategory = (itemCode, itemName, lookup) => {

        const code = String(itemCode ?? '').trim();
        const name = String(itemName ?? '').trim();

        if (code && lookup.byCode.has(code)) {
            return lookup.byCode.get(code) || '';
        }

        if (name && lookup.byName.has(name)) {
            return lookup.byName.get(name) || '';
        }

        return '';

    };

    /**
     * @param {object} orderRecord kintone App16 record
     * @param {object} lookup buildProductLookup の戻り値
     * @param {object} options detailTableField, itemCode, itemName, maruaraiSubcategory
     */
    const analyzeDetailTable = (orderRecord, lookup, options) => {

        const opts = options || {};
        const tableCode = opts.detailTableField || 'detail_table';
        const itemCodeField = opts.itemCodeField || 'item_code';
        const itemNameField = opts.itemNameField || 'item_name';
        const maruaraiLabel = opts.maruaraiSubcategory || '丸洗い';
        const shiminukiLabel = opts.shiminukiSubcategory || 'しみぬき';
        const qtyField = opts.qtyField || 'qty';

        const table = orderRecord?.[tableCode];
        const rows = Array.isArray(table?.value) ? table.value : [];

        let hasMaruarai = false;
        let hasShiminuki = false;
        const unresolvedLines = [];
        const lineSummaries = [];

        rows.forEach((row, index) => {

            const rowValue = row?.value ?? {};
            const itemCode = String(getFieldValue(rowValue, itemCodeField)).trim();
            const itemName = String(getFieldValue(rowValue, itemNameField)).trim();
            const qtyRaw = getFieldValue(rowValue, qtyField);
            const qty = qtyRaw === '' || qtyRaw === null || qtyRaw === undefined
                ? ''
                : String(qtyRaw).trim();

            if (!itemCode && !itemName) {
                return;
            }

            const subcategory = resolveSubcategory(itemCode, itemName, lookup);

            if (subcategory === '') {
                unresolvedLines.push({
                    rowIndex: index + 1,
                    itemCode,
                    itemName,
                });
                lineSummaries.push({
                    itemCode,
                    itemName,
                    qty,
                    subcategory: '',
                    unresolved: true,
                });
                return;
            }

            if (subcategory === maruaraiLabel) {
                hasMaruarai = true;
            }

            if (subcategory === shiminukiLabel) {
                hasShiminuki = true;
            }

            lineSummaries.push({
                itemCode,
                itemName,
                qty,
                subcategory,
                unresolved: false,
            });

        });

        return {
            hasMaruarai,
            hasShiminuki,
            unresolvedLines,
            lineSummaries,
            unresolvedCount: unresolvedLines.length,
        };

    };

    window.CAYANAS_OrderLineClassifier = {
        VERSION,
        getFieldValue,
        buildProductLookup,
        resolveSubcategory,
        analyzeDetailTable,
    };

}());
