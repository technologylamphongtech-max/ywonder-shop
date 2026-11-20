'use client';
import {FormEvent,useEffect,useState} from 'react';
import styles from './AffiliateAdmin.module.css';

type Row=Record<string,any>;
const money=(value:number)=>Number(value||0).toLocaleString('vi-VN')+'₫';
const PHONG_CHAU='70297741-e78b-4ef9-b659-80fc513330a8';
const MIZI_MALL='c13d55d8-8da2-4d38-91c3-6204ac0465c5';
const label=(row:Row)=>row.sourceKey===PHONG_CHAU?'Phong Châu · 20%':row.sourceKey===MIZI_MALL?'Mizi mall · 20%':row.kind==='BUSINESS'?'Giới thiệu doanh nghiệp':`Hoa hồng Shop F${row.level}`;

export default function AffiliateWithdrawalsAdmin(){
 const [rows,setRows]=useState<Row[]>([]),[selected,setSelected]=useState<Row|null>(null),[reference,setReference]=useState(''),[confirmed,setConfirmed]=useState(false),[requestId,setRequestId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=async()=>{const response=await fetch('/api/market?action=affiliateWithdrawals',{cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error||'Không tải được lệnh rút');setRows(result.withdrawals||[])};
 useEffect(()=>{void load().catch(e=>setError(e.message))},[]);
 const open=(row:Row)=>{setSelected(row);setReference('');setConfirmed(false);setRequestId(crypto.randomUUID());setError('')};
 const pay=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(!selected||!confirmed||busy)return;
  setBusy(true);setError('');setNotice('');
  try{const response=await fetch('/api/market',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'affiliateConfirmPayment',ids:[selected.commissionId],expectedAmount:Number(selected.amount),reference,requestId,confirmed:true})});const result=await response.json();if(!response.ok)throw Error(result.error||'Không lưu được thanh toán');setSelected(null);setNotice('Đã ghi nhận thanh toán và chứng từ.');await load()}catch(e:any){setError(e.message||'Không xử lý được lệnh rút')}finally{setBusy(false)}
 };
 const pending=rows.filter(row=>row.status==='REQUESTED');
 return <section className={styles.root}>
  <div className={styles.toolbar}><div><h3>Lệnh rút hoa hồng của thành viên</h3><p className={styles.muted}>Đối chiếu số tiền và tài khoản đã liên kết trước khi chuyển khoản. Chỉ xác nhận sau khi đã thanh toán thực tế.</p></div><button className={styles.secondary} onClick={()=>void load().catch(e=>setError(e.message))}>Tải lại</button></div>
  {error&&<p className={styles.error} role="alert">{error}</p>}{notice&&<p className={styles.notice} role="status">{notice}</p>}
  <div className={styles.stats}><div className={styles.stat}><span>Lệnh chờ thanh toán</span><b>{pending.length}</b></div><div className={styles.stat}><span>Tổng tiền chờ thanh toán</span><b>{money(pending.reduce((sum,row)=>sum+Number(row.amount),0))}</b></div></div>
  <div className={styles.grid}>{rows.map(row=><article className={styles.card} key={row.id}><h3>{row.beneficiaryName} · {money(row.amount)}</h3><p>{row.beneficiaryEmail}<br/>{label(row)} · đơn #{row.orderId.slice(0,8)}</p><p><b>Ngân hàng nhận:</b> {row.bankName}<br/><b>Số tài khoản:</b> {row.bankAccount}<br/><b>Người thụ hưởng:</b> {row.accountName}</p><p>{row.status==='PAID'?'Đã thanh toán'+(row.paymentReference?' · '+row.paymentReference:''):'Đang chờ chuyển khoản'}</p>{row.status==='REQUESTED'&&<button className={styles.primary} onClick={()=>open(row)}>Xác nhận đã chuyển khoản</button>}</article>)}</div>
  {!rows.length&&<p className={styles.empty}>Chưa có lệnh rút hoa hồng.</p>}
  {selected&&<div className={styles.overlay}><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="withdraw-payment-title"><h3 id="withdraw-payment-title">Xác nhận thanh toán hoa hồng</h3><p>{selected.beneficiaryName} · {label(selected)}<br/>{selected.bankName} · {selected.bankAccount} · {selected.accountName}</p><p className={styles.amount}>{money(selected.amount)}</p><form className={styles.form} onSubmit={pay}><label>Mã chứng từ / tham chiếu<input value={reference} onChange={event=>setReference(event.target.value)} required maxLength={160} disabled={busy}/></label><label className={styles.check}><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} required disabled={busy}/> Tôi đã chuyển đúng tiền vào tài khoản trên.</label><button className={styles.primary} disabled={busy}>{busy?'Đang lưu…':'Lưu xác nhận'}</button><button type="button" className={styles.secondary} disabled={busy} onClick={()=>setSelected(null)}>Hủy</button></form></section></div>}
 </section>;
}
