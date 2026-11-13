// Đăng nhập, bước MFA, đăng ký, kích hoạt, quên và đặt lại mật khẩu bằng JSON. Chuyển từ routes/auth/*.js của Bài 1:
// GIỮ NGUYÊN thứ tự kiểm tra, CAPTCHA, bộ đếm và thời gian chờ; form + redirect đổi thành status và error.code theo hợp đồng.
import { Router } from "express";
import { prisma, isUniqueViolation } from "../db.js";
import { CODES, ok, okSecret, fail, validationFailed, unauthenticated, rateLimited, captchaUnavailable } from "../http/respond.js";
import { jsonBody } from "../http/json-body.js";
import { checkEmail, normalizeEmail } from "../auth/email.js";
import { checkUsername } from "../auth/username.js";
import { hashPassword, verifyPassword, checkNewPassword } from "../auth/password.js";
import { generateOtp, generateToken, hashOtp, sameHex, sha256 } from "../auth/secrets.js";
import { sendLater, activationMail, resetMail, passwordChangedMail } from "../auth/mailer.js";
import { verifyRecaptcha } from "../auth/recaptcha.js";
import { hit, peek, reset, limit, retryAfter } from "../auth/rate-limit.js";
import { verifyRecovery, verifyTotp } from "../auth/mfa.js";
import { ACCESS_TOKEN_TTL, signAccessToken } from "../auth/jwt.js";
import { requireJwt } from "../auth/require-jwt.js";

const router = Router();

// Body JSON giữ kiểu: chỉ nhận chuỗi, còn lại coi như thiếu (mảng, số, object không đi vào hàm băm hay truy vấn).
const str = (v) => (typeof v === "string" ? v : "");
const MIN = 60_000;
const expiresIn = (ms) => new Date(Date.now() + ms);
const minutesOf = (seconds) => Math.max(1, Math.ceil(seconds / 60));
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{20,100}$/;

const issueToken = (res, user, extra = {}) => okSecret(res, { accessToken: signAccessToken(user), expiresIn: ACCESS_TOKEN_TTL, ...extra });

// Trả true khi đã phản hồi lỗi CAPTCHA. Thiếu và sai là hai mã khác nhau (slide 37).
async function captchaRefused(res, token, message) {
  const captcha = await verifyRecaptcha(token);
  if (captcha.unavailable) { captchaUnavailable(res); return true; }
  if (captcha.ok) return false;
  fail(res, captcha.reason === "missing-input-response" ? CODES.CAPTCHA_REQUIRED : CODES.INVALID_CAPTCHA, message, { captchaRequired: true });
  return true;
}

// ---------- Đăng nhập ----------
const FAIL_WINDOW = 15 * MIN;
const CAPTCHA_AT = 3;
const LOCK_AT = 10;
const LOCK_FOR = 5 * MIN;
const LOGIN_IP = { windowMs: 15 * MIN, max: 30 };
const CHALLENGE_TTL = 5 * MIN; // đủ mở app lấy mã, ngắn để bước password không thành quyền vào lâu dài (plan mục 4)
const failKey = (email) => `login-fail:email:${email}`;
const loginLocked = (res, until) => rateLimited(res, retryAfter(until), `Có quá nhiều lần đăng nhập sai với email này. Hãy thử lại sau ${minutesOf(retryAfter(until))} phút.`);

// Challenge thay cho phiên chờ MFA (slide 37): chuỗi ngẫu nhiên, không phải JWT nên requireJwt luôn từ chối; DB chỉ lưu hash.
async function issueChallenge(userId) {
  const token = generateToken();
  const now = new Date();
  await prisma.$transaction([
    prisma.mfaChallenge.deleteMany({ where: { userId, OR: [{ usedAt: { not: null } }, { expiresAt: { lt: now } }] } }),
    prisma.mfaChallenge.create({ data: { userId, tokenHash: sha256(token), expiresAt: new Date(now.getTime() + CHALLENGE_TTL) } }),
  ]);
  return token;
}

