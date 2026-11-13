# Network — vòng đời access / refresh token khi dùng bình thường (thu ngày 2026-11-13)

Cùng cách ghi với `refresh-token-dung-lai.md`: bản chữ tab Network → Cookies của Chrome headless, token thay bằng vân tay (trùng 8 ký tự đầu `tokenHash` ở `db/14`).

## C — access hết hạn khi đang gửi form: server tự refresh, dữ liệu không mất; JavaScript không đọc được token

Console trên trang /admin/profile: `document.cookie` = "" — access, refresh, csrf đều HttpOnly nên script của trang (kể cả script lạ do lỗi XSS) không đọc được.

### C1. Gửi form đổi tên khi KHÔNG còn access (chỉ có refresh) → server xoay vòng rồi xử lý form → 303 + cặp cookie mới
POST /admin/profile?_method=PATCH  →  303  Location: /admin/profile?msg=profile-updated
  Request Cookies : refresh <vân tay 86563cb3>, csrf
  Response Cookies: access = <vân tay b4d1943f>  Max-Age=90; Path=/; Expires=Fri, 13 Nov 2026 13:00:35 GMT; HttpOnly; SameSite=Lax
                    payload access: sub=144 tv=0 fam=d7fbe6d9… iat=2026-11-13 12:59:05Z exp=2026-11-13 13:00:35Z (exp − iat = 90 giây)
  Response Cookies: refresh = <vân tay e3cf28d0>  Max-Age=7199; Path=/; Expires=Fri, 13 Nov 2026 14:59:05 GMT; HttpOnly; SameSite=Lax
GET /admin/profile?msg=profile-updated  →  200
  Request Cookies : csrf, access <vân tay b4d1943f>, refresh <vân tay e3cf28d0>
  Response Cookies: (không có)

DB: users.username = "Demo refresh (đã sửa)" — dữ liệu form đã được ghi.

## D — đăng xuất thu hồi refresh token ở server (không chỉ xoá cookie)

Chép refresh token trước khi đăng xuất: <vân tay e3cf28d0>

### D1. Bấm Đăng xuất → server thu hồi family, xoá cookie, 303 /login
POST /logout  →  303  Location: /login?msg=logged-out
  Request Cookies : csrf, access <vân tay b4d1943f>, refresh <vân tay e3cf28d0>
  Response Cookies: access = (rỗng — xoá cookie)  Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: refresh = (rỗng — xoá cookie)  Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: mfa_reauth = (rỗng — xoá cookie)  Path=/admin/profile/mfa; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: csrf = (rỗng — xoá cookie)  Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
GET /login?msg=logged-out  →  200
  Request Cookies : (không có)
  Response Cookies: csrf = <vân tay 045ee7a5>  Path=/; HttpOnly; SameSite=Lax

### D2. Trình duyệt khác dùng bản sao refresh token đã chép → 303 /login (family đã thu hồi)
GET /admin/dishes  →  303  Location: /login?next=%2Fadmin%2Fdishes
  Request Cookies : refresh <vân tay e3cf28d0>
  Response Cookies: access = (rỗng — xoá cookie)  Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: refresh = (rỗng — xoá cookie)  Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: mfa_reauth = (rỗng — xoá cookie)  Path=/admin/profile/mfa; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
GET /login?next=%2Fadmin%2Fdishes  →  200
  Request Cookies : (không có)
  Response Cookies: csrf = <vân tay 0cf9cbd2>  Path=/; HttpOnly; SameSite=Lax

## E — đổi mật khẩu: thiết bị khác bị đăng xuất ngay, thiết bị đang dùng nhận family mới

Máy 2 (trình duyệt thứ hai) đăng nhập cùng tài khoản, access còn hạn.

### E1. Máy 1 đổi mật khẩu → 303 về hồ sơ, máy 1 nhận cặp token mới (family mới, tv mới)
POST /admin/profile/password  →  303  Location: /admin/profile?msg=password-changed
  Request Cookies : access <vân tay 663ba154>, refresh <vân tay 127febb0>, csrf
  Response Cookies: access = <vân tay 1180a6c6>  Max-Age=90; Path=/; Expires=Fri, 13 Nov 2026 13:00:45 GMT; HttpOnly; SameSite=Lax
                    payload access: sub=144 tv=1 fam=5d2df0e5… iat=2026-11-13 12:59:15Z exp=2026-11-13 13:00:45Z (exp − iat = 90 giây)
  Response Cookies: refresh = <vân tay f95e9464>  Max-Age=7199; Path=/; Expires=Fri, 13 Nov 2026 14:59:14 GMT; HttpOnly; SameSite=Lax
