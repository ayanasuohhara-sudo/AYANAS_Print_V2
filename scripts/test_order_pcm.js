'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
global.window = global;
global.kintone = {
  api: async () => ({ records: [] }),
  app: { getId: () => 16 },
};
global.kintone.api.url = (path) => path;

vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/order_pcm_config.js'), 'utf8'));
vm.runInThisContext(fs.readFileSync(path.join(root, 'customize/order_pcm_engine.js'), 'utf8'));

const C = global.CAYANAS_OrderPcm;
const E = global.CAYANAS_OrderPcm_Engine;

let failed = 0;
const assert = (name, cond) => {
  if (cond) {
    console.log('OK  ' + name);
    return;
  }
  failed += 1;
  console.error('FAIL ' + name);
};

assert('config version', !!C.VERSION);
assert('ORDER_APP_ID 16', C.ORDER_APP_ID === 16);
assert('PCM_APP_ID 96', C.PCM_APP_ID === 96);
assert('store code A550', C.STORE_CUSTOMER_CODE === 'A550');
assert('is store', E.isStoreCustomerCode('A550') === true);
assert('not store', E.isStoreCustomerCode('A545') === false);
assert('valid id', E.isValidPersonalCustomerId('P000002') === true);
assert('invalid id', E.isValidPersonalCustomerId('A550') === false);

const q = E.buildPcmSearchQuery({ customerName: '山田', phone: '090' });
assert('search has name', q.indexOf('customer_name like "山田"') >= 0);
assert('search has phone or', q.indexOf('phone like "090"') >= 0 && q.indexOf('mobile_phone like "090"') >= 0);
assert('empty criteria', E.buildPcmSearchQuery({}) === '');

const idQ = E.buildPcmSearchQuery({ personalCustomerId: 'P000002' });
assert('exact id query', idQ.indexOf('personal_customer_id = "P000002"') >= 0);

const hist = E.buildOrderHistoryQuery('P000002');
assert('history query', hist.indexOf('personal_customer_id = "P000002"') >= 0);
assert('bad history id', E.buildOrderHistoryQuery('x') === '');

/* validate: corporate skip */
(async () => {
  const corp = await E.validateStoreOrderPersonalCustomer({
    customer_code: { value: 'A545' },
    personal_customer_id: { value: '' },
    client_name: { value: 'x' },
  }, 'create');
  assert('corp create ok without pcm', corp.ok === true);

  const createEmpty = await E.validateStoreOrderPersonalCustomer({
    customer_code: { value: 'A550' },
    personal_customer_id: { value: '' },
    client_name: { value: '' },
  }, 'create');
  assert('A550 create requires id', createEmpty.ok === false);

  const editEmpty = await E.validateStoreOrderPersonalCustomer({
    customer_code: { value: 'A550' },
    personal_customer_id: { value: '' },
    client_name: { value: '旧客' },
  }, 'edit');
  assert('A550 edit empty warns', editEmpty.ok === true && editEmpty.warnEmptyOnEdit === true);

  const badId = await E.validateStoreOrderPersonalCustomer({
    customer_code: { value: 'A550' },
    personal_customer_id: { value: 'X1' },
    client_name: { value: 'a' },
  }, 'create');
  assert('bad id rejected', badId.ok === false);

  /* mock fetch for mismatch */
  const origApi = global.kintone.api;
  const mockApi = async () => ({
    records: [{
      personal_customer_id: { value: 'P000002' },
      customer_name: { value: '[TEST]山田花子' },
    }],
  });
  mockApi.url = (path) => path;
  global.kintone.api = mockApi;
  const mismatch = await E.validateStoreOrderPersonalCustomer({
    customer_code: { value: 'A550' },
    personal_customer_id: { value: 'P000002' },
    client_name: { value: '手動変更した名前' },
  }, 'create');
  assert('name mismatch warn', mismatch.ok === true && !!mismatch.warnMismatch);
  assert('mismatch pcm name', mismatch.warnMismatch && mismatch.warnMismatch.pcmName === '[TEST]山田花子');

  const match = await E.validateStoreOrderPersonalCustomer({
    customer_code: { value: 'A550' },
    personal_customer_id: { value: 'P000002' },
    client_name: { value: '[TEST]山田花子' },
  }, 'create');
  assert('matching name ok', match.ok === true && !match.warnMismatch);

  /* simulate select → record values that must survive saiban1 (only clears manage_no) */
  const afterSelect = {
    customer_code: { value: 'A550' },
    customer_name: { value: 'ayanasu' },
    client_name: { value: '[TEST]山田花子' },
    personal_customer_id: { value: 'P000002', disabled: true },
    manage_no: { value: 'OLD_SHOULD_CLEAR' },
  };
  /* saiban1 behavior */
  afterSelect.manage_no.value = '';
  assert('copy/create keeps personal id after saiban1 clear', afterSelect.personal_customer_id.value === 'P000002');
  assert('saiban1 clears manage_no only', afterSelect.manage_no.value === '');

  global.kintone.api = origApi;

  /* ensure order_customer_search / saiban files unchanged presence */
  const saiban = fs.readFileSync(path.join(root, 'customize/order_customer_search.js'), 'utf8');
  assert('order_customer_search untouched marker', saiban.indexOf('CUSTOMER_APP_ID = 8') >= 0);
  assert('no order_pcm import in customer search', saiban.indexOf('OrderPcm') < 0);

  const detail = {
    detail_table: {
      value: [
        { value: { item_name: { value: '丸洗い' } } },
        { value: { item_name: { value: 'しみ抜き' } } },
        { value: { item_name: { value: '仕上げ' } } },
        { value: { item_name: { value: '追加' } } },
      ],
    },
  };
  const summary = E.summarizeDetailItems(detail, 3);
  assert('detail summarize', summary === '丸洗い、しみ抜き、仕上げ 他1件');

  if (failed > 0) {
    console.error(failed + ' failed');
    process.exit(1);
  }
  console.log('all passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
