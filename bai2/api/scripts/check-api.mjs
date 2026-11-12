// Kiểm tra api của Bài 2 theo bảng nghiệm thu (slide 67, 68; plan mục 10.2). Tự chạy server thật ở cổng 3100.
//   node scripts/check-api.mjs        → mọi phần
//   node scripts/check-api.mjs B      → chỉ phần B
// A: CORS, verify JWT. B: đăng nhập, challenge MFA. C: đăng ký, kích hoạt, quên mật khẩu. D: quản lý MFA.
// E: token, RBAC, ABAC ở route dữ liệu. F: ai thấy món nháp; route công khai giữ kết quả như block7.
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
// Chờ tới khi ít nhất n promise đã xong (thành công hay thất bại), không chờ hết.
const afterN = (promises, n) => new Promise((done) => { let k = 0; const tick = () => { if (++k === n) done(); }; promises.forEach((p) => p.then(tick, tick)); });

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

  // Gửi đồng thời (plan 14 L1): 29 mã sai cùng lúc. Chỉ 5 lượt đầu được kiểm mã (4 báo INVALID_OTP, lượt thứ 5 khoá), 24 lượt
  // còn lại 429. Mã đúng gửi SAU KHI ít nhất 5 mã sai đã có phản hồi: lúc đó bộ đếm chắc chắn ≥ 5 nên mã đúng nhận lượt > 5 → 429.
  // Không dựa vào "gửi trễ 30 ms": khi pool kết nối lạnh, 30 request tới bước đếm gần như cùng lúc và thứ tự không theo thứ tự gửi
  // (tái hiện 12/11: mã đúng nhận lượt 2). Bản cũ (đọc bộ đếm, kiểm mã, rồi mới tăng) kiểm cả 30 mã và cấp token cho mã đúng.
  await clearIp();
  const near = [totp(secret, -1), totp(secret), totp(secret, 1)];
  const wrongCodes = [];
  for (let n = 0; wrongCodes.length < 29; n++) {
    const code = String(n).padStart(6, "0");
    if (!near.includes(code)) wrongCodes.push(code);
  }
  const burstLogin = await post("/api/auth/login", { email: mu.email, password: PW });
  const inFlight = wrongCodes.map((code) => post("/api/auth/mfa", { challenge: burstLogin.data.challenge, code }));
  await afterN(inFlight, 5);
  const burstGood = await post("/api/auth/mfa", { challenge: burstLogin.data.challenge, code: totp(secret, 1) });
  const burstWrong = await Promise.all(inFlight);
  const burstEvaluated = burstWrong.filter((x) => x.code === "INVALID_OTP").length;
  r.ok(burstGood.status === 429 && !burstGood.text.includes("accessToken"), "Gửi đồng thời: mã đúng gửi khi 5 mã sai đã có phản hồi → 429, không có token", burstGood.status);
  r.ok(burstEvaluated === 4 && burstWrong.every((x) => x.code === "INVALID_OTP" || x.status === 429), "Gửi đồng thời 29 mã sai: đúng 4 mã được kiểm (INVALID_OTP), còn lại 429", burstEvaluated);
  const burstRow = await prisma.rateLimit.findUnique({ where: { key: `mfa-fail:user:${mu.id}` } });
  r.ok(burstRow?.count === 30 && Boolean(burstRow.lockedUntil), "DB: bộ đếm ghi đủ 30 lượt và đang khoá", burstRow?.count);
  await clearMfa(mu.id);

  // Giới hạn theo IP (plan mục 4, thêm 12/11): đủ 30 lần gửi từ một IP trong 15 phút → 429 dù mã đúng, chặn trước bộ đếm theo user.
  await clearIp();
  const ipLogin = await post("/api/auth/login", { email: mu.email, password: PW });
  await post("/api/auth/mfa", { challenge: ipLogin.data.challenge, code: wrongCodes[0] });
  await clearMfa(mu.id);
  await prisma.rateLimit.updateMany({ where: { key: { startsWith: "mfa:ip:" } }, data: { count: 30 } }); // giả lập 30 lần gửi trước đó
  const ipGood = await post("/api/auth/mfa", { challenge: ipLogin.data.challenge, code: totp(secret, 1) });
  r.ok(ipGood.status === 429 && ipGood.code === "RATE_LIMITED" && ipGood.headers.get("retry-after") && !ipGood.text.includes("accessToken"), "Đủ 30 lần từ một IP: mã đúng vẫn 429", ipGood.status);
  r.ok((await prisma.rateLimit.count({ where: { key: `mfa-fail:user:${mu.id}` } })) === 0, "Bị chặn theo IP thì chưa tới bộ đếm theo user");
  await clearIp();
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

