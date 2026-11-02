(function () {
    'use strict';

    /**
     * 工場・店舗 作業状況ポータル
     * FLOOR_PORTAL_VERSION: 1.4.1
     *
     * 工場用アプリと店舗用アプリを作ったあと、
     * APP.factoryPortal と APP.storePortal に App ID を入れてください。
     * 0 のままでは画面は出ません。
     *
     * 店舗ポータル（App87）は A550 業務メニュー＋日次サマリ。
     * 工場ポータル（App86）も日次サマリ／現在状況／納期を同型で表示。
     * App85（旧店舗しみ抜き）は削除済のためメニューに含めない。
     * 作業ステータスは App84（work_status のみ）、場所移動は App34、完了は App30。
     * メニュー表示は権限を付与しない（ACL は各アプリ側）。
     * 文字サイズは工場／店舗で共通（工場相当）。
     */

    const FLOOR_PORTAL_VERSION = '1.4.1';

    const WS = typeof window !== 'undefined' && window.CAYANAS_WORK_STATUS
        ? window.CAYANAS_WORK_STATUS
        : null;

    const WORK = WS
        ? {
            pending: WS.LABELS.notArrived,
            inquireEstimate: WS.LABELS.inquireEstimate,
            maruWait: WS.LABELS.maruWait,
            maruInProgress: WS.LABELS.maruInProgress,
            shimiInProgress: WS.LABELS.shimiInProgress,
            repairInProgress: WS.LABELS.repairInProgress,
            reworkInProgress: WS.LABELS.reworkInProgress,
            finishInProgress: WS.LABELS.finishInProgress,
            finishDone: WS.LABELS.finishDone,
            /** @deprecated dual-read 用。カード正本は shimiInProgress */
            shimiWait: WS.LABELS.shimiInProgress,
        }
        : {
            pending: '未着',
            inquireEstimate: '問合せ・見積り',
            maruWait: '丸洗い待ち',
            maruInProgress: '丸洗い中・乾燥',
            shimiInProgress: 'しみ抜き中',
            repairInProgress: '修理中',
            reworkInProgress: '再直し中',
            finishInProgress: '仕上げ中',
            finishDone: '仕上げ完了',
            shimiWait: 'しみ抜き中',
        };

    const FACTORY_WORK_CARDS = [
        WORK.pending,
        WORK.inquireEstimate,
        WORK.maruWait,
        WORK.maruInProgress,
        WORK.shimiInProgress,
        WORK.repairInProgress,
        WORK.reworkInProgress,
        WORK.finishInProgress,
    ];

    const STORE_WORK_CARDS = [
        WORK.pending,
        WORK.inquireEstimate,
        WORK.shimiInProgress,
        WORK.repairInProgress,
        WORK.reworkInProgress,
        WORK.finishInProgress,
    ];

    const normalizeWorkStatus = (value) => {

        if (WS) {
            return WS.normalize(value);
        }

        const raw = String(value ?? '').trim();
        const aliases = {
            '未着手': '未着',
            '振り分け待ち': '未着',
            'しみ抜き待ち': 'しみ抜き中',
            '仕上げ待ち': '仕上げ中',
            '丸洗い中': '丸洗い中・乾燥',
        };

        return aliases[raw] || raw;

    };

    const CAYANAS_FLOOR_PORTAL = {
        VERSION: FLOOR_PORTAL_VERSION,
        ORDER_APP_ID: 16,
        STORE_PAYMENT_APP_ID: 97,
        REFRESH_INTERVAL_MS: 120000,
        STORE_CUSTOMER_CODE: 'A550',
        APP: {
            factoryPortal: 86,
            storePortal: 87,
            locationInbound: 34,
            internalWork: 84,
            completeRegister: 30,
            /** A550 店舗メニュー用（App85 は載せない） */
            personalCustomer: 96,
            order: 16,
            deliverySlip: 19,
            storeDeadline: 92,
            storePayment: 97,
        },
        MODE: {
            factory: 'factory',
            store: 'store',
        },
        LOCATION: {
            factory: '工場',
            store: '店舗',
        },
        DELIVERY: {
            waiting: '納品待ち',
            pickupWaiting: '引き取り待ち',
            delivered: '納品済',
        },
        /** 店舗サマリ「引き取り待ち」に含める納品状態（App92 在庫互換） */
        PICKUP_WAITING_DELIVERY_STATUSES: ['引き取り待ち', '納品待ち'],
        AGGREGATION: {
            fieldCode: 'aggregation_status',
            cancelled: '取消',
        },
        PAYMENT: {
            statusField: 'payment_status',
            amountField: 'payment_amount',
            dateField: 'payment_date',
            kindField: 'record_kind',
            activeStatus: '有効',
            paymentKind: '入金',
        },
        /**
         * 店舗ポータル作業メニュー（A550 中心・PC/iPad）。
         * App85 は意図的に除外。リンク先アプリの処理ロジックは変更しない。
         */
        STORE_MENU_GROUPS: [
            {
                id: 'reception',
                label: '受付',
                links: [
                    { appKey: 'personalCustomer', label: '個人顧客マスタ' },
                    { appKey: 'order', label: '受注登録' },
                ],
            },
            {
                id: 'work',
                label: '作業',
                links: [
                    { appKey: 'locationInbound', label: '保管場所移動', note: 'App34' },
                    { appKey: 'internalWork', label: '社内作業登録', note: '作業＋場所可' },
                    { appKey: 'completeRegister', label: '検品・仕上げ完了', note: '工程完了' },
                ],
            },
            {
                id: 'delivery',
                label: '納品・在庫',
                links: [
                    { appKey: 'deliverySlip', label: '納品書作成' },
                    { appKey: 'storeDeadline', label: '納期・引き取り在庫' },
                ],
            },
            {
                id: 'payment',
                label: '会計・引き取り',
                links: [
                    { appKey: 'storePayment', label: '店舗入金管理' },
                ],
            },
        ],
        WORK,
        /** 正規化後もカード外に残る旧値（修理・直し中など） */
        LEGACY_WORK: ['修理・直し中'],
        FACTORY_WORK_CARDS,
        STORE_WORK_CARDS,
        normalizeWorkStatus,
        SHOW_OTHER_CARD: {
            factory: true,
            store: false,
        },
        FIELDS: {
            id: '$id',
            manageNo: 'manage_no',
            orderDate: 'order_date',
            deadline: 'deadline',
            customerCode: 'customer_code',
            customerName: 'customer_name',
            clientName: 'client_name',
            kimonoType: 'kimono_type',
            kimonoSpec: 'kimono_spec',
            processStatus: 'process_status',
            locationStatus: 'location_status',
            workStatus: 'work_status',
            deliveryStatus: 'delivery_status',
            aggregationStatus: 'aggregation_status',
            detailTable: 'detail_table',
            itemName: 'item_name',
        },
        UI: {
            factoryTitle: '工場 作業状況',
            storeTitle: '店舗ポータル（A550）',
            refresh: '更新',
            clearFilters: '絞り込み解除',
            searchPlaceholder: '管理番号・顧客名・お客様名',
            stockTotal: '在庫総数',
            other: 'その他',
            deliveryWaiting: '納品待ち',
            duplicate: '重複',
            overdue: '納期超過',
            dueToday: '今日納期',
            within7: '7日以内',
            thisMonth: '今月納期',
            shortcutInbound: '社内入庫登録',
            shortcutWork: '社内作業登録',
            shortcutComplete: '検品・仕上げ完了',
            storeMenuTitle: '店舗メニュー',
            storeMenuLead: 'A550 専用。保管場所移動＝App34、社内作業登録＝作業（＋任意で保管場所）、仕上げ完了＝工程完了。メニューはショートカットであり権限付与ではありません。',
            storePermissionNote: 'App92／App97 など権限制限のあるアプリは、権限のあるユーザーのみ利用できます。',
            factoryOtherNote: '工場現物のみ。上の作業カード以外、旧値、空欄は「その他」です。納品待ちカードは納品状態です。作業カードと重なるため、合計は在庫総数になりません。',
            storeWaitingNote: 'A550・店舗現物のみ。納品待ちカードは納品状態です。作業カードと重なるため、合計は在庫総数になりません。',
            storeSummaryTitle: '本日の店舗状況',
            factorySummaryTitle: '本日の工場状況',
            summaryTitle: '本日の店舗状況',
            summaryTodayOrders: '本日の店舗受注',
            factorySummaryTodayOrders: '本日の工場受注',
            summaryDueToday: '本日納期',
            summaryPickupWaiting: '引き取り待ち',
            factorySummaryDeliveryWaiting: '納品待ち',
            summaryPaymentAmount: '本日入金金額',
            summaryOverdue: '納期超過',
            summaryUnavailable: '未取得',
            summaryYenSuffix: '円',
            summaryCountSuffix: '件',
            loading: '読み込み中…',
            errorPrefix: '取得に失敗しました。',
            empty: '該当する商品はありません。',
            filteredOut: 'この管理番号は絞り込み中のため表示されていません。',
            notFound: '管理番号が見つかりません。',
            outsidePrefix: '一覧にはありません。',
        },
    };

    window.CAYANAS_FLOOR_PORTAL = CAYANAS_FLOOR_PORTAL;
    window.CAYANAS_FLOOR_PORTAL_VERSION = FLOOR_PORTAL_VERSION;

}());
