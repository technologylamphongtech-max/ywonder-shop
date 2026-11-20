const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),ts=require('typescript');
const file=path.resolve(process.argv[2]||'');
assert(file.includes('referral-reward-test-')&&!fs.existsSync(file),'Use a fresh disposable test database');
const fixture=String.raw`
import sqlite3,sys
d=sqlite3.connect(sys.argv[1]);d.executescript('''
CREATE TABLE User(id TEXT PRIMARY KEY);
CREATE TABLE MarketProfile(userId TEXT PRIMARY KEY,points INTEGER NOT NULL DEFAULT 0);
CREATE TABLE MarketReferral(id TEXT PRIMARY KEY,referrerId TEXT NOT NULL,referredId TEXT NOT NULL UNIQUE,status TEXT,created BIGINT);
CREATE TABLE MarketLedger(id TEXT PRIMARY KEY,userId TEXT,orderId TEXT,amount INTEGER,kind TEXT,created BIGINT,UNIQUE(orderId,kind));
CREATE TABLE MarketNotification(id TEXT PRIMARY KEY,userId TEXT,title TEXT,body TEXT,seen INT,created BIGINT);
CREATE TABLE MarketTaskDefinition(id TEXT PRIMARY KEY,key TEXT UNIQUE,goal INTEGER,active INTEGER);
CREATE TABLE MarketTaskProgress(userId TEXT,taskId TEXT,day TEXT,progress INTEGER,rewarded INTEGER,created BIGINT,updated BIGINT,PRIMARY KEY(userId,taskId,day));
INSERT INTO MarketTaskDefinition VALUES('invite','invite_friend',1,1);
INSERT INTO MarketProfile VALUES('inviter',100);
INSERT INTO MarketReferral VALUES('old','inviter','old-friend','COMPLETED',1);
INSERT INTO MarketLedger VALUES('old','inviter','inviter:referral:old-friend',100,'REFERRAL',1);
''');d.commit()
`;
const init=spawnSync(process.env.PYTHON||'python',['-c',fixture,file],{encoding:'utf8'});assert.equal(init.status,0,init.stderr);
require.extensions['.ts']=(mod,name)=>mod._compile(ts.transpileModule(fs.readFileSync(name,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,name);
const {awardShopReferral}=require('../src/lib/referral.ts'),{PrismaClient}=require('@prisma/client');
const db=new PrismaClient({datasources:{db:{url:'file:'+file.replaceAll('\\','/')}}});
const query=(sql,...a)=>db.$queryRawUnsafe(sql,...a),exec=(sql,...a)=>db.$executeRawUnsafe(sql,...a);
const award=(a,b)=>db.$transaction(tx=>awardShopReferral(tx,a,b));
(async()=>{
 assert.equal(await award('inviter','friend1'),300);
 assert.equal(await award('inviter','friend1'),0);
 assert.equal(Number((await query('SELECT points FROM MarketProfile WHERE userId=?','inviter'))[0].points),400);
 assert.equal(Number((await query('SELECT COUNT(*) n FROM MarketNotification'))[0].n),1);
 assert.equal((await query('SELECT body FROM MarketNotification'))[0].body,'Bạn nhận +300 Xu vì lời mời đã đăng ký hợp lệ.');
 const progress=(await query('SELECT progress,rewarded FROM MarketTaskProgress WHERE userId=?','inviter'))[0];
 assert.equal(Number(progress.progress),1);assert.equal(Number(progress.rewarded),1);
 assert.equal(await award('inviter','friend3'),300);
 assert.equal(Number((await query('SELECT points FROM MarketProfile WHERE userId=?','inviter'))[0].points),700);
 assert.equal(Number((await query('SELECT COUNT(*) n FROM MarketTaskProgress WHERE userId=?','inviter'))[0].n),1);
 assert.equal(await award('new-inviter','friend2'),300);
 assert.equal(Number((await query('SELECT points FROM MarketProfile WHERE userId=?','new-inviter'))[0].points),300);
 assert.equal(await award('inviter','old-friend'),0);
 assert.equal(Number((await query('SELECT amount FROM MarketLedger WHERE id=?','old'))[0].amount),100);
 await assert.rejects(()=>award('self','self'));
 // An actual write failure must roll back the new account, credit and ledger together.
 await exec("CREATE TRIGGER fail_notice BEFORE INSERT ON MarketNotification WHEN NEW.userId='rollback' BEGIN SELECT RAISE(ABORT,'injected notification failure'); END");
 await assert.rejects(()=>db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('INSERT INTO User VALUES(?)','rollback-friend');
  await awardShopReferral(tx,'rollback','rollback-friend');
 }));
 for(const [table,field,id] of [['User','id','rollback-friend'],['MarketProfile','userId','rollback'],['MarketReferral','referredId','rollback-friend'],['MarketLedger','userId','rollback'],['MarketTaskProgress','userId','rollback']]){
  assert.equal(Number((await query(`SELECT COUNT(*) n FROM ${table} WHERE ${field}=?`,id))[0].n),0);
 }
 console.log('PASS: 300 Xu per valid referral, duplicate and self-referral protection, missing profile, unchanged past rewards, and atomic rollback including account creation');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
