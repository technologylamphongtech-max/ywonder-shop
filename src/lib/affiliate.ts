import {randomUUID} from 'crypto';
import {PHONG_CHAU_COMBO_PRODUCT_ID} from './product-detail';
import {affiliateNetworkSummary} from './affiliate-network';

// Phong Châu affiliate codes and attribution belong only to YWonderShop.
export const PHONG_CHAU_STORE_ID='70297741-e78b-4ef9-b659-80fc513330a8';
export const MIZI_MALL_STORE_ID='c13d55d8-8da2-4d38-91c3-6204ac0465c5';
export {PHONG_CHAU_COMBO_PRODUCT_ID};
export const AFFILIATE_POLICY={businessBps:100,levelsBps:[100,50,50,50,50,50,50,50,50],phongChau:{storeId:PHONG_CHAU_STORE_ID,directBps:2000,poolBps:1000,requiredF1:10,minF1OrderVnd:2500000},miziMall:{storeId:MIZI_MALL_STORE_ID,directBps:2000},currency:'VND'} as const;
type Sql={ $queryRawUnsafe:(sql:string,...args:any[])=>Promise<any[]>; $executeRawUnsafe:(sql:string,...args:any[])=>Promise<number> };
type UserRow={id:string;referredById:string|null;status:string;role:string};
type ChainMember={level:number;beneficiaryId:string};

export function commissionVnd(revenue:number,bps:number):number{
 if(!Number.isSafeInteger(revenue)||revenue<0||!Number.isSafeInteger(bps)||bps<0||bps>10000)throw new Error('Doanh thu hoa hồng không hợp lệ');
 return Number(BigInt(revenue)*BigInt(bps)/BigInt(10000));
}

// Allocate every discount, including vouchers/YWH, without a negative final item.
export function allocateDiscounts(gross:number[],discount:number):number[]{
 const total=gross.reduce((a,b)=>a+b,0);
 if(!Number.isSafeInteger(discount)||discount<0||discount>total||gross.some(v=>!Number.isSafeInteger(v)||v<0))throw new Error('Giảm giá không hợp lệ');
 let remaining=discount,remainingGross=total;
 return gross.map(value=>{const part=remainingGross?Number(BigInt(remaining)*BigInt(value)/BigInt(remainingGross)):0;remaining-=part;remainingGross-=value;return part});
}

async function referralChain(sourceId:string,getUser:(id:string)=>Promise<UserRow|null>):Promise<ChainMember[]>{
 const visited=new Set([sourceId]),result:ChainMember[]=[];let current=sourceId;
 for(let level=1;level<=9;level++){
  const source=await getUser(current),next=source?.referredById;
  if(!next||visited.has(next))break;
  visited.add(next);const user=await getUser(next);if(!user)break;
  if(user.status==='ACTIVE'&&!['ADMIN','SUPER_ADMIN'].includes(user.role))result.push({level,beneficiaryId:next});
  current=next;
 }
 return result;
}

async function comboOnlyEffective(tx:Sql){
 const row=(await tx.$queryRawUnsafe("SELECT value FROM MarketSetting WHERE key='affiliate:phongchau:combo-only:effective'"))[0];
 return Number(row?.value||Number.MAX_SAFE_INTEGER);
}
async function miziEffective(tx:Sql){
 const row=(await tx.$queryRawUnsafe("SELECT value FROM MarketSetting WHERE key='affiliate:mizi-mall:effective'"))[0];
 return Number(row?.value||Number.MAX_SAFE_INTEGER);
}

