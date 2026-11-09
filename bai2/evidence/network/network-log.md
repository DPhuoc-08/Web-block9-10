## 2a. Viewer đăng nhập: POST /api/auth/login, sau đó GET /api/auth/me kèm Bearer

### POST /api/auth/login → 200 (Fetch)

```
Request headers
  Content-Type: application/json
  (không có Authorization)
Request body
  {"email":"<email nhóm đã che>","password":"<đã che>"}
Response headers
  Access-Control-Expose-Headers: Retry-After
  Cache-Control: no-store
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"accessToken":"<đã che>","expiresIn":1800}}
```

### GET /api/auth/me → 200 (Fetch)

```
Request headers
  Authorization: Bearer <JWT đã che>
  Origin: http://localhost:5173
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"id":1,"email":"<email nhóm đã che>","username":"Tài khoản xem thử","role":"viewer","chefId":null}}
```

### GET /api/admin/dishes?pageSize=20 → undefined (Fetch)

```
Request headers
  Authorization: Bearer <JWT đã che>
Response headers
```

## 2b. Editor gửi form đã mở, món vừa được xuất bản → 403, giữ token

### PATCH /api/dishes/1211 → 403 (Fetch)

```
Request headers
  Authorization: Bearer <JWT đã che>
  Content-Type: application/json
Request body
  {"name":"[TEST B9] sửa sau khi xuất bản","price":50000,"tagIds":[2],"description":"mô tả","imageUrl":null,"imageCredit":null,"available":true,"ingredientIds":[1]}
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":false,"error":{"code":"<đã che>","message":"Tài khoản của bạn không đủ quyền thực hiện thao tác này."}}
```

## 2c. Editor thêm món qua web: body không có chefId, status

### POST /api/dishes → 200 (Fetch)

```
Request headers
  Authorization: Bearer <JWT đã che>
  Content-Type: application/json
Request body
  {"name":"[TEST B9] Editor tạo qua web","price":45000,"tagIds":[11],"description":null,"imageUrl":null,"imageCredit":null,"available":true,"ingredientIds":[7]}
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"id":1212,"name":"[TEST B9] Editor tạo qua web","description":null,"price":45000,"available":true,"status":"draft","imageUrl":null,"imageCredit":null,"createdAt":"2026-11-09T09:01:50.893Z","chefId":1,"chef":{"id":1,"name":"Nguyễn Văn An","tags":[{"id":2,"name":"Món nước"},{"id":14…
```

## 3. Editor sửa món nháp của mình qua giao diện

### PATCH /api/dishes/1211 → 200 (Fetch)

```
Request headers
  Authorization: Bearer <JWT đã che>
  Content-Type: application/json
Request body
  {"name":"[TEST B9] Sửa qua web","price":50000,"tagIds":[2],"description":"mô tả","imageUrl":null,"imageCredit":null,"available":true,"ingredientIds":[1]}
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"id":1211,"name":"[TEST B9] Sửa qua web","description":"mô tả","price":50000,"available":true,"status":"draft","imageUrl":null,"imageCredit":null,"createdAt":"2026-11-09T09:00:49.271Z","chefId":1,"chef":{"id":1,"name":"Nguyễn Văn An","tags":[{"id":2,"name":"Món nước"},{"id":14,"na…
```

## 5a. Viewer đã sửa role trong storage, tự gửi POST /api/dishes

### POST /api/dishes → 403 (Fetch)

```
Request headers
  Authorization: Bearer <JWT đã che>
  Content-Type: application/json
  Origin: http://localhost:5173
Request body
  {}
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":false,"error":{"code":"<đã che>","message":"Tài khoản của bạn không đủ quyền thực hiện thao tác này."}}
```

## 5b. Token bị sửa: 401, web xoá token, về đăng nhập

### GET /api/auth/me → 401 (Fetch)

```
Request headers
  Authorization: Bearer <JWT đã che>
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":false,"error":{"code":"<đã che>","message":"Cần đăng nhập để thực hiện thao tác này."}}
```

### GET /api/dishes/1 → 200 (Fetch)

```
Request headers
  Origin: http://localhost:5173
  (không có Authorization)
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"id":1,"name":"Phở bò tái","description":"Nước dùng hầm xương 12 tiếng, bánh phở tươi.","price":55000,"available":true,"imageUrl":"https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Ph%E1%BB%9F_b%C3%B2_in_a_German_restaurant_01.jpg/960px-Ph%E1%BB%9F_b%C3%B2_in_a_German_rest…
```

