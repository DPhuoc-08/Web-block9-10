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

## Bước 16, 17 — Bằng chứng, sơ đồ, tài liệu
**Đã làm:** viết lại `scripts/collect-evidence.mjs` theo 10 kịch bản của slide 56, 57 (bản chép từ block8 chỉ thu luồng đăng ký). `evidence/` có ảnh, Network, Application, request trực tiếp, bản ghi DB, thư đặt lại mật khẩu; ba sơ đồ SVG; `README.md`, `hotrotrinhbay.html`, `kichban.html`.

**Quyết định và lý do:**
- Server thu bằng chứng chạy ở cổng 3100, để không đụng server người dùng đang mở ở 3000.
- MFA dùng tài khoản thử `@demo.example`: các ca khoá 15 phút, đổi mật khẩu không làm hỏng 4 tài khoản seed.
- Che QR, secret, recovery code ngay trong trang trước khi chụp, không che sau: ảnh không bao giờ chứa giá trị thật.
- Mã lúc bật MFA dùng bước liền trước, để bước đăng nhập ngay sau đó có mã mới mà không cần sửa `mfaLastStep`.

**Đã kiểm tra:** mọi dòng trong `evidence/curl`, `evidence/db` ĐẠT. Quét `evidence/` không thấy email nhóm, `SESSION_SECRET`, `OTP_PEPPER`, `MFA_ENCRYPTION_KEY`, mật khẩu seed, App Password, chuỗi kết nối. Đã xem ảnh có che (QR, secret, recovery code). `hotrotrinhbay.html`, `kichban.html` không cuộn ngang ở 1280 và 375px, không ảnh hỏng, mọi link `evidence/` tồn tại. Sơ đồ ghi `file:dòng` lấy từ code hiện tại.

**Chưa chắc:** sơ đồ là bản nháp của mình, nhóm cần duyệt trước khi nộp.

## Kiểm tra mã nguồn (slide 55)
1. **Password băm bằng Argon2id?** Có. `src/auth/password.js:10` tạo, `:23` so. Không có MD5, SHA-256 trực tiếp cho password.
2. **Recovery code lưu hash; TOTP secret có bị ghi log hoặc trả lại sau thiết lập?** Lưu HMAC-SHA256 (`src/auth/recovery.js`, ghi ở `src/auth/mfa.js:86`). Secret chỉ đọc khi có `mfaPendingSecret` (`mfa.js`, `readEnrollment`), đã bật thì `GET /setup` chuyển về hồ sơ. Không có `console.*` nào in secret, mã; `check-mfa` phần A dò log server. `src/db.js:28` chỉ in tham số SQL khi tự bật `LOG_SQL=1`, và tham số chỉ là hash, bản mã.
3. **Phiên chờ MFA vào được `/admin` không?** Không. `req.session.userId` chỉ được gán ở `routes/auth/login.js:131` (sau nhánh `mfaEnabled` ở `:127`), `routes/auth/mfa.js:43` (sau khi qua mã), `routes/admin/profile.js:112` (đổi mật khẩu, đã là phiên đầy đủ). Kích hoạt và reset không gán. `check-mfa` phần B thử cả `/admin/*`, sau reset.
4. **PATCH đọc lại món từ DB trước khi kiểm tra?** Có. `guardDish` (`routes/admin/dishes.js:31`) đọc DB ở `PATCH /:id` (`:375`), `/availability` (`:384`); câu ghi còn mang điều kiện ABAC (`:300`, `:393`).
5. **Route chỉ ẩn nút mà server không kiểm tra; GET đổi dữ liệu?** Không có route quản trị nào thiếu `requirePermission` (đếm bằng `grep`: 0). Các `GET` chỉ đọc; `GET /admin/profile/mfa/codes` chỉ xoá bản sao trong RAM, không ghi database.

## Bước 35 — Sửa L1: giới hạn sai mã MFA bị vượt khi gửi đồng thời; giới hạn theo IP (plan mục 14)
Rà soát ngày 12/11/2026 (đọc mã, chạy lại mọi `check-*`, thêm phép thử request đồng thời) tìm ra lỗi này. Các `check-*` cũ chỉ gửi tuần tự nên không bắt được. Hướng sửa người dùng đã chốt ở plan 14.3 a, b.

