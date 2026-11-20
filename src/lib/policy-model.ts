import {POLICY_LINKS} from './policy-links';
import {POLICY_CONTENT} from './policies';
import {COMPANY} from './company';
import type {PolicySection} from './policies';

export type PolicyCompany={name:string;taxCode:string;address:string;phone:string;email:string;phoneHref:string;legalRepresentative?:string;registrationDate?:string;registrationAuthority?:string;returnAddress?:string;complaintEmail?:string;complaintPhone?:string};
export type PolicyBank={bankName:string;bankCode:string;accountNumber:string;accountName:string};
export type PolicyDocument={slug:string;title:string;short:string;description:string;intro:string;effectiveDate:string;sections:PolicySection[]};
export type PolicyBundle={version:number;updatedAt:number;company:PolicyCompany;bank:PolicyBank;documents:PolicyDocument[]};
export type PolicyLink=Pick<PolicyDocument,'slug'|'title'|'short'|'description'>;

export function defaultPolicies(bank:PolicyBank):PolicyBundle{
 return {version:0,updatedAt:0,company:{name:COMPANY.name,taxCode:COMPANY.taxCode,address:COMPANY.address,phone:COMPANY.phone,email:COMPANY.email,phoneHref:COMPANY.phoneHref},bank,documents:POLICY_LINKS.map(meta=>({...meta,...JSON.parse(JSON.stringify(POLICY_CONTENT[meta.slug])),effectiveDate:'2026-11-13'}))};
}
export function policyLinks(bundle:PolicyBundle):PolicyLink[]{return bundle.documents.map(({slug,title,short,description})=>({slug,title,short,description}))}
// Existing company mentions follow the common company settings, including old saved copies.
export function policyText(value:string,company:PolicyCompany){return value.replace(/Công ty Cổ phần T & T Nguyên|CÔNG TY CỔ PHẦN T & T NGUYÊN|\{\{company.name\}\}/g,()=>company.name)}
export function policyDate(value:string){return value.split('-').reverse().join('/')}
