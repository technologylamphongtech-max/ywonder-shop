import {randomUUID} from 'crypto';
import {AFFILIATE_POLICY,PHONG_CHAU_STORE_ID,PHONG_CHAU_COMBO_PRODUCT_ID,MIZI_MALL_STORE_ID,commissionVnd} from './affiliate';
import {allocateWeightedPool} from './affiliate-pool-math';

type Sql={$queryRawUnsafe:(query:string,...values:any[])=>Promise<any[]>;$executeRawUnsafe:(query:string,...values:any[])=>Promise<number>};
const month=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'});
export const currentShopMonth=()=>{const parts=month.formatToParts(new Date());return `${parts.find(p=>p.type==='year')?.value}-${parts.find(p=>p.type==='month')?.value}`;};
export function monthBounds(period:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new Error('Tháng không hợp lệ');
 const [year,part]=period.split('-').map(Number);
 const nextYear=part===12?year+1:year,nextMonth=part===12?1:part+1;
 return {start:Date.parse(`${period}-01T00:00:00+07:00`),end:Date.parse(`${nextYear}-${String(nextMonth).padStart(2,'0')}-01T00:00:00+07:00`)};
}

async function salesWindow(tx:Sql,period:string){
 const {start,end}=monthBounds(period);
 const setting=(await tx.$queryRawUnsafe("SELECT value FROM MarketSetting WHERE key='affiliate:phongchau:effective'"))[0];
 return {start:Math.max(start,Number(setting?.value||0)),end};
}
type BuyerStats={id:string;referrerId:string;fullName:string;email:string;orderCount:number;orderRevenue:number;qualifiedAt:number|null};
async function monthlyF1(tx:Sql,start:number,end:number,referrerId?:string){
 if(referrerId&&referrerId!==PHONG_CHAU_STORE_ID)return {buyers:new Map<string,BuyerStats>(),groups:new Map<string,BuyerStats[]>()};
 const rows=await tx.$queryRawUnsafe(`SELECT storeF1.storeId referrerId,buyer.id buyerId,buyer.fullName,buyer.email,s.orderId,
  SUM(s.gross) orderRevenue,MIN(s.created) completedAt
  FROM MarketSettlement s JOIN MarketOrderItem i ON i.id=s.itemId JOIN MarketOrder o ON o.id=s.orderId JOIN User buyer ON buyer.id=o.userId
  JOIN MarketStoreF1 storeF1 ON storeF1.storeId=? AND storeF1.userId=buyer.id AND storeF1.created<=s.created
  WHERE s.storeId=? AND s.created>=? AND s.created<? AND i.productId=? AND o.status='COMPLETED'
   AND buyer.status='ACTIVE'
  GROUP BY storeF1.storeId,buyer.id,s.orderId`,PHONG_CHAU_STORE_ID,PHONG_CHAU_STORE_ID,start,end,PHONG_CHAU_COMBO_PRODUCT_ID);
 const buyers=new Map<string,BuyerStats>();
 for(const row of rows){
  const value=buyers.get(row.buyerId)||{id:row.buyerId,referrerId:row.referrerId,fullName:row.fullName,email:row.email,orderCount:0,orderRevenue:0,qualifiedAt:null};
  value.orderCount++;value.orderRevenue+=Number(row.orderRevenue);
  if(Number(row.orderRevenue)>=AFFILIATE_POLICY.phongChau.minF1OrderVnd){
   const completed=Number(row.completedAt);
   value.qualifiedAt=value.qualifiedAt===null?completed:Math.min(value.qualifiedAt,completed);
  }
  buyers.set(value.id,value);
 }
 const groups=new Map<string,BuyerStats[]>();
 for(const buyer of buyers.values())if(buyer.qualifiedAt!==null){const list=groups.get(buyer.referrerId)||[];list.push(buyer);groups.set(buyer.referrerId,list);}
 for(const list of groups.values())list.sort((a,b)=>a.qualifiedAt!-b.qualifiedAt!||a.id.localeCompare(b.id));
 return {buyers,groups};
}

