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


**Database (sau khi có `.env`):** đã kiểm tra `DATABASE_URL` khác project của Bài 1. `prisma migrate diff` chỉ có `CREATE` và thêm khoá ngoại, không có `DROP`. `db push`, `setup-search.sql`, seed xong: 1.206 món (1.200 published, 6 draft), 60 đầu bếp, 250 nguyên liệu, 16 tag, 4 tài khoản. md5 của 1.200 món published trùng với database Bài 1. Tìm toàn văn và gần đúng có dấu chạy đúng.

## Bước 21–24 — JWT, đăng nhập, challenge MFA, tài khoản, quản lý MFA
**Đã làm:** `auth/jwt.js`, `require-jwt.js`, `require-permission.js`, `cleanup.js`; `routes/auth.js` (login, mfa, me, register, activate, resend, forgot, reset), `routes/mfa.js` (status, setup, confirm, replace, recovery-codes, disable). CORS có `Authorization`, `exposedHeaders: ["Retry-After"]`. `scripts/check-api.mjs` phần A–D.

**Quyết định và lý do:**
- Giữ nguyên thứ tự kiểm tra của Bài 1, kể cả `hit` khi sai và hash giả khi email không có; chỉ đổi form + redirect thành JSON.
- Trường CAPTCHA trong body JSON tên `captchaToken`. Sai password trả thêm `captchaRequired` để `web` biết hiện CAPTCHA.
- Bước xác thực lại dùng một mã lỗi `INVALID_OTP` cho cả sai password và sai mã: `reauthenticate` chép nguyên từ Bài 1, không phân biệt; vẫn đúng yêu cầu trả `200` để `web` không đăng xuất nhầm.
- Reset mật khẩu huỷ cả challenge đang chờ, tương ứng với việc Bài 1 xoá phiên chờ.
- Thêm `GET /api/auth/mfa/status` vì trang bảo mật của `web` cần biết đã bật chưa, còn bao nhiêu mã.
- Tắt MFA không cấp token mới: token đang dùng hết hiệu lực, `web` đưa về đăng nhập.
- Token hết hạn chỉ trả `TOKEN_EXPIRED` khi chữ ký đúng; token giả đã hết hạn vẫn là `UNAUTHENTICATED`.

**Đã kiểm tra:** `check-api` A–D: **116 ĐẠT, 1 CHƯA ĐẠT**. Ca chưa đạt ("Challenge gửi tới route dữ liệu") là cổng của bước 25, chưa làm tại thời điểm này.

## Bước 25, 26 — Cổng và ABAC ở route dữ liệu, mốc "đạt api"
**Đã làm:** `requireJwt` → `requirePermission` → `guardDish` đặt trước `jsonBody` ở mọi route ghi; mọi route đầu bếp, nguyên liệu, `GET`, `POST /api/tags` cần token. `routes/admin-dishes.js` (`GET /api/admin/dishes`, `/:id`, có bộ lọc `status`, trả `canEdit` do server tính). `search/dish-filter.js` đưa điều kiện món nháp vào SQL của toàn văn và gần đúng. Xoá `scripts/check-api.sh` của block7 vì các lệnh ghi trong đó nay đều `401`; `check-api.mjs` thay thế. `check-api` phần E, F.

**Quyết định và lý do:**
- Route công khai bỏ cột `status` khỏi response: cột này mới có ở Bài 2, để lại sẽ làm response khác block7 (slide 67).
- `PATCH` chỉ có `tagIds` hoặc `ingredientIds` vẫn chạy câu ghi có điều kiện bằng `price: { increment: 0 }`: giữ khoá dòng và kiểm điều kiện ABAC mà không ghi đè giá trị nào bằng dữ liệu đã đọc trước đó.
- Viewer hoặc Editor khác mở món nháp ở `GET /api/admin/dishes/:id` nhận `403`, cùng cách xử lý với form sửa ở Bài 1.
- Số món theo tag ở `?include=tags` chỉ đếm published; `GET /api/tags` cần token giữ tổng thật cho trang quản trị.

