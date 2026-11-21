# Bằng chứng nộp — Block 9, Bài 1 (SSR: RBAC, ABAC, MFA, JWT access + refresh token)

Thu lần đầu 09/11/2026, **thu lại 13/11/2026** sau khi Bài 1 bỏ session, chuyển sang JWT access token 90 giây + refresh token theo yêu cầu của giảng viên (plan mục 15), bằng `node scripts/collect-evidence.mjs` (trong `source-code/`): script chạy server thật ở cổng 3100, điều khiển **Chrome thật** (headless, DevTools Protocol) qua từng kịch bản, gửi thêm request trực tiếp như `curl -i`, rồi đọc database. MFA dùng tài khoản thử `mfa.demo@demo.example`, xoá ở cuối cùng các bản ghi thử (lần thu lại không chạy seed). Phần access / refresh token thu bằng `node scripts/collect-refresh-evidence.mjs` (mục cuối).

**Đã che:** email thật của nhóm → `<email nhóm đã che>`; mật khẩu, mã TOTP, recovery code, reset token, `_csrf` → `<đã che>`; cookie `access`, `refresh`, `mfa`, `mfa_reauth`, `csrf` → vân tay 8 ký tự đầu SHA-256 (so được trước và sau, không dùng lại được; với `refresh` và `mfa`, vân tay trùng 8 ký tự đầu cột `tokenHash` trong `db/`). Trong ảnh, QR, chuỗi secret và recovery code được thay ngay trong trang **trước khi chụp**. Bản mã `mfaSecret` chỉ ghi độ dài và vân tay; hash chỉ để 6 ký tự đầu. Script từ chối ghi nếu còn sót giá trị bí mật nó biết. Thư mục này không có `.env`, chuỗi kết nối, host database, `JWT_SECRET`, `OTP_PEPPER`, `MFA_ENCRYPTION_KEY`.

**Làm bằng tay:** quét QR bằng Microsoft Authenticator trên điện thoại và đăng nhập bằng mã từ app (nhóm làm, 09/11/2026, không lưu ảnh vì chứa QR).

**Ảnh DevTools chụp tay** (`devtools/`, nhóm chụp 13/11, giá trị cookie đã che): `01-network-login-set-cookie` (Network sau đăng nhập), `02-application-cookies` (cookie `access`, `refresh`, `csrf` đều HttpOnly, SameSite=Lax), `03-console-document-cookie` (`document.cookie` trả chuỗi rỗng: JavaScript không đọc được cookie), `04-network-tu-refresh` (sau khi access hết hạn: không còn `access`, `refresh` đã đổi giá trị vì xoay vòng). Bản chữ đầy đủ của Network, Application vẫn ở `network/network-log.md`.

**Hai can thiệp của script, chỉ trong kiểm thử:** xoá bộ đếm `mfa-fail` giữa các ca để ca sau không bị khoá; hạ role Editor A bằng SQL ở ca 4 rồi trả lại. Server không có nhánh bỏ qua MFA hay CAPTCHA. Không ca nào trong đây cần giải CAPTCHA.

## Đối chiếu bảng nghiệm thu của đề

| Kịch bản | Kết quả cần chứng minh | Ảnh `screens/` | Network | Request `curl/` | DB `db/` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Slide 56** | | | | | |
| Chưa đăng nhập, vào quản trị | `303 /login` | `01` | mục 1 | `01` | `01` (md5 không đổi) |
| Đăng nhập, thiếu role để ghi | Trang `403`, dữ liệu không đổi | `02`, `03-*` | mục 2a, 2b | `02` | `02` |
| Có role, thuộc tính món không thoả | Trang `403` dù có role | `04`, `05` | mục 3a, 3b | `03` | `03` |
| Mở form sửa, rồi đổi quyền hoặc status | `PATCH` bị từ chối, dữ liệu không đổi | `06`, `07`, `08` | mục 4a, 4b | `04` | `04` |
| Gửi `PATCH` trực tiếp, bỏ qua form | Cùng kết quả như qua form | như ca 3, 4 | so với mục 3, 4, 6 | `05` | đọc lại ở `curl/05` |
| Sửa role, chủ sở hữu trong hidden field | Quyền không tăng | `09` | mục 6 | `06` | `06` |
| **Slide 57** | | | | | |
| Password đúng, chưa nhập OTP | Không vào được quản trị: chỉ có challenge (cookie `mfa`), chưa có access / refresh token | `16-*`, `17` | mục 8a, 8b, 8c | `08` | `08-cho-mfa` (`mfa_challenges` đang chờ; access + refresh chỉ có sau khi nhập đúng mã) |
| OTP sai quá giới hạn, hoặc mã dùng lại | Khoá tạm; mã đã dùng bị từ chối; kể cả khi 30 mã gửi cùng lúc | `19`, `20-*` | mục 9a, 9b | `09`, `15` | `09` (`count`, `lockedUntil`, `mfaLastStep`), `15` (30 lượt) |
| Recovery code dùng lần hai | Bị từ chối | `21-*`, `22`, `23` | mục 10a, 10b | `10` | `10` (`usedAt`) |
| Reset password xong, đăng nhập | Vẫn qua bước MFA | `24`, `25` | mục 11a, 11b | `11` | `11` (vân tay `mfaSecret` không đổi), `mail/1` |
| **Chức năng cũ** | Không hồi quy sau khi bỏ session | | | `check-ssr.txt` 124, `check-auth.txt` 154 | |

