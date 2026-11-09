// Kiểm tra MFA theo bảng nghiệm thu Bài 1 (slide 57; plan mục 10.1). Script tự chạy server thật ở cổng 3100.
//   node scripts/check-mfa.mjs        → mọi phần
//   node scripts/check-mfa.mjs B      → chỉ phần B
// A: thiết lập. B: đăng nhập có MFA. C: recovery code. D: xác thực lại để thay, tắt MFA, tạo lại mã.
// Dùng tài khoản seed viewer; mọi cột MFA được đặt lại ở cuối, secret lấy từ chính trang thiết lập.
import "./lib/test-env.mjs";
import * as OTPAuth from "otpauth";
import { prisma } from "../src/db.js";
import { client, reporter } from "./lib/client.mjs";
import { login } from "./lib/auth.mjs";
import { startServer, stopServer, serverLog } from "./lib/server.mjs";
import { generateToken, sha256 } from "../src/auth/secrets.js";

const only = process.argv.slice(2).map((s) => s.toUpperCase());
const run = (part) => only.length === 0 || only.includes(part);
const results = [];

const email = process.env.SEED_VIEWER_EMAIL.trim().toLowerCase();
const password = process.env.SEED_USER_PASSWORD;
const userRow = () => prisma.user.findUnique({ where: { email } });
const totpFor = (secret, offset = 0) => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30, algorithm: "SHA1" }).generate({ timestamp: Date.now() + offset * 30_000 });
const clearMfaCounter = async (id) => prisma.rateLimit.deleteMany({ where: { key: `mfa-fail:user:${id}` } });
// Chỉ dùng trong kiểm thử: cho phép dùng mã của cùng bước ở ca sau mà không phải chờ 30 giây.
const clearLastStep = (id) => prisma.user.update({ where: { id }, data: { mfaLastStep: null } });

async function resetMfa() {
  const u = await userRow();
  await prisma.recoveryCode.deleteMany({ where: { userId: u.id } });
  await prisma.user.update({ where: { id: u.id }, data: { mfaEnabled: false, mfaSecret: null, mfaPendingSecret: null, mfaLastStep: null } });
  await clearMfaCounter(u.id);
}

// Đăng nhập trang quản trị bằng password (chưa bật MFA).
async function signedIn() {
  const c = client();
  const res = await login(c, email, password);
  if (res.status !== 303) throw new Error(`Không đăng nhập được (status ${res.status})`);
  await c.get("/admin/profile");
  return c;
}
const secretOnPage = (text) => text.match(/class="mfa-secret">([^<]+)</)?.[1].replace(/\s/g, "") ?? null;
const codesOnPage = (text) => [...text.matchAll(/<code>([A-Z2-7]{5}-[A-Z2-7]{5})<\/code>/g)].map((m) => m[1]);

// Bật MFA qua đúng các trang của người dùng; trả về secret và recovery code.
async function enable(c) {
  await c.get("/admin/profile");
  await c.post("/admin/profile/mfa/setup");
  const page = await c.get("/admin/profile/mfa/setup");
  const secret = secretOnPage(page.text);
  const res = await c.post("/admin/profile/mfa/setup/confirm", [["otp", totpFor(secret)]]);
  const codes = codesOnPage((await c.get("/admin/profile/mfa/codes")).text);
  return { secret, codes, status: res.status };
}

