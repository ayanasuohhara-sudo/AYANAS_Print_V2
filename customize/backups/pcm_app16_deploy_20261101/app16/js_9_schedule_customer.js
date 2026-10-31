(function (global) {
  'use strict';

  /**
   * App16 一覧「顧客別納期スケジュール」(VIEW 5521026)
   * 顧客コード入力検索 + 顧客選択ドロップダウン。
   * 納品済は除外し、未納品・納品待ち・空欄を表示する。
   * process_status は条件に含めない。
   * schedule_customer2.js は無効化のまま（本ファイルに統合）。
   */

  const APP_ID = 16;
  const VIEW_ID = 5521026;
  const DELIVERY_DONE = '納品済';
  const UI_ROOT_ID = 'schedule-customer-toolbar';

  const escapeQueryValue = (value) => String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

  const quote = (value) => '"' + escapeQueryValue(value) + '"';

  /**
   * 顧客コード検索用クエリ。納品済を除外（ドロップダウンは != 不可）。
   * @param {string} customerCode
   * @returns {string}
   */
  const buildCustomerSearchQuery = (customerCode) => {
    const code = String(customerCode ?? '').trim();
    if (!code) {
      return '';
    }
    return (
      'customer_code = ' + quote(code)
      + ' and (delivery_status not in (' + quote(DELIVERY_DONE) + ')'
      + ' or delivery_status in (""))'
    );
  };

  const undeliveredCondition = () => (
    '(delivery_status not in (' + quote(DELIVERY_DONE) + ')'
    + ' or delivery_status in (""))'
  );

  /**
   * 未納品系レコードから顧客コード→顧客名のマップを作る。
   * @param {Array<{customer_code?: {value?: string}, customer_name?: {value?: string}}>} records
   * @returns {Object<string, string>}
   */
  const buildCustomerMap = (records) => {
    const customers = {};
    (records || []).forEach((rec) => {
      const code = String(rec?.customer_code?.value ?? '').trim();
      const name = String(rec?.customer_name?.value ?? '').trim();
      if (code) {
        customers[code] = name;
      }
    });
    return customers;
  };

  const buildViewUrl = (query) => {
    let url = location.origin + '/k/' + APP_ID + '/?view=' + VIEW_ID;
    if (query) {
      url += '&query=' + encodeURIComponent(query);
    }
    return url;
  };

  const navigateByCustomerCode = (customerCode) => {
    const code = String(customerCode ?? '').trim();
    location.href = buildViewUrl(code ? buildCustomerSearchQuery(code) : '');
  };

  const api = {
    APP_ID: APP_ID,
    VIEW_ID: VIEW_ID,
    DELIVERY_DONE: DELIVERY_DONE,
    escapeQueryValue: escapeQueryValue,
    buildCustomerSearchQuery: buildCustomerSearchQuery,
    buildCustomerMap: buildCustomerMap,
    undeliveredCondition: undeliveredCondition,
  };

  if (typeof global !== 'undefined') {
    global.CAYANAS_ScheduleCustomer = api;
  }

  if (typeof kintone === 'undefined') {
    return;
  }

  kintone.events.on('app.record.index.show', async function (event) {

    if (event.viewId !== VIEW_ID) {
      return event;
    }

    if (document.getElementById(UI_ROOT_ID)
      || document.getElementById('customer-code-search')
      || document.getElementById('customer-filter')) {
      return event;
    }

    const space = kintone.app.getHeaderMenuSpaceElement();
    const root = document.createElement('span');
    root.id = UI_ROOT_ID;
    root.style.display = 'inline-flex';
    root.style.alignItems = 'center';
    root.style.flexWrap = 'wrap';
    root.style.gap = '4px';

    const selectLabel = document.createElement('span');
    selectLabel.innerHTML = '<b>顧客選択：</b>';
    selectLabel.style.marginRight = '4px';

    const select = document.createElement('select');
    select.id = 'customer-filter';
    select.style.height = '34px';
    select.style.fontSize = '14px';
    select.style.marginRight = '10px';
    select.style.maxWidth = '280px';

    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.text = '全顧客';
    select.appendChild(allOption);

    const loadingOption = document.createElement('option');
    loadingOption.value = '';
    loadingOption.text = '読込中...';
    loadingOption.disabled = true;
    select.appendChild(loadingOption);

    const codeLabel = document.createElement('span');
    codeLabel.innerText = '顧客コード：';
    codeLabel.style.marginRight = '5px';

    const input = document.createElement('input');
    input.id = 'customer-code-search';
    input.type = 'text';
    input.placeholder = 'm032';
    input.style.height = '34px';
    input.style.width = '120px';
    input.style.marginRight = '5px';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerText = '検索';
    btn.style.marginRight = '5px';

    const btnAll = document.createElement('button');
    btnAll.type = 'button';
    btnAll.innerText = '全件';

    const goSearch = () => {
      const code = input.value.trim();
      if (!code) {
        alert('顧客コードを入力してください');
        return;
      }
      navigateByCustomerCode(code);
    };

    btn.onclick = goSearch;

    btnAll.onclick = function () {
      navigateByCustomerCode('');
    };

    select.onchange = function () {
      if (!select.value) {
        navigateByCustomerCode('');
        return;
      }
      input.value = select.value;
      navigateByCustomerCode(select.value);
    };

    input.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        goSearch();
      }
    });

    root.appendChild(selectLabel);
    root.appendChild(select);
    root.appendChild(codeLabel);
    root.appendChild(input);
    root.appendChild(btn);
    root.appendChild(btnAll);
    space.appendChild(root);

    try {
      const resp = await kintone.api(
        kintone.api.url('/k/v1/records.json', true),
        'GET',
        {
          app: APP_ID,
          fields: ['customer_code', 'customer_name'],
          query: undeliveredCondition() + ' limit 500',
        }
      );

      const customers = buildCustomerMap(resp.records);

      while (select.options.length > 1) {
        select.remove(1);
      }

      Object.keys(customers)
        .sort()
        .forEach((code) => {
          const option = document.createElement('option');
          option.value = code;
          option.text = code + ' ' + customers[code];
          select.appendChild(option);
        });

      const params = new URLSearchParams(location.search);
      const query = params.get('query') || '';
      const matched = query.match(/customer_code\s*=\s*"((?:\\.|[^"\\])*)"/);
      if (matched) {
        const selectedCode = matched[1]
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        if (customers[selectedCode] !== undefined || selectedCode) {
          if (![...select.options].some((o) => o.value === selectedCode)) {
            const option = document.createElement('option');
            option.value = selectedCode;
            option.text = selectedCode;
            select.appendChild(option);
          }
          select.value = selectedCode;
          input.value = selectedCode;
        }
      }
    } catch (e) {
      console.error('[schedule_customer] customer dropdown load failed', e);
      if (loadingOption.parentNode === select) {
        loadingOption.text = '読込失敗';
      }
    }

    return event;

  });

})(typeof window !== 'undefined' ? window : global);