### Lỗi phát hiện khi rà soát sau nghiệm thu (do agent viết) — lỗi chính nộp theo slide 58
**Gửi đồng thời nhiều mã thì giới hạn 5 lần sai / 15 phút không có tác dụng.**
- Cách tái hiện: đăng nhập password của tài khoản đã bật MFA để có phiên chờ, mở `/login/mfa` lấy `_csrf`, gửi **cùng lúc** 29 mã sai và 1 mã đúng (mã đúng gửi cuối) tới `POST /login/mfa`.
- Kết quả trước khi sửa (3/3 lần): mã đúng nhận `303 /admin/dishes`, có phiên đầy đủ. Response chỉ có 4 `INVALID_OTP`, 25 `429`, nhìn response thì tưởng giới hạn vẫn chạy, nhưng bộ đếm ghi `count=30`, tức cả 30 mã đều đã được so với secret. Sau đó bộ đếm bị xoá, khoá vừa đặt cũng mất.
- Ca mới trong `check-mfa` phần B chạy trên mã cũ: `Gửi đồng thời: mã đúng gửi sau 29 mã sai vẫn 429` **CHƯA ĐẠT** (`303 /admin/dishes`), `Gửi đồng thời: không có phiên đầy đủ` **CHƯA ĐẠT**.
- Nguyên nhân: `attempt()` ở `src/auth/mfa.js` đọc bộ đếm (`peek`), kiểm mã, rồi mới tăng (`hit`). Kiểm tra và ghi tách rời nên mọi request đến cùng lúc đều đọc thấy chưa đủ ngưỡng và đều được kiểm mã; mã đúng gọi `reset` xoá luôn khoá. Bước MFA lại không có giới hạn theo IP như `POST /login`, nên số mã thử mỗi loạt chỉ bị giới hạn bởi sức chịu của server. Cùng lỗi với kiểu "kiểm tra rồi mới ghi" mà mình đã tránh được ở ABAC và ở chặn dùng lại mã, nhưng sót ở bộ đếm.
- Mức độ: kẻ đã có password thử được hàng trăm mã mỗi 15 phút thay vì 5. Phá dòng nghiệm thu "OTP sai quá giới hạn → khoá tạm" (slide 57).

**Đã làm:**
- `src/auth/rate-limit.js`: thêm `lock(key, lockMs)` đặt khoá bằng một câu ghi, khoá đang còn thì giữ nguyên, không kéo dài.
- `src/auth/mfa.js`: `attempt()` **giữ lượt trước khi kiểm mã**: `hit` (một câu ghi, không tự khoá) trả số thứ tự lượt; đang khoá hoặc lượt > 5 thì `429` mà không kiểm mã; lượt thứ 5 sai thì khoá; đúng thì xoá bộ đếm.
- `src/routes/auth/mfa.js`: giới hạn 30 lần / 15 phút / IP (khoá `mfa:ip:<ip>`) cho `POST /login/mfa`, `/login/mfa/recovery`, đứng trước bộ đếm theo user.
- `scripts/check-mfa.mjs`: ca gửi đồng thời, ca giới hạn IP; dọn khoá `mfa:ip:`, `reset:ip:` ở cuối (L3: trước đây sót `reset:ip`).

**Quyết định và lý do:**
- Chọn giữ lượt trước, bỏ phương án khoá dòng trong transaction: `hit` vốn là một câu ghi nên N request đồng thời nhận N số thứ tự khác nhau, chỉ lượt 1–5 được kiểm. Khoá dòng phải truyền transaction qua `consumeTotp`, `consumeRecovery` và giữ kết nối trong lúc băm password ở bước xác thực lại.
- Gửi tuần tự cho kết quả như cũ: 4 lần sai báo `INVALID_OTP`, lần sai thứ 5 thì `429`, mã đúng ở lượt thứ 5 vẫn qua. Lượt đúng cũng được đếm nhưng xoá bộ đếm ngay, nên không ảnh hưởng người dùng.
- `lock` không kéo dài khoá đang có: kẻ gửi thêm khi đang khoá không làm chủ tài khoản bị khoá lâu hơn.
- Giới hạn IP dùng cùng số với `POST /login` (plan mục 4 đã thêm dòng).
- `auth/mfa.js` vẫn không đụng `req`/`res`, chép nguyên được sang `api` ở bước 37.

