# Block 9, Bài 1 — Ứng dụng nhà hàng SSR: phân quyền và MFA

Ứng dụng **SSR** (Express 5 + EJS) của block8, thêm **RBAC** (Viewer, Editor, Admin), **ABAC** (Editor chỉ sửa món nháp của đầu bếp mình) và **MFA TOTP** với recovery code. Đăng ký, kích hoạt, đăng nhập, quên mật khẩu và CRUD của block8 giữ nguyên.

Database là project Supabase của block7, block8: chỉ **thêm** cột `Dish.status`, các cột MFA, `User.chefId` và bảng `recovery_codes`. Bài 2 ở thư mục `../bai2/`, làm sau khi Bài 1 đạt.

| Tài liệu | Nội dung |
| :--- | :--- |
| `hotrotrinhbay.html` | Mục tiêu, tiêu chí nghiệm thu, chỗ đề chưa khớp với project, chính sách nhóm công bố, công nghệ |
| `kichban.html` | Dữ liệu mới, luồng thao tác, kịch bản demo theo bảng nghiệm thu, lỗi đã phát hiện |
| `evidence/README.md` | Bảng đối chiếu từng kịch bản với ảnh, Network, request, bản ghi DB; sơ đồ luồng |
| `BUILD_LOG.md` | Từng bước, quyết định, lý do, lỗi phát hiện, mục "Kiểm tra mã nguồn" |

## Chạy ứng dụng

Cần Node ≥ 22.22 và Chrome (chỉ để thu bằng chứng). Project Supabase không dùng 7 ngày sẽ bị tạm dừng: mở lại trên dashboard trước.

```bash
cd source-code
cp .env.example .env      # điền theo bảng dưới
npm install               # tự chạy prisma generate
npx prisma db seed        # in host của DATABASE_URL rồi XOÁ và nạp lại toàn bộ
npm start                 # http://localhost:3000
```

| Biến (`source-code/.env`) | Điền gì |
| :--- | :--- |
| `DATABASE_URL` | Chuỗi kết nối project Supabase block7 (Session pooler, cổng 5432) |
| `APP_ORIGIN` | `http://localhost:3000` |
| `SESSION_SECRET`, `OTP_PEPPER` | Chuỗi ngẫu nhiên dài, khác nhau |
| `MFA_ENCRYPTION_KEY` | Đúng 32 byte, base64url: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Thiếu hoặc sai thì server không khởi động. **Đổi khoá thì mọi secret đã mã hoá không giải mã được** |
| `SEED_VIEWER_EMAIL`, `SEED_EDITOR_A_EMAIL`, `SEED_EDITOR_B_EMAIL`, `SEED_ADMIN_EMAIL`, `SEED_USER_PASSWORD` | Bốn tài khoản seed `active`: Editor A gắn đầu bếp Nguyễn Văn An, Editor B gắn đầu bếp Trần Thị Bích |
| `MAIL_TRANSPORT`, `MAIL_FROM`, `SMTP_USER`, `SMTP_PASS` | `smtp` khi demo (Gmail + App Password); `file` ghi thư ra `.mail-outbox/` |
| `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY`, `RECAPTCHA_HOSTNAMES` | Key reCAPTCHA v2, domain `localhost` |
| `LOG_SQL=1` *(tuỳ chọn)* | In câu SQL thật; câu chạm bảng xác thực không in tham số |

Seed dùng `TRUNCATE`: xoá tài khoản đã bật MFA. Sau khi seed lại phải bật MFA lại và xoá mục cũ trong ứng dụng xác thực. Không chạy `prisma db push` từ thư mục block7, block8 vì schema ở đó thiếu các cột mới và sẽ đòi xoá.

## Kiểm tra

```bash
cd source-code
node scripts/check-policy.mjs       # 32: bảng quyền, hàm thuần, không cần server
node scripts/check-rbac.mjs         # 159: mọi route theo 4 tài khoản, ABAC, đổi quyền sau khi mở form, ai thấy món nháp
node scripts/check-mfa.mjs          # 75: thiết lập, đăng nhập, recovery code, xác thực lại
node scripts/check-auth.mjs         # 135: chức năng tài khoản của block8
npm start &
node scripts/check-ssr.mjs          # 124: thực đơn, tìm kiếm, CRUD của block8
```

Script tự chạy server ở cổng 3100 (trừ `check-ssr`, dùng server đang chạy; đặt `BASE_URL` để đổi cổng). `check-mfa` đặt lại MFA của tài khoản viewer. Cần `source-code/.env.test` (key thử công khai của Google reCAPTCHA, không commit). Seed lại sau khi test.

**Thu lại bằng chứng:** `node scripts/collect-evidence.mjs`, rồi seed lại. **Vẽ lại sơ đồ:** `node evidence/diagrams/ve-so-do.mjs` từ thư mục `bai1/`.

## Route thêm so với block8

| Route | Ai dùng | Ghi chú |
| :--- | :--- | :--- |
| `GET`, `POST /login/mfa`; `GET`, `POST /login/mfa/recovery`; `POST /login/mfa/cancel` | Phiên chờ MFA | Chỉ các route này nhận phiên chờ, quá 5 phút phải nhập lại password |
| `POST`, `GET /admin/profile/mfa/setup`; `POST /admin/profile/mfa/setup/confirm` | Mọi role | `POST` tạo secret chờ, `GET` chỉ đọc để vẽ QR |
| `GET /admin/profile/mfa/codes` | Mọi role | Recovery code hiện một lần |
| `GET`, `POST /admin/profile/mfa/reauth/:action` | Mọi role | `replace`, `regenerate`, `disable`: bắt buộc password và một mã |
| `/admin/*` có sẵn | Theo bảng quyền | 29 route đều có `requirePermission`; `GET /admin/dishes?status=` lọc Nháp, Đã xuất bản |

## Cấu trúc thêm so với block8

```
bai1/
├── BUILD_LOG.md, README.md, hotrotrinhbay.html, kichban.html
├── evidence/                 ← bằng chứng đã che + diagrams/
└── source-code/src/
    ├── policy/permissions.js ← bảng quyền, ABAC: không đụng req/res, chép nguyên sang Bài 2
    ├── auth/                 ← require-permission, require-mfa-pending, mfa, totp, secret-box, recovery, recovery-display
    └── routes/               ← auth/mfa.js (bước MFA), admin/mfa.js (quản lý MFA)
```

Khi nộp: xoá `source-code/node_modules/`, `source-code/generated/`, `source-code/.mail-outbox/`; giữ `package-lock.json`.
