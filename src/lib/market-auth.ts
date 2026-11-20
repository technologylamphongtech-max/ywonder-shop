import {cookies} from 'next/headers';
import {createHash} from 'crypto';
import {db,rows} from './db';
export async function marketUser(){const token=cookies().get('yw_market_session')?.value;if(!token)return null;const s=(await rows('SELECT userId FROM MarketSession WHERE token=? AND expires>?',createHash('sha256').update(token).digest('hex'),Date.now()))[0];if(!s)return null;const u=await db.user.findUnique({where:{id:s.userId},select:{id:true,role:true,status:true,fullName:true,email:true}});return u?.status==='ACTIVE'?u:null}