async function partA() {
  const r = reporter("A. Thiết lập MFA");
  await resetMfa();
  const c = await signedIn();
  const start = await userRow();

  let res = await c.get("/admin/profile/mfa/setup");
  r.ok(res.status === 303 && (await userRow()).mfaPendingSecret === null, "GET trang thiết lập không tạo secret (GET không đổi dữ liệu)", res.status);
  r.ok((await c.get("/admin/profile")).text.includes("Chưa bật"), "Hồ sơ hiện Chưa bật");

  await c.get("/admin/profile");
  res = await c.post("/admin/profile/mfa/setup");
  r.ok(res.status === 303, "POST bắt đầu thiết lập → 303", res.status);
  const page = await c.get("/admin/profile/mfa/setup");
  const secret = secretOnPage(page.text);
  r.ok(page.status === 200 && Boolean(secret) && page.text.includes("data:image/png;base64,"), "Trang thiết lập có QR và chuỗi nhập tay");
  r.ok(page.headers.get("cache-control") === "no-store", "Trang thiết lập không lưu cache", page.headers.get("cache-control"));
  let u = await userRow();
  r.ok(u.mfaPendingSecret && !u.mfaPendingSecret.includes(secret) && u.mfaEnabled === false && u.mfaSecret === null, "DB chỉ có bản mã ở mfaPendingSecret, MFA chưa bật");

  res = await c.post("/admin/profile/mfa/setup/confirm", [["otp", "000000"]]);
  u = await userRow();
  r.ok(res.text.includes('data-error-code="INVALID_OTP"') && u.mfaEnabled === false, "Mã sai: báo INVALID_OTP, MFA chưa bật");

  res = await c.post("/admin/profile/mfa/setup/confirm", [["otp", totpFor(secret)]]);
  u = await userRow();
  r.ok(res.status === 303 && res.location === "/admin/profile/mfa/codes", "Mã đúng → 303 sang trang mã khôi phục", `${res.status} ${res.location}`);
  r.ok(u.mfaEnabled && u.mfaSecret && u.mfaPendingSecret === null && !u.mfaSecret.includes(secret) && Number.isInteger(u.mfaLastStep), "DB: đã bật, secret là bản mã, đã ghi bước đã dùng");

  const rows = await prisma.recoveryCode.findMany({ where: { userId: u.id } });
  const sessions = await prisma.$queryRaw`SELECT data::text AS t FROM sessions WHERE "userId" = ${u.id}`;
  res = await c.get("/admin/profile/mfa/codes");
  const codes = codesOnPage(res.text);
  r.ok(res.status === 200 && codes.length === 10 && rows.length === 10, "Hiện 10 mã, DB có 10 bản ghi", codes.length);
  r.ok(res.headers.get("cache-control") === "no-store", "Trang mã không lưu cache");
  r.ok(rows.every((row) => /^[0-9a-f]{64}$/.test(row.codeHash) && !codes.includes(row.codeHash) && row.usedAt === null), "DB chỉ có HMAC, chưa dùng");
  r.ok(!sessions.some((s) => codes.some((code) => s.t.includes(code))), "Bảng sessions không chứa mã gốc");

  res = await c.get("/admin/profile/mfa/codes");
  r.ok(res.status === 303 && (res.location ?? "").includes("mfa-codes-gone"), "Mở lại trang mã: không hiện lại", res.location);
  r.ok(!serverLog().includes(secret) && !codes.some((code) => serverLog().includes(code)), "Log server không chứa secret, recovery code");

  // Đã bật: không ghi đè bằng đường thiết lập, không hiện lại secret.
  await c.get("/admin/profile");
  const before = (await userRow()).mfaPendingSecret;
  res = await c.post("/admin/profile/mfa/setup");
  r.ok((await userRow()).mfaPendingSecret === before, "Đang bật: POST thiết lập không tạo secret mới");
  res = await c.get("/admin/profile/mfa/setup");
  r.ok(res.status === 303 && !(res.text ?? "").includes(secret), "Đang bật: không hiện lại secret", res.status);
  r.ok((await c.get("/admin/profile")).text.includes("Đã bật"), "Hồ sơ hiện Đã bật");
  r.ok(start.id === u.id, "Cùng một tài khoản");
  results.push(r.counts);
}