## Ngoài bảng của đề

| Nội dung | Ảnh | Network | Request | DB |
| :--- | :--- | :--- | :--- | :--- |
| Bật MFA: QR, xác nhận một mã, recovery code hiện một lần | `12`, `13-*`, `14-*`, `15` | mục 7a, 7b, 7c | | `07` |
| Món nháp chỉ hiện đúng người (plan 12.2) | `10`, `11` | | `07`, `check-rbac.txt` phần D | |
| Tắt MFA phải xác thực lại (slide 23) | `26-*`, `27` | mục 12a, 12b | `12` | `12` |
| Log server không chứa secret, recovery code, mật khẩu | | | `13` | |
| Lỗi do agent tạo ra (slide 58): giới hạn sai mã MFA bị vượt khi gửi đồng thời, trước và sau khi sửa | | | `15`, `check-mfa.txt` phần B; BUILD_LOG bước 35 | |
| Lỗi khác: secret chờ khi đổi thiết bị không có hạn | | | `check-mfa.txt` phần D; BUILD_LOG bước 36 | |
| Lỗi khác: nút Xoá tràn khung, sau khi sửa | `28` | | `14`, BUILD_LOG bước 8 | |
| Lỗi khi chuyển sang JWT (L5): đặt lại mật khẩu không huỷ bước MFA đang chờ | | | `check-mfa.txt` phần B ("Reset xoá cả challenge đang chờ MFA (L5)"); BUILD_LOG bước 40 | |
| Lỗi khi chuyển sang JWT (L6): đọc cookie sai tên, mất ô CAPTCHA khi mở lại /login | | | `check-auth.txt` phần C; BUILD_LOG bước 40 | |
| Cấu hình hạn refresh ngắn hơn access bị chặn khi khởi động | | | `check-auth.txt` phần H; BUILD_LOG bước 42 | |

Kết quả script trên code cuối (13/11/2026): `check-policy` 32, `check-rbac` 159, `check-mfa` 86, `check-auth` 154 (phần H: access + refresh token), `check-ssr` 124, tất cả 0 CHƯA ĐẠT.

Giao diện ở 3 cỡ 1280, 820, 375: `03-trang-403`, `13-thiet-lap-mfa-da-che`, `14-ma-khoi-phuc-da-che`, `16-buoc-nhap-ma`, `20-sai-5-lan-tam-khoa`, `21-nhap-ma-khoi-phuc`, `26-xac-thuc-lai-de-tat-mfa`.

Sơ đồ do nhóm vẽ (bản nháp từ code thật, nhóm duyệt; vẽ lại 13/11 theo JWT): `diagrams/1-phan-quyen-bon-cong.svg`, `2-mfa-dang-nhap.svg`, `3-mfa-thiet-lap-va-xac-thuc-lai.svg`, **`4-access-refresh-token.svg`** (mới). Vẽ lại sau khi đổi code: `node evidence/diagrams/ve-so-do.mjs` từ thư mục `bai1/`.

## Access token + refresh token (plan mục 15, thu 13/11/2026)

### A, B — refresh token bị dùng lại

Thu bằng `node scripts/collect-refresh-evidence.mjs` (trong `source-code/`): server thật ở cổng 3100, **hai Chrome headless độc lập** (hai profile, không chung cookie): một là chủ tài khoản, một là kẻ gian. Kẻ gian nhận đúng giá trị cookie `refresh` của chủ, như khi chép trong DevTools. Tài khoản thử `refresh.demo@demo.example`, xoá ở cuối.

