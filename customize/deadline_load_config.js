(function () {
    'use strict';

    /**
     * 納期負荷カレンダー App89 — 定数。
     * 集計は保存しない。正本は App16。
     */

    const DEADLINE_LOAD_VERSION = '1.0.0';

    const CAYANAS_DEADLINE_LOAD = {
        VERSION: DEADLINE_LOAD_VERSION,
        DEADLINE_LOAD_APP_ID: 89,
        ORDER_APP_ID: 16,
        PRODUCT_APP_ID: 13,
        PAGE_LIMIT: 500,
        MAX_OFFSET: 10000,
        PRODUCT_BATCH: 100,
        AGGREGATION_CANCELLED: '取消',
        DELIVERY_DONE: '納品済',
        PROCESSING_SEPARATOR: ' / ',
        CATEGORY_SEPARATOR: ' / ',
        DUPLICATE_LABEL: '重複',
        WEEKDAY_LABELS: ['月', '火', '水', '木', '金', '土', '日'],
        /**
         * 将来の上限。null のあいだは余裕・注意・満杯を出さない。
         * 仕立 / 丸洗い・しみぬき / 修理の順。
         */
        LIMITS: {
            tailoring: null,
            wash: null,
            repair: null,
        },
        LOAD_LEVELS: {
            slack: '余裕',
            caution: '注意',
            full: '満杯',
        },
        MESSAGES: {
            loading: '読み込み中…',
            failed: '読み込みに失敗しました。再度お試しください。',
            emptyDay: 'この日の納期明細はありません。',
            truncated: '表示月の受注が取得上限を超えたため、一部だけ表示しています。',
            detailPrefix: '納期明細 ',
            detailSuffix: '件',
        },
        CATEGORIES: [
            {
                key: 'tailoring',
                label: '仕立',
                shortLabel: '仕立',
                subcategories: ['海外仕立', '国内仕立'],
            },
            {
                key: 'wash',
                label: '丸洗い・しみぬき',
                shortLabel: '丸洗・しみ',
                subcategories: ['丸洗い', 'しみぬき'],
            },
            {
                key: 'repair',
                label: '修理',
                shortLabel: '修理',
                subcategories: ['修理・直し'],
            },
        ],
        FIELDS: {
            id: '$id',
            manageNo: 'manage_no',
            deadline: 'deadline',
            customerCode: 'customer_code',
            customerName: 'customer_name',
            clientName: 'client_name',
            kimonoType: 'kimono_type',
            kimonoSpec: 'kimono_spec',
            processStatus: 'process_status',
            workStatus: 'work_status',
            locationStatus: 'location_status',
            deliveryStatus: 'delivery_status',
            aggregationStatus: 'aggregation_status',
            detailTable: 'detail_table',
            itemCode: 'item_code',
            itemName: 'item_name',
            productCode: 'item_code',
            subcategory: 'subcategory',
        },
    };

    window.CAYANAS_DEADLINE_LOAD = CAYANAS_DEADLINE_LOAD;
    window.CAYANAS_DEADLINE_LOAD_VERSION = DEADLINE_LOAD_VERSION;

}());
