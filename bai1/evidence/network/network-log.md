## 1. Chưa đăng nhập vào /admin/dishes → 303 /login

### GET /admin/dishes → 303

```
Request headers
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /login?next=%2Fadmin%2Fdishes
```

### GET /login?next=%2Fadmin%2Fdishes → 200

```
Request headers
Response headers
  Content-Type: text/html; charset=utf-8
  Set-Cookie: csrf=<đã che · vân tay 61b10107>; Path=/; HttpOnly; SameSite=Lax
```

### Application → Cookies: sau khi bị chuyển về /login (không có access / refresh)

| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| csrf | csrf=<đã che · vân tay 61b10107> | localhost | / | Session | ✓ |  | Lax |

## 2a. Viewer đăng nhập

### POST /login → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: csrf=<đã che · vân tay e9b2582c>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/login
Form data
  _csrf=<đã che>&email=<email nhóm đã che>&password=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /admin/dishes
  Set-Cookie: login_email=<email nhóm đã che>; Max-Age=900; Path=/login; Expires=Fri, 13 Nov 2026 12:58:45 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: access=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: refresh=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: mfa_reauth=; Path=/admin/profile/mfa; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: csrf=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: login_email=; Path=/login; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: access=<đã che · vân tay b271fedc>; Max-Age=90; Path=/; Expires=Fri, 13 Nov 2026 12:45:15 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: refresh=<đã che · vân tay 59c65728>; Max-Age=7199; Path=/; Expires=Fri, 13 Nov 2026 14:43:45 GMT; HttpOnly; SameSite=Lax
```

### GET /admin/dishes → 200

```
Request headers
  Cookie: access=<đã che · vân tay b271fedc>; refresh=<đã che · vân tay 59c65728>
  Referer: http://localhost:3100/login
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: csrf=<đã che · vân tay 2b93b1be>; Path=/; HttpOnly; SameSite=Lax
```

### Application → Cookies: Viewer đã đăng nhập

| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| csrf | csrf=<đã che · vân tay 2b93b1be> | localhost | / | Session | ✓ |  | Lax |
| access | access=<đã che · vân tay b271fedc> | localhost | / | 2026-11-13 12:45:15Z | ✓ |  | Lax |
| refresh | refresh=<đã che · vân tay 59c65728> | localhost | / | 2026-11-13 14:43:44Z | ✓ |  | Lax |

## 2b. Viewer mở form thêm món → 403

### GET /admin/dishes/new → 403

```
Request headers
  Cookie: access=<đã che · vân tay b271fedc>; refresh=<đã che · vân tay 59c65728>; csrf=<đã che · vân tay 2b93b1be>
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
```

## 3a. Editor A mở món của đầu bếp B → 403

### POST /login → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: csrf=<đã che · vân tay 35544e0e>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/login
Form data
  _csrf=<đã che>&email=<email nhóm đã che>&password=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /admin/dishes
  Set-Cookie: login_email=<email nhóm đã che>; Max-Age=900; Path=/login; Expires=Fri, 13 Nov 2026 12:58:50 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: access=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: refresh=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: mfa_reauth=; Path=/admin/profile/mfa; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: csrf=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: login_email=; Path=/login; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: access=<đã che · vân tay afec1f12>; Max-Age=90; Path=/; Expires=Fri, 13 Nov 2026 12:45:21 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: refresh=<đã che · vân tay c3f862a7>; Max-Age=7199; Path=/; Expires=Fri, 13 Nov 2026 14:43:51 GMT; HttpOnly; SameSite=Lax
```

### GET /admin/dishes → 200

```
Request headers
  Cookie: access=<đã che · vân tay afec1f12>; refresh=<đã che · vân tay c3f862a7>
  Referer: http://localhost:3100/login
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: csrf=<đã che · vân tay 205f6d48>; Path=/; HttpOnly; SameSite=Lax
```

### GET /admin/dishes/1204/edit → 403

```
Request headers
  Cookie: access=<đã che · vân tay afec1f12>; refresh=<đã che · vân tay c3f862a7>; csrf=<đã che · vân tay 205f6d48>
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
```

## 3b. Editor A mở món published của mình → 403

### GET /admin/dishes/1/edit → 403

```
Request headers
  Cookie: access=<đã che · vân tay afec1f12>; refresh=<đã che · vân tay c3f862a7>; csrf=<đã che · vân tay 205f6d48>
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
```

## 4a. Editor gửi form đã mở từ trước, món vừa thành published → 403

