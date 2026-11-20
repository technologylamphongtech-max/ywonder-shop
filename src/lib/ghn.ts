import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'crypto';
import {rows,run,transaction} from './db';
import {allocateDiscounts,PHONG_CHAU_COMBO_PRODUCT_ID,PHONG_CHAU_STORE_ID} from './affiliate';
import {canSeePhongChauCombo} from './phongchau-combo';

type GhnEnvironment='STAGING'|'PRODUCTION';
type GhnConfig={storeId:string;shopId:number;tokenCipher:string;environment:GhnEnvironment;shopName:string;pickupAddress:string;enabled:number;updated:number};
type GhnParcel={weight:number;length:number;width:number;height:number;wardName:string;provinceName:string;address:string;requiredNote:string};
// The GHN integration is retired. Keep historical shipment records and signed
// checkout quotes, but never initiate another GHN request from this release.
export const ghnGatewayEnabled=()=>false;
const base=(environment:GhnEnvironment)=>environment==='PRODUCTION'?(process.env.GHN_PRODUCTION_BASE||'https://online-gateway.ghn.vn'):(process.env.GHN_STAGING_BASE||'https://dev-online-gateway.ghn.vn');
const secret=()=>{const value=process.env.GHN_ENCRYPTION_KEY||process.env.AUTH_SECRET;if(!value||value.length<24)throw Error('Máy chủ chưa có khóa bảo vệ kết nối GHN');return createHash('sha256').update('ywonder-shop-ghn-v1:'+value).digest()};
const encrypt=(token:string)=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret(),iv),body=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64')};
const decrypt=(value:string)=>{const raw=Buffer.from(value,'base64'),decipher=createDecipheriv('aes-256-gcm',secret(),raw.subarray(0,12));decipher.setAuthTag(raw.subarray(12,28));return Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString('utf8')};
const text=(value:any,max=500)=>typeof value==='string'?value.trim().slice(0,max):'';
const number=(value:any,min:number,max:number,label:string)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(label+' không hợp lệ');return n};
async function request(environment:GhnEnvironment,token:string,shopId:number,path:string,body?:any):Promise<any>{
 throw Error('Giao Hàng Nhanh đã ngừng tích hợp trên YWonderShop');
}
async function ownerStore(userId:string){const store=(await rows("SELECT id FROM MarketStore WHERE userId=? AND status='APPROVED'",userId))[0];if(!store)throw Error('Gian hàng chưa được duyệt');return store.id as string}
async function configFor(storeId:string){const config=(await rows('SELECT * FROM MarketStoreGhnConfig WHERE storeId=? AND enabled=1',storeId))[0] as GhnConfig|undefined;if(!config)throw Error('Gian hàng chưa kết nối GHN');return {...config,token:decrypt(config.tokenCipher)}}
export async function ghnSellerView(userId:string){const store=(await rows('SELECT id FROM MarketStore WHERE userId=?',userId))[0];if(!store)return null;const config=(await rows('SELECT shopId,environment,shopName,pickupAddress,enabled,updated FROM MarketStoreGhnConfig WHERE storeId=?',store.id))[0]||null;return config?{...config,connected:true}:null}
export async function saveGhnSellerConfig(userId:string,body:any){
 const storeId=await ownerStore(userId),environment=body.environment==='PRODUCTION'?'PRODUCTION':body.environment==='STAGING'?'STAGING':null;
 if(!environment)throw Error('Chọn môi trường GHN thử nghiệm hoặc chính thức');
 const shopId=number(body.shopId,1,999999999,'Shop ID');const old=(await rows('SELECT * FROM MarketStoreGhnConfig WHERE storeId=?',storeId))[0] as GhnConfig|undefined;
 if(old&&(old.shopId!==shopId||old.environment!==environment)&&(await rows("SELECT 1 FROM MarketGhnShipment WHERE storeId=? AND status='CREATED' AND ghnStatus NOT IN ('delivered','returned','cancel') LIMIT 1",storeId)).length)throw Error('Còn vận đơn GHN đang giao. Vui lòng hoàn tất trước khi đổi Shop ID hoặc môi trường');
 const supplied=text(body.token,500);if(supplied&&!/^[\x21-\x7e]{10,500}$/.test(supplied))throw Error('Token GHN không hợp lệ');
 if(!supplied&&(!old||old.shopId!==shopId||old.environment!==environment))throw Error('Vui lòng nhập Token GHN cho Shop ID và môi trường này');
 const token=supplied||decrypt(old!.tokenCipher);
 const shops=await request(environment,token,shopId,'/shiip/public-api/v2/shop/all?offset=0&limit=200');
 const selected=(shops?.shops||[]).find((item:any)=>Number(item._id)===shopId&&Number(item.status)===1);
 if(!selected)throw Error('Shop ID không thuộc Token GHN này hoặc chưa hoạt động');
 await transaction(async tx=>{await tx.$executeRawUnsafe('INSERT INTO MarketStoreGhnConfig(storeId,shopId,tokenCipher,environment,shopName,pickupAddress,enabled,updated) VALUES(?,?,?,?,?,?,1,?) ON CONFLICT(storeId) DO UPDATE SET shopId=excluded.shopId,tokenCipher=excluded.tokenCipher,environment=excluded.environment,shopName=excluded.shopName,pickupAddress=excluded.pickupAddress,enabled=1,updated=excluded.updated',storeId,shopId,encrypt(token),environment,text(selected.name,150),text(selected.address,500),Date.now());await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),userId,'seller:ghn-config',storeId,Date.now())});
 return {shopId,environment,shopName:text(selected.name,150),pickupAddress:text(selected.address,500),connected:true};
}
function parcel(body:any,order:any):GhnParcel{
 const booked=order.shippingParcel||body;
 const weight=number(booked.weight,1,19999,'Khối lượng kiện (g)'),length=number(booked.length,1,200,'Chiều dài (cm)'),width=number(booked.width,1,200,'Chiều rộng (cm)'),height=number(booked.height,1,200,'Chiều cao (cm)');
 // Keep the buyer's recorded destination. Older orders may need ward/province names supplied by the seller.
 const wardName=text(order.wardName||body.wardName,160),provinceName=text(order.provinceName||body.provinceName,160),address=text(order.address,600);
 if(!wardName||!provinceName||!address)throw Error('Cần đủ địa chỉ, phường/xã và tỉnh/thành theo địa giới mới để gửi GHN');
 const requiredNote=['KHONGCHOXEMHANG','CHOXEMHANGKHONGTHU','CHOTHUHANG'].includes(body.requiredNote)?body.requiredNote:'CHOXEMHANGKHONGTHU';
 return {weight,length,width,height,wardName,provinceName,address,requiredNote};
}
async function sellerOrder(userId:string,orderId:string){
 const storeId=await ownerStore(userId);
 if((await rows('SELECT 1 FROM MarketOrderItem WHERE orderId=? AND productId=? LIMIT 1',orderId,PHONG_CHAU_COMBO_PRODUCT_ID)).length)throw Error('Combo affiliate Phong Châu không áp dụng giao hàng GHN');
 const order=(await rows("SELECT o.*,d.snapshot,p.status paymentStatus,COALESCE(a.approvedAt,0) approvedAt FROM MarketOrder o JOIN MarketOrderItem i ON i.orderId=o.id AND i.storeId=? LEFT JOIN MarketOrderDisclosure d ON d.orderId=o.id LEFT JOIN MarketOrderBankPayment p ON p.orderId=o.id LEFT JOIN MarketStoreOrderApproval a ON a.orderId=o.id AND a.storeId=? WHERE o.id=? AND NOT EXISTS(SELECT 1 FROM MarketOrderItem x WHERE x.orderId=o.id AND (x.storeId IS NULL OR x.storeId<>?)) LIMIT 1",storeId,storeId,orderId,storeId))[0];
 if(!order)throw Error('Không tìm thấy đơn thuộc gian hàng');
 if(order.status!=='CONFIRMED'&&order.status!=='SHIPPED')throw Error('Chỉ tạo vận đơn khi đơn đã được duyệt');
 if(order.paymentStatus&&order.paymentStatus!=='VERIFIED')throw Error('Cần đối soát chuyển khoản trước khi gửi GHN');
 let snapshot:any={};try{snapshot=JSON.parse(order.snapshot||'{}')}catch{}
 const delivery=snapshot.delivery||{};
 return {storeId,order:{...order,wardName:delivery.wardName,provinceName:delivery.provinceName,shippingParcel:snapshot.shippingProvider==='GHN'?snapshot.shippingParcel:null}};
}
async function booking(userId:string,body:any,create:boolean){
 const orderId=text(body.orderId,100);if(!orderId)throw Error('Thiếu mã đơn');
 const {storeId,order}=await sellerOrder(userId,orderId),config=await configFor(storeId),packageInfo=parcel(body,order);
 const existing=(await rows('SELECT * FROM MarketGhnShipment WHERE orderId=?',orderId))[0];
 if(existing?.status==='CREATED')throw Error('Đơn đã có mã vận đơn GHN '+existing.orderCode);
 if(existing?.status==='CREATING'&&Date.now()-Number(existing.updated)<60000)throw Error('Đơn đang được gửi GHN, vui lòng đợi');
 if(existing&&(existing.shopId!==config.shopId||existing.environment!==config.environment))throw Error('Đơn đã gửi GHN bằng cấu hình khác. Vui lòng liên hệ hỗ trợ');
 const items=await rows('SELECT i.name,i.quantity,i.price,p.sku FROM MarketOrderItem i LEFT JOIN MarketProduct p ON p.id=i.productId WHERE i.orderId=?',orderId);
 const payload={payment_type_id:1,required_note:packageInfo.requiredNote,to_name:order.name,to_phone:order.phone,to_address:packageInfo.address,to_ward_name:packageInfo.wardName,to_province_name:packageInfo.provinceName,is_new_to_address:true,client_order_code:'YWS-'+orderId,weight:packageInfo.weight,length:packageInfo.length,width:packageInfo.width,height:packageInfo.height,service_type_id:2,cod_amount:order.paymentStatus?0:Number(order.total),insurance_value:Math.min(5000000,Math.max(0,Number(order.total)-Number(order.shipping))),order_value:Math.max(0,Number(order.total)-Number(order.shipping)),note:text(order.note,1000),items:items.map(item=>({name:item.name,code:item.sku||undefined,quantity:Number(item.quantity),price:Number(item.price)}))};
 // A single parcel under 20 kg uses service type 2. The seller pays GHN; the buyer's existing order total stays unchanged.
 const preview=await request(config.environment,config.token,config.shopId,'/shiip/public-api/v2/shipping-order/preview',payload);
 const quote=Number(preview?.total_fee??preview?.fee?.total??preview?.fee?.main_service);
 if(!Number.isSafeInteger(quote)||quote<0)throw Error('GHN không trả về phí giao hàng hợp lệ');
 if(!create)return {quotedFee:quote,existingShipping:Number(order.shipping),codAmount:payload.cod_amount,expectedDelivery:text(preview?.expected_delivery_time,80),environment:config.environment};
 await transaction(async tx=>{
  const current=(await tx.$queryRawUnsafe('SELECT status,updated FROM MarketGhnShipment WHERE orderId=?',orderId))[0];
  if(current?.status==='CREATED'||current?.status==='CREATING'&&Date.now()-Number(current.updated)<60000)throw Error('Vận đơn đã được tạo hoặc đang xử lý');
  const stamp=Date.now();
  await tx.$executeRawUnsafe("INSERT INTO MarketGhnShipment(orderId,storeId,shopId,environment,clientOrderCode,status,weight,length,width,height,quotedFee,codAmount,created,updated) VALUES(?,?,?,?,?,'CREATING',?,?,?,?,?,?,?,?) ON CONFLICT(orderId) DO UPDATE SET status='CREATING',weight=excluded.weight,length=excluded.length,width=excluded.width,height=excluded.height,quotedFee=excluded.quotedFee,codAmount=excluded.codAmount,lastError='',updated=excluded.updated",orderId,storeId,config.shopId,config.environment,payload.client_order_code,packageInfo.weight,packageInfo.length,packageInfo.width,packageInfo.height,quote,payload.cod_amount,stamp,stamp);
 });
 try{
  const created=await request(config.environment,config.token,config.shopId,'/shiip/public-api/v2/shipping-order/create',payload);
  const code=text(created?.order_code,50);if(!code)throw Error('GHN chưa trả về mã vận đơn');
  const fee=Number(created?.total_fee??quote);
  await transaction(async tx=>{
   const changed=await tx.$executeRawUnsafe("UPDATE MarketGhnShipment SET orderCode=?,status='CREATED',ghnStatus='ready_to_pick',actualFee=?,expectedDelivery=?,lastError='',updated=? WHERE orderId=? AND status='CREATING'",code,Number.isSafeInteger(fee)?fee:quote,text(created?.expected_delivery_time,80),Date.now(),orderId);
   if(changed!==1)throw Error('Trạng thái vận đơn đã thay đổi');
   await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),userId,'seller:ghn-created',orderId,Date.now());
   await tx.$executeRawUnsafe('INSERT INTO MarketNotification VALUES(?,?,?,?,0,?)',randomUUID(),order.userId,'Đơn đã có mã vận đơn GHN',`Đơn #${orderId.slice(0,8)} · mã GHN ${code}.`,Date.now());
  });
  return {orderCode:code,quotedFee:quote,actualFee:Number.isSafeInteger(fee)?fee:quote,expectedDelivery:text(created?.expected_delivery_time,80)};
 }catch(error:any){await run("UPDATE MarketGhnShipment SET status='ERROR',lastError=?,updated=? WHERE orderId=? AND status='CREATING'",text(error?.message,300),Date.now(),orderId);throw error}
}
export const previewGhnShipment=(userId:string,body:any)=>booking(userId,body,false);
export const createGhnShipment=(userId:string,body:any)=>booking(userId,body,true);
export async function refreshGhnShipment(userId:string,body:any){
 const orderId=text(body.orderId,100),storeId=await ownerStore(userId),shipment=(await rows("SELECT * FROM MarketGhnShipment WHERE orderId=? AND storeId=? AND status='CREATED'",orderId,storeId))[0];if(!shipment)throw Error('Chưa có vận đơn GHN');
 const config=await configFor(storeId);if(config.shopId!==shipment.shopId||config.environment!==shipment.environment)throw Error('Cấu hình GHN đã đổi. Vui lòng dùng cấu hình cũ để đồng bộ vận đơn');
 const details=await request(config.environment,config.token,config.shopId,'/shiip/public-api/v2/shipping-order/detail?order_code='+encodeURIComponent(shipment.orderCode));
 const status=text(details?.status,80);if(!status)throw Error('GHN không trả về trạng thái vận đơn');
 await run('UPDATE MarketGhnShipment SET ghnStatus=?,updated=? WHERE orderId=?',status,Date.now(),orderId);
 return {orderCode:shipment.orderCode,ghnStatus:status};
}