**Đã kiểm tra:**
- `check-mfa` toàn bộ **80 ĐẠT, 0 CHƯA ĐẠT** (thêm 5 ca: 3 ca gửi đồng thời, 2 ca giới hạn IP). Ca khoá tuần tự cũ vẫn đạt: sai 4 lần vẫn được thử, lần thứ 5 (recovery code, chung bộ đếm) `429`, đang khoá thì mã đúng vẫn `429`, sai 5 lần ở bước xác thực lại `429`.
- Phép thử độc lập (29 mã sai + 1 mã đúng gửi cùng lúc, đã dọn bộ đếm IP để thử riêng bộ đếm theo user), 3/3 lần: 4 `INVALID_OTP`, 26 `429`, mã đúng `429`, khoá còn nguyên (`count=30`, có `lockedUntil`), không có phiên đầy đủ.
- Khi chưa dọn bộ đếm IP, cả 30 request nhận `429` từ giới hạn IP trước khi tới bộ đếm theo user: lớp thứ hai chạy đúng.
- Hồi quy: `check-auth` **135 ĐẠT, 0 CHƯA ĐẠT** (đăng nhập, CAPTCHA, bộ đếm sai password dùng chung `rate-limit.js` không đổi hành vi).

**Còn lại:** chép sang `api` ở bước 37; tài liệu trình bày, mục lỗi trong `kichban.html` cập nhật ở bước 38.

## Bước 36 — Sửa L2: secret chờ của "đổi thiết bị" gắn với phiên vừa xác thực lại, hạn 10 phút (plan mục 14)

### Lỗi phát hiện khi rà soát sau nghiệm thu (do agent viết)
**Đổi thiết bị MFA được mà không cần password, nếu lần đổi trước bị bỏ dở.**
- Cách tái hiện: phiên A xác thực lại (`POST /admin/profile/mfa/reauth/replace`) rồi bỏ dở, không xác nhận. Từ một phiên đầy đủ B của cùng tài khoản (chưa xác thực lại), mở `GET /admin/profile/mfa/setup` rồi gửi `POST /setup/confirm` với mã của secret đó.
- Ca mới trong `check-mfa` phần D chạy trên mã cũ: phiên B mở trang thiết lập `200`, thấy secret chờ (**CHƯA ĐẠT**); phiên B xác nhận được, thiết bị bị đổi (**CHƯA ĐẠT**).
- Nguyên nhân: `mfaPendingSecret` không có hạn, và `GET /setup`, `POST /setup/confirm` chỉ hỏi "có secret chờ không", không hỏi "secret này do một lần xác thực lại còn hạn tạo ra không". Xác thực lại ở 6.5 (slide 23) vì vậy chỉ chặn được lúc bắt đầu, không chặn được lúc kết thúc.
- Mức độ: thấp. Cần một lần đổi bỏ dở và một phiên đầy đủ của người khác (ví dụ phiên bị chiếm). Bài 2 không bị: `api` chỉ trả secret một lần trong response của `POST /replace`, không có đường đọc lại.

**Đã làm:** `src/routes/admin/mfa.js`: xác thực lại cho `replace` thì ghi `req.session.mfaReplaceAt`; khi đang bật MFA (tức là đổi thiết bị), `GET /setup` và `POST /setup/confirm` chỉ nhận nếu cờ của **chính phiên đó** còn trong 10 phút, không thì `303` về hồ sơ kèm thông báo "Phiên đổi thiết bị đã hết hạn"; đổi xong thì xoá cờ. `src/app.js`: thêm thông báo `mfa-replace-expired`. `check-mfa` phần D thêm 3 ca.

**Quyết định và lý do (plan 14.3 c):**
- Cờ trong phiên, không thêm cột `mfaPendingAt`: ràng secret chờ vào đúng phiên vừa xác thực lại, nên phiên khác không dùng được dù còn hạn; không phải `db push` lên DB của block7/block8. `regenerate` lúc đăng nhập lại tạo phiên mới không có cờ.
- `POST /setup/confirm` kiểm tra cờ trước khi xét mã: bị từ chối thì không tốn lượt của bộ đếm MFA.
- Lần bật MFA đầu tiên không bị ràng buộc: đề không yêu cầu xác thực lại khi bật (slide 53).
- `auth/mfa.js` không đổi, `api` không cần sửa.

