(function () {
    'use strict';

    /**
     * 工場・店舗 作業状況ポータル
     * FLOOR_PORTAL_VERSION: 1.0.4
     *
     * 工場用アプリと店舗用アプリを作ったあと、
     * APP.factoryPortal と APP.storePortal に App ID を入れてください。
     * 0 のままでは画面は出ません。
     */

    const FLOOR_PORTAL_VERSION = '1.0.4';

    const CAYANAS_FLOOR_PORTAL = {
        VERSION: FLOOR_PORTAL_VERSION,
        ORDER_APP_ID: 16,
        REFRESH_INTERVAL_MS: 120000,
        APP: {
            factoryPortal: 86,
            storePortal: 87,
            locationInbound: 34,
            internalWork: 84,
            completeRegister: 30,
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
            delivered: '納品済',
        },
        AGGREGATION: {
            fieldCode: 'aggregation_status',
            cancelled: '取消',
        },
        WORK: {
            pending: '未着手',
            maruWait: '丸洗い待ち',
            maruInProgress: '丸洗い中・乾燥',
            shimiWait: 'しみ抜き待ち',
            shimiInProgress: 'しみ抜き中',
            repairInProgress: '修理中',
            reworkInProgress: '再直し中',
            finishInProgress: '仕上げ中',
            finishDone: '仕上げ完了',
        },
        LEGACY_WORK: ['振り分け待ち', '丸洗い中', '仕上げ待ち', '修理・直し中'],
        FACTORY_WORK_CARDS: ['未着手', '丸洗い待ち', '丸洗い中・乾燥', 'しみ抜き待ち', 'しみ抜き中', '修理中', '再直し中', '仕上げ中'],
        STORE_WORK_CARDS: ['未着手', 'しみ抜き待ち', 'しみ抜き中', '修理中', '再直し中', '仕上げ中'],
        SHOW_OTHER_CARD: {
            factory: true,
            store: false,
        },
        FIELDS: {
            id: '$id',
            manageNo: 'manage_no',
            orderDate: 'order_date',
            deadline: 'deadline',
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
            storeTitle: '店舗 作業状況',
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
            factoryOtherNote: '上の作業カード以外、旧値、空欄は「その他」です。',
            storeWaitingNote: '納品待ちは納品状態です。作業カードと重なるため、合計は在庫総数になりません。',
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
