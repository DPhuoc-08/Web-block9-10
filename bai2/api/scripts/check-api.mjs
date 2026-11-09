// Kiểm tra api của Bài 2 theo bảng nghiệm thu (slide 67, 68; plan mục 10.2). Tự chạy server thật ở cổng 3100.
//   node scripts/check-api.mjs        → mọi phần
//   node scripts/check-api.mjs B      → chỉ phần B
// A: CORS, verify JWT. B: đăng nhập, challenge MFA. C: đăng ký, kích hoạt, quên mật khẩu. D: quản lý MFA.
// Tài khoản thử @demo.example, bản ghi "[TEST B9]" được xoá ở cuối. Không có nhánh code nào bỏ qua CAPTCHA hay MFA.
import "./lib/test-env.mjs";
import jwt from "jsonwebtoken";
import * as OTPAuth from "otpauth";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/auth/password.js";
import { hashRecovery } from "../src/auth/recovery.js";
import { startServer, stopServer, serverLog } from "./lib/server.mjs";
import { waitMail, otpIn, resetLinkIn, clearOutbox } from "./lib/outbox.mjs";

const only = process.argv.slice(2).map((s) => s.toUpperCase());
const run = (part) => only.length === 0 || only.includes(part);
const results = [];
const D = "demo.example";
const PW = "mat-khau-thu-123";
const WEB = "http://localhost:5173";
const seedPw = process.env.SEED_USER_PASSWORD;
const seed = (k) => process.env[k].trim().toLowerCase();
const CLAIMS = { issuer: "nhahang-api", audience: "nhahang-web" };

function reporter(title) {
  let pass = 0, fail = 0;
  console.log(`\n== ${title} ==`);
  return {
    ok(cond, label, extra = "") { cond ? pass++ : fail++; console.log(`${cond ? "ĐẠT     " : "CHƯA ĐẠT"} ${label}${extra !== "" ? ` — ${extra}` : ""}`); return cond; },
    get counts() { return { pass, fail }; },
  };
}

