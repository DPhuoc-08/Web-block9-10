// Response shape dùng chung cho MỌI kết quả do handler xử lý (hợp đồng giữa API và SPA):
//   thành công:     200 { ok: true,  data }
//   lỗi nghiệp vụ:  200 { ok: false, error: { code, message, fields?, dishes? } }
// Status 200 nghĩa là "API đã chạy được yêu cầu"; kết quả nằm trong `ok`.
// Riêng 401, 403, 429 của xác thực (cuối file) có status riêng nhưng vẫn shape ok: false.
// Lỗi kỹ thuật (sai URL 404, body không đọc được 400, hệ thống hỏng 500) KHÔNG đi qua file này
// mà do app.js trả, body không có `ok` — để SPA phân biệt được hai loại lỗi.

// Mã lỗi nghiệp vụ cố định: SPA rẽ nhánh theo `code`, không theo `message` (câu chữ có thể đổi).
export const CODES = {
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  // Mở rộng do giữ khoá ngoại của block5: xoá bị chặn vì bản ghi đang được món dùng.
  IN_USE: "IN_USE",
  // Block 9: đăng nhập, MFA (200, ok: false) và các status riêng 401, 403, 429 (slide 34, 37, 62).
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  ACCOUNT_NOT_ACTIVATED: "ACCOUNT_NOT_ACTIVATED",
  CAPTCHA_REQUIRED: "CAPTCHA_REQUIRED",
  INVALID_CAPTCHA: "INVALID_CAPTCHA",
  INVALID_OTP: "INVALID_OTP",
  INVALID_RESET_TOKEN: "INVALID_RESET_TOKEN",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  FORBIDDEN: "FORBIDDEN",
  RATE_LIMITED: "RATE_LIMITED",
  CAPTCHA_UNAVAILABLE: "CAPTCHA_UNAVAILABLE",
};

export const ok = (res, data) => res.status(200).json({ ok: true, data });

export const fail = (res, code, message, extra = {}) =>
  res.status(200).json({ ok: false, error: { code, message, ...extra } });

export const notFound = (res, message = "Không tìm thấy bản ghi.") => fail(res, CODES.NOT_FOUND, message);

// `fields`: { tênTrường: thông báo } — khoá trùng tên ô nhập để SPA hiện lỗi cạnh đúng ô.
export const validationFailed = (res, fields) =>
  fail(res, CODES.VALIDATION_FAILED, "Dữ liệu không hợp lệ.", { fields });

// `dishes`: các món đang dùng bản ghi, để SPA liệt kê cho người dùng xử lý trước khi xoá.
export const inUse = (res, message, dishes) => fail(res, CODES.IN_USE, message, { dishes });

// Response có accessToken, challenge, secret hoặc recovery code: không cho trình duyệt, proxy lưu lại (plan 7.3).
export const okSecret = (res, data) => {
  res.set("Cache-Control", "no-store");
  return ok(res, data);
};

// Ba status riêng của xác thực vẫn đúng shape ok: false để SPA đọc được error.code (ghi chú 34).
const refuse = (res, status, code, message) => res.status(status).json({ ok: false, error: { code, message } });

export const unauthenticated = (res, code = CODES.UNAUTHENTICATED, message = "Cần đăng nhập để thực hiện thao tác này.") => refuse(res, 401, code, message);
export const forbidden = (res) => refuse(res, 403, CODES.FORBIDDEN, "Tài khoản của bạn không đủ quyền thực hiện thao tác này.");
export const rateLimited = (res, retryAfter, message = "Thao tác quá nhiều lần. Vui lòng thử lại sau.") => {
  res.set("Retry-After", String(retryAfter));
  return refuse(res, 429, CODES.RATE_LIMITED, message);
};
// Không gọi được Google: không mặc định cho qua (như Bài 1).
export const captchaUnavailable = (res) => refuse(res, 503, CODES.CAPTCHA_UNAVAILABLE, "Chưa xác minh được CAPTCHA. Vui lòng thử lại sau.");