export async function captureAffiliateOrder(tx:Sql,orderId:string,buyerId:string,shopRefCode='',refCode=''){
 const comboOnly=Date.now()>=await comboOnlyEffective(tx);
 const stores=await tx.$queryRawUnsafe('SELECT DISTINCT s.id,s.userId,s.affiliateReferrerId FROM MarketOrderItem i JOIN MarketStore s ON s.id=i.storeId WHERE i.orderId=?',orderId);
 const isSelected=async(id:string)=>!!(await tx.$queryRawUnsafe('SELECT 1 FROM MarketStoreF1 WHERE storeId=? AND userId=?',PHONG_CHAU_STORE_ID,id))[0];
 const snapshotBusinesses=async()=>{for(const store of stores){
  if(store.id===PHONG_CHAU_STORE_ID||!store.affiliateReferrerId||store.affiliateReferrerId===store.userId)continue;
  const ref=(await tx.$queryRawUnsafe("SELECT id FROM User WHERE id=? AND status='ACTIVE' AND role NOT IN ('ADMIN','SUPER_ADMIN')",store.affiliateReferrerId))[0];
  if(ref&&(comboOnly||!await isSelected(ref.id)))await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketAffiliateOrderBusiness(orderId,storeId,beneficiaryId) VALUES(?,?,?)',orderId,store.id,ref.id);
 }};
 if(shopRefCode){
  if(!/^pc_[a-f0-9]{24}$/.test(shopRefCode))throw new Error('Mã giới thiệu Phong Châu trên Shop không hợp lệ');
  if(!stores.some(store=>store.id===PHONG_CHAU_STORE_ID))return;
  const ref=(await tx.$queryRawUnsafe("SELECT f.userId FROM MarketStoreF1 f JOIN User u ON u.id=f.userId WHERE f.storeId=? AND f.shopRefCode=? AND u.status='ACTIVE' AND u.role NOT IN ('ADMIN','SUPER_ADMIN') LIMIT 1",PHONG_CHAU_STORE_ID,shopRefCode))[0];
  if(!ref)throw new Error('Link giới thiệu Phong Châu không còn hiệu lực');
  if(ref.userId===buyerId)throw new Error('Không thể dùng link giới thiệu của chính mình');
  const created=Date.now();
  await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketAffiliateOrder(orderId,created) VALUES(?,?)',orderId,created);
  if(!comboOnly)await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketAffiliateOrderChain(orderId,level,beneficiaryId) VALUES(?,?,?)',orderId,1,ref.userId);
  const inserted=await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketAffiliateOrderPhongChau(orderId,beneficiaryId,created) VALUES(?,?,?)',orderId,ref.userId,created);
  if(inserted===1)await tx.$executeRawUnsafe('INSERT INTO MarketNotification VALUES(?,?,?,?,0,?)',randomUUID(),ref.userId,'Có đơn từ link giới thiệu Phong Châu',`Đơn #${orderId.slice(0,8)} đã được đặt qua link Shop của bạn. Hoa hồng 20% sẽ ghi nhận khi gian hàng duyệt đơn.`,created);
  if(!comboOnly){await snapshotBusinesses();return;}
 }

 const getUser=async(id:string)=>(await tx.$queryRawUnsafe('SELECT id,referredById,status,role FROM User WHERE id=?',id))[0]||null;
 let chain:ChainMember[]=[];
 if(refCode){
  const ref=(await tx.$queryRawUnsafe('SELECT id,referredById,status,role FROM User WHERE (refCode=? OR refCode=?) LIMIT 1',refCode,refCode.toLowerCase()))[0];
  if(!ref||ref.status!=='ACTIVE'||['ADMIN','SUPER_ADMIN'].includes(ref.role)||ref.id===buyerId)throw new Error('Link giới thiệu không hợp lệ');
  const parents=await referralChain(ref.id,getUser);
  if(parents.some(member=>member.beneficiaryId===buyerId))throw new Error('Không thể dùng link giới thiệu của tuyến dưới');
  chain=[{level:1,beneficiaryId:ref.id},...parents.filter(member=>member.level<9).map(member=>({level:member.level+1,beneficiaryId:member.beneficiaryId}))];
 }else chain=await referralChain(buyerId,getUser);
 if(!comboOnly)chain=(await Promise.all(chain.map(async member=>await isSelected(member.beneficiaryId)?null:member))).filter((member):member is ChainMember=>!!member);
 const created=Date.now();
 await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketAffiliateOrder(orderId,created) VALUES(?,?)',orderId,created);
 for(const member of chain)await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketAffiliateOrderChain(orderId,level,beneficiaryId) VALUES(?,?,?)',orderId,member.level,member.beneficiaryId);
 await snapshotBusinesses();
}