### POST /admin/dishes/1224?_method=PATCH → 403

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: access=<đã che · vân tay afec1f12>; refresh=<đã che · vân tay c3f862a7>; csrf=<đã che · vân tay 205f6d48>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/admin/dishes/1224/edit
Form data
  back=%2Fadmin%2Fdishes&_csrf=<đã che>&name=%5BTEST+B9%5D+s%E1%BB%ADa+sau+khi+%C4%91%C3%A3+xu%E1%BA%A5t+b%E1%BA%A3n&price=50000&tagIds=2&newTags=&description=m%C3%B4+t%E1%BA%A3&ingredientIds=1&newIngredients=&imageUrl=&imageCredit=&available=on
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
```

## 4b. Editor bị hạ thành Viewer, gửi form đã mở từ trước → 403

### POST /admin/dishes/1224?_method=PATCH → 403

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: access=<đã che · vân tay afec1f12>; refresh=<đã che · vân tay c3f862a7>; csrf=<đã che · vân tay 205f6d48>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/admin/dishes/1224/edit
Form data
  back=%2Fadmin%2Fdishes&_csrf=<đã che>&name=%5BTEST+B9%5D+s%E1%BB%ADa+sau+khi+b%E1%BB%8B+h%E1%BA%A1+role&price=50000&tagIds=2&newTags=&description=m%C3%B4+t%E1%BA%A3&ingredientIds=1&newIngredients=&imageUrl=&imageCredit=&available=on
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
```

## 6. Editor thêm ô ẩn chefId, status, role vào form rồi gửi: server bỏ qua

### POST /admin/dishes/1224?_method=PATCH → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: access=<đã che · vân tay 9052e2ca>; refresh=<đã che · vân tay 5b79280a>; csrf=<đã che · vân tay 56104e11>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/admin/dishes/1224/edit
Form data
  back=%2Fadmin%2Fdishes&_csrf=<đã che>&name=%5BTEST+B9%5D+Nh%C3%A1p+c%E1%BB%A7a+A%2C+%C4%91%C3%A3+th%C3%AAm+%C3%B4+%E1%BA%A9n&price=50000&tagIds=2&newTags=&description=m%C3%B4+t%E1%BA%A3&ingredientIds=1&newIngredients=&imageUrl=&imageCredit=&available=on&chefId=2&status=published&role=admin
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Location: /admin/dishes?msg=dish-updated&saved=1224
```

### GET /admin/dishes?msg=dish-updated&saved=1224 → 200

```
Request headers
  Cookie: access=<đã che · vân tay 9052e2ca>; refresh=<đã che · vân tay 5b79280a>; csrf=<đã che · vân tay 56104e11>
  Referer: http://localhost:3100/admin/dishes/1224/edit
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
```

## 7a. Bấm Bật xác thực hai lớp: POST tạo secret chờ → 303 → GET vẽ QR

### POST /admin/profile/mfa/setup → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: access=<đã che · vân tay 46ab1e81>; refresh=<đã che · vân tay bb85c474>; csrf=<đã che · vân tay 4084d683>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/admin/profile
Form data
  _csrf=<đã che>
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Location: /admin/profile/mfa/setup
```

### GET /admin/profile/mfa/setup → 200

```
Request headers
  Cookie: access=<đã che · vân tay 46ab1e81>; refresh=<đã che · vân tay bb85c474>; csrf=<đã che · vân tay 4084d683>
  Referer: http://localhost:3100/admin/profile
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
```

## 7b. Nhập đúng mã: POST ghi hash recovery → 303 → GET hiện mã một lần

### POST /admin/profile/mfa/setup/confirm → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: access=<đã che · vân tay 46ab1e81>; refresh=<đã che · vân tay bb85c474>; csrf=<đã che · vân tay 4084d683>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/admin/profile/mfa/setup
Form data
  _csrf=<đã che>&otp=<đã che>
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Location: /admin/profile/mfa/codes
```

### GET /admin/profile/mfa/codes → 200

```
Request headers
  Cookie: access=<đã che · vân tay 46ab1e81>; refresh=<đã che · vân tay bb85c474>; csrf=<đã che · vân tay 4084d683>
  Referer: http://localhost:3100/admin/profile/mfa/setup
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
```

## 7c. Mở lại trang mã: mã không hiện lại

### GET /admin/profile/mfa/codes → 303

```
Request headers
  Cookie: access=<đã che · vân tay 46ab1e81>; refresh=<đã che · vân tay bb85c474>; csrf=<đã che · vân tay 4084d683>
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Location: /admin/profile?msg=mfa-codes-gone
```

### GET /admin/profile?msg=mfa-codes-gone → 200

```
Request headers
  Cookie: access=<đã che · vân tay 46ab1e81>; refresh=<đã che · vân tay bb85c474>; csrf=<đã che · vân tay 4084d683>
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
```

## 8a. Password đúng, đã bật MFA: 303 /login/mfa

### POST /login → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: csrf=<đã che · vân tay 25f7c31f>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/login
Form data
  _csrf=<đã che>&email=mfa.demo%40demo.example&password=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /login/mfa
  Set-Cookie: login_email=mfa.demo%40demo.example; Max-Age=900; Path=/login; Expires=Fri, 13 Nov 2026 12:59:21 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: access=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: refresh=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: mfa_reauth=; Path=/admin/profile/mfa; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: csrf=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: login_email=; Path=/login; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: mfa=<đã che · vân tay 42f9cd17>; Max-Age=900; Path=/login/mfa; Expires=Fri, 13 Nov 2026 12:59:21 GMT; HttpOnly; SameSite=Lax
```

