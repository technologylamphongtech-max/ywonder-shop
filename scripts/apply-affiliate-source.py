from pathlib import Path
root=Path(__file__).resolve().parents[1]
def edit(path,changes):
    file=root/path
    source=file.read_text(encoding='utf-8')
    for old,new in changes:
        if source.count(old)!=1: raise RuntimeError(f'{path}: expected one occurrence: {old[:80]}')
        source=source.replace(old,new)
    file.write_text(source,encoding='utf-8')

edit('src/app/api/market/route.ts',[
 ("import {saveAIKey", "import {captureAffiliateOrder,accrueAffiliateOrder,allocateDiscounts,affiliateSummary} from '../../../lib/affiliate';\nimport {saveAIKey"),
 ('aiConfigured:await aiConfigured()', 'affiliate:await affiliateSummary({$queryRawUnsafe:rows,$executeRawUnsafe:run}),aiConfigured:await aiConfigured()'),
 ('profile:profileView,favorites:', 'profile:profileView,affiliate:await affiliateSummary({$queryRawUnsafe:rows,$executeRawUnsafe:run},u.id),favorites:'),
 ("const ref=text(b.refCode,120);const referrer=ref?(await db.user.findFirst({where:{refCode:ref,status:'ACTIVE'}})):null;", "const ref=text(b.refCode,120);const referrer=ref?(await db.user.findFirst({where:{OR:[{refCode:ref},{refCode:ref.toLowerCase()}],status:'ACTIVE',role:{notIn:['ADMIN','SUPER_ADMIN']}}})):null;if(ref&&!referrer)fail('Mã giới thiệu không hợp lệ hoặc tài khoản đã bị khóa');"),
 ('businessLicenseImage=?,description=?,status=', 'businessLicenseImage=?,description=?,status='),
 ('MarketStore(id,userId,name,phone,address,taxCode,businessLicenseImage,description,created) VALUES(?,?,?,?,?,?,?,?,?)', 'MarketStore(id,userId,name,phone,address,taxCode,businessLicenseImage,description,created,affiliateReferrerId) VALUES(?,?,?,?,?,?,?,?,?,?)'),
 ('id(),u.id,...values,now());\n }else if(action===\'product\')', "id(),u.id,...values,now(),u.referredById||null);\n }else if(action==='product')"),
 ('let remainingDiscount=discount+voucherDiscount+pointDiscount+ywbDiscount;', 'const itemDiscounts=allocateDiscounts(priced.map(p=>p.price*p.quantity),discount+voucherDiscount+pointDiscount+ywbDiscount);'),
 ('const d=i===priced.length-1?remainingDiscount:Math.floor((discount+pointDiscount)*gross/subtotal);remainingDiscount-=d;', 'const d=itemDiscounts[i];'),
 ("await notify(tx,u.id,'Đặt hàng thành công'", "await captureAffiliateOrder(tx,oid,u.id);\n   await notify(tx,u.id,'Đặt hàng thành công'"),
 ("if(status==='COMPLETED'){if(o.rewardPoints)", "if(status==='COMPLETED'){await accrueAffiliateOrder(tx,o,items);if(o.rewardPoints)"),
])
edit('src/app/page.tsx',[
 ("import LoyaltyPanel", "import AffiliatePanel from '../components/affiliate/AffiliatePanel';\nimport LoyaltyPanel"),
 ('if(ref)setRefCode(ref);', "if(ref){setRefCode(ref);setRegistration(true);setView('account');setMobileAccountAuth(true);}"),
 ('href="https://ywonder.net/vi/register">Đăng ký ngay</a>', 'href={refCode?`https://ywonder.net/vi/register?ref=${encodeURIComponent(refCode)}`:"https://ywonder.net/vi/register"}>Đăng ký ngay</a>'),
 ("['loyalty','Xu & YWH','Điểm danh", "['affiliate','Affiliate','Hoa hồng bán hàng · chung với HUB','/assets/nav-icons/business.png'],['loyalty','Xu & YWH','Điểm danh"),
 ("['loyalty','Xu & YWH'],['wallet'", "['affiliate','Affiliate'],['loyalty','Xu & YWH'],['wallet'"),
 ("{accountTab==='loyalty'&&", "{accountTab==='affiliate'&&<AffiliatePanel affiliate={account.affiliate} refCode={me.refCode}/>}\n {accountTab==='loyalty'&&"),
])
edit('src/components/admin/AdminPortal.tsx',[
 ("import styles from", "import AffiliatePanel from '../affiliate/AffiliatePanel';\nimport styles from"),
 ("| 'hubs' | 'transfers'", "| 'hubs' | 'affiliate' | 'transfers'"),
 ("['hubs', 'HUB gần bạn', '⌖'],", "['hubs', 'HUB gần bạn', '⌖'],\n    ['affiliate', 'Affiliate', '♧'],"),
 ("{tab === 'hubs' &&", "{tab === 'affiliate' && <section className={styles.content}><AffiliatePanel affiliate={data.affiliate} admin/></section>}\n        {tab === 'hubs' &&"),
])
print('Affiliate source updated')
