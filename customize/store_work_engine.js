(function () {
    'use strict';

    /**
     * 店舗しみ抜き作業 V1 — 判定・PUT内容（kintone 非依存）
     */

    const ACTION = {
        shimiStart: 'shimi_start',
        shimiCompleteToFactory: 'shimi_complete_factory',
    };

    const UI_STATE = {
        notStore: 'not_store',
        shimiWait: 'shimi_wait',
        shimiInProgress: 'shimi_in_progress',
        other: 'other',
    };

    const assertConfig = () => {

        if (typeof CAYANAS_STORE_WORK === 'undefined') {
            throw new Error('CAYANAS_STORE_WORK が未読込です。');
        }

    };

    const CFG = () => CAYANAS_STORE_WORK;

    const norm = (value) => String(value ?? '').trim();

    const isAtStore = (locationStatus) => {

        assertConfig();
        return norm(locationStatus) === CFG().LOCATION.store;

    };

    /**
     * @returns {{ uiState: string, message: string, enabledAction: string|null }}
     */
    const resolveWorkUiState = (locationStatus, workStatus) => {

        assertConfig();

        const L = CFG().LOCATION;
        const W = CFG().WORK;
        const loc = norm(locationStatus);
        const work = norm(workStatus);

        if (loc !== L.store) {
            return {
                uiState: UI_STATE.notStore,
                message: '店舗作業の対象外です。現在地が「店舗」ではありません。\n'
                    + '現在地: ' + (loc || '（空欄）') + '\n作業: ' + (work || '（空欄）'),
                enabledAction: null,
            };
        }

        if (work === W.shimiWait) {
            return {
                uiState: UI_STATE.shimiWait,
                message: '',
                enabledAction: ACTION.shimiStart,
            };
        }

        if (work === W.shimiInProgress) {
            return {
                uiState: UI_STATE.shimiInProgress,
                message: '',
                enabledAction: ACTION.shimiCompleteToFactory,
            };
        }

        return {
            uiState: UI_STATE.other,
            message: '現在の作業ステータスを確認してください。\n'
                + '現在地: ' + loc + '\n作業: ' + (work || '（空欄）'),
            enabledAction: null,
        };

    };

    const canPerformAction = (action, locationStatus, workStatus) => {

        const state = resolveWorkUiState(locationStatus, workStatus);
        return state.enabledAction === action;

    };

    /**
     * @returns {{ locationStatus: string, workStatus: string }}
     */
    const getPutTargetsForAction = (action) => {

        assertConfig();

        const L = CFG().LOCATION;
        const W = CFG().WORK;

        if (action === ACTION.shimiStart) {
            return {
                locationStatus: L.store,
                workStatus: W.shimiInProgress,
            };
        }

        if (action === ACTION.shimiCompleteToFactory) {
            return {
                locationStatus: L.factory,
                workStatus: W.finishWait,
            };
        }

        throw new Error('不明な店舗作業: ' + action);

    };

    const buildConfirmMessage = (manageNo, locationStatus, workStatus, action) => {

        const loc = norm(locationStatus);
        const work = norm(workStatus);
        const targets = getPutTargetsForAction(action);

        const lines = [
            '管理番号: ' + manageNo,
            '',
            '現在:',
            loc + ' / ' + work,
            '',
            '変更後:',
            targets.locationStatus + ' / ' + targets.workStatus,
            '',
        ];

        if (action === ACTION.shimiStart) {
            lines.push('しみ抜きを開始しますか？');
        } else if (action === ACTION.shimiCompleteToFactory) {
            lines.push(
                'しみ抜き完了として、工場へ戻します。',
                '保管場所を ' + loc + ' → ' + targets.locationStatus + ' に変更します。',
                'よろしいですか？',
            );
        } else {
            lines.push('この内容で更新しますか？');
        }

        return lines.join('\n');

    };

    const buildSuccessMessage = (action) => {

        if (action === ACTION.shimiStart) {
            return 'しみ抜き開始を登録しました';
        }

        if (action === ACTION.shimiCompleteToFactory) {
            return 'しみ抜き完了・工場へ戻しを登録しました';
        }

        return '更新しました';

    };

    const buildStaleStateMessage = (locationStatus, workStatus) => {

        const loc = norm(locationStatus) || '（空欄）';
        const work = norm(workStatus) || '（空欄）';

        return 'この商品の状態はすでに変更されています。\n'
            + '現在地: ' + loc + '\n'
            + '作業: ' + work;

    };

    const formatDetailLinesHtml = (lineSummaries) => {

        const lines = lineSummaries || [];

        if (lines.length === 0) {
            return '<p>（加工明細なし）</p>';
        }

        return '<ul class="cayan-sw-detail-list">'
            + lines.map((line) => {

                const name = String(line.itemName || line.itemCode || '—').trim();
                const qty = line.qty !== '' && line.qty !== undefined ? String(line.qty) : '—';
                const sub = String(line.subcategory ?? '').trim();
                const subPart = sub ? ' <span class="cayan-sw-sub">[' + sub + ']</span>' : '';
                const unresolved = line.unresolved ? ' <span class="cayan-sw-sub">(App13未特定)</span>' : '';

                return '<li>' + name + '　' + qty + subPart + unresolved + '</li>';

            }).join('')
            + '</ul>';

    };

    window.CAYANAS_StoreWorkEngine = {
        ACTION,
        UI_STATE,
        isAtStore,
        resolveWorkUiState,
        canPerformAction,
        getPutTargetsForAction,
        buildConfirmMessage,
        buildSuccessMessage,
        buildStaleStateMessage,
        formatDetailLinesHtml,
    };

}());
