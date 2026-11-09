// Recovery code (slide 22): mã dự phòng dùng một lần. File thuần, chép nguyên sang Bài 2.
// 10 ký tự base32 = 50 bit ngẫu nhiên từ crypto, nên HMAC với pepper là đủ, không cần băm chậm như password do người chọn.
import { randomBytes } from "node:crypto";
import { hashOtp } from "./secrets.js";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // base32: không có 0, 1, 8, 9 nên ít nhầm khi chép tay
export const RECOVERY_COUNT = 10;

function oneCode() {
  // 32 ký tự: lấy 5 bit thấp của mỗi byte thì mọi ký tự có xác suất như nhau.
  const chars = [...randomBytes(10)].map((b) => ALPHABET[b & 31]).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

export function generateRecoveryCodes() {
  const codes = new Set();
  while (codes.size < RECOVERY_COUNT) codes.add(oneCode());
  return [...codes];
}

// Viết thường, có khoảng trắng hoặc thiếu dấu gạch vẫn khớp: mã thường được chép tay từ giấy.
const normalize = (raw) => (typeof raw === "string" ? raw.toUpperCase().replace(/[\s-]/g, "") : "");
export const isRecoveryFormat = (raw) => /^[A-Z2-7]{10}$/.test(normalize(raw));
export const hashRecovery = (raw) => hashOtp(normalize(raw));