**Đã kiểm tra:** `check-mfa` toàn bộ **83 ĐẠT, 0 CHƯA ĐẠT**: phiên khác chưa xác thực lại nhận `303`, không thấy secret; xác nhận từ phiên đó không đổi `mfaSecret`, secret chờ vẫn còn; cờ lùi về 11 phút trước thì `/setup` nhận `303`; các ca đổi thiết bị cũ vẫn đạt (chưa xác nhận thì secret cũ vẫn đăng nhập được, xác nhận xong thì chuyển, không đổi nhóm recovery code).

## Bước 35 (bổ sung 12/11) — Ca kiểm thử gửi đồng thời viết lại cho chắc chắn
**Vì sao:** ca ở bước 35 gửi mã đúng "trễ 30 ms" sau 29 mã sai và kỳ vọng nó tới server sau cùng. Khi chép sang `api` (bước 37), ca cùng kiểu bị CHƯA ĐẠT 1 trong 6 lần chạy. Tái hiện có log phía server cho thấy: bộ đếm làm đúng (chỉ 5 lượt được kiểm, 25 lượt bị khoá), nhưng mã đúng nhận **lượt 2**: khi pool kết nối lạnh (kết nối rảnh đóng sau 10 giây), cả 30 request tới bước đếm gần như cùng lúc và thứ tự tới không theo thứ tự gửi. Lỗi nằm ở giả định của ca kiểm thử, không ở bản sửa. Bài 1 dùng cùng `attempt()` và cùng kiểu ca nên sửa cả hai nơi.

**Đã làm:** `check-mfa` phần B: mã đúng gửi **sau khi ít nhất 5 mã sai đã có phản hồi** (`afterN`), lúc đó bộ đếm chắc chắn ≥ 5 nên mã đúng nhận lượt > 5 → `429`, không phụ thuộc thứ tự qua pool. Kỳ vọng chặt hơn: đúng 4 mã sai báo `INVALID_OTP` (lượt 1–4), lượt thứ 5 khoá, còn lại `429`; thêm ca đọc `rate_limits`: `count = 30`, có `lockedUntil`.

**Đã kiểm tra:** `check-mfa` toàn bộ **84 ĐẠT, 0 CHƯA ĐẠT**.

## Bước 38 — Tài liệu và bằng chứng sau khi sửa lỗi (plan mục 14, theo 14.3 d)
**Đã làm:** `kichban.html`: lỗi chính nộp theo slide 58 nay là L1 (giới hạn sai mã MFA bị vượt khi gửi đồng thời: tái hiện, nguyên nhân, cách sửa, bằng chứng), lỗi nút Xoá tràn khung và L2 chuyển xuống "Lỗi khác", thêm dòng demo cho ca gửi đồng thời. `hotrotrinhbay.html`: tiêu chí "OTP sai quá giới hạn" ghi rõ kể cả khi gửi cùng lúc; bảng chính sách thêm giới hạn IP ở bước nhập mã và hạn 10 phút đổi thiết bị (plan mục 4). `evidence/curl/15-gui-dong-thoi.txt`: kết quả trước và sau khi sửa; `check-mfa.txt` thay bằng bản 84 ĐẠT; `evidence/README.md`, `README.md` cập nhật số liệu và chỗ trỏ. Sơ đồ 2 (đăng nhập MFA) vẽ lại: nút bộ đếm đổi thành "giới hạn IP rồi giữ lượt trước khi kiểm mã", mốc `file:dòng` cập nhật theo mã mới; sơ đồ 3 ghi hạn 10 phút.

**Đã kiểm tra:** `ve-so-do.mjs` chạy được với mốc mới (mốc cũ `state.lockedUntil`, `const after = await hit` không còn trong mã). Đo bằng Chrome headless: `kichban.html`, `hotrotrinhbay.html` ở 1280 và 375px `scrollWidth = clientWidth`, bảng cuộn trong khung, không ảnh hỏng. File bằng chứng mới không chứa mã, secret, token.

**Chưa chắc:** sơ đồ vẽ lại vẫn là bản nháp của agent, nhóm cần duyệt (H2). Chưa có ảnh DevTools thật (H1).

