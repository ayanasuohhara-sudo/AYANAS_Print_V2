(function () {
    'use strict';

    /**
     * App16 お客様名ふりがな登録 — 定数。
     * フィールド追加（本番）は別承認後。未設置でも UI は出さずエラーにしない。
     */

    const ORDER_CLIENT_KANA_VERSION = '1.0.0';

    window.CAYANAS_ORDER_CLIENT_KANA = {
        VERSION: ORDER_CLIENT_KANA_VERSION,
        ORDER_APP_ID: 16,
        STORE_CUSTOMER_CODE: 'A550',
        FIELDS: {
            customerCode: 'customer_code',
            clientName: 'client_name',
            clientNameKana: 'client_name_kana',
            clientNameKanaStatus: 'client_name_kana_status',
            personalCustomerId: 'personal_customer_id',
        },
        STATUS: {
            confirmed: '確認済',
            unconfirmed: '未確認',
            unknown: '不明',
        },
        SPACE_IDS: [
            'client_kana_space',
            'customer_search_space',
        ],
        UI: {
            panelId: 'order-client-kana-panel',
        },
        MESSAGES: {
            title: 'お客様名ふりがな',
            lead: '電話問い合わせ用。読み候補はスタッフが確認してから確定してください。同姓同名は統合しません。',
            fieldMissing: 'client_name_kana フィールドが未設置です（本番反映は別承認）。',
            a550Note: '店舗(A550)の個人確定は PCM（App96）側を優先。ここは受注スナップショットです。',
        },
    };

    window.CAYANAS_ORDER_CLIENT_KANA_VERSION = ORDER_CLIENT_KANA_VERSION;
}());
