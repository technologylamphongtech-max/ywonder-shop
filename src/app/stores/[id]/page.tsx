import {notFound} from 'next/navigation';
import {publicStores,attachProductLegal} from '../../../lib/compliance';
import {rows} from '../../../lib/db';
import {defaultProductKind} from '../../../lib/compliance-model';
import styles from '../../../components/Compliance.module.css';
import StoreReferralReset from './store-referral-reset';
import {PHONG_CHAU_COMBO_PRODUCT_ID} from '../../../lib/affiliate';
import {marketUser} from '../../../lib/market-auth';
import {canSeePhongChauCombo} from '../../../lib/phongchau-combo';

export const dynamic='force-dynamic';

export default async function StorePage({params}:{params:{id:string}}){
 const store=(await publicStores()).find(item=>item.id===params.id);
 if(!store)notFound();
 const shopHref='/?view=shop&store='+encodeURIComponent(store.id);
 const homeHref='/?view=home';
 const products=await attachProductLegal(await rows('SELECT p.*,c.name categoryName FROM MarketProduct p JOIN MarketCategory c ON c.id=p.categoryId WHERE storeId=? AND p.active=1 AND c.active=1 ORDER BY p.created DESC',store.id));
 const comboVisible=await canSeePhongChauCombo(await marketUser());
 const visible=products.filter(product=>{if(product.id===PHONG_CHAU_COMBO_PRODUCT_ID&&!comboVisible)return false;const regulated=defaultProductKind(product.categoryName)!=='NONE'||product.legal&&product.legal.kind!=='NONE';return !regulated||product.legal?.kind!=='NONE'&&product.legal?.status==='APPROVED'&&product.legal?.hasDocument});
 return <main className={styles.shell}><StoreReferralReset/><div className={styles.root}>
  <header className={styles.head}><a href={homeHref}><img src="/assets/ywonder-shop-logo.svg" alt="YWonderShop"/></a><a href={shopHref}>← Cửa hàng</a></header>
  <small>GIAN HÀNG TRÊN YWONDERSHOP</small><h1>{store.name}</h1><p style={{whiteSpace:'pre-line'}}>{store.description}</p>
  <a className={styles.button} href={shopHref}>Khám phá và mua sản phẩm ↗</a>
  <section className={styles.card}><h2>Thông tin người bán</h2><dl className={styles.meta}>{Object.entries({name:'Tên gian hàng',taxCode:'Mã số thuế',address:'Địa chỉ',phone:'Điện thoại'}).map(([key,label])=><div key={key} style={{display:'contents'}}><dt>{label}</dt><dd>{store[key]}</dd></div>)}</dl>{store.legal?<dl className={styles.meta}>{Object.entries({legalName:'Tên pháp lý',representative:'Người đại diện',registrationNumber:'Số đăng ký',registrationDate:'Ngày cấp',registrationAuthority:'Cơ quan cấp',contactEmail:'Email',returnAddress:'Tiếp nhận đổi trả'}).map(([key,label])=><div key={key} style={{display:'contents'}}><dt>{label}</dt><dd>{store.legal[key]}</dd></div>)}</dl>:<p>Gian hàng đang bổ sung thông tin pháp lý chi tiết. Liên hệ hỗ trợ trước khi giao dịch nếu cần xác nhận.</p>}<a href="/support">Liên hệ hỗ trợ sàn ↗</a></section>
  <h2>Sản phẩm của gian hàng</h2><div className={styles.grid}>{visible.map(product=><article className={styles.card} key={product.id}>{product.image&&<img src={product.image} alt={product.name} style={{width:'100%',maxWidth:'100%',height:170,objectFit:'contain'}}/>}<h3>{product.name}</h3><p>Mã: {product.sku}</p><b>{Number(product.price).toLocaleString('vi-VN')}₫</b><p><a href={'/products/'+encodeURIComponent(product.id)}>Xem và đặt tại cửa hàng ↗</a></p></article>)}</div>
 </div></main>;
}
