(function () {
  'use strict';

  /**
   * App16 A550 詳細 — 店舗納品書作成への導線（法人は非表示）
   */

  const ORDER_APP_ID = 16;
  const DELIVERY_APP_ID = 19;
  const STORE_CUSTOMER_CODE = 'A550';
  const BUTTON_ID = 'cayan-store-delivery-create-link';

  if (typeof kintone === 'undefined') {
    return;
  }

  kintone.events.on('app.record.detail.show', (event) => {
    if (Number(kintone.app.getId()) !== ORDER_APP_ID) {
      return event;
    }

    const code = String(event.record.customer_code && event.record.customer_code.value || '').trim();
    const existing = document.getElementById(BUTTON_ID);

    if (code !== STORE_CUSTOMER_CODE) {
      if (existing) {
        existing.remove();
      }
      return event;
    }

    if (existing) {
      return event;
    }

    const space = kintone.app.record.getHeaderMenuSpaceElement()
      || document.querySelector('.gaia-argoui-app-toolbar')
      || document.body;

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = '店舗納品書を作成';
    button.className = 'gaia-ui-actionmenu-save';
    button.style.marginLeft = '8px';
    button.addEventListener('click', () => {
      const url = '/k/' + DELIVERY_APP_ID + '/edit';
      window.open(url, '_blank');
    });
    space.appendChild(button);

    return event;
  });

}());
