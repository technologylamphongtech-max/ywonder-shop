'use client';
import '../../app/affiliate.css';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import AffiliateAdmin from './AffiliateAdmin';
import MiziVipAdmin from '../MiziVipAdmin';
import PoliciesAdmin from './PoliciesAdmin';
import ComplianceAdmin from './ComplianceAdmin';
import SupportPanel from '../SupportPanel';
import styles from './AdminPortal.module.css';
import bannerStyles from './BannerAdmin.module.css';

type Row = Record<string, any>;
type Tab = 'overview' | 'banner' | 'orders' | 'settlements' | 'products' | 'productReview' | 'categories' | 'stores' | 'vouchers' | 'hubs' | 'affiliate' | 'transfers' | 'settings' | 'audit' | 'policies' | 'compliance' | 'support';

const labels: Record<string, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  SHIPPED: 'Đang giao',
  COMPLETED: 'Hoàn tất',
  CANCELLED: 'Đã hủy',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Cần bổ sung',
  SUSPENDED: 'Tạm ngừng',
  PAID: 'Đã thanh toán',
};

const money = (value: number) => Number(value || 0).toLocaleString('vi-VN') + '₫';
const date = (value: number) => new Date(value).toLocaleString('vi-VN');

async function api(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, { ...init, cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error || 'Không thể thực hiện yêu cầu'), { status: response.status });
  return payload;
}

