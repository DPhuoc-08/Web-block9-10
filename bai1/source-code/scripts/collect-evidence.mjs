// Thu bằng chứng nộp Bài 1 (slide 58, plan mục 11) vào ../evidence/ theo đúng các kịch bản của slide 56, 57: ảnh giao diện,
// Network và Application (Cookies) của Chrome thật, request gửi trực tiếp, bản ghi DB. Mọi bí mật đều đã che.
//   node scripts/collect-evidence.mjs
// Tự chạy server thật ở cổng 3100, không đụng server đang chạy ở 3000. MFA dùng tài khoản thử @demo.example, xoá ở cuối.
// Khoá phần còn lại của DB: bản ghi "[TEST B9]" và bộ đếm được dọn ở cuối; seed lại sau khi chạy để sessions và số id sạch.
import "./lib/test-env.mjs";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import * as OTPAuth from "otpauth";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/auth/password.js";
import { hashRecovery } from "../src/auth/recovery.js";
import { client } from "./lib/client.mjs";
import { startServer, stopServer, serverLog } from "./lib/server.mjs";
import { openBrowser } from "./lib/browser.mjs";
import { waitMail, resetLinkIn, clearOutbox } from "./lib/outbox.mjs";

const OUT = new URL("../../evidence/", import.meta.url);
const PORT = "3100";
const BASE = `http://localhost:${PORT}`;
const T = "[TEST B9]";
const seed = (k) => process.env[k].trim().toLowerCase();
const VIEWER = seed("SEED_VIEWER_EMAIL"), EDITOR_A = seed("SEED_EDITOR_A_EMAIL"), EDITOR_B = seed("SEED_EDITOR_B_EMAIL"), ADMIN = seed("SEED_ADMIN_EMAIL");
const PW = process.env.SEED_USER_PASSWORD;
const DEMO = "mfa.demo@demo.example";
const DEMO_PW = "mat-khau-thu-123";
const NEW_PW = "mat-khau-moi-456";
const BAD_OTP = (real) => (real === "000000" ? "111111" : "000000");

