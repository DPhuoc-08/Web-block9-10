import { generalMessage } from "../../components/FormBits.jsx";

// Banner cho lỗi không thuộc ô nào. Giữ một chỗ để mọi trang tài khoản nói cùng một câu.
export function errorBanner(err) {
  if (err?.kind === "rate-limited" || err?.code === "CAPTCHA_UNAVAILABLE") return { kind: "error", text: err.message };
  if (err?.kind === "business") return { kind: "error", text: err.message };
  return { kind: "error", text: generalMessage(err) };
}
export const CAPTCHA_MSG = { CAPTCHA_REQUIRED: "Hãy tick ô “Tôi không phải là người máy”.", INVALID_CAPTCHA: "Xác minh đã hết hạn hoặc không hợp lệ, hãy tick lại." };