export async function closePhongChauPool(tx:Sql,period:string,actorId:string){
 if(period>=currentShopMonth())throw new Error('Chỉ chốt tháng đã kết thúc');
 const prior=(await tx.$queryRawUnsafe('SELECT * FROM MarketAffiliatePoolMonth WHERE storeId=? AND period=?',PHONG_CHAU_STORE_ID,period))[0];
 if(prior)return {...prior,alreadyClosed:true};
 const {start,end}=await salesWindow(tx,period);
 const sales=(await tx.$queryRawUnsafe('SELECT COALESCE(SUM(s.gross),0) revenue FROM MarketSettlement s JOIN MarketOrderItem i ON i.id=s.itemId JOIN MarketOrder o ON o.id=s.orderId WHERE s.storeId=? AND s.created>=? AND s.created<? AND i.productId=?',PHONG_CHAU_STORE_ID,start,end,PHONG_CHAU_COMBO_PRODUCT_ID))[0];
 const revenue=Number(sales.revenue||0),groupAmount=commissionVnd(revenue,AFFILIATE_POLICY.phongChau.poolBps);
 const {groups}=await monthlyF1(tx,start,end);
 const packages:{referrerId:string;number:number;buyers:BuyerStats[]}[]=[];
 for(const [referrerId,buyers] of [...groups].sort(([a],[b])=>a.localeCompare(b))){
  if(buyers.length<AFFILIATE_POLICY.phongChau.requiredF1)continue;
  const sponsor=referrerId===PHONG_CHAU_STORE_ID
   ?(await tx.$queryRawUnsafe("SELECT id FROM MarketStore WHERE id=? AND status='APPROVED'",referrerId))[0]
   :(await tx.$queryRawUnsafe("SELECT id FROM User WHERE id=? AND status='ACTIVE' AND role NOT IN ('ADMIN','SUPER_ADMIN')",referrerId))[0];
  if(!sponsor)continue;
  for(let offset=0;offset+AFFILIATE_POLICY.phongChau.requiredF1<=buyers.length;offset+=AFFILIATE_POLICY.phongChau.requiredF1){
   packages.push({referrerId,number:offset/AFFILIATE_POLICY.phongChau.requiredF1+1,buyers:buyers.slice(offset,offset+AFFILIATE_POLICY.phongChau.requiredF1)});
  }
 }
 const poolAmount=groupAmount*packages.length;
 if(!Number.isSafeInteger(poolAmount))throw new Error('Tổng quỹ vượt giới hạn tính toán an toàn');
 const poolId=randomUUID(),created=Date.now();
 await tx.$executeRawUnsafe('INSERT INTO MarketAffiliatePoolMonth(id,storeId,period,revenue,rateBps,poolAmount,eligibleCount,closedBy,created,groupCount) VALUES(?,?,?,?,?,?,?,?,?,?)',poolId,PHONG_CHAU_STORE_ID,period,revenue,AFFILIATE_POLICY.phongChau.poolBps,poolAmount,packages.length*AFFILIATE_POLICY.phongChau.requiredF1,actorId,created,packages.length);
 for(const pack of packages){
  const groupId=randomUUID();
  await tx.$executeRawUnsafe('INSERT INTO MarketAffiliatePoolGroup(id,poolId,referrerId,groupNumber,memberCount,poolAmount,created) VALUES(?,?,?,?,?,?,?)',groupId,poolId,pack.referrerId,pack.number,pack.buyers.length,groupAmount,created);
  for(const share of allocateWeightedPool(groupAmount,pack.buyers.map(b=>({id:b.id,orderCount:b.orderCount,orderRevenue:b.orderRevenue})))){
   if(!share.amount)continue;
   const buyer=pack.buyers.find(b=>b.id===share.buyerId)!;
   await tx.$executeRawUnsafe('INSERT INTO MarketAffiliatePoolShare(id,poolId,beneficiaryId,qualifiedF1,amount,created,groupId,referrerId,orderCount,orderRevenue,weight,shareBps,qualifiedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',randomUUID(),poolId,buyer.id,pack.buyers.length,share.amount,created,groupId,pack.referrerId,share.orderCount,share.orderRevenue,share.weight,share.shareBps,buyer.qualifiedAt);
  }
 }
 await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),actorId,'affiliate:pool-close',poolId,created);
 return {id:poolId,storeId:PHONG_CHAU_STORE_ID,period,revenue,rateBps:AFFILIATE_POLICY.phongChau.poolBps,poolAmount,eligibleCount:packages.length*AFFILIATE_POLICY.phongChau.requiredF1,groupCount:packages.length,alreadyClosed:false};
}

