// Seven documents requested by the filing form, in its exact display order.
export const POLICY_PDF_DATE='20/10/2026';
export const REQUIRED_POLICIES=[
 {slug:'dieu-khoan-bao-mat',title:'Chính sách bảo mật',file:'01-chinh-sach-bao-mat.pdf'},
 {slug:'quy-trinh-giai-quyet-khieu-nai',title:'Phương thức tiếp nhận và giải quyết phản ánh, yêu cầu, khiếu nại',file:'02-tiep-nhan-giai-quyet-khieu-nai.pdf'},
 {slug:'chinh-sach-gia',title:'Chính sách giá',file:'03-chinh-sach-gia.pdf'},
 {slug:'chinh-sach-thanh-toan',title:'Chính sách về thanh toán',file:'04-chinh-sach-thanh-toan.pdf'},
 {slug:'dieu-kien-han-che-cung-cap',title:'Các điều kiện hoặc hạn chế trong việc cung cấp hàng hóa hoặc dịch vụ trên nền tảng',file:'05-dieu-kien-han-che-cung-cap.pdf'},
 {slug:'chinh-sach-doi-tra',title:'Chính sách giao hàng, đổi trả và hoàn tiền',file:'06-giao-hang-doi-tra-hoan-tien.pdf'},
 {slug:'hinh-thuc-ho-tro-truc-tuyen',title:'Hình thức hỗ trợ trực tuyến',file:'07-hinh-thuc-ho-tro-truc-tuyen.pdf'},
] as const;
export const policyPdfUrl=(file:string)=>'/filing-policies/20261020/'+file;
