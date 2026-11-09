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
  Set-Cookie: sid=<đã che · vân tay 474fd7bf>; Path=/; Expires=Mon, 09 Nov 2026 09:58:11 GMT; HttpOnly; SameSite=Lax
```

### Application → Cookies: sau khi bị chuyển về /login (chỉ có phiên ẩn danh)

| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sid | sid=<đã che · vân tay 474fd7bf> | localhost | / | 2026-11-09 09:58:15Z | ✓ |  | Lax |

## 2a. Viewer đăng nhập

### POST /login → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay ecba75bf>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/login
Form data
  _csrf=<đã che>&email=<email nhóm đã che>&password=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /admin/dishes
  Set-Cookie: sid=<đã che · vân tay 82172c9f>; Path=/; Expires=Mon, 09 Nov 2026 09:58:19 GMT; HttpOnly; SameSite=Lax
```

### GET /admin/dishes → 200

```
Request headers
  Cookie: sid=<đã che · vân tay 82172c9f>
  Referer: http://localhost:3100/login
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 82172c9f>; Path=/; Expires=Mon, 09 Nov 2026 09:58:19 GMT; HttpOnly; SameSite=Lax
```

### Application → Cookies: Viewer đã đăng nhập

| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sid | sid=<đã che · vân tay 82172c9f> | localhost | / | 2026-11-09 09:58:19Z | ✓ |  | Lax |

## 2b. Viewer mở form thêm món → 403

### GET /admin/dishes/new → 403

```
Request headers
  Cookie: sid=<đã che · vân tay 82172c9f>
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 82172c9f>; Path=/; Expires=Mon, 09 Nov 2026 09:58:21 GMT; HttpOnly; SameSite=Lax
```

## 3a. Editor A mở món của đầu bếp B → 403

### POST /login → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay 8a20221e>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/login
Form data
  _csrf=<đã che>&email=<email nhóm đã che>&password=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /admin/dishes
  Set-Cookie: sid=<đã che · vân tay 4af5d055>; Path=/; Expires=Mon, 09 Nov 2026 09:58:26 GMT; HttpOnly; SameSite=Lax
```

### GET /admin/dishes → 200

```
Request headers
  Cookie: sid=<đã che · vân tay 4af5d055>
  Referer: http://localhost:3100/login
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 4af5d055>; Path=/; Expires=Mon, 09 Nov 2026 09:58:27 GMT; HttpOnly; SameSite=Lax
```

### GET /admin/dishes/1204/edit → 403

```
Request headers
  Cookie: sid=<đã che · vân tay 4af5d055>
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 4af5d055>; Path=/; Expires=Mon, 09 Nov 2026 09:58:28 GMT; HttpOnly; SameSite=Lax
```

## 3b. Editor A mở món published của mình → 403

### GET /admin/dishes/1/edit → 403

```
Request headers
  Cookie: sid=<đã che · vân tay 4af5d055>
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 4af5d055>; Path=/; Expires=Mon, 09 Nov 2026 09:58:28 GMT; HttpOnly; SameSite=Lax
```

## 4a. Editor gửi form đã mở từ trước, món vừa thành published → 403

### POST /admin/dishes/1207?_method=PATCH → 403

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay 4af5d055>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/admin/dishes/1207/edit
Form data
  back=%2Fadmin%2Fdishes&_csrf=<đã che>&name=%5BTEST+B9%5D+s%E1%BB%ADa+sau+khi+%C4%91%C3%A3+xu%E1%BA%A5t+b%E1%BA%A3n&price=50000&tagIds=2&newTags=&description=m%C3%B4+t%E1%BA%A3&ingredientIds=1&newIngredients=&imageUrl=&imageCredit=&available=on
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 4af5d055>; Path=/; Expires=Mon, 09 Nov 2026 09:58:32 GMT; HttpOnly; SameSite=Lax
```

## 4b. Editor bị hạ thành Viewer, gửi form đã mở từ trước → 403

