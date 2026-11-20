const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');const Module=require('node:module');
const file=path.resolve(__dirname,'../src/lib/affiliate.ts');const moduleInstance=new Module(file,module);moduleInstance.paths=module.paths;
moduleInstance._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,file);
const {commissionVnd,allocateDiscounts,sharedReferralChain,accrueAffiliateOrder}=moduleInstance.exports;
(async()=>{
 assert.equal(commissionVnd(1000000,100),10000);assert.equal(commissionVnd(1000000,50),5000);assert.equal(commissionVnd(99,50),0);assert.throws(()=>commissionVnd(-1,100));
 for(const discount of [0,1,999,2800,3000]){const allocated=allocateDiscounts([100,1900,1000],discount);assert.equal(allocated.reduce((a,b)=>a+b,0),discount);allocated.forEach((n,i)=>assert(n>=0&&n<=[100,1900,1000][i]));}
 const users=new Map(Array.from({length:12},(_,i)=>[`u${i}`,{id:`u${i}`,referredById:i<11?`u${i+1}`:null,status:'ACTIVE',role:'MEMBER'}]));
 const chain=await sharedReferralChain('u0',async id=>users.get(id)||null);assert.equal(chain.length,9);assert.equal(chain[8].beneficiaryId,'u9');
 users.get('u2').status='LOCKED';const sparse=await sharedReferralChain('u0',async id=>users.get(id)||null);assert(!sparse.some(row=>row.level===2));assert.equal(sparse.find(row=>row.level===3).beneficiaryId,'u3');users.get('u2').status='ACTIVE';
 users.get('u3').referredById='u0';const cycle=await sharedReferralChain('u0',async id=>users.get(id)||null);assert.equal(cycle.length,3);assert(!cycle.some(row=>row.beneficiaryId==='u0'));users.get('u3').referredById='u4';
 const commissions=new Map();const tx={
  async $queryRawUnsafe(sql,...args){if(sql.includes('FROM MarketAffiliateOrderChain'))return chain;if(sql.includes('FROM MarketAffiliateOrderBusiness'))return [{storeId:'s1',beneficiaryId:'u10'}];if(sql.includes('FROM MarketAffiliateOrder '))return [{orderId:'o1',created:100}];if(sql.includes('FROM MarketSetting'))return [{value:'9999999999999'}];if(sql.includes('FROM User'))return [users.get(args[0])].filter(Boolean);throw new Error(sql)},
  async $executeRawUnsafe(sql,...args){assert(sql.startsWith('INSERT OR IGNORE INTO MarketAffiliateCommission'));const key=[args[1],args[4],args[5],args[6]].join(':');if(!commissions.has(key))commissions.set(key,args);return 1}
 };
 const order={id:'o1',userId:'u0',total:1020000,shipping:20000};const items=[{net:600000,storeId:'s1'},{net:400000,storeId:'s2'}];
 await accrueAffiliateOrder(tx,order,items);assert.equal(commissions.size,10);assert.equal([...commissions.values()].filter(r=>r[4]==='CONNECTION').reduce((sum,r)=>sum+r[9],0),50000);assert.equal([...commissions.values()].find(r=>r[4]==='BUSINESS')[9],6000);
 await accrueAffiliateOrder(tx,order,items);assert.equal(commissions.size,10);await assert.rejects(()=>accrueAffiliateOrder(tx,{...order,total:99999},items));
 const before=commissions.size;await accrueAffiliateOrder({...tx,async $queryRawUnsafe(){return []}},order,items);assert.equal(commissions.size,before);
 console.log('PASS affiliate: rates F1-F9, shipping exclusion, merchant revenue, duplicate calls, cycle/locked chain, pre-launch orders, voucher allocation');
})().catch(error=>{console.error(error);process.exitCode=1});
