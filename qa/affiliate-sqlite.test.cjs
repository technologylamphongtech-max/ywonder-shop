const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');const Module=require('node:module');
const {PrismaClient}=require('@prisma/client');
const file=path.resolve(__dirname,'../src/lib/affiliate.ts');const mod=new Module(file,module);mod.paths=module.paths;mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,file);
const {captureAffiliateOrder,accrueAffiliateOrder,affiliateSummary}=mod.exports;
const db=new PrismaClient({datasources:{db:{url:'file:'+path.resolve(process.argv[2]).replaceAll('\\','/')}}});
const sql=tx=>({$executeRawUnsafe:tx.$executeRawUnsafe.bind(tx),$queryRawUnsafe:async(...args)=>JSON.parse(JSON.stringify(await tx.$queryRawUnsafe(...args),(_,v)=>typeof v==='bigint'?Number(v):v))});
(async()=>{
 const [order]=await sql(db).$queryRawUnsafe('SELECT * FROM MarketOrder WHERE id=?','o1');const items=await sql(db).$queryRawUnsafe('SELECT * FROM MarketOrderItem WHERE orderId=?','o1');
 await db.$transaction(tx=>captureAffiliateOrder(sql(tx),'o1','u0'));
 // Frozen referral assignments survive later upstream account changes.
 await db.$executeRawUnsafe("UPDATE User SET referredById=NULL WHERE id='u0'");
 await assert.rejects(()=>db.$transaction(async tx=>{await accrueAffiliateOrder(sql(tx),order,items);throw new Error('Injected rollback')}));
 assert.equal((await sql(db).$queryRawUnsafe('SELECT COUNT(*) n FROM MarketAffiliateCommission'))[0].n,0);
 await db.$transaction(tx=>accrueAffiliateOrder(sql(tx),order,items));await db.$transaction(tx=>accrueAffiliateOrder(sql(tx),order,items));
 const report=await affiliateSummary(sql(db));assert.equal(report.totals.entries,10);assert.equal(report.totals.earned,56000);assert.equal(report.totals.accrued,56000);
 assert.equal((await affiliateSummary(sql(db),'u1')).totals.earned,10000);assert.equal((await affiliateSummary(sql(db),'u9')).totals.earned,5000);assert.equal((await affiliateSummary(sql(db),'u10')).totals.earned,6000);assert.equal((await affiliateSummary(sql(db),'u0')).totals.earned,0);
 assert(await sql(db).$queryRawUnsafe('SELECT id FROM User WHERE id=?','u0'));
 console.log('PASS SQLite: atomic rollback, shared User tree, frozen referrals, unique commission ledger, totals and beneficiary isolation');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
