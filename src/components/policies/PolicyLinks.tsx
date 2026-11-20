import type {PolicyCompany} from '../../lib/policy-model';
import {POLICY_LINKS} from '../../lib/policy-links';
import type {PolicyLink} from '../../lib/policy-model';
import {REQUIRED_POLICIES} from '../../lib/required-policies';
import styles from './PolicyLinks.module.css';

export function PolicyLinks({variant='list',active,links=POLICY_LINKS}:{variant?:'list'|'footer';active?:string;links?:readonly PolicyLink[]}){
 return <nav className={variant==='footer'?styles.footer:styles.list} aria-label="Các chính sách YWonderShop">{links.map(p=><a key={p.slug} href={'/policies/'+p.slug} aria-current={active===p.slug?'page':undefined}><span>{p.short}</span><span aria-hidden="true">↗</span></a>)}</nav>;
}
export function PolicyAccessLink(){
 return <a className={styles.entry} href="/policies"><span className={styles.entryIcon} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 4.5 6v5.5c0 4.4 3.3 7.8 7.5 9.5 4.2-1.7 7.5-5.1 7.5-9.5V6L12 3Z"/><path d="m8.5 12 2.3 2.3 4.7-4.8"/></svg></span><span><b>Chính sách & hỗ trợ</b><small>Thanh toán, giao nhận và quyền lợi khách hàng</small></span><span aria-hidden="true">›</span></a>;
}
export function FooterPolicies({company,links=POLICY_LINKS}:{links?:readonly PolicyLink[];company?:PolicyCompany}){
 const bySlug=new Map(links.map(link=>[link.slug,link]));
 return <section className={styles.section} aria-labelledby="footer-policies-title"><div className={styles.sectionHead}><h2 id="footer-policies-title">Chính sách & hỗ trợ</h2><a href="/policies">Xem tất cả <span aria-hidden="true">↗</span></a></div>{company&&<div className={styles.company}><strong>{company.name}</strong><p>Mã số thuế: {company.taxCode}<br/>{company.address}</p><p><a href={company.phoneHref}>{company.phone}</a> · <a href={'mailto:'+company.email}>{company.email}</a></p></div>}<nav aria-label="Các chính sách cần biết"><ul className={styles.requiredList}>{REQUIRED_POLICIES.map(policy=>{const link=bySlug.get(policy.slug);return <li key={policy.slug}><a href={'/policies/'+policy.slug} aria-label={link?.title||policy.title}>{link?.short||policy.title}</a></li>})}</ul></nav></section>;
}
