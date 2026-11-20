'use client';
import {useEffect,useState} from 'react';
import styles from './WithdrawalKycAdmin.module.css';

type Item={id:string;userId:string;accountName:string;email:string;status:'PENDING'|'APPROVED'|'REJECTED';details:{idNumber:string;fullName:string;birthDate:string;address:string};submittedAt:number;reviewedAt?:number;reviewNote?:string};

async function api(action:string,body?:object){const response=await fetch('/api/market'+(body?'':'?action='+action),body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body}),cache:'no-store'}:{cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Không tải được hồ sơ KYC');return data}

export default function WithdrawalKycAdmin(){
 const [records,setRecords]=useState<Item[]>([]),[selected,setSelected]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=async()=>{try{setRecords((await api('withdrawalKycAdmin')).records||[]);setError('')}catch(e:any){setError(e.message)}};
 useEffect(()=>{void load()},[]);
 const review=async(status:'APPROVED'|'REJECTED')=>{if(!selected)return;setBusy(true);setError('');setNotice('');try{await api('withdrawalKycReview',{id:selected,status,note});await load();setSelected('');setNote('');setNotice(status==='APPROVED'?'Đã duyệt KYC. Thành viên có thể gửi lệnh rút.':'Đã yêu cầu thành viên bổ sung KYC.')}catch(e:any){setError(e.message)}finally{setBusy(false)}};
 const active=records.find(row=>row.id===selected);
 return <section className={styles.root}><header><div><span>KYC YWONDERSHOP</span><h2>Xác minh trước khi rút hoa hồng</h2><p>Đối chiếu ảnh CCCD hai mặt với thông tin nhận diện và tài khoản thành viên trước khi duyệt.</p></div><button type="button" onClick={()=>void load()}>Làm mới</button></header>
  {error&&<p className={styles.error} role="alert">{error}</p>}{notice&&<p className={styles.notice} role="status">{notice}</p>}
  <div className={styles.layout}><div className={styles.list}>{records.length?records.map(row=><button type="button" key={row.id} className={selected===row.id?styles.active:''} onClick={()=>{setSelected(row.id);setNote('')}}><b>{row.accountName||row.email}</b><small>{row.email}</small><span>{row.status==='PENDING'?'Chờ duyệt':row.status==='APPROVED'?'Đã duyệt':'Cần bổ sung'} · {new Date(row.submittedAt).toLocaleString('vi-VN')}</span></button>):<p>Chưa có hồ sơ KYC Shop.</p>}</div>
   <div className={styles.detail}>{active?<><h3>Hồ sơ {active.accountName||active.email}</h3><dl><div><dt>Họ tên trên CCCD</dt><dd>{active.details.fullName}</dd></div><div><dt>Số CCCD</dt><dd>{active.details.idNumber}</dd></div><div><dt>Ngày sinh</dt><dd>{active.details.birthDate}</dd></div><div><dt>Địa chỉ thường trú</dt><dd>{active.details.address}</dd></div></dl><div className={styles.images}><figure><img src={`/api/market?action=withdrawalKycDocument&id=${encodeURIComponent(active.id)}&side=front`} alt="CCCD mặt trước"/><figcaption>Mặt trước</figcaption></figure><figure><img src={`/api/market?action=withdrawalKycDocument&id=${encodeURIComponent(active.id)}&side=back`} alt="CCCD mặt sau"/><figcaption>Mặt sau</figcaption></figure></div>{active.status==='PENDING'?<><label>Ghi chú duyệt hoặc lý do cần bổ sung<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={500} rows={3}/></label><div className={styles.actions}><button type="button" disabled={busy} onClick={()=>void review('APPROVED')}>Duyệt KYC</button><button type="button" disabled={busy||!note.trim()} onClick={()=>void review('REJECTED')}>Yêu cầu bổ sung</button></div></>:<p>Trạng thái: {active.status==='APPROVED'?'Đã duyệt':'Cần bổ sung'}{active.reviewNote?` · ${active.reviewNote}`:''}</p>}</>:<p>Chọn một hồ sơ để xem ảnh và duyệt.</p>}</div></div>
 </section>
}