export default function AdminPortal() {
  const [data, setData] = useState<Row | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [login, setLogin] = useState({ login: '', password: '', otp: '' });
  const [loginBusy, setLoginBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [policyDirty,setPolicyDirty]=useState(false);
  const switchTab=(value:Tab)=>{if(value===tab)return;if(policyDirty&&!window.confirm('Chính sách có thay đổi chưa lưu. Rời mục này và bỏ các thay đổi?'))return;setTab(value);window.history.replaceState(null,'','/admin?tab='+value)};

  const load = async () => {
    setLoading(true);
    try {
      const result = await api('/api/market?action=admin');
      setData(result);
      setError('');
    } catch (err: any) {
      setData(null);
      if (err.status !== 403) setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { const requested=new URLSearchParams(window.location.search).get('tab');if(['overview','banner','orders','settlements','products','productReview','categories','stores','vouchers','hubs','affiliate','transfers','settings','audit','policies','compliance','support'].includes(requested||''))setTab(requested as Tab); void load(); }, []);

  const mutate = async (action: string, body: Row = {}, message = 'Đã cập nhật dữ liệu') => {
    try{await api('/api/market', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...body }),
    });
    await load();
    setNotice(message);setError('');}catch(e:any){setError(e.message);throw e}
  };

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginBusy(true);
    setError('');
    try {
      await api('/api/market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', ...login }),
      });
      await load();
      setNotice('Đăng nhập quản trị thành công');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoginBusy(false);
    }
  };

  const logout = async () => {
    if(policyDirty&&!window.confirm('Chính sách có thay đổi chưa lưu. Đăng xuất và bỏ các thay đổi?'))return;
    try {
      await api('/api/market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
    } finally {
      setData(null);
      setNotice('Đã đăng xuất khỏi khu vực quản trị');
    }
  };

  const completedRevenue = useMemo(() => data?.orders?.filter((order: Row) => order.status === 'COMPLETED').reduce((total: number, order: Row) => total + Number(order.total || 0), 0) || 0, [data]);
  const pendingStores = data?.stores?.filter((store: Row) => store.status === 'PENDING').length || 0;
  const pendingProductReviews = data?.products?.filter((product: Row) => product.legal?.status === 'PENDING').length || 0;
  const pendingTransfers = data?.transfers?.filter((transfer: Row) => transfer.status === 'PENDING').length || 0;

  if (loading && !data) return <main className={styles.loading}><div className={styles.spinner} /><p>Đang mở hệ quản trị…</p></main>;

  if (!data) return (
    <main className={styles.loginPage}>
      <section className={styles.loginCard}>
        <div className={styles.loginBrand}>
          <img src="/assets/ywonder-shop-logo.svg" alt="YWonder" />
          <span>ADMIN CONSOLE</span>
        </div>
        <p className={styles.kicker}>KHU VỰC RIÊNG CHO QUẢN TRỊ VIÊN</p>
        <h1>Đăng nhập quản trị</h1>
        <p className={styles.muted}>Quản lý cửa hàng, đơn hàng, gian hàng và ví thưởng trong một không gian riêng biệt.</p>
        <form onSubmit={submitLogin} className={styles.loginForm}>
          <label>Email, tên đăng nhập hoặc số điện thoại<input value={login.login} onChange={event => setLogin({ ...login, login: event.target.value })} required autoComplete="username" /></label>
          <label>Mật khẩu<input type="password" value={login.password} onChange={event => setLogin({ ...login, password: event.target.value })} required autoComplete="current-password" /></label>
          <label>Mã xác thực 2 bước (nếu đã bật)<input value={login.otp} onChange={event => setLogin({ ...login, otp: event.target.value })} inputMode="numeric" /></label>
          {error && <p className={styles.error}>{error}</p>}
          <button className={styles.primary} disabled={loginBusy}>{loginBusy ? 'Đang xác thực…' : 'Đăng nhập quản trị ↗'}</button>
        </form>
        <a className={styles.backLink} href="/">← Quay lại cửa hàng</a>
      </section>
    </main>
  );

  const nav: Array<[Tab, string, string]> = [
    ['overview', 'Tổng quan', '⌂'],
    ['banner', 'Banner trang chủ', '▣'],
    ['orders', 'Đơn hàng', '▤'],
    ['settlements', 'Đối soát', '₫'],
    ['products', 'Sản phẩm', '▦'],
    ['productReview', 'Duyệt sản phẩm', '✓'],
    ['categories', 'Danh mục', '◈'],
    ['stores', 'Gian hàng', '♧'],
    ['vouchers', 'Kho voucher', '▣'],
    ['hubs', 'HUB gần bạn', '⌖'],
    ['affiliate', 'Affiliate', '♧'],
    ['transfers', 'Chuyển YWH', '↗'],
    ['settings', 'Cấu hình', '⚙'],
    ['policies', 'Chính sách', '▤'],
    ['compliance','Hồ sơ & BCT','▣'],
    ['support','Hỗ trợ & khiếu nại','◉'],
    ['audit', 'Nhật ký', '◌'],
  ];

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <a href="/admin" className={styles.brand}><img src="/assets/ywonder-shop-logo.svg" alt="YWonder" /><span>ADMIN CONSOLE</span></a>
        <div className={styles.sideLabel}>QUẢN TRỊ HỆ THỐNG</div>
        <nav className={styles.nav}>{nav.map(([value, label, icon]) => <button key={value} className={tab === value ? styles.active : ''} onClick={() => switchTab(value)}><span>{icon}</span>{label}{value === 'transfers' && pendingTransfers > 0 ? <b>{pendingTransfers}</b> : null}{value === 'stores' && pendingStores > 0 ? <b>{pendingStores}</b> : null}{value === 'productReview' && pendingProductReviews > 0 ? <b>{pendingProductReviews}</b> : null}</button>)}</nav>
        <div className={styles.sideBottom}><a href="/">↗ Mở cửa hàng</a><button onClick={logout}>⇥ Đăng xuất</button></div>
      </aside>
      <main className={styles.main}>
        <header className={styles.header}><div><span className={styles.kicker}>YWONDER MANAGEMENT</span><h1>{nav.find(item => item[0] === tab)?.[1]}</h1></div><div className={styles.headerUser}><span className={styles.online} /> <span>Quản trị viên</span><button onClick={logout}>Đăng xuất</button></div></header>
        {notice && <button className={styles.notice} onClick={() => setNotice('')}>✓ {notice}</button>}
        {error && <p className={styles.error}>{error}</p>}
        {tab === 'overview' && <Overview data={data} revenue={completedRevenue} />}
        {tab === 'banner' && <BannerAdmin content={data.content || []} mutate={mutate} />}
        {tab === 'orders' && <Orders data={data} mutate={mutate} />}
        {tab === 'settlements' && <Settlements data={data} mutate={mutate} />}
        {tab === 'products' && <Products data={data} mutate={mutate} />}
        {tab === 'productReview' && <section className={styles.content}><ComplianceAdmin initialTab="products"/></section>}
        {tab === 'categories' && <Categories data={data} mutate={mutate} />}
        {tab === 'stores' && <Stores data={data} mutate={mutate} />}
        {tab === 'vouchers' && <Vouchers data={data} mutate={mutate} />}
        {tab === 'affiliate' && <section className={styles.content}><AffiliateAdmin/><MiziVipAdmin/></section>}
        {tab === 'hubs' && <Hubs data={data} mutate={mutate} />}
        {tab === 'transfers' && <Transfers data={data} mutate={mutate} />}
        {tab === 'settings' && <Settings data={data} mutate={mutate} />}
        {tab === 'policies' && <section className={styles.content}><PoliciesAdmin onDirtyChange={setPolicyDirty}/></section>}
        {tab==='compliance'&&<section className={styles.content}><ComplianceAdmin/></section>}
        {tab==='support'&&<section className={styles.content}><SupportPanel admin/></section>}
        {tab === 'audit' && <Audit data={data} />}
      </main>
    </div>
  );
}

