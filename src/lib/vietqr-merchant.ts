import {createHash,createHmac,randomUUID,timingSafeEqual} from 'crypto';

const tokenLifetime=300;
const issuer='YWonderShop';
const audience='VietQR';

function configured(){
 return !!process.env.VIETQR_MERCHANT_USER && !!process.env.VIETQR_MERCHANT_PASSWORD && !!process.env.VIETQR_TOKEN_SECRET;
}
function same(a:string,b:string){
 return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
}
export function validVietQrBasic(header:string|null){
 if(!configured()||!header||!/^Basic [A-Za-z0-9+/]+={0,2}$/.test(header))return false;
 let credentials:string;
 try{credentials=Buffer.from(header.slice(6),'base64').toString('utf8')}catch{return false}
 const colon=credentials.indexOf(':');
 if(colon<1)return false;
 return same(credentials.slice(0,colon),process.env.VIETQR_MERCHANT_USER!)&&same(credentials.slice(colon+1),process.env.VIETQR_MERCHANT_PASSWORD!);
}
function signedPart(value:string){return createHmac('sha256',process.env.VIETQR_TOKEN_SECRET!).update(value).digest('base64url')}
export function issueVietQrToken(){
 if(!configured())throw new Error('VietQR Merchant chưa cấu hình');
 const now=Math.floor(Date.now()/1000);
 const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
 const payload=Buffer.from(JSON.stringify({iss:issuer,aud:audience,iat:now,exp:now+tokenLifetime,jti:randomUUID()})).toString('base64url');
 const body=header+'.'+payload;
 return {access_token:body+'.'+signedPart(body),token_type:'Bearer',expires_in:tokenLifetime};
}
export function validVietQrBearer(header:string|null){
 if(!configured()||!header||!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(header))return false;
 const [encodedHeader,encodedPayload,signature]=header.slice(7).split('.');
 const body=encodedHeader+'.'+encodedPayload;
 if(!same(signature,signedPart(body)))return false;
 try{
  const jwtHeader=JSON.parse(Buffer.from(encodedHeader,'base64url').toString('utf8'));
  const payload=JSON.parse(Buffer.from(encodedPayload,'base64url').toString('utf8'));
  const now=Math.floor(Date.now()/1000);
  return jwtHeader.alg==='HS256'&&jwtHeader.typ==='JWT'&&payload.iss===issuer&&payload.aud===audience&&Number.isInteger(payload.iat)&&Number.isInteger(payload.exp)&&payload.iat<=now+30&&payload.exp>now&&payload.exp-payload.iat===tokenLifetime&&typeof payload.jti==='string';
 }catch{return false}
}
export function vietQrAutoVerifyEnabled(){return process.env.VIETQR_AUTO_VERIFY_ENABLED==='true'&&configured()}

export function parseVietQrCredit(body:any){
 if(!body||typeof body!=='object'||Array.isArray(body))return null;
 const bankAccount=String(body.bankaccount||'').trim();
 const amount=Number(body.amount);
 const content=String(body.content||'').trim().toUpperCase();
 const transactionId=String(body.transactionid||'').trim();
 const reference=String(body.referencenumber||'').trim();
 const transactionTime=Number(body.transactiontime);
 if(body.transType!=='C'||bankAccount!=='702252070200001'||!Number.isSafeInteger(amount)||amount<1||amount>9999999999999||!/^YWS[A-F0-9]{16,32}$/.test(content)||!transactionId||transactionId.length>150||!reference||reference.length>150||!Number.isSafeInteger(transactionTime)||transactionTime<0)return null;
 return {bankAccount,amount,content,transactionId,reference,transactionTime};
}
