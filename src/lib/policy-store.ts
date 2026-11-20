import {randomUUID} from 'crypto';
import {rows} from './db';
import {defaultPolicies,PolicyBundle,PolicyCompany} from './policy-model';
import {POLICY_LINKS} from './policy-links';
import {cache} from 'react';
import {ADDITIONAL_POLICIES} from './policy-extensions';
import {DEFAULT_SHOP_PAYMENT_BANK} from './payment-bank';

const KEY='policies:published:v1';
export const readPolicies=cache(async():Promise<PolicyBundle>=>{
 const saved=(await rows('SELECT value FROM MarketSetting WHERE key=?',KEY))[0];
 if(saved){const bundle=JSON.parse(saved.value);return {...bundle,documents:[...bundle.documents,...ADDITIONAL_POLICIES.filter(d=>!bundle.documents.some((x:any)=>x.slug===d.slug))]}}
 const bundle=defaultPolicies(DEFAULT_SHOP_PAYMENT_BANK);return {...bundle,documents:[...bundle.documents,...ADDITIONAL_POLICIES]};
});
function value(v:unknown,label:string,max:number,optional=false){
 if(typeof v!=='string'||(!optional&&!v.trim())||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))throw new Error(`${label}: vui lòng nhập nội dung hợp lệ (tối đa ${max} ký tự)`);
 return v.trim();
}
export function validatePolicies(input:any):Omit<PolicyBundle,'version'|'updatedAt'>{
 if(!input||typeof input!=='object')throw new Error('Thiếu thông tin chính sách');
 const c=input.company||{},b=input.bank||{};
 const company:PolicyCompany={name:value(c.name,'Tên công ty',250),taxCode:value(c.taxCode,'Mã số thuế',14),address:value(c.address,'Địa chỉ',600),phone:value(c.phone,'Điện thoại',30),email:value(c.email,'Email',150),phoneHref:''};
 for(const [key,label,max] of [['legalRepresentative','Người đại diện pháp luật',150],['registrationDate','Ngày cấp đăng ký doanh nghiệp',10],['registrationAuthority','Cơ quan cấp đăng ký doanh nghiệp',250],['returnAddress','Địa chỉ nhận đổi trả',600],['complaintEmail','Email khiếu nại',150],['complaintPhone','Điện thoại khiếu nại',30]] as const)company[key]=value(c[key]||'',label,max,true);
 if(company.registrationDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(company.registrationDate)||!Number.isFinite(Date.parse(company.registrationDate))||new Date(company.registrationDate).toISOString().slice(0,10)!==company.registrationDate||company.registrationDate>new Date().toISOString().slice(0,10)))throw new Error('Ngày cấp đăng ký doanh nghiệp không hợp lệ');
 if(company.complaintEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(company.complaintEmail))throw new Error('Email tiếp nhận khiếu nại không hợp lệ');
 if(company.complaintPhone&&!/^\+?[\d ().-]{8,30}$/.test(company.complaintPhone))throw new Error('Điện thoại tiếp nhận khiếu nại không hợp lệ');
 if(!/^\d{10}(-\d{3})?$/.test(company.taxCode))throw new Error('Mã số thuế gồm 10 chữ số hoặc 10 chữ số và mã chi nhánh 3 chữ số');
 if(!/^\+?[\d ().-]{8,30}$/.test(company.phone)||!/^\+?\d{8,15}$/.test(company.phone.replace(/[ ().-]/g,'')))throw new Error('Số điện thoại không hợp lệ');
 company.phoneHref='tel:'+company.phone.replace(/[ ().-]/g,'');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(company.email))throw new Error('Email không hợp lệ');
 const hasBank=!!(b.bankName||b.accountNumber||b.accountName);const bank={bankName:value(b.bankName||'','Tên ngân hàng',200,!hasBank),bankCode:value(b.bankCode||'','Mã ngân hàng',20,true),accountNumber:value(b.accountNumber||'','Số tài khoản',30,!hasBank),accountName:value(b.accountName||'','Chủ tài khoản',250,!hasBank)};
 if(bank.accountNumber&&!/^\d{4,30}$/.test(bank.accountNumber))throw new Error('Số tài khoản phải gồm 4–30 chữ số');
 const requiredDocs=[...POLICY_LINKS,...ADDITIONAL_POLICIES];
 if(!Array.isArray(input.documents)||input.documents.length!==requiredDocs.length)throw new Error('Cần giữ đủ '+requiredDocs.length+' chính sách');
 const documents=requiredDocs.map(meta=>{
  const matches=input.documents.filter((d:any)=>d?.slug===meta.slug);if(matches.length!==1)throw new Error('Danh mục chính sách không hợp lệ');
  const d=matches[0];const effectiveDate=value(d.effectiveDate,'Ngày hiệu lực',10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)||!Number.isFinite(Date.parse(effectiveDate))||new Date(effectiveDate).toISOString().slice(0,10)!==effectiveDate)throw new Error('Ngày hiệu lực không hợp lệ');
  if(!Array.isArray(d.sections)||d.sections.length<1||d.sections.length>30)throw new Error('Mỗi chính sách cần 1–30 mục nội dung');
  const list=(v:any,label:string)=>{if(v===undefined)return undefined;if(!Array.isArray(v)||v.length>60)throw new Error(`${label}: tối đa 60 dòng`);return v.map((s:any)=>value(s,label,6000,true)).filter(Boolean)};
  const sections=d.sections.map((s:any)=>{
   if(!s||typeof s!=='object')throw new Error('Mục nội dung không hợp lệ');
   if(s.bank!==undefined&&typeof s.bank!=='boolean')throw new Error('Khối tài khoản ngân hàng không hợp lệ');
   if(s.bank&&meta.slug!=='chinh-sach-thanh-toan')throw new Error('Khối ngân hàng chỉ được đặt tại chính sách thanh toán');
   return {title:value(s.title,'Tiêu đề mục',250),paragraphs:list(s.paragraphs,'Đoạn văn'),items:list(s.items,'Gạch đầu dòng'),bank:!!s.bank};
  });
  if(meta.slug==='chinh-sach-thanh-toan'&&sections.filter((s:any)=>s.bank).length!==1)throw new Error('Chính sách thanh toán cần đúng một mục hiển thị tài khoản ngân hàng');
  return {slug:meta.slug,title:value(d.title,'Tên chính sách',250),short:value(d.short,'Tên trong danh mục',100),description:value(d.description,'Mô tả',600),intro:value(d.intro,'Giới thiệu',6000),effectiveDate,sections};
 });
 const result={company,bank,documents};if(Buffer.byteLength(JSON.stringify(result),'utf8')>240000)throw new Error('Nội dung quá lớn, vui lòng rút gọn');return result;
}
export async function savePolicies(tx:any,userId:string,body:any){
 const clean=validatePolicies(body.bundle);
 if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0)throw new Error('Phiên bản không hợp lệ');
 const record=(await tx.$queryRawUnsafe('SELECT value FROM MarketSetting WHERE key=?',KEY))[0];
 const previous=record?JSON.parse(record.value):null;
 if((previous?.version||0)!==body.expectedVersion)return {conflict:true};
 const bundle={...clean,version:body.expectedVersion+1,updatedAt:Date.now()};
 if(record){
  const changed=await tx.$executeRawUnsafe('UPDATE MarketSetting SET value=? WHERE key=? AND value=?',JSON.stringify(bundle),KEY,record.value);if(changed!==1)return {conflict:true};
 }else{
  const changed=await tx.$executeRawUnsafe('INSERT OR IGNORE INTO MarketSetting(key,value) VALUES(?,?)',KEY,JSON.stringify(bundle));if(changed!==1)return {conflict:true};
 }
 // Publishing and its audit entry commit together; operational HUB bank settings are untouched.
 await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),userId,'policies:publish',JSON.stringify({version:bundle.version,company:bundle.company.name,policies:bundle.documents.map(d=>d.slug)}),bundle.updatedAt);
 return {bundle};
}
