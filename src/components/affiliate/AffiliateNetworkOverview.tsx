'use client';

const money=(value:number)=>Number(value||0).toLocaleString('vi-VN')+'₫';
const VIP_TARGET_VND=25000000;
type F1Member={id:string;fullName:string;contact:string|null;contactType:'phone'|'email'};

export default function AffiliateNetworkOverview({network,vip}:{network:any;vip?:any}){
 if(!network)return null;
 const f1Last30=Number(network.f1VipSales30Days||0);
 const progress=Math.min(100,Math.floor(f1Last30/VIP_TARGET_VND*100));
 const totalMembers=Number(network.totalMemberCount??(Number(network.f1Count||0)+Number(network.f2PlusCount||0)));
 const teamSales=Number(network.teamSales??(Number(network.f1Sales||0)+Number(network.f2PlusSales||0)));
 const poolRate=(Number(vip?.policy?.rateBps||1300)/100).toLocaleString('vi-VN');
 const f1Members:Array<F1Member>=Array.isArray(network.f1Members)?network.f1Members:[];
 return <section className="affiliate-rates affiliate-network-overview">
  <h4>Mạng lưới và doanh số Mizi mall</h4>
  <div className="affiliate-pool-grid">
   <span>Thành viên F1 trực tiếp<strong>{Number(network.f1Count||0).toLocaleString('vi-VN')}</strong></span>
   <span>Tổng số thành viên<strong>{totalMembers.toLocaleString('vi-VN')}</strong></span>
   <span>Doanh số mua hàng F1<strong>{money(network.f1Sales)}</strong></span>
   <span>Tổng doanh số đội nhóm<strong>{money(teamSales)}</strong></span>
   <span>Doanh số Mizi mall toàn quốc<strong>{money(network.nationalSalesAllTime)}</strong></span>
   <span>Tổng quỹ đồng chia {poolRate}%<strong>{money(vip?.currentPool)}</strong><small>Toàn quốc · tháng {vip?.period||'—'}</small></span>
  </div>
  <div className="affiliate-f1-directory">
   <h5>Thông tin F1 trực tiếp ({Number(network.f1Count||0).toLocaleString('vi-VN')})</h5>
   {f1Members.length?<div className="affiliate-f1-list">
    <div className="affiliate-f1-row affiliate-f1-head"><span>Họ tên</span><span>Điện thoại hoặc email</span></div>
    {f1Members.map(member=><div className="affiliate-f1-row" key={member.id}>
     <strong>{member.fullName}</strong>
     <span>{member.contact?<><small>{member.contactType==='phone'?'Điện thoại':'Email'}</small>{member.contact}</>:'Chưa có thông tin liên hệ'}</span>
    </div>)}
   </div>:<p>Chưa có thành viên F1 trực tiếp.</p>}
  </div>
  <p>Doanh số F1 hợp lệ trong 30 ngày gần nhất: <b>{money(f1Last30)}</b> / {money(VIP_TARGET_VND)} · {progress}% mốc xét VIP.</p>
  <small>Doanh số là tiền hàng của đơn đã hoàn tất sau giảm giá, không gồm phí vận chuyển. Số liệu cập nhật khi đơn được hoàn tất.</small>
 </section>;
}