type QuoteLine={storeId:string;storeName:string;provider:'GHN'|'FIXED'|'NONE';fee:number;gross:number;net:number;parcel?:{weight:number;length:number;width:number;height:number};shopId?:number;environment?:GhnEnvironment};
const addressFrom=(body:any)=>[text(body.addressDetail,500),text(body.street,200),text(body.wardName,160),text(body.provinceName,160),text(body.zipCode,10)?`ZIP ${text(body.zipCode,10)}`:''].filter(Boolean).join(', ')||text(body.address,600);
const quoteInput=(body:any)=>({items:(Array.isArray(body.items)?body.items:[]).map((x:any)=>({productId:text(x.productId,100),quantity:Number(x.quantity)})).sort((a:any,b:any)=>a.productId.localeCompare(b.productId)),address:addressFrom(body),wardName:text(body.wardName,160),provinceName:text(body.provinceName,160),paymentMethod:body.paymentMethod||'COD',code:text(body.code,80).toUpperCase(),points:Number(body.points||0),ywb:Number(body.ywb||0)});
function parcelFromProducts(items:any[]){
 let weight=0,volume=0,length=0,width=0,height=0;
 for(const item of items){let specs:any={};try{specs=JSON.parse(item.specsJson||'{}')}catch{}
  const unitWeight=Number(specs.weight),dimensions=String(specs.dimensions||'').split(/\s*[x×X*]\s*/).map(Number);
  if(!Number.isSafeInteger(unitWeight)||unitWeight<1||dimensions.length!==3||dimensions.some(x=>!Number.isSafeInteger(x)||x<1||x>200))throw Error(`Sản phẩm ${item.name} chưa có khối lượng (g) và kích thước đóng gói D × R × C (cm). Gian hàng cần bổ sung trước khi dùng GHN.`);
  weight+=unitWeight*item.quantity;length=Math.max(length,dimensions[0]);width=Math.max(width,dimensions[1]);height=Math.max(height,dimensions[2]);volume+=dimensions[0]*dimensions[1]*dimensions[2]*item.quantity;
 }
 height=Math.max(height,Math.ceil(volume/(length*width)));
 if(weight>19999||height>200)throw Error('Giỏ hàng vượt một kiện GHN dưới 20 kg hoặc kích thước 200 cm. Vui lòng tách đơn.');
 return {weight,length,width,height};
}
async function checkoutPricing(userId:string,body:any,cfg:any){
 const input=quoteInput(body);
 if(!input.items.length||input.items.length>50||input.items.some(x=>!x.productId||!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>99)||new Set(input.items.map(x=>x.productId)).size!==input.items.length)throw Error('Giỏ hàng không hợp lệ');
 if(!['COD','BANK'].includes(input.paymentMethod))throw Error('Phương thức thanh toán không hợp lệ');
 const viewer=(await rows('SELECT id,role,status FROM User WHERE id=?',userId))[0] as {id:string;role:string;status?:string}|undefined;
 const priced:any[]=[];
 for(const item of input.items){
  const p=(await rows("SELECT p.*,s.name storeName FROM MarketProduct p JOIN MarketCategory c ON c.id=p.categoryId LEFT JOIN MarketStore s ON s.id=p.storeId WHERE p.id=? AND p.active=1 AND c.active=1 AND (p.storeId IS NULL OR s.status='APPROVED')",item.productId))[0];
  if(!p||p.stock<item.quantity)throw Error('Sản phẩm hết hàng hoặc không còn bán');
  if(p.id===PHONG_CHAU_COMBO_PRODUCT_ID&&(p.storeId!==PHONG_CHAU_STORE_ID||!await canSeePhongChauCombo(viewer||null)))throw Error('Sản phẩm COMBO chỉ dành cho F1 được gian hàng chọn');
  priced.push({...p,quantity:item.quantity});
 }
 const combo=priced.some(p=>p.id===PHONG_CHAU_COMBO_PRODUCT_ID);
 if(combo&&priced.length!==1)throw Error('Vui lòng đặt combo affiliate Phong Châu riêng, không ghép với hàng cần giao');
 if(combo&&input.paymentMethod!=='BANK')throw Error('Combo affiliate Phong Châu chỉ thanh toán chuyển khoản, không giao hàng thu tiền');
 if(combo&&(input.code||input.points||input.ywb))throw Error('Combo affiliate cần thanh toán đủ giá trị để xét điều kiện F1; không áp dụng voucher, Xu hoặc YWH');
  if(!combo&&(!input.address||!input.wardName||!input.provinceName))throw Error('Vui lòng chọn tỉnh, phường/xã và địa chỉ nhận hàng trước khi đặt');
 const groups=new Map<string,any[]>();for(const p of priced){const key=p.storeId||'PLATFORM';groups.set(key,[...(groups.get(key)||[]),p]);}
 const grossTotal=priced.reduce((sum,p)=>sum+p.price*p.quantity,0);
 let discounts:number[]=[];
 if(groups.size>1){
  if(input.points||input.ywb)throw Error('Giỏ nhiều gian hàng chưa dùng chung Xu hoặc YWH');
  let promotion=0;
  if(input.code){
   if((await rows("SELECT id FROM MarketVoucher WHERE code=? AND userId=? AND status='UNUSED'",input.code,userId)).length)throw Error('Voucher chỉ dùng cho đơn một gian hàng');
   const coupon=(await rows("SELECT discountBps FROM MarketContent WHERE type='promotion' AND code=? AND active=1 AND (starts=0 OR starts<=?) AND (ends=0 OR ends>=?)",input.code,Date.now(),Date.now()))[0];
   if(!coupon)throw Error('Mã khuyến mãi không hợp lệ hoặc đã hết hạn');promotion=Math.floor(grossTotal*Number(coupon.discountBps)/10000);
  }
  discounts=allocateDiscounts([...groups.values()].map(items=>items.reduce((sum,p)=>sum+p.price*p.quantity,0)),promotion);
 }else{
  let discount=0;
  if(input.code){
   const voucher=(await rows("SELECT faceValue,expires FROM MarketVoucher WHERE code=? AND userId=? AND status='UNUSED'",input.code,userId))[0];
   if(voucher){if(voucher.expires&&voucher.expires<Date.now())throw Error('Voucher đã hết hạn');discount=Math.min(Number(voucher.faceValue),grossTotal)}
   else{const promotion=(await rows("SELECT discountBps FROM MarketContent WHERE type='promotion' AND code=? AND active=1 AND (starts=0 OR starts<=?) AND (ends=0 OR ends>=?)",input.code,Date.now(),Date.now()))[0];if(!promotion)throw Error('Mã khuyến mãi không hợp lệ hoặc đã hết hạn');discount=Math.floor(grossTotal*Number(promotion.discountBps)/10000)}
  }
  if(!Number.isSafeInteger(input.points)||input.points<0||!Number.isSafeInteger(input.ywb)||input.ywb<0)throw Error('Số Xu hoặc YWH không hợp lệ');
  const balance=(await rows('SELECT points,ywbBalance FROM MarketProfile WHERE userId=?',userId))[0]||{points:0,ywbBalance:0};
  if(input.points>Number(balance.points)||input.ywb>Number(balance.ywbBalance))throw Error('Số dư Xu hoặc YWH không đủ');
  if(input.points&&!cfg.xuEnabled||input.ywb&&(!cfg.ywbEnabled||!cfg.ywbToVnd)||input.points&&input.ywb&&!cfg.allowXuWithYwb)throw Error('Quyền lợi thanh toán không hợp lệ');
  discount+=input.points*Number(cfg.pointValue)+input.ywb*Number(cfg.ywbToVnd||0);
  if(discount>grossTotal)throw Error('Giảm giá vượt tiền hàng');
  discounts=[discount];
 }
 return {input,priced,groups,discounts,grossTotal};
}
const fingerprint=(priced:any[])=>createHash('sha256').update(JSON.stringify(priced.map(p=>[p.id,p.storeId||'PLATFORM',Number(p.price),Number(p.quantity),p.specsJson||'']).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))).digest('hex');
function signQuote(data:any){const payload=Buffer.from(JSON.stringify(data)).toString('base64url');const signature=createHmac('sha256',secret()).update(payload).digest('base64url');return payload+'.'+signature}
export function verifyCheckoutQuote(userId:string,body:any,priced:any[]){
 const token=text(body.shippingQuote,10000),parts=token.split('.');if(parts.length!==2)throw Error('Vui lòng tính lại phí giao hàng trước khi đặt');
 const expected=createHmac('sha256',secret()).update(parts[0]).digest();let actual:Buffer;try{actual=Buffer.from(parts[1],'base64url')}catch{throw Error('Báo giá vận chuyển không hợp lệ')}
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('Báo giá vận chuyển không hợp lệ');
 let quote:any;try{quote=JSON.parse(Buffer.from(parts[0],'base64url').toString())}catch{throw Error('Báo giá vận chuyển không hợp lệ')}
 if(quote.userId!==userId||quote.expires<Date.now()||quote.expires>Date.now()+360000||JSON.stringify(quote.input)!==JSON.stringify(quoteInput(body))||quote.fingerprint!==fingerprint(priced))throw Error('Giỏ hàng hoặc địa chỉ đã thay đổi. Vui lòng tính lại phí giao hàng');
 return quote as {lines:QuoteLine[];input:any;expires:number;fingerprint:string};
}
export async function quoteCheckoutShipping(userId:string,body:any,cfg:any){
 const {input,priced,groups,discounts}=await checkoutPricing(userId,body,cfg);
 const lines:QuoteLine[]=[];let index=0;
 for(const [storeId,items] of groups){
  const gross=items.reduce((sum,p)=>sum+p.price*p.quantity,0),net=gross-discounts[index++],storeName=items[0].storeName||'YWonderShop';
  if(items.length===1&&items[0].id===PHONG_CHAU_COMBO_PRODUCT_ID){
   const bank=(await rows('SELECT bankName,bankCode,bankAccount,accountName,qrImage FROM MarketStoreBankAccount WHERE storeId=?',storeId))[0];
   if(!bank||!/^\d{4,40}$/.test(bank.bankAccount)||!bank.bankName||!bank.accountName||!bank.bankCode&&!bank.qrImage)throw Error('Gian hàng Phong Châu chưa cấu hình tài khoản nhận chuyển khoản cho combo. Vui lòng liên hệ gian hàng.');
   lines.push({storeId,storeName,provider:'NONE',fee:0,gross,net});continue
  }
  lines.push({storeId,storeName,provider:'FIXED',fee:Number(cfg.shipping),gross,net});
 }
 const totalShipping=lines.reduce((sum,line)=>sum+line.fee,0),total=lines.reduce((sum,line)=>sum+line.net+line.fee,0);
 const quote={userId,input,fingerprint:fingerprint(priced),lines,expires:Date.now()+300000};
 return {shippingQuote:signQuote(quote),lines,totalShipping,total,expires:quote.expires};
}