function Overview({ data, revenue }: { data: Row; revenue: number }) {
  const cards = [['Đơn hàng', data.orders.length, '500 đơn gần nhất'], ['Doanh thu hoàn tất', money(revenue), 'Tổng giá trị đơn đã giao'], ['Gian hàng chờ duyệt', data.stores.filter((store: Row) => store.status === 'PENDING').length, 'Cần xử lý hồ sơ'], ['Sản phẩm', data.products.length, 'Đang có trong hệ thống']];
  return <section className={styles.content}><div className={styles.statGrid}>{cards.map(([label, value, hint]) => <article className={styles.stat} key={String(label)}><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>)}</div><div className={styles.twoCol}><article className={styles.panel}><div className={styles.panelHead}><div><span className={styles.kicker}>QUY TRÌNH</span><h2>Điều hành cửa hàng</h2></div><span className={styles.status}>Đang hoạt động</span></div><p className={styles.muted}>Theo dõi sản phẩm, duyệt gian hàng, xác nhận đơn và đối soát doanh thu trong cùng một hệ quản trị riêng.</p><div className={styles.steps}><span><b>01</b>Sản phẩm</span><span><b>02</b>Đơn hàng</span><span><b>03</b>Đối soát</span></div></article><article className={styles.panel}><div className={styles.panelHead}><div><span className={styles.kicker}>TÓM TẮT</span><h2>Trạng thái cần chú ý</h2></div></div><div className={styles.listLine}><span>Gian hàng chờ duyệt</span><b>{data.stores.filter((store: Row) => store.status === 'PENDING').length}</b></div><div className={styles.listLine}><span>Chuyển YWH hoàn tất</span><b>{data.transfers.filter((transfer: Row) => transfer.status === 'COMPLETED').length}</b></div><div className={styles.listLine}><span>Đơn chưa hoàn tất</span><b>{data.orders.filter((order: Row) => !['COMPLETED', 'CANCELLED'].includes(order.status)).length}</b></div></article></div></section>;
}

function BannerAdmin({content,mutate}:{content:Row[];mutate:(action:string,body?:Row,message?:string)=>Promise<void>}){
  const current=content.find(item=>item.type==='banner'&&item.active)||content.find(item=>item.type==='banner');
  const [image,setImage]=useState(current?.image||'/assets/hero.png');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function choose(file?:File){
    if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setError('Chọn ảnh PNG, JPG hoặc WebP.');return}
    if(file.size>1000000){setError('Ảnh phải nhỏ hơn 1 MB.');return}
    const result=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Không đọc được ảnh'));reader.readAsDataURL(file)});
    setImage(result);setError('');
  }
  async function save(){
    setBusy(true);setError('');
    try{await mutate('homeBanner',{image},'Đã cập nhật banner trang chủ')}catch(e:any){setError(e.message||'Không lưu được banner')}finally{setBusy(false)}
  }
  return <section className={styles.content}><div className={styles.sectionIntro}><div><span className={styles.kicker}>TRANG CHỦ</span><h2>Banner trang chủ</h2><p className={styles.muted}>Thay ảnh lớn trên trang chủ cho cả desktop và mobile. Ảnh mới chỉ hiển thị sau khi nhấn Lưu banner.</p></div></div><div className={styles.settingsForm}><div className={bannerStyles.preview}><img src={image} alt="Xem trước banner trang chủ"/><div><span>THE EVERYDAY EDIT</span><b>Thiết yếu. Tinh tế. Thân quen.</b></div></div><label className={bannerStyles.upload}>Chọn ảnh banner mới<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{void choose(event.target.files?.[0]).catch(()=>setError('Không đọc được ảnh. Vui lòng thử lại.'))}}/><small>PNG, JPG hoặc WebP · tối đa 1 MB. Nên dùng ảnh ngang rõ nét, chủ thể đặt ở giữa để hiển thị cân đối trên điện thoại.</small></label>{error&&<p className={styles.error}>{error}</p>}<button className={styles.primary} type="button" disabled={busy||!image} onClick={()=>void save()}>{busy?'Đang lưu…':'Lưu banner'}</button></div></section>;
}

