(function() {
  'use strict';

  /**
   * 和裁士支払明細 App 75 — 一覧・詳細 UI
   * 依存: wasai_config.js → wasai_payment_create.js
   */

  if (!window.CAYANAS_Wasai || !window.CAYANAS_WasaiPayment) {
    console.error('[wasai_payment_desktop] wasai_config.js / wasai_payment_create.js を先に読み込んでください。');
    return;
  }

  const W = window.CAYANAS_Wasai;
  const Pay = window.CAYANAS_WasaiPayment;
  const APP_ID = W.APP.wasaiPayment;

  if (kintone.app.getId() !== APP_ID) {
    return;
  }

  const LIST_BUTTON_ID = 'wasai-payment-create-btn';
  const DETAIL_PANEL_ID = 'wasai-payment-detail-actions';

  const currentYm = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  };

  const promptCreate = async () => {
    const wasaiCode = window.prompt('和裁士コードを入力してください');

    if (!wasaiCode) {
      return;
    }

    const inboundYm = window.prompt('入庫対象月（YYYY-MM）', currentYm());

    if (!inboundYm) {
      return;
    }

    const masterRecords = await W.fetchRecords(
      W.APP.wasaiMaster,
      W.F.wasaiCode + ' = "' + W.escapeQueryValue(wasaiCode.trim()) + '" limit 1'
    );
    const master = masterRecords[0];
    const wasaiName = master ? W.getFieldValue(master, W.F.wasaiName) : '';
    const tradeName = master ? W.getFieldValue(master, W.F.tradeName) : '';

    const preview = await Pay.fetchPayableLines(wasaiCode.trim(), inboundYm.trim());

    if (preview.length === 0) {
      window.alert('対象明細がありません。');
      return;
    }

    const total = preview.reduce(function(sum, entry) {
      const paymentAmount = W.getFieldValue(entry.lineValues, W.LINE.paymentAmount);
      const base = W.getFieldValue(entry.lineValues, W.LINE.basePaymentAmount);
      const amount = paymentAmount !== '' && paymentAmount != null
        ? W.toNumber(paymentAmount)
        : W.toNumber(base);

      return sum + amount;
    }, 0);

    const ok = window.confirm(
      '和裁士: ' + wasaiCode.trim() + '\n'
      + '入庫月: ' + inboundYm.trim() + '\n'
      + '件数: ' + preview.length + '\n'
      + '支払合計: ' + total.toLocaleString() + ' 円\n\n'
      + '支払明細を作成しますか？'
    );

    if (!ok) {
      return;
    }

    const result = await Pay.createPaymentStatement(
      wasaiCode.trim(),
      inboundYm.trim(),
      wasaiName,
      tradeName
    );

    window.alert(
      '作成しました\n'
      + '番号: ' + result.paymentStatementNo + '\n'
      + '件数: ' + result.count
    );

    window.location.href = '/k/' + APP_ID + '/show#record=' + result.recordId;
  };

  const renderListButton = () => {
    if (document.getElementById(LIST_BUTTON_ID)) {
      return;
    }

    const header = kintone.app.getHeaderMenuSpaceElement();

    if (!header) {
      return;
    }

    const btn = document.createElement('button');
    btn.id = LIST_BUTTON_ID;
    btn.type = 'button';
    btn.textContent = '支払明細作成';
    btn.className = 'kintoneplugin-button-dialog-ok';
    btn.style.margin = '8px';
    btn.onclick = function() {
      promptCreate().catch(function(err) {
        window.alert(W.formatKintoneError(err));
      });
    };

    header.appendChild(btn);
  };

  const renderDetailActions = (event) => {
    const space = kintone.app.record.getSpaceElement('action_space');

    if (!space || document.getElementById(DETAIL_PANEL_ID)) {
      return;
    }

    const recordId = event.record.$id.value;
    const status = String(W.getFieldValue(event.record, W.F.paymentStatus) ?? '').trim();

    const panel = document.createElement('div');
    panel.id = DETAIL_PANEL_ID;
    panel.style.cssText = 'padding:12px;margin:8px 0;border:1px solid #ccc;';

    const mkBtn = (label, handler) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.style.marginRight = '8px';
      btn.onclick = function() {
        handler().catch(function(err) {
          window.alert(W.formatKintoneError(err));
        });
      };

      return btn;
    };

    if (status === W.PAYMENT_STATUS.drafting) {
      panel.appendChild(mkBtn('明細を確定', function() {
        if (!window.confirm('確定すると出庫明細が計上済になります。よろしいですか？')) {
          return Promise.resolve();
        }

        return Pay.confirmPaymentStatement(recordId).then(function() {
          location.reload();
        });
      }));

      panel.appendChild(mkBtn('作成取消', function() {
        if (!window.confirm('支払明細を取消し、出庫明細を未計上に戻します。')) {
          return Promise.resolve();
        }

        return Pay.cancelPaymentStatement(recordId).then(function() {
          location.reload();
        });
      }));
    }

    if (status === W.PAYMENT_STATUS.confirmed) {
      panel.appendChild(mkBtn('支払済にする', function() {
        const paymentDate = window.prompt('支払日（YYYY-MM-DD）', currentYm().replace(/-(\d)$/, '-0$1') + '-01');

        if (paymentDate === null) {
          return Promise.resolve();
        }

        return Pay.markPaymentPaid(recordId, paymentDate).then(function() {
          location.reload();
        });
      }));

      panel.appendChild(mkBtn('確定取消', function() {
        if (!window.confirm('確定を取消しますか？')) {
          return Promise.resolve();
        }

        return Pay.cancelPaymentStatement(recordId).then(function() {
          location.reload();
        });
      }));
    }

    if (panel.childNodes.length > 0) {
      space.appendChild(panel);
    }
  };

  kintone.events.on('app.record.index.show', function(event) {
    renderListButton();
    return event;
  });

  kintone.events.on(['app.record.detail.show', 'app.record.edit.show'], function(event) {
    renderDetailActions(event);
    return event;
  });

})();
