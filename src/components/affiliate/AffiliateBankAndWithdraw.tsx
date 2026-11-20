'use client';
import {FormEvent,useState} from 'react';

const money=(value:number)=>Number(value||0).toLocaleString('vi-VN')+'₫';

export default function AffiliateBankAndWithdraw({affiliate,onSaveBank,onWithdraw,onMiziWithdraw}:{affiliate:any;onSaveBank?:(values:any)=>Promise<any>;onWithdraw?:(values:any)=>Promise<any>;onMiziWithdraw?:(values:any)=>Promise<any>}){
 const bank=affiliate?.miziBankAccount;
 const wallet=affiliate?.generalWallet||{};
 const commissions=affiliate?.generalCommissions||[];
 const miziWallet=affiliate?.miziDirectWallet||{};
 const miziCommissions=affiliate?.miziDirectCommissions||[];
 const [selected,setSelected]=useState<any>(null),[selectedMizi,setSelectedMizi]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const save=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(!onSaveBank||busy)return;
  setBusy(true);setMessage('');
  try{await onSaveBank(Object.fromEntries(new FormData(event.currentTarget)));setMessage('Đã lưu tài khoản nhận hoa hồng.')}catch(error:any){setMessage(error.message||'Không lưu được tài khoản ngân hàng')}finally{setBusy(false)}
 };
 const withdraw=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(!selected||!onWithdraw||!bank||busy)return;
  setBusy(true);setMessage('');
  try{await onWithdraw({commissionId:selected.id});setSelected(null);setMessage('Đã tạo lệnh rút. Admin sẽ đối soát và thanh toán.')}catch(error:any){setMessage(error.message||'Không tạo được lệnh rút')}finally{setBusy(false)}
 };
 const withdrawMizi=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(!selectedMizi||!onMiziWithdraw||!bank||busy)return;
  setBusy(true);setMessage('');
  try{await onMiziWithdraw({commissionId:selectedMizi.id});setSelectedMizi(null);setMessage('Đã tạo lệnh rút hoa hồng 20%. Gian hàng sẽ đối soát và thanh toán.')}catch(error:any){setMessage(error.message||'Không tạo được lệnh rút hoa hồng 20%')}finally{setBusy(false)}
 };
 return <section className="affiliate-bank-and-withdraw" aria-label="Tài khoản ngân hàng và lệnh rút hoa hồng">
  <form className="affiliate-withdraw-form" onSubmit={save}>
   <h4>Ngân hàng nhận hoa hồng</h4>
   <p>Liên kết tài khoản của bạn trước khi tạo lệnh rút. Thông tin này dùng chung cho hoa hồng Shop và Mizi mall.</p>
   <label>Ngân hàng<input name="bankName" required maxLength={120} defaultValue={bank?.bankName||''}/></label>
   <label>Số tài khoản<input name="bankAccount" required inputMode="numeric" pattern="[0-9]{4,40}" maxLength={40} defaultValue={bank?.bankAccount||''}/></label>
   <label>Tên người thụ hưởng<input name="accountName" required maxLength={120} defaultValue={bank?.accountName||''}/></label>
   <button type="submit" className="primary" disabled={busy||!onSaveBank}>{bank?'Cập nhật tài khoản':'Liên kết tài khoản'}</button>
  </form>
  {onMiziWithdraw&&<div className="affiliate-rates affiliate-wallet">
   <h4>Hoa hồng trực tiếp 20% · Mizi mall</h4>
   <p>Khi đơn Mizi mall từ liên kết giới thiệu của bạn được gian hàng duyệt, hoa hồng được ghi nhận và có thể yêu cầu rút ngay.</p>
   <div className="affiliate-pool-grid"><span>Có thể yêu cầu rút<strong>{money(miziWallet.available)}</strong></span><span>Đã gửi lệnh rút<strong>{money(miziWallet.requested)}</strong></span><span>Đã thanh toán<strong>{money(miziWallet.paid)}</strong></span></div>
   {miziCommissions.length>0?<div className="affiliate-history">{miziCommissions.map((row:any)=><article key={row.id}><div><b>Đơn Mizi mall #{row.orderId.slice(0,8)}</b><small>Hoa hồng 20% · {money(row.amount)}</small></div><div><small>{row.directWithdrawalId?'Đã gửi lệnh rút':'Có thể yêu cầu rút'}</small>{!row.directWithdrawalId&&<button type="button" className="affiliate-withdraw-button" disabled={!bank||busy} onClick={()=>setSelectedMizi(row)}>Yêu cầu rút 20%</button>}</div></article>)}</div>:<p>Chưa có hoa hồng 20% từ đơn đã duyệt.</p>}
   {!miziCommissions.length&&<button type="button" className="affiliate-withdraw-button" disabled>Chưa có khoản 20% để rút</button>}
   {!bank&&Number(miziWallet.available)>0&&<p>Liên kết ngân hàng ở trên để gửi lệnh rút.</p>}
   {selectedMizi&&<form className="affiliate-withdraw-form" onSubmit={withdrawMizi}><h4>Xác nhận rút hoa hồng 20%</h4><p>Đơn #{selectedMizi.orderId.slice(0,8)} · <b>{money(selectedMizi.amount)}</b></p><p>Nhận tại: {bank?`${bank.bankName} · ${bank.bankAccount} · ${bank.accountName}`:'Chưa liên kết ngân hàng'}</p><div><button type="submit" className="primary" disabled={busy||!bank}>{busy?'Đang gửi…':'Gửi lệnh rút'}</button><button type="button" disabled={busy} onClick={()=>setSelectedMizi(null)}>Hủy</button></div></form>}
  </div>}
  <div className="affiliate-rates affiliate-wallet">
   <h4>Hoa hồng giới thiệu theo đơn</h4>
   <p>Đây là các khoản hoa hồng giới thiệu riêng theo từng đơn. Quỹ đồng chia Mizi mall bằng 13% doanh số toàn quốc được hiển thị ở trên và công ty xét trả thủ công.</p>
   <div className="affiliate-pool-grid"><span>Có thể yêu cầu rút<strong>{money(wallet.available)}</strong></span><span>Đã gửi lệnh rút<strong>{money(wallet.requested)}</strong></span><span>Đã thanh toán<strong>{money(wallet.paid)}</strong></span></div>
   {commissions.length>0?<div className="affiliate-history">{commissions.map((row:any)=><article key={row.id}><div><b>{row.kind==='BUSINESS'?'Giới thiệu doanh nghiệp':`Hoa hồng kết nối F${row.level}`} · đơn #{row.orderId.slice(0,8)}</b><small>Doanh thu {money(row.revenue)} · {new Date(Number(row.created)).toLocaleDateString('vi-VN')}</small></div><div><b>{money(row.amount)}</b><small>{row.withdrawalId?'Đã gửi lệnh rút':'Có thể yêu cầu rút'}</small>{!row.withdrawalId&&<button type="button" className="affiliate-withdraw-button" disabled={!bank||busy||!onWithdraw} onClick={()=>setSelected(row)}>Tạo lệnh rút</button>}</div></article>)}</div>:<p>Chưa có hoa hồng Shop có thể rút.</p>}
   {!bank&&Number(wallet.available)>0&&<p>Hãy liên kết tài khoản ngân hàng ở trên để tạo lệnh rút.</p>}
  </div>
  {selected&&<form className="affiliate-withdraw-form" onSubmit={withdraw}><h4>Xác nhận lệnh rút hoa hồng</h4><p>Đơn #{selected.orderId.slice(0,8)} · <b>{money(selected.amount)}</b></p><p>Nhận tại: {bank?`${bank.bankName} · ${bank.bankAccount} · ${bank.accountName}`:'Chưa liên kết ngân hàng'}</p><div><button type="submit" className="primary" disabled={busy||!bank}>{busy?'Đang gửi…':'Gửi lệnh rút'}</button><button type="button" disabled={busy} onClick={()=>setSelected(null)}>Hủy</button></div></form>}
  {message&&<p role="status">{message}</p>}
 </section>;
}