function Settlements({data,mutate}:{data:Row;mutate:(action:string,body?:Row,message?:string)=>Promise<void>}){
 const due=data.settlements.filter((item:Row)=>item.status==='FEE_DUE');
 const confirm=async(item:Row)=>{if(!window.confirm(`Xác nhận đã nhận ${money(item.fee)} phí sàn từ ${item.storeName} vào tài khoản thực tế?`))return;await mutate('settlementFeePaid',{id:item.id,confirmed:true},'Đã ghi nhận phí sàn thực nhận')};
 return <section className={styles.content}><div className={styles.sectionIntro}><div><span className={styles.kicker}>ĐỐI SOÁT GIAN HÀNG</span><h2>Phí sàn và thanh toán</h2><p className={styles.muted}>Đơn thanh toán trực tiếp cho gian hàng: gian hàng nhận tiền, phí sàn cần nộp cho Shop. Đơn cũ do Shop thu hộ vẫn theo dõi khoản phải trả gian hàng.</p></div><span className={styles.counter}>{due.length} khoản phí chờ thu</span></div><div className={styles.tableWrap}><table><thead><tr><th>Gian hàng / đơn</th><th>Tiền hàng</th><th>Phí sàn</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{data.settlements.map((item:Row)=><tr key={item.id}><td><b>{item.storeName}</b><small>#{item.orderId.slice(0,8)} · {date(item.created)}</small></td><td>{money(item.gross)}</td><td>{money(item.fee)}</td><td>{item.status==='FEE_DUE'?'Chờ gian hàng nộp phí':item.status==='FEE_PAID'?'Đã thu phí':item.status==='PAID'?'Đã trả gian hàng':'Shop chờ trả gian hàng'}</td><td>{item.status==='FEE_DUE'&&<button onClick={()=>void confirm(item).catch(()=>{})}>Đã nhận phí</button>}{item.status==='PENDING'&&<button onClick={()=>{if(window.confirm(`Xác nhận đã chuyển ${money(item.net)} cho gian hàng?`))void mutate('settlementPaid',{id:item.id},'Đã ghi nhận khoản đã trả').catch(()=>{})}}>Đã trả gian hàng</button>}</td></tr>)}</tbody></table>{!data.settlements.length&&<p className={styles.empty}>Chưa có khoản đối soát.</p>}</div></section>;
}

function Orders({ data, mutate }: { data: Row; mutate: (action: string, body?: Row, message?: string) => Promise<void> }) {
  const [busyId,setBusyId]=useState('');
  const transitions: Record<string, string[]> = { CONFIRMED: ['SHIPPED', 'CANCELLED'], SHIPPED: ['COMPLETED'] };
  async function approve(order:Row){if(busyId)return;setBusyId(order.id);try{await mutate('approveOrder',{id:order.id},'Đã duyệt đơn hàng và lưu kết quả đối soát thủ công')}catch{}finally{setBusyId('')}}
return <section className={styles.content}><div className={styles.sectionIntro}><div><span className={styles.kicker}>VẬN HÀNH</span><h2>Đơn hàng</h2><p className={styles.muted}>Gian hàng tự duyệt đơn của mình sau khi đối soát tiền thực nhận. Admin xử lý đơn hệ thống và theo dõi trạng thái chung.</p></div><span className={styles.counter}>{data.orders.length} bản ghi</span></div><div className={styles.tableWrap}><table><thead><tr><th>Đơn hàng</th><th>Khách hàng</th><th>Giá trị / đối soát</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{data.orders.map((order: Row) => <tr key={order.id}><td><b>#{order.id.slice(0, 8)}</b><small>{date(order.created)}</small></td><td>{order.name}<small>{order.phone}</small></td><td><b>{money(order.total)}</b><small>{order.shippingProvider==='NONE'?'Combo affiliate · không giao hàng':'Phí giao '+money(order.shipping)}</small>{order.paymentStatus?<><small>Chuyển khoản: {money(order.paymentAmount)} · {order.paymentBankName} {order.paymentAccountNumber}</small><small>Nội dung đối soát: <strong>{order.paymentMemo}</strong></small><small>{order.paymentStatus==='VERIFIED'?'Đã đối soát':order.paymentStatus==='AWAITING'?(order.sellerManaged?'Chờ gian hàng đối soát':'Chờ admin đối soát'):'Đã hủy thanh toán'}</small></>:<small>Thanh toán khi nhận hàng</small>}{data.fulfilments?.filter((f:Row)=>f.orderId===order.id).map((f:Row)=><small key={f.storeId}>{f.storeName}: {f.state==='SHIPPED'?'Đã giao vận':'Đã xác nhận'}{f.note?' · '+f.note:''}</small>)}</td><td><span className={`${styles.badge} ${styles['badge' + order.status] || ''}`}>{labels[order.status] || order.status}</span></td><td><div className={styles.actions}>{order.status==='PENDING'&&!order.sellerManaged&&(!order.paymentStatus||['AWAITING','VERIFIED'].includes(order.paymentStatus))&&<button disabled={!!busyId} onClick={()=>void approve(order)}>{busyId===order.id?'Đang duyệt…':'Duyệt đơn'}</button>}{order.status==='PENDING'&&order.paymentStatus!=='VERIFIED'&&<button disabled={!!busyId} onClick={()=>void mutate('orderStatus',{id:order.id,status:'CANCELLED'},'Đã hủy đơn').catch(()=>{})}>Hủy đơn</button>}{(order.shippingProvider==='NONE'?[]:transitions[order.status]||[]).map(status=><button key={status} disabled={!!busyId} onClick={()=>void mutate('orderStatus',{id:order.id,status},`Đã chuyển đơn sang ${labels[status]}`).catch(()=>{})}>{order.shippingProvider==='NONE'&&status==='COMPLETED'?'Hoàn tất combo':labels[status]}</button>)}</div></td></tr>)}</tbody></table>{!data.orders.length&&<p className={styles.empty}>Chưa có đơn hàng.</p>}</div></section>;
}

function Products({ data, mutate }: { data: Row; mutate: (action: string, body?: Row, message?: string) => Promise<void> }) {
  return <section className={styles.content}><div className={styles.sectionIntro}><div><span className={styles.kicker}>CATALOG · PARTNERS</span><h2>Sản phẩm doanh nghiệp</h2><p className={styles.muted}>Hàng thông thường của doanh nghiệp được duyệt tự đăng bán. Giấy tờ chuyên ngành được kiểm tra tại mục Hồ sơ & BCT.</p></div><span className={styles.counter}>{data.products.length} sản phẩm</span></div><div className={styles.cardGrid}>{data.products.map((product: Row) => <article className={styles.productCard} key={product.id}>{product.image ? <img src={product.image} alt="" /> : <div className={styles.productPlaceholder}>YW</div>}<div><span className={styles.kicker}>{product.categoryName || data.categories.find((category: Row) => category.id === product.categoryId)?.name || 'Danh mục'}</span><h3>{product.name}</h3><p>Mã: {product.sku || product.id}</p><p>{product.storeName || 'Sản phẩm hệ thống'} · {money(product.price)} · Tồn {product.stock}</p><span className={styles.badge + ' ' + (product.active ? styles.badgeAPPROVED : styles.badgeSUSPENDED)}>{product.active ? 'Đang bán' : 'Đang ẩn'}</span><button type="button" className={styles.deleteButton} onClick={() => { if(window.confirm(`Xóa sản phẩm "${product.name}"? Sản phẩm sẽ ngừng bán, còn đơn hàng cũ vẫn được giữ.`))void mutate('deleteProduct',{id:product.id},'Đã xóa sản phẩm').catch(()=>{}); }}>Xóa sản phẩm</button></div></article>)}</div>{!data.products.length && <p className={styles.empty}>Chưa có sản phẩm.</p>}</section>;
}
function Categories({ data, mutate }: { data: Row; mutate: (action: string, body?: Row, message?: string) => Promise<void> }) {
  return <section className={styles.content}><div className={styles.sectionIntro}><div><span className={styles.kicker}>CATALOG</span><h2>Danh mục sản phẩm</h2></div><span className={styles.counter}>{data.categories.length} danh mục</span></div><div className={styles.cardGrid}>{data.categories.map((category: Row) => <form className={styles.editCard} key={category.id} onSubmit={event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); void mutate('category', { ...values, id: category.id, featured: values.featured === 'on', active: values.active === 'on' }); }}><input name="name" defaultValue={category.name} /><div className={styles.inlineFields}><label>Thứ tự<input type="number" name="sort" defaultValue={category.sort} /></label><label><input type="checkbox" name="featured" defaultChecked={!!category.featured} /> Nổi bật</label><label><input type="checkbox" name="active" defaultChecked={!!category.active} /> Hiển thị</label></div><button className={styles.secondary}>Lưu danh mục</button></form>)}</div></section>;
}

function Stores({ data, mutate }: { data: Row; mutate: (action: string, body?: Row, message?: string) => Promise<void> }) {
  return <section className={styles.content}><div className={styles.sectionIntro}><div><span className={styles.kicker}>PARTNERS</span><h2>Gian hàng doanh nghiệp</h2></div><span className={styles.counter}>{data.stores.length} hồ sơ</span></div><div className={styles.stack}>{data.stores.map((store: Row) => <article className={styles.panel} key={store.id}><div className={styles.panelHead}><div><h3>{store.name}</h3><p className={styles.muted}>{store.fullName} · {store.email} · {store.phone || 'Chưa có số điện thoại'}</p></div><span className={`${styles.badge} ${styles['badge' + store.status] || ''}`}>{labels[store.status] || store.status}</span></div><p>{store.address}</p><p><a href="/admin?tab=compliance">Kiểm tra hồ sơ pháp lý và lịch sử giấy phép trước khi duyệt ↗</a></p><p className={styles.muted}>{store.description || 'Chưa có mô tả gian hàng.'}</p>{store.businessLicenseImage&&<div className={styles.licenseBlock}><span className={styles.kicker}>GIẤY PHÉP KINH DOANH</span><img className={styles.licensePreview} src={store.businessLicenseImage} alt="Giấy phép kinh doanh" /></div>}<div className={styles.actions}>{store.status !== 'APPROVED' && <button onClick={() => mutate('storeReview', { id: store.id, status: 'APPROVED', feeBps: store.feeBps ?? '' }, 'Đã duyệt gian hàng')}>Duyệt hoạt động</button>}{store.status !== 'REJECTED' && <button onClick={() => mutate('storeReview', { id: store.id, status: 'REJECTED', feeBps: store.feeBps ?? '' }, 'Đã yêu cầu bổ sung hồ sơ')}>Yêu cầu bổ sung</button>}{store.status !== 'SUSPENDED' && <button onClick={() => mutate('storeReview', { id: store.id, status: 'SUSPENDED', feeBps: store.feeBps ?? '' }, 'Đã tạm ngừng gian hàng')}>Tạm ngừng</button>}</div></article>)}</div>{!data.stores.length && <p className={styles.empty}>Chưa có hồ sơ doanh nghiệp.</p>}</section>;
}

function Transfers({ data, mutate }: { data: Row; mutate: (action: string, body?: Row, message?: string) => Promise<void> }) {
  return <section className={styles.content}><div className={styles.sectionIntro}><div><span className={styles.kicker}>YWH WALLET</span><h2>Lịch sử chuyển YWH từ HUB</h2></div><span className={styles.counter}>{data.transfers.length} giao dịch</span></div><div className={styles.stack}>{data.transfers.map((transfer: Row) => <article className={styles.panel} key={transfer.id}><div className={styles.panelHead}><div><h3>{transfer.fullName || 'Tài khoản YWonder'}</h3><p className={styles.muted}>{transfer.email} · {date(transfer.created)}</p></div><span className={`${styles.badge} ${styles['badge' + transfer.status] || ''}`}>{labels[transfer.status] || transfer.status}</span></div><div className={styles.transferAmount}>{transfer.amount.toLocaleString('vi-VN')} <small>YWH</small></div><p className={styles.muted}>Nguồn: {transfer.sourceRef || 'Chưa cung cấp'} · Đích: {transfer.targetRef || 'Chưa cung cấp'}</p>{transfer.status === 'PENDING' && <p className={styles.muted}>Yêu cầu cũ chưa thực hiện. Người dùng chuyển trực tiếp từ ví HUB; hệ thống tự kiểm tra và trừ số dư, không cần duyệt.</p>}</article>)}</div>{!data.transfers.length && <p className={styles.empty}>Chưa có giao dịch chuyển YWH.</p>}</section>;
}

function Vouchers({ data, mutate }: { data: Row; mutate: (action: string, body?: Row, message?: string) => Promise<void> }) {
  return <section className={styles.content}><div className={styles.sectionIntro}><div><span className={styles.kicker}>LOYALTY INVENTORY</span><h2>Kho voucher phát hành</h2><p className={styles.muted}>Tạo voucher để người dùng đổi bằng Xu. Tồn kho chỉ giảm khi đổi thành công.</p></div><span className={styles.counter}>{data.voucherCampaigns.length} loại voucher</span></div><div className={styles.voucherGrid}>{data.voucherCampaigns.map((voucher: Row) => <article className={styles.voucherCard} key={voucher.id}><div className={styles.voucherTop}><div className={styles.voucherMark}>V</div><span className={`${styles.badge} ${voucher.active ? styles.badgeAPPROVED : styles.badgeSUSPENDED}`}>{voucher.active ? 'Đang phát hành' : 'Đã tắt'}</span></div><h3>{voucher.title}</h3><p className={styles.voucherCode}>{voucher.code}</p><div className={styles.voucherValues}><div><small>Giảm giá</small><b>{money(voucher.faceValue)}</b></div><div><small>Giá đổi</small><b>{Number(voucher.pointsCost).toLocaleString('vi-VN')} Xu</b></div></div><div className={styles.inventory}><span><b>{voucher.stock}</b> còn lại</span><span><b>{voucher.issued || 0}</b> đã phát hành</span></div><small className={styles.muted}>Tối đa {voucher.perUser || 1} voucher / người</small></article>)}</div><form className={`${styles.settingsForm} ${styles.voucherForm}`} onSubmit={event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); void mutate('voucherCampaign', { ...values, active: values.active === 'on' }, 'Đã phát hành loại voucher mới'); }}><div className={styles.formTitle}><span className={styles.kicker}>PHÁT HÀNH MỚI</span><h3>Tạo loại voucher</h3></div><div className={styles.formGrid}><label>Tên voucher<input name="title" placeholder="Ví dụ: Voucher thành viên mới" required /></label><label>Mã chiến dịch<input name="code" placeholder="WELCOME50" required /></label><label>Mệnh giá giảm (VNĐ)<input type="number" name="faceValue" min="1" required /></label><label>Giá đổi bằng Xu<input type="number" name="pointsCost" min="1" required /></label><label>Số lượng phát hành<input type="number" name="stock" min="0" required /></label><label>Giới hạn mỗi người<input type="number" name="perUser" min="1" defaultValue="1" required /></label></div><div className={styles.checkGrid}><label><input type="checkbox" name="active" defaultChecked /> Phát hành ngay</label></div><button className={styles.primary}>Lưu vào kho voucher</button></form>{!data.voucherCampaigns.length && <p className={styles.empty}>Chưa có voucher nào trong kho.</p>}</section>;
}