### POST /admin/dishes/1207?_method=PATCH → 403

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay 4af5d055>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/admin/dishes/1207/edit
Form data
  back=%2Fadmin%2Fdishes&_csrf=<đã che>&name=%5BTEST+B9%5D+s%E1%BB%ADa+sau+khi+b%E1%BB%8B+h%E1%BA%A1+role&price=50000&tagIds=2&newTags=&description=m%C3%B4+t%E1%BA%A3&ingredientIds=1&newIngredients=&imageUrl=&imageCredit=&available=on
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 4af5d055>; Path=/; Expires=Mon, 09 Nov 2026 09:58:34 GMT; HttpOnly; SameSite=Lax
```

## 6. Editor thêm ô ẩn chefId, status, role vào form rồi gửi: server bỏ qua

### POST /admin/dishes/1207?_method=PATCH → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay 66841859>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/admin/dishes/1207/edit
Form data
  back=%2Fadmin%2Fdishes&_csrf=<đã che>&name=%5BTEST+B9%5D+Nh%C3%A1p+c%E1%BB%A7a+A%2C+%C4%91%C3%A3+th%C3%AAm+%C3%B4+%E1%BA%A9n&price=50000&tagIds=2&newTags=&description=m%C3%B4+t%E1%BA%A3&ingredientIds=1&newIngredients=&imageUrl=&imageCredit=&available=on&chefId=2&status=published&role=admin
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Location: /admin/dishes?msg=dish-updated&saved=1207
  Set-Cookie: sid=<đã che · vân tay 66841859>; Path=/; Expires=Mon, 09 Nov 2026 09:58:40 GMT; HttpOnly; SameSite=Lax
```

### GET /admin/dishes?msg=dish-updated&saved=1207 → 200

```
Request headers
  Cookie: sid=<đã che · vân tay 66841859>
  Referer: http://localhost:3100/admin/dishes/1207/edit
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 66841859>; Path=/; Expires=Mon, 09 Nov 2026 09:58:41 GMT; HttpOnly; SameSite=Lax
```

## 7a. Bấm Bật xác thực hai lớp: POST tạo secret chờ → 303 → GET vẽ QR

### POST /admin/profile/mfa/setup → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay 32a9d1bc>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/admin/profile
Form data
  _csrf=<đã che>
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Location: /admin/profile/mfa/setup
  Set-Cookie: sid=<đã che · vân tay 32a9d1bc>; Path=/; Expires=Mon, 09 Nov 2026 09:58:51 GMT; HttpOnly; SameSite=Lax
```

### GET /admin/profile/mfa/setup → 200

```
Request headers
  Cookie: sid=<đã che · vân tay 32a9d1bc>
  Referer: http://localhost:3100/admin/profile
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 32a9d1bc>; Path=/; Expires=Mon, 09 Nov 2026 09:58:52 GMT; HttpOnly; SameSite=Lax
```

## 7b. Nhập đúng mã: POST ghi hash recovery → 303 → GET hiện mã một lần

### POST /admin/profile/mfa/setup/confirm → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay 32a9d1bc>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/admin/profile/mfa/setup
Form data
  _csrf=<đã che>&otp=<đã che>
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Location: /admin/profile/mfa/codes
  Set-Cookie: sid=<đã che · vân tay 32a9d1bc>; Path=/; Expires=Mon, 09 Nov 2026 09:58:54 GMT; HttpOnly; SameSite=Lax
```

### GET /admin/profile/mfa/codes → 200

```
Request headers
  Cookie: sid=<đã che · vân tay 32a9d1bc>
  Referer: http://localhost:3100/admin/profile/mfa/setup
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 32a9d1bc>; Path=/; Expires=Mon, 09 Nov 2026 09:58:54 GMT; HttpOnly; SameSite=Lax
```

## 7c. Mở lại trang mã: mã không hiện lại

### GET /admin/profile/mfa/codes → 303

```
Request headers
  Cookie: sid=<đã che · vân tay 32a9d1bc>
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Location: /admin/profile?msg=mfa-codes-gone
  Set-Cookie: sid=<đã che · vân tay 32a9d1bc>; Path=/; Expires=Mon, 09 Nov 2026 09:58:56 GMT; HttpOnly; SameSite=Lax
```

### GET /admin/profile?msg=mfa-codes-gone → 200