// ---------- che dữ liệu nhạy cảm ----------
// sid thay bằng vân tay (8 ký tự đầu SHA-256): vẫn so được sid trước và sau đăng nhập, không dùng lại được.
const print = (v) => createHash("sha256").update(String(v)).digest("hex").slice(0, 8);
const sidPrint = (cookieValue) => { const v = decodeURIComponent(cookieValue); return print(v.match(/^s:([^.]+)\./)?.[1] ?? v); };
const SECRET_FIELDS = ["_csrf", "password", "passwordConfirm", "otp", "code", "factor", "token", "g-recaptcha-response"];
const secrets = [PW, DEMO_PW, NEW_PW, process.env.SESSION_SECRET, process.env.OTP_PEPPER, process.env.MFA_ENCRYPTION_KEY, process.env.RECAPTCHA_SECRET_KEY, process.env.SMTP_PASS].filter((s) => s && s.length >= 6);
const realEmails = [VIEWER, EDITOR_A, EDITOR_B, ADMIN, process.env.SMTP_USER, process.env.MAIL_FROM?.match(/[^\s<>"]+@[^\s<>"]+/)?.[0]].filter(Boolean).sort((a, b) => b.length - a.length);
function mask(text) {
  let t = String(text);
  for (const e of realEmails) t = t.split(e).join("<email nhóm đã che>").split(encodeURIComponent(e)).join("<email nhóm đã che>");
  t = t.replace(/sid=([^;\s,&"|]+)/g, (_, v) => `sid=<đã che · vân tay ${sidPrint(v)}>`);
  for (const f of SECRET_FIELDS) t = t.replace(new RegExp(`(^|[?&\\s])${f}=[^&\\s]*`, "gm"), `$1${f}=<đã che>`);
  for (const s of secrets) t = t.split(s).join("<đã che>");
  return t;
}
const hashHead = (h) => (h ? `${h.slice(0, 6)}…(${h.length} ký tự)` : "—");
const time = (d) => (d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) + "Z" : "—");

// ---------- ghi file ----------
const files = new Map();
const shots = new Map();
const add = (path, line = "") => files.set(path, (files.get(path) ?? "") + line + "\n");
// Chặn cuối: còn sót giá trị bí mật script biết (secret TOTP, recovery code, sid, hash đầy đủ...) thì không ghi gì.
const known = new Set(secrets);
async function save() {
  for (const [path, text] of files) {
    const masked = mask(text);
    for (const v of known) if (v && masked.includes(v)) throw new Error(`Chưa che hết bí mật trong ${path} (giá trị dài ${v.length}) — không ghi evidence/.`);
  }
  for (const dir of ["screens", "network", "curl", "db", "mail"]) await mkdir(new URL(dir + "/", OUT), { recursive: true });
  for (const [path, text] of files) await writeFile(new URL(path, OUT), mask(text));
  for (const [path, buf] of shots) await writeFile(new URL(path, OUT), buf);
}

const failed = [];
function check(file, cond, text) {
  add(file, `${cond ? "ĐẠT" : "CHƯA ĐẠT"}: ${text}\n`);
  if (!cond) failed.push(`${file}: ${text}`);
  return cond;
}

// ---------- request trực tiếp, như curl -i có cookie jar ----------
const titleOf = (html) => html.match(/<title>([^<]*)<\/title>/)?.[1]?.replace(" · Nhà hàng", "") ?? "";
const codeOf = (html) => html.match(/data-error-code="([^"]+)"/)?.[1] ?? "";
async function call(file, c, method, path, fields, opts = {}) {
  const sent = [...c.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  for (const v of c.jar.values()) known.add(decodeURIComponent(v));
  if (c.csrf) known.add(c.csrf);
  const res = method === "GET" ? await c.get(path, opts.headers) : await c.post(path, fields ?? [], opts);
  const body = fields?.length ? "  " + new URLSearchParams(opts.csrf === false ? fields : [["_csrf", "x"], ...fields]).toString() : "";
  add(file, `$ ${method} ${path}${opts.note ? `   # ${opts.note}` : ""}`);
  add(file, `  Cookie: ${sent || "(không có)"}`);
  if (body) add(file, body);
  add(file, `→ ${res.status}${res.location ? `  Location: ${res.location}` : ""}${res.headers.get("retry-after") ? `  Retry-After: ${res.headers.get("retry-after")}` : ""}`);
  for (const sc of res.headers.getSetCookie()) add(file, `  Set-Cookie: ${sc}`);
  if (res.status !== 303 && res.status !== 302) add(file, `  Trang: "${titleOf(res.text)}"${codeOf(res.text) ? `  data-error-code="${codeOf(res.text)}"` : ""}`);
  add(file);
  return res;
}
async function signIn(email, password = PW) {
  const c = client();
  await c.get("/login");
  const res = await c.post("/login", [["email", email], ["password", password]]);
  if (res.status !== 303) throw new Error(`Không đăng nhập được (status ${res.status})`);
  await c.get("/admin/profile");
  return c;
}

// ---------- Network và Application của Chrome ----------
const NET = "network/network-log.md";
const REQ_H = ["origin", "content-type", "cookie", "referer"];
const RES_H = ["location", "set-cookie", "cache-control", "retry-after", "content-type"];
function network(heading, list) {
  add(NET, `## ${heading}\n`);
  for (const r of list) {
    const u = new URL(r.url);
    add(NET, `### ${r.method} ${u.pathname}${u.search} → ${r.status}\n`);
    add(NET, "```");
    add(NET, "Request headers");
    for (const [k, v] of Object.entries(r.reqHeaders)) if (REQ_H.includes(k.toLowerCase())) add(NET, `  ${k}: ${v}`);
    if (r.postData) { known.add(new URLSearchParams(r.postData).get("_csrf")); add(NET, `Form data\n  ${r.postData}`); }
    add(NET, "Response headers");
    for (const [k, v] of Object.entries(r.resHeaders)) if (RES_H.includes(k.toLowerCase())) for (const line of String(v).split("\n")) add(NET, `  ${k}: ${line}`);
    add(NET, "```\n");
  }
}
function cookieTable(heading, cookies) {
  add(NET, `### Application → Cookies: ${heading}\n`);
  add(NET, "| Name | Value | Domain | Path | Expires | HttpOnly | Secure | SameSite |\n| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const c of cookies) known.add(decodeURIComponent(c.value));
  for (const c of cookies) add(NET, `| ${c.name} | sid=${c.value} | ${c.domain} | ${c.path} | ${c.session ? "Session" : time(c.expires * 1000)} | ${c.httpOnly ? "✓" : ""} | ${c.secure ? "✓" : ""} | ${c.sameSite ?? ""} |`);
  if (!cookies.length) add(NET, "| (không có cookie) | | | | | | | |");
  add(NET);
}

// ---------- bản ghi DB ----------
async function snapshot() {
  const [row] = await prisma.$queryRaw`SELECT
    (SELECT md5(string_agg(d::text, ',' ORDER BY d.id)) FROM dishes d) dishes,
    (SELECT count(*)::int FROM dish_tags) dish_tags, (SELECT count(*)::int FROM dish_ingredients) dish_ingredients`;
  return JSON.stringify(row);
}
async function dbDishes(file, heading, ids) {
  add(file, `## ${heading}  (lúc ${time(new Date())})\n`);
  for (const d of await prisma.dish.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } })) add(file, `dishes #${d.id}  name="${d.name}"  chefId=${d.chefId}  status=${d.status}  available=${d.available}`);
  add(file);
}
async function dbUsers(file, heading, emails) {
  add(file, `## ${heading}  (lúc ${time(new Date())})\n`);
  for (const u of await prisma.user.findMany({ where: { email: { in: emails } }, orderBy: { id: "asc" } })) add(file, `users #${u.id}  email=${u.email}  role=${u.role}  chefId=${u.chefId ?? "—"}  status=${u.status}`);
  add(file);
}
async function dbMfa(file, heading, email = DEMO) {
  add(file, `## ${heading}  (lúc ${time(new Date())})\n`);
  const u = await prisma.user.findUnique({ where: { email }, include: { recoveryCodes: { orderBy: { id: "asc" } }, sessions: true, passwordResets: { orderBy: { id: "asc" } } } });
  const sealed = (v) => (v ? `<bản mã AES-256-GCM, ${v.length} ký tự, vân tay ${print(v)}>` : "—");
  for (const v of [u.mfaSecret, u.mfaPendingSecret, u.passwordHash]) if (v) known.add(v);
  add(file, `users #${u.id}  role=${u.role}  status=${u.status}  mfaEnabled=${u.mfaEnabled}  mfaLastStep=${u.mfaLastStep ?? "—"}`);
  add(file, `  passwordHash: vân tay ${print(u.passwordHash)}`);
  add(file, `  mfaSecret = ${sealed(u.mfaSecret)}`);
  add(file, `  mfaPendingSecret = ${sealed(u.mfaPendingSecret)}`);
  add(file, `  recovery_codes: ${u.recoveryCodes.length} mã, ${u.recoveryCodes.filter((c) => c.usedAt).length} đã dùng`);
  for (const c of u.recoveryCodes) { known.add(c.codeHash); add(file, `    #${c.id} codeHash=${hashHead(c.codeHash)} usedAt=${time(c.usedAt)}`); }
  for (const p of u.passwordResets) { known.add(p.tokenHash); add(file, `  password_resets #${p.id}: tokenHash=${hashHead(p.tokenHash)} hạn=${time(p.expiresAt)} usedAt=${time(p.usedAt)}`); }
  add(file, `  sessions gắn với user: ${u.sessions.length}`);
  for (const s of u.sessions) {
    known.add(s.sid);
    add(file, `    sid vân tay ${print(s.sid)}  cột userId=${s.userId ?? "—"}  expiresAt=${time(s.expiresAt)}  data có khoá: ${Object.keys(s.data).join(", ")}  → ${s.data.userId ? "phiên đầy đủ" : s.data.mfaPending ? "phiên CHỜ MFA (data không có userId)" : "ẩn danh"}`);
  }
  for (const l of await prisma.rateLimit.findMany({ where: { key: `mfa-fail:user:${u.id}` } })) add(file, `  rate_limits ${l.key}  count=${l.count}  windowStart=${time(l.windowStart)}  lockedUntil=${time(l.lockedUntil)}`);
  add(file);
}

// ---------- tiện ích của các kịch bản ----------
const clearIp = () => prisma.rateLimit.deleteMany({ where: { key: { contains: ":ip:" } } });
const clearMfaCounter = (id) => prisma.rateLimit.deleteMany({ where: { key: `mfa-fail:user:${id}` } });
const totp = (secret, offset = 0) => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30, algorithm: "SHA1" }).generate({ timestamp: Date.now() + offset * 30_000 });
const dishFields = ({ name, tagId, ingredientId, chefId }, extra = []) => [["name", name], ["price", "50000"], ["description", "mô tả"], ["tagIds", String(tagId)], ["ingredientIds", String(ingredientId)], ["chefId", String(chefId)], ["available", "on"], ...extra];

