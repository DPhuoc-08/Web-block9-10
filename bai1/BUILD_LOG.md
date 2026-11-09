# BUILD_LOG — Block 9, Bài 1 (SSR: RBAC, ABAC, MFA)

Plan: `../../block9-plan.md`. Quy ước làm việc: `../../CLAUDE.md`. Đề: `../../block9-deck.html`.
Hướng làm (đã chốt 09/11/2026, plan mục 12): thêm phân quyền và MFA vào bản SSR của block8, không có API JSON, JWT. Giao diện theo bản Figma đã duyệt (file block7, trang "Block 9 · Phân quyền và MFA").

## Bước 0 — Khởi tạo repo
**Đã làm:** tạo `Week7/block9/`, `git init` (nhánh `main`), `.gitignore`, `bai1/BUILD_LOG.md`.

**Quyết định và lý do:**
- **Một repo cho cả hai bài** ở `Week7/block9/`: giảng viên yêu cầu mỗi block một repo. Mỗi bài một thư mục để nghiệm thu và nộp riêng.
- **`.gitignore` tạo trước mọi `npm install`** (bài học block5): tránh commit nhầm `node_modules/`, `.env`.
- Nội dung chép từ block8, thêm `dist/` cho `web` của Bài 2.

**Đã kiểm tra:** `git status` sạch sau commit; `git check-ignore` xác nhận `.env`, `.env.test`, `node_modules/`, `dist/`, `.mail-outbox/` bị bỏ qua, `.env.example` không bị bỏ qua.

## Bước 1 — Chép nền block8
**Đã làm:** chép `Week6/block8/source-code` (commit `7585594`) vào `bai1/source-code`, commit riêng "chép nền block8" trước khi sửa. Sau đó đổi tên gói thành `block9-bai1`, thêm `MFA_ENCRYPTION_KEY`, `SEED_EDITOR_A_EMAIL`, `SEED_EDITOR_B_EMAIL` vào `.env.example`, cài bằng `npm ci`.

**Quyết định và lý do:**
- **Không chép `.env`** (chứa bí mật), giữ `.env.example`. **Chép `.env.test`** vì chỉ có cặp key thử công khai của Google (đã kiểm tra tiền tố key, không in giá trị), `check-auth` cần file này. File vẫn bị `.gitignore` bỏ qua.
- **`npm ci` thay `npm install`:** cài đúng phiên bản trong lockfile của block8.
- Chưa cài `otpauth`, `qrcode`: gói nào dùng ở bước nào thì cài ở bước đó (bước 10).

**Đã kiểm tra:**
- `diff -r` với block8 trước khi sửa: khớp, không có file thừa, thiếu.
- `npm ls --depth=0`: đúng phiên bản block8 (Prisma 7.10.0, Express 5.3.0, argon2 0.45.1, nodemailer 10.3.1, validator 13.15.35).
- `npx prisma validate`: hợp lệ. `node --check` toàn bộ `src`, `scripts`, `prisma/*.js`: không lỗi cú pháp.

**Chưa chắc:** chưa chạy app vì chưa có `.env`, nên mục "app chạy như block8" sẽ kiểm tra ở bước 4.

**Ghi nhận:** `npm audit` báo 5 mục mức cao (`prisma`, `@prisma/config`, `deepmerge-ts`, `mysql2`, `body-parser`), đều có từ block8. Giữ nguyên theo quy tắc ghim phiên bản, không `npm audit fix --force`.
