// Bước MFA khi đăng nhập (slide 20, 53). Đây là nơi DUY NHẤT nhận challenge MFA (cookie mfa, plan mục 15): challenge không phải
// access token, nên loadUser không gắn currentUser và requireLogin từ chối ở mọi route quản trị.
import { Router } from "express";
import { prisma } from "../../db.js";
import { safeNext } from "../../auth/require-login.js";
import { requireMfaPending } from "../../auth/require-mfa-pending.js";
import { verifyRecovery, verifyTotp } from "../../auth/mfa.js";
import { photoFor } from "../../auth/photos.js";
import { minutesOf } from "../../auth/pages.js";
import { limit } from "../../auth/rate-limit.js";
import { one } from "../../forms.js";
import { clearCookie } from "../../auth/cookies.js";
import { resetCsrf } from "../../auth/csrf.js";
import { setTokens } from "../../auth/load-user.js";
import { startFamily } from "../../auth/refresh.js";
import { consumeChallenge } from "../../auth/mfa-challenge.js";

const router = Router();
// Giới hạn theo IP cho bước nhập mã (plan mục 4, thêm 12/11, 14.3 b): lớp thứ hai bên cạnh bộ đếm theo user, để một nguồn
// không dò được mã của nhiều tài khoản. Đếm mọi lần gửi, như giới hạn IP của POST /login.
const MFA_IP = { windowMs: 15 * 60_000, max: 30 };

const VIEWS = {
  totp: { view: "auth/mfa", title: "Xác thực hai lớp" },
  recovery: { view: "auth/mfa-recovery", title: "Nhập mã khôi phục" },
};

async function render(res, kind, { status = 200, banner = null, code = null, locked = false } = {}) {
  res.status(status).render(VIEWS[kind].view, { title: VIEWS[kind].title, photo: await photoFor("login"), banner, code, locked, otpError: code === "INVALID_OTP" });
}

function refused(res, kind, result) {
  if (result.reason === "locked") {
    res.set("Retry-After", String(result.retryAfter));
    return render(res, kind, { status: 429, code: "RATE_LIMITED", locked: true, banner: { kind: "error", text: `Sai quá nhiều lần. Vui lòng thử lại sau ${minutesOf(result.retryAfter)} phút.` } });
  }
  return render(res, kind, { code: "INVALID_OTP", banner: { kind: "error", text: "Mã không đúng hoặc đã được dùng." } });
}

// Chuyển từ challenge sang đăng nhập đầy đủ. Tiêu thụ challenge bằng câu ghi có điều kiện (dùng một lần) rồi mới cấp token; đọc
// lại user vì trạng thái có thể đã đổi trong lúc chờ. Đây là nơi duy nhất cấp access + refresh cho tài khoản bật MFA.
async function finish(req, res, target) {
  const { id, userId } = res.locals.mfaPending;
  clearCookie(res, "mfa");
  if (!(await consumeChallenge(id))) return res.redirect(303, "/login");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true, mfaEnabled: true, tokenVersion: true } });
  if (!user || user.status !== "active" || !user.mfaEnabled) return res.redirect(303, "/login");
  resetCsrf(req, res);
  setTokens(res, user, await startFamily(user));
  res.redirect(303, target);
}

router.get("/login/mfa", requireMfaPending, (req, res) => render(res, "totp"));

// Trả true khi đã phản hồi 429.
async function ipLimited(req, res, kind) {
  const ip = await limit(`mfa:ip:${req.ip}`, MFA_IP);
  if (!ip.limited) return false;
  await refused(res, kind, { reason: "locked", retryAfter: ip.retryAfter });
  return true;
}

router.post("/login/mfa", requireMfaPending, async (req, res) => {
  if (await ipLimited(req, res, "totp")) return;
  const result = await verifyTotp(res.locals.mfaPending.userId, one(req.body.otp).trim());
  if (!result.ok) return refused(res, "totp", result);
  return finish(req, res, safeNext(res.locals.mfaPending.next));
});

router.get("/login/mfa/recovery", requireMfaPending, (req, res) => render(res, "recovery"));

router.post("/login/mfa/recovery", requireMfaPending, async (req, res) => {
  if (await ipLimited(req, res, "recovery")) return;
  const result = await verifyRecovery(res.locals.mfaPending.userId, one(req.body.code));
  if (!result.ok) return refused(res, "recovery", result);
  // Dùng recovery code thường là đã mất thiết bị: đưa về hồ sơ, nhắc đổi thiết bị và tạo lại mã (ghi chú 22).
  return finish(req, res, "/admin/profile?msg=mfa-recovery-used");
});

router.post("/login/mfa/cancel", requireMfaPending, async (req, res) => {
  await consumeChallenge(res.locals.mfaPending.id);
  clearCookie(res, "mfa");
  res.redirect(303, "/login");
});

export default router;
