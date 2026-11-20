import {randomUUID} from 'crypto';
import {NextRequest,NextResponse} from 'next/server';
import {transaction} from './db';
import {parseVietQrCredit,validVietQrBearer,vietQrAutoVerifyEnabled} from './vietqr-merchant';

const failure=(reason:string,status=400)=>NextResponse.json({error:true,errorReason:reason,toastMessage:reason,object:null},{status,headers:{'Cache-Control':'no-store'}});

export async function receiveVietQrTransaction(req:NextRequest){
 if(!validVietQrBearer(req.headers.get('authorization')))return failure('INVALID_TOKEN',401);
 if(!req.headers.get('content-type')?.includes('application/json'))return failure('INVALID_CONTENT_TYPE',415);
 const raw=await req.text();if(raw.length>16384)return failure('PAYLOAD_TOO_LARGE',413);
 let body:any;try{body=JSON.parse(raw)}catch{return failure('INVALID_JSON')}
 const credit=parseVietQrCredit(body);if(!credit)return failure('INVALID_TRANSACTION');
 // Merchant account and production callback must be approved before any live order is credited.
 if(!vietQrAutoVerifyEnabled())return failure('MERCHANT_NOT_ACTIVE',503);
 try{
  const result=await transaction(async tx=>{
   const old=(await tx.$queryRawUnsafe('SELECT * FROM MarketVietQrReceipt WHERE transactionId=? OR reference=? LIMIT 1',credit.transactionId,credit.reference))[0];
   if(old){if(old.transactionId===credit.transactionId&&old.reference===credit.reference&&Number(old.amountVnd)===credit.amount)return old.id;throw new Error('DUPLICATE_BANK_TRANSACTION')}
   const payment=(await tx.$queryRawUnsafe('SELECT p.*,o.userId,o.status orderStatus,o.total FROM MarketOrderBankPayment p JOIN MarketOrder o ON o.id=p.orderId WHERE p.transferMemo=?',credit.content))[0];
   if(!payment||payment.status!=='AWAITING'||payment.orderStatus!=='PENDING')throw new Error('ORDER_NOT_AWAITING_PAYMENT');
   if(payment.accountNumber!==credit.bankAccount||Number(payment.amountVnd)!==credit.amount||Number(payment.total)!==credit.amount)throw new Error('BANK_OR_AMOUNT_MISMATCH');
   if((await tx.$queryRawUnsafe('SELECT orderId FROM MarketOrderBankPayment WHERE reference=? AND orderId<>?',credit.reference,payment.orderId)).length)throw new Error('DUPLICATE_BANK_TRANSACTION');
   const stamp=Date.now(),receiptId=randomUUID();
   await tx.$executeRawUnsafe('INSERT INTO MarketVietQrReceipt VALUES(?,?,?,?,?,?,?)',receiptId,credit.transactionId,credit.reference,payment.orderId,credit.amount,credit.bankAccount,stamp);
   const changed=await tx.$executeRawUnsafe("UPDATE MarketOrderBankPayment SET status='VERIFIED',reference=?,verifiedAt=? WHERE orderId=? AND status='AWAITING'",credit.reference,stamp,payment.orderId);
   if(changed!==1)throw new Error('PAYMENT_CHANGED');
   await tx.$executeRawUnsafe('INSERT INTO MarketNotification VALUES(?,?,?,?,0,?)',randomUUID(),payment.userId,'VietQR xác nhận chuyển khoản',`Đơn ${payment.orderId.slice(0,8)} đã được xác nhận ${credit.amount.toLocaleString('vi-VN')}₫ và đang chờ xử lý.`,stamp);
   const operator=(await tx.$queryRawUnsafe("SELECT id FROM User WHERE role IN ('SUPER_ADMIN','ADMIN') ORDER BY CASE role WHEN 'SUPER_ADMIN' THEN 0 ELSE 1 END LIMIT 1"))[0];
   if(operator)await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),operator.id,'order:vietqr-verified',payment.orderId,stamp);
   return receiptId;
  },{timeout:15000});
  return NextResponse.json({error:false,errorReason:null,toastMessage:'Transaction processed successfully',object:{reftransactionid:result}},{headers:{'Cache-Control':'no-store'}});
 }catch(error:any){
  const reason=String(error?.message||'TRANSACTION_FAILED').slice(0,80);
  console.error('VietQR transaction rejected',reason);
  return failure(reason==='TRANSACTION_FAILED'?reason:'TRANSACTION_REJECTED',409);
 }
}
