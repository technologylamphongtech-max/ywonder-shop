export type PolicySection={title:string;paragraphs?:string[];items?:string[];bank?:boolean};
export const POLICY_UPDATED='13/11/2026';
export const POLICY_CONTENT:Record<string,{intro:string;sections:PolicySection[]}>= {
 'dieu-khoan-bao-mat':{
  intro:'YWonderShop sử dụng thông tin để vận hành tài khoản, thực hiện đơn hàng và hỗ trợ khách hàng. Đơn vị quản lý thông tin là {{company.name}}.',
  sections:[
   {title:'1. Thông tin được tiếp nhận',items:['Họ tên, email, số điện thoại, địa chỉ giao hàng và thông tin bạn gửi khi cần hỗ trợ.','Đơn hàng, lịch sử thanh toán, Xu, YWH, voucher và mã giới thiệu; hồ sơ doanh nghiệp khi đăng ký gian hàng.','Cookie phiên đăng nhập và dữ liệu kỹ thuật cần thiết để bảo vệ tài khoản, phòng chống gian lận.']},
   {title:'2. Mục đích sử dụng',paragraphs:['Thông tin được dùng để xác thực tài khoản, giao hàng, đối soát, xử lý đổi trả và bảo mật. Thông tin liên kết YWonderHub phục vụ chuyển YWH và ghi nhận affiliate trong hệ sinh thái. Thông báo ưu đãi được quản lý trong phần Cài đặt tài khoản.']},
   {title:'3. Phạm vi tiếp cận và chia sẻ',paragraphs:['Nhân sự được phân quyền, gian hàng thực hiện đơn, đơn vị giao nhận và nhà cung cấp dịch vụ liên quan chỉ tiếp cận dữ liệu cần thiết cho công việc. Thông tin có thể được cung cấp theo yêu cầu hợp pháp của cơ quan có thẩm quyền. YWonderShop không bán hoặc cho thuê dữ liệu cá nhân.']},
   {title:'4. Lưu trữ và bảo vệ',paragraphs:['Dữ liệu được lưu trong thời gian phục vụ tài khoản, giao dịch và các nghĩa vụ lưu trữ có liên quan. Hệ thống sử dụng kết nối HTTPS, bảo vệ mật khẩu bằng hàm băm và phân quyền quản trị. Không chia sẻ mật khẩu hoặc mã xác thực với người khác.']},
   {title:'5. Quyền kiểm tra, chỉnh sửa và yêu cầu xử lý',paragraphs:['Bạn có thể cập nhật hồ sơ, địa chỉ và tùy chọn thông báo trong tài khoản. Để đề nghị truy cập, sửa, xóa dữ liệu hoặc phản ánh việc sử dụng sai mục đích, liên hệ bộ phận hỗ trợ. Yêu cầu được xác minh chủ thể và xử lý theo phạm vi pháp luật cho phép; dữ liệu cần lưu cho giao dịch hoặc nghĩa vụ pháp lý không bị xóa tùy tiện.']},
  ]
 },
 'chinh-sach-doi-tra':{
  intro:'Chính sách áp dụng cho đơn hàng trên YWonderShop. Thông tin giao nhận và điều kiện riêng của sản phẩm cần được công bố trước khi khách hàng đặt mua.',
  sections:[
   {title:'1. Vận chuyển và giao nhận',paragraphs:['Gian hàng chịu trách nhiệm tổ chức giao hàng theo địa chỉ, tồn kho và đặc tính hàng hóa của đơn. Phạm vi, thời gian và phí giao hàng được thể hiện hoặc xác nhận trước khi khách đặt mua; nếu cần thay đổi, gian hàng phải thông báo để khách đồng ý trước khi thực hiện. Sản phẩm được thông báo là không giao hàng sẽ được ghi nhận theo điều kiện riêng tại trang sản phẩm và bước đặt đơn.']},
   {title:'2. Kiểm tra khi nhận hàng',paragraphs:['Đối chiếu kiện hàng, số lượng, mẫu mã và tình trạng bên ngoài cùng nhân viên giao nhận khi điều kiện giao hàng cho phép. Nếu phát hiện sai hoặc hư hỏng, ghi nhận với đơn vị giao hàng và liên hệ hỗ trợ. Ảnh, video và chứng từ là tài liệu hữu ích để xác minh; không chỉ giới hạn ở video mở hàng.']},
   {title:'3. Đổi trả thông thường trong 7 ngày',items:['Giao sai sản phẩm, thiếu hàng, lỗi từ nhà sản xuất hoặc hư hại khi vận chuyển: liên hệ để được xác minh, đổi, giao bù hoặc hoàn tiền; bên có trách nhiệm chịu phí xử lý và vận chuyển phù hợp.','Đặt nhầm hoặc đổi nhu cầu: sản phẩm còn nguyên trạng, đủ phụ kiện, chưa sử dụng; khách chịu chi phí đổi và chênh lệch đã thống nhất.','Hàng đặt riêng, dễ hư hỏng, có yêu cầu vệ sinh hoặc đã sử dụng áp dụng điều kiện được thông báo trước khi mua. Quyền xử lý hàng lỗi và bảo hành không bị thay thế bởi thời hạn đổi ý thông thường.']},
   {title:'4. Gửi yêu cầu và hoàn tiền',paragraphs:['Cung cấp mã đơn, mô tả và tài liệu liên quan. Chỉ gửi hàng về địa chỉ kho do hỗ trợ xác nhận. Khi đã nhận, kiểm tra hàng và chấp thuận hoàn, việc hoàn tiền được thực hiện trong 3–5 ngày làm việc; thời gian ngân hàng ghi có có thể khác. Xu, YWH và voucher được đối soát riêng theo phần đã sử dụng, không tự quy thành tiền mặt.']},
  ]
 },
 'chinh-sach-thanh-toan':{
  intro:'Kiểm tra người nhận, sản phẩm, ưu đãi, phí giao hàng và số tiền còn phải trả trước khi xác nhận đơn. Tiền chuyển khoản cho đơn hàng được gửi vào tài khoản của gian hàng hiển thị trên chính đơn đó.',
  sections:[
   {title:'1. Thanh toán khi nhận hàng',paragraphs:['Với sản phẩm có giao hàng, khách có thể chọn thanh toán khi nhận hàng (COD) nếu phương thức này hiển thị tại bước đặt đơn. Khách thanh toán số tiền còn lại theo đơn khi nhận hàng và giữ chứng từ. Sản phẩm không giao hàng chỉ áp dụng phương thức được công bố riêng tại bước đặt mua.']},
   {title:'2. Chuyển khoản bằng VietQR hoặc số tài khoản',paragraphs:['Khi chọn chuyển khoản, YWonderShop tách giỏ hàng theo từng gian hàng thành các đơn riêng. Mỗi đơn hiển thị tài khoản nhận tiền của gian hàng, số tiền và nội dung chuyển khoản riêng. QR có thể điền sẵn số tiền và nội dung; khách vẫn cần kiểm tra lại các thông tin trong ứng dụng ngân hàng. Không chuyển tiền theo một số tài khoản chung lấy từ trang chính sách.'],bank:true},
   {title:'3. Đối chiếu và xác nhận thanh toán',paragraphs:['Gian hàng trực tiếp nhận tiền và kiểm tra tiền thực nhận trên sao kê trước khi duyệt đơn của mình. Việc tạo đơn, quét QR hoặc gửi ảnh biên lai không tự động xác nhận đã thanh toán. Khi chuyển nhầm tài khoản, thiếu, thừa hoặc sai nội dung, khách cần giữ biên lai, mã đơn và liên hệ gian hàng hoặc bộ phận hỗ trợ để đối chiếu. Những đơn cũ dùng tài khoản của sàn được quản trị viên đối soát theo thông tin trên chính đơn đó.']},
   {title:'4. Xu, YWH và voucher',paragraphs:['Xu, YWH hoặc voucher chỉ được áp dụng khi đơn hàng hiển thị điều kiện sử dụng và giá trị giảm tương ứng. YWH từ YWonderHub chuyển vào Shop theo tỷ lệ 1:1 khi đủ số dư khả dụng, không cần duyệt. Việc chuyển YWH không tự thanh toán một đơn hàng; phần giảm được tính khi khách xác nhận sử dụng tại bước đặt hàng. Giỏ nhiều gian hàng có thể cần đặt riêng từng gian hàng để dùng các quyền lợi này.']},
  ]
 },
 'chinh-sach-gia':{
  intro:'YWonderShop công khai giá hàng hóa và các khoản thanh toán để khách hàng đối chiếu trước khi mua.',
  sections:[
   {title:'1. Giá sản phẩm',paragraphs:['Giá được niêm yết bằng đồng Việt Nam (VNĐ) theo từng sản phẩm, đơn vị và số lượng. Thông tin thuế, hóa đơn và điều kiện riêng do bên bán công bố hoặc xác nhận trước khi chốt giao dịch; liên hệ gian hàng hoặc hỗ trợ khi cần hóa đơn.']},
   {title:'2. Tổng tiền và chi phí',paragraphs:['Đơn hàng thể hiện tiền hàng, khoản giảm hợp lệ, phí vận chuyển và số tiền phải trả. Giá niêm yết không mặc định bao gồm vận chuyển. Các dịch vụ bổ sung chỉ được tính khi thông báo rõ và được khách chấp thuận trước; không thu thêm khoản ngoài thỏa thuận khi giao hàng.']},
   {title:'3. Ưu đãi và thay đổi giá',paragraphs:['Khuyến mãi, voucher, Xu và YWH có điều kiện, thời hạn và giới hạn sử dụng riêng. Việc kết hợp được kiểm tra khi đặt đơn. Giá có thể thay đổi với giao dịch mới; đơn đã xác nhận không bị tự tăng giá. Khi phát hiện nhầm lẫn giá, bên bán liên hệ để thống nhất phương án thay vì tự ý thu thêm.']},
   {title:'4. Phí sàn và gian hàng',paragraphs:['Phí sàn áp dụng cho doanh nghiệp bán hàng theo tỷ lệ cấu hình và thỏa thuận hợp tác. Khoản này được thể hiện trong đối soát của gian hàng, không tự cộng thêm vào tiền khách phải trả ngoài tổng đơn đã xác nhận.']},
  ]
 },
 'quy-trinh-giai-quyet-khieu-nai':{
  intro:'Khách hàng có thể phản ánh về giao hàng, chất lượng, thanh toán, dữ liệu cá nhân hoặc quyền lợi phát sinh trên YWonderShop qua các kênh hỗ trợ bên dưới.',
  sections:[
   {title:'1. Thông tin cần cung cấp',paragraphs:['Gửi họ tên, thông tin liên hệ, mã đơn hoặc mã giao dịch, vấn đề cần xử lý và phương án mong muốn. Bổ sung ảnh, video, biên lai hoặc trao đổi liên quan nếu có. Không gửi mật khẩu, mã OTP hoặc thông tin thẻ đầy đủ.']},
   {title:'2. Quy trình hỗ trợ',items:['Tiếp nhận yêu cầu, kiểm tra thông tin và liên hệ bổ sung khi cần.','Đối chiếu đơn hàng, thanh toán, giao nhận; phối hợp với gian hàng hoặc đơn vị liên quan.','Thông báo phương án: giải thích, giao bù, đổi trả, hoàn tiền hoặc biện pháp phù hợp khác.','Gửi kết quả tới kênh liên hệ của khách và ghi nhận phản hồi.']},
   {title:'3. Thời gian phản hồi',paragraphs:['Phản hồi ban đầu trong 24 giờ làm việc sau khi nhận đủ thông tin. Vấn đề giao nhận hoặc đổi trả thường cần 3–7 ngày làm việc để xác minh; việc phức tạp có thời gian dự kiến riêng và được cập nhật cho khách. Khoản hoàn đã chấp thuận thực hiện theo chính sách đổi trả và thời gian xử lý của ngân hàng.']},
   {title:'4. Trường hợp chưa thống nhất',paragraphs:['YWonderShop phối hợp thiện chí với khách và gian hàng để làm rõ căn cứ. Nếu không thống nhất được, khách vẫn có quyền đề nghị tổ chức bảo vệ người tiêu dùng hoặc cơ quan có thẩm quyền hỗ trợ; quy trình nội bộ không làm mất quyền khiếu nại hợp pháp.']},
  ]
 },
 'dieu-kien-han-che-cung-cap':{
  intro:'Khả năng cung cấp phụ thuộc tồn kho, đặc tính sản phẩm, thông tin đặt hàng và điều kiện giao nhận thực tế.',
  sections:[
   {title:'1. Tiếp nhận và xác nhận đơn',paragraphs:['Có thể gửi đơn trực tuyến bất cứ lúc nào. Gian hàng xác nhận tình trạng hàng và giao nhận trước khi thực hiện; đơn gửi ngoài thời gian làm việc hoặc ngày nghỉ được xử lý vào thời gian làm việc tiếp theo. Hàng cần đặt trước phải có thông tin và sự chấp thuận của khách.']},
   {title:'2. Địa bàn và loại hàng',paragraphs:['Một số địa bàn xa, hải đảo hoặc tuyến vận chuyển hạn chế có thể kéo dài thời gian hoặc chưa hỗ trợ giao. Hàng cồng kềnh, dễ hỏng hay cần bảo quản đặc biệt phải thống nhất phương án phù hợp trước khi gửi.']},
   {title:'3. Điều kiện mua và số lượng',paragraphs:['Người đặt cần đủ điều kiện giao dịch, cung cấp thông tin chính xác và đáp ứng yêu cầu riêng của hàng hóa nếu có. Số lượng phụ thuộc tồn kho; mức tối đa theo đơn hoặc chương trình ưu đãi được thông báo trước khi xác nhận.']},
   {title:'4. Tạm ngừng, từ chối hoặc hủy',paragraphs:['Đơn có thể cần dừng xác minh khi hết hàng, không liên hệ được, thông tin sai, có dấu hiệu gian lận, lỗi hiển thị hoặc không bảo đảm giao nhận. Sự cố kỹ thuật và bất khả kháng phải được thông báo sớm. Khi không thể thực hiện, bên bán thông báo lý do và đối soát hoàn lại phần khách đã thanh toán cho nghĩa vụ không được thực hiện.']},
  ]
 },
 'quyen-va-nghia-vu':{
  intro:'Các bên phối hợp trên cơ sở thông tin minh bạch, giao dịch tự nguyện và bảo đảm quyền lợi hợp pháp. Chính sách áp dụng cho hoạt động mua bán trên YWonderShop.',
  sections:[
   {title:'1. YWonderShop và đơn vị vận hành',paragraphs:['{{company.name}} vận hành nền tảng, công bố thông tin doanh nghiệp, bảo vệ tài khoản và dữ liệu trong phạm vi quản lý; tiếp nhận hỗ trợ và phối hợp xử lý tranh chấp. Hệ thống có thể yêu cầu xác minh hoặc hạn chế hành vi gian lận có căn cứ, đồng thời thông báo vấn đề ảnh hưởng giao dịch.']},
   {title:'2. Doanh nghiệp bán hàng',paragraphs:['Gian hàng cung cấp thông tin pháp lý, nguồn gốc và mô tả hàng trung thực; niêm yết giá, điều kiện thuế/hóa đơn, giao hàng, đổi trả và bảo hành trước khi bán. Bên bán chịu trách nhiệm thực hiện đơn, chất lượng hàng, chứng từ và nghĩa vụ với khách; phối hợp với nền tảng khi có phản ánh.']},
   {title:'3. Quyền của khách hàng',paragraphs:['Khách được biết đầy đủ giá và điều kiện giao dịch, kiểm tra thông tin đơn, nhận hàng đúng thỏa thuận, đề nghị hỗ trợ, đổi trả, bảo hành và bảo vệ dữ liệu. Khách có thể phản ánh hoặc yêu cầu cơ quan có thẩm quyền hỗ trợ khi quyền lợi bị ảnh hưởng.']},
   {title:'4. Trách nhiệm của khách hàng',paragraphs:['Cung cấp thông tin nhận hàng chính xác, kiểm tra đơn trước khi xác nhận, thanh toán theo thỏa thuận và phối hợp xử lý phát sinh. Bảo vệ mật khẩu, mã xác thực; không dùng thông tin giả, lạm dụng ưu đãi hoặc can thiệp trái phép vào hệ thống.']},
   {title:'5. Thay đổi và giải quyết phát sinh',paragraphs:['Chính sách cập nhật được công bố cùng ngày hiệu lực; không tự tước bỏ quyền lợi của đơn đã xác nhận. Các bên ưu tiên thương lượng, hòa giải và thực hiện nghĩa vụ theo pháp luật Việt Nam.']},
  ]
 },
};