## 6. Đã đăng nhập, mở thực đơn: GET /api/dishes KHÔNG kèm Authorization, không preflight

### GET /api/dishes?pageSize=1&include=tags → 200 (Fetch)

```
Request headers
  (không có Authorization)
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"items":[{"id":1,"name":"Phở bò tái","description":"Nước dùng hầm xương 12 tiếng, bánh phở tươi.","price":55000,"available":true,"imageUrl":"https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Ph%E1%BB%9F_b%C3%B2_in_a_German_restaurant_01.jpg/960px-Ph%E1%BB%9F_b%C3%B2_in_a_G…
```

### GET /api/dishes?mode=basic&pageSize=12 → 200 (Fetch)

```
Request headers
  (không có Authorization)
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"items":[{"id":1,"name":"Phở bò tái","description":"Nước dùng hầm xương 12 tiếng, bánh phở tươi.","price":55000,"available":true,"imageUrl":"https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Ph%E1%BB%9F_b%C3%B2_in_a_German_restaurant_01.jpg/960px-Ph%E1%BB%9F_b%C3%B2_in_a_G…
```

## 7a. Tài khoản pending đăng nhập qua web: không có accessToken

### POST /api/auth/login → 200 (Fetch)

```
Request headers
  Content-Type: application/json
  (không có Authorization)
Request body
  {"email":"dangky@demo.example","password":"<đã che>"}
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":false,"error":{"code":"<đã che>","message":"Tài khoản chưa được kích hoạt. Nhập mã 6 số trong email để kích hoạt."}}
```

## 8a. POST /api/auth/mfa/setup: secret trả một lần, no-store

### POST /api/auth/mfa/setup → 200 (Fetch)

```
Request headers
  Authorization: Bearer <JWT đã che>
Response headers
  Access-Control-Expose-Headers: Retry-After
  Cache-Control: no-store
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"secret":"<đã che>","otpauthUri":"<đã che>","qrDataUrl":"<đã che>"code":"<đã che>"}
Response headers
  Access-Control-Expose-Headers: Retry-After
  Cache-Control: no-store
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"replaced":false,"recoveryCodes":["<10 mã đã che>"]}}
```

## 8c. Password đúng, đã bật MFA: next mfa, có challenge, KHÔNG có accessToken

### POST /api/auth/login → 200 (Fetch)

```
Request headers
  Content-Type: application/json
  (không có Authorization)
Request body
  {"email":"mfa.demo@demo.example","password":"<đã che>"}
Response headers
  Access-Control-Expose-Headers: Retry-After
  Cache-Control: no-store
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"next":"mfa","challenge":"<đã che>","expiresIn":300}}
```

### GET /api/dishes/1 → 200 (Fetch)

```
Request headers
  Origin: http://localhost:5173
  (không có Authorization)
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"id":1,"name":"Phở bò tái","description":"Nước dùng hầm xương 12 tiếng, bánh phở tươi.","price":55000,"available":true,"imageUrl":"https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Ph%E1%BB%9F_b%C3%B2_in_a_German_restaurant_01.jpg/960px-Ph%E1%BB%9F_b%C3%B2_in_a_German_rest…
```

## 8d. Nhập đúng mã: có accessToken

### POST /api/auth/mfa → 200 (Fetch)

```
Request headers
  Content-Type: application/json
  Origin: http://localhost:5173
  (không có Authorization)
Request body
  {"challenge":"<đã che>","code":"<đã che>"}
Response headers
  Access-Control-Expose-Headers: Retry-After
  Cache-Control: no-store
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"accessToken":"<đã che>","expiresIn":1800}}
```

### GET /api/auth/me → 200 (Fetch)

```
Request headers
  Authorization: Bearer <JWT đã che>
  Origin: http://localhost:5173
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"id":33,"email":"mfa.demo@demo.example","username":null,"role":"viewer","chefId":null}}
```

### GET /api/admin/dishes?pageSize=20 → 200 (Fetch)