// Thứ tự cố định như POST /login của Bài 1: giới hạn IP → khoá theo email → CAPTCHA (khi cần) → password → trạng thái → cấp quyền.
router.post("/login", jsonBody, async (req, res) => {
  const email = normalizeEmail(str(req.body.email));
  const password = str(req.body.password);

  const ip = await limit(`login:ip:${req.ip}`, LOGIN_IP);
  if (ip.limited) return rateLimited(res, ip.retryAfter, "Có quá nhiều lần đăng nhập từ địa chỉ này. Vui lòng thử lại sau.");

  if (!email || !password) return validationFailed(res, { ...(email ? {} : { email: "Nhập email." }), ...(password ? {} : { password: "Nhập mật khẩu." }) });

  const state = await peek(failKey(email), { windowMs: FAIL_WINDOW });
  if (state.lockedUntil) return loginLocked(res, state.lockedUntil);

  // Từ lần sai thứ 3: CAPTCHA hợp lệ TRƯỚC khi so password. Bộ đếm ở DB nên gọi API trực tiếp cũng không đặt lại được (slide 37).
  if (state.count >= CAPTCHA_AT && (await captchaRefused(res, str(req.body.captchaToken), "Bạn đã nhập sai nhiều lần. Hãy xác nhận bạn không phải người máy."))) return;

  // Email không có tài khoản vẫn verify với hash giả: cùng thời gian, cùng thông báo.
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true, status: true, mfaEnabled: true, tokenVersion: true } });
  if (!(await verifyPassword(user?.passwordHash ?? null, password))) {
    const after = await hit(failKey(email), { windowMs: FAIL_WINDOW, lockAt: LOCK_AT, lockMs: LOCK_FOR });
    if (after.lockedUntil) return loginLocked(res, after.lockedUntil);
    return fail(res, CODES.INVALID_CREDENTIALS, "Email hoặc mật khẩu không đúng.", { captchaRequired: after.count >= CAPTCHA_AT });
  }

  if (user.status !== "active") return fail(res, CODES.ACCOUNT_NOT_ACTIVATED, "Tài khoản chưa được kích hoạt. Nhập mã 6 số trong email để kích hoạt.");

  await reset(failKey(email));
  // Đã bật MFA: chỉ trả challenge, KHÔNG có accessToken. Mọi đường cấp token phải qua nhánh này (slide 37, 62).
  if (user.mfaEnabled) return okSecret(res, { next: "mfa", challenge: await issueChallenge(user.id), expiresIn: CHALLENGE_TTL / 1000 });
  issueToken(res, user);
});

// ---------- Bước MFA ----------
// Giới hạn theo IP cho bước nhập mã (plan mục 4, thêm 12/11, 14.3 b): lớp thứ hai bên cạnh bộ đếm theo user, để một nguồn không dò
// được mã của nhiều tài khoản. Cùng số với giới hạn IP của đăng nhập; như Bài 1, chỉ đếm request có challenge hợp lệ.
const MFA_IP = { windowMs: 15 * MIN, max: 30 };
const challengeExpired = (res) => unauthenticated(res, CODES.UNAUTHENTICATED, "Phiên xác thực đã hết hạn. Hãy đăng nhập lại.");

