// Kiểm tra MFA theo bảng nghiệm thu Bài 1 (slide 57; plan mục 10.1). Script tự chạy server thật ở cổng 3100.
//   node scripts/check-mfa.mjs        → mọi phần
//   node scripts/check-mfa.mjs B      → chỉ phần B
// A: thiết lập. Dùng tài khoản seed viewer; mọi cột MFA được đặt lại ở cuối, secret lấy từ chính trang thiết lập.
import "./lib/test-env.mjs";
import * as OTPAuth from "otpauth";
import { prisma } from "../src/db.js";
import { client, reporter } from "./lib/client.mjs";
import { login } from "./lib/auth.mjs";
import { startServer, stopServer, serverLog } from "./lib/server.mjs";

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

await prisma.rateLimit.deleteMany({ where: { key: { startsWith: "login:ip:" } } });
await startServer({ MAIL_TRANSPORT: "file" });
try {
  if (run("A")) await partA();
} finally {
  await resetMfa();
  await stopServer();
  await prisma.$disconnect();
}
const pass = results.reduce((s, c) => s + c.pass, 0);
const fail = results.reduce((s, c) => s + c.fail, 0);
console.log(`\nTỔNG: ${pass} ĐẠT, ${fail} CHƯA ĐẠT`);
process.exitCode = fail ? 1 : 0;
export { enable, signedIn, totpFor, clearLastStep };
