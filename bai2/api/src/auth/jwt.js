// Cấp và kiểm tra access token (slide 30–33). File thuần: không đụng req/res.
// Token KHÔNG chứa role, email hay dữ liệu cá nhân: payload ai cũng đọc được, và role phải đọc từ DB ở mỗi request (ghi chú 33).
import jwt from "jsonwebtoken";

export const ACCESS_TOKEN_TTL = 1800; // giây; không có refresh token nên 30 phút (plan mục 4)
const ISSUER = "nhahang-api";
const AUDIENCE = "nhahang-web";
const ALGORITHM = "HS256";

const secret = () => process.env.JWT_SECRET ?? "";

// Gọi lúc khởi động: thiếu hoặc quá ngắn thì server không chạy, không có chuyện ký bằng khoá rỗng.
export function assertJwtSecret() {
  if (Buffer.byteLength(secret()) < 32) throw new Error("JWT_SECRET phải dài ít nhất 32 byte (xem .env.example).");
}

// tv là tokenVersion của user lúc cấp: tăng tokenVersion là mọi token cũ hết hiệu lực (plan 12.7).
export const signAccessToken = (user) =>
  jwt.sign({ tv: user.tokenVersion }, secret(), { algorithm: ALGORITHM, subject: String(user.id), issuer: ISSUER, audience: AUDIENCE, expiresIn: ACCESS_TOKEN_TTL });

// Thứ tự trong thư viện: thuật toán nằm trong danh sách cố định (không theo alg token tự khai, từ chối none) → chữ ký → exp,
// iss, aud. Token hết hạn chỉ báo TokenExpiredError sau khi chữ ký đúng, nên token giả không nhận được mã TOKEN_EXPIRED.
export const verifyAccessToken = (token) => jwt.verify(token, secret(), { algorithms: [ALGORITHM], issuer: ISSUER, audience: AUDIENCE });
