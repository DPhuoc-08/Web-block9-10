# Bằng chứng nộp — Block 9, Bài 2 (CSR: JWT, phân quyền ở `api`, đăng nhập ở `web`)

Thu ngày 09/11/2026, thu lại 20/11/2026 theo nhóm đầu bếp của Editor (plan 16), bằng `node scripts/collect-evidence.mjs` (trong `api/`): script chạy `api` thật ở `:3000`, bản build của `web` ở `:5173`, điều khiển **Chrome thật** (headless, DevTools Protocol), gửi thêm request trực tiếp, rồi đọc database. MFA dùng tài khoản thử `@demo.example`, xoá ở cuối; sau đó seed lại.

**Đã che:** email thật của nhóm; `Authorization`, JWT, challenge, secret, QR, recovery code, mật khẩu, mã, reset token. Trong `storage/`, JWT chỉ còn độ dài và payload đã giải mã (payload ai cũng đọc được, chỉ có `sub`, `tv`, `iat`, `exp`, `iss`, `aud`). Hash chỉ để 6 ký tự đầu. Trong ảnh, QR, secret và recovery code được thay ngay trong trang trước khi chụp. Script từ chối ghi nếu còn sót giá trị bí mật nó biết.

**Chưa có:** ảnh chụp thật của cửa sổ DevTools. Network ở `network/network-log.md` và Application (Storage) ở `storage/` là bản chữ đọc từ Chrome qua DevTools Protocol.

**Chưa thử với dịch vụ thật:** ô CAPTCHA (Chrome tự động không tick được; script dùng key thử của Google qua request trực tiếp, `INVALID_CAPTCHA` tạo bằng hostname ngoài danh sách), thư Gmail (script dùng transport `file`), quét QR trên điện thoại ở `web`.

**Can thiệp của script, chỉ trong kiểm thử:** xoá bộ đếm `mfa-fail` giữa các ca; ký sẵn một token hết hạn bằng `JWT_SECRET` để thử ca quá `exp`. `api` không có nhánh bỏ qua MFA hay CAPTCHA.

## Đối chiếu bảng nghiệm thu của đề

| Kịch bản | Kết quả cần chứng minh | Ảnh `screens/` | Network | Storage | Request `curl/` | DB `db/` |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Slide 67** | | | | | | |
| Chưa đăng nhập, gọi `POST`, `PATCH`, `DELETE` | `401` | `01` | | | `01` | md5 trong `curl/01` |
| Thiếu quyền hoặc thuộc tính không thoả | `403`, dữ liệu không đổi | `02-*`, `03-*`, `04`, `05`, `08` | mục 2b | | `02` | `02` |
| Gọi API trực tiếp, bỏ qua giao diện | Cùng kết quả như qua giao diện | | mục 3 | | `03` | |
| JWT bị sửa hoặc hết hạn | `401` | `13` | mục 5b | `03`, `04` | `04` | |
| Đổi role trong storage hoặc payload | Quyền không tăng | `12` | mục 5a | `02` | `04` | |
| Preflight với `Authorization` | `OPTIONS` thành công, origin cụ thể | | mục 3 | | `05`, `03` | |
| `GET /api/dishes` tìm kiếm, phân trang, không token | Như trước khi gắn xác thực | `15-*`, `16-*`, `17` | mục 6 | | `06` | SQL viết tay trong `curl/06` |
| **Slide 68** | | | | | | |
| Đăng ký với `role: admin` | Bản ghi có role `viewer` | | | | `07` | `03` |
| Tài khoản pending đăng nhập | Không có `accessToken` | `18` | mục 7a | `05` | `07` | `03` |
| Password đúng, đã bật MFA, chưa nhập OTP | Không có `accessToken`, có `next: "mfa"` | `27-*` | mục 8c | `08` | `08` | `05` |
| Recovery code dùng lần hai | Bị từ chối | `30-*`, `31`, `32` | mục 9a, 9b | | `09` | `06` (`usedAt`) |
| Sai đến ngưỡng, bỏ CAPTCHA | `CAPTCHA_REQUIRED`, không có `accessToken` | `20` | | | `07` | `04` |
| Reset password xong, đăng nhập | Vẫn qua MFA; JWT cũ theo chính sách | `33`–`35` | mục 10a, 10b | | `10` | `07`, `mail/1` |