**Đã kiểm tra:** `check-api` toàn bộ **213 ĐẠT, 0 CHƯA ĐẠT** (slide 67, 68; plan 10.2). Sau kiểm thử: 4 tài khoản, 1.206 món, không còn bộ đếm, challenge, recovery code, không tài khoản nào bật MFA. `grep` trong `api/src`: không có `express-session`, `req.session`, `csrf`, `res.render`; chỉ hai route công khai của món không có `requireJwt`; `signAccessToken` chỉ được gọi sau khi qua hết kiểm tra ở `login` (nhánh không MFA) và `mfa`; `console.*` không in token, mật khẩu, mã.

**Mốc đạt api:** đủ bảng 10.2 bằng request trực tiếp. Sang `web` được.

**Chưa chắc:**
- Điều kiện trong câu ghi đầu tiên chỉ kiểm tra được theo thứ tự tuần tự (đổi status, hạ role rồi gửi `PATCH`); chưa dựng được hai request chen đúng vào giữa cổng và câu ghi.
- CAPTCHA chạy bằng key thử của Google; `INVALID_CAPTCHA` tạo bằng cách đặt hostname ngoài danh sách. Thư đi qua transport `file`, chưa gửi Gmail thật từ `api`.

## Bước 27–31 — Web: lớp gọi API, trang tài khoản, route guard, quản lý MFA, hồi quy
**Đã làm:**
- `api/client.js` gắn `Authorization` ở một chỗ, đọc body của `401`, `403`, `429` trước khi phân loại. `auth/token.js` là nơi duy nhất đụng `sessionStorage`. `hooks/useAuth.js` đọc `/api/auth/me`, Layout truyền xuống bằng context của `Outlet`.
- Trang đăng nhập, bước MFA (M4), mã khôi phục (M5), đăng ký, OTP kích hoạt, quên, đặt lại mật khẩu; CSS chép từ Bài 1 nên cùng bản Figma đã duyệt.
- `RequireAuth` cho `/admin/*`, `Guard` cho trang chỉ một số role mở được. Danh sách món có cột và bộ lọc Trạng thái, Viewer chỉ đọc, nút Sửa theo `canEdit` do `api` tính, form Editor không có ô Đầu bếp, Trạng thái. Trang quản trị đọc qua `/api/admin/dishes`.
- `/admin/security`: M6, M7, M8, M9 trong một URL.

**Quyết định và lý do:**
- Secret và recovery code chỉ ở state của trang, không dùng route riêng: không vào URL, lịch sử trình duyệt, storage. Reload là mất, server không phát lại.
- Challenge giữ trong biến bộ nhớ: chỉ có ích ở một bước và sống 5 phút.
- `401` chỉ xoá token và ghi lý do; `RequireAuth` tự đưa về đăng nhập, nhớ trang đang mở. Không cần `web` gọi router từ lớp API.
- `403` báo ngay trong trang theo M3, giữ token (slide 39). Lỗi mạng, `500` không đăng xuất.
- `ResetPage` bỏ token khỏi thanh địa chỉ sau khi đọc: không còn trong lịch sử, không đi theo `Referer`.
- Đăng xuất chỉ xoá token ở trình duyệt, công bố giới hạn (12.7).

**Đã kiểm tra (Chrome thật, `api/scripts/collect-evidence.mjs`):** mọi ca đều ĐẠT: Viewer chỉ đọc; `403` giữ token; sửa role trong storage không tăng quyền; token bị sửa, hết hạn về đăng nhập rồi quay lại đúng trang; API tắt không đăng xuất; route công khai không gửi `Authorization`, không preflight dù đang đăng nhập; MFA, recovery code, reset vẫn qua MFA; Reload giữ phiên, tab mới không có token. Không cuộn ngang ở 1280, 820, 375, 320 cho 11 màn. Đã xem ảnh các màn chính: đúng bản Figma, thực đơn đúng như block7, số món theo tag đã trừ món nháp.

