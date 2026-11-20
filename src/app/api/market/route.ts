import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {randomBytes,randomUUID,randomInt,createHash,createHmac,timingSafeEqual} from 'crypto';
import bcrypt from 'bcryptjs';
import {db,rows,run,transaction} from '../../../lib/db';
import {captureAffiliateOrder,accrueAffiliateOrder,voidUnpaidAffiliateOrder,allocateDiscounts,affiliateSummary,PHONG_CHAU_STORE_ID,PHONG_CHAU_COMBO_PRODUCT_ID,MIZI_MALL_STORE_ID} from '../../../lib/affiliate';
import {canSeePhongChauCombo} from '../../../lib/phongchau-combo';
import {affiliateAdminReport,affiliateCsv,affiliateMembers,affiliateMemberDetail,affiliateStores,affiliateWithdrawals,affiliateAssignStore,affiliateConfirmPayment} from '../../../lib/affiliate-admin';
import {phongChauPoolReport,closePhongChauPool,confirmPhongChauPoolPayment,setPhongChauWithdrawalWindow,requestPhongChauWithdrawal,requestPhongChauDirectWithdrawal,requestMiziDirectWithdrawal,requestGeneralAffiliateWithdrawal,savePhongChauBankAccount} from '../../../lib/affiliate-pool';
import {storeAffiliateMembers,setStoreAffiliateMember} from '../../../lib/store-affiliate-selection';
import {transferYwhToShop} from '../../../lib/ywh-transfer';
import {readPolicies,savePolicies} from '../../../lib/policy-store';
import {policyLinks} from '../../../lib/policy-model';
import {legalVersions,acceptLegal,saveSeller,approveSellerLegal,sellerAgreementReady,saveProductLegal,attachProductLegal,publicStores,effectiveFee,scheduleFee,decodeDocument,sql} from '../../../lib/compliance';
import {defaultProductKind} from '../../../lib/compliance-model';
import {saveAIKey,aiConfigured,searchAI} from '../../../lib/ai';
import {awardShopReferral} from '../../../lib/referral';
import {sendShopWelcomeEmail} from '../../../lib/account-mail';
import {transferMemo} from '../../../lib/payment-bank';
import {PRODUCT_SPEC_FIELDS} from '../../../lib/product-detail';
import {readProductReferralToken} from '../../../lib/product-referral';
import {quoteCheckoutShipping,verifyCheckoutQuote} from '../../../lib/ghn';
import {completeShopTask} from '../../../lib/market-task-progress';
import {recordCompletedShopOrder} from '../../../lib/market-order-completion';
import {deleteMarketProduct} from '../../../lib/market-product-delete';
import {miziVipReport,closeMiziVipMonth} from '../../../lib/mizi-vip';
export const dynamic='force-dynamic';
const COOKIE='yw_market_session';
const now=()=>Date.now();
const id=()=>randomUUID();
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const fail=(s:string)=>{throw new Error(s)};
const text=(v:any,max=500)=>typeof v==='string'?v.trim().slice(0,max):'';
const integer=(v:any,min=0,max=1000000000)=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)fail('Giá trị số không hợp lệ');return n};
const required=(v:any,max=500)=>{const s=text(v,max);if(!s)fail('Vui lòng điền đủ thông tin bắt buộc');return s};
const usernameValue=(v:any)=>{const name=required(v,31).toLowerCase();if(!/^[a-z][a-z0-9_]{2,29}$/.test(name))fail('Tên đăng nhập gồm 3–30 ký tự, bắt đầu bằng chữ cái và chỉ dùng chữ không dấu, số hoặc dấu gạch dưới');return name};
async function usernameTaken(name:string,excludeId?:string){const found=await rows('SELECT id FROM User WHERE lower(username)=? LIMIT 1',name);return !!found.length&&found[0].id!==excludeId}
const imageURL=(v:any)=>{const s=text(v,1500000);if(!s||/^\/assets\/[a-zA-Z0-9_.-]+$/.test(s)||/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s))return s;try{const u=new URL(s);if(u.protocol==='https:')return u.href}catch{}return fail('Ảnh phải là PNG/JPG/WebP hoặc URL HTTPS')};
const composeAddress=(b:any)=>[text(b.addressDetail,500),text(b.street,200),text(b.wardName,160),text(b.provinceName,160),text(b.zipCode,10)?`ZIP ${text(b.zipCode,10)}`:''].filter(Boolean).join(', ');
const admin=(u:any)=>!!u&&['ADMIN','SUPER_ADMIN'].includes(u.role);
async function phongChauSeller(u:any){return !!u&&!!(await rows("SELECT 1 FROM MarketStore WHERE id=? AND userId=? AND status='APPROVED'",PHONG_CHAU_STORE_ID,u.id)).length}
async function miziSeller(u:any){return !!u&&!!(await rows("SELECT 1 FROM MarketStore WHERE id=? AND userId=? AND status='APPROVED'",MIZI_MALL_STORE_ID,u.id)).length}
const DEFAULT_SETTINGS={feeBps:0,rewardBps:0,shipping:0,pointValue:1,aiProvider:'none',aiModel:'',aiEnabled:false,
 ywbEnabled:false,ywbToVnd:0,ywbMinTransfer:1,ywbMaxTransfer:1000000,ywbDailyLimit:1000000,
 xuEnabled:true,xuVndRate:5,xuMaxDiscount:0,allowXuWithYwb:false,allowVoucherWithYwb:true,
 attendanceDaily:30,attendanceWeekly:0,attendanceMonthly:0};
const dayKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const previousDay=(day:string)=>{const d=new Date(day+'T00:00:00+07:00');d.setDate(d.getDate()-1);return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)};
const tierFor=(tiers:any[],spend:number,orders:number)=>tiers.filter(t=>t.active&&((t.minSpend||0)<=spend)&&((t.minOrders||0)<=orders)).sort((a,b)=>(b.minSpend-a.minSpend)||(b.minOrders-a.minOrders))[0]||tiers.find(t=>t.key==='BRONZE');
async function user(){const token=cookies().get(COOKIE)?.value;if(!token)return null;const s=(await rows('SELECT userId FROM MarketSession WHERE token=? AND expires>?',hash(token),now()))[0];if(!s)return null;const u=await db.user.findUnique({where:{id:s.userId}});return u?.status==='ACTIVE'?u:null}
async function session(uid:string){const token=randomBytes(32).toString('hex');await run('INSERT INTO MarketSession VALUES(?,?,?,?)',hash(token),uid,now()+14*86400000,now());cookies().set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:14*86400});}
async function limit(key:string,max=10){const t=now();await run('DELETE FROM MarketRate WHERE expires<?',t);await run('INSERT INTO MarketRate VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1',key,t+900000);if((await rows('SELECT count FROM MarketRate WHERE key=?',key))[0].count>max)fail('Bạn thao tác quá nhiều. Vui lòng thử lại sau 15 phút.');}
async function settings(){const value=(await rows("SELECT value FROM MarketSetting WHERE key='commerce'"))[0]?.value;const cfg={...DEFAULT_SETTINGS,...(value?JSON.parse(value):{})};cfg.feeBps=await effectiveFee(sql,'',cfg.feeBps);return cfg}
async function notify(tx:any,uid:string,title:string,body:string){await tx.$executeRawUnsafe('INSERT INTO MarketNotification VALUES(?,?,?,?,0,?)',id(),uid,title,body,now())}
async function audit(uid:string,action:string,target:string){await run('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',id(),uid,action,target,now())}
const completeTask=completeShopTask;
function totp(secret:string,code:string){try{const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const c of secret.toUpperCase().replace(/=+$/,'')){const n=alphabet.indexOf(c);if(n<0)return false;bits+=n.toString(2).padStart(5,'0')}const bytes=[];for(let i=0;i+8<=bits.length;i+=8)bytes.push(parseInt(bits.slice(i,i+8),2));for(let delta=-1;delta<=1;delta++){const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(Math.floor(now()/30000)+delta));const h=createHmac('sha1',Buffer.from(bytes)).update(b).digest();const offset=h[19]&15;const expected=String((h.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');if(/^\d{6}$/.test(code)&&timingSafeEqual(Buffer.from(code),Buffer.from(expected)))return true}}catch{}return false}
export async function GET(req:NextRequest){try{
 const u=await user();const action=req.nextUrl.searchParams.get('action');
 if(action==='authStatus')return NextResponse.json({authenticated:!!u},{headers:{'Cache-Control':'no-store'}});
 if(action==='affiliateSelf'){
  if(!u)return NextResponse.json({error:'Vui lòng đăng nhập'},{status:401,headers:{'Cache-Control':'private, no-store'}});
  return NextResponse.json({...(await affiliateSummary({$queryRawUnsafe:rows,$executeRawUnsafe:run},u.id)),pool:await phongChauPoolReport({$queryRawUnsafe:rows,$executeRawUnsafe:run},u.id),miziVip:await miziVipReport({$queryRawUnsafe:rows,$executeRawUnsafe:run},u.id)},{headers:{'Cache-Control':'private, no-store'}});
 }
  if(['withdrawalKyc','withdrawalKycAdmin','withdrawalKycDocument'].includes(action||''))return NextResponse.json({error:'KYC khách hàng đã ngừng hoạt động trên YWonderShop'},{status:410});
 if(action==='orderQr'){
  if(!u)return NextResponse.json({error:'Vui lòng đăng nhập'},{status:401});
  const orderId=required(req.nextUrl.searchParams.get('id'),100);
  const payment=(await rows('SELECT p.qrImage,o.userId FROM MarketOrderBankPayment p JOIN MarketOrder o ON o.id=p.orderId WHERE o.id=?',orderId))[0];
  if(!payment||!payment.qrImage)return NextResponse.json({error:'Không tìm thấy ảnh QR'},{status:404});
  if(!admin(u)&&payment.userId!==u.id&&!(await rows('SELECT 1 FROM MarketOrderItem i JOIN MarketStore s ON s.id=i.storeId WHERE i.orderId=? AND s.userId=? LIMIT 1',orderId,u.id)).length)return NextResponse.json({error:'Không có quyền xem QR'},{status:403});
  const document=decodeDocument(payment.qrImage);
  if(!document.mime.startsWith('image/'))return NextResponse.json({error:'Ảnh QR không hợp lệ'},{status:400});
  return new NextResponse(new Uint8Array(document.bytes),{headers:{'Content-Type':document.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(action==='policiesAdmin'){
  if(!admin(u))return NextResponse.json({error:'Chỉ quản trị viên được truy cập'},{status:403});
  return NextResponse.json({bundle:await readPolicies()},{headers:{'Cache-Control':'no-store'}});
 }
 if(action==='affiliatePool'){
  if(!admin(u)&&!await phongChauSeller(u))return NextResponse.json({error:'Chỉ gian hàng Phong Châu hoặc quản trị viên được truy cập'},{status:403});
  return NextResponse.json(await phongChauPoolReport({$queryRawUnsafe:rows,$executeRawUnsafe:run}));
 }
 if(action==='storeAffiliateMembers'){
  if(!u)return NextResponse.json({error:'Vui lòng đăng nhập'},{status:401});
  try{return NextResponse.json(await storeAffiliateMembers({$queryRawUnsafe:rows,$executeRawUnsafe:run},u.id),{headers:{'Cache-Control':'no-store'}})}
  catch(e:any){return NextResponse.json({error:e.message},{status:403})}
 }
 if(action==='miziDirectWithdrawals'){
  if(!admin(u)&&!await miziSeller(u))return NextResponse.json({error:'Không có quyền xem yêu cầu rút của Mizi mall'},{status:403});
  return NextResponse.json({rows:await rows("SELECT w.id,w.commissionId,w.status,w.bankName,w.bankAccount,w.accountName,w.created,c.orderId,c.amount,c.revenue,c.status commissionStatus,u.fullName beneficiaryName,u.email beneficiaryEmail,p.reference paymentReference FROM MarketAffiliateDirectWithdrawal w JOIN MarketAffiliateCommission c ON c.id=w.commissionId JOIN User u ON u.id=w.beneficiaryId LEFT JOIN MarketAffiliatePayout p ON p.id=w.payoutId WHERE c.sourceKey=? AND c.kind='CONNECTION' AND c.level=1 AND c.rateBps=2000 ORDER BY w.created DESC LIMIT 500",MIZI_MALL_STORE_ID)},{headers:{'Cache-Control':'private, no-store'}});
 }
 if(action==='miziVipAdmin'){
  if(!admin(u)&&!await miziSeller(u))return NextResponse.json({error:'Không có quyền quản lý quỹ VIP Mizi mall'},{status:403});
  return NextResponse.json(await miziVipReport({$queryRawUnsafe:rows,$executeRawUnsafe:run}),{headers:{'Cache-Control':'private, no-store'}});
 }
 if(['affiliateAdmin','affiliateExport','affiliateMembers','affiliateMember','affiliateStores','affiliateWithdrawals'].includes(action||'')){
  if(!admin(u))return NextResponse.json({error:'Chỉ quản trị viên được truy cập'},{status:403});
  try{
   const sql={$queryRawUnsafe:rows,$executeRawUnsafe:run},params=req.nextUrl.searchParams;
   if(action==='affiliateStores')return NextResponse.json(await affiliateStores(sql));
   if(action==='affiliateWithdrawals')return NextResponse.json(await affiliateWithdrawals(sql));
   if(action==='affiliateMembers')return NextResponse.json(await affiliateMembers(sql,params));
   if(action==='affiliateMember')return NextResponse.json(await affiliateMemberDetail(sql,required(params.get('id'),100)));
   const report=await affiliateAdminReport(sql,params,action==='affiliateExport');
   if(action==='affiliateExport')return new NextResponse(affiliateCsv(report.commissions),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="affiliate-${dayKey()}.csv"`,'Cache-Control':'no-store'}});
   return NextResponse.json(report);
  }catch(e:any){return NextResponse.json({error:e.message||'Không tải được dữ liệu affiliate'},{status:400})}
 }
 if(action==='admin'){
  if(!admin(u))return NextResponse.json({error:'Chỉ quản trị viên được truy cập'},{status:403});
  const [products,content,stores,orders,settlements,audits,cfg,categories,tasks,hubs,voucherCampaigns,tiers,transfers]=await Promise.all([
   rows('SELECT p.*,s.name storeName,s.userId storeUserId,c.name categoryName FROM MarketProduct p LEFT JOIN MarketStore s ON s.id=p.storeId LEFT JOIN MarketCategory c ON c.id=p.categoryId WHERE p.active<>-1 ORDER BY p.created DESC LIMIT 500'),rows('SELECT * FROM MarketContent ORDER BY created DESC'),rows('SELECT s.*,u.fullName,u.email FROM MarketStore s LEFT JOIN User u ON u.id=s.userId WHERE s.status<>"DELETED" ORDER BY s.created DESC'),rows('SELECT o.*,p.status paymentStatus,p.amountVnd paymentAmount,p.bankName paymentBankName,p.bankCode paymentBankCode,p.accountNumber paymentAccountNumber,p.accountName paymentAccountName,p.transferMemo paymentMemo,p.reference paymentReference,p.storeId paymentStoreId,CASE WHEN EXISTS(SELECT 1 FROM MarketOrderItem mi WHERE mi.orderId=o.id AND mi.storeId IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM MarketOrderItem mi WHERE mi.orderId=o.id AND mi.storeId IS NULL) THEN 1 ELSE 0 END sellerManaged,CASE WHEN LENGTH(p.qrImage)>0 THEN 1 ELSE 0 END paymentQrAvailable,(SELECT json_extract(snapshot,\'$.shippingProvider\') FROM MarketOrderDisclosure WHERE orderId=o.id) shippingProvider FROM MarketOrder o LEFT JOIN MarketOrderBankPayment p ON p.orderId=o.id ORDER BY o.created DESC LIMIT 500'),rows('SELECT t.*,s.name storeName FROM MarketSettlement t JOIN MarketStore s ON s.id=t.storeId ORDER BY t.created DESC LIMIT 500'),rows('SELECT a.*,u.fullName FROM MarketAudit a LEFT JOIN User u ON u.id=a.userId ORDER BY a.created DESC LIMIT 100'),settings(),rows('SELECT * FROM MarketCategory ORDER BY sort'),rows('SELECT * FROM MarketTaskDefinition ORDER BY created'),rows('SELECT id,name,qrToken,address,latitude,longitude,active,qrExpires,created FROM MarketHub ORDER BY created DESC'),rows('SELECT c.*,COALESCE((SELECT COUNT(*) FROM MarketVoucher v WHERE v.campaignId=c.id),0) issued FROM MarketVoucherCampaign c ORDER BY c.created DESC'),rows('SELECT * FROM MarketMembershipTier ORDER BY sort'),rows('SELECT t.*,u.fullName,u.email FROM MarketYwbTransfer t LEFT JOIN User u ON u.id=t.userId ORDER BY t.created DESC LIMIT 500')]);
  const comboOrderIds=new Set((await rows('SELECT DISTINCT orderId FROM MarketOrderItem WHERE productId=?',PHONG_CHAU_COMBO_PRODUCT_ID)).map(row=>row.orderId));
  return NextResponse.json({products:await attachProductLegal(products),content,stores,orders:orders.map(order=>comboOrderIds.has(order.id)?{...order,shippingProvider:'NONE'}:order),fulfilments:await rows('SELECT f.*,s.name storeName FROM MarketSellerFulfilment f JOIN MarketStore s ON s.id=f.storeId ORDER BY f.updated DESC LIMIT 1000'),settlements,audits,settings:cfg,categories,tasks,hubs,voucherCampaigns,tiers,transfers,affiliate:await affiliateSummary({$queryRawUnsafe:rows,$executeRawUnsafe:run}),aiConfigured:await aiConfigured()});
 }
 const [categories,products,content,cfg,tiers,hubs,voucherCampaigns]=await Promise.all([rows('SELECT * FROM MarketCategory WHERE active=1 ORDER BY sort'),rows("SELECT p.id,p.storeId,p.categoryId,p.name,p.sku,p.description,p.price,p.stock,p.image,p.active,p.created,p.compareAtPrice,c.name categoryName,s.name storeName FROM MarketProduct p JOIN MarketCategory c ON c.id=p.categoryId LEFT JOIN MarketStore s ON s.id=p.storeId WHERE p.active=1 AND c.active=1 AND (p.storeId IS NULL OR s.status='APPROVED') ORDER BY p.created DESC LIMIT 1000"),rows('SELECT * FROM MarketContent WHERE active=1 AND (starts=0 OR starts<=?) AND (ends=0 OR ends>=?) ORDER BY created DESC',now(),now()),settings(),rows('SELECT * FROM MarketMembershipTier WHERE active=1 ORDER BY sort'),rows('SELECT id,name,qrToken,address,latitude,longitude,qrExpires FROM MarketHub WHERE active=1 ORDER BY name'),rows('SELECT * FROM MarketVoucherCampaign WHERE active=1 AND (starts=0 OR starts<=?) AND (ends=0 OR ends>=?) ORDER BY created DESC',now(),now())]);
 let account=null;
 if(u){await run('INSERT OR IGNORE INTO MarketProfile(userId) VALUES(?)',u.id);const [profile,favorites,orders,ledger,notifications,stores,attendance,tasks,progress,vouchers,completed]=await Promise.all([rows('SELECT * FROM MarketProfile WHERE userId=?',u.id),rows('SELECT productId FROM MarketFavorite WHERE userId=?',u.id),rows('SELECT o.*,p.status paymentStatus,p.amountVnd paymentAmount,p.bankName paymentBankName,p.bankCode paymentBankCode,p.accountNumber paymentAccountNumber,p.accountName paymentAccountName,p.transferMemo paymentMemo,p.reference paymentReference,p.storeId paymentStoreId,CASE WHEN EXISTS(SELECT 1 FROM MarketOrderItem mi WHERE mi.orderId=o.id AND mi.storeId IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM MarketOrderItem mi WHERE mi.orderId=o.id AND mi.storeId IS NULL) THEN 1 ELSE 0 END sellerManaged,CASE WHEN LENGTH(p.qrImage)>0 THEN 1 ELSE 0 END paymentQrAvailable FROM MarketOrder o LEFT JOIN MarketOrderBankPayment p ON p.orderId=o.id WHERE o.userId=? ORDER BY o.created DESC LIMIT 100',u.id),rows('SELECT * FROM MarketLedger WHERE userId=? ORDER BY created DESC LIMIT 100',u.id),rows('SELECT * FROM MarketNotification WHERE userId=? ORDER BY created DESC LIMIT 100',u.id),rows("SELECT * FROM MarketStore WHERE userId=? AND status<>'DELETED'",u.id),rows('SELECT * FROM MarketAttendance WHERE userId=? ORDER BY day DESC LIMIT 60',u.id),rows('SELECT * FROM MarketTaskDefinition WHERE active=1 ORDER BY created'),rows('SELECT p.*,d.key,d.title,d.description,d.reward,d.goal FROM MarketTaskProgress p JOIN MarketTaskDefinition d ON d.id=p.taskId WHERE p.userId=? AND p.day=?',u.id,dayKey()),rows('SELECT * FROM MarketVoucher WHERE userId=? ORDER BY created DESC LIMIT 100',u.id),rows("SELECT COUNT(*) orders,COALESCE(SUM(total),0) spend FROM MarketOrder WHERE userId=? AND status='COMPLETED'",u.id)]);
 const orderItems=await rows('SELECT i.* FROM MarketOrderItem i JOIN MarketOrder o ON o.id=i.orderId WHERE o.userId=? ORDER BY o.created DESC LIMIT 1000',u.id);const luckySpinToday=(await rows('SELECT reward,created FROM MarketLuckySpin WHERE userId=? AND day=?',u.id,dayKey()))[0]||null;
 const store=stores[0];const tier=tierFor(tiers,Number(completed[0]?.spend||0),Number(completed[0]?.orders||0));const today=dayKey(),lastAttendance=profile[0]?.attendanceLast;const profileView=profile[0]&&lastAttendance&&lastAttendance!==today&&lastAttendance!==previousDay(today)?{...profile[0],attendanceStreak:0}:profile[0];account={user:{id:u.id,fullName:u.fullName,email:u.email,username:u.username,phone:u.phone,role:u.role,refCode:u.refCode,twoFaEnabled:!!u.twoFaSecret},profile:profileView,hubYwhBalance:Number((await rows('SELECT balanceYwh FROM Wallet WHERE userId=?',u.id))[0]?.balanceYwh||0),transfers:await rows('SELECT * FROM MarketYwbTransfer WHERE userId=? ORDER BY created DESC LIMIT 100',u.id),affiliate:{...(await affiliateSummary({$queryRawUnsafe:rows,$executeRawUnsafe:run},u.id)),pool:await phongChauPoolReport({$queryRawUnsafe:rows,$executeRawUnsafe:run},u.id),miziVip:await miziVipReport({$queryRawUnsafe:rows,$executeRawUnsafe:run},u.id)},favorites:favorites.map(f=>f.productId),orders,orderItems,ledger,notifications,store:store?{...store,feeBps:await effectiveFee(sql,store.id,store.feeBps??cfg.feeBps)}:null,storeProducts:store?await attachProductLegal(await rows('SELECT * FROM MarketProduct WHERE storeId=? AND active<>-1 ORDER BY created DESC',store.id)):[],settlements:store?await rows('SELECT * FROM MarketSettlement WHERE storeId=? ORDER BY created DESC LIMIT 500',store.id):[],loyalty:{attendance:attendance[0]||null,attendanceToday:attendance.some(a=>a.day===today),luckySpinToday,tasks:tasks.map(d=>({...d,progress:progress.find(p=>p.taskId===d.id)?.progress||0,rewarded:!!progress.find(p=>p.taskId===d.id)?.rewarded})),vouchers,tiers,currentTier:tier,completed:completed[0]||{orders:0,spend:0},hubs}};}
 const policies=await readPolicies(),versions=await legalVersions(),legalProducts=await attachProductLegal(products),comboVisible=await canSeePhongChauCombo(u);
 const visibleProducts=legalProducts.filter(p=>{if(p.id===PHONG_CHAU_COMBO_PRODUCT_ID&&!comboVisible)return false;const kind=defaultProductKind(p.categoryName);return p.legal?(p.legal.kind==='NONE'&&kind==='NONE'||p.legal.kind!=='NONE'&&p.legal.status==='APPROVED'&&p.legal.hasDocument):kind==='NONE'}).map(p=>p.legal?{...p,legal:{...p.legal,reviewNote:undefined}}:p);
 return NextResponse.json({categories,products:visibleProducts,stores:await publicStores(),content,settings:cfg,tiers,hubs,voucherCampaigns,account,policySite:{company:policies.company,bank:policies.bank,links:policyLinks(policies),versions:{seller:versions.seller.version,buyer:versions.buyer.version}}});
 }catch(e){console.error('market GET',e);return NextResponse.json({error:'Không tải được dữ liệu cửa hàng'},{status:500})}}
export async function POST(req:NextRequest){try{
 const origin=req.headers.get('origin');const allowed=process.env.MARKET_ORIGIN||'https://shop.ywonder.net';
 if(origin!==allowed)return NextResponse.json({error:'Nguồn yêu cầu không hợp lệ'},{status:403});
 if(!req.headers.get('content-type')?.includes('application/json'))return NextResponse.json({error:'Định dạng không hợp lệ'},{status:415});
 const raw=await req.text();if(raw.length>3000000)return NextResponse.json({error:'Dữ liệu quá lớn'},{status:413});
 const b=JSON.parse(raw),action=text(b.action,60);const u=await user();let draftSaved=false;
 const ip=req.headers.get('x-real-ip')||'local';
 if(action==='login'||action==='register'){
  await limit('login:'+ip,20);const login=required(b.login,120).toLowerCase();const password=required(b.password,200);
  if(action==='register'){
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login)||password.length<10)fail('Email hợp lệ và mật khẩu tối thiểu 10 ký tự');
   const username=usernameValue(b.username);
   if(await db.user.findUnique({where:{email:login}}))fail('Không thể đăng ký bằng email này');
   if(await usernameTaken(username))fail('Tên đăng nhập đã được sử dụng');
   const ref=text(b.refCode,120);const referrer=ref?(await db.user.findFirst({where:{OR:[{refCode:ref},{refCode:ref.toLowerCase()}],status:'ACTIVE',role:{notIn:['ADMIN','SUPER_ADMIN']}}})):null;if(ref&&!referrer)fail('Mã giới thiệu không hợp lệ hoặc tài khoản đã bị khóa');
   const passwordHash=await bcrypt.hash(password,12),fullName=required(b.fullName,100);
   const created=await db.user.create({data:{email:login,username,passwordHash,fullName,status:'PENDING',refCode:randomBytes(12).toString('hex'),referredById:referrer?.id||null,updatedAt:new Date()}});
   try{
    await sendShopWelcomeEmail(login,fullName);
    await transaction(async tx=>{
     await tx.user.update({where:{id:created.id},data:{status:'ACTIVE',updatedAt:new Date()}});
     await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketProfile(userId) VALUES(?)',created.id);
     if(referrer)await awardShopReferral(tx,referrer.id,created.id);
    });
   }catch(e){await db.user.delete({where:{id:created.id}}).catch(()=>{});fail('Không gửi được email đăng ký. Vui lòng thử lại sau.');}
   await session(created.id);return NextResponse.json({ok:true});
  }
  let found=await db.user.findFirst({where:{OR:[{email:login},{username:login},{phone:login}]}});
  if(!found){const legacyUsername=(await rows('SELECT id FROM User WHERE lower(username)=? LIMIT 1',login))[0];if(legacyUsername)found=await db.user.findUnique({where:{id:legacyUsername.id}})}
  if(!found?.passwordHash||found.status!=='ACTIVE'||!(await bcrypt.compare(password,found.passwordHash)))fail('Sai tài khoản hoặc mật khẩu');
  if(found.twoFaSecret&&!totp(found.twoFaSecret,text(b.otp,6)))fail('Vui lòng nhập mã xác thực 2 bước hợp lệ');
  await session(found.id);return NextResponse.json({ok:true});
 }
 if(action==='searchAI'){
  const cfg=await settings();if(!cfg.aiEnabled)return NextResponse.json({mode:'standard',message:'AI chưa được cấu hình. Đang tìm trong danh mục sản phẩm.'});
  if(!u)return NextResponse.json({error:'Đăng nhập để sử dụng tìm kiếm AI'},{status:401});
  await limit('ai:'+u.id,10);await limit('ai:global',200);
  try{return NextResponse.json({mode:'ai',...await searchAI(required(b.prompt,500),cfg.aiModel,await canSeePhongChauCombo(u))})}catch{return NextResponse.json({mode:'standard',message:'AI tạm thời không khả dụng. Đang dùng tìm kiếm thông thường.'})}
 }
 if(!u)return NextResponse.json({error:'Vui lòng đăng nhập để tiếp tục'},{status:401});
 if(action==='logout'){await run('DELETE FROM MarketSession WHERE token=?',hash(cookies().get(COOKIE)?.value||''));cookies().delete(COOKIE);return NextResponse.json({ok:true})}
 await limit('write:'+u.id,200);
  if(['withdrawalKycOcr','withdrawalKycSubmit','withdrawalKycReview'].includes(action||''))return NextResponse.json({error:'KYC khách hàng đã ngừng hoạt động trên YWonderShop'},{status:410});
 if(action==='shippingQuote'){await limit('shipping-quote:'+u.id,40);return NextResponse.json({ok:true,...await quoteCheckoutShipping(u.id,b,await settings())})}
 if(action==='policiesPublish'){
  if(!admin(u))return NextResponse.json({error:'Chỉ quản trị viên được thực hiện'},{status:403});
  const result=await transaction(tx=>savePolicies(tx,u.id,b),{timeout:15000});
  if(result.conflict)return NextResponse.json({error:'Nội dung đã được cập nhật ở phiên khác. Hãy tải bản mới trước khi lưu.'},{status:409});
  return NextResponse.json({ok:true,...result});
 }
 if(action==='affiliatePoolWithdraw'){
  const result=await transaction(tx=>requestPhongChauWithdrawal(tx,u.id,b),{timeout:15000});
  return NextResponse.json({ok:true,...result});
 }
 if(action==='affiliateDirectWithdraw'){
  const result=await transaction(tx=>requestPhongChauDirectWithdrawal(tx,u.id,b),{timeout:15000});
  return NextResponse.json({ok:true,...result});
 }
 if(action==='miziDirectWithdraw'){
  const result=await transaction(tx=>requestMiziDirectWithdrawal(tx,u.id,b),{timeout:15000});
  return NextResponse.json({ok:true,...result});
 }
 if(action==='affiliateGeneralWithdraw'){
  const result=await transaction(tx=>requestGeneralAffiliateWithdrawal(tx,u.id,b),{timeout:15000});
  return NextResponse.json({ok:true,...result});
 }
 if(['miziVipWithdraw','miziVipWindow','miziVipPayment'].includes(action))return NextResponse.json({error:'Quỹ VIP Mizi mall được công ty xét và trả thưởng thủ công; Shop không phân bổ hoặc xử lý rút quỹ.'},{status:410});
 if(action==='affiliateBankAccount'){
  const result=await transaction(tx=>savePhongChauBankAccount(tx,u.id,b),{timeout:15000});
  return NextResponse.json({ok:true,bankAccount:result});
 }
 if(action==='miziDirectPayment'){
  if(!admin(u)&&!await miziSeller(u))return NextResponse.json({error:'Không có quyền thanh toán hoa hồng Mizi mall'},{status:403});
  const result=await transaction(async tx=>{
   if(!Array.isArray(b.ids)||!b.ids.length||b.ids.length>200||b.ids.some((value:any)=>typeof value!=='string'||!value))fail('Danh sách hoa hồng không hợp lệ');
   const marks=b.ids.map(()=>'?').join(',');
   const eligible=await tx.$queryRawUnsafe(`SELECT id FROM MarketAffiliateCommission WHERE id IN (${marks}) AND kind='CONNECTION' AND level=1 AND sourceKey=? AND rateBps=2000`,...b.ids,MIZI_MALL_STORE_ID);
   if(eligible.length!==b.ids.length)fail('Chỉ được đối soát hoa hồng trực tiếp Mizi mall');
   return affiliateConfirmPayment(tx,u.id,b);
  },{timeout:30000});
  return NextResponse.json({ok:true,...(result||{})});
 }
 if(action==='miziVipClose'){
  if(!admin(u)&&!await miziSeller(u))return NextResponse.json({error:'Không có quyền quản lý quỹ VIP Mizi mall'},{status:403});
  const result=await transaction(tx=>closeMiziVipMonth(tx,required(b.period,7),u.id),{timeout:30000});
  return NextResponse.json({ok:true,...result});
 }
 if(action==='storeAffiliateMember'){
  const result=await transaction(tx=>setStoreAffiliateMember(tx,u.id,b),{timeout:15000});
  return NextResponse.json({ok:true,...result});
 }
 if(['affiliateConfirmPayment','affiliateAssignStore','affiliatePoolClose','affiliatePoolPayment','affiliatePoolWithdrawalWindow','affiliateDirectPayment'].includes(action)){
  const sellerAction=['affiliatePoolClose','affiliatePoolPayment','affiliatePoolWithdrawalWindow','affiliateDirectPayment'].includes(action);
  if(!admin(u)&&!(sellerAction&&await phongChauSeller(u)))return NextResponse.json({error:'Không có quyền quản lý quỹ Phong Châu'},{status:403});
  const result=await transaction(async tx=>{
   if(action==='affiliateDirectPayment'){
    if(!Array.isArray(b.ids)||!b.ids.length||b.ids.length>200||b.ids.some((value:any)=>typeof value!=='string'||!value))fail('Danh sách hoa hồng không hợp lệ');
    const marks=b.ids.map(()=>'?').join(',');const eligible=await tx.$queryRawUnsafe(`SELECT id FROM MarketAffiliateCommission WHERE id IN (${marks}) AND kind='CONNECTION' AND level=1 AND sourceKey=? AND rateBps=2000`,...b.ids,PHONG_CHAU_STORE_ID);
    if(eligible.length!==b.ids.length)fail('Chỉ được đối soát hoa hồng trực tiếp Phong Châu');
    return affiliateConfirmPayment(tx,u.id,b);
   }
   return action==='affiliateConfirmPayment'?affiliateConfirmPayment(tx,u.id,b):action==='affiliateAssignStore'?affiliateAssignStore(tx,u.id,b):action==='affiliatePoolClose'?closePhongChauPool(tx,required(b.period,7),u.id):action==='affiliatePoolWithdrawalWindow'?setPhongChauWithdrawalWindow(tx,u.id,required(b.period),b.opened):confirmPhongChauPoolPayment(tx,u.id,b);
  },{timeout:30000});
  return NextResponse.json({ok:true,...(result||{})});
 }
 if(action==='attendance'){
  const day=dayKey();const cfg=await settings();await transaction(async tx=>{
   const inserted=await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketAttendance(userId,day,streak,amount,created) VALUES(?,?,?,?,?)',u.id,day,1,cfg.attendanceDaily,now());
   if(inserted!==1)fail('Bạn đã điểm danh hôm nay');
   const profile:any=(await tx.$queryRawUnsafe('SELECT * FROM MarketProfile WHERE userId=?',u.id))[0];const streak=profile?.attendanceLast===previousDay(day)?(profile.attendanceStreak||0)+1:1;
   await tx.$executeRawUnsafe('UPDATE MarketAttendance SET streak=? WHERE userId=? AND day=?',streak,u.id,day);await tx.$executeRawUnsafe('UPDATE MarketProfile SET points=points+?,attendanceStreak=?,attendanceLast=? WHERE userId=?',cfg.attendanceDaily,streak,day,u.id);await tx.$executeRawUnsafe('INSERT OR REPLACE INTO MarketLedger VALUES(?,?,?,?,?,?)',id(),u.id,`${u.id}:attendance:${day}`,cfg.attendanceDaily,'ATTENDANCE',now());
   await completeTask(tx,u.id,'attendance',day,1);
   let bonus=0;if([7,14,21,28].includes(streak))bonus=cfg.attendanceWeekly;if(streak===30)bonus=cfg.attendanceMonthly;if(bonus>0){await tx.$executeRawUnsafe('UPDATE MarketProfile SET points=points+? WHERE userId=?',bonus,u.id);await tx.$executeRawUnsafe('INSERT OR REPLACE INTO MarketLedger VALUES(?,?,?,?,?,?)',id(),u.id,`${u.id}:attendance-milestone:${streak}:${day}`,bonus,'ATTENDANCE_MILESTONE',now());}
   await notify(tx,u.id,'Điểm danh thành công',`Ngày ${streak} liên tiếp: +${cfg.attendanceDaily} Xu${bonus?` và +${bonus} Xu quà mốc`:''}.`);
  });await audit(u.id,'attendance',day);
 }else if(action==='taskEvent'){
  const key=required(b.key,80);const amount=integer(b.amount||1,1,100);const ref=text(b.ref,160);const automatic=['attendance','hub_visit','hub_qr','order_completed','invite_friend'];if(automatic.includes(key))fail('Nhiệm vụ này được hệ thống ghi nhận tự động');if(['view_products','watch_video'].includes(key)&&amount!==1)fail('Mỗi lần chỉ ghi nhận một lượt nhiệm vụ');if(key==='view_products'&&ref===PHONG_CHAU_COMBO_PRODUCT_ID&&!await canSeePhongChauCombo(u))fail('Sản phẩm không còn hợp lệ');if(key==='view_products'&&!(await rows("SELECT p.id FROM MarketProduct p JOIN MarketCategory c ON c.id=p.categoryId LEFT JOIN MarketStore s ON s.id=p.storeId WHERE p.id=? AND p.active=1 AND c.active=1 AND p.stock>0 AND (p.storeId IS NULL OR s.status='APPROVED')",ref)).length)fail('Sản phẩm không còn hợp lệ');if(key==='watch_video'&&!(await rows("SELECT id FROM MarketContent WHERE id=? AND type='video' AND active=1 AND (starts=0 OR starts<=?) AND (ends=0 OR ends>=?)",ref,now(),now())).length)fail('Video không còn được phát');const day=dayKey();await transaction(async tx=>{const reward=await completeTask(tx,u.id,key,day,amount,ref);if(reward)await notify(tx,u.id,'Hoàn thành nhiệm vụ',`Bạn nhận +${reward} Xu từ nhiệm vụ.`);});await audit(u.id,'task:'+key,ref||day);
 }else if(action==='hubCheckin'){
  const token=required(b.qrToken,200),day=dayKey();const hub:any=(await rows('SELECT * FROM MarketHub WHERE qrToken=? AND active=1',token))[0];if(!hub||(hub.qrExpires&&hub.qrExpires<now()))fail('Mã QR HUB không hợp lệ hoặc đã hết hạn');await transaction(async tx=>{
   const inserted=await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketHubCheckin(id,userId,hubId,day,qrToken,reward,created) VALUES(?,?,?,?,?,?,?)',id(),u.id,hub.id,day,token,80,now());if(inserted!==1)fail('Tài khoản đã check-in HUB hôm nay');
   const profile:any=(await tx.$queryRawUnsafe('SELECT * FROM MarketProfile WHERE userId=?',u.id))[0];const streak=profile?.hubLast===previousDay(day)?(profile.hubStreak||0)+1:1;await tx.$executeRawUnsafe('UPDATE MarketProfile SET points=points+?,hubStreak=?,hubLast=? WHERE userId=?',80,streak,day,u.id);await tx.$executeRawUnsafe('INSERT INTO MarketLedger VALUES(?,?,?,?,?,?)',id(),u.id,`${u.id}:hub:${hub.id}:${day}`,80,'HUB_CHECKIN',now());await completeTask(tx,u.id,'hub_visit',day,1);await completeTask(tx,u.id,'hub_qr',day,1);
   let bonus=0;if(streak===7)bonus=500;if(streak===30)bonus=3000;if(bonus){await tx.$executeRawUnsafe('UPDATE MarketProfile SET points=points+? WHERE userId=?',bonus,u.id);await tx.$executeRawUnsafe('INSERT INTO MarketLedger VALUES(?,?,?,?,?,?)',id(),u.id,`${u.id}:hub-milestone:${hub.id}:${streak}:${day}`,bonus,'HUB_MILESTONE',now());}
   await notify(tx,u.id,'Check-in YWONDER HUB',`+80 Xu tại ${hub.name}${bonus?` và +${bonus} Xu mốc HUB`:''}.`);
  });await audit(u.id,'hub:checkin',hub.id);
 }else if(action==='luckySpin'){
  const day=dayKey();let reward=0;await transaction(async tx=>{
   const rewards=[0,10,20,30,50,80,100,200],weights=[8,22,22,18,14,8,6,2];let pick=randomInt(100),index=0;for(let i=0;i<weights.length;i++){if((pick-=weights[i])<0){index=i;break}}reward=rewards[index];
   const inserted=await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketLuckySpin(id,userId,day,reward,created) VALUES(?,?,?,?,?)',id(),u.id,day,reward,now());if(inserted!==1)fail('Bạn đã quay hôm nay. Hãy quay lại vào ngày mai');
   if(reward){await tx.$executeRawUnsafe('UPDATE MarketProfile SET points=points+? WHERE userId=?',reward,u.id);await tx.$executeRawUnsafe('INSERT INTO MarketLedger VALUES(?,?,?,?,?,?)',id(),u.id,`${u.id}:lucky-spin:${day}`,reward,'LUCKY_SPIN',now());}
   await notify(tx,u.id,'Vòng quay may mắn',reward?`Bạn nhận +${reward} Xu từ vòng quay hôm nay.`:'Chúc bạn may mắn lần sau!');
  });await audit(u.id,'luckySpin',day);return NextResponse.json({ok:true,reward});
 }else if(action==='redeemVoucher'){
  const campaignId=required(b.campaignId,100);await transaction(async tx=>{const c:any=(await tx.$queryRawUnsafe('SELECT * FROM MarketVoucherCampaign WHERE id=? AND active=1',campaignId))[0];if(!c||(c.starts&&c.starts>now())||(c.ends&&c.ends<now())||c.stock<1)fail('Voucher đã hết lượt hoặc chưa đến thời gian đổi');const count:any=(await tx.$queryRawUnsafe('SELECT COUNT(*) n FROM MarketVoucher WHERE campaignId=? AND userId=?',campaignId,u.id))[0];if(Number(count.n)>=c.perUser)fail('Bạn đã đạt giới hạn đổi voucher này');const profile:any=(await tx.$queryRawUnsafe('SELECT points FROM MarketProfile WHERE userId=?',u.id))[0];if(profile.points<c.pointsCost)fail('Không đủ Xu để đổi voucher');const voucherId=id(),code='YWV-'+randomBytes(5).toString('hex').toUpperCase();await tx.$executeRawUnsafe('UPDATE MarketVoucherCampaign SET stock=stock-1 WHERE id=? AND stock>0',campaignId);await tx.$executeRawUnsafe('UPDATE MarketProfile SET points=points-? WHERE userId=? AND points>=?',c.pointsCost,u.id,c.pointsCost);await tx.$executeRawUnsafe('INSERT INTO MarketVoucher VALUES(?,?,?,?,?,?,?,?,?,?)',voucherId,campaignId,u.id,code,'UNUSED',c.faceValue,c.ends||0,0,'',now());await tx.$executeRawUnsafe('INSERT INTO MarketLedger VALUES(?,?,?,?,?,?)',id(),u.id,`${u.id}:voucher:${voucherId}`,-c.pointsCost,'VOUCHER_REDEEM',now());await notify(tx,u.id,'Đổi voucher thành công',`Mã voucher của bạn: ${code}`);});await audit(u.id,'voucher:redeem',campaignId);
 }else if(action==='linkHub'){
  fail('Vui lòng đăng nhập YWonderHub và xác nhận liên kết tài khoản tại trang Hub');
 }else if(action==='ywbTransfer'){
  const result=await transaction(tx=>transferYwhToShop(tx,u.id,{amount:b.amount,requestId:b.requestId}),{timeout:15000});
  return NextResponse.json({ok:true,...result});
 }else if(action==='profile'){
  const fullName=required(b.fullName,100),phone=text(b.phone,30);if(phone&&!/^[+\d ()-]{8,20}$/.test(phone))fail('Số điện thoại không hợp lệ');
  const usernameInput=text(b.username,31),username=usernameInput?usernameValue(usernameInput):u.username;
  if(username&&username.toLowerCase()!==u.username?.toLowerCase()&&await usernameTaken(username,u.id))fail('Tên đăng nhập đã được sử dụng');
  await db.user.update({where:{id:u.id},data:{fullName,phone:phone||null,...(usernameInput?{username}:{})}});
  const street=text(b.street,200),provinceCode=text(b.provinceCode,10),provinceName=text(b.provinceName,160),wardCode=text(b.wardCode,10),wardName=text(b.wardName,160),zipCode=text(b.zipCode,10),addressDetail=text(b.addressDetail,500),address=composeAddress(b)||text(b.address,500);
  await run('INSERT INTO MarketProfile(userId,address,street,provinceCode,provinceName,wardCode,wardName,zipCode,addressDetail) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(userId) DO UPDATE SET address=excluded.address,street=excluded.street,provinceCode=excluded.provinceCode,provinceName=excluded.provinceName,wardCode=excluded.wardCode,wardName=excluded.wardName,zipCode=excluded.zipCode,addressDetail=excluded.addressDetail',u.id,address,street,provinceCode,provinceName,wardCode,wardName,zipCode,addressDetail);
 }else if(action==='preferences'){
  const valid=await rows('SELECT id FROM MarketCategory');const interests=Array.isArray(b.interests)?b.interests.filter((s:any)=>valid.some(c=>c.id===s)).slice(0,16):[];
  await run('INSERT INTO MarketProfile(userId,interests,notifications) VALUES(?,?,?) ON CONFLICT(userId) DO UPDATE SET interests=excluded.interests,notifications=excluded.notifications',u.id,JSON.stringify(interests),b.notifications?1:0);
 }else if(action==='password'){
  await limit('password:'+u.id,8);if(!u.passwordHash||!await bcrypt.compare(required(b.currentPassword,200),u.passwordHash))fail('Mật khẩu hiện tại không đúng');
  const password=required(b.password,200);if(password.length<10)fail('Mật khẩu mới phải có ít nhất 10 ký tự');
  if(u.twoFaSecret&&!totp(u.twoFaSecret,text(b.otp,6)))fail('Mã xác thực 2 bước không hợp lệ');
  await transaction(async tx=>{await tx.user.update({where:{id:u.id},data:{passwordHash:await bcrypt.hash(password,12)}});await tx.$executeRawUnsafe('DELETE FROM MarketSession WHERE userId=?',u.id);await notify(tx,u.id,'Đổi mật khẩu thành công','Các phiên đăng nhập cửa hàng trước đó đã kết thúc.');});await session(u.id);
 }else if(action==='revokeSessions'){
  await run('DELETE FROM MarketSession WHERE userId=? AND token<>?',u.id,hash(cookies().get(COOKIE)?.value||''));
 }else if(action==='favorite'){
  const productId=required(b.productId,100);if(!(await rows('SELECT id FROM MarketProduct WHERE id=? AND active=1',productId)).length)fail('Sản phẩm không tồn tại');if(b.liked&&productId===PHONG_CHAU_COMBO_PRODUCT_ID&&!await canSeePhongChauCombo(u))fail('Sản phẩm không tồn tại');
  if(b.liked)await run('INSERT OR IGNORE INTO MarketFavorite VALUES(?,?)',u.id,productId);else await run('DELETE FROM MarketFavorite WHERE userId=? AND productId=?',u.id,productId);
 }else if(action==='readNotifications'){await run('UPDATE MarketNotification SET seen=1 WHERE userId=?',u.id);
 }else if(action==='store'){
  await transaction(async tx=>{
   const existing=(await tx.$queryRawUnsafe('SELECT * FROM MarketStore WHERE userId=?',u.id))[0];if(existing&&existing.status!=='REJECTED'&&!(existing.status==='PENDING'&&!existing.businessLicenseImage))fail('Hồ sơ gian hàng đã được gửi');
   const values=[required(b.name,150),required(b.phone,30),required(b.address,500),required(b.taxCode,40),imageURL(b.businessLicenseImage),text(b.description,2000)];if(!values[4])fail('Vui lòng tải ảnh đăng ký kinh doanh');decodeDocument(values[4]);
   const sid=existing?.id||id();
   if(existing)await tx.$executeRawUnsafe("UPDATE MarketStore SET name=?,phone=?,address=?,taxCode=?,businessLicenseImage=?,description=?,status='PENDING' WHERE id=?",...values,sid);
   else await tx.$executeRawUnsafe('INSERT INTO MarketStore(id,userId,name,phone,address,taxCode,businessLicenseImage,description,created,affiliateReferrerId) VALUES(?,?,?,?,?,?,?,?,?,?)',sid,u.id,...values,now(),u.referredById||null);
   await saveSeller(tx,u,sid,b);
  },{timeout:15000});
 }else if(action==='product'){
  await transaction(async tx=>{
   const store=(await tx.$queryRawUnsafe("SELECT * FROM MarketStore WHERE userId=? AND status='APPROVED'",u.id))[0];if(!admin(u)&&!store)fail('Gian hàng phải được admin duyệt trước khi thêm sản phẩm');if(!admin(u))draftSaved=!await sellerAgreementReady(tx,u);
   const productId=text(b.id,100)||id(),existing=(await tx.$queryRawUnsafe('SELECT * FROM MarketProduct WHERE id=?',productId))[0];
   if(existing?.active===-1)fail('Sản phẩm đã xóa không thể chỉnh sửa');
   if(existing&&!admin(u)&&existing.storeId!==store.id)fail('Bạn không có quyền sửa sản phẩm này');
   if(draftSaved&&existing?.active)fail('Hồ sơ pháp lý đang chờ duyệt. Bạn có thể thêm sản phẩm mới dưới dạng bản nháp, nhưng chưa thể sửa sản phẩm đang bán.');
   const categoryId=required(b.categoryId,100),cat=(await tx.$queryRawUnsafe('SELECT id,name FROM MarketCategory WHERE id=? AND active=1',categoryId))[0];if(!cat)fail('Danh mục không hợp lệ');
   const storeId=admin(u)?(text(b.storeId,100)||null):store.id;if(storeId&&!(await tx.$queryRawUnsafe("SELECT id FROM MarketStore WHERE id=? AND status='APPROVED'",storeId)).length)fail('Gian hàng không hợp lệ');
   const sku=(text(b.sku,80).trim().toUpperCase()||`YW-${productId.slice(0,12).toUpperCase()}`).replace(/\s+/g,'-');if(!/^[A-Z0-9][A-Z0-9._-]{2,79}$/.test(sku))fail('Mã sản phẩm chỉ được dùng chữ, số, dấu chấm, gạch ngang hoặc gạch dưới');if((await tx.$queryRawUnsafe('SELECT id FROM MarketProduct WHERE sku=? AND id<>?',sku,productId)).length)fail('Mã sản phẩm đã tồn tại');
   let images:string[]=[];
   if(b.imagesJson!==undefined){let parsed:any;try{parsed=JSON.parse(String(b.imagesJson))}catch{fail('Danh sách ảnh sản phẩm không hợp lệ')}if(!Array.isArray(parsed)||parsed.length>4)fail('Mỗi sản phẩm được đăng tối đa 4 ảnh');images=parsed.map(imageURL).filter(Boolean);if(new Set(images).size!==images.length)fail('Ảnh sản phẩm bị trùng');}
   else if(b.image)images=[imageURL(b.image)];
   else if(existing?.imagesJson){try{images=JSON.parse(existing.imagesJson)}catch{}if(!Array.isArray(images))images=[];}
   if(!images.length&&existing?.image)images=[existing.image];
   const specs=Object.fromEntries(PRODUCT_SPEC_FIELDS.map(({key})=>[key,text(b['spec_'+key],key==='usage'||key==='storage'?2000:300)]).filter(([,value])=>!!value));
   const price=integer(b.price,1),compareAtPrice=b.compareAtPrice?integer(b.compareAtPrice,price):0;
   const values=[storeId,categoryId,required(b.name,180),sku,text(b.description,10000),price,integer(b.stock,0,1000000),images[0]||'',admin(u)?(b.active?1:0):draftSaved?0:1,JSON.stringify(images),JSON.stringify(specs),compareAtPrice];
   if(existing)await tx.$executeRawUnsafe('UPDATE MarketProduct SET storeId=?,categoryId=?,name=?,sku=?,description=?,price=?,stock=?,image=?,active=?,imagesJson=?,specsJson=?,compareAtPrice=? WHERE id=?',...values,productId);
   else await tx.$executeRawUnsafe('INSERT INTO MarketProduct(id,storeId,categoryId,name,sku,description,price,stock,image,active,imagesJson,specsJson,compareAtPrice,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',productId,...values,now());
   await saveProductLegal(tx,u,productId,cat.name,b,{draftOnly:draftSaved});await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',id(),u.id,draftSaved?'product:draft':'product',productId,now());
  },{timeout:15000});
 }else if(action==='deleteProduct'){
  const productId=required(b.id,100);
  await transaction(tx=>deleteMarketProduct(tx,productId,u.id,admin(u)),{timeout:15000});
 }else if(action==='checkout'){
  const requestId=required(b.requestId,100);const name=required(b.name,100),phone=required(b.phone,30);if(!/^[+\d ()-]{8,20}$/.test(phone))fail('Số điện thoại không hợp lệ');
  const paymentMethod=b.paymentMethod===undefined?'COD':required(b.paymentMethod,10);if(!['COD','BANK'].includes(paymentMethod))fail('Phương thức thanh toán không hợp lệ');
  let paymentBank:any=(await readPolicies()).bank;
  if(!Array.isArray(b.items)||!b.items.length||b.items.length>50)fail('Giỏ hàng không hợp lệ');
  const items=new Map<string,number>();for(const item of b.items){const key=required(item.productId,100);items.set(key,integer((items.get(key)||0)+integer(item.quantity,1,99),1,99));}
  const comboOrder=items.has(PHONG_CHAU_COMBO_PRODUCT_ID);
  if(comboOrder&&items.size!==1)fail('Vui lòng đặt combo affiliate Phong Châu riêng, không ghép với hàng cần giao');
  if(comboOrder&&paymentMethod!=='BANK')fail('Combo affiliate Phong Châu chỉ thanh toán chuyển khoản, không giao hàng thu tiền');
  if(comboOrder&&(text(b.code,80)||Number(b.points||0)||Number(b.ywb||0)))fail('Combo affiliate cần thanh toán đủ giá trị để xét điều kiện F1; không áp dụng voucher, Xu hoặc YWH');
  const address=comboOrder?'Không áp dụng giao hàng':required(composeAddress(b)||text(b.address,500));
  const cfg=await settings();const orderResult=await transaction(async tx=>{
   const prior:any[]=await tx.$queryRawUnsafe('SELECT id FROM MarketOrder WHERE userId=? AND requestId=?',u.id,requestId);if(prior.length)return prior[0].id;
   const accepted=await acceptLegal(tx,u,'BUYER',b.buyerTermsVersion,b.acceptBuyerTerms);
   const priced:any[]=[];let subtotal=0;
   for(const [pid,qty] of Array.from(items.entries())){const data:any[]=await tx.$queryRawUnsafe("SELECT p.*,s.feeBps,s.name storeName,s.userId storeUserId,c.name categoryName FROM MarketProduct p JOIN MarketCategory c ON c.id=p.categoryId LEFT JOIN MarketStore s ON s.id=p.storeId WHERE p.id=? AND p.active=1 AND c.active=1 AND (p.storeId IS NULL OR s.status='APPROVED')",pid);const p=data[0];if(!p||p.stock<qty)fail('Sản phẩm hết hàng hoặc không còn bán');if(p.id===PHONG_CHAU_COMBO_PRODUCT_ID&&(p.storeId!==PHONG_CHAU_STORE_ID||!await canSeePhongChauCombo(u,tx.$queryRawUnsafe.bind(tx))))fail('Sản phẩm COMBO chỉ dành cho F1 được gian hàng chọn');const legal=(await attachProductLegal([p],tx))[0].legal;const regulated=defaultProductKind(p.categoryName)!=='NONE'||legal&&legal.kind!=='NONE';if(regulated&&(!legal||legal.kind==='NONE'||legal.status!=='APPROVED'||!legal.hasDocument))fail('Sản phẩm chưa đủ hồ sơ chuyên ngành để đặt mua');subtotal+=p.price*qty;priced.push({...p,legal,quantity:qty});}
   if(subtotal>1000000000)fail('Giá trị đơn hàng vượt giới hạn');
   const byStore=new Map<string,any[]>();for(const p of priced){const key=p.storeId||'PLATFORM';byStore.set(key,[...(byStore.get(key)||[]),p]);}
   const quote=b.shippingQuote?verifyCheckoutQuote(u.id,b,priced):null;
   const quotedShipping=async(storeId:string,gross:number,net:number)=>{
    if(comboOrder){const line=quote?.lines?.[0];if(!line||quote.lines.length!==1||line.storeId!==storeId||line.provider!=='NONE'||line.fee!==0||line.gross!==gross||line.net!==net)fail('Vui lòng tính lại tổng tiền combo trước khi đặt');return {fee:0,provider:'NONE' as const,parcel:null}}
     if(!quote)return {fee:cfg.shipping,provider:'FIXED' as const,parcel:null};
    const line=quote.lines.find(line=>line.storeId===storeId);
     if(!line||line.gross!==gross||line.net!==net||line.provider!=='FIXED'||line.fee!==cfg.shipping)fail('Báo giá giao hàng đã thay đổi. Vui lòng tính lại phí');
     return {fee:line.fee,provider:'FIXED' as const,parcel:null};
   };
   if(quote&&(quote.lines.length!==byStore.size||quote.lines.reduce((sum,line)=>sum+line.net+line.fee,0)>1000000000))fail('Báo giá giao hàng không hợp lệ');
   if(byStore.size>1){
    if(!/^[a-f0-9-]{36}$/i.test(requestId))fail('Mã đặt hàng không hợp lệ');
    const priorGroups=await tx.$queryRawUnsafe('SELECT id FROM MarketOrder WHERE userId=? AND requestId LIKE ? ORDER BY created',u.id,requestId+'~%');
    if(priorGroups.length)return priorGroups.map((row:any)=>row.id);
    if(Number(b.points||0)||Number(b.ywb||0))fail('Giỏ nhiều gian hàng chưa hỗ trợ dùng Xu hoặc YWH. Vui lòng bỏ lựa chọn này để Shop tự tách đơn.');
    const enteredCode=text(b.code,80).toUpperCase();let promotionDiscount=0;
    if(enteredCode){
     if((await tx.$queryRawUnsafe("SELECT id FROM MarketVoucher WHERE code=? AND userId=? AND status='UNUSED'",enteredCode,u.id)).length)fail('Voucher chỉ dùng cho đơn một gian hàng. Vui lòng bỏ voucher để Shop tự tách đơn.');
     const coupon=(await tx.$queryRawUnsafe("SELECT discountBps FROM MarketContent WHERE type='promotion' AND code=? AND active=1 AND (starts=0 OR starts<=?) AND (ends=0 OR ends>=?)",enteredCode,now(),now()))[0];
     if(!coupon)fail('Mã khuyến mãi không hợp lệ hoặc đã hết hạn');promotionDiscount=Math.floor(subtotal*Number(coupon.discountBps)/10000);
    }
    const groups=[...byStore.entries()].map(([storeId,products])=>({storeId,products,gross:products.reduce((sum,p)=>sum+p.price*p.quantity,0)}));
    const discounts=allocateDiscounts(groups.map(group=>group.gross),promotionDiscount),orderIds:string[]=[];
    const productReferral=readProductReferralToken(b.productReferralToken);
    for(let index=0;index<groups.length;index++){
     const group=groups[index],groupDiscount=discounts[index],net=group.gross-groupDiscount,deliveryQuote=await quotedShipping(group.storeId,group.gross,net),total=net+deliveryQuote.fee,oid=id();
     const bank:any=group.storeId==='PLATFORM'?paymentBank:(await tx.$queryRawUnsafe('SELECT bankName,bankCode,bankAccount accountNumber,accountName,qrImage FROM MarketStoreBankAccount WHERE storeId=?',group.storeId))[0];
     if(paymentMethod==='BANK'&&(total<=0||!bank||!/^\d{4,40}$/.test(bank.accountNumber)||!bank.bankName||!bank.accountName||!bank.bankCode&&!bank.qrImage))fail('Một gian hàng chưa cấu hình tài khoản và QR thanh toán. Vui lòng chọn thanh toán khi nhận hàng.');
     const rewardPoints=Math.floor(net*cfg.rewardBps/10000/cfg.pointValue);
     await tx.$executeRawUnsafe('INSERT INTO MarketOrder(id,userId,requestId,total,discount,shipping,rewardPoints,redeemed,name,phone,address,note,created,ywbUsed,voucherId) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',oid,u.id,requestId+'~'+group.storeId,total,groupDiscount,deliveryQuote.fee,rewardPoints,0,name,phone,address,text(b.note,1000),now(),0,'');
     if(paymentMethod==='BANK')await tx.$executeRawUnsafe('INSERT INTO MarketOrderBankPayment(orderId,bankName,bankCode,accountNumber,accountName,amountVnd,transferMemo,created,qrImage,storeId) VALUES(?,?,?,?,?,?,?,?,?,?)',oid,bank.bankName,bank.bankCode||'',bank.accountNumber,bank.accountName,total,transferMemo(oid),now(),bank.qrImage||'',group.storeId==='PLATFORM'?'':group.storeId);
     await tx.$executeRawUnsafe('INSERT INTO MarketOrderDisclosure VALUES(?,?,?,?)',oid,accepted.version,JSON.stringify({terms:accepted.snapshot,items:group.products.map(p=>({id:p.id,name:p.name,sku:p.sku,storeId:p.storeId,storeName:p.storeName||'YWonderShop',quantity:p.quantity,price:p.price,legal:p.legal})),subtotal:group.gross,discount:groupDiscount,pointDiscount:0,ywbDiscount:0,shipping:deliveryQuote.fee,shippingProvider:deliveryQuote.provider,shippingParcel:deliveryQuote.parcel,total,payment:paymentMethod==='BANK'?'Chuyển khoản ngân hàng':'Thanh toán khi nhận hàng',paymentBank:paymentMethod==='BANK'?{bankName:bank.bankName,bankCode:bank.bankCode,accountNumber:bank.accountNumber,accountName:bank.accountName}:undefined,paymentMemo:paymentMethod==='BANK'?transferMemo(oid):undefined,delivery:{name,phone,address,wardName:text(b.wardName,160),provinceName:text(b.provinceName,160),wardCode:text(b.wardCode,10),provinceCode:text(b.provinceCode,10)}}),now());
     const perItem=allocateDiscounts(group.products.map(p=>p.price*p.quantity),groupDiscount);
     for(let i=0;i<group.products.length;i++){const p=group.products[i],itemNet=p.price*p.quantity-perItem[i],feeBps=await effectiveFee(tx,p.storeId||'',p.feeBps??cfg.feeBps),fee=p.storeId?Math.floor(itemNet*feeBps/10000):0;
      if(await tx.$executeRawUnsafe('UPDATE MarketProduct SET stock=stock-? WHERE id=? AND stock>=?',p.quantity,p.id,p.quantity)!==1)fail('Số lượng tồn kho vừa thay đổi');
      await tx.$executeRawUnsafe('INSERT INTO MarketOrderItem VALUES(?,?,?,?,?,?,?,?,?,?,?)',id(),oid,p.id,p.storeId,p.name,p.quantity,p.price,itemNet,feeBps,fee,itemNet-fee);
     }
     const referralCode=productReferral&&group.products.some(p=>p.id===productReferral.productId&&p.id===PHONG_CHAU_COMBO_PRODUCT_ID&&p.storeId===PHONG_CHAU_STORE_ID)?productReferral.refCode:'';
     await captureAffiliateOrder(tx,oid,u.id,referralCode,text(b.refCode,120));
     await notify(tx,u.id,'Đặt hàng thành công',`Đơn #${oid.slice(0,8)} của ${group.products[0].storeName||'YWonderShop'} đã được tạo riêng. ${paymentMethod==='BANK'?'Xem QR và chuyển đúng số tiền trong Đơn hàng của tôi.':'Gian hàng sẽ xác nhận đơn.'}`);
     if(group.products[0].storeUserId)await notify(tx,group.products[0].storeUserId,'Có đơn hàng mới',`Đơn #${oid.slice(0,8)} đang chờ gian hàng kiểm tra và duyệt.`);
     orderIds.push(oid);
    }
    return orderIds;
   }
   if(priced[0].storeId)paymentBank=(await tx.$queryRawUnsafe('SELECT bankName,bankCode,bankAccount accountNumber,accountName,qrImage FROM MarketStoreBankAccount WHERE storeId=?',priced[0].storeId))[0];
   let discount=0,voucherDiscount=0,voucherId='';const enteredCode=text(b.code,80).toUpperCase();if(enteredCode){const own:any[] = await tx.$queryRawUnsafe("SELECT * FROM MarketVoucher WHERE code=? AND userId=? AND status='UNUSED'",enteredCode,u.id);if(own.length){const v=own[0];if(v.expires&&v.expires<now())fail('Voucher đã hết hạn');voucherDiscount=Math.min(v.faceValue,subtotal);voucherId=v.id;}else{const coupons:any[]=await tx.$queryRawUnsafe("SELECT * FROM MarketContent WHERE type='promotion' AND code=? AND active=1 AND (starts=0 OR starts<=?) AND (ends=0 OR ends>=?)",enteredCode,now(),now());if(!coupons.length)fail('Mã khuyến mãi không hợp lệ hoặc đã hết hạn');discount=Math.floor(subtotal*coupons[0].discountBps/10000);}}
   await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketProfile(userId) VALUES(?)',u.id);
   const profiles:any[]=await tx.$queryRawUnsafe('SELECT points,ywbBalance FROM MarketProfile WHERE userId=?',u.id);const redeemed=integer(b.points||0,0,profiles[0].points);if(redeemed&&cfg.xuEnabled===false)fail('Xu đang tắt');if(redeemed&&b.ywb&&Number(b.ywb)>0&&!cfg.allowXuWithYwb)fail('Không được kết hợp Xu và YWH theo cấu hình');if(voucherId&&b.ywb&&Number(b.ywb)>0&&!cfg.allowVoucherWithYwb)fail('Không được kết hợp voucher và YWH theo cấu hình');const pointDiscount=redeemed*cfg.pointValue;if(pointDiscount>subtotal-discount-voucherDiscount)fail('Xu sử dụng vượt giá trị tiền hàng');const ywbUsed=integer(b.ywb||0,0,100000000);if(ywbUsed){if(!cfg.ywbEnabled||!cfg.ywbToVnd)fail('YWH chưa được bật hoặc chưa có tỷ lệ sử dụng');if(ywbUsed>profiles[0].ywbBalance)fail('Số dư YWH không đủ');if(ywbUsed*cfg.ywbToVnd>subtotal-discount-voucherDiscount-pointDiscount)fail('YWH sử dụng vượt giá trị tiền hàng');}
   const ywbDiscount=ywbUsed*cfg.ywbToVnd;const deliveryQuote=await quotedShipping(priced[0].storeId||'PLATFORM',subtotal,subtotal-discount-voucherDiscount-pointDiscount-ywbDiscount);const total=subtotal-discount-voucherDiscount-pointDiscount-ywbDiscount+deliveryQuote.fee;const rewardPoints=Math.floor((subtotal-discount-voucherDiscount-pointDiscount-ywbDiscount)*cfg.rewardBps/10000/cfg.pointValue);const oid=id();
   if(paymentMethod==='BANK'&&(total<=0||!paymentBank||!/^\d{4,40}$/.test(paymentBank.accountNumber)||!paymentBank.bankName||!paymentBank.accountName||!paymentBank.bankCode&&!paymentBank.qrImage))fail('Tài khoản chuyển khoản chưa được cấu hình hoặc đơn không còn số tiền cần thanh toán');
   await tx.$executeRawUnsafe('INSERT INTO MarketOrder(id,userId,requestId,total,discount,shipping,rewardPoints,redeemed,name,phone,address,note,created,ywbUsed,voucherId) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',oid,u.id,requestId,total,discount+voucherDiscount+pointDiscount+ywbDiscount,deliveryQuote.fee,rewardPoints,redeemed,name,phone,address,text(b.note,1000),now(),ywbUsed,voucherId);
   if(paymentMethod==='BANK')await tx.$executeRawUnsafe('INSERT INTO MarketOrderBankPayment(orderId,bankName,bankCode,accountNumber,accountName,amountVnd,transferMemo,created,qrImage,storeId) VALUES(?,?,?,?,?,?,?,?,?,?)',oid,paymentBank.bankName,paymentBank.bankCode||'',paymentBank.accountNumber,paymentBank.accountName,total,transferMemo(oid),now(),paymentBank.qrImage||'',priced[0].storeId||'');
   await tx.$executeRawUnsafe('INSERT INTO MarketOrderDisclosure VALUES(?,?,?,?)',oid,accepted.version,JSON.stringify({terms:accepted.snapshot,items:priced.map(p=>({id:p.id,name:p.name,sku:p.sku,storeId:p.storeId,storeName:p.storeName||'YWonderShop',quantity:p.quantity,price:p.price,legal:p.legal})),subtotal,discount:discount+voucherDiscount,pointDiscount,ywbDiscount,shipping:deliveryQuote.fee,shippingProvider:deliveryQuote.provider,shippingParcel:deliveryQuote.parcel,total,payment:paymentMethod==='BANK'?'Chuyển khoản VietQR / ngân hàng':'Thanh toán khi nhận hàng',paymentBank:paymentMethod==='BANK'?{bankName:paymentBank.bankName,bankCode:paymentBank.bankCode,accountNumber:paymentBank.accountNumber,accountName:paymentBank.accountName}:undefined,paymentMemo:paymentMethod==='BANK'?transferMemo(oid):undefined,delivery:{name,phone,address,wardName:text(b.wardName,160),provinceName:text(b.provinceName,160),wardCode:text(b.wardCode,10),provinceCode:text(b.provinceCode,10)}}),now());
   if(redeemed){const changed=await tx.$executeRawUnsafe('UPDATE MarketProfile SET points=points-? WHERE userId=? AND points>=?',redeemed,u.id,redeemed);if(changed!==1)fail('Số dư Xu đã thay đổi');await tx.$executeRawUnsafe('INSERT INTO MarketLedger VALUES(?,?,?,?,?,?)',id(),u.id,oid,-redeemed,'REDEEM',now());}
   if(ywbUsed){const changed=await tx.$executeRawUnsafe('UPDATE MarketProfile SET ywbBalance=ywbBalance-? WHERE userId=? AND ywbBalance>=?',ywbUsed,u.id,ywbUsed);if(changed!==1)fail('Số dư YWH đã thay đổi');await tx.$executeRawUnsafe('INSERT INTO MarketLedger VALUES(?,?,?,?,?,?)',id(),u.id,oid,-ywbUsed,'YWB_USE',now());}
   if(voucherId)await tx.$executeRawUnsafe("UPDATE MarketVoucher SET status='USED',usedAt=?,orderId=? WHERE id=? AND status='UNUSED'",now(),oid,voucherId);
   const itemDiscounts=allocateDiscounts(priced.map(p=>p.price*p.quantity),discount+voucherDiscount+pointDiscount+ywbDiscount);
   for(let i=0;i<priced.length;i++){const p=priced[i];const gross=p.price*p.quantity;const d=itemDiscounts[i];const net=gross-d;const feeBps=await effectiveFee(tx,p.storeId||'',p.feeBps??cfg.feeBps);const fee=p.storeId?Math.floor(net*feeBps/10000):0;
    const changed=await tx.$executeRawUnsafe('UPDATE MarketProduct SET stock=stock-? WHERE id=? AND stock>=?',p.quantity,p.id,p.quantity);if(changed!==1)fail('Số lượng tồn kho vừa thay đổi');
    await tx.$executeRawUnsafe('INSERT INTO MarketOrderItem VALUES(?,?,?,?,?,?,?,?,?,?,?)',id(),oid,p.id,p.storeId,p.name,p.quantity,p.price,net,feeBps,fee,net-fee);
   }
   const productReferral=readProductReferralToken(b.productReferralToken);
   const referralCode=productReferral&&priced.some(p=>p.id===productReferral.productId&&p.id===PHONG_CHAU_COMBO_PRODUCT_ID&&p.storeId===PHONG_CHAU_STORE_ID)?productReferral.refCode:'';
   await captureAffiliateOrder(tx,oid,u.id,referralCode,text(b.refCode,120));
   await notify(tx,u.id,'Đặt hàng thành công',paymentMethod==='BANK'?'Đơn '+oid.slice(0,8)+' đang chờ chuyển khoản và đối soát. Xem QR trong Đơn hàng của tôi.':'Đơn '+oid.slice(0,8)+' đang chờ xác nhận. Thanh toán khi nhận hàng.');if(priced[0].storeUserId)await notify(tx,priced[0].storeUserId,'Có đơn hàng mới','Đơn #'+oid.slice(0,8)+' đang chờ gian hàng kiểm tra và duyệt.');return oid;
  },{timeout:30000});return NextResponse.json({ok:true,...(Array.isArray(orderResult)?{orderIds:orderResult}:{orderId:orderResult})});
 }else if(action==='approveOrder'){
  if(!admin(u))return NextResponse.json({error:'Chỉ quản trị viên được duyệt đơn hàng'},{status:403});
  const oid=required(b.id,100);
  await transaction(async tx=>{
   const order=(await tx.$queryRawUnsafe('SELECT * FROM MarketOrder WHERE id=?',oid))[0];
   if(!order||order.status!=='PENDING')fail('Đơn không còn chờ duyệt');
   if((await tx.$queryRawUnsafe('SELECT 1 FROM MarketOrderItem WHERE orderId=? AND productId=?',oid,PHONG_CHAU_COMBO_PRODUCT_ID)).length)fail('Đơn COMBO do gian hàng Phong Châu xác nhận trực tiếp');
   const bank=(await tx.$queryRawUnsafe('SELECT status,amountVnd FROM MarketOrderBankPayment WHERE orderId=?',oid))[0];
   if(bank){
    if(Number(bank.amountVnd)!==Number(order.total))fail('Số tiền chuyển khoản không khớp giá trị đơn hàng');
    if(!['AWAITING','VERIFIED'].includes(bank.status))fail('Thanh toán không còn chờ đối soát');
    if(bank.status==='AWAITING'){
     const updated=await tx.$executeRawUnsafe("UPDATE MarketOrderBankPayment SET status='VERIFIED',verifiedBy=?,verifiedAt=? WHERE orderId=? AND status='AWAITING'",u.id,now(),oid);
     if(updated!==1)fail('Thanh toán vừa được cập nhật');
    }
   }
   const updated=await tx.$executeRawUnsafe("UPDATE MarketOrder SET status='CONFIRMED' WHERE id=? AND status='PENDING'",oid);
   if(updated!==1)fail('Đơn hàng vừa được cập nhật');
   const items=await tx.$queryRawUnsafe('SELECT * FROM MarketOrderItem WHERE orderId=?',oid);
   await accrueAffiliateOrder(tx,order,items);
   await notify(tx,order.userId,'Đơn hàng đã được duyệt','Đơn '+oid.slice(0,8)+' đã được quản trị viên xác nhận và đang chờ xử lý.');
   await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',id(),u.id,bank?'order:manual-bank-approved':'order:approved',oid,now());
  },{timeout:15000});
 }else if(action==='confirmBankPayment'){
  if(!admin(u))return NextResponse.json({error:'Chỉ quản trị viên được đối soát chuyển khoản'},{status:403});
  const oid=required(b.id,100),reference=required(b.reference,160);
  if(b.confirmed!==true)fail('Cần xác nhận đã kiểm tra tiền thực nhận trên sao kê ngân hàng');
  const result=await transaction(async tx=>{
   const payment=(await tx.$queryRawUnsafe('SELECT p.*,o.userId,o.status orderStatus,o.total FROM MarketOrderBankPayment p JOIN MarketOrder o ON o.id=p.orderId WHERE p.orderId=?',oid))[0];
   if(!payment)fail('Đơn không dùng chuyển khoản ngân hàng');
   if(payment.status==='VERIFIED'&&payment.reference===reference)return {alreadyVerified:true};
   if(payment.status!=='AWAITING'||payment.orderStatus!=='PENDING')fail('Đơn hoặc thanh toán đã thay đổi');
   if(Number(payment.amountVnd)!==Number(payment.total))fail('Số tiền thanh toán không khớp đơn hàng');
   if((await tx.$queryRawUnsafe('SELECT orderId FROM MarketOrderBankPayment WHERE reference=? AND orderId<>?',reference,oid)).length)fail('Mã giao dịch đã dùng cho đơn khác');
   const stamp=now(),changed=await tx.$executeRawUnsafe("UPDATE MarketOrderBankPayment SET status='VERIFIED',reference=?,verifiedBy=?,verifiedAt=? WHERE orderId=? AND status='AWAITING'",reference,u.id,stamp,oid);
   if(changed!==1)fail('Thanh toán vừa thay đổi');
   await notify(tx,payment.userId,'Đã xác nhận chuyển khoản','Đơn '+oid.slice(0,8)+' đã được đối soát '+Number(payment.amountVnd).toLocaleString('vi-VN')+'₫ và đang chờ xử lý.');
   await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',id(),u.id,'order:bank-verified',oid,stamp);
   return {alreadyVerified:false};
  },{timeout:15000});return NextResponse.json({ok:true,...result});
 }else if(action==='orderStatus'||action==='cancelOrder'){
  const oid=required(b.id,100),status=action==='cancelOrder'?'CANCELLED':required(b.status,30);
  await transaction(async tx=>{const data:any[]=await tx.$queryRawUnsafe('SELECT * FROM MarketOrder WHERE id=?',oid);const o=data[0];
   const sellerOwnsAll=!admin(u)&&action==='orderStatus'&&['SHIPPED','COMPLETED'].includes(status)&&!!(await tx.$queryRawUnsafe("SELECT 1 FROM MarketOrderItem i JOIN MarketStore s ON s.id=i.storeId WHERE i.orderId=? AND s.userId=? AND s.status='APPROVED' AND NOT EXISTS(SELECT 1 FROM MarketOrderItem x WHERE x.orderId=i.orderId AND (x.storeId IS NULL OR x.storeId<>s.id)) LIMIT 1",oid,u.id))[0];
   if(!o||(!admin(u)&&!sellerOwnsAll&&o.userId!==u.id))fail('Không tìm thấy đơn hàng');
   if(action==='orderStatus'&&!admin(u)&&!sellerOwnsAll)fail('Không có quyền xử lý đơn hàng');
   const bank=(await tx.$queryRawUnsafe('SELECT status FROM MarketOrderBankPayment WHERE orderId=?',oid))[0];
   if(bank&&status==='CONFIRMED'&&bank.status!=='VERIFIED')fail('Cần đối soát tiền chuyển khoản trước khi xác nhận đơn');
   if(bank&&status==='COMPLETED'&&bank.status!=='VERIFIED')fail('Đơn chuyển khoản chưa được đối soát');
   if(bank&&status==='CANCELLED'&&bank.status==='VERIFIED')fail('Đơn đã nhận tiền; cần xử lý hoàn tiền trước khi hủy');
   if(status==='CANCELLED'&&(await tx.$queryRawUnsafe("SELECT 1 FROM MarketGhnShipment WHERE orderId=? AND status='CREATED' AND ghnStatus NOT IN ('cancel','returned')",oid)).length)fail('Đơn đã có vận đơn từ trước. Hãy hoàn tất hoặc hủy với đơn vị vận chuyển trước khi hủy đơn Shop');
   const comboOnly=!!(await tx.$queryRawUnsafe('SELECT 1 FROM MarketOrderItem i WHERE i.orderId=? AND i.productId=? AND NOT EXISTS(SELECT 1 FROM MarketOrderItem x WHERE x.orderId=i.orderId AND x.productId<>?) LIMIT 1',oid,PHONG_CHAU_COMBO_PRODUCT_ID,PHONG_CHAU_COMBO_PRODUCT_ID))[0];
   if(comboOnly&&status==='CONFIRMED')fail('Đơn COMBO được ghi nhận khi gian hàng Phong Châu xác nhận');
   if(comboOnly&&status==='COMPLETED'&&!sellerOwnsAll)fail('Đơn COMBO do gian hàng Phong Châu xác nhận');
   const transitions:any={PENDING:['CONFIRMED','CANCELLED'],CONFIRMED:comboOnly?['COMPLETED','CANCELLED']:['SHIPPED','CANCELLED'],SHIPPED:['COMPLETED']};if(!transitions[o.status]?.includes(status)||(!admin(u)&&!sellerOwnsAll&&o.status!=='PENDING'))fail('Không thể chuyển trạng thái đơn hàng');
   const changed=await tx.$executeRawUnsafe('UPDATE MarketOrder SET status=? WHERE id=? AND status=?',status,oid,o.status);if(changed!==1)fail('Đơn hàng vừa được cập nhật');
   const items:any[]=await tx.$queryRawUnsafe('SELECT * FROM MarketOrderItem WHERE orderId=?',oid);
   if(status==='CONFIRMED')await accrueAffiliateOrder(tx,o,items);
   if(status==='CANCELLED'){await voidUnpaidAffiliateOrder(tx,oid,u.id);if(bank)await tx.$executeRawUnsafe("UPDATE MarketOrderBankPayment SET status='CANCELLED' WHERE orderId=? AND status='AWAITING'",oid);for(const item of items)await tx.$executeRawUnsafe('UPDATE MarketProduct SET stock=stock+? WHERE id=?',item.quantity,item.productId);if(o.redeemed){await tx.$executeRawUnsafe('UPDATE MarketProfile SET points=points+? WHERE userId=?',o.redeemed,o.userId);await tx.$executeRawUnsafe('INSERT INTO MarketLedger VALUES(?,?,?,?,?,?)',id(),o.userId,oid,o.redeemed,'REFUND',now());}if(o.ywbUsed){await tx.$executeRawUnsafe('UPDATE MarketProfile SET ywbBalance=ywbBalance+? WHERE userId=?',o.ywbUsed,o.userId);await tx.$executeRawUnsafe('INSERT INTO MarketLedger VALUES(?,?,?,?,?,?)',id(),o.userId,oid,o.ywbUsed,'YWB_REFUND',now());}if(o.voucherId)await tx.$executeRawUnsafe("UPDATE MarketVoucher SET status='UNUSED',usedAt=0,orderId='' WHERE id=? AND status='USED'",o.voucherId);}
   if(status==='COMPLETED')await recordCompletedShopOrder(tx,o,items);
   await notify(tx,o.userId,'Cập nhật đơn hàng','Đơn '+oid.slice(0,8)+': '+({CONFIRMED:'Đã xác nhận',SHIPPED:'Đang giao',COMPLETED:'Hoàn tất',CANCELLED:'Đã hủy'}[status]||status));
  },{timeout:15000});await audit(u.id,'order:'+status,oid);
 }else{
  if(!admin(u))return NextResponse.json({error:'Chỉ quản trị viên được thực hiện'},{status:403});
  if(action==='homeBanner'){
   const image=imageURL(b.image);if(!image)fail('Vui lòng chọn ảnh banner');
   await transaction(async tx=>{
    const existing=(await tx.$queryRawUnsafe("SELECT id FROM MarketContent WHERE type='banner' ORDER BY active DESC,created DESC LIMIT 1"))[0];
    await tx.$executeRawUnsafe("UPDATE MarketContent SET active=0 WHERE type='banner' AND active=1");
    if(existing){await tx.$executeRawUnsafe('UPDATE MarketContent SET image=?,active=1,starts=0,ends=0,created=? WHERE id=?',image,now(),existing.id)}
    else await tx.$executeRawUnsafe('INSERT INTO MarketContent VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id(),'banner','Chọn điều hay. Sống mỗi ngày tốt hơn.','Từ những món đồ thiết yếu đến lựa chọn mang dấu ấn riêng. Khám phá tất cả trong một điểm đến.',image,'','',0,0,0,1,now());
   });await audit(u.id,'content:home-banner','homepage');
  }else if(action==='content'){
   const cid=text(b.id,100)||id();if(!['banner','news','promotion','video'].includes(b.type))fail('Loại nội dung không hợp lệ');
   const link=text(b.link,500);if(link&&!/^\/(?!\/)/.test(link)&&!/^https:\/\//.test(link))fail('Liên kết không hợp lệ');
   const starts=integer(b.starts||0,0,9999999999999),ends=integer(b.ends||0,0,9999999999999);if(ends&&ends<=starts)fail('Ngày kết thúc phải sau ngày bắt đầu');const code=text(b.code,50).toUpperCase();
   if(code&&(await rows('SELECT id FROM MarketContent WHERE code=? AND id<>?',code,cid)).length)fail('Mã khuyến mãi đã tồn tại');
   await run('INSERT INTO MarketContent VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET type=excluded.type,title=excluded.title,body=excluded.body,image=excluded.image,link=excluded.link,code=excluded.code,discountBps=excluded.discountBps,starts=excluded.starts,ends=excluded.ends,active=excluded.active',cid,b.type,required(b.title,200),text(b.body,20000),imageURL(b.image),link,code,integer(b.discountBps||0,0,10000),starts,ends,b.active?1:0,now());await audit(u.id,'content',cid);
  }else if(action==='category'){
   await run('UPDATE MarketCategory SET name=?,featured=?,active=?,sort=? WHERE id=?',required(b.name,100),b.featured?1:0,b.active?1:0,integer(b.sort,0,999),required(b.id,100));await audit(u.id,'category',b.id);
  }else if(action==='storeReview'){
   if(!['APPROVED','REJECTED','SUSPENDED'].includes(b.status))fail('Trạng thái không hợp lệ');const sid=required(b.id,100);const store=(await rows('SELECT * FROM MarketStore WHERE id=?',sid))[0];if(!store)fail('Không tìm thấy gian hàng');const fee=b.feeBps===''||b.feeBps==null?null:integer(b.feeBps,0,10000);
   await transaction(async tx=>{if(b.status==='APPROVED')await approveSellerLegal(tx,u,store);if(fee!==null&&fee!==(store.feeBps??(await settings()).feeBps))await scheduleFee(tx,u,sid,fee);await tx.$executeRawUnsafe('UPDATE MarketStore SET status=? WHERE id=?',b.status,sid);await notify(tx,store.userId,'Hồ sơ doanh nghiệp',b.status==='APPROVED'?'Gian hàng đã được duyệt. Bạn có thể gửi sản phẩm để đăng bán.':b.status==='REJECTED'?'Hồ sơ chưa được duyệt. Vui lòng cập nhật thông tin và gửi lại.':'Gian hàng tạm ngừng hoạt động.');});await audit(u.id,'store:'+b.status,sid);
  }else if(action==='settings'){
   const newKey=text(b.aiKey,500);if(newKey)await saveAIKey(newKey);
   const enabled=!!b.aiEnabled;if(enabled&&(!await aiConfigured()||!text(b.aiModel,100)))fail('Cần nhập khóa API và tên mô hình trước khi bật AI');
     const current=await settings();const feePercent=b.feePercent===undefined?(b.feeBps===undefined?Number(current.feeBps||0)/100:Number(b.feeBps)/100):Number(b.feePercent);if(!Number.isFinite(feePercent)||feePercent<0||feePercent>100)fail('Phí sàn phải nằm trong khoảng 0–100%');const cfg={...current,feeBps:current.feeBps,rewardBps:integer(b.rewardBps,0,10000),shipping:integer(b.shipping),pointValue:integer(b.pointValue,1,100000),aiProvider:enabled?'openai':'none',aiModel:text(b.aiModel,100),aiEnabled:enabled,...(b.ywbToVnd!==undefined?{ywbToVnd:integer(b.ywbToVnd||0,0,100000)}:{}),...(b.ywbEnabled!==undefined?{ywbEnabled:!!b.ywbEnabled}:{}),...(b.ywbMinTransfer!==undefined?{ywbMinTransfer:integer(b.ywbMinTransfer||1,1,100000000)}:{}),...(b.ywbMaxTransfer!==undefined?{ywbMaxTransfer:integer(b.ywbMaxTransfer||1000000,1,100000000)}:{}),...(b.ywbDailyLimit!==undefined?{ywbDailyLimit:integer(b.ywbDailyLimit||1000000,1,100000000)}:{}),...(b.xuEnabled!==undefined?{xuEnabled:b.xuEnabled!==false}:{}),...(b.xuVndRate!==undefined?{xuVndRate:integer(b.xuVndRate||5,0,100000)}:{}),...(b.xuMaxDiscount!==undefined?{xuMaxDiscount:integer(b.xuMaxDiscount||0,0,100000000)}:{}),...(b.allowXuWithYwb!==undefined?{allowXuWithYwb:!!b.allowXuWithYwb}:{}),...(b.allowVoucherWithYwb!==undefined?{allowVoucherWithYwb:b.allowVoucherWithYwb!==false}:{}),...(b.attendanceDaily!==undefined?{attendanceDaily:integer(b.attendanceDaily||30,0,100000)}:{}),...(b.attendanceWeekly!==undefined?{attendanceWeekly:integer(b.attendanceWeekly||0,0,1000000)}:{}),...(b.attendanceMonthly!==undefined?{attendanceMonthly:integer(b.attendanceMonthly||0,0,1000000)}:{})};await transaction(async tx=>{if(Math.round(feePercent*100)!==current.feeBps)await scheduleFee(tx,u,'',Math.round(feePercent*100));await tx.$executeRawUnsafe("UPDATE MarketSetting SET value=? WHERE key='commerce'",JSON.stringify(cfg))});await audit(u.id,'settings','commerce');
   }else if(action==='task'){
    const taskId=text(b.id,100)||id(),key=required(b.key,80).toLowerCase().replace(/[^a-z0-9_:-]/g,'_');await run('INSERT INTO MarketTaskDefinition(id,key,title,description,reward,goal,limitPerDay,active,created) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET key=excluded.key,title=excluded.title,description=excluded.description,reward=excluded.reward,goal=excluded.goal,limitPerDay=excluded.limitPerDay,active=excluded.active',taskId,key,required(b.title,150),text(b.description,500),integer(b.reward,0,1000000),integer(b.goal,1,1000),integer(b.limitPerDay||1,1,1000),b.active?1:0,now());await audit(u.id,'task',taskId);
   }else if(action==='hub'){
    const hubId=text(b.id,100)||id(),token=required(b.qrToken,200),address=text(b.address,300),latitude=b.latitude===''||b.latitude==null?null:Number(b.latitude),longitude=b.longitude===''||b.longitude==null?null:Number(b.longitude);if(latitude!==null&&(!Number.isFinite(latitude)||latitude<-90||latitude>90))fail('Vĩ độ không hợp lệ');if(longitude!==null&&(!Number.isFinite(longitude)||longitude<-180||longitude>180))fail('Kinh độ không hợp lệ');await run('INSERT INTO MarketHub(id,name,qrToken,address,latitude,longitude,active,qrExpires,created) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,qrToken=excluded.qrToken,address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude,active=excluded.active,qrExpires=excluded.qrExpires',hubId,required(b.name,150),token,address,latitude,longitude,b.active?1:0,integer(b.qrExpires||0,0,9999999999999),now());await audit(u.id,'hub',hubId);
   }else if(action==='voucherCampaign'){
    const campaignId=text(b.id,100)||id(),code=required(b.code,80).toUpperCase();await run('INSERT INTO MarketVoucherCampaign(id,title,code,faceValue,pointsCost,stock,perUser,starts,ends,active,created) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,code=excluded.code,faceValue=excluded.faceValue,pointsCost=excluded.pointsCost,stock=excluded.stock,perUser=excluded.perUser,starts=excluded.starts,ends=excluded.ends,active=excluded.active',campaignId,required(b.title,150),code,integer(b.faceValue,1,100000000),integer(b.pointsCost,1,100000000),integer(b.stock,0,1000000),integer(b.perUser||1,1,100),integer(b.starts||0,0,9999999999999),integer(b.ends||0,0,9999999999999),b.active?1:0,now());await audit(u.id,'voucherCampaign',campaignId);
   }else if(action==='tier'){
    const tierId=required(b.id,100);await run('UPDATE MarketMembershipTier SET name=?,minSpend=?,minOrders=?,benefits=?,active=?,sort=? WHERE id=?',required(b.name,100),integer(b.minSpend||0,0,1000000000000),integer(b.minOrders||0,0,1000000),text(b.benefits,500),b.active?1:0,integer(b.sort||0,0,100),tierId);await audit(u.id,'tier',tierId);
   }else if(action==='ywbTransferStatus'){
    const transferId=required(b.id,100),status=required(b.status,30);if(status!=='REJECTED')fail('YWH được chuyển trực tiếp từ ví HUB của người dùng, không duyệt ghi có thủ công');await transaction(async tx=>{const changed=await tx.$executeRawUnsafe("UPDATE MarketYwbTransfer SET status='REJECTED',updated=? WHERE id=? AND status='PENDING'",now(),transferId);if(changed!==1)fail('Yêu cầu không còn chờ xử lý');});await audit(u.id,'ywb:REJECTED',transferId);
  }else if(action==='settlementPaid'){
   const changed=await run("UPDATE MarketSettlement SET status='PAID' WHERE id=? AND status='PENDING'",required(b.id,100));if(changed!==1)fail('Đối soát đã cập nhật hoặc không tồn tại');await audit(u.id,'settlement:paid',b.id);
  }else if(action==='settlementFeePaid'){
   if(b.confirmed!==true)fail('Cần xác nhận đã nhận phí sàn thực tế');
   const changed=await run("UPDATE MarketSettlement SET status='FEE_PAID' WHERE id=? AND status='FEE_DUE'",required(b.id,100));if(changed!==1)fail('Khoản phí đã đối soát hoặc không tồn tại');await audit(u.id,'settlement:fee-paid',b.id);
  }else fail('Thao tác không được hỗ trợ');
 }
 return NextResponse.json({ok:true,...(action==='product'&&draftSaved?{draft:true}:{})});
 }catch(e:any){if(e?.code==='P2002')return NextResponse.json({error:'Thông tin đã được sử dụng'},{status:400});if(e?.code){console.error('market POST',e.code);return NextResponse.json({error:'Không lưu được dữ liệu. Vui lòng thử lại.'},{status:400})}return NextResponse.json({error:e.message||'Yêu cầu không hợp lệ'},{status:400})}}
