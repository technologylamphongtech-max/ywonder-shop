# YWonderShop

Mã nguồn Shop đang dùng cho `shop.ywonder.net`. Ứng dụng gồm giao diện khách hàng, gian hàng, trang quản trị và API trong Next.js 14. Cơ sở dữ liệu SQLite được truy cập qua Prisma; các bảng nghiệp vụ Shop được bổ sung bằng các script trong `scripts/`.

## Chạy tại máy phát triển

Yêu cầu Node.js 20 và Python 3.

```bash
npm ci
cp .env.example .env.local
npm run db:generate
npx prisma db push
python scripts/migrate.py shop.db
npm run dev
```

Điền các giá trị bí mật riêng vào `.env.local` trước khi dùng tính năng đăng nhập, thanh toán hoặc tích hợp bên ngoài. `DATABASE_URL` trong mẫu trỏ tới `shop.db` ở thư mục gốc của dự án. `prisma db push` chỉ dành cho cơ sở dữ liệu phát triển mới; dữ liệu production cần được sao lưu và nâng cấp theo quy trình migration riêng.

## Kiểm tra

```bash
npm run typecheck
npm run test:core
npm run build
```

`test:core` kiểm tra xóa sản phẩm, thời điểm cộng hoa hồng Mizi mall và một số luồng độc lập. Các bài kiểm tra khác nằm trong `qa/`; một số cần fixture hoặc cấu hình riêng.

## Cấu trúc

- `src/app/`: các trang, API và CSS.
- `src/components/`: giao diện quản trị, hội viên và chính sách.
- `src/lib/`: nghiệp vụ Shop, affiliate, thanh toán và dữ liệu.
- `prisma/schema.prisma`: schema Prisma tương ứng với client đang dùng.
- `scripts/`: tạo và nâng cấp bảng Shop.
- `public/`: ảnh và tài nguyên công khai.
- `qa/`: bài kiểm tra và công cụ tạo fixture.

Các file `.env*`, database cục bộ, dependency, bản build, log và archive được loại khỏi Git. Không đưa dữ liệu khách hàng hay thông tin kết nối production vào kho mã nguồn.
