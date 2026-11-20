import {notFound} from 'next/navigation';
import {rows} from '../../../lib/db';
import {attachProductLegal} from '../../../lib/compliance';
import {defaultProductKind} from '../../../lib/compliance-model';
import {PHONG_CHAU_STORE_ID,PHONG_CHAU_COMBO_PRODUCT_ID} from '../../../lib/affiliate';
import {marketUser} from '../../../lib/market-auth';
import {canSeePhongChauCombo} from '../../../lib/phongchau-combo';
import {productImages,productSpecs} from '../../../lib/product-detail';
import {createProductReferralToken} from '../../../lib/product-referral';
import ProductDetailClient from './product-detail-client';
import './product-detail.css';
import '../../floating-cart.css';

export const dynamic='force-dynamic';

export default async function ProductPage({params,searchParams}:{params:{id:string};searchParams?:{pcRef?:string;ref?:string}}){
 const product=(await attachProductLegal(await rows("SELECT p.*,c.name categoryName,s.name storeName FROM MarketProduct p JOIN MarketCategory c ON c.id=p.categoryId LEFT JOIN MarketStore s ON s.id=p.storeId WHERE p.id=? AND p.active=1 AND c.active=1 AND (p.storeId IS NULL OR s.status='APPROVED') LIMIT 1",params.id)))[0];
 if(!product)notFound();
 if(product.id===PHONG_CHAU_COMBO_PRODUCT_ID&&!await canSeePhongChauCombo(await marketUser()))notFound();
 const regulated=defaultProductKind(product.categoryName)!=='NONE'||product.legal&&product.legal.kind!=='NONE';
 if(regulated&&(!product.legal||product.legal.kind==='NONE'||product.legal.status!=='APPROVED'||!product.legal.hasDocument))notFound();
 const candidate=typeof searchParams?.pcRef==='string'&&/^pc_[a-f0-9]{24}$/.test(searchParams.pcRef)?searchParams.pcRef:'';
 const pcRef=candidate&&product.id===PHONG_CHAU_COMBO_PRODUCT_ID&&product.storeId===PHONG_CHAU_STORE_ID&&(await rows("SELECT 1 FROM MarketStoreF1 f JOIN User u ON u.id=f.userId WHERE f.storeId=? AND f.shopRefCode=? AND u.status='ACTIVE' LIMIT 1",product.storeId,candidate)).length?candidate:'';
 const ref=typeof searchParams?.ref==='string'?searchParams.ref.slice(0,120):'';
 return <ProductDetailClient product={{id:product.id,name:product.name,sku:product.sku,categoryName:product.categoryName,storeId:product.storeId,storeName:product.storeName,price:product.price,compareAtPrice:product.compareAtPrice,stock:product.stock,description:product.description,images:productImages(product),specs:productSpecs(product),legal:product.legal}} productReferralToken={pcRef?createProductReferralToken(product.id,pcRef):''} refCode={pcRef?'':ref}/>;
}
