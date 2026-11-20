import 'server-only';

export async function sendShopWelcomeEmail(email:string,fullName:string){
 const secret=process.env.SHOP_MAIL_BRIDGE_SECRET;
 if(!secret)throw new Error('Dịch vụ email chưa được cấu hình');
 const endpoint=process.env.SHOP_MAIL_BRIDGE_URL||'http://127.0.0.1:3060/api/internal/mail';
 if(!/^http:\/\/127\.0\.0\.1:\d{2,5}\/api\/internal\/mail$/.test(endpoint))throw new Error('Địa chỉ dịch vụ email không hợp lệ');
 const response=await fetch(endpoint,{
  method:'POST',
  headers:{'Content-Type':'application/json','x-ywonder-mail-token':secret},
  body:JSON.stringify({purpose:'shop-welcome',email,fullName}),
  cache:'no-store',
  signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)throw new Error('Không gửi được email xác nhận đăng ký');
}
