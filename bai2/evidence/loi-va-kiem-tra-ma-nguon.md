# Bài 2 — Kiểm tra mã nguồn và lỗi do agent tạo ra

Trích nguyên văn từ nhật ký làm bài (`BUILD_LOG.md`) để nộp theo slide 66 và slide 69. Số dòng mã ứng với commit nộp.
Số `check-api` ghi trong phần lỗi là con số lúc sửa (218, ngày 12/11); bản nộp hiện tại: **226 ĐẠT, 0 CHƯA ĐẠT** (`curl/check-api.txt`, 20/11, sau khi thêm ca nhóm đầu bếp).

## 1. Kiểm tra mã nguồn (slide 66)
1. **Verify có cố định thuật toán và kiểm tra `exp`; quyền có lấy từ body, payload chưa verify?** Cố định HS256, có `exp`, `iss`, `aud`: `api/src/auth/jwt.js:23`. Quyền lấy từ user đọc DB theo `sub` (role, nhóm đầu bếp): `api/src/auth/require-jwt.js:23`, `:28`. `status` trong body của Editor bị bỏ: `api/src/routes/dishes.js:124`; `chefId` của Editor phải thuộc nhóm đọc từ DB, không tin body (`canAssignChef`, `dishes.js:162`, `:194`; cập nhật 20/11, plan 16); `check-api` phần A, E.
2. **Tài khoản pending, chờ MFA có nhận JWT ở login?** Không. `signAccessToken` chỉ gọi qua `issueToken` ở `api/src/routes/auth.js:88` (sau kiểm tra active ở `:83` và nhánh MFA ở `:87`) và `:123` (sau khi qua mã, challenge đã tiêu thụ).
3. **Có endpoint thiếu token, quyền; GET đổi dữ liệu?** Chỉ `GET /api/dishes`, `/:id` không có `requireJwt` (`api/src/routes/dishes.js`, đúng slide 63). Các `router.get` chỉ đọc; `check-api` phần E gọi từng route không token.
4. **Khoá ký, token, password có trong log, bundle, payload?** Không. `console.*` trong `api/src` chỉ in mã lỗi và SQL đã ẩn tham số bảng xác thực (`api/src/db.js`). Payload chỉ có `sub`, `tv`, `iat`, `exp`, `iss`, `aud` (`check-api` A, `evidence/storage/01`). Bundle: `evidence/curl/14`, `web/src` chỉ đọc `VITE_API_URL`, `VITE_RECAPTCHA_SITE_KEY`. Log: `evidence/curl/13`.
5. **CORS có `*`?** Không. Một origin từ `CORS_ORIGIN`, `*` bị từ chối lúc khởi động: `api/src/app.js:18`, `:37`.

## 2. Lỗi do agent tạo ra — lỗi chính nộp theo slide 69
Phát hiện khi rà soát sau nghiệm thu (12/11/2026), không phải trong lúc làm. Bằng chứng: `curl/16-gui-dong-thoi.txt`, `curl/check-api.txt` phần B.

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


## 3. Lỗi khác do agent tạo ra (trong lúc làm, bước 18)
**Lệnh chép nền không loại trừ `.env`, `node_modules`.**
- Cách tái hiện: trong zsh đặt `X="--exclude=.env --exclude=node_modules/"` rồi chạy `rsync -a $X nguồn/ đích/`.
- Nguyên nhân: zsh không tách biến chưa có dấu ngoặc kép thành nhiều tham số, nên `rsync` nhận cả chuỗi là một mục loại trừ duy nhất và không loại gì.
- Hậu quả: `bai2/api/.env` (trỏ vào database cũ), `bai2/web/.env`, `node_modules`, `generated`, `dist` nằm trên đĩa trong vài phút. Không vào Git nhờ `.gitignore`: commit chỉ có 91 tệp, duy nhất hai tệp `.env.example` mẫu. Nếu không phát hiện, seed ở bước 19 sẽ chạy vào database của Bài 1.
- Cách sửa: xoá các bản chép thừa ở `bai2/`, không đụng `Week5/block7`.
- Bằng chứng sau khi sửa: `find bai2 -name '.env*'` chỉ còn hai `.env.example`; `git ls-files bai2` và số tệp trên đĩa đều là 91.