GET /admin/profile?msg=password-changed  →  200
  Request Cookies : csrf, access <vân tay 1180a6c6>, refresh <vân tay f95e9464>
  Response Cookies: (không có)

### E2. Máy 2 mở trang quản trị NGAY (access chưa hết 90 giây) → 303 /login: tv trong access lệch tokenVersion, refresh đã thu hồi
GET /admin/dishes  →  303  Location: /login?next=%2Fadmin%2Fdishes
  Request Cookies : access <vân tay d69ca61b>, refresh <vân tay 2c750a8a>, csrf
  Response Cookies: access = (rỗng — xoá cookie)  Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: refresh = (rỗng — xoá cookie)  Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Response Cookies: mfa_reauth = (rỗng — xoá cookie)  Path=/admin/profile/mfa; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
GET /login?next=%2Fadmin%2Fdishes  →  200
  Request Cookies : csrf
  Response Cookies: (không có)

## F — hạn refresh đo bằng thời gian thật (REFRESH_IDLE_MINUTES=2, REFRESH_ABSOLUTE_MINUTES=3, access 90 giây)

Không xoá cookie bằng tay ở ca này: Chrome tự bỏ cookie access sau Max-Age 90 giây. Máy 1 để yên (hạn không hoạt động); máy 2 thao tác đều (trần tuyệt đối).

### F1. Máy 2 thao tác ở giây 97 (access đã tự hết) → 200, xoay vòng; Max-Age của refresh mới bị cắt theo trần 3 phút
GET /admin/dishes  →  200
  Request Cookies : refresh <vân tay 282a7b65>, csrf
  Response Cookies: access = <vân tay 29a764d5>  Max-Age=90; Path=/; Expires=Fri, 13 Nov 2026 13:02:30 GMT; HttpOnly; SameSite=Lax
                    payload access: sub=144 tv=1 fam=95decaec… iat=2026-11-13 13:01:00Z exp=2026-11-13 13:02:30Z (exp − iat = 90 giây)
  Response Cookies: refresh = <vân tay 9837ca59>  Max-Age=82; Path=/; Expires=Fri, 13 Nov 2026 13:02:23 GMT; HttpOnly; SameSite=Lax

### F2. Máy 1 để yên tới giây 126 (quá 2 phút không hoạt động) → 303 /login
GET /admin/dishes  →  303  Location: /login?next=%2Fadmin%2Fdishes
  Request Cookies : csrf
  Response Cookies: (không có)
GET /login?next=%2Fadmin%2Fdishes  →  200
  Request Cookies : csrf
  Response Cookies: (không có)

### F3. Máy 2 thao tác tiếp ở giây 191 (đã quá trần 3 phút từ lúc đăng nhập) → 303 /login dù vẫn đang dùng
GET /admin/dishes  →  303  Location: /login?next=%2Fadmin%2Fdishes
  Request Cookies : csrf
  Response Cookies: (không có)
GET /login?next=%2Fadmin%2Fdishes  →  200
  Request Cookies : csrf
  Response Cookies: (không có)

Ở F2, F3 Chrome đã tự bỏ cookie refresh vì Max-Age của nó bằng đúng hạn trong DB. Bước F4 kiểm tra phía server: ai giữ bản sao token đã hết hạn (vd. kẻ gian chép từ trước) gửi thẳng lên vẫn bị từ chối theo cột expiresAt.

### F4. Gửi thẳng bản sao refresh token đã hết hạn (như curl -i, không có access)
$ curl -i -b "refresh=<vân tay 9e14bd33>" http://localhost:3100/admin/dishes   # máy 1 (quá hạn không hoạt động)
HTTP/1.1 303  Location: /login?next=%2Fadmin%2Fdishes  Set-Cookie: access=, refresh=, mfa_reauth=
$ curl -i -b "refresh=<vân tay 9837ca59>" http://localhost:3100/admin/dishes   # máy 2, token mới nhất (chạm trần 3 phút)
HTTP/1.1 303  Location: /login?next=%2Fadmin%2Fdishes  Set-Cookie: access=, refresh=, mfa_reauth=