### GET /login/mfa → 200

```
Request headers
  Cookie: mfa=<đã che · vân tay 42f9cd17>
  Referer: http://localhost:3100/login
Response headers
  Content-Type: text/html; charset=utf-8
  Set-Cookie: csrf=<đã che · vân tay 942f0c21>; Path=/; HttpOnly; SameSite=Lax
```

### Application → Cookies: chờ MFA: chỉ có cookie mfa (challenge), chưa có access / refresh

| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| csrf | csrf=<đã che · vân tay 942f0c21> | localhost | / | Session | ✓ |  | Lax |
| mfa | mfa=<đã che · vân tay 42f9cd17> | localhost | /login/mfa | 2026-11-13 12:59:21Z | ✓ |  | Lax |

## 8b. Chờ MFA (chỉ có challenge) mở /admin/dishes → bị chặn

### GET /admin/dishes → 303

```
Request headers
  Cookie: csrf=<đã che · vân tay 942f0c21>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /login?next=%2Fadmin%2Fdishes
```

### GET /login?next=%2Fadmin%2Fdishes → 200

```
Request headers
  Cookie: csrf=<đã che · vân tay 942f0c21>
Response headers
  Content-Type: text/html; charset=utf-8
```

## 8c. Nhập đúng mã: tiêu thụ challenge, cấp access + refresh

### POST /login/mfa → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: mfa=<đã che · vân tay 42f9cd17>; csrf=<đã che · vân tay 942f0c21>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/login/mfa
Form data
  _csrf=<đã che>&otp=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /admin/dishes
  Set-Cookie: mfa=; Path=/login/mfa; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: csrf=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: access=<đã che · vân tay 599e965d>; Max-Age=90; Path=/; Expires=Fri, 13 Nov 2026 12:45:55 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: refresh=<đã che · vân tay 2eaa2c00>; Max-Age=7199; Path=/; Expires=Fri, 13 Nov 2026 14:44:25 GMT; HttpOnly; SameSite=Lax
```

### GET /admin/dishes → 200

```
Request headers
  Cookie: access=<đã che · vân tay 599e965d>; refresh=<đã che · vân tay 2eaa2c00>
  Referer: http://localhost:3100/login/mfa
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: csrf=<đã che · vân tay 7746f341>; Path=/; HttpOnly; SameSite=Lax
```

### Application → Cookies: đăng nhập đầy đủ sau MFA

| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| csrf | csrf=<đã che · vân tay 7746f341> | localhost | / | Session | ✓ |  | Lax |
| access | access=<đã che · vân tay 599e965d> | localhost | / | 2026-11-13 12:45:55Z | ✓ |  | Lax |
| refresh | refresh=<đã che · vân tay 2eaa2c00> | localhost | / | 2026-11-13 14:44:24Z | ✓ |  | Lax |

## 9a. Dùng lại mã vừa dùng → INVALID_OTP

### POST /login/mfa → 200

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: mfa=<đã che · vân tay e1226d54>; csrf=<đã che · vân tay f2889605>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/login/mfa
Form data
  _csrf=<đã che>&otp=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
```

## 9b. Lần sai thứ 5 → 429 + Retry-After

### POST /login/mfa → 429

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: mfa=<đã che · vân tay e1226d54>; csrf=<đã che · vân tay f2889605>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/login/mfa
Form data
  _csrf=<đã che>&otp=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Retry-After: 901
