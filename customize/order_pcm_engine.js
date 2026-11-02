(function() {
  'use strict';

  /**
   * App16 × PCM — 検索・検証（氏名のみでの自動確定なし）
   */

  const cfg = () => {
    if (typeof window.CAYANAS_OrderPcm === 'undefined') {
      throw new Error('[order_pcm_engine] order_pcm_config.js を先に読み込んでください。');
    }
    return window.CAYANAS_OrderPcm;
  };

  const escapeQuery = (value) => String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  const readValue = (record, code) => {
    const field = record && record[code];
    if (!field || field.value === null || field.value === undefined) {
      return '';
    }
    return String(field.value).trim();
  };

  const normalizePhone = (value) => String(value ?? '').replace(/[^\d]/g, '');

  const isStoreCustomerCode = (code) => {
    const C = cfg();
    return String(code ?? '').trim() === C.STORE_CUSTOMER_CODE;
  };

  const isValidPersonalCustomerId = (value) => cfg().ID_PATTERN.test(String(value ?? '').trim());

  const hasPersonalCustomerIdField = (record) => {
    const C = cfg();
    return !!(record && record[C.ORDER_FIELDS.personalCustomerId]);
  };

  /**
   * @param {{ personalCustomerId?: string, customerName?: string, customerKana?: string, phone?: string }} criteria
   */
  const buildPcmSearchQuery = (criteria) => {
    const C = cfg();
    const F = C.PCM_FIELDS;
    const c = criteria || {};
    const parts = [];

    const id = String(c.personalCustomerId ?? '').trim();
    if (id) {
      if (isValidPersonalCustomerId(id)) {
        parts.push(F.personalCustomerId + ' = "' + escapeQuery(id) + '"');
      } else {
        parts.push(F.personalCustomerId + ' like "' + escapeQuery(id) + '"');
      }
    }

    const name = String(c.customerName ?? '').trim();
    if (name) {
      parts.push(F.customerName + ' like "' + escapeQuery(name) + '"');
    }

    const kana = String(c.customerKana ?? '').trim();
    if (kana) {
      parts.push(F.customerKana + ' like "' + escapeQuery(kana) + '"');
    }

    const phone = String(c.phone ?? '').trim();
    if (phone) {
      parts.push('('
        + F.phone + ' like "' + escapeQuery(phone) + '"'
        + ' or '
        + F.mobilePhone + ' like "' + escapeQuery(phone) + '"'
        + ')');
    }

    if (parts.length === 0) {
      return '';
    }

    return '(' + parts.join(' or ') + ') order by ' + F.personalCustomerId + ' asc limit 50';
  };

  const searchPersonalCustomers = async (criteria) => {
    const C = cfg();
    const query = buildPcmSearchQuery(criteria);
    if (!query) {
      return [];
    }

    const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', {
      app: C.PCM_APP_ID,
      query: query,
      fields: [
        '$id',
        C.PCM_FIELDS.personalCustomerId,
        C.PCM_FIELDS.customerName,
        C.PCM_FIELDS.customerKana,
        C.PCM_FIELDS.phone,
        C.PCM_FIELDS.mobilePhone,
      ],
    });

    return resp.records || [];
  };

  const fetchPersonalCustomerById = async (personalCustomerId) => {
    const C = cfg();
    const id = String(personalCustomerId ?? '').trim();
    if (!isValidPersonalCustomerId(id)) {
      return null;
    }

    const resp = await kintone.api(kintone.api.url('/k/v1/records.json', true), 'GET', {
      app: C.PCM_APP_ID,
      query: C.PCM_FIELDS.personalCustomerId + ' = "' + escapeQuery(id) + '" limit 1',
      fields: [
        '$id',
        C.PCM_FIELDS.personalCustomerId,
        C.PCM_FIELDS.customerName,
        C.PCM_FIELDS.customerKana,
        C.PCM_FIELDS.phone,
        C.PCM_FIELDS.mobilePhone,
      ],
    });

    return (resp.records || [])[0] || null;
  };

  /**
   * create: A550 かつ ID 空 → 必須エラー
   * edit: A550 かつ ID 空 → 警告のみ（移行しない）
   * ID 形式不正 → エラー
   * 氏名不一致 → warnMismatch（呼び出し側で confirm）
   *
   * @returns {{ ok: boolean, error?: string, warnEmptyOnEdit?: boolean, warnMismatch?: { personalCustomerId: string, clientName: string, pcmName: string } }}
   */
  const validateStoreOrderPersonalCustomer = async (record, mode) => {
    const C = cfg();
    const OF = C.ORDER_FIELDS;
    const PF = C.PCM_FIELDS;

    const customerCode = readValue(record, OF.customerCode);
    if (!isStoreCustomerCode(customerCode)) {
      return { ok: true };
    }

    if (!hasPersonalCustomerIdField(record)) {
      return {
        ok: false,
        error: 'personal_customer_id フィールドが未設置です。フォームに追加してから店舗受注を保存してください。',
      };
    }

    const personalId = readValue(record, OF.personalCustomerId);
    const clientName = readValue(record, OF.clientName);
    const isCreate = mode === 'create';

    if (!personalId) {
      if (isCreate) {
        return {
          ok: false,
          error: '店舗受注（A550）では個人顧客を選択してください。',
        };
      }
      return { ok: true, warnEmptyOnEdit: true };
    }

    if (!isValidPersonalCustomerId(personalId)) {
      return {
        ok: false,
        error: '個人顧客IDの形式が不正です（P000001形式）。PCMから再選択してください。',
      };
    }

    let pcmName = '';
    try {
      const pcm = await fetchPersonalCustomerById(personalId);
      if (!pcm) {
        return {
          ok: false,
          error: '個人顧客ID「' + personalId + '」がマスタにありません。再選択してください。',
        };
      }
      pcmName = readValue(pcm, PF.customerName);
    } catch (err) {
      console.warn('[order_pcm_engine] PCM 照合失敗', err);
      /* 通信失敗時は形式チェックのみ通過（保存は止めない） */
      return { ok: true };
    }

    if (clientName && pcmName && clientName !== pcmName) {
      return {
        ok: true,
        warnMismatch: {
          personalCustomerId: personalId,
          clientName: clientName,
          pcmName: pcmName,
        },
      };
    }

    return { ok: true };
  };

  const formatCandidateLine = (record) => {
    const C = cfg();
    const F = C.PCM_FIELDS;
    return [
      readValue(record, F.personalCustomerId),
      readValue(record, F.customerName),
      readValue(record, F.customerKana),
      readValue(record, F.phone) || readValue(record, F.mobilePhone),
    ].filter(Boolean).join(' / ');
  };

  const buildOrderHistoryQuery = (personalCustomerId) => {
    const C = cfg();
    const id = String(personalCustomerId ?? '').trim();
    if (!isValidPersonalCustomerId(id)) {
      return '';
    }
    return C.ORDER_FIELDS.personalCustomerId
      + ' = "' + escapeQuery(id) + '"'
      + ' order by ' + C.ORDER_FIELDS.orderDate + ' desc, '
      + C.ORDER_FIELDS.manageNo + ' desc limit 50';
  };

  const summarizeDetailItems = (record, maxItems) => {
    const C = cfg();
    const table = record && record[C.ORDER_FIELDS.detailTable];
    const rows = (table && table.value) || [];
    const names = [];
    rows.forEach(function(row) {
      const name = readValue(row.value || {}, C.ORDER_FIELDS.detailItemName);
      if (name) {
        names.push(name);
      }
    });
    const limit = Number(maxItems) > 0 ? Number(maxItems) : 3;
    if (names.length <= limit) {
      return names.join('、');
    }
    return names.slice(0, limit).join('、') + ' 他' + (names.length - limit) + '件';
  };

  window.CAYANAS_OrderPcm_Engine = {
    readValue: readValue,
    normalizePhone: normalizePhone,
    isStoreCustomerCode: isStoreCustomerCode,
    isValidPersonalCustomerId: isValidPersonalCustomerId,
    hasPersonalCustomerIdField: hasPersonalCustomerIdField,
    buildPcmSearchQuery: buildPcmSearchQuery,
    searchPersonalCustomers: searchPersonalCustomers,
    fetchPersonalCustomerById: fetchPersonalCustomerById,
    validateStoreOrderPersonalCustomer: validateStoreOrderPersonalCustomer,
    formatCandidateLine: formatCandidateLine,
    buildOrderHistoryQuery: buildOrderHistoryQuery,
    summarizeDetailItems: summarizeDetailItems,
  };
}());