// Nơi DUY NHẤT nhận challenge. Access token có dấu chấm nên không qua được định dạng ở đây; challenge không phải JWT nên không qua
// được requireJwt ở route dữ liệu (slide 37).
router.post("/mfa", jsonBody, async (req, res) => {
  const token = str(req.body.challenge);
  const row = TOKEN_FORMAT.test(token) ? await prisma.mfaChallenge.findUnique({ where: { tokenHash: sha256(token) }, select: { id: true, userId: true, usedAt: true, expiresAt: true } }) : null;
  if (!row || row.usedAt || row.expiresAt <= new Date()) return challengeExpired(res);

  const ip = await limit(`mfa:ip:${req.ip}`, MFA_IP);
  if (ip.limited) return rateLimited(res, ip.retryAfter, `Sai quá nhiều lần. Vui lòng thử lại sau ${minutesOf(ip.retryAfter)} phút.`);

  const code = str(req.body.code).trim();
  const recoveryCode = str(req.body.recoveryCode);
  if (!code && !recoveryCode) return validationFailed(res, { code: "Nhập mã xác thực." });

  const result = recoveryCode ? await verifyRecovery(row.userId, recoveryCode) : await verifyTotp(row.userId, code);
  if (!result.ok) {
    if (result.reason === "locked") return rateLimited(res, result.retryAfter, `Sai quá nhiều lần. Vui lòng thử lại sau ${minutesOf(result.retryAfter)} phút.`);
    return fail(res, CODES.INVALID_OTP, "Mã không đúng hoặc đã được dùng.");
  }

  // Challenge dùng một lần; điều kiện nằm trong câu ghi nên hai request cùng challenge chỉ một request nhận được token.
  const { count } = await prisma.mfaChallenge.updateMany({ where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
  if (count !== 1) return challengeExpired(res);
  // Đọc lại user vì trạng thái có thể đã đổi trong lúc chờ.
  const user = await prisma.user.findUnique({ where: { id: row.userId }, select: { id: true, status: true, mfaEnabled: true, tokenVersion: true } });
  if (!user || user.status !== "active" || !user.mfaEnabled) return challengeExpired(res);
  issueToken(res, user, result.via === "recovery" ? { recoveryRemaining: result.remaining } : {});
});

router.get("/me", requireJwt, (req, res) => {
  const { id, email, username, role, chefId } = res.locals.currentUser;
  ok(res, { id, email, username, role, chefId });
});

// ---------- Đăng ký ----------
const OTP_TTL = 10 * MIN;
const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCK = 15 * MIN;
const RESEND_COOLDOWN = 1 * MIN;
const RESEND_PER_HOUR = 5;
const REGISTER_PER_HOUR = 10;
const ACTIVATE_IP = { windowMs: 15 * MIN, max: 30 };

async function sendBudget(email) {
  const cooldown = await limit(`otp-cooldown:email:${email}`, { windowMs: RESEND_COOLDOWN, max: 1 });
  if (cooldown.limited) return cooldown;
  return limit(`otp-send:email:${email}`, { windowMs: 60 * MIN, max: RESEND_PER_HOUR });
}

// Mã mới: GIỮ attempts, lockedUntil, để gửi lại không mở thêm lượt đoán.
async function issueOtp(userId, email) {
  const code = generateOtp();
  await prisma.activationChallenge.update({ where: { userId }, data: { otpHash: hashOtp(code), expiresAt: expiresIn(OTP_TTL), usedAt: null, lastSentAt: new Date() } });
  sendLater(activationMail(email, code));
}

router.post("/register", jsonBody, async (req, res) => {
  const ipLimit = await limit(`register:ip:${req.ip}`, { windowMs: 60 * MIN, max: REGISTER_PER_HOUR });
  if (ipLimit.limited) return rateLimited(res, ipLimit.retryAfter);

  // CAPTCHA TRƯỚC khi băm mật khẩu, tạo user hay gửi email.
  if (await captchaRefused(res, str(req.body.captchaToken), "Hãy xác nhận bạn không phải người máy rồi gửi lại.")) return;

  // role trong body bị bỏ qua: không đọc trường này, server gán viewer (slide 68).
  const errors = {};
  const emailInput = str(req.body.email);
  const username = checkUsername(req.body.username, errors);
  const email = checkEmail(emailInput, errors);
  const password = str(req.body.password);
  checkNewPassword(password, str(req.body.passwordConfirm), errors);
  if (Object.keys(errors).length) return validationFailed(res, errors);

  // Luôn băm mật khẩu kể cả khi email đã có: thời gian phản hồi giống nhau.
  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, status: true } });
  if (!existing) {
    const code = generateOtp();
    try {
      await prisma.user.create({ data: { email, emailInput: emailInput.trim(), username, passwordHash, activation: { create: { otpHash: hashOtp(code), expiresAt: expiresIn(OTP_TTL), lastSentAt: new Date() } } } });
      await hit(`otp-cooldown:email:${email}`, { windowMs: RESEND_COOLDOWN });
      await hit(`otp-send:email:${email}`, { windowMs: 60 * MIN });
      sendLater(activationMail(email, code));
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  } else if (existing.status === "pending") {
    // Không ghi đè mật khẩu, tên của tài khoản đang chờ; coi như yêu cầu gửi lại mã.
    if (!(await sendBudget(email)).limited) await issueOtp(existing.id, email);
  }
  // Cả ba nhánh cùng một response: không lộ email nào đã có tài khoản.
  ok(res, { next: "activate", resendAfter: RESEND_COOLDOWN / 1000 });
});

