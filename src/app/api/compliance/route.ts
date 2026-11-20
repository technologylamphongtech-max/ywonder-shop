import {NextRequest,NextResponse} from 'next/server';
import {randomUUID} from 'crypto';
import {marketUser} from '../../../lib/market-auth';
import {rows,transaction} from '../../../lib/db';
import {readPolicies} from '../../../lib/policy-store';
import {legalVersions,isAdmin,decodeDocument,saveSeller,approveSellerLegal,sellerAgreementReady,attachProductLegal,canSeeCase,supportData,supportAction,sellerOrders,complianceSummary,audit,scheduleFee,sql} from '../../../lib/compliance';
import {FILE_KINDS} from '../../../lib/compliance-model';
import {PHONG_CHAU_COMBO_PRODUCT_ID} from '../../../lib/product-detail';
import {recordCompletedShopOrder} from '../../../lib/market-order-completion';
import {accrueAffiliateOrder} from '../../../lib/affiliate';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(d:any,status=200)=>NextResponse.json(d,{status,headers});
const txt=(v:any,n=500)=>typeof v==='string'?v.trim().slice(0,n):'';
export async function GET(req:NextRequest){try{
 const u=await marketUser(),action=req.nextUrl.searchParams.get('action')||'mine';
 if(action==='public'){const p=await readPolicies(),v=await legalVersions();return json({company:p.company,versions:{seller:v.seller.version,buyer:v.buyer.version},fees:await rows("SELECT storeId,feeBps,starts FROM MarketFeeSchedule WHERE cancelled=0 ORDER BY starts DESC LIMIT 100")})}
 if(!u)return json({error:'Vui lòng đăng nhập'},401);
 if(action==='document'){
  const type=req.nextUrl.searchParams.get('type'),id=txt(req.nextUrl.searchParams.get('id'),100);let raw='';
  if(type==='product'){const r=(await rows('SELECT l.document,s.userId FROM MarketProductLegal l JOIN MarketProduct p ON p.id=l.productId LEFT JOIN MarketStore s ON s.id=p.storeId WHERE p.id=?',id))[0];if(r&&(isAdmin(u)||r.userId===u.id))raw=r.document}
  if(type==='case'){const r=(await rows('SELECT * FROM MarketSupportMessage WHERE id=?',id))[0];if(r){const c=(await rows('SELECT * FROM MarketSupportCase WHERE id=?',r.caseId))[0];if(c&&await canSeeCase(sql,u,c))raw=r.evidence}}
  if(type==='dossier'&&isAdmin(u))raw=(await rows('SELECT content FROM MarketComplianceFile WHERE id=?',id))[0]?.content||'';
  if(type==='seller-history'&&isAdmin(u))raw=(await rows('SELECT license FROM MarketSellerLegalHistory WHERE id=?',id))[0]?.license||'';
  if(!raw)return json({error:'Không tìm thấy tài liệu hoặc không có quyền'},404);const d=decodeDocument(raw);
  await transaction(tx=>audit(tx,u,'compliance:document-view',id));return new NextResponse(new Uint8Array(d.bytes),{headers:{...headers,'Content-Type':d.mime,'Content-Disposition':`${d.mime==='application/pdf'?'attachment':'inline'}; filename="tai-lieu.${d.mime==='application/pdf'?'pdf':d.mime.split('/')[1]}"`,'Content-Security-Policy':"default-src 'none'; sandbox"}});
 }
 if(action==='admin'){
  if(!isAdmin(u))return json({error:'Chỉ quản trị viên được truy cập'},403);
  return json({summary:await complianceSummary(),...(await supportData(u,true)),stores:await rows('SELECT s.id,s.name,s.phone,s.address,s.taxCode,s.userId,l.data,l.status legalStatus,l.reviewNote,l.updated FROM MarketStore s LEFT JOIN MarketSellerLegal l ON l.storeId=s.id WHERE s.status<>"DELETED" ORDER BY s.created DESC LIMIT 500'),products:await attachProductLegal(await rows('SELECT p.id,p.name,p.storeId,p.active,p.categoryId,c.name categoryName FROM MarketProduct p JOIN MarketCategory c ON c.id=p.categoryId WHERE p.active<>-1 ORDER BY p.created DESC LIMIT 1000')),fees:await rows('SELECT * FROM MarketFeeSchedule ORDER BY created DESC LIMIT 200'),sellerHistory:await rows('SELECT id,storeId,data,reviewerId,created FROM MarketSellerLegalHistory ORDER BY created DESC LIMIT 500')});
 }
 if(action==='export'){
  if(!isAdmin(u))return json({error:'Không có quyền'},403);const summary=await complianceSummary();return new NextResponse(JSON.stringify({generatedAt:new Date().toISOString(),...summary,roles:['Quản trị viên','Người bán','Người mua'],note:'Tài liệu hỗ trợ soạn đề án, không thay hồ sơ đăng ký chính thức và không chứa ảnh giấy tờ người dùng.'},null,2),{headers:{...headers,'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="ho-so-chuan-bi-bct.json"'}});
 }
 const store=(await rows("SELECT * FROM MarketStore WHERE userId=? AND status<>'DELETED'",u.id))[0];const v=await legalVersions();
 const legal=store?(await rows('SELECT * FROM MarketSellerLegal WHERE storeId=?',store.id))[0]:null;
 const storeBank=store?(await rows('SELECT bankName,bankCode,bankAccount,accountName,qrImage,updated FROM MarketStoreBankAccount WHERE storeId=?',store.id))[0]||null:null;
 return json({...(await supportData(u)),storeLegal:legal?{...legal,data:JSON.parse(legal.data)}:null,storeBank,products:store?await attachProductLegal(await rows('SELECT * FROM MarketProduct WHERE storeId=? AND active<>-1',store.id)):[],sellerOrders:store?await sellerOrders(u):[],sellerAgreementVersion:v.seller.version,buyerTermsVersion:v.buyer.version,acceptedSeller:!!(await rows('SELECT id FROM MarketLegalAcceptance WHERE userId=? AND kind=? AND version=?',u.id,'SELLER',v.seller.version)).length,disclosures:await rows('SELECT d.* FROM MarketOrderDisclosure d JOIN MarketOrder o ON o.id=d.orderId WHERE o.userId=? ORDER BY d.created DESC LIMIT 100',u.id)});
 }catch(e:any){console.error('compliance GET',e?.code||'failed');return json({error:'Không tải được thông tin. Vui lòng thử lại.'},500)}}
