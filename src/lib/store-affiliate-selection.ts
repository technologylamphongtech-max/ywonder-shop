import {randomBytes,randomUUID} from 'crypto';
import {PHONG_CHAU_STORE_ID} from './affiliate';

type Sql={$queryRawUnsafe:(query:string,...values:any[])=>Promise<any[]>;$executeRawUnsafe:(query:string,...values:any[])=>Promise<number>};

export async function storeAffiliateMembers(tx:Sql,ownerId:string){
 const store=(await tx.$queryRawUnsafe('SELECT id,name,status FROM MarketStore WHERE id=? AND userId=?',PHONG_CHAU_STORE_ID,ownerId))[0];
 if(!store||store.status!=='APPROVED')throw new Error('Chỉ chủ gian hàng Phong Châu đang hoạt động được quản lý F1');
 const members=await tx.$queryRawUnsafe('SELECT f.userId,f.created,f.shopRefCode,u.username,u.fullName,u.email,u.status FROM MarketStoreF1 f JOIN User u ON u.id=f.userId WHERE f.storeId=? ORDER BY f.created DESC,u.username',store.id);
 return {store:{id:store.id,name:store.name},members};
}

export async function setStoreAffiliateMember(tx:Sql,ownerId:string,input:{account?:unknown;userId?:unknown;selected?:unknown}){
 const store=(await tx.$queryRawUnsafe('SELECT id,status FROM MarketStore WHERE id=? AND userId=?',PHONG_CHAU_STORE_ID,ownerId))[0];
 if(!store||store.status!=='APPROVED')throw new Error('Chỉ chủ gian hàng Phong Châu đang hoạt động được quản lý F1');
 if(typeof input.selected!=='boolean')throw new Error('Trạng thái lựa chọn không hợp lệ');
 const account=typeof input.account==='string'?input.account.trim().toLowerCase():'';
 const userId=typeof input.userId==='string'?input.userId.trim():'';
 if(input.selected&&!account)throw new Error('Nhập chính xác tên đăng nhập hoặc email');
 if(!input.selected&&!userId)throw new Error('Tài khoản cần thu hồi không hợp lệ');
 const member=(await tx.$queryRawUnsafe(input.selected?'SELECT id,username,fullName,email,status,role FROM User WHERE lower(username)=? OR lower(email)=? LIMIT 1':'SELECT id,username,fullName,email,status,role FROM User WHERE id=? LIMIT 1',...(input.selected?[account,account]:[userId])))[0];
 if(!member)throw new Error('Không tìm thấy tài khoản người dùng');
 if(member.id===ownerId||['ADMIN','SUPER_ADMIN'].includes(member.role))throw new Error('Tài khoản này không thể tham gia F1 gian hàng');
 if(input.selected&&member.status!=='ACTIVE')throw new Error('Tài khoản phải đang hoạt động');
 const existing=(await tx.$queryRawUnsafe('SELECT 1 FROM MarketStoreF1 WHERE storeId=? AND userId=?',store.id,member.id))[0];
 if(input.selected&&existing)throw new Error('Tài khoản đã được chọn');
 if(!input.selected&&!existing)throw new Error('Tài khoản không có trong danh sách F1');
 const stamp=Date.now();
 if(input.selected)await tx.$executeRawUnsafe('INSERT INTO MarketStoreF1(storeId,userId,created,shopRefCode) VALUES(?,?,?,?)',store.id,member.id,stamp,'pc_'+randomBytes(12).toString('hex'));
 else await tx.$executeRawUnsafe('DELETE FROM MarketStoreF1 WHERE storeId=? AND userId=?',store.id,member.id);
 await tx.$executeRawUnsafe('INSERT INTO MarketAudit VALUES(?,?,?,?,?)',randomUUID(),ownerId,input.selected?'affiliate:store-f1-select':'affiliate:store-f1-revoke',`${store.id}:${member.id}`,stamp);
 await tx.$executeRawUnsafe('INSERT INTO MarketNotification VALUES(?,?,?,?,0,?)',randomUUID(),member.id,input.selected?'Được chọn tham gia affiliate Phong Châu':'Đã kết thúc tham gia affiliate Phong Châu',input.selected?'Gian hàng Phong Châu đã chọn bạn tham gia chương trình F1. Xem mục Affiliate để chia sẻ link gian hàng.':'Gian hàng Phong Châu đã thu hồi quyền tham gia cho đơn mới. Các khoản đã ghi nhận trước đây vẫn được giữ nguyên.',stamp);
 return {member:{id:member.id,username:member.username,fullName:member.fullName,email:member.email},selected:input.selected};
}
