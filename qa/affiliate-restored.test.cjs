const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {PrismaClient}=require('@prisma/client');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,file);
const {captureAffiliateOrder,accrueAffiliateOrder,affiliateSummary,PHONG_CHAU_STORE_ID}=require('../src/lib/affiliate.ts');
const {affiliateAssignStore}=require('../src/lib/affiliate-admin.ts');
const database=path.resolve(process.argv[2]).replaceAll('\\','/');
const db=new PrismaClient({datasources:{db:{url:'file:'+database}}});
const sql=tx=>({$executeRawUnsafe:tx.$executeRawUnsafe.bind(tx),$queryRawUnsafe:async(...args)=>JSON.parse(JSON.stringify(await tx.$queryRawUnsafe(...args),(_,v)=>typeof v==='bigint'?Number(v):v))});
const read=sql(db);
const order=async id=>(await read.$queryRawUnsafe('SELECT * FROM MarketOrder WHERE id=?',id))[0];
const items=async id=>read.$queryRawUnsafe('SELECT * FROM MarketOrderItem WHERE orderId=?',id);
const accrue=async id=>db.$transaction(async tx=>accrueAffiliateOrder(sql(tx),await order(id),await items(id)));
(async()=>{
 await db.$transaction(tx=>captureAffiliateOrder(sql(tx),'order-other','buyer','','alpha'));
 let chain=await read.$queryRawUnsafe('SELECT level,beneficiaryId FROM MarketAffiliateOrderChain WHERE orderId=? ORDER BY level','order-other');
 assert.deepEqual(chain,[{level:1,beneficiaryId:'a'},{level:2,beneficiaryId:'b'}]);
 await accrue('order-other');await accrue('order-other');
 let commissions=await read.$queryRawUnsafe('SELECT beneficiaryId,kind,level,sourceKey,rateBps,amount FROM MarketAffiliateCommission WHERE orderId=? ORDER BY kind,level,beneficiaryId','order-other');
 assert.deepEqual(commissions,[
  {beneficiaryId:'a',kind:'BUSINESS',level:1,sourceKey:'other-store',rateBps:100,amount:25000},
  {beneficiaryId:'a',kind:'CONNECTION',level:1,sourceKey:'buyer',rateBps:100,amount:25000},
  {beneficiaryId:'b',kind:'CONNECTION',level:2,sourceKey:'buyer',rateBps:50,amount:12500}
 ]);
 assert.equal((await affiliateSummary(read,'a')).totals.earned,50000);

 await db.$transaction(tx=>captureAffiliateOrder(sql(tx),'order-1','buyer','','alpha'));
 await db.$executeRawUnsafe("UPDATE MarketOrder SET status='COMPLETED' WHERE id='order-1'");
 await accrue('order-1');
 commissions=await read.$queryRawUnsafe('SELECT beneficiaryId,sourceKey,rateBps,amount FROM MarketAffiliateCommission WHERE orderId=? ORDER BY beneficiaryId','order-1');
 assert.deepEqual(commissions,[{beneficiaryId:'a',sourceKey:'buyer',rateBps:100,amount:25000},{beneficiaryId:'b',sourceKey:'buyer',rateBps:50,amount:12500}]);

 const code=(await read.$queryRawUnsafe('SELECT shopRefCode FROM MarketStoreF1 WHERE storeId=? AND userId=?',PHONG_CHAU_STORE_ID,'f0'))[0].shopRefCode;
 await db.$transaction(tx=>captureAffiliateOrder(sql(tx),'order-2','buyer',code,'alpha'));
 await db.$executeRawUnsafe("UPDATE MarketOrder SET status='COMPLETED' WHERE id='order-2'");
 await accrue('order-2');
 commissions=await read.$queryRawUnsafe('SELECT beneficiaryId,sourceKey,rateBps,amount FROM MarketAffiliateCommission WHERE orderId=?','order-2');
 assert.deepEqual(commissions,[{beneficiaryId:'f0',sourceKey:PHONG_CHAU_STORE_ID,rateBps:2000,amount:500000}]);

 await db.$transaction(tx=>captureAffiliateOrder(sql(tx),'order-mixed','buyer',code,'alpha'));
 await accrue('order-mixed');
 commissions=await read.$queryRawUnsafe('SELECT beneficiaryId,kind,sourceKey,rateBps,amount FROM MarketAffiliateCommission WHERE orderId=? ORDER BY kind','order-mixed');
 assert.deepEqual(commissions,[
  {beneficiaryId:'a',kind:'BUSINESS',sourceKey:'other-store',rateBps:100,amount:25000},
  {beneficiaryId:'f0',kind:'CONNECTION',sourceKey:PHONG_CHAU_STORE_ID,rateBps:2000,amount:500000}
 ]);

 await db.$transaction(tx=>captureAffiliateOrder(sql(tx),'order-3','buyer','','f1'));
 chain=await read.$queryRawUnsafe('SELECT level,beneficiaryId FROM MarketAffiliateOrderChain WHERE orderId=?','order-3');
 assert.deepEqual(chain,[]);
 await db.$executeRawUnsafe("UPDATE MarketOrder SET status='COMPLETED' WHERE id='order-3'");
 await accrue('order-3');
 assert.equal((await read.$queryRawUnsafe('SELECT COUNT(*) n FROM MarketAffiliateCommission WHERE orderId=?','order-3'))[0].n,0);
 await assert.rejects(()=>db.$transaction(tx=>affiliateAssignStore(sql(tx),'admin',{storeId:'other-store',refCode:'f1',reason:'selected member'})),/Phong Châu/);
 await db.$transaction(tx=>affiliateAssignStore(sql(tx),'admin',{storeId:'other-store',refCode:'beta',reason:'change introducer'}));
 assert.equal((await read.$queryRawUnsafe('SELECT affiliateReferrerId FROM MarketStore WHERE id=?','other-store'))[0].affiliateReferrerId,'b');
 await assert.rejects(()=>db.$transaction(tx=>affiliateAssignStore(sql(tx),'admin',{storeId:PHONG_CHAU_STORE_ID,refCode:'beta',reason:'separate program'})),/Phong Châu/);
 console.log('PASS: generic F1/F2 and business restored, generic link covers Phong Chau, selected link remains 20%, selected accounts excluded from generic');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>db.$disconnect());
