// Bước MFA khi đăng nhập (slide 20, 53). Đây là nơi DUY NHẤT nhận phiên chờ MFA: phiên chờ không có userId, nên loadUser không
// gắn currentUser và requireLogin từ chối ở mọi route quản trị.
import { Router } from "express";
import { prisma } from "../../db.js";
import { safeNext } from "../../auth/require-login.js";
import { requireMfaPending } from "../../auth/require-mfa-pending.js";
import { verifyRecovery, verifyTotp } from "../../auth/mfa.js";
import { photoFor } from "../../auth/photos.js";
import { minutesOf } from "../../auth/pages.js";
import { one } from "../../forms.js";

const router = Router();
const regenerate = (req) => new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
const save = (req) => new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));

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

// Chuyển từ phiên chờ sang phiên đầy đủ. Đọc lại user vì trạng thái có thể đã đổi trong lúc chờ. regenerate đổi sid, để một sid
// có từ trước (session fixation) không trở thành phiên đã xác thực đầy đủ; userId chỉ được gán ở đây và ở nhánh không bật MFA.
async function finish(req, res, target) {
  const { userId } = res.locals.mfaPending;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true, mfaEnabled: true } });
  if (!user || user.status !== "active" || !user.mfaEnabled) {
    delete req.session.mfaPending;
    return res.redirect(303, "/login");
  }
  await regenerate(req);
  req.session.userId = userId;
  req.session.loginAt = Date.now();
  await save(req);
  res.redirect(303, target);
}

router.get("/login/mfa", requireMfaPending, (req, res) => render(res, "totp"));

router.post("/login/mfa", requireMfaPending, async (req, res) => {
  const result = await verifyTotp(res.locals.mfaPending.userId, one(req.body.otp).trim());
  if (!result.ok) return refused(res, "totp", result);
  return finish(req, res, safeNext(res.locals.mfaPending.next));
});

router.get("/login/mfa/recovery", requireMfaPending, (req, res) => render(res, "recovery"));

router.post("/login/mfa/recovery", requireMfaPending, async (req, res) => {
  const result = await verifyRecovery(res.locals.mfaPending.userId, one(req.body.code));
  if (!result.ok) return refused(res, "recovery", result);
  // Dùng recovery code thường là đã mất thiết bị: đưa về hồ sơ, nhắc đổi thiết bị và tạo lại mã (ghi chú 22).
  return finish(req, res, "/admin/profile?msg=mfa-recovery-used");
});

router.post("/login/mfa/cancel", requireMfaPending, (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.redirect(303, "/login");
  });
});

export default router;
