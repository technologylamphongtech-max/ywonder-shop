const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const ts=require('typescript');
const Module=require('node:module');

const source=fs.readFileSync('src/lib/sepay.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m=new Module('sepay-test');m.filename=process.cwd()+'/src/lib/sepay.ts';m.paths=module.paths;m._compile(compiled,m.filename);
const api=m.exports;
const oldEnv={...process.env};
try{
 process.env.SEPAY_ENV='sandbox';process.env.SEPAY_ENABLED='true';process.env.SEPAY_MERCHANT_ID='TEST_MERCHANT';process.env.SEPAY_SECRET_KEY='test-secret-only';
 const id='12345678-1234-1234-1234-123456789abc',invoice=api.sepayInvoiceNumber(id)+'DEADBEEF';
 const checkout=api.sepayCheckoutFields({id,userId:'buyer-1',total:2500000},invoice);
 assert.equal(checkout.url,'https://pay-sandbox.sepay.vn/v1/checkout/init');
 assert.equal(checkout.fields.order_amount,'2500000');
 assert.equal(checkout.fields.order_invoice_number,invoice);
 assert.equal(checkout.fields.payment_method,'BANK_TRANSFER');
 const expected='order_amount=2500000,merchant=TEST_MERCHANT,currency=VND,operation=PURCHASE,order_description=Thanh toan don hang '+invoice+',order_invoice_number='+invoice+',customer_id=buyer-1,payment_method=BANK_TRANSFER,success_url=https://shop.ywonder.net/?view=account&payment=success,error_url=https://shop.ywonder.net/?view=account&payment=error,cancel_url=https://shop.ywonder.net/?view=account&payment=cancel';
 assert.equal(checkout.fields.signature,crypto.createHmac('sha256','test-secret-only').update(expected).digest('base64'));
 assert.equal(api.validSePaySecret('test-secret-only'),true);
 assert.equal(api.validSePaySecret('wrong'),false);
 const paid={notification_type:'ORDER_PAID',order:{order_status:'CAPTURED',order_invoice_number:invoice,order_currency:'VND',order_amount:'2500000.00'},transaction:{transaction_type:'PAYMENT',transaction_status:'APPROVED',transaction_currency:'VND',transaction_amount:'2500000',transaction_id:'txn-1'}};
 assert.deepEqual(api.sepayPaidNotice(paid),{invoice,amount:2500000,transactionId:'txn-1'});
 assert.equal(api.sepayPaidNotice({...paid,transaction:{...paid.transaction,transaction_amount:'2000000'}}),null);
 assert.equal(api.sepayPaidNotice({...paid,order:{...paid.order,order_currency:'USD'}}),null);
 assert.equal(api.sepayPaidNotice({...paid,notification_type:'TRANSACTION_VOID'}),null);
 delete process.env.SEPAY_ENABLED;assert.equal(api.sepayConfigured(),false);
 console.log('PASS SePay form, signature, authentication and paid notice checks');
}finally{process.env=oldEnv}
