'use client';

const featuredCategoryIds=['suc-khoe-lam-dep','thoi-trang-phu-kien-nu','thoi-trang-phu-kien-nam','thiet-bi-dien-tu','hang-gia-dung-doi-song'];
const fallbackNames=['Sức khỏe & làm đẹp','Thời trang nữ','Thời trang nam','Thiết bị điện tử','Gia dụng & đời sống'];
const policyLinks=[
 ['Giao hàng & đổi trả','chinh-sach-doi-tra'],
 ['Thanh toán','chinh-sach-thanh-toan'],
 ['Bảo hành','chinh-sach-bao-hanh'],
 ['Bảo mật thông tin','dieu-khoan-bao-mat'],
];

export default function ShopFooter({company,categories=[],onCategory,onStores}:{company:any;categories?:any[];onCategory?:(id:string)=>void;onStores?:()=>void}){
 const featured=featuredCategoryIds.map((id,index)=>categories.find(category=>category.id===id)||{id,name:fallbackNames[index]});
 return <footer className="shop-reference-footer"><div className="wrap shop-reference-footer-inner"><div className="shop-reference-footer-grid">
  <div className="shop-reference-footer-identity"><a href="/" aria-label="Trang chủ YWonderShop"><img src="/assets/shop-design/ywonder-logo.svg" alt="YWonderShop"/></a><strong>{company.name}</strong><p>{company.address}</p><p>Mã số thuế {company.taxCode}</p></div>
  <nav aria-label="Danh mục sản phẩm"><h2>Danh mục</h2>{featured.map(category=>onCategory?<button key={category.id} onClick={()=>onCategory(category.id)}>{category.name}</button>:<a key={category.id} href="/?view=shop">{category.name}</a>)}</nav>
  <nav aria-label="Hỗ trợ mua sắm"><h2>Hỗ trợ mua sắm</h2>{policyLinks.map(([name,slug])=><a key={slug} href={'/policies/'+slug}>{name}</a>)}<a href="/policies">Tất cả chính sách</a></nav>
  <div className="shop-reference-footer-contact"><h2>Liên hệ</h2><a className="shop-reference-footer-phone" href={company.phoneHref}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 14v-2a9 9 0 0 1 18 0v2"/><rect x="2" y="13" width="4" height="7" rx="2"/><rect x="18" y="13" width="4" height="7" rx="2"/><path d="M20 20c0 2-2 3-5 3h-2"/></svg>{company.phone}</a><a href={'mailto:'+company.email}>{company.email}</a><a className="shop-reference-footer-support" href="/support">Gửi yêu cầu hỗ trợ</a></div>
 </div><div className="shop-reference-footer-bottom"><small>© {new Date().getFullYear()} YWonder Shop</small><nav aria-label="Liên kết YWonder">{onStores?<button onClick={onStores}>Gian hàng đối tác</button>:<a href="/?view=business">Gian hàng đối tác</a>}<a href="https://ywonder.net/vi" target="_blank" rel="noreferrer">Hệ sinh thái YWonderHub</a><button className="shop-reference-footer-top" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}>Về đầu trang <span aria-hidden="true">⌃</span></button></nav></div></div></footer>;
}
