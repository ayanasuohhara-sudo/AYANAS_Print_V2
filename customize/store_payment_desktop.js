(function() {
  'use strict';

  /**
   * S1 店舗入金管理 — レコード画面の最低限ガード
   * 店舗専用会計 UI は次段階。ここでは管理画面での誤操作防止のみ。
   */

  const C = window.CAYANAS_StorePayment;
  const Engine = window.CAYANAS_StorePayment_Engine;
  const Numbering = window.CAYANAS_StorePayment_Numbering;

  if (!C || !Engine || !Numbering) {
    console.error('[store_payment_desktop] config / engine / numbering を先に読み込んでください。');
    return;
  }

  const HF = C.HEADER_FIELDS;
  let allocating = false;

  const isS1App = () => {
    try {
      return Number(kintone.app.getId()) === Number(C.STORE_PAYMENT_APP_ID) && C.STORE_PAYMENT_APP_ID > 0;
    } catch (err) {
      return false;
    }
  };

  const showBanner = (text, isWarn) => {
    const id = 'stp-s1-banner';
    const existing = document.getElementById(id);
    if (existing) {
      existing.remove();
    }
    const bar = document.createElement('div');
    bar.id = id;
    bar.className = 'stp-s1-banner ' + (isWarn ? 'stp-s1-banner--warn' : 'stp-s1-banner--info');
    bar.textContent = text;
    const host = document.querySelector('.record-gaia') || document.body;
    host.insertAdjacentElement('afterbegin', bar);
  };

  kintone.events.on(['app.record.create.show', 'app.record.edit.show'], function(event) {
    if (!isS1App()) {
      return event;
    }

    if (!C.STORE_PAYMENT_APP_ID) {
      setTimeout(function() {
        showBanner('STORE_PAYMENT_APP_ID 未設定です。アプリ作成後に store_payment_config.js を更新してください。', true);
      }, 200);
      return event;
    }

    if (event.type.indexOf('create') >= 0) {
      if (event.record[HF.storePaymentNo]) {
        event.record[HF.storePaymentNo].value = '';
        event.record[HF.storePaymentNo].disabled = true;
      }
      if (event.record[HF.transactionId] && !event.record[HF.transactionId].value) {
        event.record[HF.transactionId].value = Engine.createTransactionId();
      }
      if (event.record[HF.paymentStatus] && !event.record[HF.paymentStatus].value) {
        event.record[HF.paymentStatus].value = C.PAYMENT_STATUS.active;
      }
      if (event.record[HF.paymentChannel] && !event.record[HF.paymentChannel].value) {
        event.record[HF.paymentChannel].value = C.PAYMENT_CHANNEL.store;
      }
      if (event.record[HF.recordKind] && !event.record[HF.recordKind].value) {
        event.record[HF.recordKind].value = C.RECORD_KIND.payment;
      }
      setTimeout(function() {
        showBanner(
          '税込正: tax = round(税抜合計×10%)（印刷プラグインと同型）。'
          + ' 一部入金での引き取りは原則禁止。返金はマイナス別レコード＋元入金番号必須。',
          false
        );
      }, 200);
    } else if (event.record[HF.storePaymentNo]) {
      event.record[HF.storePaymentNo].disabled = true;
      if (event.record[HF.transactionId]) {
        event.record[HF.transactionId].disabled = true;
      }
    }

    return event;
  });

  kintone.events.on('app.record.create.submit', async function(event) {
    if (!isS1App()) {
      return event;
    }
    if (!C.STORE_PAYMENT_APP_ID) {
      event.error = 'STORE_PAYMENT_APP_ID が未設定です。';
      return event;
    }

    const record = event.record;
    const kind = Engine.readValue(record, HF.recordKind) || C.RECORD_KIND.payment;
    const linesTable = record[HF.lines];
    const lines = ((linesTable && linesTable.value) || []).map(function(row) {
      const v = row.value || {};
      return {
        orderRecordId: Engine.readValue(v, C.LINE_FIELDS.orderRecordId),
        personalCustomerIdLine: Engine.readValue(v, C.LINE_FIELDS.personalCustomerIdLine),
        billedInTax: Engine.readValue(v, C.LINE_FIELDS.billedInTax),
        previouslyPaidAmount: Engine.readValue(v, C.LINE_FIELDS.previouslyPaidAmount),
        allocatedAmount: Engine.readValue(v, C.LINE_FIELDS.allocatedAmount),
      };
    });

    const draft = {
      personalCustomerId: Engine.readValue(record, HF.personalCustomerId),
      transactionId: Engine.readValue(record, HF.transactionId),
      paymentDate: Engine.readValue(record, HF.paymentDate),
      paymentAmount: Engine.readValue(record, HF.paymentAmount),
      recordKind: kind,
      relatedRefundOf: Engine.readValue(record, HF.relatedRefundOf),
      lines: lines,
    };

    const validated = Engine.validatePaymentDraft(draft);
    if (!validated.ok) {
      event.error = validated.errors.join('\n');
      return event;
    }

    if (kind === C.RECORD_KIND.refund && !draft.relatedRefundOf) {
      event.error = '返金は元入金番号が必須です。';
      return event;
    }

    if (allocating) {
      event.error = '採番処理中です。';
      return event;
    }

    allocating = true;
    try {
      if (!Engine.readValue(record, HF.storePaymentNo)) {
        const no = await Numbering.allocateNextStorePaymentNo();
        record[HF.storePaymentNo].value = no;
      }
      record[HF.storePaymentNo].disabled = true;
      if (record[HF.transactionId]) {
        record[HF.transactionId].disabled = true;
      }
      if (!Engine.readValue(record, HF.paymentStatus)) {
        record[HF.paymentStatus].value = C.PAYMENT_STATUS.active;
      }
    } catch (err) {
      event.error = '入金番号の採番に失敗しました: ' + (err && err.message ? err.message : String(err));
      return event;
    } finally {
      allocating = false;
    }

    return event;
  });

  kintone.events.on('app.record.edit.submit', function(event) {
    if (!isS1App()) {
      return event;
    }

    const status = Engine.readValue(event.record, HF.paymentStatus);
    const prevNo = Engine.readValue(event.record, HF.storePaymentNo);
    if (!prevNo) {
      event.error = '入金番号がありません。';
      return event;
    }
    event.record[HF.storePaymentNo].disabled = true;
    event.record[HF.storePaymentNo].value = prevNo;
    if (event.record[HF.transactionId]) {
      event.record[HF.transactionId].disabled = true;
    }

    if (status === C.PAYMENT_STATUS.cancelled && !Engine.readValue(event.record, HF.cancelReason)) {
      event.error = '取消時は理由を入力してください。';
      return event;
    }

    return event;
  });
}());
