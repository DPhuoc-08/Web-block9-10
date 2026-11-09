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

## Bước 5 — Bảng quyền và cổng RBAC
**Đã làm:** `src/policy/permissions.js` (hàm thuần `can`, `canEditDish`, `canViewDish`, `editableDishWhere`, `visibleDishWhere`), `src/auth/require-permission.js`, `res.locals.can`, `res.locals.canEditDish`, `403.ejs` nhận nội dung theo lý do, `loadUser` đọc thêm `chefId` từ DB. `scripts/check-policy.mjs` kiểm thử bảng quyền.

**Quyết định và lý do:**
- **Điều kiện ABAC viết một lần ở `editableDishWhere`:** cổng kiểm tra và câu ghi dùng chung, không thể lệch nhau.
- **`hasChef` dùng `Number.isInteger`:** Editor chưa gắn đầu bếp không khớp bản ghi nào, tránh lỗi rỗng bằng rỗng.
- **Không gộp vào `requireLogin`:** `requireLogin` trả lời "là ai", `requirePermission` trả lời "được làm gì".
- Phương án đã bỏ: đặt quyền ngay trong template. Template chỉ ẩn nút, server mới là nơi chặn.

**Đã kiểm tra:** `node scripts/check-policy.mjs`: **32 ĐẠT, 0 CHƯA ĐẠT**.

## Bước 6 — Gắn cổng RBAC cho mọi route quản trị
**Đã làm:** gắn `requirePermission` cho từng route của `dishes`, `chefs`, `ingredients`, `tags`: 29 route, kể cả route đọc, `GET /new`, `/:id/edit`, `/:id/delete`, `PATCH /:id/availability`. `scripts/check-rbac.mjs` phần A, B.

**Quyết định và lý do:** gắn theo từng route thay vì một middleware chung cho `/admin`, vì mỗi route cần một quyền khác nhau. GET mở form dùng cùng quyền với thao tác ghi tương ứng (slide 52). Trang hồ sơ chỉ cần đăng nhập vì mọi role đều được quản lý tài khoản của chính mình.

**Đã kiểm tra:** `check-rbac` phần A, B: **72 ĐẠT, 0 CHƯA ĐẠT**. Chưa đăng nhập: cả 29 route `303 /login`. Viewer: route đọc `200`, form và ghi `403`. Editor: mọi route xoá `403`. Mọi request đều gửi trực tiếp; md5 dữ liệu không đổi.

## Bước 7 — ABAC và ghi không tách rời
**Đã làm:** `guardDish` (tải món từ DB, xét thuộc tính) cho `GET /:id/edit`, `PATCH /:id`, `PATCH /:id/availability`. `saveDish`: câu ghi đầu tiên là `updateMany` mang điều kiện `editableDishWhere`. `withServerFields`: với người không có `dish:publish`, `chefId`, `status`, `newChef` trong body bị bỏ qua. `check-rbac` phần C.

**Quyết định và lý do:**
- **Điều kiện nằm trong câu ghi đầu tiên, trước khi tạo tag, nguyên liệu mới** (ghi chú 12): món đổi trạng thái giữa cổng và câu ghi thì không dòng nào khớp, ném lỗi, transaction rollback, không có bản ghi mồ côi.
- **Bỏ qua trường do server đặt thay vì báo lỗi** (slide 52), kể cả `chefId = "new"`.
- Admin không gửi `status` thì thêm mới là `published`, sửa giữ nguyên: giữ hành vi block8, `check-ssr` đăng nhập admin vẫn chạy.
- Đổi nhanh Tạm hết là `update`, chịu cùng điều kiện (12.4).

**Đã kiểm tra:** `check-rbac` phần C: **21 ĐẠT, 0 CHƯA ĐẠT**, gồm: Editor sai chủ, món `published`, form đã mở rồi Admin đổi status, hạ role sau khi mở form, hidden field `role`/`chefId`/`status`, Editor chưa gắn đầu bếp, hai request đồng thời không lỗi 500, bị từ chối thì không tạo tag thừa.

## Bước 7a — Món nháp chỉ hiện đúng người (12.2)
**Đã làm:** `listDishes`, `getDish` nhận `viewer` (mặc định null = chỉ published). `listTags` chỉ đếm món published trừ khi trang Tag quản trị yêu cầu tổng thật. Điều kiện món nháp nằm trong SQL của toàn văn và gần đúng (`dishFilterSql`). Nhánh gần đúng theo nguyên liệu phải `JOIN dishes` mới lọc được. Bộ lọc Tất cả / Nháp / Đã xuất bản ở danh sách quản trị. Editor tạo món xong về danh sách đang lọc Nháp. `check-rbac` phần D; `check-ssr` thêm `status = 'published'` vào SQL của thực đơn.