export async function phongChauPoolReport(tx:Sql,beneficiaryId?:string){
 const period=currentShopMonth(),{start,end}=await salesWindow(tx,period);
 const currentRevenue=Number((await tx.$queryRawUnsafe('SELECT COALESCE(SUM(s.gross),0) revenue FROM MarketSettlement s JOIN MarketOrderItem i ON i.id=s.itemId JOIN MarketOrder o ON o.id=s.orderId WHERE s.storeId=? AND s.created>=? AND s.created<? AND i.productId=?',PHONG_CHAU_STORE_ID,start,end,PHONG_CHAU_COMBO_PRODUCT_ID))[0].revenue||0);
 const baseGroupAmount=commissionVnd(currentRevenue,AFFILIATE_POLICY.phongChau.poolBps);
 const shopRefCode=beneficiaryId?(await tx.$queryRawUnsafe('SELECT shopRefCode FROM MarketStoreF1 WHERE storeId=? AND userId=?',PHONG_CHAU_STORE_ID,beneficiaryId))[0]?.shopRefCode||'':'';
 const isStoreF1=!!shopRefCode;
 const storeF1Count=Number((await tx.$queryRawUnsafe('SELECT COUNT(*) count FROM MarketStoreF1 WHERE storeId=?',PHONG_CHAU_STORE_ID))[0].count||0);
 const storeF1Members=beneficiaryId?[]:await tx.$queryRawUnsafe('SELECT f.userId,f.shopRefCode,u.username,u.fullName,u.email,u.status,f.created FROM MarketStoreF1 f JOIN User u ON u.id=f.userId WHERE f.storeId=? ORDER BY f.created,u.username LIMIT 1000',PHONG_CHAU_STORE_ID);
 const sponsorIds=beneficiaryId&&(isStoreF1||(await tx.$queryRawUnsafe('SELECT 1 FROM MarketStore WHERE id=? AND userId=?',PHONG_CHAU_STORE_ID,beneficiaryId)).length)?[PHONG_CHAU_STORE_ID]:[];
 const members=beneficiaryId?{buyers:new Map<string,BuyerStats>(),groups:new Map<string,BuyerStats[]>()}:await monthlyF1(tx,start,end);
 if(beneficiaryId)for(const sponsorId of new Set(sponsorIds)){const subset=await monthlyF1(tx,start,end,sponsorId);for(const [id,buyer] of subset.buyers)members.buyers.set(id,buyer);for(const [id,buyers] of subset.groups)members.groups.set(id,buyers);}
 const progress:any[]=[],buyerRows:any[]=[];
 let currentGroupCount=0;
 for(const [sponsorId,buyers] of members.groups){
  const sponsor=sponsorId===PHONG_CHAU_STORE_ID
   ?(await tx.$queryRawUnsafe("SELECT name fullName,'' email,'Gian hàng' refCode,status,'STORE' role FROM MarketStore WHERE id=?",sponsorId))[0]
   :(await tx.$queryRawUnsafe('SELECT fullName,email,refCode,status,role FROM User WHERE id=?',sponsorId))[0];
  const sponsorActive=sponsorId===PHONG_CHAU_STORE_ID?sponsor?.status==='APPROVED':sponsor?.status==='ACTIVE'&&!['ADMIN','SUPER_ADMIN'].includes(sponsor?.role);
  const groupCount=sponsorActive?Math.floor(buyers.length/AFFILIATE_POLICY.phongChau.requiredF1):0;
  currentGroupCount+=groupCount;
  if(!beneficiaryId&&sponsor)progress.push({id:sponsorId,fullName:sponsor.fullName,email:sponsor.email,refCode:sponsor.refCode,qualifiedF1:buyers.length,groupCount,leftoverF1:buyers.length-groupCount*10,eligible:groupCount>0});
  for(let i=0;i<buyers.length;i++){
   const buyer=buyers[i],groupNumber=Math.floor(i/AFFILIATE_POLICY.phongChau.requiredF1)+1;
   const pack=groupNumber<=groupCount?buyers.slice((groupNumber-1)*10,groupNumber*10):[];
   const projected=pack.length?allocateWeightedPool(baseGroupAmount,pack.map(item=>({id:item.id,orderCount:item.orderCount,orderRevenue:item.orderRevenue}))).find(item=>item.buyerId===buyer.id):undefined;
   const currentGroup=buyers.slice((groupNumber-1)*AFFILIATE_POLICY.phongChau.requiredF1,groupNumber*AFFILIATE_POLICY.phongChau.requiredF1);
   buyerRows.push({...buyer,groupNumber,groupComplete:!!pack.length,groupMemberCount:currentGroup.length,groupRevenue:currentGroup.reduce((sum,row)=>sum+row.orderRevenue,0),groupPoolAmount:pack.length?baseGroupAmount:0,projectedAmount:projected?.amount||0,shareBps:projected?.shareBps||0,weight:projected?.weight||''});
  }
 }
 progress.sort((a,b)=>b.qualifiedF1-a.qualifiedF1||a.fullName.localeCompare(b.fullName));
 buyerRows.sort((a,b)=>a.referrerId.localeCompare(b.referrerId)||a.groupNumber-b.groupNumber||a.qualifiedAt-b.qualifiedAt||a.id.localeCompare(b.id));
 const months=await tx.$queryRawUnsafe('SELECT m.*,u.fullName closedByName,COALESCE(w.opened,0) withdrawalOpen FROM MarketAffiliatePoolMonth m LEFT JOIN User u ON u.id=m.closedBy LEFT JOIN MarketAffiliatePoolWithdrawalWindow w ON w.period=m.period WHERE m.storeId=? ORDER BY m.period DESC LIMIT 24',PHONG_CHAU_STORE_ID);
 const closedGroups=beneficiaryId?[]:await tx.$queryRawUnsafe('SELECT g.*,m.period,COALESCE(u.fullName,store.name) referrerName FROM MarketAffiliatePoolGroup g JOIN MarketAffiliatePoolMonth m ON m.id=g.poolId LEFT JOIN User u ON u.id=g.referrerId LEFT JOIN MarketStore store ON store.id=g.referrerId WHERE m.storeId=? ORDER BY m.period DESC,g.referrerId,g.groupNumber LIMIT 1000',PHONG_CHAU_STORE_ID);
 const shares=beneficiaryId
  ?await tx.$queryRawUnsafe('SELECT s.*,m.period,m.revenue,m.poolAmount,g.groupNumber,COALESCE(w.opened,0) withdrawalOpen,x.id withdrawalId,x.status withdrawalStatus FROM MarketAffiliatePoolShare s JOIN MarketAffiliatePoolMonth m ON m.id=s.poolId LEFT JOIN MarketAffiliatePoolGroup g ON g.id=s.groupId LEFT JOIN MarketAffiliatePoolWithdrawalWindow w ON w.period=m.period LEFT JOIN MarketAffiliatePoolWithdrawal x ON x.shareId=s.id WHERE s.beneficiaryId=? ORDER BY m.period DESC',beneficiaryId)
  :await tx.$queryRawUnsafe('SELECT s.*,m.period,u.fullName beneficiaryName,u.email beneficiaryEmail,COALESCE(r.fullName,store.name) referrerName,g.groupNumber,p.reference paymentReference,COALESCE(w.opened,0) withdrawalOpen,x.id withdrawalId,x.status withdrawalStatus,x.bankName,x.bankAccount,x.accountName FROM MarketAffiliatePoolShare s JOIN MarketAffiliatePoolMonth m ON m.id=s.poolId JOIN User u ON u.id=s.beneficiaryId LEFT JOIN User r ON r.id=s.referrerId LEFT JOIN MarketStore store ON store.id=s.referrerId LEFT JOIN MarketAffiliatePoolGroup g ON g.id=s.groupId LEFT JOIN MarketAffiliatePayout p ON p.id=s.payoutId LEFT JOIN MarketAffiliatePoolWithdrawalWindow w ON w.period=m.period LEFT JOIN MarketAffiliatePoolWithdrawal x ON x.shareId=s.id WHERE m.storeId=? ORDER BY m.period DESC,u.fullName LIMIT 1000',PHONG_CHAU_STORE_ID);
 const buyerStatus=beneficiaryId?buyerRows.find(row=>row.id===beneficiaryId)||members.buyers.get(beneficiaryId)||null:undefined;
 const wallet=beneficiaryId?{
  projected:Number(buyerStatus?.projectedAmount||0),
  locked:shares.filter(row=>row.status==='ACCRUED'&&!row.withdrawalOpen&&!row.withdrawalId).reduce((sum,row)=>sum+Number(row.amount),0),
  available:shares.filter(row=>row.status==='ACCRUED'&&row.withdrawalOpen&&!row.withdrawalId).reduce((sum,row)=>sum+Number(row.amount),0),
  requested:shares.filter(row=>row.status==='ACCRUED'&&row.withdrawalId).reduce((sum,row)=>sum+Number(row.amount),0),
  paid:shares.filter(row=>row.status==='PAID').reduce((sum,row)=>sum+Number(row.amount),0)
 }:undefined;
 const bankAccount=beneficiaryId?(await tx.$queryRawUnsafe('SELECT bankName,bankAccount,accountName,updated FROM MarketAffiliateBankAccount WHERE userId=?',beneficiaryId))[0]||null:undefined;
 const directWithdrawals=beneficiaryId?[]:await tx.$queryRawUnsafe("SELECT w.*,c.orderId,c.amount,c.revenue,c.rateBps,c.status commissionStatus,u.fullName beneficiaryName,u.email beneficiaryEmail,p.reference paymentReference FROM MarketAffiliateDirectWithdrawal w JOIN MarketAffiliateCommission c ON c.id=w.commissionId JOIN User u ON u.id=w.beneficiaryId LEFT JOIN MarketAffiliatePayout p ON p.id=w.payoutId WHERE c.sourceKey=? ORDER BY w.created DESC LIMIT 1000",PHONG_CHAU_STORE_ID);
 return {policy:AFFILIATE_POLICY.phongChau,period,currentRevenue,baseGroupAmount,currentPool:baseGroupAmount*currentGroupCount,currentGroupCount,isStoreF1,shopRefCode,storeF1Count,storeF1Members,qualifiedF1:beneficiaryId?Math.max(0,...sponsorIds.map(id=>members.groups.get(id)?.length||0)):undefined,buyerStatus,progress,buyers:beneficiaryId?[]:buyerRows,months,groups:closedGroups,shares,wallet,bankAccount,directWithdrawals};
}

