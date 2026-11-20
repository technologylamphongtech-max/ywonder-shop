import ShopFooter from '../../app/ShopFooter';
import {readPolicies} from '../../lib/policy-store';
import {policyLinks} from '../../lib/policy-model';

export async function PolicyShell({active,children}:{active?:string;children:React.ReactNode}){
 const bundle=await readPolicies(),COMPANY=bundle.company,links=policyLinks(bundle);
 const title=links.find(p=>p.slug===active)?.short;
 return <div className="policy-site">
  <div className="policy-utility"><div className="policy-container"><span>YWonderHub · More Than A Stop</span><a href="/support">Hỗ trợ khách hàng ↗</a></div></div>
  <header className="policy-header"><div className="policy-container"><a href="/" aria-label="Trang chủ YWonderShop"><img src="/assets/shop-design/ywonder-logo.svg" alt="YWonder Shop" width="218" height="58"/></a><a className="policy-back" href="/?view=shop">Về cửa hàng <span aria-hidden="true">↗</span></a></div><nav className="policy-container policy-top-nav" aria-label="Điều hướng Shop"><a href="/">Trang chủ</a><a href="/?view=shop">Danh mục</a><a href="/?view=business">Gian hàng</a><a href="/policies" aria-current="page">Chính sách</a></nav></header>
  <main className="policy-container policy-main"><nav className="policy-breadcrumb" aria-label="Đường dẫn"><a href="/">Trang chủ</a><span aria-hidden="true">/</span><a href="/policies" aria-current={!active?'page':undefined}>Chính sách</a>{title&&<><span aria-hidden="true">/</span><span>{title}</span></>}</nav>
   <div className="policy-layout"><div className="policy-content">{children}</div></div>
  </main>
  <ShopFooter company={COMPANY}/>
 </div>;
}
