'use client';
import {useState} from 'react';
import {dynamicPaymentQrUrl,paymentQrAsset} from '../lib/payment-bank';

const money=(value:number)=>Number(value||0).toLocaleString('vi-VN')+'₫';
export default function BankTransferCard({payment}:{payment:any}){
 const [imageFailed,setImageFailed]=useState(false),[copied,setCopied]=useState('');
 const bank={bankName:payment.paymentBankName,bankCode:payment.paymentBankCode,accountNumber:payment.paymentAccountNumber,accountName:payment.paymentAccountName};
 const dynamicQr=dynamicPaymentQrUrl(bank,Number(payment.paymentAmount),String(payment.paymentMemo||''));
 const backupQr=payment.paymentQrAvailable?`/api/market?action=orderQr&id=${encodeURIComponent(payment.id)}`:paymentQrAsset(bank);
 const qr=imageFailed?backupQr:dynamicQr||backupQr;
 const automatic=!!dynamicQr&&!imageFailed;
 const copy=async(value:string,label:string)=>{try{await navigator.clipboard.writeText(value);setCopied(`Đã sao chép ${label}`)}catch{setCopied('Không sao chép tự động được. Vui lòng chọn và sao chép thông tin bên dưới.')}};
 return <section className="bank-payment-card" aria-label="Thanh toán chuyển khoản">
  <div><strong>{payment.paymentStatus==='VERIFIED'?'Đã đối soát chuyển khoản':payment.paymentStatus==='CANCELLED'?'Đơn chuyển khoản đã hủy':'Quét QR để thanh toán'}</strong><p>{automatic?'QR đã điền sẵn số tiền và nội dung của đơn. Kiểm tra lại cả ba thông tin trong ứng dụng ngân hàng trước khi xác nhận: người thụ hưởng, số tiền và nội dung chuyển khoản.':'Kiểm tra người thụ hưởng và nhập đúng số tiền, nội dung chuyển khoản bên dưới khi thanh toán.'}</p></div>
  {payment.paymentStatus==='AWAITING'&&qr&&<img className="bank-payment-qr" src={qr} alt={automatic?`VietQR chuyển ${money(payment.paymentAmount)} với nội dung ${payment.paymentMemo} tới ${bank.accountNumber}`:`VietQR tài khoản ${bank.bankName} ${bank.accountNumber}`} loading="lazy" referrerPolicy="no-referrer" onError={()=>setImageFailed(true)}/>}
  {payment.paymentStatus==='AWAITING'&&!automatic&&<p className="bank-payment-fallback">{qr?'QR dự phòng chỉ chứa số tài khoản. Vui lòng nhập đúng số tiền và nội dung chuyển khoản bên dưới.':'QR tạm thời không tải được. Vui lòng chuyển khoản theo thông tin bên dưới.'}</p>}
  <dl><div><dt>Ngân hàng</dt><dd>{bank.bankName}</dd></div><div><dt>Số tài khoản</dt><dd><b>{bank.accountNumber}</b> <button type="button" onClick={()=>copy(bank.accountNumber,'số tài khoản')}>Sao chép</button></dd></div><div><dt>Chủ tài khoản</dt><dd>{bank.accountName}</dd></div><div><dt>Số tiền</dt><dd><b>{money(payment.paymentAmount)}</b></dd></div><div><dt>Nội dung chuyển khoản</dt><dd><b>{payment.paymentMemo}</b> <button type="button" onClick={()=>copy(payment.paymentMemo,'nội dung')}>Sao chép</button></dd></div></dl>
  {payment.paymentStatus==='AWAITING'&&<p>Chuyển đúng số tiền và nội dung. Gian hàng sẽ xử lý sau khi đối soát tiền thực nhận.</p>}
  {payment.paymentStatus==='VERIFIED'&&<p>{payment.paymentReference?'Đã đối soát. Mã giao dịch: '+payment.paymentReference+'.':'Đã được đối soát thủ công.'}</p>}
  {copied&&<small role="status">{copied}</small>}
 </section>;
}
