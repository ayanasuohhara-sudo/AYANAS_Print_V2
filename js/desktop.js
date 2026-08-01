(function () {
  'use strict';

  kintone.events.on('app.record.detail.show', function (event) {

    if (document.getElementById('ayanas-print-btn')) {
      return event;
    }

    const space = kintone.app.record.getHeaderMenuSpaceElement();

    if (!space) {
      return event;
    }

    const button = document.createElement('button');
    button.id = 'ayanas-print-btn';
    button.textContent = '印刷';

    button.style.padding = '8px 16px';
    button.style.marginLeft = '10px';
    button.style.cursor = 'pointer';

    button.onclick = function () {
      alert('AYANAS Print 起動');
    };

    space.appendChild(button);

    return event;
  });

})();