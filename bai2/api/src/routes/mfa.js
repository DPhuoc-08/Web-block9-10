// Quản lý MFA của chính người đang đăng nhập (slide 63). Chuyển từ routes/admin/mfa.js của Bài 1, logic nằm nguyên ở auth/mfa.js.
// Bài 1 phải 303 nên giữ mã trong RAM; API trả mã một lần ngay trong body JSON, không có bước redirect.
// Danh tính chỉ lấy từ token đã verify, không nhận id từ URL hay body.
import { Router } from "express";
import { CODES, ok, okSecret, fail, validationFailed, rateLimited } from "../http/respond.js";
import { jsonBody } from "../http/json-body.js";
import { requireJwt } from "../auth/require-jwt.js";
import { confirmEnrollment, disableMfa, mfaSummary, readEnrollment, reauthenticate, regenerateCodes, startEnrollment, startReplacement } from "../auth/mfa.js";
import { otpauthUri } from "../auth/totp.js";

const router = Router();
const str = (v) => (typeof v === "string" ? v : "");
const locked = (res, result) => rateLimited(res, result.retryAfter, `Sai quá nhiều lần. Vui lòng thử lại sau ${Math.max(1, Math.ceil(result.retryAfter / 60))} phút.`);

// Cổng token đặt trước jsonBody: request chưa xác thực không được đọc body.
router.use(requireJwt);

async function sendEnrollment(res) {
  const { id, email } = res.locals.currentUser;
  const enrollment = await readEnrollment(id);
  if (!enrollment) return validationFailed(res, { mfa: "Chưa có thiết lập nào đang chờ xác nhận." });
  okSecret(res, { secret: enrollment.secret, otpauthUri: otpauthUri(enrollment.secret, email), qrDataUrl: enrollment.qrDataUrl, replacing: enrollment.replacing });
}

router.get("/status", async (req, res) => ok(res, await mfaSummary(res.locals.currentUser.id)));

router.post("/setup", async (req, res) => {
  if (!(await startEnrollment(res.locals.currentUser.id))) return validationFailed(res, { mfa: "Xác thực hai lớp đang bật. Hãy dùng chức năng đổi thiết bị." });
  await sendEnrollment(res);
});

router.post("/confirm", jsonBody, async (req, res) => {
  const result = await confirmEnrollment(res.locals.currentUser.id, str(req.body.code).trim());
  if (!result.ok) {
    if (result.reason === "locked") return locked(res, result);
    return fail(res, CODES.INVALID_OTP, "Mã không đúng. Kiểm tra lại ứng dụng rồi nhập mã mới nhất.");
  }
  okSecret(res, result.replaced ? { replaced: true } : { replaced: false, recoveryCodes: result.codes });
});

// Thay, tắt, tạo lại mã: bắt buộc password và một mã, dù token còn hạn (slide 23). Sai trả 200, không phải 401, để web không đăng xuất nhầm.
async function reauthenticated(req, res) {
  const result = await reauthenticate(res.locals.currentUser.id, str(req.body.password), str(req.body.factor).trim());
  if (result.ok) return true;
  if (result.reason === "locked") locked(res, result);
  else fail(res, CODES.INVALID_OTP, "Mật khẩu hoặc mã không đúng.");
  return false;
}

router.post("/replace", jsonBody, async (req, res) => {
  if (!(await mfaSummary(res.locals.currentUser.id)).enabled) return validationFailed(res, { mfa: "Xác thực hai lớp chưa bật." });
  if (!(await reauthenticated(req, res))) return;
  await startReplacement(res.locals.currentUser.id);
  await sendEnrollment(res);
});

router.post("/recovery-codes", jsonBody, async (req, res) => {
  if (!(await mfaSummary(res.locals.currentUser.id)).enabled) return validationFailed(res, { mfa: "Xác thực hai lớp chưa bật." });
  if (!(await reauthenticated(req, res))) return;
  okSecret(res, { recoveryCodes: await regenerateCodes(res.locals.currentUser.id) });
});

router.post("/disable", jsonBody, async (req, res) => {
  if (!(await mfaSummary(res.locals.currentUser.id)).enabled) return validationFailed(res, { mfa: "Xác thực hai lớp chưa bật." });
  if (!(await reauthenticated(req, res))) return;
  await disableMfa(res.locals.currentUser.id);
  ok(res, { disabled: true }); // tokenVersion đã tăng: token đang dùng hết hiệu lực, web đưa người dùng về đăng nhập
});

export default router;
