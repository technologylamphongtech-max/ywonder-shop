const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),{spawnSync}=require('node:child_process');
const file=path.resolve(process.argv[2]);assert(file.includes('ywh-transfer-test-'),'Disposable test database required');
assert(!fs.existsSync(file),'Use a fresh test database');
const fixture=String.raw`
import sqlite3,sys
d=sqlite3.connect(sys.argv[1]);d.executescript('''
CREATE TABLE User(id TEXT PRIMARY KEY,email TEXT,status TEXT);
CREATE TABLE Wallet(userId TEXT PRIMARY KEY,balanceYwh REAL,lockedYwh REAL DEFAULT 0,updatedAt BIGINT);
CREATE TABLE MarketProfile(userId TEXT PRIMARY KEY,hubAccountId TEXT DEFAULT '',hubLinkedAt BIGINT DEFAULT 0,ywbBalance INTEGER DEFAULT 0);
CREATE TABLE MarketYwbTransfer(id TEXT PRIMARY KEY,userId TEXT,amount INTEGER,status TEXT,idempotency TEXT,sourceRef TEXT,targetRef TEXT,created BIGINT,updated BIGINT,UNIQUE(userId,idempotency));
CREATE TABLE "Transaction"(id TEXT PRIMARY KEY,userId TEXT,type TEXT,amount REAL,currency TEXT,status TEXT,externalRef TEXT UNIQUE,metadata TEXT,createdAt BIGINT,updatedAt BIGINT);
CREATE TABLE MarketLedger(id TEXT PRIMARY KEY,userId TEXT,orderId TEXT,amount INTEGER,kind TEXT,created BIGINT,UNIQUE(orderId,kind));
CREATE TABLE Notification(id TEXT PRIMARY KEY,userId TEXT,emoji TEXT,textVi TEXT,textEn TEXT,link TEXT,unread INT,createdAt BIGINT);
CREATE TABLE MarketNotification(id TEXT PRIMARY KEY,userId TEXT,title TEXT,body TEXT,seen INT,created BIGINT);
CREATE TABLE MarketAudit(id TEXT PRIMARY KEY,userId TEXT,action TEXT,target TEXT,created BIGINT);
CREATE TABLE AuditLog(id TEXT PRIMARY KEY,actorId TEXT,actorEmail TEXT,action TEXT,target TEXT,metadata TEXT,createdAt BIGINT);
''')
for uid,balance,link in [('owner',500,'owner'),('other',200,'other'),('unlinked',100,''),('badlink',100,'owner'),('locked',0,'locked'),('rollback',300,'')]:
 d.execute('INSERT INTO User VALUES(?,?,?)',(uid,uid+'@example.invalid','ACTIVE'))
 d.execute('INSERT INTO Wallet(userId,balanceYwh,lockedYwh) VALUES(?,?,1000)',(uid,balance))
 d.execute('INSERT INTO MarketProfile(userId,hubAccountId) VALUES(?,?)',(uid,link))
d.commit()
`;
const init=spawnSync(process.env.PYTHON||'python3',['-c',fixture,file],{encoding:'utf8'});assert.equal(init.status,0,init.stderr);
const source=path.resolve(__dirname,'../src/lib/ywh-transfer.ts'),mod=new Module(source,module);mod.paths=module.paths;mod._compile(ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,source);
const {transferYwhToShop,ywhQuantity}=mod.exports,{PrismaClient}=require('@prisma/client');
const db=new PrismaClient({datasources:{db:{url:'file:'+file.replaceAll('\\','/')}}});
const exec=(sql,...args)=>db.$executeRawUnsafe(sql,...args),query=(sql,...args)=>db.$queryRawUnsafe(sql,...args);
const transfer=(uid,amount,requestId,auto=false)=>db.$transaction(tx=>transferYwhToShop(tx,uid,{amount,requestId},auto),{timeout:15000});
const balance=async uid=>{const w=(await query('SELECT balanceYwh,lockedYwh FROM Wallet WHERE userId=?',uid))[0],p=(await query('SELECT ywbBalance FROM MarketProfile WHERE userId=?',uid))[0];return {hub:Number(w.balanceYwh),shop:Number(p.ywbBalance),locked:Number(w.lockedYwh)}};
(async()=>{
 for(const v of [0,-1,NaN,Infinity,'1e3','abc',0.0000001,null,{},'1.0000001'])assert.throws(()=>ywhQuantity(v));
 assert.equal(ywhQuantity(0.123456),0.123456);
 await exec("UPDATE User SET status='LOCKED' WHERE id='owner'");await assert.rejects(()=>transfer('owner',1,'request-locked-user'));await exec("UPDATE User SET status='ACTIVE' WHERE id='owner'");
 const result=await transfer('owner',150,'request-150');assert(!result.alreadyCompleted);assert.deepEqual(await balance('owner'),{hub:350,shop:150,locked:1000});
 assert.equal((await query('SELECT textVi FROM Notification WHERE userId=?','owner'))[0].textVi,'Đã chuyển thành công 150 YWH sang sàn thương mại điện tử YWonderShop');
 assert.equal((await query('SELECT body FROM MarketNotification WHERE userId=?','owner'))[0].body,'Đã nhận thành công 150 YWH từ hệ thống YWonderHub');
 assert((await transfer('owner',150,'request-150')).alreadyCompleted);await assert.rejects(()=>transfer('owner',151,'request-150'));assert.deepEqual(await balance('owner'),{hub:350,shop:150,locked:1000});
 await assert.rejects(()=>transfer('owner',351,'request-no-funds'));
 await assert.rejects(()=>transfer('locked',1,'request-locked'));
 await assert.rejects(()=>transfer('unlinked',1,'request-unlinked'));await assert.rejects(()=>transfer('badlink',1,'request-badlink'));
 await transfer('unlinked',0.123456,'request-fraction',true);assert.equal((await query('SELECT hubAccountId FROM MarketProfile WHERE userId=?','unlinked'))[0].hubAccountId,'unlinked');
 assert.deepEqual(await balance('unlinked'),{hub:99.876544,shop:0.123456,locked:1000});
 await exec("INSERT INTO MarketYwbTransfer VALUES('legacy','owner',50,'PENDING','request-legacy','','',1,1)");await transfer('owner',50,'request-legacy');assert.deepEqual(await balance('owner'),{hub:300,shop:200,locked:1000});
 await exec("CREATE TRIGGER deny_transfer_audit BEFORE INSERT ON AuditLog WHEN NEW.actorId='rollback' BEGIN SELECT RAISE(ABORT,'Injected audit failure'); END");
 await assert.rejects(()=>transfer('rollback',100,'request-rollback',true));assert.deepEqual(await balance('rollback'),{hub:300,shop:0,locked:1000});
 assert.equal((await query('SELECT hubAccountId FROM MarketProfile WHERE userId=?','rollback'))[0].hubAccountId,'');
 for(const table of ['MarketYwbTransfer','Transaction','MarketLedger','Notification','MarketNotification','MarketAudit'])assert.equal(Number((await query(`SELECT COUNT(*) n FROM "${table}" WHERE userId=?`,'rollback'))[0].n),0);
 await exec('DROP TRIGGER deny_transfer_audit');await transfer('rollback',100,'request-rollback',true);
 const race=await Promise.allSettled(['request-race1','request-race2'].map(key=>transfer('other',150,key)));
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.deepEqual(await balance('other'),{hub:50,shop:150,locked:1000});
 const sums=(await query('SELECT (SELECT SUM(balanceYwh) FROM Wallet)+(SELECT SUM(ywbBalance) FROM MarketProfile) total'))[0];assert.equal(Number(sums.total),1200);
 const counts=(await query('SELECT (SELECT COUNT(*) FROM MarketYwbTransfer WHERE status=\'COMPLETED\') transfers,(SELECT COUNT(*) FROM "Transaction") hub,(SELECT COUNT(*) FROM MarketLedger) shop,(SELECT COUNT(*) FROM Notification) hubNotes,(SELECT COUNT(*) FROM MarketNotification) shopNotes'))[0];assert.equal(Number(counts.transfers),5);for(const k of ['hub','shop','hubNotes','shopNotes'])assert.equal(Number(counts[k]),5);
 console.log('PASS YWH SQLite: instant 1:1 debit/credit, both notifications, fractions, active/linked identity, available balance, locked funds preserved, idempotency, legacy request, full rollback, concurrent overspend protection and conserved total');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