const T = "[TEST B9]";
async function snapshot() {
  const [row] = await prisma.$queryRaw`SELECT
    (SELECT md5(string_agg(d::text, ',' ORDER BY d.id)) FROM dishes d) dishes, (SELECT md5(string_agg(c::text, ',' ORDER BY c.id)) FROM chefs c) chefs,
    (SELECT md5(string_agg(i::text, ',' ORDER BY i.id)) FROM ingredients i) ingredients, (SELECT count(*)::int FROM tags) tags,
    (SELECT count(*)::int FROM dish_tags) dt, (SELECT count(*)::int FROM dish_ingredients) di`;
  return JSON.stringify(row);
}
const tokens = async () => ({
  viewer: await loginToken(seed("SEED_VIEWER_EMAIL"), seedPw), editorA: await loginToken(seed("SEED_EDITOR_A_EMAIL"), seedPw),
  editorB: await loginToken(seed("SEED_EDITOR_B_EMAIL"), seedPw), admin: await loginToken(seed("SEED_ADMIN_EMAIL"), seedPw),
});

async function partE() {
  const r = reporter("E. Token, RBAC, ABAC ở route dữ liệu");
  await clearIp();
  const t = await tokens();
  const A = await prisma.user.findUnique({ where: { email: seed("SEED_EDITOR_A_EMAIL") } });
  const B = await prisma.user.findUnique({ where: { email: seed("SEED_EDITOR_B_EMAIL") } });
  const tagId = (await prisma.tag.findFirst({ where: { name: "Món nước" } })).id;
  const ingredientId = (await prisma.ingredient.findFirst({ orderBy: { id: "asc" } })).id;
  const form = (name, chefId, extra = {}) => ({ name, price: 50000, description: "mô tả", tagIds: [tagId], ingredientIds: [ingredientId], chefId, available: true, ...extra });
  const dish = (id) => prisma.dish.findUnique({ where: { id } });
  const before = await snapshot();

  const ROUTES = [["POST", "/api/dishes"], ["PATCH", "/api/dishes/1"], ["DELETE", "/api/dishes/1"], ["GET", "/api/admin/dishes"], ["GET", "/api/admin/dishes/1"],
    ...["chefs", "ingredients"].flatMap((x) => [["GET", `/api/${x}`], ["GET", `/api/${x}/1`], ["POST", `/api/${x}`], ["PATCH", `/api/${x}/1`], ["DELETE", `/api/${x}/1`]]), ["GET", "/api/tags"], ["POST", "/api/tags"]];
  for (const [m, p] of ROUTES) {
    const res = await api(m, p, m === "POST" || m === "PATCH" ? { body: { name: `${T} ghi` } } : {});
    r.ok(res.status === 401 && res.ok === false && res.code === "UNAUTHENTICATED", `Không token ${m} ${p} → 401`, res.status);
  }
  const broken = await fetch(`${process.env.BASE_URL}/api/dishes`, { method: "POST", headers: { "content-type": "application/json" }, body: "{hong" });
  r.ok(broken.status === 401, "Không token, body hỏng → 401 (cổng đứng trước jsonBody)", broken.status);
  const brokenOk = await fetch(`${process.env.BASE_URL}/api/dishes`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${t.viewer}` }, body: "{hong" });
  r.ok(brokenOk.status === 403, "Viewer, body hỏng → 403 (cổng quyền đứng trước jsonBody)", brokenOk.status);

  for (const [m, p] of ROUTES.filter(([m]) => m !== "GET")) {
    const res = await api(m, p, { token: t.viewer, ...(m === "DELETE" ? {} : { body: { name: `${T} ghi` } }) });
    r.ok(res.status === 403 && res.code === "FORBIDDEN", `Viewer ${m} ${p} → 403`, res.status);
  }
  for (const [m, p] of ROUTES.filter(([m]) => m === "GET")) r.ok((await api(m, p, { token: t.viewer })).status === 200, `Viewer ${m} ${p} → 200`);
  for (const p of ["/api/dishes/1", "/api/chefs/1", "/api/ingredients/1"]) {
    const res = await api("DELETE", p, { token: t.editorA });
    r.ok(res.status === 403, `Editor DELETE ${p} → 403`, res.status);
  }
  r.ok((await snapshot()) === before, "Dữ liệu không đổi sau mọi request bị chặn");

  try {
    let res = await post("/api/dishes", form(`${T} A tạo`, B.chefId, { status: "published", role: "admin" }), t.editorA);
    const id = res.data?.id;
    let d = await dish(id);
    r.ok(res.ok && d.chefId === A.chefId && d.status === "draft", "Editor tạo món: bỏ qua chefId, status trong body", `${d?.chefId} ${d?.status}`);
    res = await api("PATCH", `/api/dishes/${id}`, { token: t.editorA, body: { name: `${T} A sửa`, chefId: B.chefId, status: "published" } });
    d = await dish(id);
    r.ok(res.ok && d.name === `${T} A sửa` && d.chefId === A.chefId && d.status === "draft", "Editor sửa nháp của mình; chefId, status trong body bị bỏ qua");
    r.ok((await prisma.user.findUnique({ where: { id: A.id } })).role === "editor", "role trong body không nâng quyền");
    res = await api("PATCH", `/api/dishes/${id}`, { token: t.editorA, body: { tagIds: [tagId] } });
    r.ok(res.ok, "PATCH chỉ có tagIds vẫn chạy được");

    const snap = await snapshot();
    res = await api("PATCH", `/api/dishes/${id}`, { token: t.editorB, body: { name: `${T} B sửa` } });
    r.ok(res.status === 403 && res.code === "FORBIDDEN", "Editor B sửa món của A → 403", res.status);
    const pub = await prisma.dish.findFirst({ where: { chefId: A.chefId, status: "published" } });
    res = await api("PATCH", `/api/dishes/${pub.id}`, { token: t.editorA, body: { name: `${T} sửa published` } });
    r.ok(res.status === 403, "Editor A sửa món published của mình → 403", res.status);
    res = await api("PATCH", `/api/dishes/${pub.id}`, { token: t.editorA, body: { available: false } });
    r.ok(res.status === 403, "Editor A đổi Tạm hết món published → 403 (12.4)", res.status);
    r.ok((await snapshot()) === snap, "Dữ liệu không đổi");

    res = await api("PATCH", `/api/dishes/${id}`, { token: t.admin, body: { status: "published" } });
    r.ok(res.ok && (await dish(id)).status === "published", "Admin xuất bản");
    res = await api("PATCH", `/api/dishes/${id}`, { token: t.editorA, body: { name: `${T} sau xuất bản` } });
    r.ok(res.status === 403 && (await dish(id)).name === `${T} A sửa`, "Đổi status xong, Editor gửi PATCH → 403, tên không đổi", res.status);
    await api("PATCH", `/api/dishes/${id}`, { token: t.admin, body: { status: "draft" } });
    await prisma.user.update({ where: { id: A.id }, data: { role: "viewer" } });
    res = await api("PATCH", `/api/dishes/${id}`, { token: t.editorA, body: { name: `${T} sau hạ role` } });
    await prisma.user.update({ where: { id: A.id }, data: { role: "editor" } });
    r.ok(res.status === 403 && (await dish(id)).name === `${T} A sửa`, "Hạ role, dùng token cũ → 403 vì role đọc từ DB", res.status);

    res = await api("PATCH", `/api/dishes/${id}`, { token: t.admin, body: { status: "khac" } });
    r.ok(res.code === "VALIDATION_FAILED" && res.json.error.fields.status, "Status lạ: VALIDATION_FAILED");
    res = await api("PATCH", `/api/dishes/${id}`, { token: t.admin, body: { chefId: B.chefId } });
    r.ok(res.ok && (await dish(id)).chefId === B.chefId, "Admin đổi chefId");
    res = await post("/api/dishes", form(`${T} admin tạo`, A.chefId), t.admin);
    r.ok(res.ok && (await dish(res.data.id)).status === "published", "Admin tạo món, không chọn status: published");

    const noChef = await demoUser("editor-rong", { role: "editor" });
    const noChefToken = await loginToken(noChef.email);
    r.ok((await post("/api/dishes", form(`${T} rỗng`, A.chefId), noChefToken)).status === 403, "Editor chưa gắn đầu bếp không tạo được món");
    r.ok((await api("PATCH", `/api/dishes/${id}`, { token: noChefToken, body: { name: `${T} rỗng` } })).status === 403, "Editor chưa gắn đầu bếp không khớp món nào");

    r.ok((await api("PATCH", "/api/dishes/999999", { token: t.editorA, body: { name: "x" } })).code === "NOT_FOUND", "Món không có: NOT_FOUND");
    res = await post("/api/chefs", { name: `${T} Đầu bếp`, tagIds: [tagId] }, t.editorA);
    r.ok(res.ok, "Editor thêm đầu bếp được (12.3)", res.code ?? "");
    res = await post("/api/tags", { name: `${T} tag` }, t.editorA);
    r.ok(res.ok, "Editor thêm tag được (12.3)");
    res = await api("DELETE", `/api/dishes/${id}`, { token: t.admin });
    r.ok(res.ok && !(await dish(id)), "Admin xoá món");
  } finally {
    await prisma.user.update({ where: { id: A.id }, data: { role: "editor" } });
    await prisma.dish.deleteMany({ where: { name: { startsWith: T } } });
    await prisma.tag.deleteMany({ where: { name: { startsWith: T } } });
    await prisma.chef.deleteMany({ where: { name: { startsWith: T } } });
  }
  results.push(r.counts);
}

async function partF() {
  const r = reporter("F. Ai thấy món nháp; route công khai như block7");
  await clearIp();
  const t = await tokens();
  const drafts = await prisma.dish.findMany({ where: { status: "draft" }, orderBy: { id: "asc" } });
  const [A] = [await prisma.user.findUnique({ where: { email: seed("SEED_EDITOR_A_EMAIL") } })];
  const draftA = drafts.find((d) => d.chefId === A.chefId), draftB = drafts.find((d) => d.chefId !== A.chefId);
  r.ok(drafts.length === 6 && drafts.every((d) => d.id > 1200), "6 món nháp nằm sau 1.200 món", drafts.length);

  const list = await api("GET", "/api/dishes?pageSize=100&page=12");
  const published = await prisma.dish.count({ where: { status: "published" } });
  r.ok(list.status === 200 && list.data.total === published && published === 1200, "Không token: total đúng 1.200 như block7", list.data.total);
  r.ok(list.data.items.every((d) => d.id <= 1200 && !("status" in d) && !("canEdit" in d)), "Trang cuối chỉ có món gốc, response không có status, canEdit");
  r.ok(list.data.items.at(-1).id === 1200 && list.data.items.length === 100, "Trang 12 kết thúc đúng ở id 1200");
  const garbage = await api("GET", "/api/dishes?pageSize=1", { headers: { authorization: "Bearer rac" } });
  r.ok(garbage.status === 200, "Route công khai không đọc token: token rác vẫn 200");
  const tokenView = await api("GET", "/api/dishes?pageSize=100&page=12", { token: t.admin });
  r.ok(tokenView.data.total === 1200, "Admin gửi token tới route công khai cũng không thấy nháp");

  for (const [label, q] of [["cơ bản", `q=${encodeURIComponent(draftA.name)}`], ["nâng cao", `mode=advanced&q=${encodeURIComponent(draftA.name)}`], ["toàn văn", `mode=fulltext&q=${encodeURIComponent(draftA.name)}`], ["gần đúng", `mode=fuzzy&q=${encodeURIComponent(draftA.name)}`]]) {
    const res = await api("GET", `/api/dishes?${q}&pageSize=100`);
    r.ok(res.ok && !res.data.items.some((d) => d.id > 1200), `Tìm ${label} không ra món nháp`, res.data.total);
  }
  const ing = await prisma.dishIngredient.findFirst({ where: { dishId: draftA.id }, include: { ingredient: true } });
  const byIng = await api("GET", `/api/dishes?mode=fuzzy&by=ingredient&q=${encodeURIComponent(ing.ingredient.name)}&pageSize=100`);
  r.ok(byIng.ok && !byIng.data.items.some((d) => d.id > 1200), "Tìm gần đúng theo nguyên liệu không ra món nháp");
  const chefName = (await prisma.chef.findUnique({ where: { id: A.chefId } })).name;
  const [{ n }] = await prisma.$queryRaw`SELECT count(*)::int n FROM dishes d JOIN chefs c ON c.id = d."chefId" WHERE c.name = ${chefName} AND d.status = 'published'`;
  const byChef = await api("GET", `/api/dishes?mode=fuzzy&by=chef&q=${encodeURIComponent(chefName)}&pageSize=100`);
  r.ok(byChef.ok && !byChef.data.items.some((d) => d.id > 1200) && byChef.data.total >= n, "Tìm gần đúng theo đầu bếp không ra món nháp", byChef.data.total);
  const q = "Phở";
  const [{ c }] = await prisma.$queryRaw`SELECT count(*)::int c FROM dishes WHERE name ILIKE ${`%${q}%`} AND status = 'published'`;
  r.ok((await api("GET", `/api/dishes?q=${encodeURIComponent(q)}`)).data.total === c, "Tìm cơ bản: total khớp SQL viết tay", c);
  r.ok((await api("GET", `/api/dishes/${draftA.id}`)).code === "NOT_FOUND", "URL món nháp ở route công khai: NOT_FOUND");
  const one = await api("GET", "/api/dishes/1");
  r.ok(one.ok && !("status" in one.data) && one.data.chef && Array.isArray(one.data.ingredients), "Chi tiết công khai giữ dạng block7, không có status");

  const withTags = await api("GET", "/api/dishes?pageSize=1&include=tags");
  r.ok(withTags.ok && withTags.data.tags.length === 16 && withTags.data.tags.every((x) => typeof x.dishCount === "number"), "include=tags trả 16 tag");
  const tn = withTags.data.tags.find((x) => x.name === "Món nước");
  const [{ m }] = await prisma.$queryRaw`SELECT count(*)::int m FROM dish_tags dt JOIN dishes d ON d.id = dt."dishId" JOIN tags t ON t.id = dt."tagId" WHERE t.name = 'Món nước' AND d.status = 'published'`;
  r.ok(tn.dishCount === m, "Số món theo tag chỉ đếm published", tn.dishCount);
  r.ok(!("tags" in (await api("GET", "/api/dishes?pageSize=1")).data), "Không có include: response giữ nguyên");
  r.ok((await api("GET", "/api/dishes?include=abc")).code === "VALIDATION_FAILED", "include lạ: VALIDATION_FAILED");

  const adminList = (who, extra = "") => api("GET", `/api/admin/dishes?pageSize=100${extra}`, { token: t[who] });
  r.ok((await adminList("viewer")).data.total === 1200, "Viewer ở quản trị: 1.200 món");
  r.ok((await adminList("viewer", "&status=draft")).data.total === 0, "Viewer lọc Nháp: 0 món");
  const ea = await adminList("editorA", "&status=draft");
  r.ok(ea.data.total === 3 && ea.data.items.every((d) => d.chefId === A.chefId && d.status === "draft" && d.canEdit === true), "Editor A lọc Nháp: 3 món của mình, canEdit", ea.data.total);
  r.ok((await adminList("editorA")).data.total === 1203, "Editor A: 1.200 + 3 nháp");
  const ad = await adminList("admin", "&status=draft");
  r.ok(ad.data.total === 6 && ad.data.items.every((d) => d.canEdit), "Admin lọc Nháp: 6 món", ad.data.total);
  r.ok((await adminList("admin")).data.total === 1206, "Admin: 1.206 món");
  r.ok((await adminList("admin", "&status=abc")).code === "VALIDATION_FAILED", "Bộ lọc status lạ: VALIDATION_FAILED");
  const v = await adminList("viewer");
  r.ok(v.data.items.every((d) => d.canEdit === false), "Viewer: canEdit false ở mọi món");
  const ftA = await api("GET", `/api/admin/dishes?mode=fulltext&q=${encodeURIComponent(draftB.name)}&pageSize=100`, { token: t.editorA });
  r.ok(ftA.ok && !ftA.data.items.some((d) => d.id === draftB.id), "Editor A tìm toàn văn không ra nháp của B");
  const fzB = await api("GET", `/api/admin/dishes?mode=fuzzy&q=${encodeURIComponent(draftB.name)}&pageSize=100`, { token: t.admin });
  r.ok(fzB.ok && fzB.data.items.some((d) => d.id === draftB.id), "Admin tìm gần đúng ra món nháp");

  r.ok((await api("GET", `/api/admin/dishes/${draftA.id}`, { token: t.viewer })).status === 403, "Viewer mở nháp ở quản trị → 403");
  r.ok((await api("GET", `/api/admin/dishes/${draftB.id}`, { token: t.editorA })).status === 403, "Editor A mở nháp của B → 403");
  const okA = await api("GET", `/api/admin/dishes/${draftA.id}`, { token: t.editorA });
  r.ok(okA.ok && okA.data.status === "draft" && okA.data.canEdit === true, "Editor A mở nháp của mình, canEdit true");
  r.ok((await api("GET", "/api/admin/dishes/1", { token: t.admin })).data.canEdit === true, "Admin: canEdit true");
  const chefV = await api("GET", `/api/chefs/${A.chefId}`, { token: t.viewer });
  r.ok(chefV.ok && !chefV.data.dishes.some((d) => d.id > 1200), "Chi tiết đầu bếp không lộ tên món nháp cho Viewer");
  const chefA = await api("GET", `/api/chefs/${A.chefId}`, { token: t.editorA });
  r.ok(chefA.data.dishes.some((d) => d.id === draftA.id), "Editor của món thấy món nháp ở chi tiết đầu bếp");
  const ingV = await api("GET", `/api/ingredients/${ing.ingredientId}`, { token: t.viewer });
  r.ok(ingV.ok && !ingV.data.dishes.some((d) => d.id > 1200), "Chi tiết nguyên liệu không lộ tên món nháp cho Viewer");
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
  for (const [k, fn] of Object.entries({ A: partA, B: partB, C: partC, D: partD, E: partE, F: partF })) if (run(k)) await fn();
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
