export const SUPPORT_KINDS={COMPLAINT:'Khiếu nại đơn hàng',RETURN:'Yêu cầu đổi trả',WARRANTY:'Yêu cầu bảo hành',PRODUCT_REPORT:'Báo cáo sản phẩm',PRIVACY:'Yêu cầu về dữ liệu cá nhân',GENERAL:'Hỗ trợ khác / ngừng gian hàng'} as const;
export const SUPPORT_STATES={OPEN:'Đã tiếp nhận',IN_REVIEW:'Đang xử lý',WAITING_PARTIES:'Chờ bổ sung thông tin',RESOLVED:'Đã có kết quả xử lý',CLOSED:'Đã đóng'} as const;
export const LEGAL_STATES={DRAFT:'Bản nháp chưa công khai',PENDING:'Chờ kiểm tra giấy tờ',APPROVED:'Đủ hồ sơ đăng bán',CHANGES:'Cần bổ sung giấy tờ'} as const;
export const FILE_KINDS={HOSTING:'Hợp đồng máy chủ',PAYMENT:'Hợp đồng thanh toán',SHIPPING:'Hợp đồng vận chuyển',BUSINESS:'Đăng ký doanh nghiệp',OTHER:'Tài liệu khác'} as const;
export const PRODUCT_KINDS={NONE:'Hàng thông thường',COSMETIC:'Mỹ phẩm',FOOD:'Thực phẩm',OTHER:'Hàng cần giấy tờ chuyên ngành'} as const;
export type SellerLegal={businessType:string;legalName:string;representative:string;registrationNumber:string;registrationDate:string;registrationAuthority:string;contactEmail:string;returnAddress:string};
export type ProductLegal={origin:string;manufacturer:string;brand:string;condition:string;warranty:string;labelInfo:string;certificateNumber:string};
export function defaultProductKind(category:string){const s=category.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return /my pham|cham soc da|cham soc toc/.test(s)?'COSMETIC':/thuc pham|dinh duong|do uong|sua bot/.test(s)?'FOOD':'NONE'}
