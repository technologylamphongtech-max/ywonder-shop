import {randomUUID} from 'crypto';
import {AFFILIATE_POLICY,PHONG_CHAU_STORE_ID,MIZI_MALL_STORE_ID} from './affiliate';

type Sql={$queryRawUnsafe:(sql:string,...args:any[])=>Promise<any[]>;$executeRawUnsafe:(sql:string,...args:any[])=>Promise<number>};
const text=(v:any,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
const required=(v:any,max:number,label:string)=>{const value=text(v,max);if(!value)throw new Error(`Vui lòng nhập ${label}`);return value};
const like=(value:string)=>'%'+value.replace(/[\\%_]/g,'\\$&')+'%';
const pageNumber=(value:any)=>{const n=Number(value||1);if(!Number.isSafeInteger(n)||n<1||n>1000000)throw new Error('Trang không hợp lệ');return n};
function dateBound(day:string,end=false){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)throw new Error('Ngày lọc không hợp lệ');
 return Date.parse(day+'T00:00:00+07:00')+(end?86400000-1:0);
}
export function affiliateFilter(params:URLSearchParams){
 const clauses:string[]=[],args:any[]=[];
 const q=text(params.get('q'),120);if(q){clauses.push("(u.fullName LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR f.shopRefCode LIKE ? ESCAPE '\\' OR c.orderId LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\')");args.push(...Array(5).fill(like(q)));}
 const status=params.get('status')||'';if(status){if(!['ACCRUED','PAID','VOID'].includes(status))throw new Error('Trạng thái không hợp lệ');if(status==='VOID')clauses.push('v.commissionId IS NOT NULL');else {clauses.push('v.commissionId IS NULL AND c.status=?');args.push(status);}}else clauses.push('v.commissionId IS NULL');
 const kind=params.get('kind')||'';if(kind){if(!['BUSINESS','CONNECTION'].includes(kind))throw new Error('Loại affiliate không hợp lệ');clauses.push('c.kind=?');args.push(kind);}
 const level=params.get('level')||'';if(level){if(!/^[1-9]$/.test(level))throw new Error('Tầng không hợp lệ');clauses.push('c.level=?');args.push(Number(level));}
 const recipient=text(params.get('beneficiaryId'),100);if(recipient){clauses.push('c.beneficiaryId=?');args.push(recipient);}
 const from=params.get('from')||'',to=params.get('to')||'';
 if(from){clauses.push('c.created>=?');args.push(dateBound(from));}if(to){clauses.push('c.created<=?');args.push(dateBound(to,true));}if(from&&to&&from>to)throw new Error('Ngày bắt đầu phải trước ngày kết thúc');
 return {where:clauses.length?'WHERE '+clauses.join(' AND '):'',args,page:pageNumber(params.get('page'))};
}
const joins=`FROM MarketAffiliateCommission c JOIN User u ON u.id=c.beneficiaryId LEFT JOIN MarketAffiliateCommissionVoid v ON v.commissionId=c.id LEFT JOIN MarketStoreF1 f ON f.userId=c.beneficiaryId AND f.storeId='${PHONG_CHAU_STORE_ID}' LEFT JOIN User buyer ON buyer.id=c.sourceUserId LEFT JOIN MarketStore s ON s.id=c.sourceKey LEFT JOIN MarketAffiliatePayout pay ON pay.id=c.payoutId LEFT JOIN User payer ON payer.id=c.paidBy LEFT JOIN MarketAffiliateDirectWithdrawal direct ON direct.commissionId=c.id`;
const columns='c.*,v.commissionId isVoided,v.reason voidReason,u.fullName beneficiaryName,u.email beneficiaryEmail,f.shopRefCode beneficiaryRefCode,buyer.fullName buyerName,s.name storeName,pay.reference paymentReference,pay.note paymentNote,payer.fullName paidByName,direct.status directWithdrawalStatus';
export async function affiliateAdminReport(tx:Sql,params:URLSearchParams,exportAll=false){
 const {where,args,page}=affiliateFilter(params);
 const totals=(await tx.$queryRawUnsafe(`SELECT COUNT(*) entries,COUNT(DISTINCT c.beneficiaryId) members,COALESCE(SUM(CASE WHEN v.commissionId IS NULL THEN c.amount ELSE 0 END),0) earned,COALESCE(SUM(CASE WHEN v.commissionId IS NULL AND c.status='ACCRUED' THEN c.amount ELSE 0 END),0) accrued,COALESCE(SUM(CASE WHEN v.commissionId IS NULL AND c.status='PAID' THEN c.amount ELSE 0 END),0) paid ${joins} ${where}`,...args))[0];
 if(exportAll&&Number(totals.entries)>10000)throw new Error('Có hơn 10.000 dòng. Vui lòng thu hẹp bộ lọc trước khi xuất CSV.');
 const size=exportAll?10000:50;
 const commissions=await tx.$queryRawUnsafe(`SELECT ${columns} ${joins} ${where} ORDER BY c.created DESC,c.id DESC LIMIT ? OFFSET ?`,...args,size,exportAll?0:(page-1)*size);
 return {policy:AFFILIATE_POLICY,totals,commissions,page,pageSize:size,pages:Math.max(1,Math.ceil(Number(totals.entries)/size))};
}
export function affiliateCsv(rows:any[]){
 const cell=(value:any)=>{let s=String(value??'');if(/^\s*[=+@\-]|^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
 const data=[['Mã hoa hồng','Mã đơn','Người nhận','Email','Mã giới thiệu','Loại','Tầng','Gian hàng','Doanh thu VNĐ','Tỷ lệ %','Hoa hồng VNĐ','Trạng thái','Ngày ghi nhận','Ngày thanh toán','Chứng từ thanh toán','Ghi chú'],...rows.map(row=>[row.id,row.orderId,row.beneficiaryName,row.beneficiaryEmail,row.beneficiaryRefCode,row.kind==='BUSINESS'?'Giới thiệu doanh nghiệp':'Kết nối',row.level,row.storeName,row.revenue,Number(row.rateBps)/100,row.amount,row.isVoided?'Đã hủy theo chính sách combo':row.status==='PAID'?'Đã thanh toán':'Chờ thanh toán',new Date(Number(row.created)).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}),row.paidAt?new Date(Number(row.paidAt)).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'',row.paymentReference,row.isVoided?row.voidReason:row.paymentNote])];
 return '\uFEFF'+data.map(row=>row.map(cell).join(',')).join('\r\n');
}

