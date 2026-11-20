import {readPolicies} from '../../lib/policy-store';
import {policyLinks} from '../../lib/policy-model';
import {PolicyShell} from '../../components/policies/PolicyShell';
import PolicyDirectory from '../../components/policies/PolicyDirectory';

export const metadata={title:'Chính sách & hỗ trợ | YWonderShop',description:'Các chính sách bảo mật, thanh toán, vận chuyển, đổi trả và quyền lợi khách hàng tại YWonderShop.'};
export const dynamic='force-dynamic';
export default async function PoliciesPage(){
 const bundle=await readPolicies(),COMPANY=bundle.company,links=policyLinks(bundle);
 return <PolicyShell><PolicyDirectory links={links} phone={COMPANY.phone} phoneHref={COMPANY.phoneHref}/></PolicyShell>;
}