export async function POST(req:NextRequest){try{
 if(req.headers.get('origin')!==(process.env.MARKET_ORIGIN||'https://shop.ywonder.net'))return json({error:'Nguồn yêu cầu không hợp lệ'},403);
 if(!req.headers.get('content-type')?.includes('application/json'))return json({error:'Định dạng không hợp lệ'},415);const raw=await req.text();if(raw.length>2000000)return json({error:'Tài liệu quá lớn'},413);
 const b=JSON.parse(raw),u=await marketUser();if(!u)return json({error:'Vui lòng đăng nhập'},401);
 if(['ghnConfig','ghnPreview','ghnCreate','ghnRefresh'].includes(b.action))return json({error:'Giao Hàng Nhanh đã ngừng tích hợp trên YWonderShop. Gian hàng tự xử lý giao hàng.'},410);
 const result=await transaction(async tx=>{
  if(['caseCreate','caseReply','caseStatus'].includes(b.action))return supportAction(tx,u,b);
  if(b.action==='sellerLegal'){
   const store=(await tx.$queryRawUnsafe('SELECT * FROM MarketStore WHERE userId=?',u.id))[0];if(!store)throw Error('Vui lòng đăng ký gian hàng trước');
   await saveSeller(tx,u,store.id,b);if(b.businessLicenseImage){const doc=decodeDocument(b.businessLicenseImage);if(!doc.mime.startsWith('image/'))throw Error('Giấy đăng ký kinh doanh cần ảnh PNG/JPG/WebP');await tx.$executeRawUnsafe('UPDATE MarketStore SET businessLicenseImage=? WHERE id=?',b.businessLicenseImage,store.id);await tx.$executeRawUnsafe("UPDATE MarketSellerLegal SET status='PENDING' WHERE storeId=?",store.id)}await audit(tx,u,'seller:legal-submit',store.id);return {};
  }
  if(b.action==='storeBank'){
   const store=(await tx.$queryRawUnsafe("SELECT id FROM MarketStore WHERE userId=? AND status='APPROVED'",u.id))[0];if(!store)throw Error('Gian hàng chưa được duyệt');
   const bankName=txt(b.bankName,120),bankCode=txt(b.bankCode,6),bankAccount=txt(b.bankAccount,40),accountName=txt(b.accountName,120);
   if(!bankName||!/^\d{4,40}$/.test(bankAccount)||!accountName||bankCode&&!/^\d{6}$/.test(bankCode))throw Error('Thông tin ngân hàng không hợp lệ');
   const previous=(await tx.$queryRawUnsafe('SELECT qrImage FROM MarketStoreBankAccount WHERE storeId=?',store.id))[0];
   let qrImage=previous?.qrImage||'';
   if(b.qrImage){const doc=decodeDocument(b.qrImage);if(!doc.mime.startsWith('image/'))throw Error('Mã QR phải là ảnh PNG, JPG hoặc WebP');qrImage=b.qrImage}
   if(!bankCode&&!qrImage)throw Error('Vui lòng tải ảnh QR hoặc nhập mã ngân hàng VietQR');
   await tx.$executeRawUnsafe('INSERT INTO MarketStoreBankAccount(storeId,bankName,bankCode,bankAccount,accountName,qrImage,updated) VALUES(?,?,?,?,?,?,?) ON CONFLICT(storeId) DO UPDATE SET bankName=excluded.bankName,bankCode=excluded.bankCode,bankAccount=excluded.bankAccount,accountName=excluded.accountName,qrImage=excluded.qrImage,updated=excluded.updated',store.id,bankName,bankCode,bankAccount,accountName,qrImage,Date.now());
   await audit(tx,u,'seller:bank-updated',store.id);return {};
  }
  if(b.action==='sellerApproveOrder'){
   const orderId=txt(b.orderId,100);
   const store=(await tx.$queryRawUnsafe("SELECT s.id,s.name FROM MarketStore s JOIN MarketOrderItem i ON i.storeId=s.id WHERE s.userId=? AND s.status='APPROVED' AND i.orderId=? LIMIT 1",u.id,orderId))[0];
   if(!store)throw Error('Bạn không có quyền duyệt đơn này');
   const order=(await tx.$queryRawUnsafe('SELECT * FROM MarketOrder WHERE id=?',orderId))[0];
   if(!order||order.status!=='PENDING')throw Error('Đơn không còn chờ duyệt');
   const items=await tx.$queryRawUnsafe('SELECT * FROM MarketOrderItem WHERE orderId=?',orderId);
   const comboOnly=items.length>0&&items.every((item:any)=>item.productId===PHONG_CHAU_COMBO_PRODUCT_ID&&item.storeId===store.id);
   const payment=(await tx.$queryRawUnsafe('SELECT status,accountNumber,storeId FROM MarketOrderBankPayment WHERE orderId=?',orderId))[0];
   if(payment){
    if(payment.storeId!==store.id)throw Error('Đơn thanh toán vào tài khoản sàn cần admin đối soát');
    if(b.confirmed!==true)throw Error('Vui lòng xác nhận đã đối soát tiền thực nhận');
    if(!['AWAITING','VERIFIED'].includes(payment.status))throw Error('Thanh toán không còn hợp lệ');
    if(payment.status==='AWAITING')await tx.$executeRawUnsafe("UPDATE MarketOrderBankPayment SET status='VERIFIED',verifiedBy=?,verifiedAt=? WHERE orderId=? AND status='AWAITING'",u.id,Date.now(),orderId);
   }
   const stamp=Date.now();
   await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketStoreOrderApproval(orderId,storeId,approvedBy,approvedAt) VALUES(?,?,?,?)',orderId,store.id,u.id,stamp);
   const pending=(await tx.$queryRawUnsafe('SELECT COUNT(DISTINCT i.storeId) total,COUNT(DISTINCT a.storeId) approved,SUM(CASE WHEN i.storeId IS NULL THEN 1 ELSE 0 END) platformItems FROM MarketOrderItem i LEFT JOIN MarketStoreOrderApproval a ON a.orderId=i.orderId AND a.storeId=i.storeId WHERE i.orderId=?',orderId))[0];
   if(!Number(pending.platformItems)&&Number(pending.approved)===Number(pending.total)){
    const nextStatus=comboOnly?'COMPLETED':'CONFIRMED';
    const changed=await tx.$executeRawUnsafe('UPDATE MarketOrder SET status=? WHERE id=? AND status=\'PENDING\'',nextStatus,orderId);
    if(changed!==1)throw Error('Đơn hàng vừa được cập nhật');
    if(comboOnly)await recordCompletedShopOrder(tx,order,items);
    else await accrueAffiliateOrder(tx,order,items);
    await tx.$executeRawUnsafe('INSERT INTO MarketNotification VALUES(?,?,?,?,0,?)',randomUUID(),order.userId,comboOnly?'Đã ghi nhận đơn COMBO':'Đơn hàng đã được duyệt',comboOnly?`Gian hàng đã xác nhận thanh toán và ghi nhận đơn COMBO #${orderId.slice(0,8)}. Đơn này không giao hàng.`:`Các gian hàng đã duyệt đơn #${orderId.slice(0,8)}.`,stamp);
   }
   await audit(tx,u,'seller:order-approved',orderId);return {};
  }
  if(b.action==='sellerFulfilment'){
   const store=(await tx.$queryRawUnsafe("SELECT s.* FROM MarketStore s JOIN MarketOrderItem i ON i.storeId=s.id WHERE i.orderId=? AND s.userId=? AND s.status='APPROVED' LIMIT 1",txt(b.orderId,100),u.id))[0];if(!store)throw Error('Bạn không có quyền xử lý đơn hàng này');
   if((await tx.$queryRawUnsafe('SELECT 1 FROM MarketOrderItem WHERE orderId=? AND productId=? LIMIT 1',b.orderId,PHONG_CHAU_COMBO_PRODUCT_ID)).length)throw Error('Combo affiliate Phong Châu không có bước giao hàng');
   const order=(await tx.$queryRawUnsafe('SELECT status FROM MarketOrder WHERE id=?',b.orderId))[0];if(['CANCELLED','COMPLETED'].includes(order?.status))throw Error('Đơn đã kết thúc, không thể cập nhật giao nhận');
   if(!['CONFIRMED','SHIPPED'].includes(b.state))throw Error('Trạng thái giao nhận không hợp lệ');
   await tx.$executeRawUnsafe('INSERT INTO MarketSellerFulfilment VALUES(?,?,?,?,?) ON CONFLICT(orderId,storeId) DO UPDATE SET state=excluded.state,note=excluded.note,updated=excluded.updated',b.orderId,store.id,b.state,txt(b.note,1000),Date.now());await audit(tx,u,'seller:fulfilment',b.orderId);return {};
  }
  if(!isAdmin(u))throw Error('Chỉ quản trị viên được thực hiện');
  if(b.action==='sellerLegalReview'){
   const store=(await tx.$queryRawUnsafe('SELECT * FROM MarketStore WHERE id=?',txt(b.id,100)))[0];if(!store)throw Error('Không tìm thấy gian hàng');
   const legal=(await tx.$queryRawUnsafe('SELECT updated FROM MarketSellerLegal WHERE storeId=?',store.id))[0];if(!legal||legal.updated!==b.expectedUpdated)throw Error('Hồ sơ vừa thay đổi. Vui lòng tải lại');
   if(b.status==='APPROVED')await approveSellerLegal(tx,u,store);
   else if(b.status==='CHANGES'){if(!txt(b.note,1000))throw Error('Vui lòng nhập nội dung cần bổ sung');await tx.$executeRawUnsafe("UPDATE MarketSellerLegal SET status='CHANGES',reviewNote=?,updated=? WHERE storeId=?",txt(b.note,1000),Date.now(),store.id);await audit(tx,u,'seller:legal-changes',store.id)}
   else throw Error('Trạng thái không hợp lệ');return {};
  }
  if(b.action==='productDraftReview'){
   const p=(await tx.$queryRawUnsafe('SELECT p.id,p.name,p.active,p.storeId,l.kind,l.status legalStatus,l.updated legalUpdated,s.status storeStatus,s.userId storeUserId FROM MarketProduct p JOIN MarketProductLegal l ON l.productId=p.id JOIN MarketStore s ON s.id=p.storeId WHERE p.id=?',txt(b.id,100)))[0];
   if(!p||p.kind!=='NONE'||p.legalStatus!=='DRAFT')throw Error('Sản phẩm không còn là bản nháp hàng thông thường');
   if(p.legalUpdated!==b.expectedUpdated)throw Error('Sản phẩm vừa thay đổi. Vui lòng tải lại trước khi duyệt');
   if(!['APPROVED','CHANGES'].includes(b.status))throw Error('Trạng thái không hợp lệ');
   if(b.status==='APPROVED'){
    if(p.storeStatus!=='APPROVED'||!await sellerAgreementReady(tx,{id:p.storeUserId}))throw Error('Cần duyệt hồ sơ pháp lý người bán và thỏa thuận người bán trước khi cho sản phẩm hiển thị');
   }else if(!txt(b.note,1000))throw Error('Vui lòng ghi rõ nội dung cần người bán bổ sung');
   const updated=Date.now();
   await tx.$executeRawUnsafe('UPDATE MarketProductLegal SET status=?,reviewNote=?,reviewedBy=?,reviewedAt=?,updated=? WHERE productId=?',b.status,txt(b.note,1000),u.id,updated,updated,p.id);
   await tx.$executeRawUnsafe('UPDATE MarketProduct SET active=? WHERE id=?',b.status==='APPROVED'?1:0,p.id);
   await audit(tx,u,'product:draft-'+b.status,p.id);
   await tx.$executeRawUnsafe('INSERT INTO MarketNotification VALUES(?,?,?,?,0,?)',randomUUID(),p.storeUserId,b.status==='APPROVED'?'Sản phẩm đã được đăng bán':'Sản phẩm cần bổ sung',b.status==='APPROVED'?`Sản phẩm ${p.name} đã được admin duyệt và hiển thị trên Shop.`:`Sản phẩm ${p.name} cần bổ sung: ${txt(b.note,1000)}`,updated);
   return {};
  }
  if(b.action==='productLegalReview'){
   const p=(await tx.$queryRawUnsafe('SELECT p.*,l.kind,l.document,l.data,l.updated legalUpdated,l.status legalStatus,s.status storeStatus,sl.status sellerLegalStatus FROM MarketProduct p JOIN MarketProductLegal l ON l.productId=p.id LEFT JOIN MarketStore s ON s.id=p.storeId LEFT JOIN MarketSellerLegal sl ON sl.storeId=p.storeId WHERE p.id=?',txt(b.id,100)))[0];if(!p||p.kind==='NONE')throw Error('Không có hồ sơ chuyên ngành cần duyệt');
   if(p.legalUpdated!==b.expectedUpdated)throw Error('Hồ sơ vừa thay đổi. Vui lòng tải lại và đối chiếu tài liệu mới');
   if(p.legalStatus!=='PENDING')throw Error('Hồ sơ đã được xử lý hoặc cần người bán gửi lại');
   if(!['APPROVED','CHANGES'].includes(b.status))throw Error('Trạng thái không hợp lệ');
   if(b.status==='APPROVED'){decodeDocument(p.document);if(p.storeId&&p.storeStatus!=='APPROVED')throw Error('Gian hàng chưa được duyệt');if(p.storeId&&p.sellerLegalStatus!=='APPROVED')throw Error('Hồ sơ pháp lý người bán chưa được duyệt');}
   if(b.status==='CHANGES'&&!txt(b.note,1000))throw Error('Vui lòng nhập nội dung cần bổ sung');
   await tx.$executeRawUnsafe('UPDATE MarketProductLegal SET status=?,reviewNote=?,reviewedBy=?,reviewedAt=?,updated=? WHERE productId=?',b.status,txt(b.note,1000),u.id,Date.now(),Date.now(),p.id);await tx.$executeRawUnsafe('UPDATE MarketProduct SET active=? WHERE id=?',b.status==='APPROVED'?1:0,p.id);await audit(tx,u,'product:legal-'+b.status,p.id);return {};
  }
  if(b.action==='dossierFile'){
   if(!Object.hasOwn(FILE_KINDS,b.kind))throw Error('Loại tài liệu không hợp lệ');decodeDocument(b.content);const id=randomUUID();
   await tx.$executeRawUnsafe('INSERT INTO MarketComplianceFile VALUES(?,?,?,?,?,?)',id,b.kind,txt(b.name,150)||'Tài liệu',b.content,u.id,Date.now());await audit(tx,u,'dossier:file',id);return {};
  }
  if(b.action==='scheduleFee'){const storeId=txt(b.storeId,100);if(storeId&&!(await tx.$queryRawUnsafe('SELECT id FROM MarketStore WHERE id=?',storeId)).length)throw Error('Gian hàng không hợp lệ');await scheduleFee(tx,u,storeId,Number(b.feeBps),Number(b.starts));return {}}
  if(b.action==='cancelFee'){const changed=await tx.$executeRawUnsafe('UPDATE MarketFeeSchedule SET cancelled=1 WHERE id=? AND cancelled=0 AND starts>?',txt(b.id,100),Date.now());if(changed!==1)throw Error('Chỉ hủy được biểu phí chưa có hiệu lực');await audit(tx,u,'fee:cancel',b.id);return {}}
  throw Error('Thao tác không được hỗ trợ');
 },{timeout:15000});return json({ok:true,...result});
 }catch(e:any){if(e?.code){console.error('compliance POST',e.code);return json({error:'Không lưu được dữ liệu. Vui lòng tải lại và thử lại.'},400)}return json({error:e.message||'Yêu cầu không hợp lệ'},400)}}