// Gửi request như curl: không tự gắn gì ngoài những gì truyền vào.
async function api(method, path, { body, token, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (token) init.headers.authorization = `Bearer ${token}`;
  if (body !== undefined) { init.headers["content-type"] = "application/json"; init.body = JSON.stringify(body); }
  const res = await fetch(process.env.BASE_URL + path, init);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, text, json, ok: json?.ok, data: json?.data, code: json?.error?.code };
}
const post = (path, body, token) => api("POST", path, { body, token });
const clearIp = () => prisma.rateLimit.deleteMany({ where: { key: { contains: ":ip:" } } });
const demoUser = async (name, extra = {}) => prisma.user.create({ data: { email: `${name}@${D}`, emailInput: `${name}@${D}`, passwordHash: await hashPassword(PW), status: "active", emailVerifiedAt: new Date(), ...extra } });
const row = (id) => prisma.user.findUnique({ where: { id } });
const loginToken = async (email, password = PW) => {
  const res = await post("/api/auth/login", { email, password });
  if (!res.data?.accessToken) throw new Error(`Không đăng nhập được (${res.status} ${res.code})`);
  return res.data.accessToken;
};
const totp = (secret, offset = 0) => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30, algorithm: "SHA1" }).generate({ timestamp: Date.now() + offset * 30_000 });
const clearMfa = (id) => prisma.rateLimit.deleteMany({ where: { key: `mfa-fail:user:${id}` } });
const clearStep = (id) => prisma.user.update({ where: { id }, data: { mfaLastStep: null } }); // chỉ để ca sau dùng được mã cùng bước
// Bật MFA qua đúng API. Mã của bước trước, để bước đăng nhập ngay sau đó dùng được mã của bước hiện tại.
async function enable(token) {
  const setup = await api("POST", "/api/auth/mfa/setup", { token });
  const confirm = await post("/api/auth/mfa/confirm", { code: totp(setup.data.secret, -1) }, token);
  return { secret: setup.data.secret, codes: confirm.data.recoveryCodes };
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

async function partA() {
  const r = reporter("A. CORS và verify JWT");
  const pre = await api("OPTIONS", "/api/dishes/1", { headers: { origin: WEB, "access-control-request-method": "PATCH", "access-control-request-headers": "authorization, content-type" } });
  const allowH = (pre.headers.get("access-control-allow-headers") ?? "").toLowerCase();
  r.ok(pre.status === 204, "Preflight OPTIONS thành công, không đòi token", pre.status);
  r.ok(pre.headers.get("access-control-allow-origin") === WEB, "Allow-Origin là origin cụ thể", pre.headers.get("access-control-allow-origin"));
  r.ok(allowH.includes("authorization"), "Allow-Headers có Authorization", allowH);
  r.ok((pre.headers.get("access-control-allow-methods") ?? "").includes("PATCH"), "Allow-Methods có PATCH");
  r.ok(!pre.headers.get("access-control-allow-credentials"), "Không bật credentials");
  const evil = await api("OPTIONS", "/api/dishes/1", { headers: { origin: "http://evil.example", "access-control-request-method": "PATCH" } });
  r.ok(!evil.headers.get("access-control-allow-origin"), "Origin lạ không nhận Allow-Origin");
  r.ok((await api("GET", "/api/dishes?pageSize=1", { headers: { origin: WEB } })).headers.get("access-control-expose-headers")?.includes("Retry-After"), "Expose Retry-After");

  const user = await demoUser("jwt");
  const token = await loginToken(user.email);
  const claims = jwt.decode(token);
  r.ok(JSON.stringify(Object.keys(claims).sort()) === JSON.stringify(["aud", "exp", "iat", "iss", "sub", "tv"]), "Payload chỉ có sub, tv, iat, exp, iss, aud", Object.keys(claims).join(","));
  r.ok(claims.exp - claims.iat === 1800, "Hạn 30 phút", claims.exp - claims.iat);
  const me = await api("GET", "/api/auth/me", { token });
  r.ok(me.status === 200 && me.data.id === user.id && me.data.role === "viewer" && !("passwordHash" in me.data) && !("tokenVersion" in me.data), "Token hợp lệ: /me trả đúng người, không lộ cột nhạy cảm");

  const expectDead = async (label, t, code = "UNAUTHENTICATED") => {
    const res = await api("GET", "/api/auth/me", { token: t });
    r.ok(res.status === 401 && res.ok === false && res.code === code, label, `${res.status} ${res.code}`);
  };
  r.ok((await api("GET", "/api/auth/me")).status === 401, "Không có header Authorization → 401");
  const none = await api("GET", "/api/auth/me", { headers: { authorization: `Basic ${token}` } });
  r.ok(none.status === 401, "Sai kiểu Authorization → 401");
  const [h, , s] = token.split(".");
  await expectDead("Sửa payload thành role admin, giữ chữ ký cũ → 401", `${h}.${b64({ ...claims, role: "admin" })}.${s}`);
  await expectDead("Sửa một ký tự ở chữ ký → 401", `${token.slice(0, -2)}${token.at(-2) === "A" ? "B" : "A"}${token.at(-1)}`);
  await expectDead("alg none → 401", `${b64({ alg: "none", typ: "JWT" })}.${b64(claims)}.`);
  const key = process.env.JWT_SECRET;
  await expectDead("HS512 cùng khoá → 401 (thuật toán cố định)", jwt.sign({ tv: 0 }, key, { algorithm: "HS512", subject: String(user.id), ...CLAIMS }));
  await expectDead("Khoá khác → 401", jwt.sign({ tv: 0 }, "khoa-khac-".repeat(5), { algorithm: "HS256", subject: String(user.id), ...CLAIMS }));
  await expectDead("Sai issuer → 401", jwt.sign({ tv: 0 }, key, { algorithm: "HS256", subject: String(user.id), issuer: "khac", audience: CLAIMS.audience }));
  await expectDead("Sai audience → 401", jwt.sign({ tv: 0 }, key, { algorithm: "HS256", subject: String(user.id), issuer: CLAIMS.issuer, audience: "khac" }));
  await expectDead("Token quá exp → 401 TOKEN_EXPIRED", jwt.sign({ tv: 0 }, key, { algorithm: "HS256", subject: String(user.id), ...CLAIMS, expiresIn: -10 }), "TOKEN_EXPIRED");
  await expectDead("Token quá exp nhưng sai chữ ký → UNAUTHENTICATED", jwt.sign({ tv: 0 }, "khoa-khac-".repeat(5), { algorithm: "HS256", subject: String(user.id), ...CLAIMS, expiresIn: -10 }));
  await expectDead("tv lệch tokenVersion → 401", jwt.sign({ tv: 7 }, key, { algorithm: "HS256", subject: String(user.id), ...CLAIMS, expiresIn: 600 }));
  await expectDead("sub không có user → 401", jwt.sign({ tv: 0 }, key, { algorithm: "HS256", subject: "999999", ...CLAIMS, expiresIn: 600 }));
  const forged = await api("GET", "/api/auth/me", { token: jwt.sign({ tv: 0, role: "admin" }, key, { algorithm: "HS256", subject: String(user.id), ...CLAIMS, expiresIn: 600 }) });
  r.ok(forged.data?.role === "viewer", "role trong payload bị bỏ qua, role đọc từ DB", forged.data?.role);
  await prisma.user.update({ where: { id: user.id }, data: { role: "editor" } });
  r.ok((await api("GET", "/api/auth/me", { token })).data.role === "editor", "Đổi role có hiệu lực ngay, không cần token mới");
  await prisma.user.update({ where: { id: user.id }, data: { status: "pending" } });
  await expectDead("Tài khoản không còn active → 401", token);
  results.push(r.counts);
}

async function partB() {
  const r = reporter("B. Đăng nhập, challenge MFA");
  await clearIp();
  const user = await demoUser("login");
  const email = user.email;
  const ok1 = await post("/api/auth/login", { email: email.toUpperCase(), password: PW });
  r.ok(ok1.status === 200 && ok1.ok && ok1.data.accessToken && ok1.data.expiresIn === 1800, "Đúng: trả accessToken (email chuẩn hoá)");
  r.ok(ok1.headers.get("cache-control") === "no-store", "Response có token: no-store");
  const wrong = await post("/api/auth/login", { email, password: "sai-mat-khau-1" });
  const absent = await post("/api/auth/login", { email: `khong-co@${D}`, password: "sai-mat-khau-1" });
  r.ok(wrong.status === 200 && wrong.ok === false && wrong.code === "INVALID_CREDENTIALS" && !wrong.data, "Sai password: 200, INVALID_CREDENTIALS, không có token");
  r.ok(wrong.json.error.message === absent.json.error.message && absent.code === "INVALID_CREDENTIALS", "Email không có: cùng mã, cùng câu");
  r.ok((await post("/api/auth/login", { email })).code === "VALIDATION_FAILED", "Thiếu password: VALIDATION_FAILED");
  r.ok((await post("/api/auth/login", { email: ["x"], password: { a: 1 } })).code === "VALIDATION_FAILED", "Sai kiểu dữ liệu: VALIDATION_FAILED, không 500");
  await prisma.rateLimit.deleteMany({ where: { key: { contains: email } } });

  const pending = await demoUser("pending", { status: "pending", emailVerifiedAt: null });
  const p = await post("/api/auth/login", { email: pending.email, password: PW });
  r.ok(p.status === 200 && p.ok === false && p.code === "ACCOUNT_NOT_ACTIVATED" && !p.text.includes("accessToken"), "Pending: ACCOUNT_NOT_ACTIVATED, không có accessToken", p.code);

  // Bộ đếm: 3 lần sai rồi bỏ CAPTCHA (slide 68).
  const brute = await demoUser("brute");
  for (let i = 1; i <= 3; i++) await post("/api/auth/login", { email: brute.email, password: "sai-mat-khau-1" });
  const keyB = `login-fail:email:${brute.email}`;
  const before = (await prisma.rateLimit.findUnique({ where: { key: keyB } })).count;
  const noCaptcha = await post("/api/auth/login", { email: brute.email, password: PW });
  r.ok(noCaptcha.status === 200 && noCaptcha.code === "CAPTCHA_REQUIRED" && !noCaptcha.text.includes("accessToken"), "Sai đến ngưỡng, bỏ CAPTCHA: CAPTCHA_REQUIRED, không có token dù password đúng", noCaptcha.code);
  r.ok((await prisma.rateLimit.findUnique({ where: { key: keyB } })).count === before, "Bỏ CAPTCHA không làm đổi bộ đếm");
  r.ok((await post("/api/auth/login", { email: brute.email, password: "sai-mat-khau-1", captchaToken: "x" })).code === "INVALID_CREDENTIALS", "CAPTCHA qua, password sai: vẫn tăng bộ đếm");
  for (let i = 0; i < 5; i++) await post("/api/auth/login", { email: brute.email, password: "sai-mat-khau-1", captchaToken: "x" });
  const tenth = await post("/api/auth/login", { email: brute.email, password: "sai-mat-khau-1", captchaToken: "x" });
  r.ok(tenth.status === 429 && tenth.code === "RATE_LIMITED" && tenth.ok === false && tenth.headers.get("retry-after"), "Sai 10 lần: 429, RATE_LIMITED, Retry-After", tenth.status);
  const lockedOk = await post("/api/auth/login", { email: brute.email, password: PW, captchaToken: "x" });
  r.ok(lockedOk.status === 429 && !lockedOk.text.includes("accessToken"), "Đang khoá: password đúng vẫn 429");

  // MFA
  const mu = await demoUser("mfa");
  const { secret, codes } = await enable(await loginToken(mu.email));
  const step1 = await post("/api/auth/login", { email: mu.email, password: PW });
  r.ok(step1.ok && step1.data.next === "mfa" && step1.data.challenge && !step1.text.includes("accessToken"), "Đã bật MFA: next mfa, có challenge, không có accessToken");
  r.ok(step1.headers.get("cache-control") === "no-store", "Response có challenge: no-store");
  r.ok(step1.data.expiresIn === 300, "Challenge sống 5 phút", step1.data.expiresIn);
  const c = step1.data.challenge;
  const stored = await prisma.mfaChallenge.findFirst({ where: { userId: mu.id } });
  r.ok(stored && stored.tokenHash !== c && !stored.tokenHash.includes(c), "DB chỉ lưu hash của challenge");
  r.ok((await api("GET", "/api/auth/me", { token: c })).status === 401, "Challenge gửi tới /me bị từ chối");
  r.ok((await post("/api/dishes", {}, c)).status === 401, "Challenge gửi tới route dữ liệu bị từ chối");
  const fullToken = await loginToken(seed("SEED_VIEWER_EMAIL"), seedPw);
  r.ok((await post("/api/auth/mfa", { challenge: fullToken, code: totp(secret) })).status === 401, "Access token gửi tới /api/auth/mfa bị từ chối");
  r.ok((await post("/api/auth/mfa", { challenge: "khong-phai-challenge-thuc-1234567890", code: totp(secret) })).status === 401, "Challenge bịa → 401");
  const wrongOtp = await post("/api/auth/mfa", { challenge: c, code: "000000" === totp(secret) ? "111111" : "000000" });
  r.ok(wrongOtp.status === 200 && wrongOtp.code === "INVALID_OTP" && !wrongOtp.text.includes("accessToken"), "Sai mã: 200, INVALID_OTP, không có token");
  r.ok((await post("/api/auth/mfa", { challenge: c })).code === "VALIDATION_FAILED", "Thiếu mã: VALIDATION_FAILED");
  const used = totp(secret);
  const good = await post("/api/auth/mfa", { challenge: c, code: used });
  r.ok(good.ok && good.data.accessToken, "Đúng mã: có accessToken");
  r.ok((await api("GET", "/api/auth/me", { token: good.data.accessToken })).status === 200, "Token sau MFA dùng được");
  r.ok((await post("/api/auth/mfa", { challenge: c, code: totp(secret, 1) })).status === 401, "Challenge đã dùng → 401");
  const step2 = await post("/api/auth/login", { email: mu.email, password: PW });
  const replay = await post("/api/auth/mfa", { challenge: step2.data.challenge, code: used });
  r.ok(replay.code === "INVALID_OTP", "Mã TOTP đã dùng bị từ chối", replay.code);
  await clearMfa(mu.id);
  await prisma.mfaChallenge.updateMany({ where: { userId: mu.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
  r.ok((await post("/api/auth/mfa", { challenge: step2.data.challenge, code: totp(secret) })).status === 401, "Challenge hết hạn → 401");

  const step3 = await post("/api/auth/login", { email: mu.email, password: PW });
  const bad = totp(secret) === "000000" ? "111111" : "000000";
  let last;
  for (let i = 0; i < 5; i++) last = await post("/api/auth/mfa", { challenge: step3.data.challenge, code: bad });
  r.ok(last.status === 429 && last.code === "RATE_LIMITED" && last.headers.get("retry-after"), "Sai 5 lần: 429, Retry-After", last.status);
  const lockedGood = await post("/api/auth/mfa", { challenge: step3.data.challenge, code: totp(secret, 1) });
  r.ok(lockedGood.status === 429 && !lockedGood.text.includes("accessToken"), "Đang khoá: mã đúng vẫn 429");
  await clearMfa(mu.id);

  const step4 = await post("/api/auth/login", { email: mu.email, password: PW });
  const rec = await post("/api/auth/mfa", { challenge: step4.data.challenge, recoveryCode: codes[0].toLowerCase().replace("-", "") });
  r.ok(rec.ok && rec.data.accessToken && rec.data.recoveryRemaining === 9, "Recovery code (viết thường, thiếu gạch): có token, còn 9 mã", rec.data?.recoveryRemaining);
  const usedRow = await prisma.recoveryCode.findUnique({ where: { codeHash: hashRecovery(codes[0]) } });
  r.ok(Boolean(usedRow.usedAt), "DB: usedAt có giá trị");
  const step5 = await post("/api/auth/login", { email: mu.email, password: PW });
  const again = await post("/api/auth/mfa", { challenge: step5.data.challenge, recoveryCode: codes[0] });
  r.ok(again.code === "INVALID_OTP" && !again.text.includes("accessToken"), "Recovery code dùng lần hai bị từ chối");
  await clearMfa(mu.id);
  await clearStep(mu.id);

  // Hostname ngoài danh sách: Google trả success nhưng server vẫn từ chối → INVALID_CAPTCHA (slide 37).
  await stopServer();
  await startServer({ MAIL_TRANSPORT: "file", WEB_ORIGIN: WEB, RECAPTCHA_HOSTNAMES: "chi-nhan-ten-nay.example" });
  const hu = await demoUser("host");
  for (let i = 1; i <= 3; i++) await post("/api/auth/login", { email: hu.email, password: "sai-mat-khau-1" });
  const badHost = await post("/api/auth/login", { email: hu.email, password: PW, captchaToken: "x" });
  r.ok(badHost.code === "INVALID_CAPTCHA" && !badHost.text.includes("accessToken"), "CAPTCHA sai: INVALID_CAPTCHA, không có token", badHost.code);
  await stopServer();
  await startServer({ MAIL_TRANSPORT: "file", WEB_ORIGIN: WEB });
  results.push(r.counts);
}

async function partC() {
  const r = reporter("C. Đăng ký, kích hoạt, quên mật khẩu");
  await clearIp();
  await clearOutbox();
  const email = `dangky@${D}`;
  const form = (extra = {}) => ({ email, username: "Người thử", password: PW, passwordConfirm: PW, captchaToken: "x", ...extra });
  const noCap = await post("/api/auth/register", { email, username: "Người thử", password: PW, passwordConfirm: PW });
  r.ok(noCap.code === "CAPTCHA_REQUIRED" && !(await prisma.user.findUnique({ where: { email } })), "Thiếu CAPTCHA: CAPTCHA_REQUIRED, không tạo user");
  r.ok((await post("/api/auth/register", form({ passwordConfirm: "khac-nhau-1" }))).code === "VALIDATION_FAILED", "Hai mật khẩu khác nhau: VALIDATION_FAILED");
  const first = await post("/api/auth/register", form({ role: "admin", chefId: 1, status: "active" }));
  let u = await prisma.user.findUnique({ where: { email } });
  r.ok(first.ok && u.role === "viewer" && u.status === "pending" && u.chefId === null, "role, status, chefId trong body bị bỏ qua", `${u.role} ${u.status}`);
  const mail1 = await waitMail(email, "activation");
  const code = otpIn(mail1);
  r.ok(Boolean(code) && !first.text.includes(code) && u.activation === undefined, "Mã chỉ đi qua email, không có trong response");
  const dbCode = await prisma.activationChallenge.findUnique({ where: { userId: u.id } });
  r.ok(dbCode.otpHash.length === 64 && dbCode.otpHash !== code, "DB chỉ lưu HMAC của mã");
  r.ok((await post("/api/auth/login", { email, password: PW })).code === "ACCOUNT_NOT_ACTIVATED", "Pending đăng nhập: ACCOUNT_NOT_ACTIVATED");

  const pendingAgain = await post("/api/auth/register", form({ password: "mat-khau-khac-9", passwordConfirm: "mat-khau-khac-9" }));
  r.ok((await prisma.user.findUnique({ where: { email } })).passwordHash === u.passwordHash, "Đăng ký lại khi pending: không ghi đè mật khẩu");
  const active = await demoUser("daco");
  const activeAgain = await post("/api/auth/register", form({ email: active.email }));
  const newOne = await post("/api/auth/register", form({ email: `moi@${D}` }));
  r.ok(first.text === pendingAgain.text && first.text === activeAgain.text && first.text === newOne.text, "Email mới, pending, active: cùng response");

  const bad = code === "000000" ? "111111" : "000000";
  const wrong = await post("/api/auth/activate", { email, otp: bad });
  r.ok(wrong.status === 200 && wrong.code === "INVALID_OTP", "Sai mã: INVALID_OTP");
  const good = await post("/api/auth/activate", { email, otp: code });
  r.ok(good.ok && !good.text.includes("accessToken"), "Kích hoạt đúng: không cấp token");
  u = await prisma.user.findUnique({ where: { email } });
  r.ok(u.status === "active" && Boolean(u.emailVerifiedAt), "DB: active, có emailVerifiedAt");
  r.ok((await post("/api/auth/activate", { email, otp: code })).code === "INVALID_OTP", "Mã đã dùng bị từ chối");
  const fresh = await post("/api/auth/login", { email, password: PW });
  r.ok(fresh.data?.accessToken, "Kích hoạt xong đăng nhập được");

  const resendEmail = `moi@${D}`;
  const cool = await post("/api/auth/activate/resend", { email: resendEmail });
  r.ok(cool.status === 429 && cool.headers.get("retry-after"), "Gửi lại trong 60 giây: 429, Retry-After", cool.status);
  await prisma.rateLimit.updateMany({ where: { key: `otp-cooldown:email:${resendEmail}` }, data: { windowStart: new Date(Date.now() - 120_000) } });
  r.ok((await post("/api/auth/activate/resend", { email: resendEmail })).ok, "Quá 60 giây gửi lại được");

  // Quên, đặt lại mật khẩu với tài khoản đã bật MFA.
  const mu = await demoUser("reset");
  const oldToken = await loginToken(mu.email);
  const { secret } = await enable(oldToken);
  await clearOutbox();
  const a = await post("/api/auth/forgot", { email: mu.email });
  const b = await post("/api/auth/forgot", { email: `khong-co@${D}` });
  r.ok(a.text === b.text && a.status === b.status, "Quên mật khẩu: email có và không có cùng response");
  const link = resetLinkIn(await waitMail(mu.email, "reset"));
  r.ok(link?.startsWith(`${WEB}/reset?token=`), "Link trong thư về trang của web");
  const token = new URL(link).searchParams.get("token");
  const before = await row(mu.id);
  r.ok((await post("/api/auth/reset", { token: "sai".repeat(10), password: "mat-khau-moi-456", passwordConfirm: "mat-khau-moi-456" })).code === "INVALID_RESET_TOKEN", "Token sai: INVALID_RESET_TOKEN");
  r.ok((await post("/api/auth/reset", { token, password: "ngan", passwordConfirm: "ngan" })).code === "VALIDATION_FAILED" && (await prisma.passwordReset.findFirst({ where: { userId: mu.id } })).usedAt === null, "Mật khẩu sai quy tắc: token chưa bị dùng");
  const pending2 = await post("/api/auth/login", { email: mu.email, password: PW });
  const done = await post("/api/auth/reset", { token, password: "mat-khau-moi-456", passwordConfirm: "mat-khau-moi-456", role: "admin" });
  const after = await row(mu.id);
  r.ok(done.ok && !done.text.includes("accessToken"), "Đặt lại xong: không cấp token");
  r.ok(after.mfaEnabled && after.mfaSecret === before.mfaSecret && after.role === "viewer", "Reset không tắt MFA, không đổi role");
  r.ok(after.tokenVersion === before.tokenVersion + 1, "tokenVersion tăng");
  r.ok((await api("GET", "/api/auth/me", { token: oldToken })).status === 401, "JWT cấp trước khi reset bị từ chối (plan 12.7)");
  r.ok((await post("/api/auth/mfa", { challenge: pending2.data.challenge, code: totp(secret, 1) })).status === 401, "Challenge đang chờ bị huỷ khi reset");
  r.ok((await post("/api/auth/reset", { token, password: "mat-khau-moi-789", passwordConfirm: "mat-khau-moi-789" })).code === "INVALID_RESET_TOKEN", "Token đã dùng bị từ chối");
  const relog = await post("/api/auth/login", { email: mu.email, password: "mat-khau-moi-456" });
  r.ok(relog.data?.next === "mfa" && !relog.text.includes("accessToken"), "Reset xong đăng nhập: vẫn qua MFA");
  results.push(r.counts);
}

async function partD() {
  const r = reporter("D. Quản lý MFA");
  await clearIp();
  const user = await demoUser("quanly");
  let token = await loginToken(user.email);
  for (const [m, p] of [["GET", "/status"], ["POST", "/setup"], ["POST", "/confirm"], ["POST", "/replace"], ["POST", "/recovery-codes"], ["POST", "/disable"]]) {
    r.ok((await api(m, `/api/auth/mfa${p}`, m === "POST" ? { body: {} } : {})).status === 401, `Không token ${m} /api/auth/mfa${p} → 401`);
  }
  r.ok((await api("GET", "/api/auth/mfa/setup", { token })).status !== 200, "GET không tạo secret");
  const setup = await api("POST", "/api/auth/mfa/setup", { token });
  const secret = setup.data.secret;
  r.ok(setup.ok && secret && setup.data.otpauthUri.startsWith("otpauth://totp/") && setup.data.qrDataUrl.startsWith("data:image/png;base64,"), "Setup trả secret, URI, QR");
  r.ok(setup.headers.get("cache-control") === "no-store", "Setup: no-store");
  let db = await row(user.id);
  r.ok(db.mfaPendingSecret && !db.mfaPendingSecret.includes(secret) && !db.mfaEnabled && db.mfaSecret === null, "DB: bản mã ở mfaPendingSecret, chưa bật");
  r.ok((await post("/api/auth/login", { email: user.email, password: PW })).data?.accessToken, "Chưa xác nhận: đăng nhập vẫn chưa cần MFA");
  const bad = totp(secret) === "000000" ? "111111" : "000000";
  r.ok((await post("/api/auth/mfa/confirm", { code: bad }, token)).code === "INVALID_OTP" && !(await row(user.id)).mfaEnabled, "Mã sai: INVALID_OTP, chưa bật");
  const conf = await post("/api/auth/mfa/confirm", { code: totp(secret, -1) }, token);
  r.ok(conf.ok && conf.data.recoveryCodes.length === 10 && conf.headers.get("cache-control") === "no-store", "Mã đúng: 10 recovery code, no-store");
  let codes = conf.data.recoveryCodes;
  db = await row(user.id);
  r.ok(db.mfaEnabled && db.mfaPendingSecret === null && !db.mfaSecret.includes(secret) && Number.isInteger(db.mfaLastStep), "DB: đã bật, secret là bản mã");
  const rows = await prisma.recoveryCode.findMany({ where: { userId: user.id } });
  r.ok(rows.length === 10 && rows.every((x) => x.codeHash.length === 64 && !codes.includes(x.codeHash)), "DB: 10 HMAC, không có mã gốc");
  const st = await api("GET", "/api/auth/mfa/status", { token });
  r.ok(st.data.enabled === true && st.data.remaining === 10 && !st.text.includes(secret), "Status không lộ secret");
  r.ok((await api("POST", "/api/auth/mfa/setup", { token })).code === "VALIDATION_FAILED", "Đang bật: không tạo secret mới");

  const wrongPw = await post("/api/auth/mfa/disable", { password: "sai-mat-khau-1", factor: codes[0] }, token);
  r.ok(wrongPw.status === 200 && wrongPw.code === "INVALID_OTP" && (await row(user.id)).mfaEnabled, "Sai password: 200 (không 401), không tắt");
  r.ok(!(await prisma.recoveryCode.findUnique({ where: { codeHash: hashRecovery(codes[0]) } })).usedAt, "Sai password không làm mất recovery code");
  r.ok((await post("/api/auth/mfa/disable", { password: PW, factor: bad }, token)).code === "INVALID_OTP", "Sai mã: không tắt");
  r.ok((await post("/api/auth/mfa/disable", { password: PW }, token)).code === "INVALID_OTP", "Thiếu yếu tố thứ hai: không tắt");
  await clearMfa(user.id);

  const regen = await post("/api/auth/mfa/recovery-codes", { password: PW, factor: codes[0] }, token);
  r.ok(regen.ok && regen.data.recoveryCodes.length === 10 && regen.headers.get("cache-control") === "no-store", "Tạo lại mã: 10 mã mới");
  r.ok(!(await prisma.recoveryCode.findUnique({ where: { codeHash: hashRecovery(codes[1]) } })), "Nhóm cũ vô hiệu");
  codes = regen.data.recoveryCodes;

  const replace = await post("/api/auth/mfa/replace", { password: PW, factor: codes[0] }, token);
  const newSecret = replace.data.secret;
  r.ok(replace.ok && newSecret && newSecret !== secret && replace.data.replacing === true, "Đổi thiết bị: secret chờ mới");
  db = await row(user.id);
  r.ok(db.mfaEnabled && db.mfaPendingSecret, "Trong lúc đổi: MFA vẫn bật, secret chờ riêng");
  const fin = await post("/api/auth/mfa/confirm", { code: totp(newSecret, 0) }, token);
  r.ok(fin.ok && fin.data.replaced === true && !fin.data.recoveryCodes, "Xác nhận thiết bị mới, giữ nhóm mã");

  await clearMfa(user.id);
  const off = await post("/api/auth/mfa/disable", { password: PW, factor: codes[1] }, token);
  db = await row(user.id);
  r.ok(off.ok && !db.mfaEnabled && db.mfaSecret === null && db.tokenVersion === 1, "Đúng password và mã: tắt, tokenVersion tăng");
  r.ok((await prisma.recoveryCode.count({ where: { userId: user.id } })) === 0, "Tắt xong xoá recovery code");
  r.ok((await api("GET", "/api/auth/me", { token })).status === 401, "JWT cũ hết hiệu lực sau khi tắt MFA");
  token = await loginToken(user.email);
  r.ok((await api("GET", "/api/auth/mfa/status", { token })).data.enabled === false, "Đăng nhập lại không cần MFA");

  const log = serverLog();
  r.ok(![PW, secret, newSecret, ...codes].some((v) => log.includes(v)), "Log server không chứa password, secret, recovery code");
  r.ok(!/eyJ[A-Za-z0-9_-]{10,}\./.test(log), "Log server không chứa JWT");
  results.push(r.counts);
}

async function cleanup() {
  await prisma.dish.deleteMany({ where: { name: { startsWith: "[TEST B9]" } } });
  await prisma.tag.deleteMany({ where: { name: { startsWith: "[TEST B9]" } } });
  await prisma.chef.deleteMany({ where: { name: { startsWith: "[TEST B9]" } } });
  await prisma.ingredient.deleteMany({ where: { name: { startsWith: "[TEST B9]" } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${D}` } } });
  await prisma.rateLimit.deleteMany({});
  await clearOutbox();
}

await cleanup();
await startServer({ MAIL_TRANSPORT: "file", WEB_ORIGIN: WEB });
let crashed = false;
try {
  for (const [k, fn] of Object.entries({ A: partA, B: partB, C: partC, D: partD })) if (run(k)) await fn();
} catch (e) {
  crashed = true;
  console.error(e);
} finally {
  await stopServer();
  await cleanup();
  await prisma.$disconnect();
}
const pass = results.reduce((s, x) => s + x.pass, 0), fail = results.reduce((s, x) => s + x.fail, 0);
console.log(`\nTỔNG: ${pass} ĐẠT, ${fail} CHƯA ĐẠT${crashed ? " (dừng giữa chừng vì lỗi)" : ""}`);
process.exit(fail || crashed ? 1 : 0);
