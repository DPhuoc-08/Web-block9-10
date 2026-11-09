# Block 9, Bài 2 — Ứng dụng nhà hàng CSR: JWT và phân quyền

Hai project, hai origin: `api` (Express 5 + Prisma, `:3000`) và `web` (React + Vite + React Router, `:5173`). Logic xác thực, MFA và phân quyền chuyển từ Bài 1 sang `api`; `web` có trang đăng nhập, đăng ký, MFA và quản trị theo role, gửi `Authorization: Bearer`.

Database là **project Supabase riêng** của Bài 2, không dùng chung với Bài 1. Bài 1 và `api` cùng cổng 3000 nên không chạy cùng lúc.

| Tài liệu | Nội dung |
| :--- | :--- |
| `hotrotrinhbay.html` | Mục tiêu, nghiệm thu, chỗ đề chưa khớp, nơi lưu token và rủi ro, xử lý JWT khi đổi mật khẩu, chính sách, công nghệ |
| `kichban.html` | Dữ liệu mới, luồng thao tác, kịch bản demo, lỗi đã phát hiện |
| `MODULES.md` | Mô-đun chuyển từ Bài 1 và phần đã đổi |
| `evidence/README.md` | Bảng đối chiếu từng kịch bản với bằng chứng |
| `BUILD_LOG.md` | Từng bước, quyết định, lỗi phát hiện, mục "Kiểm tra mã nguồn" |

## Chạy ứng dụng

```bash
cd api
cp .env.example .env      # điền theo bảng dưới
npm install
npx prisma db push        # chỉ lần đầu, trên project mới
node scripts/run-sql.js prisma/sql/setup-search.sql   # bật pg_trgm, chỉ lần đầu
npx prisma db seed        # in host rồi XOÁ và nạp lại toàn bộ
npm start                 # http://localhost:3000

cd ../web
cp .env.example .env
npm install
npm run dev               # http://localhost:5173
```

| Biến | Điền gì |
| :--- | :--- |
| `api`: `DATABASE_URL` | Session pooler, cổng 5432, project riêng của Bài 2 |
| `api`: `CORS_ORIGIN`, `WEB_ORIGIN` | `http://localhost:5173` |
| `api`: `JWT_SECRET`, `OTP_PEPPER`, `MFA_ENCRYPTION_KEY` | Ba chuỗi ngẫu nhiên khác nhau; `JWT_SECRET` ≥ 32 byte, `MFA_ENCRYPTION_KEY` đúng 32 byte. Thiếu thì server không khởi động |
| `api`: `SEED_*`, `MAIL_*`, `SMTP_*`, `RECAPTCHA_*` | Như Bài 1 |
| `web`: `VITE_API_URL` | `http://localhost:3000` |
| `web`: `VITE_RECAPTCHA_SITE_KEY` | Site key, giá trị công khai. Không đặt bí mật nào vào `web/.env` |

## Kiểm tra

```bash
cd api
node scripts/check-api.mjs            # 213 kiểm tra; tự chạy server ở :3100; cần .env.test (key thử của Google)
npm --prefix ../web run build
node scripts/collect-evidence.mjs     # Chrome thật; tắt api và web trước; ghi vào evidence/
npx prisma db seed                    # seed lại sau khi test
```

| Phần `check-api` | Nội dung |
| :--- | :--- |
| A | CORS, verify JWT |
| B | Đăng nhập, CAPTCHA, bộ đếm, challenge MFA, recovery code |
| C | Đăng ký, kích hoạt, quên, đặt lại mật khẩu |
| D | Thiết lập, thay, tắt MFA, tạo lại mã |
| E | Token, RBAC, ABAC ở route dữ liệu |
| F | Ai thấy món nháp; route công khai như block7 |

## API công bố

| Route | Token | Ghi chú |
| :--- | :---: | :--- |
| `POST /api/auth/login` | Không | `{ accessToken, expiresIn }` hoặc `{ next: "mfa", challenge, expiresIn }`. CAPTCHA gửi ở `captchaToken` |
| `POST /api/auth/mfa` | Không | `challenge` + `code` hoặc `recoveryCode` |
| `POST /api/auth/register`, `/activate`, `/activate/resend`, `/forgot`, `/reset` | Không | Trả JSON, cùng logic Bài 1 |
| `GET /api/auth/me` | Có | `id`, `email`, `username`, `role`, `chefId` |
| `GET /api/auth/mfa/status`; `POST /api/auth/mfa/setup`, `/confirm` | Có | Thiết lập |
| `POST /api/auth/mfa/replace`, `/recovery-codes`, `/disable` | Có | Bắt buộc `password` và `factor` |
| `GET /api/dishes`, `/api/dishes/:id` | Không | Chỉ món `published`. `?include=tags` kèm tag cho thanh danh mục |
| `GET /api/admin/dishes`, `/:id` | Có | Có món nháp theo quyền, `status`, `canEdit` |
| `POST`, `PATCH`, `DELETE /api/dishes…`; mọi route `/api/chefs…`, `/api/ingredients…`; `GET`, `POST /api/tags` | Có | RBAC, ABAC như Bài 1 |

`401` `UNAUTHENTICATED`, `TOKEN_EXPIRED`; `403` `FORBIDDEN`; `429` `RATE_LIMITED`: status riêng, body `ok: false`. `INVALID_CREDENTIALS`, `ACCOUNT_NOT_ACTIVATED`, `CAPTCHA_REQUIRED`, `INVALID_CAPTCHA`, `INVALID_OTP`, `INVALID_RESET_TOKEN`, `NOT_FOUND`, `VALIDATION_FAILED`, `IN_USE`: `200`, `ok: false`.

Khi nộp: xoá `node_modules/`, `generated/`, `dist/`, `.mail-outbox/` của `api` và `web`; giữ `package-lock.json`.