**Quyết định và lý do:**
- **Tham số mặc định là trường hợp hẹp nhất:** quên truyền `viewer` chỉ làm mất món nháp, không làm lộ.
- **Thực đơn không rẽ nhánh theo người xem:** Admin đang đăng nhập cũng không thấy nháp ở thực đơn, đúng lựa chọn của người dùng.
- **Lọc ngay trong câu SQL xếp điểm:** lọc sau sẽ làm `total` sai và lộ số món nháp.
- Số "phụ trách N món" ở quản trị giữ tổng thật vì điều kiện chặn xoá cần tổng thật.

**Đã kiểm tra:** `check-rbac` toàn bộ **143 ĐẠT, 0 CHƯA ĐẠT**; `check-ssr` **124 ĐẠT, 0 CHƯA ĐẠT**. Sau kiểm thử md5 món vẫn `1eacda6b…`.

### Lỗi phát hiện trong lúc làm (do agent viết)
**Ca kiểm thử `check-rbac` phần D dò món nháp theo tên.**
- Cách tái hiện: chạy phần D, 19 ca báo CHƯA ĐẠT dù server đã lọc đúng.
- Nguyên nhân: ô tìm kiếm in lại từ khoá, nên tên món nháp luôn có trong HTML trả về.
- Cách sửa: dò theo id trong link thẻ món và cột Mã, thêm ca đối chứng chứng minh cách dò thấy được món published.
- Bằng chứng sau khi sửa: 143 ĐẠT, ca "Đối chứng: món published hiện trên thực đơn" ĐẠT.

## Bước 8 — Giao diện theo quyền (Figma M1, M2, M3)
**Đã làm:** danh sách món có cột và nhãn Trạng thái, bộ lọc Tất cả / Nháp / Đã xuất bản, tổng số món; nút Sửa, Đổi nhanh, Xoá, Thêm, link tên món hiện theo `can`, `canEditDish`. Form của Editor không có ô đầu bếp, trạng thái, nút là "Lưu nháp"; form của Admin có khối Trạng thái đầu form. Trang đầu bếp, nguyên liệu, tag ẩn nút theo quyền. Trang "Không đủ quyền" theo M3.

**Quyết định và lý do:** ở màn rộng bỏ cột Tag theo Figma đã duyệt; tag vẫn tìm được và vẫn hiện trên thẻ ở màn nhỏ.

**Đã kiểm tra:** chụp Chrome headless 1280 / 820 / 375px cho Admin, Editor, Viewer: không cuộn ngang, kể cả 320px. Đo bảng món ở 1440, 1280, 1100, 1024, 900, 821px: không tràn trong khung. `check-rbac` phần E.

### Lỗi phát hiện trong lúc làm (do agent viết)
**Thêm cột Trạng thái đẩy nút Xoá ra ngoài khung bảng.**
- Cách tái hiện: đăng nhập Admin, mở `/admin/dishes` ở 1280px: nút Xoá không thấy được nếu không cuộn trong khung bảng.
- Nguyên nhân: bảng đã gần đầy, thêm một cột làm `.table-wrap` tràn; lúc viết chỉ kiểm tra toàn trang không cuộn ngang, nên không phát hiện tràn trong khung.
- Cách sửa: bỏ cột Tag ở màn rộng theo Figma; từ 821–1100px cho cụm nút xuống dòng.
- Bằng chứng sau khi sửa: `scrollWidth - clientWidth` của `.table-wrap` bằng 0 ở cả 6 cỡ đã đo.

## Bước 9 — Mốc "đạt phân quyền"
**Đã kiểm tra:** `check-policy` **32 ĐẠT**; `check-rbac` **159 ĐẠT, 0 CHƯA ĐẠT**; `check-ssr` **124 ĐẠT, 0 CHƯA ĐẠT**; `check-auth` **135 ĐẠT, 0 CHƯA ĐẠT**.

## Bước 10 — Thiết lập MFA
**Đã làm:** cài `otpauth` 9.5.2, `qrcode` 1.5.4 (bản chính xác). `auth/secret-box.js` (AES-256-GCM), `auth/totp.js`, `auth/recovery.js`, `auth/recovery-display.js`, `auth/mfa.js`, `routes/admin/mfa.js`; trang M7, M8, thẻ Bảo mật hai lớp ở hồ sơ (M6); kiểm tra `MFA_ENCRYPTION_KEY` lúc khởi động. `scripts/check-mfa.mjs` phần A.

