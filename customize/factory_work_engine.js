(function () {
    'use strict';

    /**
     * 工場作業 — 判定・PUT内容（kintone 非依存）
     */

    const ACTION = {
        maruStart: 'maru_start',
        maruComplete: 'maru_complete',
        finishComplete: 'finish_complete',
    };

    const UI_STATE = {
        notFactory: 'not_factory',
        sortPending: 'sort_pending',
        maruWait: 'maru_wait',
        maruInProgress: 'maru_in_progress',
        finishWait: 'finish_wait',
        finishDone: 'finish_done',
        other: 'other',
    };

    const assertConfig = () => {

        if (typeof CAYANAS_FACTORY_INBOUND === 'undefined') {
            throw new Error('CAYANAS_FACTORY_INBOUND が未読込です。');
        }

    };

    const CFG = () => CAYANAS_FACTORY_INBOUND;

    const norm = (value) => String(value ?? '').trim();

    const isAtFactory = (locationStatus) => {

        assertConfig();
        return norm(locationStatus) === CFG().LOCATION.factory;

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

        if (loc !== L.factory) {
            return {
                uiState: UI_STATE.notFactory,
                message: '工場作業の対象外です。現在地が「工場」ではありません。\n'
                    + '現在地: ' + (loc || '（空欄）') + '\n作業: ' + (work || '（空欄）'),
                enabledAction: null,
            };
        }

        if (work === W.sortPending) {
            return {
                uiState: UI_STATE.sortPending,
                message: '先に振り分けを行ってください。',
                enabledAction: null,
            };
        }

        if (work === W.maruWait) {
            return {
                uiState: UI_STATE.maruWait,
                message: '',
                enabledAction: ACTION.maruStart,
            };
        }

        if (work === W.maruInProgress) {
            return {
                uiState: UI_STATE.maruInProgress,
                message: '',
                enabledAction: ACTION.maruComplete,
            };
        }

        if (work === W.finishWait) {
            return {
                uiState: UI_STATE.finishWait,
                message: '',
                enabledAction: ACTION.finishComplete,
            };
        }

        if (work === W.finishDone) {
            return {
                uiState: UI_STATE.finishDone,
                message: 'この商品は仕上げ完了済みです。',
                enabledAction: null,
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

    const getNextWorkStatusForAction = (action) => {

        assertConfig();
        const W = CFG().WORK;

        if (action === ACTION.maruStart) {
            return W.maruInProgress;
        }

        if (action === ACTION.maruComplete) {
            return W.finishWait;
        }

        if (action === ACTION.finishComplete) {
            return W.finishDone;
        }

        throw new Error('不明な工場作業: ' + action);

    };

    const buildConfirmMessage = (manageNo, locationStatus, workStatus, action) => {

        const loc = norm(locationStatus);
        const work = norm(workStatus);
        const nextWork = getNextWorkStatusForAction(action);

        const lines = [
            '管理番号: ' + manageNo,
            '',
            '現在:',
            loc + ' / ' + work,
            '',
            '変更後:',
            loc + ' / ' + nextWork,
            '',
        ];

        if (action === ACTION.maruStart) {
            lines.push('丸洗いを開始しますか？');
        } else if (action === ACTION.maruComplete) {
            lines.push('丸洗い・乾燥完了として、仕上げ待ちへ進めますか？');
        } else if (action === ACTION.finishComplete) {
            lines.push('仕上げ完了として登録しますか？');
        } else {
            lines.push('この内容で更新しますか？');
        }

        return lines.join('\n');

    };

    const buildSuccessMessage = (action) => {

        if (action === ACTION.maruStart) {
            return '丸洗い開始を登録しました';
        }

        if (action === ACTION.maruComplete) {
            return '丸洗い完了を登録しました';
        }

        if (action === ACTION.finishComplete) {
            return '仕上げ完了を登録しました';
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

    window.CAYANAS_FactoryWorkEngine = {
        ACTION,
        UI_STATE,
        isAtFactory,
        resolveWorkUiState,
        canPerformAction,
        getNextWorkStatusForAction,
        buildConfirmMessage,
        buildSuccessMessage,
        buildStaleStateMessage,
    };

}());
