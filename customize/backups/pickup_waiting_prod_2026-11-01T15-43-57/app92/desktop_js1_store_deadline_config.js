(function () {
    'use strict';

    /**
     * 店舗納期カレンダー App92 — 定数。
     * 表示専用。正本は App16。A550 のみ。
     */

    const STORE_DEADLINE_VERSION = '1.1.0';

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
        LOCATION_STORE: '店舗',
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
            waitingStock: {
                key: 'waitingStock',
                label: '納品待ち在庫（店舗）',
            },
            slipNotAtStore: {
                key: 'slipNotAtStore',
                label: '納品書済・店舗未到着',
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
            lead: 'A550の納期・納品待ち在庫・店舗未到着を確認します。納品書番号がある商品はスケジュールから外れます。',
            depMissing: '店舗納期カレンダーのJS読込に失敗しました。config → engine → desktop の順で登録されているか確認してください。',
            waitingStockEmpty: '店舗にある納品待ち在庫はありません。',
            slipNotAtStoreEmpty: '納品書作成済で店舗以外にある商品はありません。',
            waitingStockLead: '現物が店舗にあり、納品書番号がある納品待ち商品です。引き渡し（納品済）後は表示されません。',
            slipNotAtStoreLead: '納品書は作成済みですが、現物がまだ店舗にありません。店舗へ移動すると納品待ち在庫に出ます。',
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
            deliveryNo: 'delivery_no',
            deliveryDate: 'delivery_date',
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
