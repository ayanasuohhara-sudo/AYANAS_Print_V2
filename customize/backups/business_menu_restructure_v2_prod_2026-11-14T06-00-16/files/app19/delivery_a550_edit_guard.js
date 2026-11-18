(function () {
  'use strict';

  /**
   * App19 A550 納品書の編集ガード（v1）。
   * 自動巻き戻しはしない。明細削除・変更が App16 と不整合になり得ることを警告する。
   */

  const DELIVERY_APP_ID = 19;
  const A550 = 'A550';

  const FIELD = {
    customerCode: 'customer_code',
    deliveryNo: 'delivery_no',
    detailTable: 'delivery_detail',
    manageNo: 'manage_no',
  };

  const read = (record, code) => {
    const field = record?.[code];
    if (!field || field.value === null || field.value === undefined) {
      return '';
    }
    return String(field.value).trim();
  };

  const collectManageNos = (record) => {
    const table = record?.[FIELD.detailTable];
    const rows = Array.isArray(table?.value) ? table.value : [];
    const set = new Set();

    rows.forEach((row) => {
      const manageNo = String(row?.value?.[FIELD.manageNo]?.value ?? '').trim();
      if (manageNo) {
        set.add(manageNo);
      }
    });

    return set;
  };

  const isA550WithSlip = (record) => (
    read(record, FIELD.customerCode) === A550
    && Boolean(read(record, FIELD.deliveryNo))
  );

  const WARNING =
    '【注意】この納品書は既に App16 へ納品書番号が反映済みです。\n\n'
    + '・明細の削除・変更をしても、App16 の delivery_no / 納品待ちは自動では戻りません。\n'
    + '・訂正は管理者手順（docs/A550_DELIVERY_CORRECTION_RUNBOOK.md）に従ってください。\n\n'
    + 'このまま保存しますか？';

  if (typeof kintone === 'undefined') {
    return;
  }

  kintone.events.on('app.record.edit.show', (event) => {
    if (Number(kintone.app.getId()) !== Number(DELIVERY_APP_ID)) {
      return event;
    }

    if (!isA550WithSlip(event.record)) {
      return event;
    }

    try {
      const space = kintone.app.record.getSpaceElement
        ? kintone.app.record.getSpaceElement('a550_edit_warning')
        : null;
      const text =
        'A550・納品書番号反映済みです。明細削除は App16 を自動巻き戻しません。管理者手順を確認してください。';

      if (space) {
        space.textContent = text;
        space.style.cssText = 'color:#9f1239;font-weight:700;padding:8px 0;';
      } else {
        console.warn('[delivery_a550_edit_guard] ' + text);
      }
    } catch (error) {
      console.warn('[delivery_a550_edit_guard] show', error);
    }

    return event;
  });

  kintone.events.on('app.record.edit.submit', (event) => {
    if (Number(kintone.app.getId()) !== Number(DELIVERY_APP_ID)) {
      return event;
    }

    if (!isA550WithSlip(event.record)) {
      return event;
    }

    const manageCount = collectManageNos(event.record).size;
    const ok = window.confirm(
      WARNING + '\n（現在の明細管理番号: ' + manageCount + ' 件）'
    );

    if (!ok) {
      event.error = '保存を中止しました。';
      return event;
    }

    return event;
  });

  window.CAYANAS_DeliveryA550EditGuard = {
    isA550WithSlip: isA550WithSlip,
    WARNING: WARNING,
  };
}());
