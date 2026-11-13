# Network — refresh token bị dùng lại (thu ngày 2026-11-13)

Bản chữ của tab Network → Cookies trong Chrome (headless, DevTools Protocol). Hai trình duyệt độc lập: **CHỦ** và **KẺ GIAN**.
Token thay bằng vân tay = 8 ký tự đầu SHA-256, trùng 8 ký tự đầu `tokenHash` ở `db/13`. Chỉ ghi request trang (Document).
Response của `POST /login` có một loạt dòng xoá cookie trước dòng đặt cookie mới: server bỏ token / CSRF cũ của trình duyệt trước khi cấp cặp mới (`routes/auth/login.js`). Trình duyệt áp dụng theo thứ tự, dòng sau cùng có hiệu lực.

## Kịch bản A — kẻ gian dùng token trộm trước, chủ tài khoản dùng sau

### A1. CHỦ đăng nhập → nhận access (90 giây) + refresh R0
POST /login  →  303  Location: /admin/dishes
  Request Cookies : csrf
  Response Cookies: login_email = <vân tay 5fc1e49c>  Max-Age=900; Path=/login; Expires=Fri, 13 Nov 2026 13:13:45 GMT; HttpOnly; SameSite=Lax
  Response Cookies: access = (rỗng — xoá cookie)  Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: refresh = (rỗng — xoá cookie)  Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: mfa_reauth = (rỗng — xoá cookie)  Path=/admin/profile/mfa; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: csrf = (rỗng — xoá cookie)  Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: login_email = (rỗng — xoá cookie)  Path=/login; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: access = <vân tay a722be76>  Max-Age=90; Path=/; Expires=Fri, 13 Nov 2026 13:00:16 GMT; HttpOnly; SameSite=Lax
                    payload access: sub=144 tv=0 fam=94d66f76… iat=2026-11-13 12:58:46Z exp=2026-11-13 13:00:16Z (exp − iat = 90 giây)
  Response Cookies: refresh = <vân tay b3bb5bef>  Max-Age=7199; Path=/; Expires=Fri, 13 Nov 2026 14:58:46 GMT; HttpOnly; SameSite=Lax
GET /admin/dishes  →  200
  Request Cookies : access <vân tay a722be76>, refresh <vân tay b3bb5bef>
  Response Cookies: csrf = <vân tay 24bbf65b>  Path=/; HttpOnly; SameSite=Lax

R0 = <vân tay b3bb5bef>

### A2. KẺ GIAN gửi R0 (không có access) → server xoay vòng, kẻ gian vào được, nhận R1
GET /admin/dishes  →  200
  Request Cookies : refresh <vân tay b3bb5bef>
  Response Cookies: access = <vân tay 7cb2a73f>  Max-Age=90; Path=/; Expires=Fri, 13 Nov 2026 13:00:25 GMT; HttpOnly; SameSite=Lax
                    payload access: sub=144 tv=0 fam=94d66f76… iat=2026-11-13 12:58:55Z exp=2026-11-13 13:00:25Z (exp − iat = 90 giây)
  Response Cookies: refresh = <vân tay 556b602d>  Max-Age=7199; Path=/; Expires=Fri, 13 Nov 2026 14:58:55 GMT; HttpOnly; SameSite=Lax
  Response Cookies: csrf = <vân tay 1c2dabf2>  Path=/; HttpOnly; SameSite=Lax

R1 = <vân tay 556b602d> — khác R0: R0 đã bị đánh dấu usedAt

### A3. CHỦ (access đã hết) gửi R0 — token ĐÃ DÙNG → phát hiện dùng lại, thu hồi cả family, xoá cookie, 303 /login
GET /admin/dishes  →  303  Location: /login?next=%2Fadmin%2Fdishes
  Request Cookies : refresh <vân tay b3bb5bef>, csrf
  Response Cookies: access = (rỗng — xoá cookie)  Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: refresh = (rỗng — xoá cookie)  Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: mfa_reauth = (rỗng — xoá cookie)  Path=/admin/profile/mfa; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
GET /login?next=%2Fadmin%2Fdishes  →  200
  Request Cookies : csrf
  Response Cookies: (không có)

### A4a. KẺ GIAN còn access token chưa hết 90 giây → vẫn 200 (rủi ro còn lại đã công bố: JWT không tra DB)
GET /admin/dishes  →  200
  Request Cookies : access <vân tay 7cb2a73f>, refresh <vân tay 556b602d>, csrf
  Response Cookies: (không có)

### A4b. KẺ GIAN (access đã hết) gửi R1 — family đã thu hồi → 303 /login, mất quyền vào
GET /admin/dishes  →  303  Location: /login?next=%2Fadmin%2Fdishes
  Request Cookies : refresh <vân tay 556b602d>, csrf
  Response Cookies: access = (rỗng — xoá cookie)  Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: refresh = (rỗng — xoá cookie)  Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: mfa_reauth = (rỗng — xoá cookie)  Path=/admin/profile/mfa; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
GET /login?next=%2Fadmin%2Fdishes  →  200
  Request Cookies : csrf
  Response Cookies: (không có)

### A5. CHỦ đăng nhập lại bằng mật khẩu → family MỚI
GET /login  →  200
  Request Cookies : csrf
  Response Cookies: (không có)
POST /login  →  303  Location: /admin/dishes
  Request Cookies : csrf
  Response Cookies: login_email = <vân tay 5fc1e49c>  Max-Age=900; Path=/login; Expires=Fri, 13 Nov 2026 13:14:02 GMT; HttpOnly; SameSite=Lax
  Response Cookies: access = (rỗng — xoá cookie)  Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: refresh = (rỗng — xoá cookie)  Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: mfa_reauth = (rỗng — xoá cookie)  Path=/admin/profile/mfa; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: csrf = (rỗng — xoá cookie)  Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: login_email = (rỗng — xoá cookie)  Path=/login; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: access = <vân tay 5bc8a07e>  Max-Age=90; Path=/; Expires=Fri, 13 Nov 2026 13:00:32 GMT; HttpOnly; SameSite=Lax
                    payload access: sub=144 tv=0 fam=d7fbe6d9… iat=2026-11-13 12:59:02Z exp=2026-11-13 13:00:32Z (exp − iat = 90 giây)
  Response Cookies: refresh = <vân tay 86563cb3>  Max-Age=7199; Path=/; Expires=Fri, 13 Nov 2026 14:59:02 GMT; HttpOnly; SameSite=Lax
GET /admin/dishes  →  200
  Request Cookies : access <vân tay 5bc8a07e>, refresh <vân tay 86563cb3>
  Response Cookies: csrf = <vân tay 8fa91a73>  Path=/; HttpOnly; SameSite=Lax

