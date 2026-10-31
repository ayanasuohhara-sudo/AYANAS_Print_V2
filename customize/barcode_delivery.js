(function() {
  'use strict';

  /**
   * App19 納品書作成 — バーコードで受注明細を追加する。
   * 手入力は barcode_input の change（フォーカス移動）で取り込む。
   * バーコードリーダーは末尾の Enter で change が走る前に保存へ進むため、
   * Enter を先に受けて同じ取り込みを行う。
   */

  const ORDER_APP_ID = 16;
  const DELIVERY_APP_ID = 19;
  const BARCODE_FIELD = 'barcode_input';

  const BLANK_TEXT_FIELDS = [
    'manage_no',
    'client_name',
    'kimono_type',
    'kimono_spec',
    'item_code',
    'item_name',
    'slip_no',
    'in_charge',
  ];
  const BLANK_NUMBER_FIELDS = ['qty', 'unit_price', 'amount'];

  const isBlankCell = (value) => {
    if (value === null || value === undefined) {
      return true;
    }

    return String(value).trim() === '';
  };

  const isInitialBlankDetailRow = (row) => {
    const value = row && row.value ? row.value : null;

    if (!value) {
      return false;
    }

    for (let i = 0; i < BLANK_TEXT_FIELDS.length; i += 1) {
      const field = value[BLANK_TEXT_FIELDS[i]];

      if (field && !isBlankCell(field.value)) {
        return false;
      }
    }

    for (let i = 0; i < BLANK_NUMBER_FIELDS.length; i += 1) {
      const field = value[BLANK_NUMBER_FIELDS[i]];

      if (!field || isBlankCell(field.value)) {
        continue;
      }

      const number = Number(field.value);

      if (!Number.isNaN(number) && number !== 0) {
        return false;
      }
    }

    return true;
  };

  const placeDetailRows = (existingRows, builtRows) => {
    const rows = (existingRows || []).slice();
    let blankIndex = rows.findIndex(isInitialBlankDetailRow);

    builtRows.forEach((built) => {
      if (blankIndex >= 0) {
        const existing = rows[blankIndex];
        rows[blankIndex] = existing && existing.id
          ? { id: existing.id, value: built.value }
          : built;
        blankIndex = -1;
        return;
      }

      rows.push(built);
    });

    return rows;
  };

  window.CAYANAS_BarcodeDelivery = {
    isInitialBlankDetailRow: isInitialBlankDetailRow,
    placeDetailRows: placeDetailRows,
  };

  if (typeof kintone === 'undefined' || kintone.app.getId() !== DELIVERY_APP_ID) {
    return;
  }

  let inFlight = false;

  const normalizeBarcode = (value) => {
    let text = String(value ?? '').replace(/[\r\n\t]/g, '').trim();
    const wrapped = text.match(/^\*(.+)\*$/);

    if (wrapped) {
      text = wrapped[1].trim();
    }

    return text;
  };

  const isEnterKey = (event) => (
    event.key === 'Enter'
    || event.key === 'NumpadEnter'
    || event.keyCode === 13
  );

  const focusBarcodeInput = () => {
    setTimeout(() => {
      const field = kintone.app.record.getFieldElement(BARCODE_FIELD);
      const input = field && field.querySelector('input');

      if (input) {
        input.focus();
        input.select();
      }
    }, 100);
  };

  const buildDetailRow = (order, detailRow) => ({
    value: {
      manage_no: {
        type: 'SINGLE_LINE_TEXT',
        value: order.manage_no.value
      },
      client_name: {
        type: 'SINGLE_LINE_TEXT',
        value: order.client_name.value || ''
      },
      kimono_type: {
        type: 'SINGLE_LINE_TEXT',
        value: order.kimono_type.value || ''
      },
      kimono_spec: {
        type: 'DROP_DOWN',
        value: order.kimono_spec.value || ''
      },
      item_name: {
        type: 'SINGLE_LINE_TEXT',
        value: detailRow.value.item_name.value || ''
      },
      qty: {
        type: 'NUMBER',
        value: detailRow.value.qty.value || 0
      },
      unit_price: {
        type: 'NUMBER',
        value: detailRow.value.unit_price.value || 0
      },
      amount: {
        type: 'CALC',
        value: ''
      },
      slip_no: {
        type: 'SINGLE_LINE_TEXT',
        value: order.slip_no.value || ''
      },
      in_charge: {
        type: 'SINGLE_LINE_TEXT',
        value: order.in_charge.value || ''
      }
    }
  });

  async function addDetail(rawBarcode) {
    const barcode = normalizeBarcode(rawBarcode);

    if (!barcode || inFlight) {
      return;
    }

    inFlight = true;

    try {
      const resp = await kintone.api(
        kintone.api.url('/k/v1/records.json', true),
        'GET',
        {
          app: ORDER_APP_ID,
          query: 'manage_no = "' + barcode.replace(/"/g, '\\"') + '" limit 2'
        }
      );

      if (resp.records.length === 0) {
        alert('管理番号が見つかりません\n' + barcode);
        return;
      }

      if (resp.records.length >= 2) {
        alert('管理番号が複数あります\n' + barcode);
        return;
      }

      const order = resp.records[0];
      const appRecord = kintone.app.record.get();
      const record = appRecord.record;

      if (!record.customer_code.value) {
        record.customer_code.value = order.customer_code.value || '';
        record.customer_name.value = order.customer_name.value || '';
      }

      const exists = record.delivery_detail.value.some((row) => (
        row.value.manage_no
        && normalizeBarcode(row.value.manage_no.value) === barcode
      ));

      if (exists) {
        alert('既に追加済みです\n' + barcode);
        record.barcode_input.value = '';
        kintone.app.record.set(appRecord);
        return;
      }

      const details = order.detail_table && order.detail_table.value;

      if (!details || details.length === 0) {
        alert('受注明細がありません\n' + barcode);
        return;
      }

      const builtRows = details.map((detailRow) => buildDetailRow(order, detailRow));
      record.delivery_detail.value = placeDetailRows(record.delivery_detail.value, builtRows);

      record.barcode_input.value = '';
      kintone.app.record.set(appRecord);

      if (
        window.CAYANAS_priceMasterRegister
        && window.CAYANAS_priceMasterRegister.seedFromRecord
      ) {
        window.CAYANAS_priceMasterRegister.seedFromRecord(record);
      }
    } catch (err) {
      console.error(err);
      alert('エラー\n\n' + (err.message || String(err)));
    } finally {
      inFlight = false;
      focusBarcodeInput();
    }
  }

  if (!window.__CAYANAS_DELIVERY_BARCODE_ENTER) {
    window.__CAYANAS_DELIVERY_BARCODE_ENTER = true;

    document.addEventListener('keydown', (event) => {
      if (kintone.app.getId() !== DELIVERY_APP_ID || !isEnterKey(event)) {
        return;
      }

      const field = kintone.app.record.getFieldElement(BARCODE_FIELD);

      if (!field || !field.contains(event.target)) {
        return;
      }

      const raw = event.target.value;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      setTimeout(() => {
        addDetail(raw);
      }, 30);
    }, true);
  }

  kintone.events.on(
    [
      'app.record.create.change.barcode_input',
      'app.record.edit.change.barcode_input'
    ],
    (event) => {
      const barcode = normalizeBarcode(event.record.barcode_input.value);

      if (barcode && !inFlight) {
        addDetail(barcode);
      }

      return event;
    }
  );

  kintone.events.on(
    [
      'app.record.create.show',
      'app.record.edit.show'
    ],
    (event) => {
      focusBarcodeInput();
      return event;
    }
  );

})();