```

## 10a. Recovery code lần đầu: cấp access + refresh, về hồ sơ

### POST /login/mfa/recovery → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: mfa=<đã che · vân tay fe0e262d>; csrf=<đã che · vân tay 3b24fdc6>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/login/mfa/recovery
Form data
  _csrf=<đã che>&code=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /admin/profile?msg=mfa-recovery-used
  Set-Cookie: mfa=; Path=/login/mfa; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: csrf=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: access=<đã che · vân tay 56838c5c>; Max-Age=90; Path=/; Expires=Fri, 13 Nov 2026 12:46:08 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: refresh=<đã che · vân tay 928d04f6>; Max-Age=7199; Path=/; Expires=Fri, 13 Nov 2026 14:44:38 GMT; HttpOnly; SameSite=Lax
```

### GET /admin/profile?msg=mfa-recovery-used → 200

```
Request headers
  Cookie: access=<đã che · vân tay 56838c5c>; refresh=<đã che · vân tay 928d04f6>
  Referer: http://localhost:3100/login/mfa/recovery
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: csrf=<đã che · vân tay 53017a7f>; Path=/; HttpOnly; SameSite=Lax
```

## 10b. Dùng lại recovery code → INVALID_OTP

### POST /login/mfa/recovery → 200

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: mfa=<đã che · vân tay d6503027>; csrf=<đã che · vân tay 303645dc>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/login/mfa/recovery
Form data
  _csrf=<đã che>&code=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
```

## 11a. Đặt mật khẩu mới: không cấp token

### POST /reset → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: csrf=<đã che · vân tay 8a548627>
  Origin: null
Form data
  _csrf=<đã che>&token=<đã che>&password=<đã che>&passwordConfirm=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /login?msg=password-reset
```

### GET /login?msg=password-reset → 200

```
Request headers
  Cookie: csrf=<đã che · vân tay 8a548627>
Response headers
  Content-Type: text/html; charset=utf-8
```

## 11b. Đăng nhập bằng mật khẩu mới: vẫn sang bước MFA

### POST /login → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: csrf=<đã che · vân tay df097fca>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/login
Form data
  _csrf=<đã che>&email=mfa.demo%40demo.example&password=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /login/mfa
  Set-Cookie: login_email=mfa.demo%40demo.example; Max-Age=900; Path=/login; Expires=Fri, 13 Nov 2026 12:59:49 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: access=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: refresh=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: mfa_reauth=; Path=/admin/profile/mfa; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: csrf=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: login_email=; Path=/login; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax
  Set-Cookie: mfa=<đã che · vân tay b303200a>; Max-Age=900; Path=/login/mfa; Expires=Fri, 13 Nov 2026 12:59:50 GMT; HttpOnly; SameSite=Lax
```

### GET /login/mfa → 200

```
Request headers
  Cookie: mfa=<đã che · vân tay b303200a>
  Referer: http://localhost:3100/login
Response headers
  Content-Type: text/html; charset=utf-8
  Set-Cookie: csrf=<đã che · vân tay 52d1ed71>; Path=/; HttpOnly; SameSite=Lax
```

### Application → Cookies: sau bước password, chưa qua MFA

| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| mfa | mfa=<đã che · vân tay b303200a> | localhost | /login/mfa | 2026-11-13 12:59:50Z | ✓ |  | Lax |
| csrf | csrf=<đã che · vân tay 52d1ed71> | localhost | / | Session | ✓ |  | Lax |

## 12a. Đúng mật khẩu, sai yếu tố thứ hai: không tắt

### POST /admin/profile/mfa/reauth/disable → 200

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: access=<đã che · vân tay 988efb6e>; refresh=<đã che · vân tay ba0cd62c>; csrf=<đã che · vân tay aacf8476>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/admin/profile/mfa/reauth/disable
Form data
  _csrf=<đã che>&password=<đã che>&factor=<đã che>
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
```

## 12b. Đúng mật khẩu và recovery code: tắt được

### POST /admin/profile/mfa/reauth/disable → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: access=<đã che · vân tay 988efb6e>; refresh=<đã che · vân tay ba0cd62c>; csrf=<đã che · vân tay aacf8476>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/admin/profile/mfa/reauth/disable
Form data
  _csrf=<đã che>&password=<đã che>&factor=<đã che>
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Location: /admin/profile?msg=mfa-disabled
```

### GET /admin/profile?msg=mfa-disabled → 200

```
Request headers
  Cookie: access=<đã che · vân tay 988efb6e>; refresh=<đã che · vân tay ba0cd62c>; csrf=<đã che · vân tay aacf8476>
  Referer: http://localhost:3100/admin/profile/mfa/reauth/disable
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
```

