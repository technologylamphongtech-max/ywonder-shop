'use client';
import {useEffect,useState} from 'react';

const money=(value:number)=>Number(value||0).toLocaleString('vi-VN')+'₫';
const previousMonth=()=>{const date=new Date();date.setMonth(date.getMonth()-1);return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'}).format(date)};

export default function MiziVipAdmin(){
 const [report,setReport]=useState<any>(null),[period,setPeriod]=useState(previousMonth),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=async()=>{const response=await fetch('/api/market?action=miziVipAdmin',{credentials:'same-origin',cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Không tải được quỹ VIP');setReport(data)};
 useEffect(()=>{void load().catch(e=>setError(e.message))},[]);
 const close=async()=>{if(busy||!period)return;setBusy(true);setError('');setNotice('');try{const response=await fetch('/api/market',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({action:'miziVipClose',period})});const data=await response.json();if(!response.ok)throw Error(data.error||'Không chốt được quỹ');setNotice(data.alreadyClosed?'Tháng này đã chốt trước đó.':'Đã chốt tổng quỹ VIP tháng '+period);await load()}catch(e:any){setError(e.message||'Không thể chốt quỹ')}finally{setBusy(false)}};
 const rate=(Number(report?.policy?.rateBps||1300)/100).toLocaleString('vi-VN');
 return <section className="panel"><h3>Quỹ đồng chia Mizi mall · {rate}%</h3>
  <p>Shop ghi nhận tổng quỹ bằng {rate}% doanh số bán hàng Mizi mall toàn quốc. Công ty tự xét và trả thưởng thủ công; hệ thống không tính phần chia hoặc tạo yêu cầu rút cho từng F1.</p>
  <div className="affiliate-pool-grid"><span>Doanh số tháng {report?.period||'—'}<strong>{money(report?.currentRevenue)}</strong></span><span>Tổng quỹ tạm tính {rate}%<strong>{money(report?.currentPool)}</strong></span><span>VIP còn hiệu lực tạm tính<strong>{Number(report?.currentEligibleCount||0).toLocaleString('vi-VN')}</strong></span></div>
  <div className="affiliate-withdraw-form"><h4>Chốt tổng quỹ tháng đã kết thúc</h4><label>Tháng<input type="month" value={period} onChange={event=>setPeriod(event.target.value)}/></label><button className="primary" type="button" disabled={busy||!period} onClick={()=>void close()}>Chốt tổng quỹ</button><small>Tháng chưa kết thúc không thể chốt. Việc trả thưởng được thực hiện thủ công ngoài hệ thống.</small></div>
  <div className="affiliate-history">{(report?.months||[]).map((row:any)=><article key={row.period}><div><b>Tháng {row.period}</b><small>Mức trích {(Number(row.rateBps)/100).toLocaleString('vi-VN')}% · doanh số {money(row.revenue)}</small></div><strong>Tổng quỹ {money(row.poolAmount)}</strong></article>)}{!report?.months?.length&&<p>Chưa có tháng nào được chốt.</p>}</div>
  <h4>Thành viên đã đạt VIP</h4><div className="affiliate-history">{(report?.qualifications||[]).map((row:any)=><article key={row.id}><div><b>{row.fullName||row.email}</b><small>{row.email} · F1 đạt {money(row.qualifyingF1Sales)}</small><small>Đạt ngày {new Date(Number(row.qualifiedAt)).toLocaleDateString('vi-VN')} · hết hạn {new Date(Number(row.expiresAt)).toLocaleDateString('vi-VN')}</small></div><b>{Number(row.expiresAt)>Date.now()?'Đang VIP':'Đã hết hạn'}</b></article>)}{!report?.qualifications?.length&&<p>Chưa có thành viên đạt VIP.</p>}</div>
  {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <button type="button" onClick={()=>void load().catch(e=>setError(e.message))}>Tải lại</button>
 </section>;
}
