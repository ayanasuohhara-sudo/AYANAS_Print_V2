(function () {
    'use strict';

    /**
     * App30 完了登録 — PUT
     */

    const buildCompletePutRecord = () => {

        const C = CAYANAS_INTERNAL_OPS;
        const F = C.FIELDS.order;

        return {
            [F.processStatus]: { value: C.PROCESS.complete },
            [F.workStatus]: { value: C.WORK.finishDone },
            [F.deliveryStatus]: { value: C.DELIVERY.waiting },
        };

    };

    window.CAYANAS_CompleteRegisterEngine = {
        buildCompletePutRecord,
    };

}());