```
Request headers
  Cookie: sid=<đã che · vân tay 32a9d1bc>
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 32a9d1bc>; Path=/; Expires=Mon, 09 Nov 2026 09:58:56 GMT; HttpOnly; SameSite=Lax
```

## 8a. Password đúng, đã bật MFA: 303 /login/mfa

### POST /login → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay d9c8f1e7>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/login
Form data
  _csrf=<đã che>&email=mfa.demo%40demo.example&password=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /login/mfa
  Set-Cookie: sid=<đã che · vân tay 5528d5bf>; Path=/; Expires=Mon, 09 Nov 2026 09:58:58 GMT; HttpOnly; SameSite=Lax
```

### GET /login/mfa → 200

```
Request headers
  Cookie: sid=<đã che · vân tay 5528d5bf>
  Referer: http://localhost:3100/login
Response headers
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 5528d5bf>; Path=/; Expires=Mon, 09 Nov 2026 09:58:58 GMT; HttpOnly; SameSite=Lax
```

### Application → Cookies: phiên chờ MFA

| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sid | sid=<đã che · vân tay 5528d5bf> | localhost | / | 2026-11-09 09:58:58Z | ✓ |  | Lax |

## 8b. Phiên chờ MFA mở /admin/dishes → bị chặn

### GET /admin/dishes → 303

```
Request headers
  Cookie: sid=<đã che · vân tay 5528d5bf>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /login?next=%2Fadmin%2Fdishes
  Set-Cookie: sid=<đã che · vân tay 5528d5bf>; Path=/; Expires=Mon, 09 Nov 2026 09:59:00 GMT; HttpOnly; SameSite=Lax
```

### GET /login?next=%2Fadmin%2Fdishes → 200

```
Request headers
  Cookie: sid=<đã che · vân tay 5528d5bf>
Response headers
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 5528d5bf>; Path=/; Expires=Mon, 09 Nov 2026 09:59:00 GMT; HttpOnly; SameSite=Lax
```

## 8c. Nhập đúng mã: sid mới, phiên đầy đủ

### POST /login/mfa → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay 5528d5bf>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/login/mfa
Form data
  _csrf=<đã che>&otp=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /admin/dishes
  Set-Cookie: sid=<đã che · vân tay fd8d40e2>; Path=/; Expires=Mon, 09 Nov 2026 09:59:01 GMT; HttpOnly; SameSite=Lax
```

### GET /admin/dishes → 200

```
Request headers
  Cookie: sid=<đã che · vân tay fd8d40e2>
  Referer: http://localhost:3100/login/mfa
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay fd8d40e2>; Path=/; Expires=Mon, 09 Nov 2026 09:59:02 GMT; HttpOnly; SameSite=Lax
```

### Application → Cookies: phiên đầy đủ sau MFA

| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sid | sid=<đã che · vân tay fd8d40e2> | localhost | / | 2026-11-09 09:59:02Z | ✓ |  | Lax |

## 9a. Dùng lại mã vừa dùng → INVALID_OTP

### POST /login/mfa → 200

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay 9beed1c1>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/login/mfa
Form data
  _csrf=<đã che>&otp=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 9beed1c1>; Path=/; Expires=Mon, 09 Nov 2026 09:59:04 GMT; HttpOnly; SameSite=Lax
```

## 9b. Lần sai thứ 5 → 429 + Retry-After

### POST /login/mfa → 429

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay 9beed1c1>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/login/mfa
Form data
  _csrf=<đã che>&otp=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Retry-After: 900
  Set-Cookie: sid=<đã che · vân tay 9beed1c1>; Path=/; Expires=Mon, 09 Nov 2026 09:59:08 GMT; HttpOnly; SameSite=Lax
```

## 10a. Recovery code lần đầu: sid mới, về hồ sơ

### POST /login/mfa/recovery → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay 1a27071d>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/login/mfa/recovery
Form data
  _csrf=<đã che>&code=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /admin/profile?msg=mfa-recovery-used
  Set-Cookie: sid=<đã che · vân tay 2dda3002>; Path=/; Expires=Mon, 09 Nov 2026 09:59:14 GMT; HttpOnly; SameSite=Lax
