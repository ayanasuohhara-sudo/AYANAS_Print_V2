(function () {
    'use strict';

    /**
     * バーコード一括処理 — リスト管理（kintone 非依存）
     */

    const norm = (value) => String(value ?? '').trim();

    const createEmptyList = () => ({
        items: [],
    });

    const findIndexByManageNo = (list, manageNo) => {

        const code = norm(manageNo);

        return list.items.findIndex((item) => norm(item.manageNo) === code);

    };

    const addOrRejectDuplicate = (list, row) => {

        const manageNo = norm(row.manageNo);

        if (!manageNo) {
            return { ok: false, reason: '管理番号が空です。' };
        }

        if (findIndexByManageNo(list, manageNo) >= 0) {
            return { ok: false, reason: '既に一覧に追加済みです: ' + manageNo };
        }

        /* 連続スキャンで最新行を一覧の一番上に表示（エラーに気づきやすくする） */
        list.items.unshift({
            ...row,
            manageNo,
            rowId: manageNo + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            errorMessage: '',
        });

        return { ok: true };

    };

    const removeByRowId = (list, rowId) => {

        list.items = list.items.filter((item) => item.rowId !== rowId);

    };

    const clearList = (list) => {

        list.items = [];

    };

    window.CAYANAS_BarcodeBatchCore = {
        norm,
        createEmptyList,
        findIndexByManageNo,
        addOrRejectDuplicate,
        removeByRowId,
        clearList,
    };

}());
