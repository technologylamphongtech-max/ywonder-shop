type Sql={$queryRawUnsafe:(sql:string,...args:any[])=>Promise<any[]>};
const MIZI_MALL_STORE_ID='c13d55d8-8da2-4d38-91c3-6204ac0465c5';

// Referral depth is not capped at F9. A path guard prevents a malformed legacy
// referral cycle from repeating a member indefinitely.
export async function affiliateNetworkSummary(tx:Sql,userId:string,asOf=Date.now()){
 const since=asOf-30*86400000;
 const effective=Number((await tx.$queryRawUnsafe("SELECT value FROM MarketSetting WHERE key='affiliate:mizi-vip:effective'"))[0]?.value||Number.MAX_SAFE_INTEGER);
 const network=(await tx.$queryRawUnsafe(`
  WITH RECURSIVE descendants(id,level,path) AS (
   SELECT id,1,'|'||id||'|' FROM User WHERE referredById=? AND id<>?
   UNION ALL
   SELECT u.id,d.level+1,d.path||u.id||'|'
   FROM User u JOIN descendants d ON u.referredById=d.id
   WHERE instr(d.path,'|'||u.id||'|')=0
  ), buyerSales AS (
   SELECT o.userId,COALESCE(SUM(s.gross),0) allTime,
    COALESCE(SUM(CASE WHEN s.created>=? AND s.created<? THEN s.gross ELSE 0 END),0) last30Days,
    COALESCE(SUM(CASE WHEN s.created>=? AND s.created<? AND o.created>=? THEN s.gross ELSE 0 END),0) vipLast30Days
   FROM MarketSettlement s JOIN MarketOrder o ON o.id=s.orderId
   WHERE o.status='COMPLETED' AND s.storeId=? GROUP BY o.userId
  )
  SELECT
   COALESCE(SUM(CASE WHEN d.level=1 THEN 1 ELSE 0 END),0) f1Count,
   COALESCE(SUM(CASE WHEN d.level>=2 THEN 1 ELSE 0 END),0) f2PlusCount,
   COALESCE(MAX(d.level),0) deepestLevel,
   COALESCE(SUM(CASE WHEN d.level=1 THEN b.allTime ELSE 0 END),0) f1Sales,
   COALESCE(SUM(CASE WHEN d.level=1 THEN b.last30Days ELSE 0 END),0) f1Sales30Days,
   COALESCE(SUM(CASE WHEN d.level>=2 THEN b.allTime ELSE 0 END),0) f2PlusSales,
   COALESCE(SUM(CASE WHEN d.level=1 THEN b.vipLast30Days ELSE 0 END),0) f1VipSales30Days
  FROM descendants d LEFT JOIN buyerSales b ON b.userId=d.id
 `,userId,userId,since,asOf,since,asOf,effective,MIZI_MALL_STORE_ID))[0]||{};
 const national=(await tx.$queryRawUnsafe(`SELECT COALESCE(SUM(s.gross),0) salesAllTime,
  COALESCE(SUM(CASE WHEN s.created>=? AND s.created<? THEN s.gross ELSE 0 END),0) sales30Days
  FROM MarketSettlement s JOIN MarketOrder o ON o.id=s.orderId WHERE o.status='COMPLETED' AND s.storeId=?`,since,asOf,MIZI_MALL_STORE_ID))[0]||{};
 const f1Members=await tx.$queryRawUnsafe(`SELECT id,fullName,
  CASE WHEN NULLIF(TRIM(phone),'') IS NOT NULL THEN TRIM(phone) ELSE email END contact,
  CASE WHEN NULLIF(TRIM(phone),'') IS NOT NULL THEN 'phone' ELSE 'email' END contactType
  FROM User WHERE referredById=? AND id<>? ORDER BY createdAt ASC,id ASC`,userId,userId);
 return {
  f1Count:Number(network.f1Count||0),
  f2PlusCount:Number(network.f2PlusCount||0),
  totalMemberCount:Number(network.f1Count||0)+Number(network.f2PlusCount||0),
  deepestLevel:Number(network.deepestLevel||0),
  f1Sales:Number(network.f1Sales||0),
  f1Sales30Days:Number(network.f1Sales30Days||0),
  f1VipSales30Days:Number(network.f1VipSales30Days||0),
  f2PlusSales:Number(network.f2PlusSales||0),
  teamSales:Number(network.f1Sales||0)+Number(network.f2PlusSales||0),
  nationalSalesAllTime:Number(national.salesAllTime||0),
  nationalSales30Days:Number(national.sales30Days||0),
  f1Members,
  measuredAt:asOf,
 };
}
