import {randomUUID} from 'crypto';
import {SHOP_REFERRAL_REWARD_XU} from './referral-policy';

type ReferralSql = {$executeRawUnsafe:(sql:string,...args:any[])=>Promise<number>};

// Must run inside the same transaction as account creation. The unique referredId
// prevents a repeated registration event from awarding this invitation twice.
export async function awardShopReferral(tx:ReferralSql,referrerId:string,referredId:string){
 if(referrerId===referredId)throw new Error('Không thể tự giới thiệu chính mình');
 const created=Date.now();
 const inserted=await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketReferral VALUES(?,?,?,?,?)',randomUUID(),referrerId,referredId,'COMPLETED',created);
 if(inserted!==1)return 0;
 await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketProfile(userId) VALUES(?)',referrerId);
 await tx.$executeRawUnsafe('INSERT INTO MarketLedger VALUES(?,?,?,?,?,?)',randomUUID(),referrerId,`${referrerId}:referral:${referredId}`,SHOP_REFERRAL_REWARD_XU,'REFERRAL',created);
 await tx.$executeRawUnsafe('UPDATE MarketProfile SET points=points+? WHERE userId=?',SHOP_REFERRAL_REWARD_XU,referrerId);
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(created));
 // Complete the invitation task for display only; the referral ledger above
 // already credits each valid invitation, so task completion must not pay again.
 await tx.$executeRawUnsafe("INSERT INTO MarketTaskProgress(userId,taskId,day,progress,rewarded,created,updated) SELECT ?,id,?,goal,1,?,? FROM MarketTaskDefinition WHERE key='invite_friend' AND active=1 ON CONFLICT(userId,taskId,day) DO UPDATE SET progress=excluded.progress,rewarded=1,updated=excluded.updated",referrerId,day,created,created);
 await tx.$executeRawUnsafe('INSERT INTO MarketNotification VALUES(?,?,?,?,0,?)',randomUUID(),referrerId,'Mời bạn bè thành công',`Bạn nhận +${SHOP_REFERRAL_REWARD_XU} Xu vì lời mời đã đăng ký hợp lệ.`,created);
 return SHOP_REFERRAL_REWARD_XU;
}
