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

    const stopSave = (event, message) => {
        event.error = message;
        return event;
    };

    /**
     * ブラウザ標準の確認ダイアログは保存イベントを中断する。
     * 画面上の確認にして、選択後も同じ submit の Promise で保存を続ける。
     */
    const askToCompleteAndSave = (message) => new Promise((resolve) => {
        const existing = document.getElementById('cayan-delivery-complete-confirm');

        if (existing) {
            existing.remove();
        }

        const root = document.createElement('div');
        root.id = 'cayan-delivery-complete-confirm';
        root.style.cssText = [
            'position:fixed',
            'inset:0',
            'z-index:2147483646',
            'background:rgba(0,0,0,0.45)',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'padding:24px',
        ].join(';');

        const panel = document.createElement('div');
        panel.style.cssText = [
            'background:#fff',
            'max-width:640px',
            'width:100%',
            'max-height:80vh',
            'overflow:auto',
            'padding:24px',
            'border-radius:8px',
        ].join(';');

        const body = document.createElement('pre');
        body.textContent = message;
        body.style.cssText = 'white-space:pre-wrap;font:16px/1.6 sans-serif;margin:0 0 20px;';

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:12px;justify-content:flex-end;';

        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = '戻る';
        cancel.style.cssText = 'min-height:44px;padding:8px 16px;font-size:16px;';

        const ok = document.createElement('button');
        ok.type = 'button';
        ok.textContent = '完了して納品書を作成';
        ok.style.cssText = 'min-height:44px;padding:8px 16px;font-size:16px;background:#206694;color:#fff;border:0;';

        const finish = (accepted) => {
            root.remove();
            resolve(accepted);
        };

        cancel.addEventListener('click', () => finish(false));
        ok.addEventListener('click', () => finish(true));
        actions.appendChild(cancel);
        actions.appendChild(ok);
        panel.appendChild(body);
        panel.appendChild(actions);
        root.appendChild(panel);
        document.body.appendChild(root);
        ok.focus();
    });

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
            return stopSave(event, plan.message);
        }

        if (plan.action === 'save') {
            return event;
        }

        const accepted = await askToCompleteAndSave(plan.message);

        if (!accepted) {
            return stopSave(event, '納品書の作成を中止しました。');
        }

        const putRecord = Engine.buildCompletePutRecord();
        let result;

        try {
            result = await Engine.applyCompletableUpdates(plan.completable, putRecord, {
                putOrder,
                fetchOrder: async (manageNo) => {
                    const records = await fetchOrders(manageNo);
                    return records[0] || null;
                },
            });
        } catch (error) {
            return stopSave(event, error && error.message ? error.message : String(error));
        }

        if (!result.save) {
            return stopSave(event, result.message);
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
