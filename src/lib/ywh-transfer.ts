import {randomUUID} from 'node:crypto';

type Sql = {$queryRawUnsafe:(sql:string,...args:any[])=>Promise<any[]>;$executeRawUnsafe:(sql:string,...args:any[])=>Promise<number>};
export type YwhTransferInput = {amount:unknown;requestId:unknown};
export const ywhQuantity=(value:unknown)=>{
 const str=typeof value==='number'||typeof value==='string'?String(value):'';
 if(!/^(0|[1-9]\d{0,9})(\.\d{1,6})?$/.test(str))throw new Error('Số YWH phải lớn hơn 0 và có tối đa 6 chữ số thập phân');
 const amount=Number(str);if(!Number.isFinite(amount)||amount<=0||amount>Number.MAX_SAFE_INTEGER/1e6)throw new Error('Số YWH không hợp lệ');return amount;
};
const quantityText=(amount:number)=>amount.toLocaleString('vi-VN',{maximumFractionDigits:6});

// HUB and Shop share one SQLite database. Always call inside ONE transaction:
// source debit, destination credit, both ledgers and both notifications commit together.
export async function transferYwhToShop(tx:Sql,userId:string,input:YwhTransferInput,autoLink=false){
 const amount=ywhQuantity(input.amount);
 const requestId=typeof input.requestId==='string'?input.requestId.trim():'';
 if(!/^[A-Za-z0-9:_-]{8,120}$/.test(requestId))throw new Error('Mã giao dịch không hợp lệ. Vui lòng tải lại trang');
 const user=(await tx.$queryRawUnsafe('SELECT id,email,status FROM User WHERE id=?',userId))[0];
 if(!user||user.status!=='ACTIVE')throw new Error('Tài khoản chưa kích hoạt hoặc đã bị khóa');
 const existing=(await tx.$queryRawUnsafe('SELECT * FROM MarketYwbTransfer WHERE userId=? AND idempotency=?',userId,requestId))[0];
 if(existing&&Number(existing.amount)!==amount)throw new Error('Mã giao dịch đã được dùng với số lượng khác');
 if(existing&&existing.status!=='PENDING'&&existing.status!=='COMPLETED')throw new Error('Yêu cầu chuyển đã kết thúc. Vui lòng tạo giao dịch mới');
 const balances=async()=>{
  const w=(await tx.$queryRawUnsafe('SELECT balanceYwh FROM Wallet WHERE userId=?',userId))[0];
  const p=(await tx.$queryRawUnsafe('SELECT ywbBalance FROM MarketProfile WHERE userId=?',userId))[0];
  return {hubBalance:Number(w?.balanceYwh||0),shopBalance:Number(p?.ywbBalance||0)};
 };
 if(existing?.status==='COMPLETED')return {transferId:existing.id,amount,alreadyCompleted:true,...await balances()};
 const timestamp=Date.now();
 await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketProfile(userId) VALUES(?)',userId);
 if(autoLink)await tx.$executeRawUnsafe('UPDATE MarketProfile SET hubAccountId=?,hubLinkedAt=? WHERE userId=?',userId,timestamp,userId);
 const profile=(await tx.$queryRawUnsafe('SELECT hubAccountId FROM MarketProfile WHERE userId=?',userId))[0];
 if(profile?.hubAccountId!==userId)throw new Error('Vui lòng đăng nhập YWonderHub để liên kết đúng tài khoản trước khi chuyển');
 const wallet=(await tx.$queryRawUnsafe('SELECT balanceYwh FROM Wallet WHERE userId=?',userId))[0];
 if(!wallet||!Number.isFinite(Number(wallet.balanceYwh))||Number(wallet.balanceYwh)<amount)throw new Error('Số dư YWH khả dụng tại YWonderHub không đủ');
 const transferId=existing?.id||randomUUID(),hubTxId=randomUUID();
 if(existing){
  const claimed=await tx.$executeRawUnsafe("UPDATE MarketYwbTransfer SET status='COMPLETED',sourceRef=?,targetRef=?,updated=? WHERE id=? AND status='PENDING'",hubTxId,transferId,timestamp,transferId);
  if(claimed!==1)throw new Error('Yêu cầu chuyển vừa được xử lý. Vui lòng tải lại');
 }else await tx.$executeRawUnsafe("INSERT INTO MarketYwbTransfer(id,userId,amount,status,idempotency,sourceRef,targetRef,created,updated) VALUES(?,?,?,'COMPLETED',?,?,?,?,?)",transferId,userId,amount,requestId,hubTxId,transferId,timestamp,timestamp);
 const debited=await tx.$executeRawUnsafe('UPDATE Wallet SET balanceYwh=ROUND(balanceYwh-?,8),updatedAt=? WHERE userId=? AND balanceYwh>=?',amount,timestamp,userId,amount);
 if(debited!==1)throw new Error('Số dư YWH tại YWonderHub đã thay đổi. Vui lòng kiểm tra lại');
 const credited=await tx.$executeRawUnsafe('UPDATE MarketProfile SET ywbBalance=ROUND(ywbBalance+?,8) WHERE userId=?',amount,userId);
 if(credited!==1)throw new Error('Không ghi có được ví YWonderShop');
 const metadata=JSON.stringify({channel:'HUB_TO_SHOP',transferId,requestId,amount});
 await tx.$executeRawUnsafe('INSERT INTO "Transaction"(id,userId,type,amount,currency,status,externalRef,metadata,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?)',hubTxId,userId,'YWH_SHOP_TRANSFER',-amount,'YWH','SUCCESS',`SHOP:${transferId}`,metadata,timestamp,timestamp);
 await tx.$executeRawUnsafe('INSERT INTO MarketLedger(id,userId,orderId,amount,kind,created) VALUES(?,?,?,?,?,?)',randomUUID(),userId,transferId,amount,'YWB_TRANSFER',timestamp);
 const qty=quantityText(amount);
 const hubMessage=`Đã chuyển thành công ${qty} YWH sang sàn thương mại điện tử YWonderShop`;
 const shopMessage=`Đã nhận thành công ${qty} YWH từ hệ thống YWonderHub`;
 await tx.$executeRawUnsafe('INSERT INTO Notification(id,userId,emoji,textVi,textEn,link,unread,createdAt) VALUES(?,?,?,?,?,?,1,?)',randomUUID(),userId,'',hubMessage,`Successfully transferred ${amount} YWH to YWonderShop`,'/wallet',timestamp);
 await tx.$executeRawUnsafe('INSERT INTO MarketNotification(id,userId,title,body,seen,created) VALUES(?,?,?,?,0,?)',randomUUID(),userId,'Nhận YWH thành công',shopMessage,timestamp);
 await tx.$executeRawUnsafe('INSERT INTO MarketAudit(id,userId,action,target,created) VALUES(?,?,?,?,?)',randomUUID(),userId,'ywh:hub-to-shop',transferId,timestamp);
 await tx.$executeRawUnsafe('INSERT INTO AuditLog(id,actorId,actorEmail,action,target,metadata,createdAt) VALUES(?,?,?,?,?,?,?)',randomUUID(),userId,user.email,'YWH_TO_SHOP',transferId,metadata,timestamp);
 return {transferId,amount,alreadyCompleted:false,hubMessage,shopMessage,...await balances()};
}
