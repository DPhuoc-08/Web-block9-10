# Mô-đun chuyển từ Bài 1 sang `api` (slide 61, 65)

Nguồn: `bai1/source-code/`. Đích: `bai2/api/`. Cập nhật theo từng bước; cột "Đã đổi" ghi đúng phần khác so với Bài 1.

| Mô-đun | Xử lý | Đã đổi |
| :--- | :--- | :--- |
| `src/auth/email.js`, `username.js`, `password.js`, `secrets.js`, `mailer.js`, `recaptcha.js`, `rate-limit.js` | Chép nguyên | Không |
| `src/auth/totp.js`, `secret-box.js`, `recovery.js` | Chép nguyên | Không |
| `src/auth/mfa.js` | Chép nguyên | `disableMfa` tăng `tokenVersion`, xoá challenge đang chờ (plan 12.7). Logic còn lại không đổi |
| `src/routes/auth.js` (từ `routes/auth/login.js`, `register.js`, `password-reset.js`, `mfa.js`) | Đổi cách trả kết quả | Giữ thứ tự kiểm tra, số liệu; form + redirect thành JSON; phiên chờ thành challenge; reset tăng `tokenVersion`, huỷ challenge; link thư lấy từ `WEB_ORIGIN` |
| `src/routes/mfa.js` (từ `routes/admin/mfa.js`) | Đổi cách trả kết quả | Recovery code trả một lần trong JSON, không có bước `303`; thêm `GET /status` |
| `src/auth/require-permission.js` | Đổi cách trả kết quả | Trang `403` thành JSON `403` `FORBIDDEN` |
| `guardDish`, `withServerFields`, câu ghi có điều kiện ở `src/routes/dishes.js` (từ `routes/admin/dishes.js`) | Đổi cách trả kết quả | Cùng thứ tự cổng và cùng luật `editableDishWhere`; `403` JSON; `PATCH` nhận một phần trường nên có câu ghi no-op khi chỉ đổi tag, nguyên liệu |
| `src/search/dish-filter.js` (từ `dishFilterSql` ở `queries/dishes.js`) | Viết lại theo cùng luật | Chỉ giữ phần món nháp, dùng `draftScope`; tìm kiếm giữ đúng block7, không lấy phần bỏ dấu của block8 |
| `src/auth/cleanup.js` | Chép, sửa ít | Dọn `mfa_challenges` thay cho `sessions` |
| `src/policy/permissions.js` | Chép nguyên | Không |
| `prisma/seed-data/block9.js` | Chép nguyên | Không |
| `prisma/seed.js` | Chép, sửa ít | `TRUNCATE` bỏ `sessions`, thêm `mfa_challenges` |
| `prisma/schema.prisma` | Chép, sửa ít | Bỏ model `Session`; thêm `User.tokenVersion`, model `MfaChallenge` |
| `src/db.js` (phần `SENSITIVE`) | Chuyển đoạn ẩn tham số vào `db.js` của block7 | Danh sách bảng bỏ `sessions`, thêm `mfa_challenges` |

## Không chép (plan 7.1)

| Mô-đun của Bài 1 | Lý do | Thay bằng |
| :--- | :--- | :--- |
| `auth/session-store.js`, `load-user.js`, `require-login.js`, `csrf.js`, `require-mfa-pending.js` | `api` không có session, cookie, CSRF | `auth/jwt.js`, `auth/require-jwt.js`, bảng `mfa_challenges` (bước 21, 22) |
| `auth/pages.js`, `photos.js`, view EJS, `method-override`, `express-session` | `api` chỉ trả JSON | `http/respond.js` của block7 |
| `auth/recovery-display.js` | Chỉ cần vì SSR phải `303`; `api` trả mã một lần ngay trong JSON | Body của `POST /api/auth/mfa/confirm` |