**Chưa chắc:** script không tick được ô CAPTCHA thật và dùng thư qua transport `file`; ca này cần người thử.

## Bước 32, 33, 34 — Nghiệm thu, bằng chứng, tài liệu
**Đã kiểm tra:** `check-api` **213 ĐẠT, 0 CHƯA ĐẠT** trên code cuối; `collect-evidence` qua Chrome thật, mọi ca ĐẠT; quét `evidence/` không thấy email nhóm, `JWT_SECRET`, `OTP_PEPPER`, `MFA_ENCRYPTION_KEY`, mật khẩu seed, App Password, chuỗi kết nối, JWT; bundle của `web` không chứa các khoá này (`evidence/curl/14`). Seed lại sau cùng.

**Chờ người thử** (nên chưa đánh dấu "đạt Bài 2"): tick ô CAPTCHA thật khi đăng ký, nhận thư Gmail thật từ `api`, quét QR bằng ứng dụng thật ở `web`.

**Lỗi trong lúc thu bằng chứng (script, không phải ứng dụng):** ban đầu log Network không có dòng preflight nào, vì Chrome báo preflight là `OPTIONS` loại `Other` nên bộ lọc theo loại bỏ sót, và câu "không preflight" ở route công khai vì vậy chưa có cơ sở. Đã lọc thêm theo method, kiểm tra preflight thật khi Editor lưu món. Bộ chặn rò rỉ coi chuỗi `admin` do script ghi vào storage là bí mật nên từ chối ghi; đo tràn ngang trang đăng ký bằng cách thu nhỏ cửa sổ sau khi widget CAPTCHA đã dựng ở cỡ lớn, cho kết quả sai. Đã sửa: chỉ coi JWT là bí mật trong storage; mở trang đúng ở 320px rồi mới đo.

## Kiểm tra mã nguồn (slide 66)
1. **Verify có cố định thuật toán và kiểm tra `exp`; quyền có lấy từ body, payload chưa verify?** Cố định HS256, có `exp`, `iss`, `aud`: `api/src/auth/jwt.js:23`. Quyền lấy từ user đọc DB theo `sub`: `api/src/auth/require-jwt.js:23`, `:25`. `chefId`, `status` trong body của Editor bị bỏ: `api/src/routes/dishes.js:125`; `check-api` phần A, E.
2. **Tài khoản pending, chờ MFA có nhận JWT ở login?** Không. `signAccessToken` chỉ gọi qua `issueToken` ở `api/src/routes/auth.js:88` (sau kiểm tra active ở `:83` và nhánh MFA ở `:87`) và `:117` (sau khi qua mã, challenge đã tiêu thụ).
3. **Có endpoint thiếu token, quyền; GET đổi dữ liệu?** Chỉ `GET /api/dishes`, `/:id` không có `requireJwt` (`api/src/routes/dishes.js`, đúng slide 63). Các `router.get` chỉ đọc; `check-api` phần E gọi từng route không token.
4. **Khoá ký, token, password có trong log, bundle, payload?** Không. `console.*` trong `api/src` chỉ in mã lỗi và SQL đã ẩn tham số bảng xác thực (`api/src/db.js`). Payload chỉ có `sub`, `tv`, `iat`, `exp`, `iss`, `aud` (`check-api` A, `evidence/storage/01`). Bundle: `evidence/curl/14`, `web/src` chỉ đọc `VITE_API_URL`, `VITE_RECAPTCHA_SITE_KEY`. Log: `evidence/curl/13`.
5. **CORS có `*`?** Không. Một origin từ `CORS_ORIGIN`, `*` bị từ chối lúc khởi động: `api/src/app.js:18`, `:37`.