**Quyết định và lý do:**
- `otpauth` 9.5.2, không lấy 9.6.0 vừa phát hành 02/11. Đã đọc mã 9.5.2: `validate` so sánh an toàn thời gian, mặc định `window` 1, trả độ lệch bước.
- Tạo secret chờ bằng `POST`, `GET` chỉ đọc (slide 55).
- Secret mới sinh từ `crypto.randomBytes`, truyền vào thư viện, không dùng bộ sinh của thư viện (quy tắc: số ngẫu nhiên chỉ từ `crypto`).
- `userId` làm AAD của GCM: chép bản mã sang tài khoản khác sẽ giải mã thất bại.
- Xác nhận bằng so khớp đúng bản mã vừa kiểm tra: tab khác vừa tạo secret mới thì không bật nhầm secret cũ.
- Recovery code hiện bằng PRG, mã gốc giữ trong RAM tối đa 60 giây, đọc một lần là xoá (12.11).

**Đã kiểm tra:** `check-mfa` phần A: **19 ĐẠT, 0 CHƯA ĐẠT**: `GET` không tạo secret; DB chỉ có bản mã; mã sai không bật; 10 HMAC; bảng `sessions` và log không chứa mã gốc; mở lại trang mã không hiện lại; đang bật thì không tạo secret mới, không hiện lại secret.

## Bước 11, 12 — Đăng nhập có MFA và recovery code
**Đã làm:** `POST /login` có MFA chỉ gán `mfaPending` (kèm `next`), không gán `userId`. `routes/auth/mfa.js`, `require-mfa-pending.js`; trang M4, M5; lời nhắc M5b ở hồ sơ. `session-store.js` ghi cột `userId` từ cả phiên chờ. `check-mfa` phần B, C.

**Quyết định và lý do:**
- Phiên chờ không có `userId`, nên `loadUser` và `requireLogin` không cần sửa gì mà vẫn từ chối (slide 20). Không cần cờ riêng để nhớ kiểm tra ở từng route.
- `regenerate` hai lần: sau password và sau mã đúng, để sid có từ trước không thành phiên đầy đủ.
- Bộ đếm sai chung cho OTP và recovery code theo user, đạt ngưỡng thì `429` dù mã đúng.
- Chặn dùng lại mã bằng `updateMany` có điều kiện, không đọc rồi so trong code, để hai request đồng thời chỉ một thắng.
- Bộ đếm sai password được xoá khi password đúng (giữ nguyên block8); bước MFA có bộ đếm riêng nên kẻ biết password vẫn bị giới hạn.

**Đã kiểm tra:** `check-mfa` phần B, C: **36 ĐẠT, 0 CHƯA ĐẠT**: phiên chờ không vào được `/admin/*`, bản ghi phiên không có `userId`, sid đổi, dùng lại mã bị từ chối, `next` được giữ, sai 5 lần `429` dù mã đúng và chung với recovery code, huỷ, hết hạn 5 phút, reset password không tắt MFA, không tạo phiên, xoá cả phiên đang chờ, recovery code dùng lần hai bị từ chối, viết thường và thiếu gạch vẫn khớp.

## Bước 13, 13a, 14 — Thay, tắt MFA và giao diện MFA
**Đã làm:** `GET`, `POST /admin/profile/mfa/reauth/:action` cho `replace`, `regenerate`, `disable`; trang M9. Giao diện M4–M9 làm cùng lúc với logic vì bản Figma đã duyệt trước khi bắt đầu, nên không cần bước form trần. `check-mfa` phần D.

**Quyết định và lý do:**
- So password trước, yếu tố thứ hai sau: nhập sai password không làm mất một recovery code.
- Sai ở bước xác thực lại tính chung bộ đếm MFA: nếu tách riêng, đây thành đường dò mã thứ hai.
- Thay thiết bị không đổi nhóm recovery code: slide 22 chỉ vô hiệu nhóm cũ khi sinh nhóm mới, và "Tạo lại mã" là thao tác riêng.
- Một ô nhận cả TOTP lẫn recovery code, server phân biệt theo định dạng, đúng slide 23 ("một mã TOTP hoặc recovery code").

**Đã kiểm tra:**
- `check-mfa` toàn bộ **75 ĐẠT, 0 CHƯA ĐẠT**; `check-policy` **32**; `check-rbac` **159**; `check-ssr` **124**; `check-auth` **135**, đều 0 CHƯA ĐẠT.
- Chụp Chrome headless M4–M9 ở 1280 / 820 / 375px, M7 và M8 thêm 320px: không cuộn ngang, đúng bố cục Figma.
- Sau kiểm thử: md5 món `1eacda6b…`, 4 tài khoản, không có tài khoản bật MFA, `recovery_codes` và `rate_limits` rỗng.
- `npm audit` vẫn 5 mục như bước 1, `otpauth` và `qrcode` không thêm mục nào.

**Chưa chắc:** chưa quét QR bằng ứng dụng authenticator thật trên điện thoại. Script chỉ tính mã bằng cùng thư viện, nên chưa chứng minh được ứng dụng thật đọc được QR. (Đã làm ở bước 15.)

