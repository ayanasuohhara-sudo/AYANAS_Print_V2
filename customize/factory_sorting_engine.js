(function () {
    'use strict';

    /**
     * 工場振り分け — 判定・PUT内容（kintone 非依存）
     */

    const ACTION = {
        maru: 'maru',
        storeShimi: 'store_shimi',
        finish: 'finish',
    };

    const assertConfig = () => {

        if (typeof CAYANAS_FACTORY_INBOUND === 'undefined') {
            throw new Error('CAYANAS_FACTORY_INBOUND が未読込です。');
        }

    };

    const CFG = () => CAYANAS_FACTORY_INBOUND;

    const isSortPendingWork = (workStatus) => {

        const C = CFG();
        const W = C.WORK;

        if (typeof C.workStatusEquals === 'function') {
            return C.workStatusEquals(workStatus, W.sortPending);
        }

        return String(workStatus ?? '').trim() === W.sortPending;

    };

    const isEligibleForSorting = (locationStatus, workStatus) => {

        assertConfig();

        const L = CFG().LOCATION;

        return String(locationStatus ?? '').trim() === L.factory
            && isSortPendingWork(workStatus);

    };

    const buildIneligibleMessage = (locationStatus, workStatus) => {

        const loc = String(locationStatus ?? '').trim() || '（空欄）';
        const work = String(workStatus ?? '').trim() || '（空欄）';
        const W = CFG().WORK;

        if (loc !== CFG().LOCATION.factory) {
            return '振り分け対象外です。現在地が「工場」ではありません。\n'
                + '現在地: ' + loc + '\n作業: ' + work;
        }

        if (!isSortPendingWork(workStatus)) {
            return '振り分け対象外です。「' + W.sortPending + '」（または移行中の旧「未着手」）ではありません。\n'
                + '現在地: ' + loc + '\n作業: ' + work;
        }

        return '振り分けできません。';

    };

    /**
     * @param {string} action ACTION.*
     * @returns {{ locationStatus: string, workStatus: string, actionLabel: string }}
     */
    const getPutTargetsForAction = (action) => {

        assertConfig();

        const L = CFG().LOCATION;
        const W = CFG().WORK;

        if (action === ACTION.maru) {
            return {
                locationStatus: L.factory,
                workStatus: W.maruWait,
                actionLabel: '丸洗いへ',
            };
        }

        if (action === ACTION.storeShimi) {
            return {
                locationStatus: L.store,
                workStatus: W.shimiInProgress,
                actionLabel: '店舗しみ抜きへ',
            };
        }

        if (action === ACTION.finish) {
            // 仕上げ待ち廃止 → 仕上げ中へ（実際に仕上げ工程へ進める）
            return {
                locationStatus: L.factory,
                workStatus: W.finishInProgress,
                actionLabel: '仕上げへ',
            };
        }

        throw new Error('不明な振り分け操作: ' + action);

    };

    const buildConfirmMessage = (manageNo, currentLocation, currentWork, targets, action) => {

        const lines = [
            '管理番号: ' + manageNo,
            '',
            '現在:',
            currentLocation + ' / ' + currentWork,
            '',
            '変更後:',
            targets.locationStatus + ' / ' + targets.workStatus,
            '',
        ];

        if (action === ACTION.storeShimi) {
            lines.push(
                '店舗しみ抜きへ振り分けます。',
                '保管場所を ' + currentLocation + ' → ' + targets.locationStatus + ' に変更します。',
                '',
            );
        }

        lines.push('この内容で振り分けますか？');

        return lines.join('\n');

    };

    const buildStaleStateMessage = (locationStatus, workStatus) => {

        const loc = String(locationStatus ?? '').trim() || '（空欄）';
        const work = String(workStatus ?? '').trim() || '（空欄）';

        return 'この商品の状態はすでに変更されています。\n'
            + '現在地: ' + loc + '\n'
            + '作業: ' + work;

    };

    const formatDetailLinesHtml = (lineSummaries) => {

        const lines = lineSummaries || [];

        if (lines.length === 0) {
            return '<p>（加工明細なし）</p>';
        }

        return '<ul class="cayan-fs-detail-list">'
            + lines.map((line) => {

                const name = String(line.itemName || line.itemCode || '—').trim();
                const qty = line.qty !== '' && line.qty !== undefined ? String(line.qty) : '—';
                const sub = String(line.subcategory ?? '').trim();
                const subPart = sub ? ' <span class="cayan-fs-sub">[' + sub + ']</span>' : '';
                const unresolved = line.unresolved ? ' <span class="cayan-fs-sub">(App13未特定)</span>' : '';

                return '<li>' + name + '　' + qty + subPart + unresolved + '</li>';

            }).join('')
            + '</ul>';

    };

    window.CAYANAS_FactorySortingEngine = {
        ACTION,
        isEligibleForSorting,
        buildIneligibleMessage,
        getPutTargetsForAction,
        buildConfirmMessage,
        buildStaleStateMessage,
        formatDetailLinesHtml,
    };

}());