## Bước 37 — Chép bản sửa L1 sang `api`, giới hạn IP ở `POST /api/auth/mfa`, tìm nguyên nhân ca kiểm thử chập chờn (plan mục 14)

**Đã làm:** `src/auth/rate-limit.js` chép nguyên từ Bài 1 bước 35 (thêm `lock()`); `attempt()` trong `src/auth/mfa.js` sửa giống Bài 1 (giữ lượt bằng `hit()` trước khi kiểm mã), phần `disableMfa` riêng của Bài 2 giữ nguyên — `diff` với Bài 1 chỉ còn khác phần này như trước; `src/routes/auth.js`: `POST /api/auth/mfa` giới hạn 30 lần / 15 phút / IP (`mfa:ip:<ip>`) sau bước kiểm challenge, trước bộ đếm theo user; `scripts/check-api.mjs` phần B thêm ca gửi đồng thời, ca đọc bộ đếm trong DB, ca giới hạn IP; `MODULES.md` ghi phần đã đổi.

### Lỗi phát hiện khi rà soát sau nghiệm thu (do agent viết) — lỗi chính nộp theo slide 69
**Gửi đồng thời nhiều mã thì giới hạn 5 lần sai / 15 phút ở `POST /api/auth/mfa` không có tác dụng** (cùng lỗi L1 của Bài 1, đi theo mô-đun `auth/mfa.js` chép sang).
- Cách tái hiện: đăng nhập password của tài khoản đã bật MFA để lấy `challenge`, gửi **cùng lúc** 29 mã sai và 1 mã đúng tới `POST /api/auth/mfa`.
- Kết quả trước khi sửa (3/3 lần bằng phép thử độc lập, và 4 ca mới của `check-api` đều CHƯA ĐẠT trên mã cũ): mã đúng nhận `200` kèm `accessToken`; bộ đếm ghi `count=30`, tức cả 30 mã đều đã được so với secret; response chỉ có 4 `INVALID_OTP` nên nhìn response thì tưởng giới hạn vẫn chạy.
- Nguyên nhân: `attempt()` đọc bộ đếm, kiểm mã, rồi mới tăng; các request đến cùng lúc đều đọc thấy chưa đủ ngưỡng. Qua API JSON lỗi còn dễ khai thác hơn Bài 1 vì không cần form, CSRF.
- Cách sửa: như Bài 1 bước 35 (giữ lượt trước khi kiểm), thêm giới hạn theo IP.
- Bằng chứng sau khi sửa: `check-api` **218 ĐẠT, 0 CHƯA ĐẠT**; phép thử độc lập 6/6 lần mã đúng bị `429`; log tạm phía server trong 46 loạt tái hiện (mục dưới) đều cho thấy đúng 5 lượt được kiểm mã, 25 lượt bị khoá.

### Ca kiểm thử chập chờn: cách tìm nguyên nhân và kết luận
**Hiện tượng:** sau khi sửa, ca "mã đúng gửi sau 29 mã sai vẫn 429" CHƯA ĐẠT 1 trong 6 lần chạy `check-api` (mã đúng nhận `200`), trong khi ca "tối đa 4 mã sai báo INVALID_OTP" và hai ca giới hạn IP vẫn ĐẠT. Chưa thể phân biệt ca kiểm thử sai hay bản sửa còn khe hở, nên không commit, ghi "chưa chắc" (12/11, bản trước của mục này).

**Cách tìm:** thêm log tạm (bật bằng `MFA_DEBUG=1`, đã gỡ, không commit) vào `attempt()` in số lượt, trạng thái khoá, có kiểm mã hay không, và vào `POST /mfa` in mốc thời gian từng chặng của mỗi request (tới route → tra challenge → giới hạn IP → xong) kèm thẻ `C` (mã đúng) / `W1`–`W29` (mã sai) và độ trễ từ lúc client gọi `fetch` tới lúc vào route. Viết kịch bản lặp lại đúng loạt của `check-api` ở ba điều kiện: server vừa khởi động (`cold`), pool rảnh quá 10 giây (`idle`, đúng trạng thái lúc `check-api` tới ca này vì các ca trước chạy tuần tự), và ngay sau loạt trước (`warm`). Tổng 46 loạt, tái hiện được 3 lần, đều ở `idle`.

