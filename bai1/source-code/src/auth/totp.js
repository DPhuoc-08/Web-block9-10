// TOTP theo RFC 6238 qua thư viện otpauth (slide 49: không tự viết thuật toán mật mã). File thuần, chép nguyên sang Bài 2.
// 6 chữ số, SHA-1, bước 30 giây: tương thích mọi ứng dụng authenticator (plan mục 4).
import { randomBytes } from "node:crypto";
import * as OTPAuth from "otpauth";

const PERIOD = 30;
const ISSUER = "Nhà hàng";
const build = (secret, label) => new OTPAuth.TOTP({ issuer: ISSUER, label, algorithm: "SHA1", digits: 6, period: PERIOD, secret: OTPAuth.Secret.fromBase32(secret) });

// 160 bit từ crypto, đúng độ dài RFC 4226 khuyến nghị.
export const newTotpSecret = () => new OTPAuth.Secret({ buffer: randomBytes(20) }).base32;
export const otpauthUri = (secret, label) => build(secret, label).toString();
export const isTotpFormat = (code) => typeof code === "string" && /^\d{6}$/.test(code);

// Trả về bước thời gian của mã nếu đúng, null nếu sai. Chấp nhận tối đa một bước lân cận (slide 21, RFC 6238 mục 5.2).
// Trả về BƯỚC chứ không chỉ đúng/sai, vì nơi gọi cần nó để từ chối dùng lại mã.
export function acceptedStep(secret, code, now = Date.now()) {
  if (!isTotpFormat(code)) return null;
  const delta = build(secret, "x").validate({ token: code, timestamp: now, window: 1 });
  return delta === null ? null : Math.floor(now / 1000 / PERIOD) + delta;
}
