(function () {
    'use strict';

    /**
     * App19 保存前 — 完了登録忘れの確認。
     * 完了時の PUT 内容は complete_register_engine.js だけが決める。
     * 保存成功後の納品済更新・価格マスタ登録には触れない。
     */

    const DELIVERY_APP_ID = 19;
    const ORDER_APP_ID = 16;

    const Engine = window.CAYANAS_CompleteRegisterEngine;

    if (!Engine || !window.CAYANAS_INTERNAL_OPS) {
        console.error('[delivery_completion_guard] 依存 JS が未読込です。');
        return;
    }

    const kintoneApi = (path, method, body) => kintone.api(path, method, body);

    const fetchOrders = async (manageNo) => {
        const resp = await kintoneApi(
            kintone.api.url('/k/v1/records.json', true),
            'GET',
            {
                app: ORDER_APP_ID,
                query: Engine.buildManageNoQuery(manageNo),
                fields: Engine.orderFetchFields(),
            }
        );

        return resp.records || [];
    };

    const putOrder = async (item, putRecord) => {
        await kintoneApi(
            kintone.api.url('/k/v1/record.json', true),
            'PUT',
            {
                app: ORDER_APP_ID,
                id: item.recordId,
                record: putRecord,
            }
        );
    };

    const guardSubmit = async (event) => {
        if (kintone.app.getId() !== DELIVERY_APP_ID) {
            return event;
        }

        const manageNos = Engine.collectDistinctManageNosFromRecord(event.record);

        if (manageNos.length === 0) {
            return event;
        }

        const lookups = [];

        for (let i = 0; i < manageNos.length; i += 1) {
            const manageNo = manageNos[i];

            try {
                lookups.push({
                    manageNo,
                    records: await fetchOrders(manageNo),
                });
            } catch (error) {
                lookups.push({
                    manageNo,
                    records: [],
                    error: error && error.message ? error.message : String(error),
                });
            }
        }

        const plan = Engine.planDeliveryCompletion(lookups);

        if (plan.action === 'stop') {
            window.alert(plan.message);
            return false;
        }

        if (plan.action === 'save') {
            return event;
        }

        if (!window.confirm(plan.message)) {
            return false;
        }

        const putRecord = Engine.buildCompletePutRecord();
        const result = await Engine.applyCompletableUpdates(plan.completable, putRecord, {
            putOrder,
            fetchOrder: async (manageNo) => {
                const records = await fetchOrders(manageNo);
                return records[0] || null;
            },
        });

        if (!result.save) {
            window.alert(result.message);
            return false;
        }

        return event;
    };

    kintone.events.on(
        [
            'app.record.create.submit',
            'app.record.edit.submit',
        ],
        guardSubmit
    );

}());