export async function affiliateMembers(tx:Sql,params:URLSearchParams){
 const page=pageNumber(params.get('page')),q=text(params.get('q'),120),search=q?"AND (u.fullName LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR u.refCode LIKE ? ESCAPE '\\')":'',args=q?Array(3).fill(like(q)):[];
 const base=`FROM User u WHERE u.role NOT IN ('ADMIN','SUPER_ADMIN') ${search}`;
 const total=Number((await tx.$queryRawUnsafe(`SELECT COUNT(*) n ${base}`,...args))[0].n);
 const members=await tx.$queryRawUnsafe(`SELECT u.id,u.fullName,u.email,u.refCode,u.status,p.fullName referrerName,p.refCode referrerCode,(SELECT COUNT(*) FROM MarketAffiliateBankAccount bank WHERE bank.userId=u.id) bankLinked,(SELECT COALESCE(SUM(c.amount),0) FROM MarketAffiliateCommission c WHERE c.beneficiaryId=u.id AND NOT EXISTS (SELECT 1 FROM MarketAffiliateCommissionVoid v WHERE v.commissionId=c.id)) earned,(SELECT COALESCE(SUM(c.amount),0) FROM MarketAffiliateCommission c WHERE c.beneficiaryId=u.id AND c.status='ACCRUED' AND NOT EXISTS (SELECT 1 FROM MarketAffiliateCommissionVoid v WHERE v.commissionId=c.id)) accrued FROM User u LEFT JOIN User p ON p.id=u.referredById WHERE u.role NOT IN ('ADMIN','SUPER_ADMIN') ${search} ORDER BY u.createdAt DESC,u.id LIMIT 50 OFFSET ?`,...args,(page-1)*50);
 return {members,page,pages:Math.max(1,Math.ceil(total/50)),total};
}
export async function affiliateMemberDetail(tx:Sql,uid:string){
 const member=(await tx.$queryRawUnsafe("SELECT u.id,u.fullName,u.email,u.refCode,u.status,p.fullName referrerName,p.refCode referrerCode FROM User u LEFT JOIN User p ON p.id=u.referredById WHERE u.id=? AND u.role NOT IN ('ADMIN','SUPER_ADMIN')",uid))[0];if(!member)throw new Error('Không tìm thấy thành viên');
 const levels=await tx.$queryRawUnsafe("WITH RECURSIVE network(id,level,path,status) AS (SELECT id,1,'|'||?||'|'||id||'|',status FROM User WHERE referredById=? AND id<>? UNION ALL SELECT u.id,n.level+1,n.path||u.id||'|',u.status FROM User u JOIN network n ON u.referredById=n.id WHERE n.level<9 AND instr(n.path,'|'||u.id||'|')=0) SELECT level,COUNT(*) total,SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) active FROM network GROUP BY level",uid,uid,uid);
 const bankAccount=(await tx.$queryRawUnsafe('SELECT bankName,bankAccount,accountName,updated FROM MarketAffiliateBankAccount WHERE userId=?',uid))[0]||null;
 return {member,levels,bankAccount};
}
export async function affiliateStores(tx:Sql){
 const stores=await tx.$queryRawUnsafe('SELECT s.id,s.name,s.status,s.affiliateReferrerId,u.fullName ownerName,u.email ownerEmail,r.fullName referrerName,r.refCode referrerCode FROM MarketStore s JOIN User u ON u.id=s.userId LEFT JOIN User r ON r.id=s.affiliateReferrerId WHERE s.status<>"DELETED" ORDER BY s.created DESC LIMIT 1000');
 const audits=await tx.$queryRawUnsafe('SELECT a.*,u.fullName actorName,old.fullName previousName,next.fullName newName FROM MarketAffiliateStoreAudit a LEFT JOIN User u ON u.id=a.actorId LEFT JOIN User old ON old.id=a.previousReferrerId LEFT JOIN User next ON next.id=a.newReferrerId ORDER BY a.created DESC LIMIT 100');
 return {stores,audits};
}
export async function affiliateWithdrawals(tx:Sql){
 const withdrawals=await tx.$queryRawUnsafe("SELECT w.id,w.commissionId,w.status,w.bankName,w.bankAccount,w.accountName,w.created,w.paidAt,c.orderId,c.kind,c.level,c.sourceKey,c.amount,c.status commissionStatus,u.id beneficiaryId,u.fullName beneficiaryName,u.email beneficiaryEmail,s.name storeName,p.reference paymentReference FROM MarketAffiliateDirectWithdrawal w JOIN MarketAffiliateCommission c ON c.id=w.commissionId JOIN User u ON u.id=w.beneficiaryId LEFT JOIN MarketStore s ON s.id=c.sourceKey LEFT JOIN MarketAffiliatePayout p ON p.id=w.payoutId ORDER BY CASE WHEN w.status='REQUESTED' THEN 0 ELSE 1 END,w.created DESC LIMIT 500");
 return {withdrawals};
}
export async function affiliateAssignStore(tx:Sql,actorId:string,body:any){
 const storeId=required(body.storeId,100,'gian hàng'),code=text(body.refCode,120),reason=required(body.reason,500,'lý do thay đổi');
 const store=(await tx.$queryRawUnsafe('SELECT id,userId,affiliateReferrerId FROM MarketStore WHERE id=?',storeId))[0];if(!store)throw new Error('Không tìm thấy gian hàng');
 if(storeId===PHONG_CHAU_STORE_ID)throw new Error('Phong Châu áp dụng chính sách F1 20% và quỹ đồng chia 10%; không gắn người giới thiệu doanh nghiệp');
 let target:any=null;
 if(code){target=(await tx.$queryRawUnsafe("SELECT id FROM User WHERE (refCode=? OR refCode=?) AND status='ACTIVE' AND role NOT IN ('ADMIN','SUPER_ADMIN')",code,code.toLowerCase()))[0];if(!target)throw new Error('Mã giới thiệu không hợp lệ hoặc đã bị khóa');if(target.id===store.userId)throw new Error('Chủ gian hàng không thể tự giới thiệu doanh nghiệp');if((await tx.$queryRawUnsafe('SELECT 1 FROM MarketStoreF1 WHERE storeId=? AND userId=?',PHONG_CHAU_STORE_ID,target.id)).length)throw new Error('Tài khoản này đang tham gia chính sách riêng của Phong Châu');}
 const next=target?.id||null;if(store.affiliateReferrerId===next)return;
 await tx.$executeRawUnsafe('UPDATE MarketStore SET affiliateReferrerId=? WHERE id=?',next,storeId);
 await tx.$executeRawUnsafe('INSERT INTO MarketAffiliateStoreAudit(id,storeId,previousReferrerId,newReferrerId,reason,actorId,created) VALUES(?,?,?,?,?,?,?)',randomUUID(),storeId,store.affiliateReferrerId,next,reason,actorId,Date.now());
 await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),actorId,'affiliate:store-referrer',storeId,Date.now());
}
export async function affiliateConfirmPayment(tx:Sql,actorId:string,body:any){
 if(body.confirmed!==true)throw new Error('Cần xác nhận khoản tiền đã được thanh toán thực tế');
 const requestId=required(body.requestId,100,'mã yêu cầu'),reference=required(body.reference,160,'mã chứng từ hoặc tham chiếu thanh toán'),note=text(body.note,1000);
 if(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>200)throw new Error('Chọn từ 1 đến 200 khoản hoa hồng');
 const ids=body.ids.map((value:any)=>required(value,100,'mã hoa hồng'));if(new Set(ids).size!==ids.length)throw new Error('Danh sách hoa hồng bị trùng');
 const expectedAmount=Number(body.expectedAmount);if(!Number.isSafeInteger(expectedAmount)||expectedAmount<=0)throw new Error('Tổng tiền xác nhận không hợp lệ');
 const previous=(await tx.$queryRawUnsafe('SELECT * FROM MarketAffiliatePayout WHERE requestId=?',requestId))[0];
 if(previous){
  const oldIds=(await tx.$queryRawUnsafe('SELECT id FROM MarketAffiliateCommission WHERE payoutId=?',previous.id)).map(row=>row.id);
  if(Number(previous.amountVnd)!==expectedAmount||previous.reference!==reference||previous.note!==note||oldIds.length!==ids.length||!oldIds.every(uid=>ids.includes(uid)))throw new Error('Mã yêu cầu thanh toán đã dùng với dữ liệu khác');
  return {payoutId:previous.id,amount:Number(previous.amountVnd),alreadyConfirmed:true};
 }
 const placeholders=ids.map(()=>'?').join(',');
 const rows=await tx.$queryRawUnsafe(`SELECT c.id,c.beneficiaryId,c.amount,c.status,c.payoutId,c.sourceKey,o.status orderStatus,d.id directWithdrawalId,d.status directWithdrawalStatus,v.commissionId isVoided FROM MarketAffiliateCommission c JOIN MarketOrder o ON o.id=c.orderId LEFT JOIN MarketAffiliateDirectWithdrawal d ON d.commissionId=c.id LEFT JOIN MarketAffiliateCommissionVoid v ON v.commissionId=c.id WHERE c.id IN (${placeholders})`,...ids);
 if(rows.length!==ids.length||rows.some(row=>row.isVoided||row.status!=='ACCRUED'||row.payoutId||!['CONFIRMED','SHIPPED','COMPLETED'].includes(row.orderStatus)))throw new Error('Một khoản đã được thanh toán, đã hủy hoặc đơn hàng không còn hợp lệ. Vui lòng tải lại.');
 if(rows.some(row=>row.directWithdrawalId&&row.directWithdrawalStatus!=='REQUESTED'))throw new Error('Một lệnh rút đã được xử lý. Vui lòng tải lại');
 if(rows.some(row=>[PHONG_CHAU_STORE_ID,MIZI_MALL_STORE_ID].includes(row.sourceKey)&&!row.directWithdrawalId))throw new Error('Hoa hồng 20% cần thành viên gửi yêu cầu rút trước khi thanh toán');
 const beneficiaryId=rows[0].beneficiaryId;if(rows.some(row=>row.beneficiaryId!==beneficiaryId))throw new Error('Mỗi lần xác nhận chỉ chọn hoa hồng của cùng một người nhận');
 const amount=rows.reduce((sum,row)=>sum+Number(row.amount),0);if(!Number.isSafeInteger(amount)||amount!==expectedAmount)throw new Error('Số tiền đã thay đổi. Vui lòng đối soát lại.');
 const payoutId=randomUUID(),stamp=Date.now();
 await tx.$executeRawUnsafe('INSERT INTO MarketAffiliatePayout(id,requestId,beneficiaryId,amountVnd,reference,note,createdBy,created) VALUES(?,?,?,?,?,?,?,?)',payoutId,requestId,beneficiaryId,amount,reference,note,actorId,stamp);
 const changed=await tx.$executeRawUnsafe(`UPDATE MarketAffiliateCommission SET status='PAID',payoutId=?,paidAt=?,paidBy=? WHERE id IN (${placeholders}) AND status='ACCRUED' AND payoutId IS NULL AND NOT EXISTS (SELECT 1 FROM MarketAffiliateCommissionVoid v WHERE v.commissionId=MarketAffiliateCommission.id)`,payoutId,stamp,actorId,...ids);
 if(changed!==ids.length)throw new Error('Dữ liệu vừa thay đổi. Vui lòng đối soát lại.');
 const directIds=rows.filter(row=>row.directWithdrawalId).map(row=>row.directWithdrawalId);
 if(directIds.length){const marks=directIds.map(()=>'?').join(',');const changed=await tx.$executeRawUnsafe(`UPDATE MarketAffiliateDirectWithdrawal SET status='PAID',payoutId=?,paidAt=? WHERE id IN (${marks}) AND status='REQUESTED'`,payoutId,stamp,...directIds);if(changed!==directIds.length)throw new Error('Yêu cầu rút vừa thay đổi. Vui lòng tải lại.');await tx.$executeRawUnsafe('INSERT INTO MarketNotification VALUES(?,?,?,?,0,?)',randomUUID(),beneficiaryId,'Hoa hồng đã thanh toán',`Đã xác nhận thanh toán ${amount.toLocaleString('vi-VN')}₫ hoa hồng. Chứng từ: ${reference}.`,stamp);}
 await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),actorId,'affiliate:payment',payoutId,stamp);
 return {payoutId,amount,alreadyConfirmed:false};
}