// Đăng nhập password, dừng ở bước MFA. `next` như form đăng nhập gửi kèm.
async function pendingLogin(next = "") {
  const c = client();
  await c.get("/login");
  const res = await c.post("/login", [["email", email], ["password", password], ...(next ? [["next", next]] : [])]);
  return { c, res };
}
const errorCode = (res) => res.text.match(/data-error-code="([A-Z_]+)"/)?.[1] ?? null;

async function partB() {
  const r = reporter("B. Đăng nhập có MFA");
  await resetMfa();
  const setup = await signedIn();
  const { secret } = await enable(setup);
  const u = await userRow();
  await prisma.session.deleteMany({ where: { userId: u.id } });

  const { c, res } = await pendingLogin();
  r.ok(res.status === 303 && res.location === "/login/mfa", "Password đúng, đã bật MFA → 303 /login/mfa", `${res.status} ${res.location}`);
  const sidAfterPassword = c.jar.get("sid");
  const [row] = await prisma.$queryRaw`SELECT data FROM sessions WHERE "userId" = ${u.id}`;
  r.ok(row && row.data.mfaPending?.userId === u.id && row.data.userId === undefined, "Bản ghi phiên chỉ có mfaPending, không có userId");
  for (const path of ["/admin", "/admin/dishes", "/admin/chefs/new", "/admin/profile", "/admin/profile/mfa/setup"]) {
    const a = await c.get(path);
    r.ok(a.status === 303 && (a.location ?? "").includes("/login"), `Phiên chờ MFA không vào được ${path}`, `${a.status} ${a.location}`);
  }
  const mfaPage = await c.get("/login/mfa");
  r.ok(mfaPage.status === 200, "Trang nhập mã mở được bằng phiên chờ");
  const write = await c.post("/admin/dishes/1?_method=DELETE", []);
  r.ok(write.status === 303 && (write.location ?? "").includes("/login"), "Phiên chờ gửi ghi → /login, không ghi được", write.status);
  await c.get("/login/mfa");

  let a = await c.post("/login/mfa", [["otp", "000000"]]);
  r.ok(a.status === 200 && errorCode(a) === "INVALID_OTP", "Mã sai: INVALID_OTP, vẫn ở bước MFA", errorCode(a));
  const code = totpFor(secret, 1); // bước kế tiếp: mã lúc bật MFA đã bị đánh dấu dùng rồi
  a = await c.post("/login/mfa", [["otp", code]]);
  r.ok(a.status === 303 && a.location === "/admin/dishes", "Mã đúng → 303 vào quản trị", `${a.status} ${a.location}`);
  r.ok(c.jar.get("sid") !== sidAfterPassword, "sid đổi khi qua bước MFA");
  r.ok((await c.get("/admin/dishes")).status === 200, "Phiên đầy đủ vào được quản trị");

  // Dùng lại mã đã chấp nhận (cùng cửa sổ).
  const second = await pendingLogin();
  await second.c.get("/login/mfa");
  a = await second.c.post("/login/mfa", [["otp", code]]);
  r.ok(a.status === 200 && errorCode(a) === "INVALID_OTP", "Dùng lại mã vừa được chấp nhận → từ chối", `${a.status} ${errorCode(a)}`);

  // Giữ trang đang mở qua bước MFA.
  await clearLastStep(u.id);
  const withNext = await pendingLogin("/admin/chefs");
  await withNext.c.get("/login/mfa");
  a = await withNext.c.post("/login/mfa", [["otp", totpFor(secret)]]);
  r.ok(a.status === 303 && a.location === "/admin/chefs", "Sau MFA về đúng trang đang mở", a.location);

  // Giới hạn thử: chung bộ đếm OTP và recovery code; đạt ngưỡng thì 429 dù mã đúng.
  await clearLastStep(u.id);
  await clearMfaCounter(u.id);
  const lock = await pendingLogin();
  await lock.c.get("/login/mfa");
  let last;
  for (let i = 0; i < 4; i++) last = await lock.c.post("/login/mfa", [["otp", "000000"]]);
  r.ok(last.status === 200, "Sai 4 lần: vẫn được thử", last.status);
  await lock.c.get("/login/mfa/recovery");
  last = await lock.c.post("/login/mfa/recovery", [["code", "AAAAA-AAAAA"]]);
  r.ok(last.status === 429 && errorCode(last) === "RATE_LIMITED", "Lần sai thứ 5 (recovery code, chung bộ đếm) → 429", last.status);
  r.ok(Boolean(last.headers.get("retry-after")), "429 có Retry-After");
  await lock.c.get("/login/mfa/recovery");
  last = await lock.c.post("/login/mfa", [["otp", totpFor(secret)]]);
  r.ok(last.status === 429, "Đang khoá: mã đúng vẫn 429", last.status);
  const lockedPage = await lock.c.get("/login/mfa");
  r.ok(lockedPage.status === 200, "Đang khoá vẫn xem được trang");
  await clearMfaCounter(u.id);

  // Huỷ, hết hạn.
  const cancel = await pendingLogin();
  await cancel.c.get("/login/mfa");
  a = await cancel.c.post("/login/mfa/cancel");
  r.ok(a.status === 303 && a.location === "/login", "Huỷ → về đăng nhập", a.location);
  r.ok((await cancel.c.get("/login/mfa")).status === 303, "Huỷ xong không còn phiên chờ");

  await prisma.session.deleteMany({ where: { userId: u.id } });
  const old = await pendingLogin();
  await prisma.$executeRaw`UPDATE sessions SET data = jsonb_set(data, '{mfaPending,at}', to_jsonb((extract(epoch from now()) * 1000 - 360000)::bigint)) WHERE "userId" = ${u.id}`;
  a = await old.c.get("/login/mfa");
  r.ok(a.status === 303 && a.location === "/login?msg=mfa-expired", "Phiên chờ quá 5 phút → đăng nhập lại", a.location);

  // Reset password không tắt MFA, xoá cả phiên chờ, không tạo phiên.
  await prisma.session.deleteMany({ where: { userId: u.id } });
  const waiting = await pendingLogin();
  const token = generateToken();
  await prisma.passwordReset.create({ data: { userId: u.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 15 * 60_000) } });
  const resetter = client();
  const q = `/reset?token=${token}`;
  await resetter.get(q);
  const newPassword = `${password}-moi`;
  a = await resetter.post("/reset", [["token", token], ["password", newPassword], ["confirmPassword", newPassword], ["passwordConfirm", newPassword]]);
  r.ok(a.status === 303, "Reset password thành công", `${a.status} ${a.location}`);
  r.ok(resetter.jar.size === 0 || (await resetter.get("/admin/dishes")).status === 303, "Reset không tạo phiên đăng nhập");
  r.ok((await userRow()).mfaEnabled === true, "Reset không tắt MFA");
  const w = await waiting.c.get("/login/mfa");
  r.ok(w.status === 303, "Reset xoá cả phiên đang chờ MFA", w.status);
  const fresh = client();
  await fresh.get("/login");
  a = await fresh.post("/login", [["email", email], ["password", newPassword]]);
  r.ok(a.status === 303 && a.location === "/login/mfa", "Reset xong đăng nhập vẫn qua bước MFA", a.location);
  await prisma.user.update({ where: { id: u.id }, data: { passwordHash: u.passwordHash } });
  results.push(r.counts);
}