**Kết luận: bản sửa làm đúng; giả định của ca kiểm thử sai.**
- Trong cả 46 loạt, server chỉ kiểm mã ở đúng 5 lượt (1–5), 25 lượt còn lại bị khoá; không có lượt > 5 nào được kiểm, không có chuỗi lượt khởi động lại ngoài trường hợp mã đúng được chấp nhận (khi đó `reset` là hành vi thiết kế: mã đúng xoá bộ đếm).
- Ở 3 loạt lỗi, mã đúng nhận **lượt 2, lượt 1, và một lượt trong 1–5**: nó tới bước đếm trước phần lớn mã sai dù được gửi trễ 30 ms. Mốc thời gian cho thấy thứ tự gửi bị mất ở hai chỗ độc lập: (1) **phía client**: 30 request mở 30 kết nối mới tới server, độ trễ từ `fetch` tới route đo được 400–1.000 ms cho mọi request (không phải do tra DNS: dùng `127.0.0.1` cũng vậy), chênh lệch sớm–muộn trong cùng loạt 120–150 ms, nên 30 ms gửi trễ không quyết định gì; có loạt mã đúng tới route **trước cả 29 mã sai** (`arrive` 14544 so với 14622–15044 ms). (2) **phía server**: khi pool `pg` lạnh (kết nối rảnh đóng sau 10 giây), hai truy vấn trước bước đếm (tra challenge, giới hạn IP) phải chờ mở kết nối mới, có request chờ hơn 500 ms, thứ tự vào `hit` khác thứ tự vào route; có loạt mã đúng tới route **sau cùng** mà vẫn nhận lượt ≤ 5.
- Hai lần chạy đầu không thấy lỗi vì thứ tự tình cờ đúng; xác suất lỗi quan sát được khoảng 1/5–1/12 ở điều kiện `idle`.

**Cách sửa ca kiểm thử (cả hai bài, Bài 1 ở commit `a3bd342`):** mã đúng gửi **sau khi ít nhất 5 mã sai đã có phản hồi** (`afterN`). Lúc đó bộ đếm chắc chắn ≥ 5 nên mã đúng nhận lượt > 5 → `429`, không phụ thuộc thứ tự qua kết nối hay pool. Kỳ vọng chặt hơn: đúng 4 mã sai `INVALID_OTP` (lượt 1–4), lượt thứ 5 khoá, còn lại `429`; thêm ca đọc `rate_limits`: `count = 30`, có `lockedUntil`. Chạy lại: `check-api` 218 ĐẠT (các lần chạy có log tạm: 7/7 loạt kiểu mới đều đạt).

**Bài học ghi lại:** ca kiểm thử đồng thời không được dựa vào "gửi trễ vài chục ms"; phải tạo điều kiện bằng một sự kiện đã quan sát được (đã nhận phản hồi) hoặc đọc trạng thái phía server. Kiểm thử bằng response thôi không đủ: lỗi L1 ban đầu lọt qua vì response trông đúng, chỉ bộ đếm trong DB mới cho thấy cả 30 mã đã được kiểm.

**Đã kiểm tra sau cùng:** `check-api` toàn bộ **218 ĐẠT, 0 CHƯA ĐẠT**; `grep DEBUG` trong `api/src` không còn; `git diff` chỉ gồm 6 file chủ ý; database Bài 2 còn đúng 4 tài khoản seed, không còn user thử, `rate_limits` rỗng.

**Còn lại:** bước 38 (tài liệu trình bày, lỗi chính theo plan 14.3 d, thu lại bằng chứng ca khoá tạm), bước 39 (việc làm tay).