export async function savePhongChauBankAccount(tx:Sql,userId:string,body:any){
 const bankName=typeof body.bankName==='string'?body.bankName.trim().slice(0,120):'';
 const bankAccount=typeof body.bankAccount==='string'?body.bankAccount.trim().slice(0,40):'';
 const accountName=typeof body.accountName==='string'?body.accountName.trim().slice(0,120):'';
 if(!bankName||!/^\d{4,40}$/.test(bankAccount)||!accountName)throw new Error('Vui lòng nhập đầy đủ ngân hàng, số tài khoản và tên người thụ hưởng');
 const stamp=Date.now();
 await tx.$executeRawUnsafe('INSERT INTO MarketAffiliateBankAccount(userId,bankName,bankAccount,accountName,updated) VALUES(?,?,?,?,?) ON CONFLICT(userId) DO UPDATE SET bankName=excluded.bankName,bankAccount=excluded.bankAccount,accountName=excluded.accountName,updated=excluded.updated',userId,bankName,bankAccount,accountName,stamp);
 await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),userId,'affiliate:bank-linked',userId,stamp);
 return {bankName,bankAccount,accountName,updated:stamp};
}

export async function setPhongChauWithdrawalWindow(tx:Sql,actorId:string,period:string,opened:boolean){
 if(typeof opened!=='boolean')throw new Error('Trạng thái mở rút không hợp lệ');
 monthBounds(period);
 const closed=(await tx.$queryRawUnsafe('SELECT id FROM MarketAffiliatePoolMonth WHERE storeId=? AND period=?',PHONG_CHAU_STORE_ID,period))[0];
 if(!closed)throw new Error('Phải chốt quỹ tháng trước khi mở rút');
 if(period>=currentShopMonth())throw new Error('Chỉ được mở rút sau khi tháng đã kết thúc');
 const stamp=Date.now();
 await tx.$executeRawUnsafe('INSERT INTO MarketAffiliatePoolWithdrawalWindow(period,opened,updatedBy,updated) VALUES(?,?,?,?) ON CONFLICT(period) DO UPDATE SET opened=excluded.opened,updatedBy=excluded.updatedBy,updated=excluded.updated',period,opened?1:0,actorId,stamp);
 await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),actorId,opened?'affiliate:pool-withdraw-open':'affiliate:pool-withdraw-close',period,stamp);
 return {period,withdrawalOpen:opened};
}