async function partC() {
  const r = reporter("C. Recovery code");
  await resetMfa();
  const setup = await signedIn();
  const { codes } = await enable(setup);
  const u = await userRow();
  const { c } = await pendingLogin();
  r.ok((await c.get("/login/mfa/recovery")).status === 200, "Trang nhập mã khôi phục mở bằng phiên chờ");
  let a = await c.post("/login/mfa/recovery", [["code", "AAAAA-AAAAA"]]);
  r.ok(a.status === 200 && errorCode(a) === "INVALID_OTP", "Mã không có thật: INVALID_OTP");
  a = await c.post("/login/mfa/recovery", [["code", codes[0]]]);
  r.ok(a.status === 303 && a.location === "/admin/profile?msg=mfa-recovery-used", "Mã đúng → về hồ sơ", a.location);
  const used = await prisma.recoveryCode.count({ where: { userId: u.id, usedAt: { not: null } } });
  r.ok(used === 1, "usedAt được ghi", used);
  const page = await c.get(a.location);
  r.ok(page.text.includes("Bạn vừa đăng nhập bằng mã khôi phục") && page.text.includes("Còn 9 mã"), "Hồ sơ nhắc đổi thiết bị và báo còn 9 mã");
  r.ok(page.text.includes("9 / 10"), "Thẻ bảo mật hiện 9 / 10");

  const again = await pendingLogin();
  await again.c.get("/login/mfa/recovery");
  a = await again.c.post("/login/mfa/recovery", [["code", codes[0]]]);
  r.ok(a.status === 200 && errorCode(a) === "INVALID_OTP", "Dùng mã lần hai → từ chối", errorCode(a));

  const loose = await pendingLogin();
  await loose.c.get("/login/mfa/recovery");
  a = await loose.c.post("/login/mfa/recovery", [["code", codes[1].toLowerCase().replace("-", "")]]);
  r.ok(a.status === 303, "Viết thường, thiếu dấu gạch vẫn khớp", a.status);
  results.push(r.counts);
}