// ---------- Kích hoạt ----------
router.post("/activate", jsonBody, async (req, res) => {
  const otp = str(req.body.otp).replace(/\s/g, "");
  const ipLimit = await limit(`activate:ip:${req.ip}`, ACTIVATE_IP);
  if (ipLimit.limited) return rateLimited(res, ipLimit.retryAfter);

  const errors = {};
  const email = checkEmail(req.body.email, errors);
  if (errors.email) return validationFailed(res, errors);

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, status: true, activation: true } });
  const challenge = user?.status === "pending" ? user.activation : null;
  const key = `activate-fail:email:${email}`;

  const lockedUntil = challenge ? (challenge.lockedUntil > new Date() ? challenge.lockedUntil : null) : (await peek(key, { windowMs: OTP_LOCK })).lockedUntil;
  if (lockedUntil) return rateLimited(res, retryAfter(lockedUntil), `Bạn đã nhập sai mã quá nhiều lần. Hãy thử lại sau khoảng ${minutesOf(retryAfter(lockedUntil))} phút.`);

  let activated = false;
  if (challenge && /^\d{6}$/.test(otp) && sameHex(hashOtp(otp), challenge.otpHash)) {
    activated = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.activationChallenge.updateMany({
        where: { userId: user.id, purpose: "activation", usedAt: null, expiresAt: { gt: now }, attempts: { lt: OTP_MAX_ATTEMPTS }, otpHash: challenge.otpHash, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
        data: { usedAt: now },
      });
      if (count !== 1) return false;
      await tx.user.update({ where: { id: user.id }, data: { status: "active", emailVerifiedAt: now } });
      return true;
    });
  }

  if (!activated) {
    if (challenge) {
      const updated = await prisma.activationChallenge.update({ where: { userId: user.id }, data: { attempts: { increment: 1 } } });
      if (updated.attempts >= OTP_MAX_ATTEMPTS) await prisma.activationChallenge.update({ where: { userId: user.id }, data: { lockedUntil: expiresIn(OTP_LOCK), attempts: 0 } });
    } else {
      await hit(key, { windowMs: OTP_LOCK, lockAt: OTP_MAX_ATTEMPTS, lockMs: OTP_LOCK });
    }
    return fail(res, CODES.INVALID_OTP, "Mã không đúng hoặc đã hết hạn.", { fields: { otp: "Kiểm tra lại mã trong email mới nhất, hoặc gửi mã mới." } });
  }
  // Kích hoạt chỉ đổi trạng thái, KHÔNG cấp token: người dùng đăng nhập ở bước riêng.
  ok(res, { activated: true });
});

router.post("/activate/resend", jsonBody, async (req, res) => {
  const errors = {};
  const email = checkEmail(req.body.email, errors);
  if (errors.email) return validationFailed(res, errors);
  const budget = await sendBudget(email);
  if (budget.limited) return rateLimited(res, budget.retryAfter, "Bạn vừa yêu cầu mã. Hãy chờ rồi thử lại.");
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, status: true, activation: { select: { userId: true } } } });
  if (user?.status === "pending" && user.activation) await issueOtp(user.id, email);
  ok(res, { sent: true, resendAfter: RESEND_COOLDOWN / 1000 });
});

