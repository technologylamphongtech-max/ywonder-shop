import {createHmac,timingSafeEqual} from 'crypto';

type ProductReferral={productId:string;refCode:string;expires:number};
const lifetimeMs=7*24*60*60*1000;
const productIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const refCodePattern=/^pc_[a-f0-9]{24}$/;

function secret(){
 const value=process.env.PRODUCT_REFERRAL_SECRET;
 if(!value)throw new Error('Thiếu khóa xác thực Shop');
 return value;
}

function signature(payload:string){
 return createHmac('sha256',secret()).update('shop-product-referral:v1:'+payload).digest('base64url');
}

export function createProductReferralToken(productId:string,refCode:string,at=Date.now()){
 if(!productIdPattern.test(productId)||!refCodePattern.test(refCode))throw new Error('Link giới thiệu sản phẩm không hợp lệ');
 const payload=Buffer.from(JSON.stringify({productId,refCode,expires:at+lifetimeMs} satisfies ProductReferral)).toString('base64url');
 return payload+'.'+signature(payload);
}

export function readProductReferralToken(token:unknown,at=Date.now()):ProductReferral|null{
 if(typeof token!=='string'||token.length>512||!token.includes('.'))return null;
 const [payload,received,...rest]=token.split('.');
 if(!payload||!received||rest.length)return null;
 const expected=Buffer.from(signature(payload));
 const actual=Buffer.from(received);
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
 try{
  const value=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
  if(!productIdPattern.test(value?.productId)||!refCodePattern.test(value?.refCode)||!Number.isSafeInteger(value?.expires)||value.expires<at||value.expires>at+lifetimeMs)return null;
  return {productId:value.productId,refCode:value.refCode,expires:value.expires};
 }catch{return null}
}