function Hubs({ data, mutate }: { data: Row; mutate: (action: string, body?: Row, message?: string) => Promise<void> }) {
  return <section className={styles.content}><div className={styles.sectionIntro}><div><span className={styles.kicker}>YWONDER HUB</span><h2>HUB và vị trí</h2><p className={styles.muted}>Nhập địa chỉ và tọa độ để người dùng tìm HUB gần họ.</p></div><span className={styles.counter}>{data.hubs.length} HUB</span></div><div className={styles.stack}>{data.hubs.map((hub: Row) => <form className={styles.settingsForm} key={hub.id} onSubmit={event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); void mutate('hub', { ...values, id: hub.id, active: values.active === 'on' }, 'Đã lưu thông tin HUB'); }}><div className={styles.formTitle}><h3>{hub.name}</h3><span className={styles.badge}>{hub.active ? 'Đang bật' : 'Đã tắt'}</span></div><div className={styles.formGrid}><label>Tên HUB<input name="name" defaultValue={hub.name} required /></label><label>Mã QR<input name="qrToken" defaultValue={hub.qrToken} required /></label><label>Địa chỉ<input name="address" defaultValue={hub.address || ''} /></label><label>Vĩ độ<input type="number" step="any" name="latitude" defaultValue={hub.latitude ?? ''} /></label><label>Kinh độ<input type="number" step="any" name="longitude" defaultValue={hub.longitude ?? ''} /></label></div><div className={styles.checkGrid}><label><input type="checkbox" name="active" defaultChecked={!!hub.active} /> Hiển thị cho người dùng</label></div><button className={styles.primary}>Lưu HUB</button></form>)}</div>{!data.hubs.length && <p className={styles.empty}>Chưa có HUB. Hãy tạo HUB trong cấu hình cũ hoặc thêm trực tiếp vào hệ thống.</p>}</section>;
}