**Đã che:** access và refresh token → vân tay 8 ký tự đầu SHA-256. Vân tay này trùng 8 ký tự đầu cột `tokenHash` trong `db/13`, nên đối chiếu được mà không dùng lại được. Payload của access token (ai cũng đọc được) in `sub`, `tv`, `fam`, `iat`, `exp`, không in chữ ký. Mật khẩu → `<đã che>`. Script từ chối ghi nếu còn sót token hay mật khẩu. Nhãn xanh góc phải trong ảnh do script chèn trước khi chụp, không phải giao diện của app.

| Bước | Kết quả cần chứng minh | Ảnh `screens/` | Network | Request `curl/` | DB `db/` |
| :--- | :--- | :--- | :--- | :--- | :--- |
| A1. Chủ đăng nhập | Cookie `access` 90 giây + `refresh` R0, HttpOnly, SameSite=Lax | `29` | mục A1 | | `13` (sau A1) |
| A2. Kẻ gian gửi R0 | Vào được, server xoay vòng: R0 có `usedAt`, kẻ gian nhận R1 cùng family | `30` | mục A2 | | `13` (sau A2) |
| A3. Chủ gửi R0 (đã dùng) | Phát hiện dùng lại → thu hồi **cả family**, xoá cookie, `303 /login` | `31` | mục A3 | | `13` (sau A3: R0 và R1 có `revokedAt`) |
| A4a. Kẻ gian còn access chưa hết hạn | Vẫn `200` trong tối đa 90 giây: **rủi ro còn lại đã công bố** | | mục A4a | | |
| A4b. Kẻ gian gửi R1 | Family đã thu hồi → `303 /login`, mất quyền vào | `32` | mục A4b | | |
| A5. Chủ đăng nhập lại | Family mới, family cũ vẫn bị thu hồi | | mục A5 | | `13` (sau A5) |
| B. Chủ refresh trước, kẻ gian dùng token cũ sau | Kẻ gian `303`; token mới nhất của chủ cũng `303` | | | `16` | dòng cuối `curl/16` |
| Log server | Không chứa access / refresh token, mật khẩu | | | dòng cuối `curl/16` | |

Network: `network/refresh-token-dung-lai.md`. Kiểm thử tự động cùng ca này: `check-auth` phần H.

### C–F — vòng đời token khi dùng bình thường

Cùng script, cùng cách che. Network: `network/refresh-token-vong-doi.md`; DB: `db/14-refresh-token-vong-doi.txt`. Ca F chạy lại server với `REFRESH_IDLE_MINUTES=2`, `REFRESH_ABSOLUTE_MINUTES=3` và **chờ thời gian thật** (khoảng 3 phút), không xoá cookie bằng tay, không sửa DB.

| Ca | Kết quả cần chứng minh | Ảnh `screens/` | Network | DB `db/14` |
| :--- | :--- | :--- | :--- | :--- |
| C. Access hết hạn đúng lúc gửi form | Request chỉ mang `refresh` → server xoay vòng rồi xử lý form → 303, dữ liệu được ghi; `document.cookie` rỗng (HttpOnly) | `33` | mục C1 | sau C1 |
| D. Đăng xuất | Server thu hồi family; bản sao refresh chép trước khi đăng xuất → 303 | | mục D1, D2 | sau D |
| E. Đổi mật khẩu | Máy khác bị đăng xuất **ngay** dù access chưa hết 90 giây (`tv` lệch); máy đang dùng nhận family mới | `34` | mục E1, E2 | trước / sau E (`tokenVersion` 0 → 1) |
| F1. Thao tác sau 90 giây | Access tự hết, xoay vòng được; Max-Age refresh mới bị cắt theo trần 3 phút | | mục F1 | sau F |
| F2. Để yên quá 2 phút | Phải đăng nhập lại (hạn không hoạt động) | `35` | mục F2 | sau F |
| F3. Vẫn thao tác, quá 3 phút từ lúc đăng nhập | Phải đăng nhập lại (trần tuyệt đối) | | mục F3 | sau F |
| F4. Gửi thẳng bản sao refresh đã hết hạn | Server từ chối theo `expiresAt` (không chỉ nhờ trình duyệt bỏ cookie) | | mục F4 | |
