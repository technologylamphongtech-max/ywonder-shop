import type {PolicyBank} from './policy-model';

// Account from the VietQR supplied by the Shop owner; 970428 is Nam A Bank's NAPAS BIN.
export const DEFAULT_SHOP_PAYMENT_BANK:PolicyBank={
 bankName:'Nam A Bank',bankCode:'970428',accountNumber:'702252070200001',
 accountName:'CONG TY CO PHAN T VA T NGUYEN'
};

// Keep the bank transfer content within VietQR Merchant's 23-character limit.
// MarketOrderBankPayment.transferMemo has a UNIQUE constraint for collision safety.
export function transferMemo(orderId:string){return 'YWS'+orderId.replace(/-/g,'').toUpperCase().slice(0,16);}

export function dynamicPaymentQrUrl(bank:PolicyBank,amount:number,memo:string){
 if(!/^\d{6}$/.test(bank.bankCode)||!/^\d{4,30}$/.test(bank.accountNumber)||!Number.isSafeInteger(amount)||amount<1||amount>9999999999999||!/^YWS[A-Z0-9]{1,47}$/.test(memo))return '';
 const url=new URL(`https://img.vietqr.io/image/${bank.bankCode}-${bank.accountNumber}-compact2.svg`);
 url.searchParams.set('amount',String(amount));
 url.searchParams.set('addInfo',memo);
 return url.toString();
}

export function paymentQrAsset(bank:PolicyBank){
 // Verified account-only QR remains available if the dynamic image cannot load.
 return bank.bankCode==='970428'&&bank.accountNumber==='702252070200001'
  ?'/assets/shop-nam-a-702252070200001-qr.png':'';
}
