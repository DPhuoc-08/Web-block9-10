// Access token của Bài 1 (plan mục 15, phần B của giảng viên). File thuần: không đụng req/res.
// Payload ai cũng đọc được (base64url) nên KHÔNG chứa role, email: role, chefId đọc từ DB ở mỗi request.
import jwt from "jsonwebtoken";

export const ACCESS_TOKEN_TTL = 90; // giây (1 phút 30 giây, yêu cầu của giảng viên)
const ISSUER = "nhahang-bai1";
const AUDIENCE = "nhahang-bai1";
const REAUTH_AUDIENCE = "nhahang-bai1:mfa-replace"; // vé xác thực lại khác audience → không dùng làm access token được
export const REAUTH_TTL = 10 * 60; // giây: cửa sổ đổi thiết bị MFA sau khi xác thực lại (plan mục 4, 14 L2)
const ALGORITHM = "HS256";

const secret = () => process.env.JWT_SECRET ?? "";

// Thiếu hoặc quá ngắn thì server không khởi động: không có chuyện ký bằng khoá rỗng.
export function assertJwtSecret() {
  if (Buffer.byteLength(secret()) < 32) throw new Error("JWT_SECRET phải dài ít nhất 32 byte (xem .env.example).");
}

// tv = tokenVersion lúc cấp (đổi / đặt lại mật khẩu → tăng → token cũ hết hiệu lực). fam = family của refresh token: gắn access
// token với đúng một lần đăng nhập (dùng cho vé xác thực lại, giữ mã khôi phục).
export const signAccessToken = (user, familyId) =>
  jwt.sign({ tv: user.tokenVersion, fam: familyId }, secret(), { algorithm: ALGORITHM, subject: String(user.id), issuer: ISSUER, audience: AUDIENCE, expiresIn: ACCESS_TOKEN_TTL });

// Thứ tự trong thư viện: thuật toán nằm trong danh sách cố định (không theo alg token tự khai, từ chối none) → chữ ký → exp,
// iss, aud. Lỗi gì cũng ném; loadUser coi như không có access token và thử refresh.
export const verifyAccessToken = (token) => jwt.verify(token, secret(), { algorithms: [ALGORITHM], issuer: ISSUER, audience: AUDIENCE });

export const signReauth = (userId, familyId) =>
  jwt.sign({ fam: familyId }, secret(), { algorithm: ALGORITHM, subject: String(userId), issuer: ISSUER, audience: REAUTH_AUDIENCE, expiresIn: REAUTH_TTL });

// Vé chỉ hợp lệ cho đúng user và đúng lần đăng nhập (family) đã xác thực lại.
export function reauthValid(token, userId, familyId) {
  try {
    const c = jwt.verify(token ?? "", secret(), { algorithms: [ALGORITHM], issuer: ISSUER, audience: REAUTH_AUDIENCE });
    return c.sub === String(userId) && c.fam === familyId;
  } catch {
    return false;
  }
}
