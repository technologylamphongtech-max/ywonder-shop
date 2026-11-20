import {randomUUID} from 'crypto';
import {accrueAffiliateOrder} from './affiliate';
import {completeShopTask,shopDayKey} from './market-task-progress';
import {recordMiziVipQualification} from './mizi-vip';

type Sql={$queryRawUnsafe:(sql:string,...args:any[])=>Promise<any[]>;$executeRawUnsafe:(sql:string,...args:any[])=>Promise<number>};

export async function recordCompletedShopOrder(tx:Sql,order:any,items:any[]){
 await accrueAffiliateOrder(tx,order,items);
 if(order.rewardPoints){await tx.$executeRawUnsafe('UPDATE MarketProfile SET points=points+? WHERE userId=?',order.rewardPoints,order.userId);await tx.$executeRawUnsafe('INSERT INTO MarketLedger VALUES(?,?,?,?,?,?)',randomUUID(),order.userId,order.id,order.rewardPoints,'REWARD',Date.now());}
 await completeShopTask(tx,order.userId,'order_completed',shopDayKey(),1);
 for(const item of items){if(!item.storeId)continue;
  const bank=(await tx.$queryRawUnsafe('SELECT storeId FROM MarketOrderBankPayment WHERE orderId=?',order.id))[0];
  const collectedBySeller=!bank||bank.storeId===item.storeId;
  await tx.$executeRawUnsafe('INSERT INTO MarketSettlement(id,storeId,orderId,itemId,gross,fee,net,status,created) VALUES(?,?,?,?,?,?,?,?,?)',randomUUID(),item.storeId,order.id,item.id,item.net,item.fee,item.sellerNet,collectedBySeller?'FEE_DUE':'PENDING',Date.now());
 }
 await recordMiziVipQualification(tx,order,items);
}
