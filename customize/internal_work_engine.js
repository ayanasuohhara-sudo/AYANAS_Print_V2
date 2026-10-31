(function () {
    'use strict';

    /**
     * App84 社内作業ステータス — PUT（work_status のみ）
     */

    const cfg = () => CAYANAS_INTERNAL_OPS;

    const norm = (value) => String(value ?? '').trim();

    const isAllowedWorkSelection = (workStatus) => {

        const C = cfg();
        return C.WORK_SELECT_OPTIONS.includes(norm(workStatus));

    };

    const buildWorkPutRecord = (selectedWorkStatus) => {

        const C = cfg();
        const work = norm(selectedWorkStatus);

        if (!isAllowedWorkSelection(work)) {
            throw new Error('選択できない作業ステータスです: ' + work);
        }

        return {
            [C.FIELDS.order.workStatus]: { value: work },
        };

    };

    window.CAYANAS_InternalWorkEngine = {
        isAllowedWorkSelection,
        buildWorkPutRecord,
    };

}());
