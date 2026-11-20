import './reference.css';
import './market.css';
import './attendance.css';
import './product-card.css';
import './appearance.css';
import './desktop-home.css';
import './featured-home.css';
import './catalog.css';
import './account-three.css';
import './shop-ux.css';
import './shop-design.css';
import AppearanceControls from '../components/AppearanceControls';
export const metadata={title:'YWonder Shop — Tiện ích mỗi ngày',description:'Mua sắm, mở gian hàng và khám phá những lựa chọn cho cuộc sống mỗi ngày.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="vi" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:"document.documentElement.dataset.ywTheme='light';document.documentElement.dataset.ywArea=location.pathname.indexOf('/admin')===0?'admin':'shop';"}}/></head><body><AppearanceControls/>{children}</body></html>}