async function run() {
  const b = await openBrowser();
  const shot = async (name) => shots.set(`screens/${name}.png`, await b.screenshot());
  // Ba cỡ màn hình cho các màn mới của Block 9.
  const shot3 = async (name) => { for (const w of [1280, 820, 375]) { await b.viewport(w); await new Promise((r) => setTimeout(r, 200)); await shot(`${name}-${w}`); } await b.viewport(1280); };
  const where = () => b.eval("return location.pathname + location.search;");
  const errorCode = () => b.eval(`return document.querySelector("[data-error-code]")?.dataset.errorCode ?? "";`);
  const pageTitle = () => b.eval("return document.title;");
  const sidNow = async () => { const c = (await b.cookies()).find((x) => x.name === "sid"); return c ? sidPrint(c.value) : "(không có)"; };
  const forget = () => b.send("Network.clearBrowserCookies");
  async function browserLogin(email, password) {
    await forget();
    await b.goto(`${BASE}/login`);
    await b.fill("form.auth-form", { email, password });
    b.takeNetwork();
    await b.submit("form.auth-form");
  }
  // Che ngay trong trang trước khi chụp, để ảnh không bao giờ chứa QR, secret hay mã.
  const maskPage = () => b.eval(`
    document.querySelectorAll(".mfa-secret").forEach((e) => { e.textContent = "•••• •••• •••• (đã che)"; });
    document.querySelectorAll(".mfa-qr").forEach((e) => { e.src = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="#d9d6cf"/><text x="90" y="95" text-anchor="middle" font-size="16" fill="#5f5f5a">QR đã che</text></svg>'); });
    document.querySelectorAll("[data-recovery-codes] code").forEach((e) => { e.textContent = "•••••-•••••"; });
    return 1;`);

  try {
    await b.viewport(1280);
    await clearIp();
    const A = await prisma.user.findUnique({ where: { email: EDITOR_A } });
    const B = await prisma.user.findUnique({ where: { email: EDITOR_B } });
    const [viewer, editorA, editorB, admin] = await Promise.all([signIn(VIEWER), signIn(EDITOR_A), signIn(EDITOR_B), signIn(ADMIN)]);
    const tagId = (await prisma.tag.findFirst({ where: { name: "Món nước" } })).id;
    const ingredientId = (await prisma.ingredient.findFirst({ orderBy: { id: "asc" } })).id;
    const form = (name, chefId) => dishFields({ name, tagId, ingredientId, chefId });
    await editorA.post("/admin/dishes", form(`${T} Nháp của A`, A.chefId));
    const draft = await prisma.dish.findFirst({ where: { name: `${T} Nháp của A` } });
    const dishRow = () => prisma.dish.findUnique({ where: { id: draft.id } });
    const publishedA = await prisma.dish.findFirst({ where: { chefId: A.chefId, status: "published" }, orderBy: { id: "asc" } });
    const draftB = await prisma.dish.findFirst({ where: { chefId: B.chefId, status: "draft" }, orderBy: { id: "asc" } });

    // ===== Slide 56, ca 1: chưa đăng nhập =====
    {
      const F = "curl/01-chua-dang-nhap.txt", D = "db/01-du-lieu-truoc-sau.txt";
      add(F, "# Không cookie, gửi thẳng từng loại route quản trị\n");
      const before = await snapshot();
      add(D, `Trước: ${before}`);
      for (const [m, p] of [["GET", "/admin/dishes"], ["GET", "/admin/dishes/new"], ["GET", `/admin/dishes/${draft.id}/edit`], ["POST", "/admin/dishes"], ["POST", `/admin/dishes/${draft.id}?_method=PATCH`], ["POST", `/admin/dishes/${draft.id}?_method=DELETE`], ["POST", `/admin/dishes/${draft.id}/availability?_method=PATCH`], ["GET", "/admin/profile/mfa/setup"]]) {
        const res = await call(F, client(), m, p, m === "POST" ? [["name", "ghi thử"]] : null, { csrf: false });
        check(F, res.status === 303 && (res.location ?? "").startsWith("/login"), `${m} ${p} → 303 /login`);
      }
      const after = await snapshot();
      add(D, `Sau:   ${after}`);
      check(D, before === after, "md5 toàn bộ bảng dishes và số dòng bảng nối không đổi");
      await forget();
      await b.goto(`${BASE}/admin/dishes`);
      network("1. Chưa đăng nhập vào /admin/dishes → 303 /login", b.takeNetwork());
      cookieTable("sau khi bị chuyển về /login (chỉ có phiên ẩn danh)", await b.cookies());
      await shot("01-chua-dang-nhap-ve-login-1280");
      check(F, (await where()).startsWith("/login"), `Chrome đến ${await where()}`);
    }

    // ===== Slide 56, ca 2: thiếu role =====
    {
      const F = "curl/02-thieu-role.txt", D = "db/02-thieu-role.txt";
      await dbUsers(D, "Vai trò các tài khoản seed", [VIEWER, EDITOR_A, EDITOR_B, ADMIN]);
      const before = await snapshot();
      add(D, `Trước: ${before}`);
      add(F, "# Cookie viewer, gửi thẳng; rồi Editor gửi DELETE\n");
      for (const [m, p] of [["GET", "/admin/dishes/new"], ["POST", "/admin/dishes"], ["POST", `/admin/dishes/${draft.id}?_method=PATCH`], ["POST", `/admin/dishes/${draft.id}?_method=DELETE`], ["POST", `/admin/dishes/${draft.id}/availability?_method=PATCH`]]) {
        const res = await call(F, viewer, m, p, m === "POST" ? form(`${T} viewer ghi`, A.chefId) : null, { note: "viewer" });
        check(F, res.status === 403, `Viewer ${m} ${p} → 403`);
      }
      const del = await call(F, editorA, "POST", `/admin/dishes/${draft.id}?_method=DELETE`, [], { note: "Editor không có quyền xoá" });
      check(F, del.status === 403, "Editor DELETE → 403");
      const after = await snapshot();
      add(D, `Sau:   ${after}`);
      check(D, before === after, "Dữ liệu không đổi sau mọi request bị chặn");
      await browserLogin(VIEWER, PW);
      network("2a. Viewer đăng nhập", b.takeNetwork());
      cookieTable("Viewer đã đăng nhập", await b.cookies());
      await shot("02-viewer-danh-sach-khong-nut-ghi-1280");
      await b.goto(`${BASE}/admin/dishes/new`);
      network("2b. Viewer mở form thêm món → 403", b.takeNetwork());
      check(F, (await pageTitle()).includes("Không đủ quyền"), `Chrome: trang "${await pageTitle()}"`);
      await shot3("03-trang-403");
    }

    // ===== Slide 56, ca 3: có role, thuộc tính không thoả =====
    {
      const F = "curl/03-thuoc-tinh-mon.txt", D = "db/03-thuoc-tinh-mon.txt";
      await dbUsers(D, "Editor A, Editor B", [EDITOR_A, EDITOR_B]);
      await dbDishes(D, "Món liên quan", [draft.id, publishedA.id, draftB.id]);
      const before = await snapshot();
      add(F, "# Editor A: món nháp của đầu bếp B và món đã published của chính mình\n");
      for (const [id, note] of [[draftB.id, "món của đầu bếp khác"], [publishedA.id, "món của mình nhưng đã published"]]) {
        let res = await call(F, editorA, "GET", `/admin/dishes/${id}/edit`, null, { note });
        check(F, res.status === 403, `Editor A mở form món #${id} → 403 (${note})`);
        res = await call(F, editorA, "POST", `/admin/dishes/${id}?_method=PATCH`, form(`${T} sửa trộm`, A.chefId), { note });
        check(F, res.status === 403, `Editor A PATCH món #${id} → 403 (${note})`);
      }
      const after = await snapshot();
      check(D, before === after, "Dữ liệu không đổi");
      await browserLogin(EDITOR_A, PW);
      await b.goto(`${BASE}/admin/dishes/${draftB.id}/edit`);
      network("3a. Editor A mở món của đầu bếp B → 403", b.takeNetwork());
      await shot("04-editor-sai-chu-403-1280");
      await b.goto(`${BASE}/admin/dishes/${publishedA.id}/edit`);
      network("3b. Editor A mở món published của mình → 403", b.takeNetwork());
      await shot("05-editor-mon-published-403-375");
    }

    // ===== Slide 56, ca 4: mở form rồi đổi quyền hoặc status trước khi gửi =====
    {
      const F = "curl/04-doi-quyen-sau-khi-mo-form.txt", D = "db/04-doi-quyen-sau-khi-mo-form.txt";
      await b.goto(`${BASE}/admin/dishes/${draft.id}/edit`);
      await shot("06-editor-form-mon-nhap-1280");
      await dbDishes(D, "Trước: Editor A đang mở form", [draft.id]);
      await admin.get(`/admin/dishes/${draft.id}/edit`);
      let res = await call(F, admin, "POST", `/admin/dishes/${draft.id}?_method=PATCH`, [...form(draft.name, A.chefId), ["status", "published"]], { note: "Admin xuất bản món trong lúc Editor đang mở form" });
      check(F, res.status === 303 && (await dishRow()).status === "published", "Admin đổi status thành published");
      await b.fill("form.form", { name: `${T} sửa sau khi đã xuất bản` });
      b.takeNetwork();
      await b.submit("form.form");
      network("4a. Editor gửi form đã mở từ trước, món vừa thành published → 403", b.takeNetwork());
      await shot("07-gui-form-sau-khi-doi-status-403-1280");
      let row = await dishRow();
      check(F, (await pageTitle()).includes("Không đủ quyền") && row.name === draft.name, "Chrome: 403, tên món không đổi");
      await dbDishes(D, "Sau: PATCH bị từ chối, tên vẫn như cũ", [draft.id]);

      await admin.get(`/admin/dishes/${draft.id}/edit`);
      await call(F, admin, "POST", `/admin/dishes/${draft.id}?_method=PATCH`, [...form(draft.name, A.chefId), ["status", "draft"]], { note: "đưa món về nháp để thử ca hạ role" });
      await b.goto(`${BASE}/admin/dishes/${draft.id}/edit`);
      await prisma.user.update({ where: { id: A.id }, data: { role: "viewer" } });
      await dbUsers(D, "Hạ role Editor A bằng SQL trong lúc đang mở form", [EDITOR_A]);
      await b.fill("form.form", { name: `${T} sửa sau khi bị hạ role` });
      b.takeNetwork();
      await b.submit("form.form");
      network("4b. Editor bị hạ thành Viewer, gửi form đã mở từ trước → 403", b.takeNetwork());
      await shot("08-gui-form-sau-khi-ha-role-403-375");
      row = await dishRow();
      check(F, (await pageTitle()).includes("Không đủ quyền") && row.name === draft.name, "Chrome: 403 vì role đọc lại từ DB, tên món không đổi");
      await prisma.user.update({ where: { id: A.id }, data: { role: "editor" } });
      await dbUsers(D, "Đã trả lại role", [EDITOR_A]);
    }

    // ===== Slide 56, ca 5: gửi PATCH trực tiếp, bỏ qua form =====
    {
      const F = "curl/05-patch-truc-tiep.txt";
      add(F, "# Không mở form. So với kết quả qua form ở mục 3, 4 và 6\n");
      await viewer.get("/admin/profile");
      let res = await call(F, viewer, "POST", `/admin/dishes/${draft.id}?_method=PATCH`, form(`${T} trực tiếp`, A.chefId), { note: "viewer, giống trang 403 khi qua form" });
      check(F, res.status === 403, "Viewer PATCH trực tiếp → 403 như qua form");
      await editorB.get("/admin/profile");
      res = await call(F, editorB, "POST", `/admin/dishes/${draft.id}?_method=PATCH`, form(`${T} trực tiếp`, B.chefId), { note: "Editor B, món của A" });
      check(F, res.status === 403, "Editor B PATCH trực tiếp món của A → 403 như qua form");
      check(F, (await dishRow()).name === draft.name, "Tên món không đổi");
      await editorA.get("/admin/profile");
      res = await call(F, editorA, "POST", `/admin/dishes/${draft.id}?_method=PATCH`, form(draft.name, A.chefId), { note: "đúng chủ, món nháp: được như qua form" });
      check(F, res.status === 303, "Editor A PATCH trực tiếp món nháp của mình → 303 như qua form");
    }

    // ===== Slide 56, ca 6: sửa role hoặc chủ sở hữu trong hidden field =====
    {
      const F = "curl/06-sua-truong-an.txt", D = "db/06-sua-truong-an.txt";
      await dbDishes(D, "Trước", [draft.id]);
      await b.send("Network.clearBrowserCookies");
      await browserLogin(EDITOR_A, PW);
      await b.goto(`${BASE}/admin/dishes/${draft.id}/edit`);
      await b.eval(`const f = document.querySelector("form.form");
        for (const [n, v] of [["chefId", "${B.chefId}"], ["status", "published"], ["role", "admin"]]) { const i = document.createElement("input"); i.type = "hidden"; i.name = n; i.value = v; f.appendChild(i); }
        return 1;`);
      await b.fill("form.form", { name: `${T} Nháp của A, đã thêm ô ẩn` });
      b.takeNetwork();
      await b.submit("form.form");
      network("6. Editor thêm ô ẩn chefId, status, role vào form rồi gửi: server bỏ qua", b.takeNetwork());
      await shot("09-them-o-an-van-la-nhap-1280");
      let row = await dishRow();
      check(F, row.chefId === A.chefId && row.status === "draft" && row.name.endsWith("đã thêm ô ẩn"), `Chrome: chefId=${row.chefId}, status=${row.status}, chỉ tên đổi`);
      await editorA.get("/admin/profile");
      await call(F, editorA, "POST", `/admin/dishes/${draft.id}?_method=PATCH`, [...form(draft.name, B.chefId), ["status", "published"], ["role", "admin"]], { note: "gửi trực tiếp với chefId của B, status published, role admin" });
      row = await dishRow();
      const u = await prisma.user.findUnique({ where: { id: A.id } });
      check(F, row.chefId === A.chefId && row.status === "draft" && u.role === "editor", `Trực tiếp: chefId=${row.chefId}, status=${row.status}, role=${u.role}`);
      await dbDishes(D, "Sau", [draft.id]);
      await dbUsers(D, "Vai trò không tăng", [EDITOR_A]);
    }

    // ===== Thêm (12.2): món nháp chỉ hiện đúng người =====
    {
      const F = "curl/07-mon-nhap.txt";
      let res = await call(F, client(), "GET", `/dishes/${draftB.id}`, null, { note: "khách" });
      check(F, res.status === 404, "Khách mở URL món nháp → 404");
      res = await call(F, admin, "GET", `/dishes/${draftB.id}`, null, { note: "Admin ở thực đơn công khai" });
      check(F, res.status === 404, "Admin ở thực đơn công khai cũng không thấy món nháp");
      await b.goto(`${BASE}/admin/dishes?status=draft`);
      await shot("10-editor-loc-mon-nhap-1280");
      await forget();
      await b.goto(`${BASE}/dishes/${draftB.id}`);
      await shot("11-khach-mo-mon-nhap-404-375");
    }

    // ===== Lỗi do agent tạo ra (slide 58): bằng chứng sau khi sửa lỗi nút Xoá tràn khung bảng, BUILD_LOG bước 8 =====
    {
      const F = "curl/14-sua-loi-nut-xoa.txt";
      await browserLogin(ADMIN, PW);
      add(F, "# Admin, /admin/dishes. scrollWidth - clientWidth của .table-wrap: 0 nghĩa là bảng không tràn trong khung\n");
      for (const w of [1440, 1280, 1100, 1024, 900, 821]) {
        await b.viewport(w);
        await new Promise((r) => setTimeout(r, 300));
        const over = await b.eval(`const t = document.querySelector(".table-wrap"); return t.scrollWidth - t.clientWidth;`);
        check(F, over === 0, `Rộng ${w}px: tràn ${over}px`);
      }
      await b.viewport(1280);
      await shot("28-admin-nut-xoa-trong-khung-1280");
    }

    // ===== Chuẩn bị MFA: bật qua đúng các trang =====
    await clearIp();
    const demo = await prisma.user.create({ data: { email: DEMO, emailInput: DEMO, passwordHash: await hashPassword(DEMO_PW), status: "active", emailVerifiedAt: new Date() } });
    let secret, codes;
    {
      const D = "db/07-bat-mfa.txt";
      await browserLogin(DEMO, DEMO_PW);
      await b.goto(`${BASE}/admin/profile`);
      await shot("12-ho-so-chua-bat-mfa-1280");
      b.takeNetwork();
      await b.submit('form[action="/admin/profile/mfa/setup"]');
      network("7a. Bấm Bật xác thực hai lớp: POST tạo secret chờ → 303 → GET vẽ QR", b.takeNetwork());
      secret = (await b.eval(`return document.querySelector(".mfa-secret").textContent;`)).replace(/\s/g, "");
      known.add(secret);
      await dbMfa(D, "Sau POST: chỉ có mfaPendingSecret, chưa bật");
      await maskPage();
      await shot3("13-thiet-lap-mfa-da-che");
      // Mã của bước trước để bước đăng nhập ngay sau đó dùng mã của bước hiện tại.
      await b.fill("form.mfa-form", { otp: totp(secret, -1) });
      b.takeNetwork();
      await b.submit("form.mfa-form");
      network("7b. Nhập đúng mã: POST ghi hash recovery → 303 → GET hiện mã một lần", b.takeNetwork());
      codes = await b.eval(`return [...document.querySelectorAll("[data-recovery-codes] code")].map((e) => e.textContent);`);
      codes.forEach((c) => known.add(c).add(c.replace("-", "")));
      await maskPage();
      await shot3("14-ma-khoi-phuc-da-che");
      await b.goto(`${BASE}/admin/profile/mfa/codes`);
      network("7c. Mở lại trang mã: mã không hiện lại", b.takeNetwork());
      check(D, (await where()).startsWith("/admin/profile"), `Mở lại /codes → ${await where()}`);
      await shot("15-ho-so-da-bat-mfa-1280");
      await dbMfa(D, "Đã bật: secret là bản mã, recovery chỉ có hash");
      const row = await prisma.user.findUnique({ where: { id: demo.id }, include: { recoveryCodes: true } });
      check(D, row.mfaEnabled && !row.mfaSecret.includes(secret) && row.recoveryCodes.length === 10 && !row.recoveryCodes.some((c) => codes.includes(c.codeHash)), "DB không có secret gốc và mã gốc");
    }

    // ===== Slide 57, ca 1: password đúng, chưa nhập OTP =====
    let usedOtp;
    {
      const F = "curl/08-password-dung-chua-otp.txt", D = "db/08-phien-cho-mfa.txt";
      await b.submit(".account form");
      await browserLogin(DEMO, DEMO_PW);
      network("8a. Password đúng, đã bật MFA: 303 /login/mfa", b.takeNetwork());
      const pendingSid = await sidNow();
      cookieTable("phiên chờ MFA", await b.cookies());
      check(F, (await where()) === "/login/mfa", `Chrome đến ${await where()}`);
      await shot3("16-buoc-nhap-ma");
      await dbMfa(D, "Sau bước password");
      const c = client();
      await c.get("/login");
      const res = await c.post("/login", [["email", DEMO], ["password", DEMO_PW]]);
      check(F, res.status === 303 && res.location === "/login/mfa", "Request trực tiếp: password đúng → 303 /login/mfa");
      add(F, "# Dùng cookie của phiên chờ MFA gọi thẳng khu quản trị\n");
      for (const [m, p] of [["GET", "/admin/dishes"], ["GET", "/admin/profile"], ["POST", "/admin/dishes"], ["GET", "/admin/profile/mfa/setup"]]) {
        const r = await call(F, c, m, p, m === "POST" ? form(`${T} phiên chờ`, A.chefId) : null, { csrf: false, note: "phiên chờ MFA" });
        check(F, r.status === 303 && (r.location ?? "").startsWith("/login"), `${m} ${p} → 303 /login`);
      }
      await b.goto(`${BASE}/admin/dishes`);
      network("8b. Phiên chờ MFA mở /admin/dishes → bị chặn", b.takeNetwork());
      check(F, !(await where()).startsWith("/admin"), `Chrome không vào được quản trị, đang ở ${await where()}`);
      await shot("17-phien-cho-khong-vao-duoc-quan-tri-1280");

      await b.goto(`${BASE}/login/mfa`);
      usedOtp = totp(secret);
      await b.fill("form.auth-form", { otp: usedOtp });
      b.takeNetwork();
      await b.submit("form.auth-form");
      network("8c. Nhập đúng mã: sid mới, phiên đầy đủ", b.takeNetwork());
      const fullSid = await sidNow();
      cookieTable("phiên đầy đủ sau MFA", await b.cookies());
      check(F, fullSid !== pendingSid && (await where()).startsWith("/admin"), `Đổi sid: ${pendingSid} → ${fullSid}, đến ${await where()}`);
      await shot("18-qua-mfa-vao-quan-tri-375");
      await dbMfa(D, "Sau khi nhập đúng mã");
    }

    // ===== Slide 57, ca 2: mã đã dùng, sai quá giới hạn =====
    {
      const F = "curl/09-otp-dung-lai-va-sai-qua-gioi-han.txt", D = "db/09-otp-dem-sai.txt";
      await b.submit(".account form");
      await browserLogin(DEMO, DEMO_PW);
      await b.fill("form.auth-form", { otp: usedOtp });
      b.takeNetwork();
      await b.submit("form.auth-form");
      network("9a. Dùng lại mã vừa dùng → INVALID_OTP", b.takeNetwork());
      check(F, (await errorCode()) === "INVALID_OTP", "Chrome: mã đã dùng bị từ chối");
      await shot("19-ma-da-dung-bi-tu-choi-375");
      await dbMfa(D, "Sau khi dùng lại mã: mfaLastStep không đổi, count tăng");
      await clearMfaCounter(demo.id);

      const bad = BAD_OTP(totp(secret));
      for (let i = 1; i <= 5; i++) { await b.fill("form.auth-form", { otp: bad }); b.takeNetwork(); await b.submit("form.auth-form"); }
      network("9b. Lần sai thứ 5 → 429 + Retry-After", b.takeNetwork());
      check(F, (await errorCode()) === "RATE_LIMITED", "Chrome: sai 5 lần bị khoá");
      await shot3("20-sai-5-lan-tam-khoa");
      await dbMfa(D, "Sau 5 lần sai: count, lockedUntil");
      const c = client();
      await c.get("/login");
      await c.post("/login", [["email", DEMO], ["password", DEMO_PW]]);
      await c.get("/login/mfa");
      const res = await call(F, c, "POST", "/login/mfa", [["otp", totp(secret)]], { note: "mã ĐÚNG trong lúc đang khoá" });
      check(F, res.status === 429 && res.headers.get("retry-after"), "Mã đúng trong lúc khoá vẫn 429 + Retry-After");
      await clearMfaCounter(demo.id);
      add(F, "(Script xoá bộ đếm mfa-fail sau ca này để chạy ca tiếp theo; server không có nhánh bỏ qua.)\n");
    }

    // ===== Slide 57, ca 3: recovery code dùng lần hai =====
    {
      const F = "curl/10-recovery-dung-lai.txt", D = "db/10-recovery.txt";
      await browserLogin(DEMO, DEMO_PW);
      await b.goto(`${BASE}/login/mfa/recovery`);
      await shot3("21-nhap-ma-khoi-phuc");
      await b.fill("form.auth-form", { code: codes[0] });
      b.takeNetwork();
      await b.submit("form.auth-form");
      network("10a. Recovery code lần đầu: sid mới, về hồ sơ", b.takeNetwork());
      check(F, (await where()).startsWith("/admin/profile"), `Chrome: dùng mã lần đầu → ${await where()}`);
      await shot("22-nhac-doi-thiet-bi-sau-recovery-1280");
      await dbMfa(D, "Sau lần dùng đầu: đúng một dòng có usedAt");
      const hash = hashRecovery(codes[0]);
      known.add(hash);
      check(D, Boolean((await prisma.recoveryCode.findUnique({ where: { codeHash: hash } })).usedAt), "Mã vừa dùng đã có usedAt");

      await b.submit(".account form");
      await browserLogin(DEMO, DEMO_PW);
      await b.goto(`${BASE}/login/mfa/recovery`);
      await b.fill("form.auth-form", { code: codes[0] });
      b.takeNetwork();
      await b.submit("form.auth-form");
      network("10b. Dùng lại recovery code → INVALID_OTP", b.takeNetwork());
      check(F, (await errorCode()) === "INVALID_OTP", "Chrome: dùng lần hai bị từ chối");
      await shot("23-recovery-dung-lai-bi-tu-choi-375");

      await clearMfaCounter(demo.id);
      for (const [n, want] of [[1, 303], [2, 200]]) {
        const c = client();
        await c.get("/login");
        await c.post("/login", [["email", DEMO], ["password", DEMO_PW]]);
        await c.get("/login/mfa/recovery");
        const res = await call(F, c, "POST", "/login/mfa/recovery", [["code", codes[1]]], { note: `request trực tiếp, lần ${n}` });
        check(F, res.status === want && (want === 303 || codeOf(res.text) === "INVALID_OTP"), `Lần ${n} → ${want}`);
      }
      await clearMfaCounter(demo.id);
      await dbMfa(D, "Sau lần dùng hai: usedAt giữ nguyên");
    }

    // ===== Slide 57, ca 4: reset password xong vẫn qua MFA =====
    {
      const F = "curl/11-reset-van-qua-mfa.txt", D = "db/11-reset.txt";
      await clearOutbox();
      await dbMfa(D, "Trước khi reset");
      const before = await prisma.user.findUnique({ where: { id: demo.id } });
      await forget();
      await b.goto(`${BASE}/forgot`);
      await b.fill("form.auth-form", { email: DEMO });
      await b.submit("form.auth-form");
      const raw = await waitMail(DEMO, "reset");
      const link = resetLinkIn(raw);
      known.add(new URL(link).searchParams.get("token"));
      add("mail/1-dat-lai-mat-khau.txt", raw);
      await b.goto(link);
      await b.fill("form.auth-form", { password: NEW_PW, passwordConfirm: NEW_PW });
      b.takeNetwork();
      await b.submit("form.auth-form");
      network("11a. Đặt mật khẩu mới: không tạo phiên", b.takeNetwork());
      await shot("24-dat-lai-mat-khau-xong-375");
      await dbMfa(D, "Sau khi reset: mfaEnabled và vân tay mfaSecret không đổi, usedAt có giá trị");
      const after = await prisma.user.findUnique({ where: { id: demo.id } });
      check(F, after.mfaEnabled && after.mfaSecret === before.mfaSecret && after.passwordHash !== before.passwordHash, "Reset đổi mật khẩu, không đổi MFA");

      await browserLogin(DEMO, NEW_PW);
      network("11b. Đăng nhập bằng mật khẩu mới: vẫn sang bước MFA", b.takeNetwork());
      check(F, (await where()) === "/login/mfa", `Chrome đến ${await where()}`);
      cookieTable("sau bước password, chưa qua MFA", await b.cookies());
      await shot("25-sau-reset-van-qua-mfa-375");
      const c = client();
      await c.get("/login");
      const res = await c.post("/login", [["email", DEMO], ["password", NEW_PW]]);
      check(F, res.status === 303 && res.location === "/login/mfa", "Request trực tiếp: mật khẩu mới → 303 /login/mfa");
      const res2 = await call(F, c, "GET", "/admin/dishes", null, { note: "cookie sau bước password" });
      check(F, res2.status === 303 && (res2.location ?? "").startsWith("/login"), "Chưa qua MFA vẫn không vào được quản trị");
    }

    // ===== Thêm (slide 23): tắt MFA phải xác thực lại =====
    {
      const F = "curl/12-xac-thuc-lai.txt", D = "db/12-tat-mfa.txt";
      await b.goto(`${BASE}/login/mfa/recovery`);
      await b.fill("form.auth-form", { code: codes[2] });
      await b.submit("form.auth-form");
      await b.goto(`${BASE}/admin/profile/mfa/reauth/disable`);
      await shot3("26-xac-thuc-lai-de-tat-mfa");
      await b.fill("form.mfa-form", { password: NEW_PW, factor: "ZZZZZ-ZZZZZ" });
      b.takeNetwork();
      await b.submit("form.mfa-form");
      network("12a. Đúng mật khẩu, sai yếu tố thứ hai: không tắt", b.takeNetwork());
      check(F, (await errorCode()) === "INVALID_OTP" && (await prisma.user.findUnique({ where: { id: demo.id } })).mfaEnabled, "Sai yếu tố thứ hai: MFA vẫn bật");
      await b.fill("form.mfa-form", { password: NEW_PW, factor: codes[3] });
      b.takeNetwork();
      await b.submit("form.mfa-form");
      network("12b. Đúng mật khẩu và recovery code: tắt được", b.takeNetwork());
      await dbMfa(D, "Sau khi tắt: secret xoá, recovery xoá");
      check(F, !(await prisma.user.findUnique({ where: { id: demo.id } })).mfaEnabled, "Đúng cả hai: MFA đã tắt");
      await shot("27-da-tat-mfa-1280");
    }

    // ===== Log server không chứa bí mật =====
    {
      const F = "curl/13-log-server.txt";
      const log = serverLog();
      for (const [name, v] of [["secret TOTP", secret], ["mật khẩu seed", PW], ["mật khẩu thử", DEMO_PW], ["mật khẩu mới", NEW_PW], ...codes.map((c, i) => [`recovery code ${i + 1}`, c])]) check(F, !log.includes(v), `Log server không chứa ${name}`);
      add(F, `Tổng log: ${log.split("\n").length} dòng (không đính kèm nguyên văn).`);
    }
  } finally {
    b.close();
  }
}

async function cleanup() {
  const A = seed("SEED_EDITOR_A_EMAIL");
  await prisma.user.updateMany({ where: { email: A }, data: { role: "editor" } });
  await prisma.dish.deleteMany({ where: { name: { startsWith: T } } });
  await prisma.user.deleteMany({ where: { email: DEMO } });
  await prisma.rateLimit.deleteMany({ where: { OR: [{ key: { contains: "demo.example" } }, { key: { contains: ":ip:" } }, { key: { startsWith: "mfa-fail:" } }, { key: { startsWith: "login-fail:" } }] } });
}

await startServer({ PORT, MAIL_TRANSPORT: "file", APP_ORIGIN: BASE });
let code = 0;
try {
  await run();
  await save();
  console.log(`Đã ghi ${files.size} tệp chữ, ${shots.size} ảnh.`);
  if (failed.length) { code = 1; console.log("CHƯA ĐẠT:\n" + failed.join("\n")); }
} catch (e) {
  code = 1;
  console.error(e);
} finally {
  await cleanup();
  await stopServer();
  await prisma.$disconnect();
}
process.exit(code);
