# BUILD_LOG — Block 9, Bài 2 (CSR: JWT, phân quyền ở `api`, đăng nhập ở `web`)

Quyết định và lý do chung nằm ở `Week7/block9-plan.md`. File này ghi việc đã làm từng bước.

## Bước 18 — Chép nền block7
**Đã làm:** chép `Week5/block7/api` và `web` sang `bai2/`, bỏ `.git`, `node_modules/`, `generated/`, `dist/`, `.env`, `.DS_Store`; giữ `.env.example`, `package-lock.json`, `certs/`. Chưa sửa gì. Commit riêng để có bản gốc so sánh.

**Lý do:** đề yêu cầu Bài 2 dựng trên CSR của Block 6, 7 (slide 47); commit nguyên bản trước để phần thay đổi về sau đọc được bằng `git diff`.

### Lỗi phát hiện trong lúc làm (do agent viết)
**Lệnh chép nền không loại trừ `.env`, `node_modules`.**
- Cách tái hiện: trong zsh đặt `X="--exclude=.env --exclude=node_modules/"` rồi chạy `rsync -a $X nguồn/ đích/`.
- Nguyên nhân: zsh không tách biến chưa có dấu ngoặc kép thành nhiều tham số, nên `rsync` nhận cả chuỗi là một mục loại trừ duy nhất và không loại gì.
- Hậu quả: `bai2/api/.env` (trỏ vào database cũ), `bai2/web/.env`, `node_modules`, `generated`, `dist` nằm trên đĩa trong vài phút. Không vào Git nhờ `.gitignore`: commit chỉ có 91 tệp, duy nhất hai tệp `.env.example` mẫu. Nếu không phát hiện, seed ở bước 19 sẽ chạy vào database của Bài 1.
- Cách sửa: xoá các bản chép thừa ở `bai2/`, không đụng `Week5/block7`.
- Bằng chứng sau khi sửa: `find bai2 -name '.env*'` chỉ còn hai `.env.example`; `git ls-files bai2` và số tệp trên đĩa đều là 91.

## Bước 19, 20 — Schema, seed, chuyển mô-đun (phần chưa cần database)
**Đã làm:** schema, seed lấy từ Bài 1 (bỏ `sessions`, thêm `tokenVersion`, `mfa_challenges`). Chép các mô-đun theo plan 7.1, lập `MODULES.md`. Chuyển đoạn ẩn tham số `LOG_SQL` vào `src/db.js`. Viết đủ `.env.example` của `api`, `web`. Đổi tên gói.

**Gói mới ghim bản chính xác:** `jsonwebtoken` 9.0.3 (phát hành 12/2025); `argon2` 0.45.1, `nodemailer` 10.3.1, `validator` 13.15.35, `otpauth` 9.5.2, `qrcode` 1.5.4 cùng bản Bài 1.

**Quyết định và lý do:**
- Chuyển luôn đoạn ẩn tham số: `db.js` của block7 in mọi tham số khi `LOG_SQL=1`, trong khi `api` nay có bảng chứa hash và bản mã.
- Giữ `generate.js`, `catalog.js`, `base.js` của block7: giống hệt bản ở Bài 1.

**Đã kiểm tra:** `prisma validate` đạt; `buildSeed()` của Bài 2 và block7 trùng md5 (1.200 món, 60 đầu bếp, 250 nguyên liệu, 16 tag); import đủ 12 mô-đun; `grep` trong `src/auth`, `src/policy` không có `session`, `csrf`, `res.render`, `req.`, `res.` thật (chỉ một comment và biến `res` của `fetch`).

**Chưa làm:** `db push`, `setup-search.sql`, seed: chờ `api/.env` của project mới.
