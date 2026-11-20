export type WeightedBuyer={id:string;orderCount:number;orderRevenue:number};

// Splits integer VND by (completed order count × completed goods revenue).
// Largest fractional remainders receive the leftover đồng, with a stable ID tie-break.
export function allocateWeightedPool(poolAmount:number,buyers:WeightedBuyer[]){
 if(!Number.isSafeInteger(poolAmount)||poolAmount<0||!buyers.length)throw new Error('Quỹ đồng chia không hợp lệ');
 if(new Set(buyers.map(b=>b.id)).size!==buyers.length)throw new Error('F1 bị trùng trong nhóm');
 const weights=buyers.map(b=>{
  if(!b.id||!Number.isSafeInteger(b.orderCount)||b.orderCount<1||!Number.isSafeInteger(b.orderRevenue)||b.orderRevenue<1)throw new Error('Doanh số F1 không hợp lệ');
  return BigInt(b.orderCount)*BigInt(b.orderRevenue);
 });
 const total=weights.reduce((sum,weight)=>sum+weight,BigInt(0));
 const shares=buyers.map((buyer,index)=>{
  const numerator=BigInt(poolAmount)*weights[index];
  const percent=BigInt(10000)*weights[index];
  return {buyerId:buyer.id,orderCount:buyer.orderCount,orderRevenue:buyer.orderRevenue,weight:weights[index].toString(),amount:Number(numerator/total),remainder:numerator%total,shareBps:Number(percent/total),percentRemainder:percent%total};
 });
 let leftover=poolAmount-shares.reduce((sum,share)=>sum+share.amount,0);
 for(const share of [...shares].sort((a,b)=>a.remainder===b.remainder?a.buyerId.localeCompare(b.buyerId):a.remainder>b.remainder?-1:1)){
  if(leftover<=0)break;
  share.amount++;leftover--;
 }
 let percentLeft=10000-shares.reduce((sum,share)=>sum+share.shareBps,0);
 for(const share of [...shares].sort((a,b)=>a.percentRemainder===b.percentRemainder?a.buyerId.localeCompare(b.buyerId):a.percentRemainder>b.percentRemainder?-1:1)){
  if(percentLeft<=0)break;
  share.shareBps++;percentLeft--;
 }
 return shares.map(({remainder,percentRemainder,...share})=>share);
}
