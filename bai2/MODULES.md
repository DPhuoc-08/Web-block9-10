# Mô-đun chuyển từ Bài 1 sang `api` (slide 61, 65)

Nguồn: `bai1/source-code/`. Đích: `bai2/api/`. Cập nhật theo từng bước; cột "Đã đổi" ghi đúng phần khác so với Bài 1.

| Mô-đun | Xử lý | Đã đổi |
| :--- | :--- | :--- |
| `src/auth/email.js`, `username.js`, `password.js`, `secrets.js`, `mailer.js`, `recaptcha.js`, `rate-limit.js` | Chép nguyên | Không |
| `src/auth/totp.js`, `secret-box.js`, `recovery.js` | Chép nguyên | Không |
| `src/auth/mfa.js` | Chép nguyên | Chưa đổi. Bước 24 thêm tăng `tokenVersion` khi tắt MFA (plan 12.7) |
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