```

### GET /admin/profile?msg=mfa-recovery-used → 200

```
Request headers
  Cookie: sid=<đã che · vân tay 2dda3002>
  Referer: http://localhost:3100/login/mfa/recovery
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 2dda3002>; Path=/; Expires=Mon, 09 Nov 2026 09:59:14 GMT; HttpOnly; SameSite=Lax
```

## 10b. Dùng lại recovery code → INVALID_OTP

### POST /login/mfa/recovery → 200

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay f57168a6>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/login/mfa/recovery
Form data
  _csrf=<đã che>&code=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay f57168a6>; Path=/; Expires=Mon, 09 Nov 2026 09:59:17 GMT; HttpOnly; SameSite=Lax
```

## 11a. Đặt mật khẩu mới: không tạo phiên

### POST /reset → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay aaaa0239>
  Origin: null
Form data
  _csrf=<đã che>&token=<đã che>&password=<đã che>&passwordConfirm=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /login?msg=password-reset
  Set-Cookie: sid=<đã che · vân tay aaaa0239>; Path=/; Expires=Mon, 09 Nov 2026 09:59:27 GMT; HttpOnly; SameSite=Lax
```

### GET /login?msg=password-reset → 200

```
Request headers
  Cookie: sid=<đã che · vân tay aaaa0239>
Response headers
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay aaaa0239>; Path=/; Expires=Mon, 09 Nov 2026 09:59:27 GMT; HttpOnly; SameSite=Lax
```

## 11b. Đăng nhập bằng mật khẩu mới: vẫn sang bước MFA

### POST /login → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay 94433937>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/login
Form data
  _csrf=<đã che>&email=mfa.demo%40demo.example&password=<đã che>
Response headers
  Content-Type: text/html; charset=utf-8
  Location: /login/mfa
  Set-Cookie: sid=<đã che · vân tay 0d4c62ee>; Path=/; Expires=Mon, 09 Nov 2026 09:59:31 GMT; HttpOnly; SameSite=Lax
```

### GET /login/mfa → 200

```
Request headers
  Cookie: sid=<đã che · vân tay 0d4c62ee>
  Referer: http://localhost:3100/login
Response headers
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay 0d4c62ee>; Path=/; Expires=Mon, 09 Nov 2026 09:59:31 GMT; HttpOnly; SameSite=Lax
```

### Application → Cookies: sau bước password, chưa qua MFA

| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sid | sid=<đã che · vân tay 0d4c62ee> | localhost | / | 2026-11-09 09:59:31Z | ✓ |  | Lax |

## 12a. Đúng mật khẩu, sai yếu tố thứ hai: không tắt

### POST /admin/profile/mfa/reauth/disable → 200

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay a0785597>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/admin/profile/mfa/reauth/disable
Form data
  _csrf=<đã che>&password=<đã che>&factor=<đã che>
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay a0785597>; Path=/; Expires=Mon, 09 Nov 2026 09:59:35 GMT; HttpOnly; SameSite=Lax
```

## 12b. Đúng mật khẩu và recovery code: tắt được

### POST /admin/profile/mfa/reauth/disable → 303

```
Request headers
  Content-Type: application/x-www-form-urlencoded
  Cookie: sid=<đã che · vân tay a0785597>
  Origin: http://localhost:3100
  Referer: http://localhost:3100/admin/profile/mfa/reauth/disable
Form data
  _csrf=<đã che>&password=<đã che>&factor=<đã che>
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Location: /admin/profile?msg=mfa-disabled
  Set-Cookie: sid=<đã che · vân tay a0785597>; Path=/; Expires=Mon, 09 Nov 2026 09:59:36 GMT; HttpOnly; SameSite=Lax
```

### GET /admin/profile?msg=mfa-disabled → 200

```
Request headers
  Cookie: sid=<đã che · vân tay a0785597>
  Referer: http://localhost:3100/admin/profile/mfa/reauth/disable
Response headers
  Cache-Control: no-store
  Content-Type: text/html; charset=utf-8
  Set-Cookie: sid=<đã che · vân tay a0785597>; Path=/; Expires=Mon, 09 Nov 2026 09:59:37 GMT; HttpOnly; SameSite=Lax
```

