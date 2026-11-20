import {rows} from './db';
import {PHONG_CHAU_STORE_ID} from './affiliate';

type Viewer={id:string;role:string;status?:string}|null;
type Query=(sql:string,...args:any[])=>Promise<any[]>;

export async function canSeePhongChauCombo(viewer:Viewer,query:Query=rows){
 if(!viewer||viewer.status&&viewer.status!=='ACTIVE')return false;
 if(viewer.role==='ADMIN'||viewer.role==='SUPER_ADMIN')return true;
 const allowed=await query('SELECT 1 FROM MarketStoreF1 WHERE storeId=? AND userId=? UNION SELECT 1 FROM MarketStore WHERE id=? AND userId=?',PHONG_CHAU_STORE_ID,viewer.id,PHONG_CHAU_STORE_ID,viewer.id);
 return allowed.length>0;
}
