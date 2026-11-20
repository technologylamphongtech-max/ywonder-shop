import {createHash,randomUUID} from 'crypto';
import {db,rows,transaction} from './db';
import {readPolicies} from './policy-store';
import {defaultProductKind,PRODUCT_KINDS,ProductLegal,SellerLegal,SUPPORT_KINDS,SUPPORT_STATES,FILE_KINDS} from './compliance-model';
export const sql={$queryRawUnsafe:rows};
const now=()=>Date.now();
const str=(v:any,max=500)=>typeof v==='string'?v.trim().slice(0,max):'';
function need(v:any,label:string,max=500){const s=str(v,max);if(!s)throw Error('Vui lòng bổ sung '+label);return s}
export const isAdmin=(u:any)=>u&&['ADMIN','SUPER_ADMIN'].includes(u.role);
export function decodeDocument(raw:any){
 if(typeof raw!=='string'||raw.length>1400000)throw Error('Tài liệu tối đa 1 MB');
 const m=/^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(raw);if(!m)throw Error('Tài liệu phải là PNG, JPG, WebP hoặc PDF');
 const bytes=Buffer.from(m[2],'base64');if(bytes.toString('base64').replace(/=+$/,'')!==m[2].replace(/=+$/,''))throw Error('Tài liệu không hợp lệ');
 const valid=m[1]==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':m[1]==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):m[1]==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
 if(!valid)throw Error('Nội dung tài liệu không đúng định dạng');return {bytes,mime:m[1]};
}
export async function legalVersions(){const p=await readPolicies();const seller=p.documents.find(d=>d.slug==='thoa-thuan-nguoi-ban');const buyer=p.documents.filter(d=>['quy-che-hoat-dong-san','chinh-sach-thanh-toan','chinh-sach-doi-tra','dieu-khoan-bao-mat'].includes(d.slug));const version=(v:any)=>createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0,24);return {seller:{version:version({seller,company:p.company}),snapshot:{document:seller,company:p.company}},buyer:{version:version({buyer,company:p.company,bank:p.bank}),snapshot:{documents:buyer,company:p.company,bank:p.bank}}}}
export async function acceptLegal(tx:any,u:any,kind:'SELLER'|'BUYER',version:any,accepted:any){
 const versions=await legalVersions(),entry=kind==='SELLER'?versions.seller:versions.buyer;
 if(accepted!==true||version!==entry.version)throw Error('Vui lòng đọc và chấp thuận điều khoản hiện tại. Nếu nội dung vừa thay đổi, hãy tải lại trang.');
 await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketLegalAcceptance VALUES(?,?,?,?,?,?)',randomUUID(),u.id,kind,entry.version,JSON.stringify(entry.snapshot),now());return entry;
}
export function validateSeller(b:any):SellerLegal{
 const d:SellerLegal={businessType:need(b.businessType,'loại hình người bán',30),legalName:need(b.legalName,'tên pháp lý',250),representative:need(b.representative,'người đại diện',150),registrationNumber:need(b.registrationNumber,'số đăng ký kinh doanh',50),registrationDate:need(b.registrationDate,'ngày cấp',10),registrationAuthority:need(b.registrationAuthority,'cơ quan cấp',250),contactEmail:need(b.contactEmail,'email liên hệ',150),returnAddress:need(b.returnAddress,'địa chỉ nhận đổi trả',600)};
 if(!['COMPANY','HOUSEHOLD'].includes(d.businessType)||!/^\d{4}-\d{2}-\d{2}$/.test(d.registrationDate)||!Number.isFinite(Date.parse(d.registrationDate))||new Date(d.registrationDate).toISOString().slice(0,10)!==d.registrationDate||d.registrationDate>new Date().toISOString().slice(0,10))throw Error('Loại hình hoặc ngày đăng ký không hợp lệ');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.contactEmail))throw Error('Email người bán không hợp lệ');return d;
}
export async function saveSeller(tx:any,u:any,storeId:string,b:any){const d=validateSeller(b);await acceptLegal(tx,u,'SELLER',b.sellerAgreementVersion,b.acceptSellerAgreement);const encoded=JSON.stringify(d);await tx.$executeRawUnsafe("INSERT INTO MarketSellerLegal(storeId,data,updated) VALUES(?,?,?) ON CONFLICT(storeId) DO UPDATE SET status=CASE WHEN data=excluded.data THEN status ELSE 'PENDING' END,data=excluded.data,updated=excluded.updated",storeId,encoded,now());return d}
export async function approveSellerLegal(tx:any,u:any,store:any){const legal=(await tx.$queryRawUnsafe('SELECT * FROM MarketSellerLegal WHERE storeId=?',store.id))[0];if(!legal||!store.businessLicenseImage)throw Error('Gian hàng cần bổ sung thông tin pháp lý và ảnh đăng ký kinh doanh trước khi duyệt');validateSeller(JSON.parse(legal.data));decodeDocument(store.businessLicenseImage);if(legal.status==='APPROVED'&&legal.approvedData===legal.data)return;await tx.$executeRawUnsafe("UPDATE MarketSellerLegal SET approvedData=data,status='APPROVED',reviewNote='',updated=? WHERE storeId=?",now(),store.id);await tx.$executeRawUnsafe('INSERT INTO MarketSellerLegalHistory VALUES(?,?,?,?,?,?)',randomUUID(),store.id,legal.data,store.businessLicenseImage,u.id,now());await audit(tx,u,'seller:legal-approved',store.id)}
export async function sellerAgreementReady(tx:any,u:any){const version=(await legalVersions()).seller.version;const accepted=await tx.$queryRawUnsafe('SELECT id FROM MarketLegalAcceptance WHERE userId=? AND kind=? AND version=?',u.id,'SELLER',version);const legal=await tx.$queryRawUnsafe("SELECT l.storeId FROM MarketSellerLegal l JOIN MarketStore s ON s.id=l.storeId WHERE s.userId=? AND l.status='APPROVED'",u.id);return !!accepted.length&&!!legal.length}
export async function publicStores(){const list=await rows("SELECT s.id,s.name,s.phone,s.address,s.taxCode,s.description,l.approvedData FROM MarketStore s LEFT JOIN MarketSellerLegal l ON l.storeId=s.id WHERE s.status='APPROVED'");return list.map(s=>{const {approvedData,...rest}=s;return {...rest,legal:approvedData?JSON.parse(approvedData):null}})}
export async function attachProductLegal(products:any[],client:any=sql){if(!products.length)return products;const list=await client.$queryRawUnsafe('SELECT productId,data,kind,status,reviewNote,updated,length(document)>0 hasDocument FROM MarketProductLegal');const map=new Map(list.map((p:any)=>[p.productId,{...JSON.parse(p.data),kind:p.kind,status:p.status,reviewNote:p.reviewNote,updated:p.updated,hasDocument:!!p.hasDocument}]));return products.map(p=>({...p,legal:map.get(p.id)||null}))}
export async function saveProductLegal(tx:any,u:any,productId:string,categoryName:string,b:any,{draftOnly=false}:{draftOnly?:boolean}={}){
 const d:ProductLegal={origin:need(b.origin,'xuất xứ sản phẩm',150),manufacturer:need(b.manufacturer,'nhà sản xuất/đơn vị chịu trách nhiệm',250),brand:str(b.brand,150),condition:need(b.condition,'tình trạng hàng',100),warranty:need(b.warranty,'điều kiện bảo hành',3000),labelInfo:need(b.labelInfo,'thông tin nhãn, quy cách và hướng dẫn',5000),certificateNumber:str(b.certificateNumber,250)};
 const product=(await tx.$queryRawUnsafe('SELECT name,sku,categoryId,storeId FROM MarketProduct WHERE id=?',productId))[0];if(!product)throw Error('Không tìm thấy sản phẩm');
 Object.assign(d,{productName:product.name,productSku:product.sku,categoryId:product.categoryId,storeId:product.storeId});
 const required=defaultProductKind(categoryName),kind=required!=='NONE'?required:(Object.hasOwn(PRODUCT_KINDS,b.regulatoryType)?b.regulatoryType:'NONE');
 const old=(await tx.$queryRawUnsafe('SELECT * FROM MarketProductLegal WHERE productId=?',productId))[0];
 const document=b.productDocument?String(b.productDocument):old?.document||'';if(document)decodeDocument(document);
 if(!draftOnly&&kind!=='NONE'&&(!document||!d.certificateNumber))throw Error('Nhóm hàng này cần số giấy tờ/công bố và bản chụp tài liệu chuyên ngành');
 const unchanged=old&&old.data===JSON.stringify(d)&&old.kind===kind&&old.document===document;
 const status=draftOnly?'DRAFT':kind==='NONE'?'APPROVED':unchanged&&old.status!=='DRAFT'?old.status:'PENDING';
 await tx.$executeRawUnsafe("INSERT INTO MarketProductLegal(productId,data,kind,status,document,updated) VALUES(?,?,?,?,?,?) ON CONFLICT(productId) DO UPDATE SET data=excluded.data,kind=excluded.kind,status=excluded.status,document=excluded.document,reviewNote=CASE WHEN excluded.status='PENDING' THEN '' ELSE reviewNote END,updated=excluded.updated",productId,JSON.stringify(d),kind,status,document,now());
 if(status!=='APPROVED')await tx.$executeRawUnsafe('UPDATE MarketProduct SET active=0 WHERE id=?',productId);return status;
}
export async function effectiveFee(client:any,storeId:string,base:number){const list=await client.$queryRawUnsafe('SELECT feeBps FROM MarketFeeSchedule WHERE storeId=? AND cancelled=0 AND starts<=? ORDER BY starts DESC,created DESC LIMIT 1',storeId,now());return list[0]?.feeBps??base}
export async function scheduleFee(tx:any,u:any,storeId:string,feeBps:number,starts?:number){const at=starts||now()+21*86400000;if(!Number.isSafeInteger(feeBps)||feeBps<0||feeBps>10000||!Number.isSafeInteger(at)||at<now()+20*86400000)throw Error('Phí sàn phải từ 0–100% và thông báo trước ít nhất 20 ngày');await tx.$executeRawUnsafe('INSERT INTO MarketFeeSchedule VALUES(?,?,?,?,?,?,0)',randomUUID(),storeId,feeBps,at,now(),u.id);await audit(tx,u,'fee:schedule',storeId||'global')}
export async function audit(tx:any,u:any,action:string,target:string){await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),u.id,action,target,now())}
async function note(tx:any,uid:string,title:string,body:string){await tx.$executeRawUnsafe('INSERT INTO MarketNotification VALUES(?,?,?,?,0,?)',randomUUID(),uid,title,body,now())}
export async function canSeeCase(client:any,u:any,c:any){if(isAdmin(u)||c.userId===u.id)return true;if(!c.storeId)return false;return !!(await client.$queryRawUnsafe('SELECT id FROM MarketStore WHERE id=? AND userId=?',c.storeId,u.id)).length}
export async function supportData(u:any,adminMode=false){
 const cases=await rows(adminMode&&isAdmin(u)?'SELECT * FROM MarketSupportCase ORDER BY updated DESC LIMIT 300':'SELECT c.* FROM MarketSupportCase c LEFT JOIN MarketStore s ON s.id=c.storeId WHERE c.userId=? OR s.userId=? ORDER BY c.updated DESC LIMIT 200',...(adminMode&&isAdmin(u)?[]:[u.id,u.id]));
 const messages=cases.length?await rows('SELECT m.id,m.caseId,m.userId,m.role,m.body,m.created,length(m.evidence)>0 hasEvidence FROM MarketSupportMessage m JOIN MarketSupportCase c ON c.id=m.caseId LEFT JOIN MarketStore s ON s.id=c.storeId WHERE '+(adminMode&&isAdmin(u)?'1=1':'c.userId=? OR s.userId=?')+' ORDER BY m.created LIMIT 3000',...(adminMode&&isAdmin(u)?[]:[u.id,u.id])):[];return {cases,messages};
}
export async function supportAction(tx:any,u:any,b:any){
 if(b.action==='caseCreate'){
  const kind=need(b.kind,'loại yêu cầu',30);if(!Object.hasOwn(SUPPORT_KINDS,kind))throw Error('Loại yêu cầu không hợp lệ');
  const orderId=str(b.orderId,100),storeId=str(b.storeId,100),productId=str(b.productId,100);
  if(['RETURN','WARRANTY','COMPLAINT'].includes(kind)&&!orderId)throw Error('Vui lòng chọn đơn hàng cần hỗ trợ');
  if(orderId){const o=(await tx.$queryRawUnsafe('SELECT id FROM MarketOrder WHERE id=? AND userId=?',orderId,u.id))[0];if(!o)throw Error('Không tìm thấy đơn hàng của bạn');if(storeId&&!(await tx.$queryRawUnsafe('SELECT id FROM MarketOrderItem WHERE orderId=? AND storeId=?',orderId,storeId)).length)throw Error('Gian hàng không thuộc đơn này')}
  if(storeId&&!orderId)throw Error('Chỉ chọn gian hàng trong đơn của bạn');
  if(productId&&!(await tx.$queryRawUnsafe('SELECT id FROM MarketProduct WHERE id=? AND active=1',productId)).length)throw Error('Không tìm thấy sản phẩm');
  const recent=await tx.$queryRawUnsafe('SELECT count(*) n FROM MarketSupportCase WHERE userId=? AND created>?',u.id,now()-3600000);if(recent[0]?.n>=10)throw Error('Bạn đã gửi nhiều yêu cầu. Vui lòng chờ bộ phận hỗ trợ phản hồi');
  const cid=randomUUID(),description=need(b.description,'nội dung yêu cầu',6000),evidence=str(b.evidence,1400000);if(evidence)decodeDocument(evidence);
  await tx.$executeRawUnsafe('INSERT INTO MarketSupportCase(id,userId,orderId,storeId,productId,kind,subject,description,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)',cid,u.id,orderId,storeId,productId,kind,need(b.subject,'tiêu đề',180),description,now(),now());
  await tx.$executeRawUnsafe('INSERT INTO MarketSupportMessage VALUES(?,?,?,?,?,?,?)',randomUUID(),cid,u.id,'BUYER',description,evidence,now());
  await note(tx,u.id,'Đã tiếp nhận yêu cầu hỗ trợ','Mã yêu cầu '+cid.slice(0,8)+'. Bạn theo dõi phản hồi trong mục Hỗ trợ & đổi trả.');
  if(storeId){const s=(await tx.$queryRawUnsafe('SELECT userId FROM MarketStore WHERE id=?',storeId))[0];if(s)await note(tx,s.userId,'Yêu cầu cần phối hợp xử lý','Mã yêu cầu '+cid.slice(0,8))}
  await audit(tx,u,'support:create',cid);return {id:cid};
 }
 const cid=need(b.id,'mã yêu cầu',100),c=(await tx.$queryRawUnsafe('SELECT * FROM MarketSupportCase WHERE id=?',cid))[0];if(!c||!await canSeeCase(tx,u,c))throw Error('Bạn không có quyền truy cập yêu cầu này');
 if(b.action==='caseReply'){
  if(c.status==='CLOSED')throw Error('Yêu cầu đã đóng');const evidence=str(b.evidence,1400000);if(evidence)decodeDocument(evidence);
  await tx.$executeRawUnsafe('INSERT INTO MarketSupportMessage VALUES(?,?,?,?,?,?,?)',randomUUID(),cid,u.id,isAdmin(u)?'ADMIN':c.userId===u.id?'BUYER':'SELLER',need(b.message,'nội dung phản hồi',6000),evidence,now());
  await tx.$executeRawUnsafe('UPDATE MarketSupportCase SET updated=? WHERE id=?',now(),cid);await note(tx,c.userId,'Có phản hồi yêu cầu hỗ trợ','Mã yêu cầu '+cid.slice(0,8));await audit(tx,u,'support:reply',cid);return {id:cid};
 }
 if(b.action==='caseStatus'){
  if(!isAdmin(u))throw Error('Chỉ admin được cập nhật kết quả xử lý');if(!Object.hasOwn(SUPPORT_STATES,b.status))throw Error('Trạng thái không hợp lệ');
  const resolution=['RESOLVED','CLOSED'].includes(b.status)?need(b.resolution,'kết quả và phương án thực hiện',6000):str(b.resolution,6000);
  if(['RESOLVED','CLOSED'].includes(b.status)&&b.confirmActualResolution!==true)throw Error('Vui lòng xác nhận kết quả đã được thực hiện thực tế. Hệ thống không tự chuyển tiền hoặc hoàn ví.');
  const changed=await tx.$executeRawUnsafe('UPDATE MarketSupportCase SET status=?,resolution=?,updated=? WHERE id=? AND updated=?',b.status,resolution,now(),cid,b.expectedUpdated);if(changed!==1)throw Error('Yêu cầu vừa thay đổi. Vui lòng tải lại');
  await note(tx,c.userId,'Cập nhật yêu cầu hỗ trợ',SUPPORT_STATES[b.status as keyof typeof SUPPORT_STATES]+(resolution?': '+resolution:''));await audit(tx,u,'support:'+b.status,cid);return {id:cid};
 }
 throw Error('Thao tác hỗ trợ không hợp lệ');
}
export async function sellerOrders(u:any){return rows('SELECT o.id,o.created,o.status,o.name,o.phone,o.address,o.total,o.shipping,i.storeId,i.productId,i.name productName,i.quantity,i.price,f.state fulfilment,f.note fulfilmentNote,p.status paymentStatus,p.bankName paymentBankName,p.accountNumber paymentAccountNumber,p.amountVnd paymentAmount,p.storeId paymentStoreId,a.approvedAt sellerApprovedAt,json_extract(d.snapshot,\'$.delivery.wardName\') wardName,json_extract(d.snapshot,\'$.delivery.provinceName\') provinceName FROM MarketOrder o JOIN MarketOrderItem i ON i.orderId=o.id JOIN MarketStore s ON s.id=i.storeId LEFT JOIN MarketSellerFulfilment f ON f.orderId=o.id AND f.storeId=s.id LEFT JOIN MarketOrderBankPayment p ON p.orderId=o.id LEFT JOIN MarketStoreOrderApproval a ON a.orderId=o.id AND a.storeId=s.id LEFT JOIN MarketOrderDisclosure d ON d.orderId=o.id WHERE s.userId=? ORDER BY o.created DESC LIMIT 500',u.id)}
export async function complianceSummary(){
 const p=await readPolicies(),c=p.company as any,missing=['legalRepresentative','registrationDate','registrationAuthority','returnAddress','complaintEmail','complaintPhone'].filter(k=>!c[k]);
 const files=await rows('SELECT id,kind,name,created FROM MarketComplianceFile ORDER BY created DESC');
 const [stores,products,pending]=await Promise.all([rows("SELECT count(*) n FROM MarketStore s LEFT JOIN MarketSellerLegal l ON l.storeId=s.id WHERE s.status='APPROVED' AND (l.storeId IS NULL OR l.status<>'APPROVED')"),rows('SELECT count(*) n FROM MarketProduct p LEFT JOIN MarketProductLegal l ON l.productId=p.id WHERE p.active=1 AND l.productId IS NULL'),rows("SELECT count(*) n FROM MarketProductLegal WHERE status='PENDING'")]);
 return {company:c,missing,files,legacyStores:stores[0].n,legacyProducts:products[0].n,pendingProducts:pending[0].n,documents:p.documents.map(d=>({slug:d.slug,title:d.title,effectiveDate:d.effectiveDate})),status:missing.length||stores[0].n||products[0].n||pending[0].n?'NEEDS_INFORMATION':'READY_FOR_REVIEW',note:'Danh sách chuẩn bị hồ sơ nội bộ; không phải xác nhận đã đăng ký Bộ Công Thương.'};
}