## Ngoài bảng của đề

| Nội dung | Bằng chứng |
| :--- | :--- |
| Toàn bộ request trực tiếp | `curl/check-api.txt`: **226 ĐẠT, 0 CHƯA ĐẠT** (20/11, sau khi đổi sang nhóm đầu bếp) |
| Challenge chỉ dùng được ở `/api/auth/mfa` | `curl/08`, `curl/check-api.txt` phần B |
| Gửi 29 mã sai cùng lúc: chỉ 5 lượt được kiểm, mã đúng `429`, giới hạn IP; trước và sau khi sửa, log tái hiện | `curl/16`, `curl/check-api.txt` phần B |
| `401` nhớ trang đang mở, `403` giữ token, API tắt không đăng xuất | ảnh `13`, `14`; `curl/02`, `curl/04` |
| Giao diện theo role; Editor thêm món chọn đầu bếp trong nhóm, không gửi `status`; Editor ở trang Đầu bếp chỉ xem (plan 16) | ảnh `06-*`, `07-*`, `09`, `09b`, `10-*`, `11`; Network mục 2c; `curl/02` (đầu bếp ngoài nhóm, sửa đầu bếp → `403`) |
| Quản lý MFA | ảnh `23-*`–`26`, `36-*`, `37`; Network mục 8a, 8b, 11a, 11b; `db/05`, `db/08` |
| Nơi lưu token: đăng nhập, đăng xuất, Reload, tab mới | `storage/01`, `07`, `09`; `curl/12` |
| Log server, bundle không chứa bí mật | `curl/13`, `curl/14` |
| Không cuộn ngang ở 1280, 820, 375, 320 | `curl/15` |

Sơ đồ do nhóm vẽ (bản nháp từ code thật, nhóm duyệt): `diagrams/1-dang-nhap-jwt-va-noi-luu-token.svg` (kèm nơi lưu token và lý do), `diagrams/2-request-co-bearer.svg`. Vẽ lại: `node evidence/diagrams/ve-so-do.mjs` từ thư mục `bai2/`.

Lỗi do agent tạo ra (slide 69): giới hạn sai mã MFA bị vượt khi gửi đồng thời, `loi-va-kiem-tra-ma-nguon.md` mục 2 (kèm cách truy nguyên ca kiểm thử chập chờn); lỗi khác ở mục 3. Kiểm tra mã nguồn (slide 66): cùng tệp, mục 1. Danh sách mô-đun chuyển từ Bài 1: `MODULES.md`.

## Ảnh DevTools chụp tay (`devtools/`, nhóm chụp 20/11/2026, token đã che)

| Ảnh | Cho thấy |
| :--- | :--- |
| `01-network-login` | `POST /api/auth/login` trả `accessToken`, `expiresIn: 1800` |
| `02-application-session-storage` | Session storage chỉ có `accessToken`, không lưu role |
| `03-network-preflight` | `OPTIONS /api/dishes/1201` → `204`; `Access-Control-Allow-Origin: http://localhost:5173`, `Allow-Headers: Content-Type,Authorization` |
| `04-network-403-giu-token` | Editor A mở món nháp nhóm B (`1204`) → `403`, trang báo thiếu quyền, vẫn đăng nhập |
| `05-role-admin-van-chi-xem` | Thêm `role = admin` vào storage, trang vẫn "chỉ có quyền xem" |
| `06-network-401-token-sua` | Sửa một ký tự token rồi Reload → `GET /api/auth/me` `401 UNAUTHENTICATED`, về đăng nhập, nhớ trang cũ |