async function partD() {
  const r = reporter("D. Xác thực lại");
  await resetMfa();
  const c = await signedIn();
  r.ok((await c.get("/admin/profile/mfa/reauth/disable")).status === 303, "Chưa bật MFA: không có gì để xác thực lại");
  const { secret, codes } = await enable(c);
  const u = await userRow();
  await clearLastStep(u.id);
  const open = async (a) => c.get(`/admin/profile/mfa/reauth/${a}`);
  const send = (a, pw, factor) => c.post(`/admin/profile/mfa/reauth/${a}`, [["password", pw], ["factor", factor]]);

  r.ok((await c.get("/admin/profile/mfa/reauth/bay")).status === 404, "Thao tác lạ → 404");
  await open("disable");
  let a = await send("disable", "sai-mat-khau", codes[0]);
  r.ok(errorCode(a) === "INVALID_OTP" && (await userRow()).mfaEnabled, "Sai password: không tắt được");
  r.ok((await prisma.recoveryCode.count({ where: { userId: u.id, usedAt: { not: null } } })) === 0, "Sai password không làm mất recovery code");
  await open("disable");
  a = await send("disable", password, "000000");
  r.ok(errorCode(a) === "INVALID_OTP" && (await userRow()).mfaEnabled, "Đúng password, sai mã: không tắt được");
  await open("disable");
  a = await send("disable", password, "");
  r.ok((await userRow()).mfaEnabled, "Thiếu yếu tố thứ hai: không tắt được");
  await clearMfaCounter(u.id);

  // Thay thiết bị: secret cũ còn hiệu lực tới khi secret mới được xác nhận.
  await open("replace");
  a = await send("replace", password, totpFor(secret));
  r.ok(a.status === 303 && a.location === "/admin/profile/mfa/setup", "Thay thiết bị: xác thực lại → trang thiết lập", a.location);
  const page = await c.get("/admin/profile/mfa/setup");
  const fresh = secretOnPage(page.text);
  let row = await userRow();
  r.ok(fresh && fresh !== secret && row.mfaPendingSecret && row.mfaEnabled && !page.text.includes("Bước 1 / 2"), "Có secret chờ, vẫn đang bật, không ghi Bước 1 / 2");
  const sealedOld = row.mfaSecret;
  await clearLastStep(u.id);
  const stillOld = await pendingLogin();
  await stillOld.c.get("/login/mfa");
  r.ok((await stillOld.c.post("/login/mfa", [["otp", totpFor(secret)]])).status === 303, "Chưa xác nhận: secret cũ vẫn đăng nhập được");
  r.ok((await userRow()).mfaSecret === sealedOld, "Secret đang dùng không bị ghi đè");
  await c.get("/admin/profile/mfa/setup");
  a = await c.post("/admin/profile/mfa/setup/confirm", [["otp", totpFor(fresh)]]);
  row = await userRow();
  r.ok(a.status === 303 && (a.location ?? "").includes("mfa-replaced") && row.mfaSecret !== sealedOld && row.mfaPendingSecret === null, "Xác nhận: chuyển sang secret mới", a.location);
  r.ok((await prisma.recoveryCode.count({ where: { userId: u.id } })) === 10, "Thay thiết bị không đổi nhóm recovery code");
  await clearLastStep(u.id);
  const oldGone = await pendingLogin();
  await oldGone.c.get("/login/mfa");
  a = await oldGone.c.post("/login/mfa", [["otp", totpFor(secret)]]);
  r.ok(errorCode(a) === "INVALID_OTP", "Sau khi đổi: mã từ secret cũ bị từ chối");
  await clearMfaCounter(u.id);

  // Tạo lại recovery code: nhóm cũ vô hiệu.
  await clearLastStep(u.id);
  await open("regenerate");
  a = await send("regenerate", password, totpFor(fresh));
  r.ok(a.status === 303 && a.location === "/admin/profile/mfa/codes", "Tạo lại mã → trang mã", a.location);
  const shown = await c.get("/admin/profile/mfa/codes");
  const newCodes = codesOnPage(shown.text);
  r.ok(newCodes.length === 10 && shown.text.includes("Đã tạo nhóm mã mới") && !shown.text.includes("Bước 2 / 2"), "Hiện 10 mã mới, đúng thông báo");
  const stale = await pendingLogin();
  await stale.c.get("/login/mfa/recovery");
  a = await stale.c.post("/login/mfa/recovery", [["code", codes[1]]]);
  r.ok(errorCode(a) === "INVALID_OTP", "Mã của nhóm cũ không còn dùng được");
  await clearMfaCounter(u.id);

  // Giới hạn thử ở bước xác thực lại dùng chung bộ đếm.
  let last;
  for (let i = 0; i < 5; i++) { await open("disable"); last = await send("disable", "sai", "000000"); }
  r.ok(last.status === 429 && (await userRow()).mfaEnabled, "Sai 5 lần ở bước xác thực lại → 429", last.status);
  await clearMfaCounter(u.id);

  // Tắt bằng recovery code.
  await open("disable");
  a = await send("disable", password, newCodes[0]);
  row = await userRow();
  r.ok(a.status === 303 && (a.location ?? "").includes("mfa-disabled") && !row.mfaEnabled && row.mfaSecret === null, "Đúng password + recovery code: tắt được", a.location);
  r.ok((await prisma.recoveryCode.count({ where: { userId: u.id } })) === 0, "Tắt MFA xoá recovery code");
  const plain = client();
  await plain.get("/login");
  a = await plain.post("/login", [["email", email], ["password", password]]);
  r.ok(a.status === 303 && a.location === "/admin/dishes", "Tắt xong đăng nhập không cần mã", a.location);
  results.push(r.counts);
}

await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "login:ip:" } } });
await startServer({ MAIL_TRANSPORT: "file" });
try {
  if (run("A")) await partA();
  if (run("B")) await partB();
  if (run("C")) await partC();
  if (run("D")) await partD();
} finally {
  await resetMfa();
  await stopServer();
  await prisma.$disconnect();
}
const pass = results.reduce((s, c) => s + c.pass, 0);
const fail = results.reduce((s, c) => s + c.fail, 0);
console.log(`\nTỔNG: ${pass} ĐẠT, ${fail} CHƯA ĐẠT`);
process.exitCode = fail ? 1 : 0;