## Bước 40 — Bỏ session, chuyển sang JWT access token 90 giây + refresh token (yêu cầu của giảng viên, plan mục 15)
**Bối cảnh:** yêu cầu lúc đầu áp nhầm vào Bài 2 (commit `5f6512d`), đã revert ở `36c59e0`, và đã xoá bảng `refresh_tokens` khỏi DB Bài 2 (người dùng đồng ý; trước khi xoá đã in SQL diff: chỉ `DROP TABLE refresh_tokens`, 9 dòng do `check-api` tạo). Giảng viên yêu cầu Bài 1 không dùng session nữa mà xoay quanh JWT access + refresh.

**Đã làm:**
- DB Bài 1, chỉ thêm (đã in host và SQL bằng `prisma migrate diff` trước `db push`, không có `DROP`): cột `users.tokenVersion`, bảng `refresh_tokens` (`familyId`, `tokenHash`, `tokenVersion`, `expiresAt`, `familyExpiresAt`, `usedAt`, `revokedAt`), bảng `mfa_challenges`. Bảng `sessions` giữ nguyên, không dùng nữa (quy tắc "chỉ thêm").
- Gói: gỡ `express-session` 1.19.0; thêm `jsonwebtoken` **9.0.3** (ghim chính xác, cùng bản Bài 2). `.env`: `JWT_SECRET` thay `SESSION_SECRET`; tuỳ chọn `REFRESH_IDLE_MINUTES`, `REFRESH_ABSOLUTE_MINUTES`.
- Mô-đun mới, thuần (không đụng `req`/`res`): `auth/jwt.js` (access 90 giây, vé xác thực lại 10 phút khác audience), `auth/refresh.js` (family, rotation, phát hiện dùng lại, thu hồi), `auth/mfa-challenge.js`. Mô-đun nối với HTTP: `auth/cookies.js` (đọc / ghi cookie, một chỗ giữ tên và thuộc tính), `auth/activation-hint.js`.
- `auth/load-user.js`: access hợp lệ → dùng; không có / hết hạn mà còn refresh → **server tự xoay vòng ngay trong request đó**, đặt lại hai cookie, xử lý tiếp. `auth/csrf.js`: double-submit cookie `csrf` + ô `_csrf` + kiểm `Origin` như cũ. `require-mfa-pending.js`: đọc challenge từ cookie `mfa` (Path=/login/mfa).
- Route: `POST /login` cấp challenge (bật MFA) hoặc cặp token; `/login/mfa*` tiêu thụ challenge một lần rồi cấp token; `POST /logout` thu hồi family; đổi / đặt lại mật khẩu tăng `tokenVersion` + thu hồi mọi family (+ xoá challenge đang chờ); đổi mật khẩu cấp family mới cho thiết bị đang dùng, giữ trần tuyệt đối cũ; quản lý MFA dùng vé `mfa_reauth` (JWT 10 phút gắn `sub` + `fam`), giữ mã khôi phục theo `fam`. `app.js`: `GET /favicon.ico` trả 204 trước `loadUser`.

**Quyết định, lý do:** xem plan mục 15. Tóm tắt: refresh token là chuỗi ngẫu nhiên (không phải JWT) để thu hồi được; hạn theo phương án 3 (trượt X phút + trần Y phút, mặc định 120 / 720 như chính sách đã công bố, demo đặt 2 / 5 qua `.env`, plan 15.2 a); dùng lại → thu hồi cả family, không ân hạn (15.2 b); cookie `refresh` Path=/ vì SSR phải refresh ở request bất kỳ (khác "chỉ đi tới Auth" ở slide — vì access chỉ 90 giây, chuyển hướng sang trang refresh sẽ làm mất dữ liệu form); favicon trả 204 vì trình duyệt tự xin song song với trang, đi qua `loadUser` sẽ thành hai request cùng refresh token.

**Phương án đã bỏ:** giữ session phụ cho CSRF / chờ MFA (giảng viên yêu cầu bỏ hẳn session); sid 90 giây + refresh không JWT (không đúng phần B); chuyển hướng sang `/refresh` rồi quay lại (mất body của form POST); lưu `mfaReplaceAt` trong DB (vé JWT gắn `fam` đủ và không cần thêm cột).

