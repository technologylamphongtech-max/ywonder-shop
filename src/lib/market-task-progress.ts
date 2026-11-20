import {randomUUID} from 'crypto';

type Sql={$queryRawUnsafe:(sql:string,...args:any[])=>Promise<any[]>;$executeRawUnsafe:(sql:string,...args:any[])=>Promise<number>};

export const shopDayKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

export async function completeShopTask(tx:Sql,uid:string,key:string,day:string,increment=1,ref=''){
 const def:any=(await tx.$queryRawUnsafe('SELECT * FROM MarketTaskDefinition WHERE key=? AND active=1',key))[0];if(!def)return 0;
 if(ref){const inserted=await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketTaskEvent VALUES(?,?,?,?,?,?)',randomUUID(),uid,def.id,day,ref,Date.now());if(inserted!==1)return 0;}
 const existing:any=(await tx.$queryRawUnsafe('SELECT * FROM MarketTaskProgress WHERE userId=? AND taskId=? AND day=?',uid,def.id,day))[0];
 const progress=Math.min(def.goal,(existing?.progress||0)+increment);
 if(existing)await tx.$executeRawUnsafe('UPDATE MarketTaskProgress SET progress=?,updated=? WHERE userId=? AND taskId=? AND day=?',progress,Date.now(),uid,def.id,day);
 else await tx.$executeRawUnsafe('INSERT INTO MarketTaskProgress(userId,taskId,day,progress,rewarded,created,updated) VALUES(?,?,?,?,0,?,?)',uid,def.id,day,progress,Date.now(),Date.now());
 if(progress>=def.goal&&!existing?.rewarded){
  await tx.$executeRawUnsafe('UPDATE MarketTaskProgress SET rewarded=1,updated=? WHERE userId=? AND taskId=? AND day=?',Date.now(),uid,def.id,day);
  if(def.reward>0){await tx.$executeRawUnsafe('UPDATE MarketProfile SET points=points+? WHERE userId=?',def.reward,uid);await tx.$executeRawUnsafe('INSERT INTO MarketLedger VALUES(?,?,?,?,?,?)',randomUUID(),uid,`${uid}:task:${key}:${day}`,def.reward,'TASK',Date.now());}
  return def.reward;
 }
 return 0;
}
