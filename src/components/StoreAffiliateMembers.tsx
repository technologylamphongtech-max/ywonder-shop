'use client';
import {FormEvent,useEffect,useState} from 'react';

type Member={userId:string;username:string|null;fullName:string;email:string;status:string;created:number;shopRefCode:string};
export default function StoreAffiliateMembers(){
 const [members,setMembers]=useState<Member[]>([]),[account,setAccount]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=async()=>{const response=await fetch('/api/market?action=storeAffiliateMembers',{cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Không tải được danh sách F1');setMembers(data.members||[])};
 useEffect(()=>{load().catch(e=>setError(e.message))},[]);
 const change=async(selected:boolean,userId='')=>{
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{const response=await fetch('/api/market',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'storeAffiliateMember',selected,account:account.trim(),userId})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Không lưu được lựa chọn');setAccount('');await load();setNotice(selected?`Đã chọn ${result.member.username||result.member.fullName} tham gia F1.`:'Đã thu hồi quyền tham gia cho đơn mới. Hoa hồng cũ được giữ nguyên.')}
  catch(e:any){setError(e.message)}finally{setBusy(false)}
 };
 const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();void change(true)};
 return <section className="panel store-affiliate-cms" aria-labelledby="store-affiliate-title">
  <h3 id="store-affiliate-title">Affiliate Phong Châu · Chọn người tham gia</h3>
  <p>Chỉ tài khoản được gian hàng chọn mới có mã giới thiệu riêng trên Shop, hưởng hoa hồng trực tiếp 20% cho đơn COMBO và được xét quỹ đồng chia 10% khi đủ điều kiện. Thu hồi quyền không xóa khoản đã ghi nhận.</p>
  <form onSubmit={submit} className="store-affiliate-form"><label htmlFor="store-affiliate-account">Tên đăng nhập hoặc email người dùng</label><div><input id="store-affiliate-account" value={account} onChange={event=>setAccount(event.target.value)} required maxLength={120} autoComplete="off" placeholder="Nhập chính xác username hoặc email"/><button className="primary" disabled={busy||!account.trim()}>{busy?'Đang lưu…':'Chọn tham gia'}</button></div></form>
  {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
  <h4>Danh sách được chọn ({members.length})</h4>
  {members.length?<div className="store-affiliate-list">{members.map(member=><div key={member.userId} className="store-affiliate-member"><div><b>{member.username||member.fullName}</b><small>{member.fullName} · {member.email}</small><small>Mã Shop: {member.shopRefCode}</small></div><button type="button" disabled={busy} onClick={()=>void change(false,member.userId)}>Thu hồi quyền</button></div>)}</div>:<p>Chưa chọn người dùng nào.</p>}
 </section>;
}
