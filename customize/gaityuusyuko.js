(function () {
  'use strict';

  /**
   * App 27 外注出庫
   * バーコードで受注(App 16)を明細に追加し、受注の工程・保管場所を更新する。
   *
   * outsource_detail に line_in_date 列がある場合、
   * JS で行を追加するときも { type: 'DATE', value: null } を含める必要がある。
   */

  const ORDER_APP_ID = 16;

  const emptyDateField = () => ({
    type: 'DATE',
    value: null,
  });

  const normalizeOutsourceDetailRows = (record) => {

    const table = record.outsource_detail;

    if (!table || !Array.isArray(table.value)) {
      return;
    }

    table.value = table.value
      .filter((row) => {
        const manageNo = String(row?.value?.manage_no?.value ?? '').trim();
        return manageNo !== '';
      })
      .map((row) => {

        const fields = row.value ?? {};

        if (!fields.line_in_date || typeof fields.line_in_date !== 'object') {
          fields.line_in_date = emptyDateField();
        } else if (fields.line_in_date.type !== 'DATE') {
          fields.line_in_date = {
            type: 'DATE',
            value: fields.line_in_date.value ?? null,
          };
        }

        return { value: fields };

      });

  };

  const buildDetailRowFromOrder = (rec) => ({
    value: {
      manage_no: {
        type: 'SINGLE_LINE_TEXT',
        value: rec.manage_no.value,
      },
      customer_code: {
        type: 'SINGLE_LINE_TEXT',
        value: rec.customer_code.value,
      },
      client_name: {
        type: 'SINGLE_LINE_TEXT',
        value: rec.client_name.value,
      },
      kimono_type: {
        type: 'SINGLE_LINE_TEXT',
        value: rec.kimono_type.value,
      },
      line_in_date: emptyDateField(),
    },
  });

  kintone.events.on([
    'app.record.create.submit',
    'app.record.edit.submit',
  ], (event) => {

    normalizeOutsourceDetailRows(event.record);

    const barcode = event.record.barcode_input.value;

    if (!barcode) {
      alert('管理番号を入力してください');
      return false;
    }

    return kintone.api(
      kintone.api.url('/k/v1/records.json', true),
      'GET',
      {
        app: ORDER_APP_ID,
        query: `manage_no = "${String(barcode).replace(/"/g, '\\"')}"`,
      }
    ).then((resp) => {

      if (resp.records.length === 0) {
        alert('管理番号が見つかりません');
        return false;
      }

      const rec = resp.records[0];

      const exists = event.record.outsource_detail.value.some((row) => (
        row.value.manage_no
        && row.value.manage_no.value === rec.manage_no.value
      ));

      if (!exists) {
        event.record.outsource_detail.value.push(buildDetailRowFromOrder(rec));
      }

      normalizeOutsourceDetailRows(event.record);

      return kintone.api(
        kintone.api.url('/k/v1/record.json', true),
        'PUT',
        {
          app: ORDER_APP_ID,
          id: rec.$id.value,
          record: {
            process_status: {
              value: '外注中',
            },
            location_status: {
              value: '外注先',
            },
          },
        }
      ).then(() => event);

    }).catch((err) => {

      console.error(err);
      alert(err.message);

      return false;

    });

  });

})();
