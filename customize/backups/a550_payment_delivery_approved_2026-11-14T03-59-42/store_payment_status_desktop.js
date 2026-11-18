(function () {
  'use strict';

  /**
   * App16 店舗受注一覧・詳細 — 入金状況の表示／変更／絞り込み
   * A550 のみ編集可。法人行は読取専用。本番フィールド追加は別承認後。
   */

  const S = () => {
    if (typeof window.CAYANAS_StorePaymentStatus === 'undefined') {
      throw new Error('[store_payment_status_desktop] store_payment_status.js を先に読み込んでください。');
    }
    return window.CAYANAS_StorePaymentStatus;
  };

  const ROOT_ID = 'cayan-sps-filter-bar';
  const FILTER_PARAM = 'sps';

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const api = (path, method, body) => kintone.api(kintone.api.url(path, true), method, body);

  const currentFilter = () => {
    try {
      const params = new URLSearchParams(window.location.search || '');
      return params.get(FILTER_PARAM) || '';
    } catch (e) {
      return '';
    }
  };

  const buildQueryForStatus = (status) => {
    const Sp = S();
    const base = Sp.FIELD_CODE + ' in ("' + status.replace(/"/g, '\\"') + '")'
      + ' and customer_code = "' + Sp.STORE_CUSTOMER_CODE + '"';
    return base;
  };

  const applyFilter = (status) => {
    const appId = kintone.app.getId();
    if (!status) {
      window.location.href = '/k/' + appId + '/';
      return;
    }
    const query = buildQueryForStatus(status);
    window.location.href = '/k/' + appId + '/?query=' + encodeURIComponent(query);
  };

  const ensureFilterBar = (event) => {
    const Sp = S();
    const header = kintone.app.getHeaderMenuSpaceElement
      && kintone.app.getHeaderMenuSpaceElement();
    if (!header) {
      return;
    }
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      root.className = 'cayan-sps-bar';
      header.appendChild(root);
    }
    const active = currentFilter() || (event && event.query && detectStatusFromQuery(event.query)) || '';
    root.innerHTML = (
      '<span class="cayan-sps-bar__label">' + escapeHtml(Sp.FIELD_LABEL) + '絞り込み</span>'
      + '<div class="cayan-sps-bar__filters">'
      + Sp.ALL.map((st) => (
        '<button type="button" class="cayan-sps-bar__btn'
        + (active === st ? ' is-active' : '')
        + '" data-sps="' + escapeHtml(st) + '">' + escapeHtml(st) + '</button>'
      )).join('')
      + '<button type="button" class="cayan-sps-bar__btn" data-sps="">すべて</button>'
      + '</div>'
      + '<span class="cayan-sps-bar__hint">A550のみ。変更はApp16に保存（変更履歴で確認可）</span>'
    );
    root.querySelectorAll('[data-sps]').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyFilter(btn.getAttribute('data-sps') || '');
      });
    });
  };

  const detectStatusFromQuery = (query) => {
    const Sp = S();
    const q = String(query || '');
    for (let i = 0; i < Sp.ALL.length; i += 1) {
      const st = Sp.ALL[i];
      if (q.indexOf(Sp.FIELD_CODE) >= 0 && q.indexOf('"' + st + '"') >= 0) {
        return st;
      }
    }
    return '';
  };

  const badgeClass = (status) => {
    const Sp = S();
    const n = Sp.normalizeStatus(status) || Sp.STATUS.unpaid;
    if (n === Sp.STATUS.paid) {
      return 'is-paid';
    }
    if (n === Sp.STATUS.partial) {
      return 'is-partial';
    }
    return 'is-unpaid';
  };

  const putStatus = async (recordId, revision, nextStatus) => {
    const Sp = S();
    const body = {
      app: kintone.app.getId(),
      id: recordId,
      record: {},
    };
    body.record[Sp.FIELD_CODE] = { value: nextStatus };
    if (revision != null && revision !== '') {
      body.revision = String(revision);
    }
    return api('/k/v1/record.json', 'PUT', body);
  };

  const confirmDeliveredChange = (deliveryStatus, nextStatus) => {
    if (String(deliveryStatus || '').trim() !== '納品済') {
      return true;
    }
    return window.confirm(
      'この受注は既に納品済です。\n入金状況を「'
      + nextStatus
      + '」に変更しますか？\n（変更は App16 の変更履歴に残ります）'
    );
  };

  const mountIndexEditors = (event) => {
    const Sp = S();
    const records = event.records || [];
    records.forEach((record, index) => {
      const customerCode = Sp.readValue(record, 'customer_code');
      const isStore = Sp.isStoreCustomer(customerCode);
      const recordId = String(record.$id && record.$id.value);
      const revision = String(record.$revision && record.$revision.value || '');
      const deliveryStatus = Sp.readValue(record, 'delivery_status');
      const current = Sp.normalizeStatus(Sp.readValue(record, Sp.FIELD_CODE)) || Sp.STATUS.unpaid;

      let el = null;
      try {
        el = kintone.app.getFieldElements
          ? (kintone.app.getFieldElements(Sp.FIELD_CODE) || [])[index]
          : null;
      } catch (e) {
        el = null;
      }
      if (!el) {
        return;
      }
      el.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'cayan-sps-cell';

      if (!isStore) {
        wrap.innerHTML = '<span class="cayan-sps-badge is-unpaid">—</span>';
        el.appendChild(wrap);
        return;
      }

      const select = document.createElement('select');
      select.setAttribute('aria-label', Sp.FIELD_LABEL);
      Sp.ALL.forEach((st) => {
        const opt = document.createElement('option');
        opt.value = st;
        opt.textContent = st;
        if (st === current) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });

      select.addEventListener('change', async () => {
        const next = select.value;
        if (next === current) {
          return;
        }
        if (!confirmDeliveredChange(deliveryStatus, next)) {
          select.value = current;
          return;
        }
        wrap.classList.add('is-busy');
        try {
          const resp = await putStatus(recordId, revision, next);
          if (resp && resp.revision) {
            record.$revision = { value: String(resp.revision) };
          }
          if (record[Sp.FIELD_CODE]) {
            record[Sp.FIELD_CODE].value = next;
          }
          select.value = next;
        } catch (err) {
          window.alert('入金状況の更新に失敗しました: '
            + (err && err.message ? err.message : String(err)));
          select.value = current;
        } finally {
          wrap.classList.remove('is-busy');
        }
      });

      wrap.appendChild(select);
      el.appendChild(wrap);
    });
  };

  const onDetailShow = (event) => {
    const Sp = S();
    const record = event.record || {};
    const customerCode = Sp.readValue(record, 'customer_code');
    const isStore = Sp.isStoreCustomer(customerCode);
    const field = record[Sp.FIELD_CODE];
    if (!field) {
      return event;
    }
    if (!isStore) {
      field.disabled = true;
      return event;
    }
    field.disabled = false;
    const deliveryStatus = Sp.readValue(record, 'delivery_status');
    if (deliveryStatus === '納品済') {
      const space = (kintone.app.record.getHeaderMenuSpaceElement
        && kintone.app.record.getHeaderMenuSpaceElement())
        || (kintone.app.record.getSpaceElement
          && kintone.app.record.getSpaceElement('store_payment_status_space'));
      if (space && !document.getElementById('cayan-sps-delivered-warn')) {
        const warn = document.createElement('div');
        warn.id = 'cayan-sps-delivered-warn';
        warn.className = 'cayan-sps-warn';
        warn.textContent = '納品済の受注です。入金状況の変更は慎重に行ってください（変更履歴に残ります）。';
        space.appendChild(warn);
      }
    }
    return event;
  };

  const onCreateShow = (event) => {
    const Sp = S();
    const record = event.record || {};
    const customerCode = Sp.readValue(record, 'customer_code');
    if (!record[Sp.FIELD_CODE]) {
      return event;
    }
    if (!Sp.isStoreCustomer(customerCode)) {
      record[Sp.FIELD_CODE].value = '';
      record[Sp.FIELD_CODE].disabled = true;
      return event;
    }
    if (!Sp.normalizeStatus(record[Sp.FIELD_CODE].value)) {
      record[Sp.FIELD_CODE].value = Sp.STATUS.unpaid;
    }
    record[Sp.FIELD_CODE].disabled = false;
    return event;
  };

  const onSubmit = (event) => {
    const Sp = S();
    const record = event.record || {};
    if (!record[Sp.FIELD_CODE]) {
      return event;
    }
    const customerCode = Sp.readValue(record, 'customer_code');
    if (!Sp.isStoreCustomer(customerCode)) {
      // 法人には影響させない（空のまま）
      record[Sp.FIELD_CODE].value = '';
      return event;
    }
    const normalized = Sp.normalizeStatus(record[Sp.FIELD_CODE].value) || Sp.STATUS.unpaid;
    record[Sp.FIELD_CODE].value = normalized;
    return event;
  };

  kintone.events.on('app.record.index.show', (event) => {
    try {
      ensureFilterBar(event);
      mountIndexEditors(event);
    } catch (err) {
      console.error('[store_payment_status_desktop]', err);
    }
    return event;
  });

  kintone.events.on([
    'app.record.detail.show',
    'app.record.edit.show',
  ], (event) => {
    try {
      return onDetailShow(event);
    } catch (err) {
      console.error('[store_payment_status_desktop]', err);
      return event;
    }
  });

  kintone.events.on([
    'app.record.create.show',
  ], (event) => {
    try {
      return onCreateShow(event);
    } catch (err) {
      console.error('[store_payment_status_desktop]', err);
      return event;
    }
  });

  kintone.events.on([
    'app.record.create.submit',
    'app.record.edit.submit',
  ], (event) => {
    try {
      return onSubmit(event);
    } catch (err) {
      console.error('[store_payment_status_desktop]', err);
      return event;
    }
  });

  // customer_code 変更時に編集可否を切替
  kintone.events.on([
    'app.record.create.change.customer_code',
    'app.record.edit.change.customer_code',
  ], (event) => {
    try {
      return onCreateShow(event);
    } catch (err) {
      return event;
    }
  });
}());
