(function() {
  'use strict';

  /**
   * 受注明細（App 16）顧客名部分一致検索
   * 顧客コードのルックアップに加え、顧客名から顧客を選べる。
   */

  const ORDER_APP_ID = 16;
  const CUSTOMER_APP_ID = 8;

  const FIELDS = {
    customerCode: 'customer_code',
    customerName: 'customer_name',
  };

  const SEARCH_BOX_ID = 'order-customer-name-search-box';
  const SEARCH_INPUT_ID = 'order-customer-name-search-input';
  const SUGGESTIONS_ID = 'order-customer-name-suggestions';

  const COMPANY_NAME_PREFIXES = [
    '株式会社',
    '有限会社',
    '合同会社',
    '合資会社',
    '合名会社',
    '一般社団法人',
    '一般財団法人',
    '（株）',
    '(株)',
    '㈱',
    '（有）',
    '(有)',
  ];

  let searchTimer = null;
  let latestSearchToken = 0;

  const escapeQueryValue = (value) => String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const isOrderApp = () => kintone.app.getId() === ORDER_APP_ID;

  const getFieldValue = (record, fieldCode) => {

    const field = record?.[fieldCode];

    if (!field || field.value === null || field.value === undefined) {
      return '';
    }

    return field.value;

  };

  const normalizeCustomerSearchText = (text) => {

    let normalized = String(text ?? '').trim().replace(/\s+/g, '');

    if (!normalized) {
      return '';
    }

    let changed = true;

    while (changed) {

      changed = false;

      COMPANY_NAME_PREFIXES.forEach((prefix) => {

        if (normalized.startsWith(prefix)) {
          normalized = normalized.slice(prefix.length);
          changed = true;
        }

        if (normalized.endsWith(prefix)) {
          normalized = normalized.slice(0, -prefix.length);
          changed = true;
        }

      });

    }

    return normalized;

  };

  const customerRecordMatchesKeyword = (record, rawKeyword, normalizedKeyword) => {

    const customerName = String(getFieldValue(record, FIELDS.customerName) ?? '');
    const customerCode = String(getFieldValue(record, FIELDS.customerCode) ?? '');

    if (rawKeyword && (customerName.includes(rawKeyword) || customerCode.includes(rawKeyword))) {
      return true;
    }

    if (!normalizedKeyword) {
      return false;
    }

    return normalizeCustomerSearchText(customerName).includes(normalizedKeyword)
      || normalizeCustomerSearchText(customerCode).includes(normalizedKeyword);

  };

  const searchCustomersByKeyword = async (keyword, limit = 20) => {

    const rawKeyword = String(keyword ?? '').trim();
    const normalizedKeyword = normalizeCustomerSearchText(rawKeyword);

    if (!rawKeyword) {
      return [];
    }

    const searchTerms = [...new Set(
      [rawKeyword, normalizedKeyword].filter((term) => term !== '')
    )];
    const conditions = searchTerms.flatMap((term) => {
      const escaped = escapeQueryValue(term);

      return [
        `${FIELDS.customerName} like "${escaped}"`,
        `${FIELDS.customerCode} like "${escaped}"`,
      ];
    });
    const queryLimit = Math.max(Number(limit) || 20, 20);
    const query = `(${conditions.join(' or ')}) order by ${FIELDS.customerCode} asc limit ${queryLimit}`;
    const response = await kintone.api(
      kintone.api.url('/k/v1/records', true),
      'GET',
      {
        app: CUSTOMER_APP_ID,
        query: query,
        fields: [
          FIELDS.customerCode,
          FIELDS.customerName,
        ],
      }
    );
    const recordMap = new Map();

    (response.records ?? []).forEach((record) => {

      const code = String(getFieldValue(record, FIELDS.customerCode) ?? '').trim();

      if (!code || recordMap.has(code)) {
        return;
      }

      if (!customerRecordMatchesKeyword(record, rawKeyword, normalizedKeyword)) {
        return;
      }

      recordMap.set(code, record);

    });

    return Array.from(recordMap.values()).slice(0, limit);

  };

  const hideSuggestions = () => {

    const suggestions = document.getElementById(SUGGESTIONS_ID);

    if (!suggestions) {
      return;
    }

    suggestions.hidden = true;
    suggestions.innerHTML = '';

  };

  const applyCustomerToRecord = (customerRecord) => {

    const record = kintone.app.record.get().record;
    const customerCode = String(getFieldValue(customerRecord, FIELDS.customerCode) ?? '').trim();
    const customerName = String(getFieldValue(customerRecord, FIELDS.customerName) ?? '').trim();

    if (record[FIELDS.customerCode]) {
      record[FIELDS.customerCode].value = customerCode;
    }

    if (record[FIELDS.customerName]) {
      record[FIELDS.customerName].value = customerName;
    }

    kintone.app.record.set({ record: record });

    const searchInput = document.getElementById(SEARCH_INPUT_ID);

    if (searchInput) {
      searchInput.value = customerName;
    }

    hideSuggestions();

  };

  const renderSuggestions = (records) => {

    const suggestions = document.getElementById(SUGGESTIONS_ID);

    if (!suggestions) {
      return;
    }

    if (records.length === 0) {
      suggestions.innerHTML = '<li class="is-empty">該当する顧客がありません</li>';
      suggestions.hidden = false;
      return;
    }

    suggestions.innerHTML = records.map((record) => {

      const customerCode = escapeHtml(getFieldValue(record, FIELDS.customerCode));
      const customerName = escapeHtml(getFieldValue(record, FIELDS.customerName));

      return (
        '<li data-customer-code="' + customerCode + '">' +
        '<span>' + customerName + '</span>' +
        '<span class="order-customer-search__code">' + customerCode + '</span>' +
        '</li>'
      );

    }).join('');

    suggestions.hidden = false;

    suggestions.querySelectorAll('li[data-customer-code]').forEach((item) => {

      item.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });

      item.addEventListener('click', () => {

        const customerCode = String(item.dataset.customerCode ?? '').trim();
        const selected = records.find((record) => (
          String(getFieldValue(record, FIELDS.customerCode) ?? '').trim() === customerCode
        ));

        if (selected) {
          applyCustomerToRecord(selected);
        }

      });

    });

  };

  const runCustomerSearch = async (keyword) => {

    const searchToken = latestSearchToken + 1;
    latestSearchToken = searchToken;

    try {

      const records = await searchCustomersByKeyword(keyword, 20);

      if (searchToken !== latestSearchToken) {
        return;
      }

      renderSuggestions(records);

    } catch (error) {

      console.error('[受注明細 顧客名検索]', error);

      if (searchToken !== latestSearchToken) {
        return;
      }

      renderSuggestions([]);

    }

  };

  const ensureSearchStyles = () => {

    if (document.getElementById('order-customer-search-style')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'order-customer-search-style';
    style.textContent = [
      '.order-customer-search { position: relative; margin: 12px 0 16px; padding: 12px; border: 1px solid #dfe3e8; border-radius: 6px; background: #f8fafc; }',
      '.order-customer-search__label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 700; color: #333; }',
      '.order-customer-search__note { margin: 0 0 8px; font-size: 12px; color: #666; line-height: 1.5; }',
      '.order-customer-search__input { box-sizing: border-box; width: 100%; padding: 8px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px; }',
      '.order-customer-search__suggestions { position: absolute; z-index: 1000; top: calc(100% - 4px); left: 12px; right: 12px; max-height: 220px; margin: 0; padding: 4px 0; overflow-y: auto; list-style: none; border: 1px solid #ccc; border-radius: 4px; background: #fff; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12); }',
      '.order-customer-search__suggestions li { padding: 8px 10px; font-size: 13px; line-height: 1.5; cursor: pointer; }',
      '.order-customer-search__suggestions li:hover { background: #eef6ff; }',
      '.order-customer-search__suggestions li.is-empty { color: #888; cursor: default; }',
      '.order-customer-search__code { display: block; color: #666; font-size: 12px; }',
    ].join('\n');

    document.head.appendChild(style);

  };

  const mountCustomerSearchUi = () => {

    if (document.getElementById(SEARCH_BOX_ID)) {
      return;
    }

    ensureSearchStyles();

    const codeFieldElement = kintone.app.record.getFieldElement(FIELDS.customerCode);
    const anchor = codeFieldElement?.closest('.control-gaia')
      || codeFieldElement?.parentElement
      || kintone.app.record.getSpaceElement('customer_search_space');

    if (!anchor) {
      console.warn('[受注明細 顧客名検索] 設置位置が見つかりません。');
      return;
    }

    const box = document.createElement('div');
    box.id = SEARCH_BOX_ID;
    box.className = 'order-customer-search';
    box.innerHTML = (
      '<label class="order-customer-search__label" for="' + SEARCH_INPUT_ID + '">顧客名で検索（部分一致）</label>' +
      '<p class="order-customer-search__note">例: 「山田」で検索できます。株式会社・有限会社は省略可。選択すると顧客コードへ反映されます。</p>' +
      '<input type="text" id="' + SEARCH_INPUT_ID + '" class="order-customer-search__input" autocomplete="off" placeholder="顧客名の一部を入力">' +
      '<ul id="' + SUGGESTIONS_ID + '" class="order-customer-search__suggestions" hidden></ul>'
    );

    if (anchor.id === 'customer_search_space' || anchor.classList.contains('space-field-gaia')) {
      anchor.appendChild(box);
    } else {
      anchor.parentElement.insertBefore(box, anchor);
    }

    const searchInput = document.getElementById(SEARCH_INPUT_ID);
    const record = kintone.app.record.get().record;
    const currentName = String(getFieldValue(record, FIELDS.customerName) ?? '').trim();

    if (currentName) {
      searchInput.value = currentName;
    }

    searchInput.addEventListener('input', () => {

      window.clearTimeout(searchTimer);

      const keyword = String(searchInput.value ?? '').trim();

      if (!keyword) {
        hideSuggestions();
        return;
      }

      searchTimer = window.setTimeout(() => {
        runCustomerSearch(keyword);
      }, 300);

    });

    searchInput.addEventListener('keydown', async (event) => {

      if (event.key !== 'Enter') {
        return;
      }

      event.preventDefault();

      const keyword = String(searchInput.value ?? '').trim();

      if (!keyword) {
        return;
      }

      window.clearTimeout(searchTimer);

      try {

        const records = await searchCustomersByKeyword(keyword, 20);

        if (records.length === 1) {
          applyCustomerToRecord(records[0]);
          return;
        }

        if (records.length === 0) {
          alert('該当する顧客が見つかりません。');
          return;
        }

        renderSuggestions(records);
        alert('該当する顧客が ' + records.length + ' 件あります。一覧から選択してください。');

      } catch (error) {

        alert(error?.message || '顧客検索に失敗しました。');

      }

    });

    searchInput.addEventListener('blur', () => {
      window.setTimeout(() => {
        hideSuggestions();
      }, 150);
    });

  };

  kintone.events.on([
    'app.record.create.show',
    'app.record.edit.show',
  ], (event) => {

    if (!isOrderApp()) {
      return event;
    }

    latestSearchToken += 1;
    window.clearTimeout(searchTimer);

    setTimeout(() => {
      mountCustomerSearchUi();
    }, 300);

    return event;

  });

})();