function Settings({ data, mutate }: { data: Row; mutate: (action: string, body?: Row, message?: string) => Promise<void> }) {
  const settings = data.settings || {};
  return <section className={styles.content}><div className={styles.sectionIntro}><div><span className={styles.kicker}>SYSTEM</span><h2>Cấu hình kinh doanh</h2></div></div><form className={styles.settingsForm} onSubmit={event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); void mutate('settings', { ...values, aiEnabled: values.aiEnabled === 'on', ywbEnabled: values.ywbEnabled === 'on', xuEnabled: values.xuEnabled !== 'off' }, 'Đã lưu cấu hình hệ thống'); }}><div className={styles.formGrid}><label>Phí sàn (%)<input type="number" name="feePercent" min="0" max="100" step="0.01" defaultValue={Number(settings.feeBps || 0) / 100} /><small>Áp dụng trên doanh thu sau giảm giá. Thay đổi phí được công bố và có hiệu lực sau 21 ngày; quản lý tại Hồ sơ & BCT → Lịch phí sàn.</small></label><label>Tỷ lệ thưởng mua hàng (bps)<input type="number" name="rewardBps" defaultValue={settings.rewardBps} /></label><label>Giá trị 1 Xu (VNĐ)<input type="number" name="pointValue" defaultValue={settings.pointValue} /></label><label>Phí giao hàng<input type="number" name="shipping" defaultValue={settings.shipping} /></label><label>Quy đổi YWH → VNĐ<input type="number" name="ywbToVnd" defaultValue={settings.ywbToVnd} /></label></div><div className={styles.checkGrid}><label><input type="checkbox" name="ywbEnabled" defaultChecked={!!settings.ywbEnabled} /> Bật ví YWH</label><label><input type="checkbox" name="aiEnabled" defaultChecked={!!settings.aiEnabled} /> Bật tìm kiếm AI</label><label><input type="checkbox" name="xuEnabled" defaultChecked={settings.xuEnabled !== false} /> Bật Xu thưởng</label></div><button className={styles.primary}>Lưu cấu hình</button></form></section>;
}

function Audit({ data }: { data: Row }) {
  return <section className={styles.content}><div className={styles.sectionIntro}><div><span className={styles.kicker}>SECURITY</span><h2>Nhật ký hoạt động</h2></div><span className={styles.counter}>{data.audits.length} sự kiện</span></div><div className={styles.auditList}>{data.audits.map((audit: Row) => <div key={audit.id}><span><b>{audit.fullName || 'Quản trị viên'}</b><small>{audit.action} · {audit.target}</small></span><time>{date(audit.created)}</time></div>)}</div></section>;
}
