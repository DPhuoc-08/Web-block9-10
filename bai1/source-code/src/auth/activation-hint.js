// Gợi ý cho trang nhập mã kích hoạt (plan mục 15, thay activationEmail / otpSentAt trong session): email để điền sẵn (không đưa
// email lên URL) và lúc gửi mã để hiện đếm ngược. Chỉ là giao diện: giới hạn gửi lại 60 giây vẫn chặn ở server (rate_limits).
import { getCookie, setCookie, clearCookie } from "./cookies.js";

const HINT_MS = 60 * 60_000;

export function readActivation(req) {
  try {
    const v = JSON.parse(getCookie(req, "activation") ?? "{}");
    return { email: typeof v.email === "string" ? v.email : "", sentAt: Number.isFinite(v.sentAt) ? v.sentAt : 0 };
  } catch {
    return { email: "", sentAt: 0 };
  }
}

export const writeActivation = (req, res, { email, sentAt }) => setCookie(res, "activation", JSON.stringify({ email, sentAt }), HINT_MS);
export const clearActivation = (res) => clearCookie(res, "activation");
