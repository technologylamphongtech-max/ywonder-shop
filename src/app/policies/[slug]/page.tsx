import {CompanyLegalInfo} from '../../../components/CompanyLegalInfo';
import FeeSchedule from '../../../components/policies/FeeSchedule';
import {notFound} from 'next/navigation';
import {readPolicies} from '../../../lib/policy-store';
import {policyText,policyDate} from '../../../lib/policy-model';
import {PolicyShell} from '../../../components/policies/PolicyShell';
import {CompanyBankAccount} from '../../../components/policies/CompanyBankAccount';

export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:{slug:string}}){const p=(await readPolicies()).documents.find(x=>x.slug===params.slug);return {title:p?`${p.title} | YWonderShop`:'Chính sách | YWonderShop',description:p?.description}}
export default async function PolicyPage({params}:{params:{slug:string}}){
 const bundle=await readPolicies(),COMPANY=bundle.company,policy=bundle.documents.find(x=>x.slug===params.slug);if(!policy)notFound();
 const meta=policy,POLICY_UPDATED=policyDate(policy.effectiveDate),display=(text:string)=>policyText(text,COMPANY);
 return <PolicyShell active={meta.slug}><article className="policy-article"><header className="policy-article-head"><span className="policy-kicker">CHÍNH SÁCH YWONDER SHOP</span><h1>{meta.title}</h1><div className="policy-updated">Hiệu lực từ {POLICY_UPDATED} · Áp dụng tại shop.ywonder.net</div></header><div className="policy-reading"><div className="policy-document"><p className="policy-intro">{display(policy.intro)}</p><div className="policy-sections">{meta.slug==='bieu-phi-va-doi-soat'&&<FeeSchedule/>}{policy.sections.map((section,index)=><section id={'muc-'+(index+1)} key={display(section.title)}><h2>{display(section.title)}</h2>{section.paragraphs?.map(text=><p key={text} style={{whiteSpace:'pre-line'}}>{display(text)}</p>)}{section.items&&<ul>{section.items.map(text=><li key={text}>{display(text)}</li>)}</ul>}{section.bank&&<CompanyBankAccount/>}</section>)}</div><section className="policy-article-contact"><h2>Thông tin đơn vị và kênh hỗ trợ</h2><dl><div><dt>Tên công ty</dt><dd>{COMPANY.name}</dd></div><div><dt>Mã số thuế</dt><dd>{COMPANY.taxCode}</dd></div><div><dt>Địa chỉ</dt><dd>{COMPANY.address}</dd></div><div><dt>Điện thoại</dt><dd><a href={COMPANY.phoneHref}>{COMPANY.phone}</a></dd></div><div><dt>Email</dt><dd><a href={'mailto:'+COMPANY.email}>{COMPANY.email}</a></dd></div></dl><CompanyLegalInfo company={COMPANY}/><p><a href="/support">Gửi và theo dõi yêu cầu hỗ trợ ↗</a></p></section><a className="policy-all-link" href="/policies">← Xem tất cả chính sách</a></div><aside className="policy-contents" aria-label="Mục lục chính sách"><h2>Trong chính sách này</h2><ol>{policy.sections.map((section,index)=><li key={section.title}><a href={'#muc-'+(index+1)}>{display(section.title)}</a></li>)}</ol><a className="policy-directory" href="/policies">Tất cả chính sách ↗</a></aside></div></article></PolicyShell>;
}
