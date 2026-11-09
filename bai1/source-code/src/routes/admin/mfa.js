// Quản lý MFA của chính người đang đăng nhập (/admin/profile/mfa). Nằm dưới /admin nên requireLogin đã chặn phiên chờ MFA.
// Danh tính chỉ lấy từ res.locals.currentUser. GET chỉ đọc; mọi thao tác ghi là POST rồi 303.
import { Router } from "express";
import { confirmEnrollment, readEnrollment, startEnrollment } from "../../auth/mfa.js";
import { holdCodes, takeCodes } from "../../auth/recovery-display.js";
import { minutesOf } from "../../auth/pages.js";
import { one, withFlash } from "../../forms.js";

const router = Router();
const PROFILE = "/admin/profile";
const BASE = `${PROFILE}/mfa`;

// Nhóm 4 ký tự cho dễ chép tay; ứng dụng authenticator bỏ qua khoảng trắng.
const grouped = (secret) => secret.match(/.{1,4}/g).join(" ");

async function renderSetup(res, { status = 200, banner = null, code = null } = {}) {
  const enrollment = await readEnrollment(res.locals.currentUser.id);
  if (!enrollment) return res.redirect(303, PROFILE);
  res.status(status).render("admin/mfa/setup", {
    title: enrollment.replacing ? "Đổi thiết bị xác thực" : "Bật xác thực hai lớp",
    secret: grouped(enrollment.secret),
    qrDataUrl: enrollment.qrDataUrl,
    replacing: enrollment.replacing,
    banner,
    code,
  });
}

// Tạo secret chờ bằng POST: GET không được đổi dữ liệu (slide 55). Đã bật thì phải đi đường thay thiết bị có xác thực lại.
router.post("/setup", async (req, res) => {
  await startEnrollment(res.locals.currentUser.id);
  res.redirect(303, `${BASE}/setup`);
});

router.get("/setup", (req, res) => renderSetup(res));

router.post("/setup/confirm", async (req, res) => {
  const result = await confirmEnrollment(res.locals.currentUser.id, one(req.body.otp).trim());
  if (!result.ok) {
    if (result.reason === "locked") {
      res.set("Retry-After", String(result.retryAfter));
      return renderSetup(res, { status: 429, code: "RATE_LIMITED", banner: { kind: "error", text: `Sai quá nhiều lần. Vui lòng thử lại sau ${minutesOf(result.retryAfter)} phút.` } });
    }
    return renderSetup(res, { code: "INVALID_OTP", banner: { kind: "error", text: "Mã không đúng. Kiểm tra lại ứng dụng rồi nhập mã mới nhất." } });
  }
  if (result.replaced) return res.redirect(303, withFlash(PROFILE, { msg: "mfa-replaced" }));
  holdCodes(req.sessionID, { codes: result.codes, kind: "enabled" });
  res.redirect(303, `${BASE}/codes`);
});

// Trang hiện mã một lần: đọc là xoá, nên Reload không hiện lại.
router.get("/codes", (req, res) => {
  const held = takeCodes(req.sessionID);
  if (!held) return res.redirect(303, withFlash(PROFILE, { msg: "mfa-codes-gone" }));
  res.render("admin/mfa/codes", { title: "Lưu mã khôi phục", codes: held.codes, kind: held.kind });
});

export default router;
