# Mô-đun chuyển từ Bài 1 sang `api` (slide 61, 65)

Nguồn: `bai1/source-code/`. Đích: `bai2/api/`. Cập nhật theo từng bước; cột "Đã đổi" ghi đúng phần khác so với Bài 1.

| Mô-đun | Xử lý | Đã đổi |
| :--- | :--- | :--- |
| `src/auth/email.js`, `username.js`, `password.js`, `secrets.js`, `mailer.js`, `recaptcha.js`, `rate-limit.js` | Chép nguyên | Không. 12/11: `rate-limit.js` thêm `lock()` ở Bài 1 bước 35, chép lại nguyên ở bước 37 |
| `src/auth/totp.js`, `secret-box.js`, `recovery.js` | Chép nguyên | Không |
| `src/auth/mfa.js` | Chép nguyên | `disableMfa` tăng `tokenVersion`, xoá challenge đang chờ (plan 12.7). Logic còn lại không đổi. 12/11: `attempt()` giữ lượt trước khi kiểm mã (plan 14 L1), sửa ở Bài 1 bước 35 rồi chép sang ở bước 37 |
| `src/routes/auth.js` (từ `routes/auth/login.js`, `register.js`, `password-reset.js`, `mfa.js`) | Đổi cách trả kết quả | Giữ thứ tự kiểm tra, số liệu; form + redirect thành JSON; phiên chờ thành challenge; reset tăng `tokenVersion`, huỷ challenge; link thư lấy từ `WEB_ORIGIN`. 12/11: `POST /mfa` giới hạn 30 lần / 15 phút / IP như `/login/mfa` của Bài 1 (bước 37) |
| `src/routes/mfa.js` (từ `routes/admin/mfa.js`) | Đổi cách trả kết quả | Recovery code trả một lần trong JSON, không có bước `303`; thêm `GET /status` |
| `src/auth/require-permission.js` | Đổi cách trả kết quả | Trang `403` thành JSON `403` `FORBIDDEN` |
| `guardDish`, `withServerFields`, câu ghi có điều kiện ở `src/routes/dishes.js` (từ `routes/admin/dishes.js`) | Đổi cách trả kết quả | Cùng thứ tự cổng và cùng luật `editableDishWhere`; `403` JSON; `PATCH` nhận một phần trường nên có câu ghi no-op khi chỉ đổi tag, nguyên liệu |
| `src/search/dish-filter.js` (từ `dishFilterSql` ở `queries/dishes.js`) | Viết lại theo cùng luật | Chỉ giữ phần món nháp, dùng `draftScope`; tìm kiếm giữ đúng block7, không lấy phần bỏ dấu của block8 |
| `src/auth/cleanup.js` | Chép, sửa ít | Dọn `mfa_challenges` thay cho `sessions` |
| `src/policy/permissions.js` | Chép, **đã đổi luật** (plan 16, 20/11) | Editor quản lý một nhóm đầu bếp (`user.chefIds`, từ `chefs.managerId`) thay cho một `chefId` của tài khoản; thêm `canAssignChef`; `chef:create`, `chef:update` chỉ Admin. Cách viết giữ nguyên: file thuần, một luật `editableDishWhere` dùng cho cả cổng lẫn câu ghi. Bài 1 giữ bản theo slide 52 |
| `prisma/seed-data/block9.js` | Chép, sửa ít | 20/11: nhóm đầu bếp #1–30 / #31–60; 3 món nháp của B chuyển sang đầu bếp #45, #47, #55 |
| `prisma/seed.js` | Chép, sửa ít | `TRUNCATE` bỏ `sessions`, thêm `mfa_challenges` |
| `prisma/schema.prisma` | Chép, sửa ít | Bỏ model `Session`; thêm `User.tokenVersion`, model `MfaChallenge` |
| `src/db.js` (phần `SENSITIVE`) | Chuyển đoạn ẩn tham số vào `db.js` của block7 | Danh sách bảng bỏ `sessions`, thêm `mfa_challenges` |

## Không chép (plan 7.1)

| Mô-đun của Bài 1 | Lý do | Thay bằng |
| :--- | :--- | :--- |
| `auth/session-store.js`, `load-user.js`, `require-login.js`, `csrf.js`, `require-mfa-pending.js` | `api` không có session, cookie, CSRF | `auth/jwt.js`, `auth/require-jwt.js`, bảng `mfa_challenges` (bước 21, 22) |
| `auth/pages.js`, `photos.js`, view EJS, `method-override`, `express-session` | `api` chỉ trả JSON | `http/respond.js` của block7 |
| `auth/recovery-display.js` | Chỉ cần vì SSR phải `303`; `api` trả mã một lần ngay trong JSON | Body của `POST /api/auth/mfa/confirm` |
