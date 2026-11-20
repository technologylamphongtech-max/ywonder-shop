'use client';

const money=(value:number)=>Number(value||0).toLocaleString('vi-VN')+'₫';
const date=(value:number)=>new Date(Number(value)).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Asia/Ho_Chi_Minh'});

export default function MiziVipWallet({vip}:{vip:any}){
 if(!vip)return null;
 const rate=(Number(vip.policy?.rateBps||1300)/100).toLocaleString('vi-VN');
 return <section className="affiliate-rates affiliate-wallet">
  <h4>Quỹ đồng chia doanh số Mizi mall · {rate}%</h4>
  <p>Quỹ chung được tính trên doanh số bán hàng Mizi mall toàn quốc của các đơn hoàn tất trong tháng. Công ty xét và trả thưởng thủ công; Shop chỉ công bố tổng quỹ, không tự phân bổ cho từng F1.</p>
  <div className="affiliate-pool-grid"><span>Tổng quỹ {rate}% tháng {vip.period} · tạm tính<strong>{money(vip.currentPool)}</strong></span></div>
  <p>{vip.activeVip?`Thành viên VIP của bạn có hiệu lực đến ${date(vip.activeVip.expiresAt)}.`:'F1 trực tiếp mua đủ 25.000.000₫ hàng Mizi mall trong 30 ngày là điều kiện đạt VIP trong 30 ngày.'}</p>
  {(vip.months||[]).length>0&&<div className="affiliate-history">{vip.months.map((month:any)=><article key={month.period}><div><b>Quỹ đã chốt · tháng {month.period}</b><small>Mức trích {(Number(month.rateBps)/100).toLocaleString('vi-VN')}%</small></div><strong>{money(month.poolAmount)}</strong></article>)}</div>}
  <small>Số liệu tháng hiện tại có thể thay đổi đến khi chốt tháng. Việc xét và thanh toán thưởng do công ty thực hiện thủ công.</small>
 </section>;
}
