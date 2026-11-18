(function() {
    'use strict';

    const ORDER_APP_ID = 16;

    kintone.events.on('app.record.create.submit', async function(event) {

        const record = event.record;

        const manageNo = record.manage_no.value;
        const locationStatus = record.location_status.value;

        if (!manageNo) {
            alert('管理番号を入力してください');
            return false;
        }

        try {

            const resp = await kintone.api(
                kintone.api.url('/k/v1/records.json', true),
                'GET',
                {
                    app: ORDER_APP_ID,
                    query: 'manage_no = "' + manageNo + '"'
                }
            );

            if (resp.records.length === 0) {
                alert('受注明細に管理番号が見つかりません');
                return false;
            }

            const targetRecord = resp.records[0];

            await kintone.api(
                kintone.api.url('/k/v1/record.json', true),
                'PUT',
                {
                    app: ORDER_APP_ID,
                    id: targetRecord.$id.value,
                    record: {
                        location_status: {
                            value: locationStatus
                        }
                    }
                }
            );

            alert('保管場所を更新しました');

            return event;

        } catch (error) {

            console.error(error);
            alert('更新エラーが発生しました');

            return false;
        }
    });

})();
