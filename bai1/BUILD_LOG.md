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

## Bước 2 — Schema (plan mục 3.1)
**Đã làm:** thêm vào `schema.prisma`: `Dish.status` (enum `DishStatus`), `User.chefId`, `mfaEnabled`, `mfaSecret`, `mfaPendingSecret`, `mfaLastStep`, bảng `recovery_codes`. `prisma db push` lên project Supabase của block7/block8.

**Quyết định và lý do:**
- `mfaLastStep` kiểu `Int`, không `BigInt`: bước TOTP khoảng 59 triệu, `BigInt` sẽ làm `res.json` báo lỗi khi mô-đun chuyển sang `api`.
- `users.chefId` không `@unique`: đề không cấm hai Editor cùng phụ trách một đầu bếp.
- `@default(published)` cho `Dish.status`: 1.200 món sẵn có giữ nguyên hành vi.

**Đã kiểm tra:**
- Trước khi push: in host (`aws-0-ap-southeast-1.pooler.supabase.com`), xác nhận cùng project với block8, `prisma migrate diff` trên DB thật giống hệt SQL đã cho người dùng xem, không có lệnh `DROP`.
- Sau khi push: `dishes` 1.200, `chefs` 60, `ingredients` 250, `tags` 16, `dish_tags` 2.106, `dish_ingredients` 5.357, `users` 5, `sessions` 255 không đổi; md5 của id, tên, giá, tình trạng, đầu bếp toàn bộ món trùng trước và sau (`b3a70368…`). `migrate diff` lần hai rỗng.

## Bước 3 — Seed (plan mục 3.3)
**Đã làm:** `prisma/seed-data/block9.js` (đầu bếp A là Nguyễn Văn An, B là Trần Thị Bích, 6 món nháp). `seed.js`: 4 tài khoản (viewer, Editor A, Editor B, admin), thêm `recovery_codes` vào `TRUNCATE`, ghi món nháp sau 1.200 món gốc.

**Quyết định và lý do:**
- **Món nháp là món thêm, ghi sau cùng, không đổi trạng thái món cũ:** thực đơn công khai vẫn đúng 1.200 món, cùng id như block7 (slide 67), mà vẫn có món draft và published của hai đầu bếp (ghi chú 50).
- **Hai đầu bếp lấy từ danh sách cố định `base.js`:** không phụ thuộc bộ sinh ngẫu nhiên tất định, mỗi người đã có 21 món published.
- Món nháp sai tên đầu bếp, tag, nguyên liệu hoặc trùng tên món gốc thì seed dừng **trước** `TRUNCATE`.

**Đã kiểm tra:**
- Người dùng xác nhận trước khi seed (mất 5 tài khoản cũ, 255 phiên). In host trước khi chạy.
- Seed 2 lần ra cùng dữ liệu (md5 toàn bộ món trùng `1eacda6b…`).
- md5 của 1.200 món đầu trùng với trước khi seed (`b3a70368…`): id, tên, giá, tình trạng, đầu bếp không đổi.
- 1.200 món published (id 1–1200), 6 món draft (id 1201–1206). 4 tài khoản active, Editor A gắn đầu bếp id 1, Editor B id 2, viewer và admin `chefId` rỗng, `mfaEnabled = false`.
- Món có đầu bếp không đúng chuyên môn: 0.

## Bước 4 — Hồi quy trên nền mới
**Đã kiểm tra:** chạy server thật trên DB đã seed. `check-ssr`: **124 ĐẠT, 0 CHƯA ĐẠT**. `check-auth`: **135 ĐẠT, 0 CHƯA ĐẠT**. Sau khi chạy, md5 toàn bộ món vẫn `1eacda6b…`, 4 tài khoản, `rate_limits` rỗng: không có dữ liệu thử sót lại.

**Ghi nhận:** ở bước này thực đơn công khai chưa lọc món nháp nên `check-ssr` vẫn khớp. Sau bước 7a phải sửa các ca đếm SQL của thực đơn (plan bước 7a).