export async function accrueAffiliateOrder(tx:Sql,order:any,items:any[]){
 const captured=(await tx.$queryRawUnsafe('SELECT orderId,created FROM MarketAffiliateOrder WHERE orderId=?',order.id))[0];
 // Orders placed before launch retain their existing commercial terms.
 if(!captured)return;
 const totalRevenue=items.reduce((sum,item)=>sum+Number(item.net),0);
 if(totalRevenue!==Number(order.total)-Number(order.shipping))throw new Error('Doanh thu đơn hàng không khớp');
 const created=Date.now();
 const record=async(kind:string,level:number,sourceKey:string,beneficiaryId:string,revenue:number,rateBps:number)=>{
  const eligible=(await tx.$queryRawUnsafe('SELECT id FROM User WHERE id=? AND status=?',beneficiaryId,'ACTIVE'))[0];if(!eligible)return;
  const amount=commissionVnd(revenue,rateBps);if(!amount)return;
  const inserted=await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketAffiliateCommission(id,orderId,beneficiaryId,sourceUserId,kind,level,sourceKey,revenue,rateBps,amount,currency,status,created) VALUES(?,?,?,?,?,?,?,?,?,?,?, ?,?)',randomUUID(),order.id,beneficiaryId,order.userId,kind,level,sourceKey,revenue,rateBps,amount,'VND','ACCRUED',created);
  if(inserted===1&&(sourceKey===PHONG_CHAU_STORE_ID||sourceKey===MIZI_MALL_STORE_ID))await tx.$executeRawUnsafe('INSERT INTO MarketNotification VALUES(?,?,?,?,0,?)',randomUUID(),beneficiaryId,`Đã ghi nhận hoa hồng ${sourceKey===MIZI_MALL_STORE_ID?'Mizi mall':'Phong Châu'}`,`Đơn #${order.id.slice(0,8)} đã được duyệt. Hoa hồng trực tiếp của bạn: ${amount.toLocaleString('vi-VN')}₫.`,created);
 };
 // The COMBO policy applies to historical COMBO orders too. An old order
 // completed after migration must never accrue the former F1-F9 rates.
 if(items.length&&items.every(item=>item.productId===PHONG_CHAU_COMBO_PRODUCT_ID)){
  const selectedF1=(await tx.$queryRawUnsafe('SELECT beneficiaryId FROM MarketAffiliateOrderPhongChau WHERE orderId=?',order.id))[0]?.beneficiaryId;
  if(selectedF1)await record('CONNECTION',1,PHONG_CHAU_STORE_ID,selectedF1,totalRevenue,AFFILIATE_POLICY.phongChau.directBps);
  return;
 }
 const chain=await tx.$queryRawUnsafe('SELECT level,beneficiaryId FROM MarketAffiliateOrderChain WHERE orderId=? ORDER BY level',order.id);
 if(Number(captured.created)>=await comboOnlyEffective(tx)){
  const comboRevenue=items.filter(item=>item.productId===PHONG_CHAU_COMBO_PRODUCT_ID).reduce((sum,item)=>sum+Number(item.net),0);
  const miziRevenue=Number(captured.created)>=await miziEffective(tx)?items.filter(item=>item.storeId===MIZI_MALL_STORE_ID).reduce((sum,item)=>sum+Number(item.net),0):0;
  const selectedF1=comboRevenue?(await tx.$queryRawUnsafe('SELECT beneficiaryId FROM MarketAffiliateOrderPhongChau WHERE orderId=?',order.id))[0]?.beneficiaryId:null;
  if(selectedF1)await record('CONNECTION',1,PHONG_CHAU_STORE_ID,selectedF1,comboRevenue,AFFILIATE_POLICY.phongChau.directBps);
  const legacyRevenue=totalRevenue-comboRevenue-miziRevenue;
  for(const member of chain){const level=Number(member.level);if(level===1&&miziRevenue)await record('CONNECTION',1,MIZI_MALL_STORE_ID,member.beneficiaryId,miziRevenue,AFFILIATE_POLICY.miziMall.directBps);if(legacyRevenue)await record('CONNECTION',level,'buyer',member.beneficiaryId,legacyRevenue,AFFILIATE_POLICY.levelsBps[level-1]);}
  const businesses=await tx.$queryRawUnsafe('SELECT storeId,beneficiaryId FROM MarketAffiliateOrderBusiness WHERE orderId=?',order.id);
  for(const business of businesses){if(business.storeId===PHONG_CHAU_STORE_ID||business.storeId===MIZI_MALL_STORE_ID&&miziRevenue)continue;const revenue=items.filter(item=>item.storeId===business.storeId).reduce((sum,item)=>sum+Number(item.net),0);await record('BUSINESS',1,business.storeId,business.beneficiaryId,revenue,AFFILIATE_POLICY.businessBps);}
  return;
 }
 const effective=(await tx.$queryRawUnsafe("SELECT value FROM MarketSetting WHERE key='affiliate:phongchau:effective'"))[0];
 const newPolicy=Number(captured.created)>=Number(effective?.value||Number.MAX_SAFE_INTEGER);
 const exclusive=(await tx.$queryRawUnsafe("SELECT value FROM MarketSetting WHERE key='affiliate:phongchau:exclusive:effective'"))[0];
 const exclusivePolicy=Number(captured.created)>=Number(exclusive?.value||Number.MAX_SAFE_INTEGER);
 const shopOnly=(await tx.$queryRawUnsafe("SELECT value FROM MarketSetting WHERE key='affiliate:phongchau:shop-only:effective'"))[0];
 const shopOnlyPolicy=Number(captured.created)>=Number(shopOnly?.value||Number.MAX_SAFE_INTEGER);
 const restored=(await tx.$queryRawUnsafe("SELECT value FROM MarketSetting WHERE key='affiliate:legacy-restored:effective'"))[0];
 const legacyRestored=Number(captured.created)>=Number(restored?.value||Number.MAX_SAFE_INTEGER);
 const phongChauRevenue=newPolicy?items.filter(item=>item.storeId===PHONG_CHAU_STORE_ID).reduce((sum,item)=>sum+Number(item.net),0):0;
 const selectedF1=phongChauRevenue?(await tx.$queryRawUnsafe('SELECT beneficiaryId FROM MarketAffiliateOrderPhongChau WHERE orderId=?',order.id))[0]?.beneficiaryId:null;
 const legacyRevenue=legacyRestored?(selectedF1?0:totalRevenue):(exclusivePolicy||shopOnlyPolicy?0:totalRevenue-phongChauRevenue);
 for(const member of chain){
  const level=Number(member.level);
  if(phongChauRevenue&&level===1&&member.beneficiaryId===selectedF1)await record('CONNECTION',1,PHONG_CHAU_STORE_ID,member.beneficiaryId,phongChauRevenue,AFFILIATE_POLICY.phongChau.directBps);
  if(legacyRevenue)await record('CONNECTION',level,'buyer',member.beneficiaryId,legacyRevenue,AFFILIATE_POLICY.levelsBps[level-1]);
 }
 const businesses=await tx.$queryRawUnsafe('SELECT storeId,beneficiaryId FROM MarketAffiliateOrderBusiness WHERE orderId=?',order.id);
 for(const business of businesses){if(!legacyRestored&&(exclusivePolicy||shopOnlyPolicy)||newPolicy&&business.storeId===PHONG_CHAU_STORE_ID)continue;const revenue=items.filter(item=>item.storeId===business.storeId).reduce((sum,item)=>sum+Number(item.net),0);await record('BUSINESS',1,business.storeId,business.beneficiaryId,revenue,AFFILIATE_POLICY.businessBps);}
}

