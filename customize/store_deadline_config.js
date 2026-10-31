(function () {
    'use strict';

    /**
     * 店舗納期カレンダー App92 — 定数。
     * 表示専用。正本は App16。A550 のみ。
     */

    const STORE_DEADLINE_VERSION = '1.0.4';

    const CAYANAS_STORE_DEADLINE = {
        VERSION: STORE_DEADLINE_VERSION,
        STORE_DEADLINE_APP_ID: 92,
        ORDER_APP_ID: 16,
        PRODUCT_APP_ID: 13,
        PAGE_LIMIT: 500,
        MAX_OFFSET: 10000,
        PRODUCT_BATCH: 100,
        STORE_CUSTOMER_CODE: 'A550',
        AGGREGATION_CANCELLED: '取消',
        DELIVERY_DONE: '納品済',
        DELIVERY_WAITING: '納品待ち',
        PROCESS_DONE: '完了',
        PROCESSING_SEPARATOR: ' / ',
        CATEGORY_SEPARATOR: ' / ',
        DUPLICATE_LABEL: '重複',
        WEEKDAY_LABELS: ['月', '火', '水', '木', '金', '土', '日'],
        /**
         * 1 manage_no = 1分類。複数該当時はこの優先順位で1つだけ採用。
         * 画面表示順（CATEGORIES）とは別。
         */
        CATEGORY_PRIORITY: [
            'overseas',
            'domestic',
            'obi',
            'repair',
            'wash',
        ],
        /**
         * 固定表示順。五十音・件数では並べ替えない。
         */
        CATEGORIES: [
            {
                key: 'wash',
                label: '丸洗い・しみ',
                shortLabel: '丸洗い・しみ',
                subcategories: ['丸洗い', 'しみぬき'],
            },
            {
                key: 'overseas',
                label: '海外仕立',
                shortLabel: '海外仕立',
                subcategories: ['海外仕立'],
            },
            {
                key: 'domestic',
                label: '国内仕立',
                shortLabel: '国内仕立',
                subcategories: ['国内仕立'],
            },
            {
                key: 'repair',
                label: '修理',
                shortLabel: '修理',
                subcategories: ['修理・直し', '修理'],
            },
            {
                key: 'obi',
                label: '帯仕立',
                shortLabel: '帯仕立',
                subcategories: ['帯仕立'],
            },
        ],
        KPI: {
            overdue: {
                key: 'overdue',
                label: '納期超過',
            },
            today: {
                key: 'today',
                label: '本日納期',
            },
            within7: {
                key: 'within7',
                label: '7日以内',
            },
            ready: {
                key: 'ready',
                label: '完了・納品待ち',
            },
        },
        MESSAGES: {
            loading: '読み込み中…',
            failed: '読み込みに失敗しました。再度お試しください。',
            emptyDay: 'この日の納期明細はありません。',
            emptyKpi: '該当する商品はありません。',
            truncated: '取得上限を超えたため、一部だけ表示しています。',
            productDenied: '商品マスタ(App13)を参照できないため、分類なしで表示しています。App92の実行ユーザーにApp13閲覧権限を付与してください。',
            emptyMonth: 'この月に表示できる未納品の納期はありません。',
            detailPrefix: '納期明細 ',
            detailSuffix: '件',
            kpiPrefix: '',
            kpiSuffix: '件',
            uncategorized: '未分類',
            lead: 'A550の納期と、完了して納品待ちの商品を確認します。',
            depMissing: '店舗納期カレンダーのJS読込に失敗しました。config → engine → desktop の順で登録されているか確認してください。',
        },
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

    window.CAYANAS_STORE_DEADLINE = CAYANAS_STORE_DEADLINE;
    window.CAYANAS_STORE_DEADLINE_VERSION = STORE_DEADLINE_VERSION;

}());