export async function requestPhongChauWithdrawal(tx:Sql,userId:string,body:any){
 const shareId=typeof body.shareId==='string'?body.shareId.trim().slice(0,100):'';
 const linked=(await tx.$queryRawUnsafe('SELECT bankName,bankAccount,accountName FROM MarketAffiliateBankAccount WHERE userId=?',userId))[0];
 if(!shareId||!linked)throw new Error('Vui lòng liên kết tài khoản ngân hàng trước khi yêu cầu rút');
 const share=(await tx.$queryRawUnsafe("SELECT s.id,s.amount,s.status,m.period,COALESCE(w.opened,0) withdrawalOpen,x.id withdrawalId FROM MarketAffiliatePoolShare s JOIN MarketAffiliatePoolMonth m ON m.id=s.poolId LEFT JOIN MarketAffiliatePoolWithdrawalWindow w ON w.period=m.period LEFT JOIN MarketAffiliatePoolWithdrawal x ON x.shareId=s.id WHERE s.id=? AND s.beneficiaryId=? AND m.storeId=?",shareId,userId,PHONG_CHAU_STORE_ID))[0];
 if(!share)throw new Error('Khoản đồng chia không tồn tại');
 if(share.status!=='ACCRUED'||share.withdrawalId)throw new Error('Khoản đồng chia đã được yêu cầu rút hoặc đã thanh toán');
 if(!share.withdrawalOpen)throw new Error('Gian hàng chưa mở rút cho tháng này');
 const id=randomUUID(),stamp=Date.now();
 await tx.$executeRawUnsafe('INSERT INTO MarketAffiliatePoolWithdrawal(id,shareId,beneficiaryId,bankName,bankAccount,accountName,created) VALUES(?,?,?,?,?,?,?)',id,shareId,userId,linked.bankName,linked.bankAccount,linked.accountName,stamp);
 await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),userId,'affiliate:pool-withdraw-request',id,stamp);
 return {id,amount:Number(share.amount),period:share.period};
}

