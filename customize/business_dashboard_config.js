(function () {
    'use strict';

    /**
     * 業務ダッシュボード — 定数
     * BUSINESS_DASHBOARD_VERSION: 1.6.4
     *
     * kintone で「業務ダッシュボード」アプリ作成後、
     * BUSINESS_DASHBOARD_APP_ID を実 ID に差し替えてください（0 のままでは一覧 UI は起動しません）。
     */

    const BUSINESS_DASHBOARD_VERSION = '1.6.4';

    /** 業務ダッシュボード（kintone ホストアプリ） */
    const BUSINESS_DASHBOARD_APP_ID = 82;

    const CAYANAS_BUSINESS_DASHBOARD = {
        BUSINESS_DASHBOARD_APP_ID,
        ORDER_APP_ID: 16,
        DELIVERY_APP_ID: 19,
        PRODUCT_APP_ID: 13,
        A550_CUSTOMER_CODE: 'A550',
        /**
         * 集計対象。取消だけ除外し、有効・空欄・未取得は対象。
         * App16 と App19 は同じフィールドコード。
         */
        AGGREGATION: {
            fieldCode: 'aggregation_status',
            cancelled: '取消',
        },
        UI: {
            title: '業務ダッシュボード',
            reload: '再読込',
            loading: '集計中…',
            errorPrefix: '集計に失敗しました。',
            orderAmountNote: '受注金額は現在金額登録済み分（税抜）です。確定売上ではありません。',
            aggregationExclusionNote: '取消データは集計対象外',
            registeredAmountNote: '現在登録されている金額（税抜）',
            periodToday: '今日',
            periodYesterday: '昨日',
            periodThisMonth: '今月',
            periodLastMonth: '先月',
            periodCustom: '期間指定',
            applyPeriod: '集計',
            customStart: '開始日',
            customEnd: '終了日',
            segmentHonsha: '本社',
            segmentAyanas: 'ayanas店舗',
            segmentTotal: '全体',
            sectionSummary: '全体サマリー',
            sectionOverview: '全体状況',
            periodFiscalYear: '今年度',
            overviewRowToday: '本日',
            overviewRowMonth: '今月',
            overviewRowFiscal: '今年度',
            overviewSegmentStore: '店舗',
            overviewBlockOrder: '受注',
            overviewBlockDelivery: '納品',
            overviewColOrderKimono: '受注枚数',
            overviewColOrderAmount: '受注金額',
            overviewColDeliveryKimono: '納品枚数',
            overviewColDeliveryAmount: '納品金額',
            overviewColWipKimono: '在庫残数',
            overviewColWipAmount: '在庫金額',
            overviewColOverseasOut: '海外出庫数',
            overviewColOverseasIn: '海外入庫数',
            overviewColWasaiOut: '和裁士出庫数',
            overviewColWasaiIn: '和裁士入庫数',
            overviewColOutsourceOut: '外注出庫数',
            overviewColOutsourceIn: '外注入庫数',
            sectionTailoring: '仕立',
            sectionLogistics: '出庫・入庫（管理番号数）',
            logisticsNote: '出庫＝各アプリの出庫日 / 入庫＝各アプリの入庫完了日。件数は distinct manage_no です（inbound_unified_config.js のフィールド定義に準拠）。',
            logisticsOutbound: '出庫',
            logisticsInbound: '入庫',
            logisticsOverseas: '海外外注',
            logisticsWasai: '和裁士',
            logisticsOutsource: '国内外注',
            sectionKimonoTypeSpec: '着物種類×仕様（受注着物枚数）',
            kimonoRouteNote: '1着物＝1区分。明細の App13 中分類から、海外仕立 → 国内仕立（帯仕立含む） → 悉皆 → その他 の優先順で集計します。',
            colKimonoTotal: '合計',
            colKimonoOverseas: '海外仕立',
            colKimonoDomestic: '国内仕立',
            colKimonoSekkai: '悉皆',
            colKimonoOther: 'その他',
            sectionSekkai: '悉皆',
            sectionCustomers: '得意先別受注（本社）',
            sectionA550: 'ayanas店舗 A550',
            expandKimono: '着物種類 × 仕様',
            expandProcessing: '加工内容（受注点数）',
            qtyHintTitle: '数量（qty）の参考',
            noAppId: '業務ダッシュボード用 kintone アプリ ID が未設定です。business_dashboard_config.js の BUSINESS_DASHBOARD_APP_ID を設定してください。',
            periodBasis: '受注＝order_date / 納品＝delivery_date',
            metaDetails: '集計の参考情報',
            sectionPipeline: '② 現場（受注残）',
            pipelineDefinitionNote: '受注残＝App16 の distinct manage_no − App19 の有効な納品（delivery_detail に出現した distinct manage_no）。aggregation_status が取消の受注は残に入れず、取消の納品書だけに出る管理番号は残します。process_status は完了判定に使いません。',
            pipelineOpenKimono: '受注残着物枚数',
            pipelineOpenPoints: '加工残点数',
            pipelineOverdue: '納期超過',
            pipelineWithin7: '7日以内納期',
            pipelineThisMonth: '今月納期',
            pipelineByProcess: '工程別受注残（process_status）',
            pipelineByLocation: '保管場所別受注残（location_status）',
            pipelineByProcessing: '加工分類別受注残',
            pipelineProcessNote: '工程名は App16 実データの process_status をそのまま表示します（選択肢マスタは未エクスポートのため固定ラベルは使いません）。',
            pipelineLocationNote: '保管場所は location_status。工程別集計とは別概念です。',
            pipelineProcessingNote: '着物枚数＝当該加工を含む distinct manage_no。加工点数＝明細 qty 合計（App13 中分類照合）。',
            pipelineOpenList: '受注残一覧（検算）',
            colManageNo: '管理番号',
            colOrderDate: '受注日',
            colDeadline: '納期',
            colProcessStatus: 'process_status',
            colLocationStatus: 'location_status',
            emptyStatusLabel: '（未設定）',
            sectionMoney: '④ お金（売掛・入金）',
            moneyBasisNote: 'App35 請求済 × App21 入金充当。期間ツールバーとは独立（売掛は時点・今月入金は当月）。',
            moneySourceNote: '集計ロジックは App22 売掛管理と同一（CAYANAS_AREngine）。',
            moneyFullArLink: '売掛管理（App22）で全列表示',
            moneyDepsMissing: '④を表示するには App82 に ar_config.js → payment_create.js → ar_engine.js → business_dashboard_money.js を business_dashboard_desktop.js より前に登録してください。',
            moneyErrorPrefix: '売掛集計に失敗しました。',
        },
        /** 全体状況 — 受注/納品ブロックの列（Excel 全体状況.xlsx 準拠） */
        OVERVIEW_CATEGORY_COLUMNS: [
            { id: 'overseas', label: '海外仕立' },
            { id: 'domestic', label: '国内仕立' },
            { id: 'sekkai', label: '悉皆' },
            { id: 'repair', label: '修理・直し' },
            { id: 'obi', label: '帯仕立' },
            { id: 'other', label: 'その他' },
        ],
        /** ②現場 — 加工分類行（App13.subcategory 照合、未知はその他） */
        PIPELINE_PROCESSING_LABELS: [
            '海外仕立',
            '国内仕立',
            '帯仕立',
            '丸洗い',
            '洗い張り',
            'しみぬき',
            '汗抜き',
            'その他',
        ],
        /** 仕立ブロック（App13.subcategory と完全一致で照合） */
        TAILORING_SUBCATEGORIES: ['海外仕立', '国内仕立', '帯仕立'],
        /** 悉皆ブロック（必須表示） */
        SEKKAI_SUBCATEGORIES: ['丸洗い', '洗い張り', 'しみぬき', '汗抜き'],
        /** A550 加工別（上記 + 仕立 + その他） */
        A550_PROCESSING_LABELS: [
            '丸洗い',
            '洗い張り',
            'しみぬき',
            '汗抜き',
            '海外仕立',
            '国内仕立',
            'その他',
        ],
        /** App27 / 28 / 74 — inbound_unified_config OUT27/OUT28/OUT74 と同一 */
        LOGISTICS: {
            outsource: {
                appId: 27,
                shipDate: 'ship_date',
                detailTable: 'outsource_detail',
                detailManageNo: 'manage_no',
                lineInDate: 'line_in_date',
            },
            overseas: {
                appId: 28,
                shipDate: 'ship_date',
                inboundDate: 'overseas_in_date',
                overseasManageNo: 'overseas_manage_no',
                manageNo: 'manage_no',
                detailsTable: 'overseas_details',
                detailManageNo: 'manage_no',
            },
            wasai: {
                appId: 74,
                shipDateFields: ['日ship_date', 'ship_date'],
                linesTable: 'wasai_outbound_lines',
                lineManageNo: 'manage_no',
                lineInboundDate: 'inbound_date',
            },
        },
        FIELDS: {
            order: {
                manageNo: 'manage_no',
                orderDate: 'order_date',
                customerCode: 'customer_code',
                customerName: 'customer_name',
                kimonoType: 'kimono_type',
                kimonoSpec: 'kimono_spec',
                deadline: 'deadline',
                processStatus: 'process_status',
                locationStatus: 'location_status',
                detailTable: 'detail_table',
                itemCode: 'item_code',
                itemName: 'item_name',
                qty: 'qty',
                unitPrice: 'unit_price',
                amount: 'amount',
                aggregationStatus: 'aggregation_status',
            },
            delivery: {
                deliveryDate: 'delivery_date',
                customerCode: 'customer_code',
                customerName: 'customer_name',
                detailTable: 'delivery_detail',
                manageNo: 'manage_no',
                kimonoType: 'kimono_type',
                kimonoSpec: 'kimono_spec',
                itemName: 'item_name',
                qty: 'qty',
                amount: 'amount',
                aggregationStatus: 'aggregation_status',
            },
            product: {
                itemCode: 'item_code',
                itemName: 'item_name',
                subcategory: 'subcategory',
            },
        },
    };

    window.CAYANAS_BUSINESS_DASHBOARD = CAYANAS_BUSINESS_DASHBOARD;
    window.CAYANAS_BUSINESS_DASHBOARD_VERSION = BUSINESS_DASHBOARD_VERSION;

}());