**Đã kiểm tra:** `check-auth` thêm phần H (16 ca): không còn access → server cấp cặp mới trong chính request, refresh token đổi, dòng cũ có `usedAt`, cùng family; access hết hạn đúng lúc gửi form → dữ liệu vẫn được ghi; dùng lại refresh token cũ → 303 và cả family bị thu hồi, token mới nhất của chủ thật cũng chết; hai request đồng thời cùng refresh token → đo được `200,303`, family bị thu hồi; mặc định 120 / 720 phút; xoay vòng không vượt trần; quá hạn → 303; `REFRESH_*=2/5` → 2 / 5 phút, access vẫn 90 giây; IDLE > ABSOLUTE → server không khởi động; access chữ ký sai / alg none / sai audience / tv lệch → 303; tài khoản không active → 303; favicon 204 không xoay vòng; log không có token. Phần D, E, G viết lại theo cookie và `refresh_tokens` (thay các ca `sid`, bảng `sessions`). `check-mfa` viết lại 5 ca dựa vào session: bước password chỉ có cookie `mfa` (DB lưu hash), qua MFA mới có access + refresh, challenge dùng một lần, quá 5 phút → `mfa-expired`, vé xác thực lại chép sang family khác bị từ chối, vé quá 10 phút bị từ chối.
Kết quả cuối: `check-auth` **153 ĐẠT**, `check-mfa` **86 ĐẠT**, `check-rbac` **159 ĐẠT**, `check-ssr` **124 ĐẠT**, `check-policy` **32 ĐẠT**, 0 CHƯA ĐẠT.

### Lỗi phát hiện trong bước này (do agent viết)
**L5. Đặt lại mật khẩu không huỷ bước MFA đang chờ.**
- Tái hiện: tài khoản bật MFA; tab A nhập password đúng (đang ở `/login/mfa`); chủ tài khoản đặt lại mật khẩu ở tab B; tab A mở lại `/login/mfa` → vẫn 200, tức người dùng password cũ đi tiếp bước MFA được. `check-mfa` B: "Reset xoá cả phiên đang chờ MFA" **CHƯA ĐẠT — 200**.
- Nguyên nhân: bản cũ xoá mọi dòng `sessions` của user (gồm cả phiên chờ); khi chuyển sang token, agent chỉ thay bằng "thu hồi refresh token", quên `mfa_challenges`.
- Sửa: `revokeUserFamilies` (`src/auth/refresh.js`) xoá luôn challenge đang chờ của user; dùng ở đặt lại và đổi mật khẩu.
- Bằng chứng: chạy lại `check-mfa` → ca đó ĐẠT, 86/86.

**L6. Đọc cookie sai tên.** `readCookies` trả theo tên thật (`login_email`), route đọc theo khoá nội bộ (`loginEmail`) → mở lại `/login` không còn hiện CAPTCHA. `check-auth` C: "Mở lại /login: vẫn hiện CAPTCHA" CHƯA ĐẠT. Sửa: thêm `getCookie(req, key)` trong `cookies.js`, mọi chỗ đọc dùng nó. Sau sửa: ĐẠT.

**Lỗi của script kiểm thử:** `stopServer()` chờ sự kiện `exit` của tiến trình đã tự thoát (ca cố ý khởi động với cấu hình sai) → script treo. Sửa ở `scripts/lib/server.mjs`: tiến trình đã thoát thì không chờ.

**Chưa rõ:** một lần chạy riêng phần H, ca "gửi form khi access hết hạn" trả 400 ngay sau lần chạy bị treo ở trên; chạy lại toàn bộ và chạy riêng H thêm 2 lần đều ĐẠT, không tái hiện được, không còn tiến trình server nào sót. Ghi lại, chưa kết luận nguyên nhân.

**Rủi ro còn lại:** access token đã cấp vẫn dùng được tới 90 giây sau đăng xuất / thu hồi (JWT không tra DB); hai tab tải lại cùng lúc khi access đã hết hạn có thể làm người dùng bị đăng xuất (15.2 b nghiêm ngặt); cookie `csrf` không gắn với lần đăng nhập (double-submit thuần), dựa thêm vào SameSite và kiểm `Origin`.

**Chưa làm:** `hotrotrinhbay.html`, `kichban.html`, sơ đồ luồng, `README`, `evidence/` vẫn mô tả session / `sid`; CLAUDE.md còn dòng "Không thêm JWT vào Bài 1", "phiên chỉ có `mfaPending`", "`regenerate` sid" (đề xuất cập nhật, chưa sửa vì là file hướng dẫn của người dùng). DB còn 71 dòng `refresh_tokens` của tài khoản seed do các script tạo (tự hết hạn sau 2 giờ).