async function requestDirectWithdrawal(tx:Sql,userId:string,body:any,storeId:string){
 const commissionId=typeof body.commissionId==='string'?body.commissionId.trim().slice(0,100):'';
 const linked=(await tx.$queryRawUnsafe('SELECT bankName,bankAccount,accountName FROM MarketAffiliateBankAccount WHERE userId=?',userId))[0];
 if(!linked)throw new Error('Vui lòng liên kết tài khoản ngân hàng trước khi yêu cầu rút');
 const commission=(await tx.$queryRawUnsafe("SELECT c.id,c.orderId,c.amount,c.status,o.status orderStatus,v.commissionId voidId FROM MarketAffiliateCommission c JOIN MarketOrder o ON o.id=c.orderId LEFT JOIN MarketAffiliateCommissionVoid v ON v.commissionId=c.id WHERE c.id=? AND c.beneficiaryId=? AND c.kind='CONNECTION' AND c.level=1 AND c.sourceKey=? AND c.rateBps=?",commissionId,userId,storeId,2000))[0];
 if(!commission)throw new Error('Hoa hồng trực tiếp không tồn tại');
 if(commission.voidId||commission.status!=='ACCRUED'||!['CONFIRMED','SHIPPED','COMPLETED'].includes(commission.orderStatus))throw new Error('Hoa hồng chưa thể rút hoặc đã được thanh toán');
 if((await tx.$queryRawUnsafe('SELECT id FROM MarketAffiliateDirectWithdrawal WHERE commissionId=?',commissionId)).length)throw new Error('Hoa hồng đã được yêu cầu rút');
 const id=randomUUID(),stamp=Date.now();
 await tx.$executeRawUnsafe('INSERT INTO MarketAffiliateDirectWithdrawal(id,commissionId,beneficiaryId,bankName,bankAccount,accountName,created) VALUES(?,?,?,?,?,?,?)',id,commissionId,userId,linked.bankName,linked.bankAccount,linked.accountName,stamp);
 await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),userId,'affiliate:direct-withdraw-request',id,stamp);
 const seller=(await tx.$queryRawUnsafe('SELECT userId FROM MarketStore WHERE id=?',storeId))[0];
 if(seller)await tx.$executeRawUnsafe('INSERT INTO MarketNotification VALUES(?,?,?,?,0,?)',randomUUID(),seller.userId,'F1 yêu cầu rút hoa hồng trực tiếp',`Đơn #${commission.orderId.slice(0,8)}: ${Number(commission.amount).toLocaleString('vi-VN')}₫. Vui lòng đối soát và thanh toán.`,stamp);
 return {id,amount:Number(commission.amount)};
}
export function requestPhongChauDirectWithdrawal(tx:Sql,userId:string,body:any){return requestDirectWithdrawal(tx,userId,body,PHONG_CHAU_STORE_ID)}
export function requestMiziDirectWithdrawal(tx:Sql,userId:string,body:any){return requestDirectWithdrawal(tx,userId,body,MIZI_MALL_STORE_ID)}

