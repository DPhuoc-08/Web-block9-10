// Chỉ gắn cho các route của bước MFA khi đăng nhập. Đọc challenge từ cookie "mfa"; quá 5 phút thì phải nhập lại password.
import { readChallenge } from "./mfa-challenge.js";
import { getCookie, clearCookie } from "./cookies.js";

export { MFA_PENDING_MS } from "./mfa-challenge.js";

export async function requireMfaPending(req, res, next) {
  const result = await readChallenge(getCookie(req, "mfa"));
  if (!result) return res.redirect(303, "/login");
  if (result.expired) {
    clearCookie(res, "mfa");
    return res.redirect(303, "/login?msg=mfa-expired");
  }
  res.locals.mfaPending = result.pending;
  next();
}
