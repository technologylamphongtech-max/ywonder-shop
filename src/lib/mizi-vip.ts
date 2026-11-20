import {randomUUID} from 'crypto';
import {MIZI_MALL_STORE_ID,commissionVnd} from './affiliate';
import {currentShopMonth,monthBounds} from './affiliate-pool';

type Sql={$queryRawUnsafe:(sql:string,...args:any[])=>Promise<any[]>;$executeRawUnsafe:(sql:string,...args:any[])=>Promise<number>};
const DAY=86400000,VIP_TARGET=25000000,VIP_DURATION=30*DAY,POOL_BPS=1300;

async function effectiveAt(tx:Sql){
 const value=(await tx.$queryRawUnsafe("SELECT value FROM MarketSetting WHERE key='affiliate:mizi-vip:effective'"))[0]?.value;
 const stamp=Number(value);
 if(!Number.isSafeInteger(stamp)||stamp<=0)throw new Error('Chính sách VIP Mizi mall chưa được kích hoạt');
 return stamp;
}

export async function recordMiziVipQualification(tx:Sql,order:any,items:any[]){
 if(!items.some(item=>item.storeId===MIZI_MALL_STORE_ID))return;
 const effective=await effectiveAt(tx),now=Date.now();
 if(Number(order.created)<effective)return;
 const buyer=(await tx.$queryRawUnsafe('SELECT referredById FROM User WHERE id=?',order.userId))[0];
 if(!buyer?.referredById)return;
 const sponsor=(await tx.$queryRawUnsafe("SELECT id FROM User WHERE id=? AND status='ACTIVE' AND role NOT IN ('ADMIN','SUPER_ADMIN')",buyer.referredById))[0];
 if(!sponsor)return;
 const active=(await tx.$queryRawUnsafe('SELECT 1 FROM MarketMiziVipQualification WHERE userId=? AND qualifiedAt<=? AND expiresAt>? LIMIT 1',sponsor.id,now,now))[0];
 if(active)return;
 const f1Sales=Number((await tx.$queryRawUnsafe(`SELECT COALESCE(SUM(s.gross),0) value
  FROM MarketSettlement s JOIN MarketOrder o ON o.id=s.orderId JOIN User buyer ON buyer.id=o.userId
  WHERE s.storeId=? AND o.status='COMPLETED' AND buyer.referredById=?
   AND s.created>=? AND s.created<=? AND o.created>=?`,MIZI_MALL_STORE_ID,sponsor.id,now-VIP_DURATION,now,effective))[0]?.value||0);
 if(f1Sales<VIP_TARGET)return;
 const id=randomUUID();
 await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketMiziVipQualification(id,userId,orderId,qualifiedAt,expiresAt,qualifyingF1Sales,created) VALUES(?,?,?,?,?,?,?)',id,sponsor.id,order.id,now,now+VIP_DURATION,f1Sales,now);
 await tx.$executeRawUnsafe('INSERT INTO MarketNotification VALUES(?,?,?,?,0,?)',randomUUID(),sponsor.id,'Đã đạt Thành viên VIP Mizi mall',`F1 trực tiếp đã mua ${f1Sales.toLocaleString('vi-VN')}₫ hàng Mizi mall trong 30 ngày. Hạng VIP có hiệu lực 30 ngày từ hôm nay.`,now);
 await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),sponsor.id,'mizi-vip:qualified',id,now);
}

async function monthData(tx:Sql,period:string){
 const {start,end}=monthBounds(period),effective=await effectiveAt(tx);
 const revenue=Number((await tx.$queryRawUnsafe(`SELECT COALESCE(SUM(s.gross),0) value FROM MarketSettlement s
  JOIN MarketOrder o ON o.id=s.orderId WHERE s.storeId=? AND o.status='COMPLETED'
  AND s.created>=? AND s.created<? AND o.created>=?`,MIZI_MALL_STORE_ID,start,end,effective))[0]?.value||0);
 const poolAmount=commissionVnd(revenue,POOL_BPS);
 return {start,end,effective,revenue,poolAmount};
}

export async function closeMiziVipMonth(tx:Sql,period:string,actorId:string){
 if(period>=currentShopMonth())throw new Error('Chỉ được chốt quỹ sau khi tháng kết thúc');
 const prior=(await tx.$queryRawUnsafe('SELECT * FROM MarketMiziVipPoolMonth WHERE period=?',period))[0];
 if(prior)return {...prior,alreadyClosed:true};
 const data=await monthData(tx,period),now=Date.now();
 const eligibleCount=Number((await tx.$queryRawUnsafe(`SELECT COUNT(DISTINCT q.userId) value FROM MarketMiziVipQualification q
  JOIN User u ON u.id=q.userId WHERE u.status='ACTIVE' AND u.role NOT IN ('ADMIN','SUPER_ADMIN')
  AND q.qualifiedAt<? AND q.expiresAt>=?`,data.end,data.end))[0]?.value||0);
 await tx.$executeRawUnsafe('INSERT INTO MarketMiziVipPoolMonth(period,revenue,rateBps,poolAmount,distributedAmount,eligibleCount,closedBy,closedAt,effectiveAt) VALUES(?,?,?,?,?,?,?,?,?)',period,data.revenue,POOL_BPS,data.poolAmount,0,eligibleCount,actorId,now,data.effective);
 await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),actorId,'mizi-vip:close',period,now);
 return {period,revenue:data.revenue,poolAmount:data.poolAmount,eligibleCount,alreadyClosed:false};
}

export async function miziVipReport(tx:Sql,userId?:string){
 const now=Date.now(),period=currentShopMonth(),data=await monthData(tx,period);
 const active=userId?(await tx.$queryRawUnsafe('SELECT qualifiedAt,expiresAt,qualifyingF1Sales FROM MarketMiziVipQualification WHERE userId=? AND qualifiedAt<=? AND expiresAt>? ORDER BY qualifiedAt DESC LIMIT 1',userId,now,now))[0]||null:null;
 const qualifications=userId?[]:await tx.$queryRawUnsafe('SELECT q.*,u.fullName,u.email FROM MarketMiziVipQualification q JOIN User u ON u.id=q.userId ORDER BY q.qualifiedAt DESC LIMIT 500');
 const months=await tx.$queryRawUnsafe(userId?'SELECT period,rateBps,poolAmount,closedAt FROM MarketMiziVipPoolMonth ORDER BY period DESC LIMIT 24':'SELECT period,rateBps,revenue,poolAmount,eligibleCount,closedAt FROM MarketMiziVipPoolMonth ORDER BY period DESC LIMIT 24');
 const currentEligibleCount=userId?undefined:Number((await tx.$queryRawUnsafe(`SELECT COUNT(DISTINCT q.userId) value FROM MarketMiziVipQualification q
  JOIN User u ON u.id=q.userId WHERE u.status='ACTIVE' AND u.role NOT IN ('ADMIN','SUPER_ADMIN')
  AND q.qualifiedAt<=? AND q.expiresAt>?`,now,now))[0]?.value||0);
 return {policy:{storeId:MIZI_MALL_STORE_ID,rateBps:POOL_BPS,vipTargetVnd:VIP_TARGET,vipDurationDays:30},period,currentRevenue:userId?undefined:data.revenue,currentPool:data.poolAmount,currentEligibleCount,activeVip:active,months,qualifications};
}