export async function voidUnpaidAffiliateOrder(tx:Sql,orderId:string,actorId:string){
 const commissions=await tx.$queryRawUnsafe("SELECT c.id,c.status,d.id withdrawalId FROM MarketAffiliateCommission c LEFT JOIN MarketAffiliateDirectWithdrawal d ON d.commissionId=c.id LEFT JOIN MarketAffiliateCommissionVoid v ON v.commissionId=c.id WHERE c.orderId=? AND v.commissionId IS NULL",orderId);
 if(commissions.some(c=>c.status!=='ACCRUED'||c.withdrawalId))throw new Error('Đơn có hoa hồng đã yêu cầu rút hoặc đã thanh toán. Cần xử lý hoa hồng trước khi hủy đơn');
 const stamp=Date.now();
 for(const commission of commissions)await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketAffiliateCommissionVoid(commissionId,reason,createdBy,created) VALUES(?,?,?,?)',commission.id,'Đơn hàng bị hủy sau khi duyệt',actorId,stamp);
}

export async function affiliateSummary(tx:Sql,beneficiaryId?:string){
 const args=beneficiaryId?[beneficiaryId]:[];
 const activeWhere=beneficiaryId?'WHERE c.beneficiaryId=? AND v.commissionId IS NULL':'WHERE v.commissionId IS NULL';
 const totals=(await tx.$queryRawUnsafe(`SELECT COALESCE(SUM(c.amount),0) earned,COALESCE(SUM(CASE WHEN c.status='ACCRUED' THEN c.amount ELSE 0 END),0) accrued,COUNT(*) entries FROM MarketAffiliateCommission c LEFT JOIN MarketAffiliateCommissionVoid v ON v.commissionId=c.id ${activeWhere}`,...args))[0];
 const commissions=await tx.$queryRawUnsafe(`SELECT c.*,u.fullName beneficiaryName,d.id directWithdrawalId,d.status directWithdrawalStatus FROM MarketAffiliateCommission c JOIN User u ON u.id=c.beneficiaryId LEFT JOIN MarketAffiliateDirectWithdrawal d ON d.commissionId=c.id LEFT JOIN MarketAffiliateCommissionVoid v ON v.commissionId=c.id ${activeWhere} ORDER BY c.created DESC LIMIT 100`,...args);
 const directWallet=beneficiaryId?(await tx.$queryRawUnsafe("SELECT COALESCE(SUM(CASE WHEN c.status='ACCRUED' AND d.id IS NULL THEN c.amount ELSE 0 END),0) available,COALESCE(SUM(CASE WHEN c.status='ACCRUED' AND d.status='REQUESTED' THEN c.amount ELSE 0 END),0) requested,COALESCE(SUM(CASE WHEN c.status='PAID' THEN c.amount ELSE 0 END),0) paid FROM MarketAffiliateCommission c LEFT JOIN MarketAffiliateDirectWithdrawal d ON d.commissionId=c.id LEFT JOIN MarketAffiliateCommissionVoid v ON v.commissionId=c.id WHERE v.commissionId IS NULL AND c.beneficiaryId=? AND c.kind='CONNECTION' AND c.level=1 AND c.sourceKey=? AND c.rateBps=?",beneficiaryId,PHONG_CHAU_STORE_ID,AFFILIATE_POLICY.phongChau.directBps))[0]:undefined;
 const miziDirectWallet=beneficiaryId?(await tx.$queryRawUnsafe("SELECT COALESCE(SUM(CASE WHEN c.status='ACCRUED' AND d.id IS NULL THEN c.amount ELSE 0 END),0) available,COALESCE(SUM(CASE WHEN c.status='ACCRUED' AND d.status='REQUESTED' THEN c.amount ELSE 0 END),0) requested,COALESCE(SUM(CASE WHEN c.status='PAID' THEN c.amount ELSE 0 END),0) paid FROM MarketAffiliateCommission c LEFT JOIN MarketAffiliateDirectWithdrawal d ON d.commissionId=c.id LEFT JOIN MarketAffiliateCommissionVoid v ON v.commissionId=c.id WHERE v.commissionId IS NULL AND c.beneficiaryId=? AND c.kind='CONNECTION' AND c.level=1 AND c.sourceKey=? AND c.rateBps=?",beneficiaryId,MIZI_MALL_STORE_ID,AFFILIATE_POLICY.miziMall.directBps))[0]:undefined;
 const miziDirectCommissions=beneficiaryId?await tx.$queryRawUnsafe("SELECT c.id,c.orderId,c.revenue,c.amount,c.status,c.created,d.id directWithdrawalId,d.status directWithdrawalStatus FROM MarketAffiliateCommission c LEFT JOIN MarketAffiliateDirectWithdrawal d ON d.commissionId=c.id LEFT JOIN MarketAffiliateCommissionVoid v ON v.commissionId=c.id WHERE v.commissionId IS NULL AND c.beneficiaryId=? AND c.kind='CONNECTION' AND c.level=1 AND c.sourceKey=? AND c.rateBps=? AND c.status='ACCRUED' ORDER BY c.created DESC LIMIT 1000",beneficiaryId,MIZI_MALL_STORE_ID,AFFILIATE_POLICY.miziMall.directBps):[];
 const miziBankAccount=beneficiaryId?(await tx.$queryRawUnsafe('SELECT bankName,bankAccount,accountName,updated FROM MarketAffiliateBankAccount WHERE userId=?',beneficiaryId))[0]||null:undefined;
 const generalWallet=beneficiaryId?(await tx.$queryRawUnsafe("SELECT COALESCE(SUM(CASE WHEN c.status='ACCRUED' AND d.id IS NULL THEN c.amount ELSE 0 END),0) available,COALESCE(SUM(CASE WHEN c.status='ACCRUED' AND d.status='REQUESTED' THEN c.amount ELSE 0 END),0) requested,COALESCE(SUM(CASE WHEN c.status='PAID' THEN c.amount ELSE 0 END),0) paid FROM MarketAffiliateCommission c LEFT JOIN MarketAffiliateDirectWithdrawal d ON d.commissionId=c.id LEFT JOIN MarketAffiliateCommissionVoid v ON v.commissionId=c.id WHERE v.commissionId IS NULL AND c.beneficiaryId=? AND NOT (c.sourceKey IN (?,?) AND c.kind='CONNECTION' AND c.level=1 AND c.rateBps=2000)",beneficiaryId,PHONG_CHAU_STORE_ID,MIZI_MALL_STORE_ID))[0]:undefined;
 const generalCommissions=beneficiaryId?await tx.$queryRawUnsafe("SELECT c.id,c.orderId,c.kind,c.level,c.sourceKey,c.revenue,c.amount,c.status,c.created,d.id withdrawalId,d.status withdrawalStatus FROM MarketAffiliateCommission c LEFT JOIN MarketAffiliateDirectWithdrawal d ON d.commissionId=c.id LEFT JOIN MarketAffiliateCommissionVoid v ON v.commissionId=c.id WHERE v.commissionId IS NULL AND c.beneficiaryId=? AND NOT (c.sourceKey IN (?,?) AND c.kind='CONNECTION' AND c.level=1 AND c.rateBps=2000) AND c.status='ACCRUED' ORDER BY c.created DESC LIMIT 1000",beneficiaryId,PHONG_CHAU_STORE_ID,MIZI_MALL_STORE_ID):[];
 const directCommissions=beneficiaryId?await tx.$queryRawUnsafe("SELECT c.id,c.orderId,c.revenue,c.amount,c.status,c.created,d.id directWithdrawalId,d.status directWithdrawalStatus FROM MarketAffiliateCommission c LEFT JOIN MarketAffiliateDirectWithdrawal d ON d.commissionId=c.id LEFT JOIN MarketAffiliateCommissionVoid v ON v.commissionId=c.id WHERE v.commissionId IS NULL AND c.beneficiaryId=? AND c.kind='CONNECTION' AND c.level=1 AND c.sourceKey=? AND c.rateBps=? AND c.status='ACCRUED' ORDER BY c.created DESC LIMIT 1000",beneficiaryId,PHONG_CHAU_STORE_ID,AFFILIATE_POLICY.phongChau.directBps):[];
 const pending=beneficiaryId?await tx.$queryRawUnsafe("SELECT o.id orderId,o.status,o.created,SUM(i.net) revenue FROM MarketAffiliateOrderPhongChau a JOIN MarketOrder o ON o.id=a.orderId JOIN MarketOrderItem i ON i.orderId=o.id WHERE a.beneficiaryId=? AND i.productId=? AND o.status NOT IN ('COMPLETED','CANCELLED') GROUP BY o.id,o.status,o.created ORDER BY o.created DESC LIMIT 100",beneficiaryId,PHONG_CHAU_COMBO_PRODUCT_ID):[];
 return {policy:AFFILIATE_POLICY,totals,commissions,pending,directWallet,directCommissions,miziDirectWallet,miziDirectCommissions,miziBankAccount,generalWallet,generalCommissions,network:beneficiaryId?await affiliateNetworkSummary(tx,beneficiaryId):undefined};
}