## Bước 15 — Nghiệm thu Bài 1, mốc "đạt Bài 1"
**Đã làm:** chạy lại toàn bộ `check-*` trên code cuối; người dùng quét QR bằng ứng dụng thật; thu đủ 10 kịch bản của slide 56, 57 bằng Chrome thật và request trực tiếp; seed lại.

**Đã kiểm tra (09/11/2026):**
- `check-policy` **32**, `check-mfa` **75**, `check-rbac` **159**, `check-auth` **135**, `check-ssr` **124**, đều 0 CHƯA ĐẠT. Kết quả lưu ở `evidence/curl/check-*.txt`.
- **Ứng dụng thật:** người dùng quét QR bằng Microsoft Authenticator trên điện thoại, nhập mã, đăng xuất và đăng nhập lại bằng mã từ app: thành công. Đọc DB sau đó thấy tài khoản viewer có `mfaEnabled = true` và 10 mã khôi phục chưa dùng.
- **Trình duyệt:** `collect-evidence.mjs` đi qua 10 kịch bản bằng Chrome headless, mọi kiểm tra trong `evidence/curl`, `evidence/db` đều ĐẠT; đăng nhập bằng mã khôi phục và dùng lại mã được làm ở đây, không làm tay trên điện thoại.
- Seed lại sau cùng: 1.206 món (1.200 published, 6 draft), 4 tài khoản, 0 phiên, 0 bộ đếm, không còn `recovery_codes`.

**Mốc đạt Bài 1:** đủ bảng 10.1 và 5 câu của slide 55. Sang Bài 2 được.

**Chưa có:** ảnh chụp thật của cửa sổ DevTools. Network và Application có bản chữ đọc từ Chrome qua DevTools Protocol (`evidence/network/network-log.md`), giống cách block8.

### Lỗi phát hiện trong lúc làm (do agent viết)
**`LOG_SQL=1` vẫn in tham số của bảng `recovery_codes`.**
- Cách tái hiện: `LOG_SQL=1`, chạy `prisma.recoveryCode.findFirst({ where: { codeHash: "..." } })`: dòng `params:` có giá trị hash.
- Nguyên nhân: danh sách bảng ẩn tham số ở `src/db.js` có từ block8; lúc thêm bảng `recovery_codes` ở bước 2 mình không thêm tên bảng này vào.
- Mức độ: chỉ lộ HMAC khi tự bật `LOG_SQL`, không lộ mã gốc. Vẫn sửa vì trái với quy tắc đang áp cho mọi bảng xác thực.
- Cách sửa: thêm `recovery_codes` vào `SENSITIVE`.
- Bằng chứng sau khi sửa: cùng câu truy vấn, số dòng log chứa giá trị hash từ 1 xuống 0, dòng `params` là `[ẩn — bảng xác thực]`.

## Kiểm tra mã nguồn (slide 55)
1. **Password băm bằng Argon2id?** Có. `src/auth/password.js:10` tạo, `:23` so. Không có MD5, SHA-256 trực tiếp cho password.
2. **Recovery code lưu hash; TOTP secret có bị ghi log hoặc trả lại sau thiết lập?** Lưu HMAC-SHA256 (`src/auth/recovery.js`, ghi ở `src/auth/mfa.js:86`). Secret chỉ đọc khi có `mfaPendingSecret` (`mfa.js`, `readEnrollment`), đã bật thì `GET /setup` chuyển về hồ sơ. Không có `console.*` nào in secret, mã; `check-mfa` phần A dò log server. `src/db.js:28` chỉ in tham số SQL khi tự bật `LOG_SQL=1`, và tham số chỉ là hash, bản mã.
3. **Phiên chờ MFA vào được `/admin` không?** Không. `req.session.userId` chỉ được gán ở `routes/auth/login.js:131` (sau nhánh `mfaEnabled` ở `:127`), `routes/auth/mfa.js:43` (sau khi qua mã), `routes/admin/profile.js:112` (đổi mật khẩu, đã là phiên đầy đủ). Kích hoạt và reset không gán. `check-mfa` phần B thử cả `/admin/*`, sau reset.
4. **PATCH đọc lại món từ DB trước khi kiểm tra?** Có. `guardDish` (`routes/admin/dishes.js:31`) đọc DB ở `PATCH /:id` (`:375`), `/availability` (`:384`); câu ghi còn mang điều kiện ABAC (`:300`, `:393`).
5. **Route chỉ ẩn nút mà server không kiểm tra; GET đổi dữ liệu?** Không có route quản trị nào thiếu `requirePermission` (đếm bằng `grep`: 0). Các `GET` chỉ đọc; `GET /admin/profile/mfa/codes` chỉ xoá bản sao trong RAM, không ghi database.
