const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');

const source=fs.readFileSync(path.join(__dirname,'../src/lib/payment-bank.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleExports={};
vm.runInNewContext(compiled,{exports:moduleExports,URL,console});

const bank={bankName:'Nam A Bank',bankCode:'970428',accountNumber:'702252070200001',accountName:'CONG TY CO PHAN T VA T NGUYEN'};
const memo=moduleExports.transferMemo('12345678-1234-1234-1234-123456789abc');
assert.equal(memo,'YWS1234567812341234');
const qr=new URL(moduleExports.dynamicPaymentQrUrl(bank,3000000,memo));
assert.equal(qr.hostname,'img.vietqr.io');
assert.equal(qr.pathname,'/image/970428-702252070200001-compact2.svg');
assert.equal(qr.searchParams.get('amount'),'3000000');
assert.equal(qr.searchParams.get('addInfo'),memo);
assert.equal(moduleExports.dynamicPaymentQrUrl(bank,0,memo),'');
assert.equal(moduleExports.dynamicPaymentQrUrl({...bank,bankCode:'TCB'},3000000,memo),'');
assert.equal(moduleExports.dynamicPaymentQrUrl(bank,3000000,'invalid memo'),'');
assert.equal(moduleExports.paymentQrAsset(bank),'/assets/shop-nam-a-702252070200001-qr.png');
assert.equal(moduleExports.paymentQrAsset({...bank,accountNumber:'12345'}),'');
console.log('PASS order-specific VietQR URL, amount, memo, validation and fallback');
