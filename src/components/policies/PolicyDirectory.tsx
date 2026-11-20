'use client';

import {useState} from 'react';
import type {PolicyLink} from '../../lib/policy-model';

const GROUPS=[
 {title:'Đơn hàng & thanh toán',slugs:['chinh-sach-doi-tra','chinh-sach-thanh-toan','chinh-sach-bao-hanh','chinh-sach-gia']},
 {title:'Quyền lợi & hỗ trợ',slugs:['dieu-khoan-bao-mat','quy-trinh-giai-quyet-khieu-nai','hinh-thuc-ho-tro-truc-tuyen','dieu-kien-han-che-cung-cap']},
 {title:'Quy định của sàn',slugs:['quyen-va-nghia-vu','quy-che-hoat-dong-san','thoa-thuan-nguoi-ban','bieu-phi-va-doi-soat','chinh-sach-hien-thi']}
];

const normalized=(value:string)=>value.toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');

function PolicyIcon({index}:{index:number}){
 const paths=[
  <><path d="M2.5 6.5h12v10h-3m-5 0h-4zm12 3h4l3 4v3h-2m-3 0h-2"/><circle cx="8" cy="17" r="2"/><circle cx="17.5" cy="17" r="2"/></>,
  <><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M3 10h18M6.5 15h4"/></>,
  <><path d="m12 2 8 3.5v6.2c0 4.5-4.2 8.1-8 10-3.8-1.9-8-5.5-8-10V5.5z"/><path d="m8.5 11.5 2.3 2.3 4.8-5"/></>,
  <><path d="M3 4h8l10 10-7 7L3 10z"/><circle cx="7.5" cy="7.5" r="1"/></>
 ];
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[index%paths.length]}</svg>;
}

export default function PolicyDirectory({links,phone,phoneHref}:{links:PolicyLink[];phone:string;phoneHref:string}){
 const [query,setQuery]=useState('');
 const search=normalized(query.trim());
 const visible=links.filter(link=>!search||normalized([link.title,link.short,link.description].join(' ')).includes(search));
 const known=new Set(GROUPS.flatMap(group=>group.slugs));
 const groups=[...GROUPS,{title:'Thông tin khác',slugs:links.filter(link=>!known.has(link.slug)).map(link=>link.slug)}];
 return <>
  <section className="policy-hub-hero"><div><span className="policy-kicker">HỖ TRỢ MUA SẮM</span><h1>Chính sách & hỗ trợ</h1><p>Tra cứu thông tin giao nhận, thanh toán và quyền lợi khi mua sắm tại YWonder Shop.</p></div></section>
  <label className="policy-find"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6.3"/><path d="m15 15 6 6"/></svg><input type="search" aria-label="Tìm chính sách" placeholder="Tìm chính sách, ví dụ: đổi trả…" value={query} onChange={event=>setQuery(event.target.value)}/></label>
  {search&&<p className="policy-result" role="status">{visible.length} chính sách phù hợp</p>}
  {groups.map(group=>{const items=group.slugs.map(slug=>visible.find(link=>link.slug===slug)).filter((link):link is PolicyLink=>!!link);return items.length>0&&<section className="policy-group" key={group.title}><h2>{group.title}</h2><div className="policy-grid">{items.map((link,index)=><a className="policy-card" href={'/policies/'+link.slug} key={link.slug}><span className="policy-card-icon"><PolicyIcon index={index}/></span><span className="policy-card-copy"><strong>{link.short}</strong><span>{link.description}</span></span></a>)}</div></section>})}
  {visible.length===0&&<p className="policy-empty">Không tìm thấy chính sách phù hợp. Thử từ khóa khác hoặc gửi yêu cầu hỗ trợ.</p>}
  <aside className="policy-assist"><div><strong>Cần hỗ trợ về đơn hàng?</strong><p>Liên hệ YWonder Shop để được hướng dẫn.</p></div><div className="policy-assist-links"><a href={phoneHref}>{phone}</a><a href="/support">Gửi yêu cầu hỗ trợ ↗</a></div></aside>
 </>;
}