export async function requestGeneralAffiliateWithdrawal(tx:Sql,userId:string,body:any){
 const commissionId=typeof body.commissionId==='string'?body.commissionId.trim().slice(0,100):'';
 const linked=(await tx.$queryRawUnsafe('SELECT bankName,bankAccount,accountName FROM MarketAffiliateBankAccount WHERE userId=?',userId))[0];
 if(!linked)throw new Error('Vui lòng liên kết tài khoản ngân hàng trước khi yêu cầu rút');
 const commission=(await tx.$queryRawUnsafe("SELECT c.id,c.orderId,c.amount,c.status,o.status orderStatus,v.commissionId voidId FROM MarketAffiliateCommission c JOIN MarketOrder o ON o.id=c.orderId LEFT JOIN MarketAffiliateCommissionVoid v ON v.commissionId=c.id WHERE c.id=? AND c.beneficiaryId=? AND NOT (c.sourceKey IN (?,?) AND c.kind='CONNECTION' AND c.level=1 AND c.rateBps=2000)",commissionId,userId,PHONG_CHAU_STORE_ID,MIZI_MALL_STORE_ID))[0];
 if(!commission||commission.voidId)throw new Error('Khoản hoa hồng không tồn tại hoặc đã bị hủy');
 if(commission.status!=='ACCRUED'||!['CONFIRMED','SHIPPED','COMPLETED'].includes(commission.orderStatus))throw new Error('Hoa hồng chưa thể rút hoặc đã được thanh toán');
 if((await tx.$queryRawUnsafe('SELECT id FROM MarketAffiliateDirectWithdrawal WHERE commissionId=?',commissionId)).length)throw new Error('Hoa hồng đã được yêu cầu rút');
 const id=randomUUID(),stamp=Date.now();
 await tx.$executeRawUnsafe('INSERT INTO MarketAffiliateDirectWithdrawal(id,commissionId,beneficiaryId,bankName,bankAccount,accountName,created) VALUES(?,?,?,?,?,?,?)',id,commissionId,userId,linked.bankName,linked.bankAccount,linked.accountName,stamp);
 await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),userId,'affiliate:general-withdraw-request',id,stamp);
 return {id,amount:Number(commission.amount)};
}