// ---------- Quên, đặt lại mật khẩu ----------
const TOKEN_TTL = 15 * MIN;
const FORGOT_EMAIL = { windowMs: 60 * MIN, max: 3 };
const FORGOT_IP = { windowMs: 60 * MIN, max: 10 };
const RESET_IP = { windowMs: 15 * MIN, max: 20 };

router.post("/forgot", jsonBody, async (req, res) => {
  const ip = await limit(`forgot:ip:${req.ip}`, FORGOT_IP);
  if (ip.limited) return rateLimited(res, ip.retryAfter);
  const errors = {};
  const email = checkEmail(req.body.email, errors);
  if (errors.email) return validationFailed(res, errors);
  const perEmail = await limit(`forgot:email:${email}`, FORGOT_EMAIL);
  if (perEmail.limited) return rateLimited(res, perEmail.retryAfter);

  // Chạy SAU khi trả lời: nếu làm trước, thời gian phản hồi sẽ lộ email nào đã đăng ký.
  setImmediate(() => {
    issueResetToken(email).catch((err) => console.error(`[forgot] Tạo link đặt lại thất bại lúc ${new Date().toISOString()}: ${err.code ?? err.name}`));
  });
  ok(res, { sent: true });
});

async function issueResetToken(email) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return;
  const token = generateToken();
  const now = new Date();
  await prisma.$transaction([
    prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } }),
    prisma.passwordReset.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(now.getTime() + TOKEN_TTL) } }),
  ]);
  // Link về trang của web, dựng từ .env, không từ header Host của request.
  sendLater(resetMail(email, `${process.env.WEB_ORIGIN}/reset?token=${token}`));
}

const linkUnusable = (res) => fail(res, CODES.INVALID_RESET_TOKEN, "Link đã hết hạn, đã được dùng hoặc không đúng. Hãy yêu cầu một link mới.");

async function validToken(token) {
  if (!TOKEN_FORMAT.test(token)) return null;
  const row = await prisma.passwordReset.findUnique({ where: { tokenHash: sha256(token) }, select: { id: true, userId: true, usedAt: true, expiresAt: true } });
  return row && !row.usedAt && row.expiresAt > new Date() ? row : null;
}

router.post("/reset", jsonBody, async (req, res) => {
  const ip = await limit(`reset:ip:${req.ip}`, RESET_IP);
  if (ip.limited) return rateLimited(res, ip.retryAfter);
  const row = await validToken(str(req.body.token));
  if (!row) return linkUnusable(res);

  const password = str(req.body.password);
  const errors = {};
  checkNewPassword(password, str(req.body.passwordConfirm), errors);
  if (Object.keys(errors).length) return validationFailed(res, errors);

  const passwordHash = await hashPassword(password);
  // Một transaction: tiêu thụ token bằng câu ghi có điều kiện, đổi password, tăng tokenVersion để JWT cũ hết hiệu lực ngay (plan 12.7),
  // huỷ challenge đang chờ. KHÔNG đổi status, KHÔNG tắt MFA: đăng nhập sau đó vẫn qua bước MFA (slide 68).
  const changed = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const { count } = await tx.passwordReset.updateMany({ where: { id: row.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (count !== 1) return null;
    const user = await tx.user.update({ where: { id: row.userId }, data: { passwordHash, tokenVersion: { increment: 1 } }, select: { email: true } });
    await tx.passwordReset.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: now } });
    await tx.mfaChallenge.deleteMany({ where: { userId: row.userId } });
    return user;
  });
  if (!changed) return linkUnusable(res);

  sendLater(passwordChangedMail(changed.email));
  ok(res, { reset: true }); // không cấp token: đăng nhập lại theo luồng thường
});

export default router;
