const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const ts=require('typescript');
const {PrismaClient}=require('@prisma/client');

require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,file);
const {deleteMarketProduct}=require('../src/lib/market-product-delete.ts');
const file=path.join(os.tmpdir(),`yw-product-delete-${process.pid}-${Date.now()}.db`);
const db=new PrismaClient({datasources:{db:{url:'file:'+file.replaceAll('\\','/')}}});
const sql=tx=>({$queryRawUnsafe:tx.$queryRawUnsafe.bind(tx),$executeRawUnsafe:tx.$executeRawUnsafe.bind(tx)});

(async()=>{
 for(const statement of [
  'CREATE TABLE MarketStore(id TEXT PRIMARY KEY,userId TEXT,status TEXT)',
  'CREATE TABLE MarketProduct(id TEXT PRIMARY KEY,storeId TEXT,active INTEGER)',
  'CREATE TABLE MarketFavorite(userId TEXT,productId TEXT)',
  'CREATE TABLE MarketOrderItem(id TEXT,productId TEXT,orderId TEXT)',
  'CREATE TABLE MarketAudit(id TEXT,actorId TEXT,action TEXT,target TEXT,created BIGINT)',
 ])await db.$executeRawUnsafe(statement);
 await db.$executeRawUnsafe("INSERT INTO MarketStore VALUES('store-1','seller','APPROVED')");
 await db.$executeRawUnsafe("INSERT INTO MarketProduct VALUES('product-1','store-1',1)");
 await db.$executeRawUnsafe("INSERT INTO MarketFavorite VALUES('buyer','product-1')");
 await db.$executeRawUnsafe("INSERT INTO MarketOrderItem VALUES('item-1','product-1','old-order')");
 await assert.rejects(()=>db.$transaction(tx=>deleteMarketProduct(sql(tx),'product-1','other-seller',false)),/không có quyền/);
 assert.equal((await db.$queryRawUnsafe("SELECT active FROM MarketProduct WHERE id='product-1'"))[0].active,1);
 await db.$transaction(tx=>deleteMarketProduct(sql(tx),'product-1','seller',false));
 assert.equal((await db.$queryRawUnsafe("SELECT active FROM MarketProduct WHERE id='product-1'"))[0].active,-1);
 assert.equal(Number((await db.$queryRawUnsafe("SELECT COUNT(*) n FROM MarketFavorite WHERE productId='product-1'"))[0].n),0);
 assert.equal(Number((await db.$queryRawUnsafe("SELECT COUNT(*) n FROM MarketOrderItem WHERE productId='product-1'"))[0].n),1);
 assert.equal(Number((await db.$queryRawUnsafe("SELECT COUNT(*) n FROM MarketProduct WHERE active=1"))[0].n),0);
 await assert.rejects(()=>db.$transaction(tx=>deleteMarketProduct(sql(tx),'product-1','seller',false)),/không còn tồn tại/);
 await db.$executeRawUnsafe("INSERT INTO MarketProduct VALUES('platform-product',NULL,1)");
 await db.$transaction(tx=>deleteMarketProduct(sql(tx),'platform-product','admin',true));
 assert.equal(Number((await db.$queryRawUnsafe("SELECT COUNT(*) n FROM MarketAudit WHERE action='product:deleted'"))[0].n),2);
 console.log('PASS product deletion: seller ownership, hidden from catalog, favorites removed, historical order retained, admin access, repeat blocked');
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{await db.$disconnect();try{fs.rmSync(file,{force:true})}catch{}});
