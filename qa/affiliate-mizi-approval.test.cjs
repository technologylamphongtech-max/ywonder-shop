const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const ts=require('typescript');
const {PrismaClient}=require('@prisma/client');

require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,file);
const {captureAffiliateOrder,accrueAffiliateOrder,affiliateSummary,MIZI_MALL_STORE_ID}=require('../src/lib/affiliate.ts');
const file=path.join(os.tmpdir(),`yw-mizi-approval-${process.pid}-${Date.now()}.db`);
const db=new PrismaClient({datasources:{db:{url:'file:'+file.replaceAll('\\','/')}}});
const sql=tx=>({$executeRawUnsafe:tx.$executeRawUnsafe.bind(tx),$queryRawUnsafe:async(...args)=>JSON.parse(JSON.stringify(await tx.$queryRawUnsafe(...args),(_,value)=>typeof value==='bigint'?Number(value):value))});

(async()=>{
 const schema=[
  'CREATE TABLE User(id TEXT PRIMARY KEY,fullName TEXT,email TEXT,phone TEXT,username TEXT,status TEXT,role TEXT,referredById TEXT,createdAt INTEGER)',
  'CREATE TABLE MarketStore(id TEXT PRIMARY KEY,userId TEXT,affiliateReferrerId TEXT)',
  'CREATE TABLE MarketOrder(id TEXT PRIMARY KEY,userId TEXT,total INTEGER,shipping INTEGER,status TEXT,created BIGINT)',
  'CREATE TABLE MarketOrderItem(id TEXT PRIMARY KEY,orderId TEXT,productId TEXT,storeId TEXT,net INTEGER)',
  'CREATE TABLE MarketSetting(key TEXT PRIMARY KEY,value TEXT)',
  'CREATE TABLE MarketAffiliateOrder(orderId TEXT PRIMARY KEY,created BIGINT)',
  'CREATE TABLE MarketAffiliateOrderChain(orderId TEXT,level INTEGER,beneficiaryId TEXT,PRIMARY KEY(orderId,level))',
  'CREATE TABLE MarketAffiliateOrderBusiness(orderId TEXT,storeId TEXT,beneficiaryId TEXT,PRIMARY KEY(orderId,storeId))',
  'CREATE TABLE MarketAffiliateOrderPhongChau(orderId TEXT PRIMARY KEY,beneficiaryId TEXT,created BIGINT)',
  'CREATE TABLE MarketAffiliateCommission(id TEXT PRIMARY KEY,orderId TEXT,beneficiaryId TEXT,sourceUserId TEXT,kind TEXT,level INTEGER,sourceKey TEXT,revenue INTEGER,rateBps INTEGER,amount INTEGER,currency TEXT,status TEXT,created BIGINT,payoutId TEXT,paidAt INTEGER,paidBy TEXT,UNIQUE(orderId,kind,level,sourceKey))',
  'CREATE TABLE MarketAffiliateCommissionVoid(commissionId TEXT PRIMARY KEY)',
  'CREATE TABLE MarketAffiliateDirectWithdrawal(id TEXT,commissionId TEXT,status TEXT)',
  'CREATE TABLE MarketAffiliateBankAccount(userId TEXT,bankName TEXT,bankAccount TEXT,accountName TEXT,updated BIGINT)',
  'CREATE TABLE MarketNotification(id TEXT,userId TEXT,title TEXT,body TEXT,seen INTEGER,created BIGINT)',
  'CREATE TABLE MarketSettlement(orderId TEXT,storeId TEXT,gross INTEGER,created BIGINT)',
 ];
 for(const statement of schema)await db.$executeRawUnsafe(statement);
 for(const [id,parent] of [['buyer','f1'],['f1','f2'],['f2',null]])await db.$executeRawUnsafe("INSERT INTO User VALUES(?,?,?,?,?,?,?,?,?)",id,id,`${id}@example.test`,'',id,'ACTIVE','USER',parent,1);
 await db.$executeRawUnsafe('INSERT INTO MarketStore VALUES(?,?,NULL)',MIZI_MALL_STORE_ID,'seller');
 await db.$executeRawUnsafe("INSERT INTO MarketSetting VALUES('affiliate:phongchau:combo-only:effective','1')");
 await db.$executeRawUnsafe("INSERT INTO MarketSetting VALUES('affiliate:mizi-mall:effective','1')");
 await db.$executeRawUnsafe("INSERT INTO MarketOrder VALUES('approved-order','buyer',2500000,0,'PENDING',?)",Date.now());
 await db.$executeRawUnsafe('INSERT INTO MarketOrderItem VALUES(?,?,?,?,?)','item-1','approved-order','ordinary-product',MIZI_MALL_STORE_ID,2500000);
 await db.$transaction(tx=>captureAffiliateOrder(sql(tx),'approved-order','buyer'));
 const order=(await sql(db).$queryRawUnsafe("SELECT * FROM MarketOrder WHERE id='approved-order'"))[0];
 const items=await sql(db).$queryRawUnsafe("SELECT * FROM MarketOrderItem WHERE orderId='approved-order'");
 await db.$transaction(async tx=>{await tx.$executeRawUnsafe("UPDATE MarketOrder SET status='CONFIRMED' WHERE id='approved-order'");await accrueAffiliateOrder(sql(tx),order,items)});
 let f1=await affiliateSummary(sql(db),'f1');
 assert.equal(f1.miziDirectWallet.available,500000);
 assert.equal(f1.miziDirectCommissions.length,1);
 assert.equal(f1.miziDirectCommissions[0].amount,500000);
 assert.equal(f1.miziDirectCommissions[0].revenue,2500000);
 assert.equal((await affiliateSummary(sql(db),'f2')).miziDirectWallet.available,0);
 await db.$transaction(tx=>accrueAffiliateOrder(sql(tx),order,items));
 f1=await affiliateSummary(sql(db),'f1');
 assert.equal(f1.miziDirectWallet.available,500000);
 assert.equal((await sql(db).$queryRawUnsafe("SELECT COUNT(*) n FROM MarketAffiliateCommission WHERE orderId='approved-order'"))[0].n,1);
 assert.equal((await sql(db).$queryRawUnsafe("SELECT COUNT(*) n FROM MarketNotification WHERE userId='f1'"))[0].n,1);
 console.log('PASS Mizi mall: approving a pending order immediately shows 20% in F1 wallet, excludes F2, and cannot credit twice');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{await db.$disconnect();try{fs.rmSync(file,{force:true})}catch{}});
