// Hồ sơ tài khoản và đổi mật khẩu (plan 12.4). Nằm dưới /admin nên requireLogin đã chặn người chưa đăng nhập.
// Danh tính CHỈ lấy từ res.locals.currentUser: route không nhận id từ URL hay body, nên không có đường xem hay sửa
// hồ sơ của người khác. role, email, status gửi kèm form đều bị bỏ qua vì không route nào đọc các trường đó.
import { Router } from "express";
import { prisma } from "../../db.js";
import { checkUsername } from "../../auth/username.js";
import { hashPassword, verifyPassword, checkNewPassword } from "../../auth/password.js";
import { sendLater, passwordChangedMail } from "../../auth/mailer.js";
import { hit, peek, reset, retryAfter } from "../../auth/rate-limit.js";
import { tooMany, minutesOf } from "../../auth/pages.js";
import { one } from "../../forms.js";
import { mfaSummary } from "../../auth/mfa.js";
import { setTokens } from "../../auth/load-user.js";
import { familyExpiry, revokeUserFamilies, startFamily } from "../../auth/refresh.js";

const router = Router();
const BASE = "/admin/profile";

// Đoán mật khẩu hiện tại trên một phiên bị chiếm: đủ 5 lần sai trong 15 phút → khoá đổi mật khẩu 15 phút (plan 12.4).
// Bộ đếm theo user, nằm ở DB như đăng nhập; đăng xuất, đổi cookie không đặt lại được.
const MIN = 60_000;
const FAIL_WINDOW = 15 * MIN;
const FAIL_LOCK_AT = 5;
const FAIL_LOCK_FOR = 15 * MIN;
const failKey = (userId) => `password-change-fail:user:${userId}`;

const STATUS_LABEL = { pending: "Chờ kích hoạt", active: "Đang hoạt động" };
// Múi giờ cố định: server chạy ở đâu thì người dùng vẫn đọc giờ Việt Nam.
const formatDate = (d) => (d ? new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh" }).format(d) : "Chưa có");

async function renderProfile(res, { status = 200, values = null, errors = {} } = {}) {
  // Chỉ chọn cột cần hiện: passwordHash không bao giờ tới template.
  const user = await prisma.user.findUnique({
    where: { id: res.locals.currentUser.id },
    select: { email: true, username: true, status: true, emailVerifiedAt: true, createdAt: true },
  });
  res.status(status).render("admin/profile/index", {
    title: "Hồ sơ tài khoản",
    profile: { ...user, statusLabel: STATUS_LABEL[user.status], verifiedAt: formatDate(user.emailVerifiedAt), joinedAt: formatDate(user.createdAt) },
    values: values ?? { username: user.username ?? "" },
    errors,
    mfa: await mfaSummary(res.locals.currentUser.id),
    recoveryJustUsed: res.req.query.msg === "mfa-recovery-used",
  });
}

router.get("/", (req, res) => renderProfile(res));

router.patch("/", async (req, res) => {
  const values = { username: one(req.body.username) };
  const errors = {};
  const username = checkUsername(values.username, errors);
  if (Object.keys(errors).length) return renderProfile(res, { status: 400, values, errors });
  await prisma.user.update({ where: { id: res.locals.currentUser.id }, data: { username } });
  res.redirect(303, `${BASE}?msg=profile-updated`);
});

// ---------- Đổi mật khẩu ----------
const renderPassword = (res, { status = 200, errors = {} } = {}) =>
  res.status(status).render("admin/profile/password", { title: "Đổi mật khẩu", errors }); // không truyền mật khẩu vào trang

const lockedPage = (res, until) =>
  tooMany(res, "login", {
    retryAfter: retryAfter(until),
    heading: "Tạm khoá đổi mật khẩu",
    text: `Mật khẩu hiện tại bị nhập sai quá nhiều lần. Hãy thử lại sau khoảng ${minutesOf(retryAfter(until))} phút.`,
    button: { href: BASE, label: "Về hồ sơ" },
  });


router.get("/password", (req, res) => renderPassword(res));

// Thứ tự: đang khoá → validate → so mật khẩu hiện tại → ghi. Validate đứng trước bước so để lỗi gõ mật khẩu mới không tốn
// một lần băm và không tính vào bộ đếm sai.
router.post("/password", async (req, res) => {
  const { id: userId, email } = res.locals.currentUser;
  const key = failKey(userId);
  const state = await peek(key, { windowMs: FAIL_WINDOW });
  if (state.lockedUntil) return lockedPage(res, state.lockedUntil);

  const current = one(req.body.currentPassword);
  const password = one(req.body.password);
  const errors = {};
  if (!current) errors.currentPassword = "Nhập mật khẩu hiện tại.";
  checkNewPassword(password, one(req.body.passwordConfirm), errors);
  if (!errors.password && current && password === current) errors.password = "Mật khẩu mới phải khác mật khẩu hiện tại.";
  if (Object.keys(errors).length) return renderPassword(res, { status: 400, errors });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!(await verifyPassword(user.passwordHash, current))) {
    const after = await hit(key, { windowMs: FAIL_WINDOW, lockAt: FAIL_LOCK_AT, lockMs: FAIL_LOCK_FOR });
    if (after.lockedUntil) return lockedPage(res, after.lockedUntil);
    return renderPassword(res, { status: 400, errors: { currentPassword: "Mật khẩu hiện tại không đúng." } });
  }

  const passwordHash = await hashPassword(password);
  // MỘT transaction: đổi hash có điều kiện "hash vẫn là hash vừa so" → hai request cùng lúc chỉ một request đổi được; vô hiệu
  // link đặt lại chưa dùng (link cũ không được đè mật khẩu mới); tăng tokenVersion (mọi access token đã cấp, kể cả của thiết bị
  // khác, hết hiệu lực) và thu hồi MỌI family refresh token (thiết bị khác bị đăng xuất). Plan mục 15.
  const changed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({ where: { id: userId, passwordHash: user.passwordHash }, data: { passwordHash, tokenVersion: { increment: 1 } } });
    if (count !== 1) return false;
    await tx.passwordReset.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
    await revokeUserFamilies(tx, userId);
    return true;
  });
  if (!changed) return renderPassword(res, { status: 400, errors: { currentPassword: "Mật khẩu vừa được đổi ở nơi khác. Hãy nhập lại mật khẩu hiện tại." } });

  await reset(key);
  // Trình duyệt đang dùng nhận family MỚI với tokenVersion mới. Giữ trần tuyệt đối của lần đăng nhập cũ: đổi mật khẩu không được
  // kéo dài hạn tối đa (12 giờ mặc định).
  const fresh = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, tokenVersion: true } });
  const familyExpiresAt = (await familyExpiry(res.locals.auth.familyId)) ?? undefined;
  setTokens(res, fresh, await startFamily(fresh, { familyExpiresAt }));
  sendLater(passwordChangedMail(email)); // báo chủ tài khoản, không chứa mật khẩu
  res.redirect(303, `${BASE}?msg=password-changed`);
});

export default router;
