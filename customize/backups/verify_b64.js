const fs = require('fs');
const b = fs.readFileSync(
  'C:/CAYANAS_Print_v2/customize/backups/schedule_customer.b64.txt',
  'utf8'
).trim();
console.log('b64len', b.length);
console.log('decoded', Buffer.from(b, 'base64').length);
console.log(Buffer.from(b, 'base64').toString('utf8').slice(0, 80));
const j = JSON.parse(
  fs.readFileSync(
    'C:/CAYANAS_Print_v2/customize/backups/upload_params.json',
    'utf8'
  )
);
console.log('exprlen', j.expression.length);
