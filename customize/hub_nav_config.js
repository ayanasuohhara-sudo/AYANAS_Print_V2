(function () {
  'use strict';

  /**
   * AYANASU 共通ハブナビ — 定数
   * App91（TOP）／App87（店舗）／App90（工場）で同一デザインを使う。
   * 権限は付与しない（表示のみ）。ACL は各アプリ側。
   */

  const HUB_NAV_VERSION = '1.0.0';

  const CAYANAS_HUB_NAV = {
    VERSION: HUB_NAV_VERSION,
    ROOT_CLASS: 'cayan-hub-nav',
    TITLE: 'AYANASU',
    ARIA_LABEL: '共通業務ナビ',
    /** TOP / 店舗 / 工場 */
    LINKS: [
      { id: 'top', appId: 91, label: 'TOP', tone: 'amber' },
      { id: 'store', appId: 87, label: '店舗', tone: 'teal' },
      { id: 'factory', appId: 90, label: '工場', tone: 'slate' },
    ],
    /** 画面 ID → アクティブなナビ id */
    ACTIVE_BY_APP: {
      91: 'top',
      87: 'store',
      90: 'factory',
      /** App86 は工場ハブ配下の状況画面 */
      86: 'factory',
    },
  };

  window.CAYANAS_HUB_NAV = CAYANAS_HUB_NAV;
  window.CAYANAS_HUB_NAV_VERSION = HUB_NAV_VERSION;

}());