```
Request headers
  Authorization: Bearer <JWT đã che>
  Origin: http://localhost:5173
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"items":[{"id":1,"name":"Phở bò tái","description":"Nước dùng hầm xương 12 tiếng, bánh phở tươi.","price":55000,"available":true,"status":"published","imageUrl":"https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Ph%E1%BB%9F_b%C3%B2_in_a_German_restaurant_01.jpg/960px-Ph%E1…
```

## 9a. Recovery code lần đầu

### POST /api/auth/mfa → 200 (Fetch)

```
Request headers
  Content-Type: application/json
  (không có Authorization)
Request body
  {"challenge":"<đã che>","recoveryCode":"<đã che>"}
Response headers
  Access-Control-Expose-Headers: Retry-After
  Cache-Control: no-store
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"accessToken":"<đã che>","expiresIn":1800,"recoveryRemaining":9}}
```

### GET /api/auth/me → 200 (Fetch)

```
Request headers
  Authorization: Bearer <JWT đã che>
  Origin: http://localhost:5173
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"id":33,"email":"mfa.demo@demo.example","username":null,"role":"viewer","chefId":null}}
```

### GET /api/auth/mfa/status → 200 (Fetch)

```
Request headers
  Authorization: Bearer <JWT đã che>
  Origin: http://localhost:5173
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"enabled":true,"remaining":9}}
```

## 9b. Recovery code lần hai: INVALID_OTP

### POST /api/auth/mfa → 200 (Fetch)

```
Request headers
  Content-Type: application/json
  (không có Authorization)
Request body
  {"challenge":"<đã che>","recoveryCode":"<đã che>"}
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":false,"error":{"code":"<đã che>","message":"Mã không đúng hoặc đã được dùng."}}
```

## 10a. Đặt mật khẩu mới: không cấp token

### POST /api/auth/reset → 200 (Fetch)

```
Request headers
  Content-Type: application/json
  Origin: http://localhost:5173
  (không có Authorization)
Request body
  {"token":"<đã che>","password":"<đã che>","passwordConfirm":"<đã che>"}
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"reset":true}}
```

### GET /api/dishes/1 → 200 (Fetch)

```
Request headers
  Origin: http://localhost:5173
  (không có Authorization)
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"id":1,"name":"Phở bò tái","description":"Nước dùng hầm xương 12 tiếng, bánh phở tươi.","price":55000,"available":true,"imageUrl":"https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Ph%E1%BB%9F_b%C3%B2_in_a_German_restaurant_01.jpg/960px-Ph%E1%BB%9F_b%C3%B2_in_a_German_rest…
```

## 10b. Đăng nhập bằng mật khẩu mới: vẫn qua MFA

### POST /api/auth/login → 200 (Fetch)

```
Request headers
  Content-Type: application/json
  (không có Authorization)
Request body
  {"email":"mfa.demo@demo.example","password":"<đã che>"}
Response headers
  Access-Control-Expose-Headers: Retry-After
  Cache-Control: no-store
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"next":"mfa","challenge":"<đã che>","expiresIn":300}}
```

### GET /api/dishes/1 → 200 (Fetch)

```
Request headers
  Origin: http://localhost:5173
  (không có Authorization)
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"id":1,"name":"Phở bò tái","description":"Nước dùng hầm xương 12 tiếng, bánh phở tươi.","price":55000,"available":true,"imageUrl":"https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Ph%E1%BB%9F_b%C3%B2_in_a_German_restaurant_01.jpg/960px-Ph%E1%BB%9F_b%C3%B2_in_a_German_rest…
```

## 11a. Sai yếu tố thứ hai: 200 INVALID_OTP, không đăng xuất

### POST /api/auth/mfa/disable → 200 (Fetch)

```
Request headers
  Authorization: Bearer <JWT đã che>
  Content-Type: application/json
Request body
  {"password":"<đã che>","factor":"<đã che>"}
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":false,"error":{"code":"<đã che>","message":"Mật khẩu hoặc mã không đúng."}}
```

## 11b. Đúng cả hai: tắt MFA, token hết hiệu lực, về đăng nhập

### POST /api/auth/mfa/disable → 200 (Fetch)

```
Request headers
  Authorization: Bearer <JWT đã che>
  Content-Type: application/json
Request body
  {"password":"<đã che>","factor":"<đã che>"}
Response headers
  Access-Control-Expose-Headers: Retry-After
  Access-Control-Allow-Origin: http://localhost:5173
Response body
  {"ok":true,"data":{"disabled":true}}
```

