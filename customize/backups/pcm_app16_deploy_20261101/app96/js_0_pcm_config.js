(function() {
  'use strict';

  /**
   * 個人顧客マスタ（PCM）第1段階 — 定数
   * App ID は本番作成後に必ず実値へ更新すること（0 のままでは動作しない）。
   */

  const PCM_CONFIG_VERSION = '1.0.0-phase1';

  /** @type {number} 個人顧客マスタ App ID */
  const PCM_APP_ID = 96;

  /** @type {number} 個人顧客ID採番 App ID */
  const COUNTER_APP_ID = 95;

  const COUNTER_KEY = 'PCM_PERSONAL_ID';
  const ID_PREFIX = 'P';
  const ID_PAD = 6;
  const ID_PATTERN = /^P\d{6}$/;
  const NUMBERING_MAX_RETRY = 5;

  const STORE_CUSTOMER_CODE = 'A550';

  const FIELDS = {
    personalCustomerId: 'personal_customer_id',
    customerName: 'customer_name',
    customerKana: 'customer_kana',
    postalCode: 'postal_code',
    prefecture: 'prefecture',
    city: 'city',
    addressLine: 'address_line',
    buildingName: 'building_name',
    phone: 'phone',
    mobilePhone: 'mobile_phone',
    email: 'email',
    birthday: 'birthday',
    gender: 'gender',
    memberType: 'member_type',
    memberNo: 'member_no',
    memberStartDate: 'member_start_date',
    memberExpiryDate: 'member_expiry_date',
    memberStatus: 'member_status',
    firstOrderDate: 'first_order_date',
    lastOrderDate: 'last_order_date',
    orderCount: 'order_count',
    lifetimeAmount: 'lifetime_amount',
    dormantStatus: 'dormant_status',
    dmPermission: 'dm_permission',
    emailPermission: 'email_permission',
    linePermission: 'line_permission',
    customerNote: 'customer_note',
    webAccountId: 'web_account_id',
    lineAccountId: 'line_account_id',
    registrationSource: 'registration_source',
    webVerified: 'web_verified',
  };

  const COUNTER_FIELDS = {
    counterKey: 'counter_key',
    nextSeq: 'next_seq',
    remarks: 'remarks',
  };

  const WEB_VERIFIED = {
    none: '未連携',
    verified: '本人確認済',
    stopped: '停止',
  };

  const REGISTRATION_SOURCE = {
    store: '店舗',
    web: 'WEB',
    migrate: '移行',
    other: 'その他',
  };

  const MEMBER_STATUS = {
    nonMember: '非会員',
    member: '会員',
    withdrawn: '退会',
    stopped: '停止',
  };

  const DORMANT = {
    normal: '通常',
    candidate: '休眠候補',
    dormant: '休眠',
  };

  const SEARCH_FIELDS = [
    FIELDS.personalCustomerId,
    FIELDS.customerName,
    FIELDS.customerKana,
    FIELDS.phone,
    FIELDS.mobilePhone,
    FIELDS.memberNo,
  ];

  const LOCKED_FIELDS_STAFF = [
    FIELDS.personalCustomerId,
    FIELDS.webAccountId,
    FIELDS.orderCount,
    FIELDS.lifetimeAmount,
  ];

  const TEST_NAME_PREFIX = '[TEST]';

  window.CAYANAS_PCM = {
    VERSION: PCM_CONFIG_VERSION,
    PCM_APP_ID: PCM_APP_ID,
    COUNTER_APP_ID: COUNTER_APP_ID,
    COUNTER_KEY: COUNTER_KEY,
    ID_PREFIX: ID_PREFIX,
    ID_PAD: ID_PAD,
    ID_PATTERN: ID_PATTERN,
    NUMBERING_MAX_RETRY: NUMBERING_MAX_RETRY,
    STORE_CUSTOMER_CODE: STORE_CUSTOMER_CODE,
    FIELDS: FIELDS,
    COUNTER_FIELDS: COUNTER_FIELDS,
    WEB_VERIFIED: WEB_VERIFIED,
    REGISTRATION_SOURCE: REGISTRATION_SOURCE,
    MEMBER_STATUS: MEMBER_STATUS,
    DORMANT: DORMANT,
    SEARCH_FIELDS: SEARCH_FIELDS,
    LOCKED_FIELDS_STAFF: LOCKED_FIELDS_STAFF,
    TEST_NAME_PREFIX: TEST_NAME_PREFIX,
  };
}());