export async function confirmPhongChauPoolPayment(tx:Sql,actorId:string,body:any){
 if(body.confirmed!==true)throw new Error('Cần xác nhận khoản tiền đã thanh toán thực tế');
 const ids=body.ids;if(!Array.isArray(ids)||!ids.length||ids.length>200||ids.some((v:any)=>typeof v!=='string'||!v)||new Set(ids).size!==ids.length)throw new Error('Danh sách khoản chia không hợp lệ');
 const reference=typeof body.reference==='string'?body.reference.trim().slice(0,160):'';
 const requestId=typeof body.requestId==='string'?body.requestId.trim().slice(0,100):'';
 const note=typeof body.note==='string'?body.note.trim().slice(0,1000):'';
 if(!reference||!requestId)throw new Error('Cần nhập mã chứng từ và mã yêu cầu');
 const expected=Number(body.expectedAmount);if(!Number.isSafeInteger(expected)||expected<=0)throw new Error('Số tiền xác nhận không hợp lệ');
 const existing=(await tx.$queryRawUnsafe('SELECT * FROM MarketAffiliatePayout WHERE requestId=?',requestId))[0];
 if(existing){const previous=(await tx.$queryRawUnsafe('SELECT id FROM MarketAffiliatePoolShare WHERE payoutId=?',existing.id)).map(row=>row.id);if(existing.amountVnd!==expected||existing.reference!==reference||previous.length!==ids.length||!previous.every(id=>ids.includes(id)))throw new Error('Mã yêu cầu đã dùng với dữ liệu khác');return {payoutId:existing.id,amount:expected,alreadyConfirmed:true};}
 const marks=ids.map(()=>'?').join(',');
 const shares=await tx.$queryRawUnsafe(`SELECT s.id,s.beneficiaryId,s.amount,s.status,s.payoutId,x.id withdrawalId,x.status withdrawalStatus FROM MarketAffiliatePoolShare s LEFT JOIN MarketAffiliatePoolWithdrawal x ON x.shareId=s.id WHERE s.id IN (${marks})`,...ids);
 if(shares.length!==ids.length||shares.some(row=>row.status!=='ACCRUED'||row.payoutId||!row.withdrawalId||row.withdrawalStatus!=='REQUESTED'))throw new Error('Khoản chia chưa có yêu cầu rút hợp lệ hoặc đã thay đổi. Vui lòng tải lại');
 const uid=shares[0].beneficiaryId;if(shares.some(row=>row.beneficiaryId!==uid))throw new Error('Mỗi lần chỉ thanh toán cho một người nhận');
 const amount=shares.reduce((n,row)=>n+Number(row.amount),0);if(amount!==expected)throw new Error('Số tiền đã thay đổi. Vui lòng đối soát lại');
 const payoutId=randomUUID(),stamp=Date.now();
 await tx.$executeRawUnsafe('INSERT INTO MarketAffiliatePayout(id,requestId,beneficiaryId,amountVnd,reference,note,createdBy,created) VALUES(?,?,?,?,?,?,?,?)',payoutId,requestId,uid,amount,reference,note,actorId,stamp);
 const changed=await tx.$executeRawUnsafe(`UPDATE MarketAffiliatePoolShare SET status='PAID',payoutId=?,paidAt=?,paidBy=? WHERE id IN (${marks}) AND status='ACCRUED' AND payoutId IS NULL`,payoutId,stamp,actorId,...ids);
 if(changed!==ids.length)throw new Error('Khoản chia vừa thay đổi');
 await tx.$executeRawUnsafe(`UPDATE MarketAffiliatePoolWithdrawal SET status='PAID',payoutId=?,paidAt=? WHERE shareId IN (${marks}) AND status='REQUESTED'`,payoutId,stamp,...ids);
 await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),actorId,'affiliate:pool-payment',payoutId,stamp);
 return {payoutId,amount,alreadyConfirmed:false};
}
