// Nghiệm thu giao diện và thu bằng chứng Bài 2 (slide 67–69) vào ../evidence/: ảnh, Network và Application (Storage) của Chrome thật,
// request trực tiếp, bản ghi DB. Mọi token, challenge, secret, recovery code đều đã che.
//   npm --prefix ../web run build && node scripts/collect-evidence.mjs      (tắt api và web đang chạy trước)
// Tự chạy api thật ở :3000 và bản build của web ở :5173. Tài khoản thử @demo.example được xoá ở cuối; seed lại sau khi chạy.
import "./lib/test-env.mjs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import jwt from "jsonwebtoken";
import * as OTPAuth from "otpauth";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/auth/password.js";
import { hashRecovery } from "../src/auth/recovery.js";
import { startServer, stopServer, serverLog } from "./lib/server.mjs";
import { openBrowser } from "./lib/browser.mjs";
import { waitMail, resetLinkIn, otpIn, clearOutbox } from "./lib/outbox.mjs";

const OUT = new URL("../../evidence/", import.meta.url);
const WEB = "http://localhost:5173";
const API = "http://localhost:3000";
const T = "[TEST B9]";
const seed = (k) => process.env[k].trim().toLowerCase();
const VIEWER = seed("SEED_VIEWER_EMAIL"), EDITOR_A = seed("SEED_EDITOR_A_EMAIL"), EDITOR_B = seed("SEED_EDITOR_B_EMAIL"), ADMIN = seed("SEED_ADMIN_EMAIL");
const PW = process.env.SEED_USER_PASSWORD;
const DEMO_PW = "mat-khau-thu-123", NEW_PW = "mat-khau-moi-456";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- che dữ liệu nhạy cảm ----------
const secrets = [PW, DEMO_PW, NEW_PW, process.env.JWT_SECRET, process.env.OTP_PEPPER, process.env.MFA_ENCRYPTION_KEY, process.env.RECAPTCHA_SECRET_KEY, process.env.SMTP_PASS].filter((s) => s && s.length >= 6);
const emails = [VIEWER, EDITOR_A, EDITOR_B, ADMIN, process.env.SMTP_USER, process.env.MAIL_FROM?.match(/[^\s<>"]+@[^\s<>"]+/)?.[0]].filter(Boolean).sort((a, b) => b.length - a.length);
const JSON_SECRET = ["accessToken", "challenge", "secret", "otpauthUri", "qrDataUrl", "password", "passwordConfirm", "code", "recoveryCode", "factor", "otp", "token", "captchaToken"];
function mask(text) {
  let t = String(text);
  for (const e of emails) t = t.split(e).join("<email nhóm đã che>");
  t = t.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, "<JWT đã che>");
  for (const k of JSON_SECRET) t = t.replace(new RegExp(`"${k}":"[^"]*"`, "g"), `"${k}":"<đã che>"`);
  t = t.replace(/"recoveryCodes":\[[^\]]*\]/g, '"recoveryCodes":["<10 mã đã che>"]');
  t = t.replace(/([?&]token=)[\w-]+/g, "$1<đã che>");
  for (const s of secrets) t = t.split(s).join("<đã che>");
  return t;
}
const hashHead = (h) => (h ? `${h.slice(0, 6)}…(${h.length} ký tự)` : "—");
const print = (v) => createHash("sha256").update(String(v)).digest("hex").slice(0, 8);
const time = (d) => (d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) + "Z" : "—");

const files = new Map(), shots = new Map(), known = new Set(secrets), failed = [];
const add = (path, line = "") => files.set(path, (files.get(path) ?? "") + line + "\n");
function check(file, cond, text) {
  add(file, `${cond ? "ĐẠT" : "CHƯA ĐẠT"}: ${text}\n`);
  if (!cond) { failed.push(`${file}: ${text}`); console.log("CHƯA ĐẠT", file, text); }
  return cond;
}
async function save() {
  for (const [path, text] of files) { const m = mask(text); for (const v of known) if (v && m.includes(v)) throw new Error(`Chưa che hết bí mật trong ${path} (dài ${v.length})`); }
  await rm(new URL("screens/", OUT), { recursive: true, force: true });
  for (const dir of ["screens", "network", "curl", "db", "mail", "storage"]) await mkdir(new URL(`${dir}/`, OUT), { recursive: true });
  for (const [path, text] of files) await writeFile(new URL(path, OUT), mask(text));
  for (const [path, buf] of shots) await writeFile(new URL(path, OUT), buf);
}

// ---------- request trực tiếp ----------
async function raw(method, path, { token, body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (token) init.headers.authorization = `Bearer ${token}`;
  if (body !== undefined) { init.headers["content-type"] = "application/json"; init.body = JSON.stringify(body); }
  const res = await fetch(API + path, init);
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, text, json, data: json?.data, code: json?.error?.code };
}
async function call(file, method, path, opts = {}) {
  const res = await raw(method, path, opts);
  if (opts.token) known.add(opts.token);
  add(file, `$ ${method} ${path}${opts.note ? `   # ${opts.note}` : ""}`);
  add(file, `  Authorization: ${opts.token ? "Bearer <JWT đã che>" : "(không có)"}`);
  for (const [k, v] of Object.entries(opts.headers ?? {})) add(file, `  ${k}: ${v}`);
  if (opts.body !== undefined) add(file, `  ${JSON.stringify(opts.body)}`);
  add(file, `→ ${res.status}${res.headers.get("retry-after") ? `  Retry-After: ${res.headers.get("retry-after")}` : ""}${res.headers.get("cache-control") ? `  Cache-Control: ${res.headers.get("cache-control")}` : ""}`);
  add(file, `  ${res.text.length > 260 ? `${res.text.slice(0, 260)}…` : res.text}`);
  add(file);
  return res;
}
const login = async (email, password = PW) => {
  const res = await raw("POST", "/api/auth/login", { body: { email, password } });
  if (!res.data?.accessToken) throw new Error(`Không đăng nhập được (${res.status} ${res.code})`);
  known.add(res.data.accessToken);
  return res.data.accessToken;
};
const totp = (secret, offset = 0) => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30, algorithm: "SHA1" }).generate({ timestamp: Date.now() + offset * 30_000 });
const demoUser = async (name, extra = {}) => prisma.user.create({ data: { email: `${name}@demo.example`, emailInput: `${name}@demo.example`, passwordHash: await hashPassword(DEMO_PW), status: "active", emailVerifiedAt: new Date(), ...extra } });
const clearIp = () => prisma.rateLimit.deleteMany({ where: { key: { contains: ":ip:" } } });
async function snapshot() {
  const [r] = await prisma.$queryRaw`SELECT (SELECT md5(string_agg(d::text, ',' ORDER BY d.id)) FROM dishes d) dishes, (SELECT count(*)::int FROM dish_tags) dt, (SELECT count(*)::int FROM dish_ingredients) di`;
  return JSON.stringify(r);
}
async function dbUser(file, heading, email) {
  add(file, `## ${heading}  (lúc ${time(new Date())})\n`);
  const u = await prisma.user.findUnique({ where: { email }, include: { recoveryCodes: { orderBy: { id: "asc" } }, passwordResets: { orderBy: { id: "asc" } }, mfaChallenges: { orderBy: { id: "asc" } } } });
  for (const v of [u.mfaSecret, u.mfaPendingSecret, u.passwordHash]) if (v) known.add(v);
  add(file, `users #${u.id}  role=${u.role}  chefId=${u.chefId ?? "—"}  status=${u.status}  mfaEnabled=${u.mfaEnabled}  tokenVersion=${u.tokenVersion}  mfaLastStep=${u.mfaLastStep ?? "—"}`);
  add(file, `  passwordHash: vân tay ${print(u.passwordHash)}`);
  add(file, `  mfaSecret: ${u.mfaSecret ? `<bản mã, ${u.mfaSecret.length} ký tự, vân tay ${print(u.mfaSecret)}>` : "—"}`);
  add(file, `  recovery_codes: ${u.recoveryCodes.length} mã, ${u.recoveryCodes.filter((c) => c.usedAt).length} đã dùng`);
  for (const c of u.recoveryCodes.slice(0, 3)) { known.add(c.codeHash); add(file, `    #${c.id} codeHash=${hashHead(c.codeHash)} usedAt=${time(c.usedAt)}`); }
  for (const c of u.mfaChallenges) { known.add(c.tokenHash); add(file, `  mfa_challenges #${c.id}: tokenHash=${hashHead(c.tokenHash)} hạn=${time(c.expiresAt)} usedAt=${time(c.usedAt)}`); }
  for (const p of u.passwordResets) { known.add(p.tokenHash); add(file, `  password_resets #${p.id}: tokenHash=${hashHead(p.tokenHash)} hạn=${time(p.expiresAt)} usedAt=${time(p.usedAt)}`); }
  for (const l of await prisma.rateLimit.findMany({ where: { key: { in: [`mfa-fail:user:${u.id}`, `login-fail:email:${email}`] } } })) add(file, `  rate_limits ${l.key}  count=${l.count}  lockedUntil=${time(l.lockedUntil)}`);
  add(file);
}
async function dbDishes(file, heading, ids) {
  add(file, `## ${heading}  (lúc ${time(new Date())})\n`);
  for (const d of await prisma.dish.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } })) add(file, `dishes #${d.id}  name="${d.name}"  chefId=${d.chefId}  status=${d.status}`);
  add(file);
}

// ---------- Network của Chrome ----------
const NET = "network/network-log.md";
const REQ_H = ["origin", "content-type", "authorization", "access-control-request-method", "access-control-request-headers"];
const RES_H = ["access-control-allow-origin", "access-control-allow-headers", "access-control-allow-methods", "access-control-expose-headers", "cache-control", "retry-after"];
function network(heading, calls) {
  add(NET, `## ${heading}\n`);
  for (const c of calls) {
    const u = new URL(c.url);
    add(NET, `### ${c.method} ${u.pathname}${u.search} → ${c.status} (${c.type})\n`);
    add(NET, "```");
    const headers = { ...(c.sentHeaders ?? {}), ...(c.reqHeaders ?? {}) };
    add(NET, "Request headers");
    for (const [k, v] of Object.entries(headers)) if (REQ_H.includes(k.toLowerCase())) add(NET, `  ${k}: ${k.toLowerCase() === "authorization" ? "Bearer <JWT đã che>" : v}`);
    if (!Object.keys(headers).some((k) => k.toLowerCase() === "authorization")) add(NET, "  (không có Authorization)");
    if (c.postData) add(NET, `Request body\n  ${c.postData}`);
    add(NET, "Response headers");
    for (const [k, v] of Object.entries(c.resHeaders ?? {})) if (RES_H.includes(k.toLowerCase())) add(NET, `  ${k}: ${v}`);
    if (c.body) add(NET, `Response body\n  ${c.body.length > 300 ? `${c.body.slice(0, 300)}…` : c.body}`);
    add(NET, "```\n");
  }
}

async function run() {
  const b = await openBrowser();
  await b.viewport(1280);
  const shot = async (name) => shots.set(`screens/${name}.png`, await b.screenshot());
  const shot3 = async (name) => { for (const w of [1280, 820, 375]) { await b.viewport(w); await sleep(250); await shot(`${name}-${w}`); } await b.viewport(1280); };
  const path = () => b.eval("return location.pathname + location.search;");
  const text = () => b.eval("return document.body.innerText;");
  const until = (cond) => b.waitFor(cond, 20000);
  const hasText = (t) => until(`document.body.innerText.includes(${JSON.stringify(t)})`);
  const open = async (p) => { await b.goto(WEB + p); await sleep(350); };
  const fill = (form, values) => b.eval(`const f = document.querySelector(${JSON.stringify(form)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    for (const [k, v] of Object.entries(${JSON.stringify(values)})) { const el = f.elements[k]; set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); } return 1;`);
  const submit = (form) => b.eval(`document.querySelector(${JSON.stringify(form)}).requestSubmit(); return 1;`);
  const clickText = (t) => b.eval(`const el = [...document.querySelectorAll("button, a")].find((x) => x.textContent.trim() === ${JSON.stringify(t)}); el.click(); return 1;`);
  const clearSession = async () => { await open("/dishes"); await b.eval("sessionStorage.clear(); localStorage.clear(); return 1;"); await b.goto(`${WEB}/dishes`); await sleep(300); };
  const storage = async (file, heading) => {
    const s = JSON.parse(await b.eval("return JSON.stringify({ session: { ...sessionStorage }, local: { ...localStorage } });"));
    add(file, `## ${heading}\n`);
    for (const [area, items] of [["sessionStorage", s.session], ["localStorage", s.local]]) {
      add(file, `${area}: ${Object.keys(items).length} khoá`);
      for (const [k, v] of Object.entries(items)) {
        const d = v.split(".").length === 3 ? jwt.decode(v) : null;
        if (d) known.add(v); // chỉ JWT mới là bí mật; "admin" do script tự ghi vào storage thì không
        add(file, `  ${k} = ${d ? `<JWT, dài ${v.length} ký tự, chữ ký đã che>  payload: ${JSON.stringify(d)}` : v}`);
      }
    }
    add(file);
    return s;
  };
  const uiLogin = async (email, password) => {
    await clearSession();
    await open("/login");
    await fill("form.auth-form", { email, password });
    b.takeCalls && (await b.takeCalls());
    await submit("form.auth-form");
    await until(`location.pathname !== "/login" || document.querySelector(".banner")`);
    await sleep(500);
  };
  const noOverflow = async (file, label) => {
    const over = [];
    for (const w of [1280, 820, 375, 320]) { await b.viewport(w); await sleep(200); const n = await b.eval("return document.documentElement.scrollWidth - document.documentElement.clientWidth;"); if (n > 0) over.push(`${w}px: ${n}`); }
    await b.viewport(1280);
    check(file, over.length === 0, `${label}: không cuộn ngang ở 1280, 820, 375, 320${over.length ? ` (tràn ${over.join(", ")})` : ""}`);
  };
  const maskPage = () => b.eval(`
    document.querySelectorAll(".mfa-secret").forEach((e) => { e.textContent = "•••• •••• •••• (đã che)"; });
    document.querySelectorAll(".mfa-qr").forEach((e) => { e.src = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="#d9d6cf"/><text x="90" y="95" text-anchor="middle" font-size="16" fill="#5f5f5a">QR đã che</text></svg>'); });
    document.querySelectorAll("[data-recovery-codes] code").forEach((e) => { e.textContent = "•••••-•••••"; });
    return 1;`);

  try {
    await clearIp();
    const A = await prisma.user.findUnique({ where: { email: EDITOR_A } });
    const B = await prisma.user.findUnique({ where: { email: EDITOR_B } });
    const [tViewer, tA, tB, tAdmin] = [await login(VIEWER), await login(EDITOR_A), await login(EDITOR_B), await login(ADMIN)];
    const tagId = (await prisma.tag.findFirst({ where: { name: "Món nước" } })).id;
    const ingredientId = (await prisma.ingredient.findFirst({ orderBy: { id: "asc" } })).id;
    const form = (name, chefId, extra = {}) => ({ name, price: 50000, description: "mô tả", tagIds: [tagId], ingredientIds: [ingredientId], chefId, available: true, ...extra });
    const draft = (await raw("POST", "/api/dishes", { token: tA, body: form(`${T} Nháp của A`, A.chefId) })).data;
    const dishRow = () => prisma.dish.findUnique({ where: { id: draft.id } });
    const publishedA = await prisma.dish.findFirst({ where: { chefId: A.chefId, status: "published" }, orderBy: { id: "asc" } });
    const draftB = await prisma.dish.findFirst({ where: { chefId: B.chefId, status: "draft" }, orderBy: { id: "asc" } });

    // ===== Slide 67, ca 1: chưa đăng nhập =====
    {
      const F = "curl/01-chua-dang-nhap.txt";
      const before = await snapshot();
      for (const [m, p] of [["POST", "/api/dishes"], ["PATCH", `/api/dishes/${draft.id}`], ["DELETE", `/api/dishes/${draft.id}`], ["POST", "/api/chefs"], ["GET", "/api/tags"]]) {
        const res = await call(F, m, p, m === "GET" || m === "DELETE" ? {} : { body: { name: `${T} ghi` } });
        check(F, res.status === 401 && res.code === "UNAUTHENTICATED" && res.json.ok === false, `${m} ${p} → 401`);
      }
      check(F, (await snapshot()) === before, "Dữ liệu không đổi");
      await clearSession();
      await open("/admin/dishes");
      await until(`location.pathname === "/login"`);
      check(F, (await path()).includes("next=%2Fadmin%2Fdishes"), `Route guard: ${await path()}, nhớ trang đang mở`);
      await shot("01-chua-dang-nhap-ve-login-1280");
    }

    // ===== Slide 67, ca 2: thiếu quyền =====
    {
      const F = "curl/02-thieu-quyen.txt";
      const before = await snapshot();
      for (const [token, who, m, p] of [[tViewer, "Viewer", "POST", "/api/dishes"], [tViewer, "Viewer", "PATCH", `/api/dishes/${draft.id}`], [tViewer, "Viewer", "DELETE", `/api/dishes/${draft.id}`], [tA, "Editor", "DELETE", `/api/dishes/${draft.id}`], [tB, "Editor B, món của A", "PATCH", `/api/dishes/${draft.id}`], [tA, "Editor A, món published", "PATCH", `/api/dishes/${publishedA.id}`]]) {
        const res = await call(F, m, p, { token, note: who, ...(m === "DELETE" ? {} : { body: { name: `${T} sửa` } }) });
        check(F, res.status === 403 && res.code === "FORBIDDEN", `${who} ${m} ${p} → 403`);
      }
      check(F, (await snapshot()) === before, "Dữ liệu không đổi");
      await dbDishes("db/02-thieu-quyen.txt", "Món liên quan", [draft.id, publishedA.id, draftB.id]);

      await uiLogin(VIEWER, PW);
      network("2a. Viewer đăng nhập: POST /api/auth/login, sau đó GET /api/auth/me kèm Bearer", await b.takeCalls());
      await until(`document.querySelector("table")`);
      await storage("storage/01-sau-dang-nhap.txt", "Viewer đã đăng nhập: chỉ có accessToken, không lưu role, userId");
      const tv = await text();
      check(F, tv.includes("chỉ có quyền xem") && !tv.includes("+ Thêm món") && !(await b.eval(`return Boolean(document.querySelector("td.actions"));`)), "Viewer: không có nút ghi, có dòng chỉ xem");
      await shot3("02-viewer-chi-doc");
      await open("/admin/dishes/new");
      await hasText("Không đủ quyền");
      check(F, Boolean(JSON.parse(await b.eval("return JSON.stringify(sessionStorage.getItem('accessToken'));"))), "403: vẫn giữ token");
      await shot3("03-thieu-quyen-trong-trang");
      await noOverflow("curl/15-giao-dien.txt", "Thiếu quyền");

      await uiLogin(EDITOR_A, PW);
      await until(`document.querySelector("table")`);
      await open(`/admin/dishes/${draftB.id}/edit`);
      await hasText("Không đủ quyền");
      await shot("04-editor-sai-chu-1280");
      await open(`/admin/dishes/${publishedA.id}/edit`);
      await hasText("Không đủ quyền");
      await shot("05-editor-mon-published-375");
      await open("/admin/dishes?status=draft");
      await until(`document.querySelector("table")`);
      check(F, (await text()).includes(draft.name) && !(await text()).includes(draftB.name), "Editor A lọc Nháp: thấy món của mình, không thấy của B");
      await shot3("06-editor-loc-nhap");
      await noOverflow("curl/15-giao-dien.txt", "Danh sách món của Editor");

      // Mở form, Admin xuất bản, Editor mới bấm Lưu.
      await open(`/admin/dishes/${draft.id}/edit`);
      await until(`document.querySelector("form.form")`);
      check(F, !(await b.eval(`return Boolean(document.querySelector('select[name="status"]'));`)) && (await text()).includes("Lưu nháp") && !(await text()).includes("Đầu bếp phụ trách"), "Form của Editor: không có ô Trạng thái, Đầu bếp");
      await shot3("07-form-editor");
      await noOverflow("curl/15-giao-dien.txt", "Form của Editor");
      await raw("PATCH", `/api/dishes/${draft.id}`, { token: tAdmin, body: { status: "published" } });
      await fill("form.form", { name: `${T} sửa sau khi xuất bản` });
      await b.takeCalls();
      await submit("form.form");
      await hasText("Không đủ quyền");
      network("2b. Editor gửi form đã mở, món vừa được xuất bản → 403, giữ token", await b.takeCalls());
      check(F, (await dishRow()).name === draft.name && Boolean(JSON.parse(await b.eval("return JSON.stringify(sessionStorage.getItem('accessToken'));"))), "Dữ liệu không đổi, vẫn giữ token");
      await shot("08-gui-form-sau-khi-xuat-ban-1280");
      await raw("PATCH", `/api/dishes/${draft.id}`, { token: tAdmin, body: { status: "draft" } });

      // Editor tạo món qua giao diện: không gửi chefId, status.
      await open("/admin/dishes/new");
      await until(`document.querySelector("form.form")`);
      await fill("form.form", { name: `${T} Editor tạo qua web`, price: "45000" });
      await b.eval(`[...document.querySelectorAll('fieldset input[type="checkbox"]')][0].click(); return 1;`);
      await b.eval(`const i = [...document.querySelectorAll('fieldset input')].find((x) => (x.placeholder ?? "").includes("nguyên liệu")); i.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "Tôm"); i.dispatchEvent(new Event("input", { bubbles: true })); return 1;`);
      await sleep(300);
      await b.eval(`const o = document.querySelector('[role="option"]'); o.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); o.click(); return 1;`);
      await sleep(200);
      await b.takeCalls();
      await submit("form.form");
      await until(`location.search.includes("msg=dish-created")`);
      const posted = (await b.takeCalls()).filter((c) => c.method === "POST");
      network("2c. Editor thêm món qua web: body không có chefId, status", posted);
      const made = await prisma.dish.findFirst({ where: { name: `${T} Editor tạo qua web` } });
      check(F, made?.chefId === A.chefId && made?.status === "draft" && !posted[0].postData.includes("chefId") && (await path()).includes("status=draft"), "Editor tạo món: server gán đầu bếp và Nháp, về danh sách lọc Nháp");
      await shot("09-editor-tao-mon-xong-1280");

      await uiLogin(ADMIN, PW);
      await until(`document.querySelector("table")`);
      await shot3("10-admin-danh-sach");
      await noOverflow("curl/15-giao-dien.txt", "Danh sách món của Admin");
      check(F, await b.eval(`const t = document.querySelector(".table-wrap"); return t.scrollWidth - t.clientWidth === 0;`), "Admin ở 1280px: bảng không tràn, nút Xoá trong khung");
      await open(`/admin/dishes/${draft.id}/edit`);
      await until(`document.querySelector("form.form")`);
      check(F, await b.eval(`return Boolean(document.querySelector('select[name="status"]'));`), "Form của Admin có ô Trạng thái");
      await shot("11-form-admin-1280");
    }

    // ===== Slide 67, ca 3: gọi trực tiếp giống qua giao diện =====
    {
      const F = "curl/03-goi-truc-tiep.txt";
      await uiLogin(EDITOR_A, PW);
      await until(`document.querySelector("table")`);
      await open(`/admin/dishes/${draft.id}/edit`);
      await until(`document.querySelector("form.form")`);
      await fill("form.form", { name: `${T} Sửa qua web` });
      await b.takeCalls();
      await submit("form.form");
      await until(`location.search.includes("msg=dish-updated")`);
      const ui = (await b.takeCalls()).find((c) => c.method === "PATCH");
      network("3. Editor sửa món nháp của mình qua giao diện", [ui]);
      const direct = await call(F, "PATCH", `/api/dishes/${draft.id}`, { token: tA, body: { name: draft.name }, note: "cùng thao tác, gọi trực tiếp" });
      check(F, ui.status === 200 && direct.status === 200 && direct.json.ok === true, "Qua giao diện và gọi trực tiếp: cùng 200, ok true");
      const denied = await call(F, "PATCH", `/api/dishes/${draftB.id}`, { token: tA, body: { name: `${T} x` }, note: "món của B" });
      check(F, denied.status === 403, "Trực tiếp sửa món của B → 403 như trang báo thiếu quyền");
    }

    // ===== Slide 67, ca 4, 5: JWT bị sửa, hết hạn, sửa role ở trình duyệt =====
    {
      const F = "curl/04-jwt-bi-sua-het-han.txt";
      const claims = jwt.decode(tViewer);
      const [h, , s] = tViewer.split(".");
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const forged = `${h}.${b64({ ...claims, role: "admin" })}.${s}`;
      known.add(forged);
      let res = await call(F, "GET", "/api/auth/me", { token: forged, note: "sửa payload, giữ chữ ký cũ" });
      check(F, res.status === 401 && res.code === "UNAUTHENTICATED", "Sửa payload → 401 UNAUTHENTICATED");
      const expired = jwt.sign({ tv: claims.tv }, process.env.JWT_SECRET, { algorithm: "HS256", subject: claims.sub, issuer: claims.iss, audience: claims.aud, expiresIn: -60 });
      known.add(expired);
      res = await call(F, "GET", "/api/auth/me", { token: expired, note: "token đã quá exp" });
      check(F, res.status === 401 && res.code === "TOKEN_EXPIRED", "Quá exp → 401 TOKEN_EXPIRED");

      await uiLogin(VIEWER, PW);
      await until(`document.querySelector("table")`);
      await b.eval(`sessionStorage.setItem("role", "admin"); localStorage.setItem("role", "admin"); localStorage.setItem("userId", "1"); return 1;`);
      await storage("storage/02-sua-role-trong-storage.txt", "Viewer tự thêm role=admin vào storage");
      await open("/admin/dishes");
      await until(`document.querySelector("table")`);
      check(F, !(await text()).includes("+ Thêm món"), "Thêm role=admin vào storage: giao diện không đổi");
      await b.takeCalls();
      const write = await b.eval(`const r = await fetch("${API}/api/dishes", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + sessionStorage.getItem("accessToken") }, body: "{}" }); return r.status;`);
      network("5a. Viewer đã sửa role trong storage, tự gửi POST /api/dishes", await b.takeCalls());
      check(F, write === 403, `Sửa role trong storage rồi gửi request: ${write}`);
      await shot("12-sua-role-storage-van-chi-doc-1280");

      await b.eval(`sessionStorage.setItem("accessToken", ${JSON.stringify(forged)}); localStorage.clear(); sessionStorage.removeItem("role"); return 1;`);
      await b.takeCalls();
      await open("/admin/dishes/new");
      await until(`location.pathname === "/login"`);
      await sleep(300);
      network("5b. Token bị sửa: 401, web xoá token, về đăng nhập", await b.takeCalls());
      const after = await storage("storage/03-token-bi-sua.txt", "Sau 401");
      check(F, !after.session.accessToken && (await path()).includes("next=%2Fadmin%2Fdishes%2Fnew") && (await text()).includes("hết hạn"), `401: xoá token, nhớ trang đang mở: ${await path()}`);
      await shot("13-token-bi-sua-ve-login-375");
      await fill("form.auth-form", { email: VIEWER, password: PW });
      await submit("form.auth-form");
      await until(`location.pathname === "/admin/dishes/new"`);
      await hasText("Không đủ quyền");
      check(F, true, "Đăng nhập lại: về đúng trang đang mở");

      await b.eval(`sessionStorage.setItem("accessToken", ${JSON.stringify(expired)}); return 1;`);
      await open("/admin/dishes");
      await until(`location.pathname === "/login"`);
      check(F, !(await storage("storage/04-token-het-han.txt", "Sau 401 TOKEN_EXPIRED")).session.accessToken, "Token hết hạn: xoá token, về đăng nhập");

      // Lỗi mạng, 500 không đăng xuất (slide 39).
      await uiLogin(VIEWER, PW);
      await until(`document.querySelector("table")`);
      await stopServer();
      await open("/admin/dishes");
      await hasText("Không tải được dữ liệu");
      check(F, Boolean(JSON.parse(await b.eval("return JSON.stringify(sessionStorage.getItem('accessToken'));"))) && (await path()) === "/admin/dishes", "API tắt: báo lỗi kỹ thuật, không đăng xuất, giữ token");
      await shot("14-api-tat-khong-dang-xuat-1280");
      await startServer({ PORT: "3000", MAIL_TRANSPORT: "file", WEB_ORIGIN: WEB, APP_ORIGIN: WEB });
      await clickText("Thử lại");
      await until(`document.querySelector("table")`);
      check(F, true, "API chạy lại: Thử lại tải được, vẫn đăng nhập");
    }

    // ===== Slide 67, ca 6, 7: preflight, route công khai =====
    {
      const F = "curl/05-preflight.txt";
      const res = await call(F, "OPTIONS", `/api/dishes/${draft.id}`, { headers: { origin: WEB, "access-control-request-method": "PATCH", "access-control-request-headers": "authorization, content-type" }, note: "preflight" });
      for (const h of ["access-control-allow-origin", "access-control-allow-methods", "access-control-allow-headers"]) add(F, `  ${h}: ${res.headers.get(h)}`);
      check(F, res.status === 204 && res.headers.get("access-control-allow-origin") === WEB && res.headers.get("access-control-allow-headers").toLowerCase().includes("authorization"), "Preflight thành công, origin cụ thể, có Authorization");

      const P = "curl/06-cong-khai.txt";
      const list = await call(P, "GET", "/api/dishes?page=2&pageSize=12&q=c", { note: "tìm kiếm, phân trang, không token" });
      const [{ n }] = await prisma.$queryRaw`SELECT count(*)::int n FROM dishes WHERE name ILIKE '%c%' AND status = 'published'`;
      check(P, list.status === 200 && list.data.total === n && !("status" in list.data.items[0]), `total khớp SQL viết tay (${n}), response không thêm trường`);
      const all = await call(P, "GET", "/api/dishes?pageSize=100&page=12", { note: "trang cuối" });
      check(P, all.data.total === 1200 && all.data.items.at(-1).id === 1200, "Đúng 1.200 món như block7, trang cuối kết thúc ở id 1200");
      const ft = await call(P, "GET", `/api/dishes?mode=fulltext&q=${encodeURIComponent("nước dùng")}&pageSize=3`, { note: "toàn văn" });
      const fz = await call(P, "GET", `/api/dishes?mode=fuzzy&q=${encodeURIComponent("Bò lúc lắt")}&pageSize=3`, { note: "gần đúng" });
      check(P, ft.status === 200 && ft.data.total > 0 && fz.status === 200 && fz.data.total > 0, "Tìm toàn văn, gần đúng vẫn chạy không token");
      const draftList = await raw("GET", `/api/dishes/${draftB.id}`);
      check(P, draftList.code === "NOT_FOUND", "Món nháp ở route công khai: NOT_FOUND");

      await uiLogin(VIEWER, PW);
      await until(`document.querySelector("table")`);
      await b.takeCalls();
      await open("/dishes");
      await until(`document.querySelector(".dish-card, .menu-grid a, article")`);
      await sleep(500);
      const pub = (await b.takeCalls()).filter((c) => c.url.includes("/api/dishes"));
      network("6. Đã đăng nhập, mở thực đơn: GET /api/dishes KHÔNG kèm Authorization, không preflight", pub);
      const anyAuth = pub.some((c) => Object.keys({ ...c.sentHeaders, ...c.reqHeaders }).some((k) => k.toLowerCase() === "authorization") || c.type === "Preflight");
      check(P, pub.length > 0 && !anyAuth, "Route công khai: Chrome không gửi Authorization dù đang đăng nhập");
      await shot3("15-thuc-don");
      await noOverflow("curl/15-giao-dien.txt", "Thực đơn");
      await open("/dishes/1");
      await until(`document.querySelector("h1")`);
      await shot3("16-chi-tiet-mon");
      await noOverflow("curl/15-giao-dien.txt", "Chi tiết món");
      await open("/dishes?mode=fulltext&q=" + encodeURIComponent("nước dùng"));
      await sleep(900);
      await shot("17-tim-toan-van-1280");
    }

    // ===== Slide 68: đăng ký, pending, CAPTCHA =====
    {
      const F = "curl/07-dang-ky-pending-captcha.txt";
      await clearIp();
      await clearOutbox();
      const email = "dangky@demo.example";
      const res = await call(F, "POST", "/api/auth/register", { body: { email, username: "Người thử", password: DEMO_PW, passwordConfirm: DEMO_PW, captchaToken: "token-thu", role: "admin" }, note: "gửi kèm role: admin (key thử của Google)" });
      await dbUser("db/03-dang-ky.txt", "Sau khi đăng ký", email);
      const u = await prisma.user.findUnique({ where: { email } });
      check(F, res.json.ok && u.role === "viewer" && u.status === "pending", `Bản ghi có role ${u.role}, status ${u.status}`);
      const pending = await call(F, "POST", "/api/auth/login", { body: { email, password: DEMO_PW }, note: "tài khoản pending" });
      check(F, pending.code === "ACCOUNT_NOT_ACTIVATED" && !pending.text.includes("accessToken"), "Pending: ACCOUNT_NOT_ACTIVATED, không có accessToken");
      await uiLogin(email, DEMO_PW);
      network("7a. Tài khoản pending đăng nhập qua web: không có accessToken", await b.takeCalls());
      await hasText("chưa được kích hoạt");
      check(F, !(await storage("storage/05-tai-khoan-pending.txt", "Tài khoản pending đăng nhập")).session.accessToken, "Pending: storage không có token");
      await shot("18-tai-khoan-pending-375");
      await b.eval(`[...document.querySelectorAll(".banner a")][0].click(); return 1;`);
      await until(`location.pathname === "/activate"`);
      await sleep(300);
      const otp = otpIn(await waitMail(email, "activation"));
      await fill("form.auth-form", { otp });
      await shot3("19-nhap-ma-kich-hoat");
      await noOverflow("curl/15-giao-dien.txt", "Nhập mã kích hoạt");
      await submit("form.auth-form");
      await until(`location.search.includes("msg=activated")`);
      await hasText("đã được kích hoạt");
      check(F, (await prisma.user.findUnique({ where: { email } })).status === "active", "Kích hoạt qua web: active, không tự đăng nhập");

      const br = await demoUser("brute");
      for (let i = 1; i <= 3; i++) await call(F, "POST", "/api/auth/login", { body: { email: br.email, password: "sai-mat-khau-1" }, note: `sai lần ${i}` });
      const noCap = await call(F, "POST", "/api/auth/login", { body: { email: br.email, password: DEMO_PW }, note: "đúng password, bỏ CAPTCHA" });
      check(F, noCap.code === "CAPTCHA_REQUIRED" && !noCap.text.includes("accessToken"), "Sai đến ngưỡng, bỏ CAPTCHA: CAPTCHA_REQUIRED, không có token");
      await dbUser("db/04-dem-sai-dang-nhap.txt", "Bộ đếm sau 3 lần sai", br.email);
      await uiLogin(br.email, DEMO_PW);
      await hasText("nhập sai nhiều lần");
      await until(`document.querySelector('iframe[src*="recaptcha"]')`).catch(() => {});
      await shot("20-dang-nhap-can-captcha-375");
      await open("/forgot");
      await sleep(400);
      await noOverflow("curl/15-giao-dien.txt", "Trang /forgot");
      // Widget CAPTCHA chọn cỡ lúc dựng theo bề rộng màn hình, nên phải mở trang đúng ở 320px mới đo được như trên máy thật.
      await b.viewport(320);
      await open("/register");
      await sleep(1500);
      check("curl/15-giao-dien.txt", (await b.eval("return document.documentElement.scrollWidth - document.documentElement.clientWidth;")) === 0, "Trang /register mở ở 320px: không cuộn ngang");
      await b.viewport(1280);
      await open("/register");
      await sleep(600);
      await shot3("21-dang-ky");
      await open("/login");
      await sleep(400);
      await shot3("22-dang-nhap");
    }

    // ===== Slide 68: MFA =====
    const demo = await demoUser("mfa.demo");
    let secret, codes, usedOtp;
    {
      const F = "curl/08-mfa.txt";
      await clearIp();
      await uiLogin(demo.email, DEMO_PW);
      await until(`document.querySelector("table")`);
      await open("/admin/security");
      await hasText("Chưa bật");
      await shot3("23-bao-mat-chua-bat");
      await noOverflow("curl/15-giao-dien.txt", "Bảo mật hai lớp");
      await b.takeCalls();
      await clickText("Bật xác thực hai lớp");
      await until(`document.querySelector(".mfa-secret")`);
      network("8a. POST /api/auth/mfa/setup: secret trả một lần, no-store", await b.takeCalls());
      secret = (await b.eval(`return document.querySelector(".mfa-secret").textContent;`)).replace(/\s/g, "");
      known.add(secret);
      await noOverflow("curl/15-giao-dien.txt", "Thiết lập MFA");
      await maskPage();
      await shot3("24-thiet-lap-mfa-da-che");
      await storage("storage/06-dang-thiet-lap-mfa.txt", "Đang thiết lập: secret không nằm trong storage");
      check(F, !JSON.stringify(await b.eval("return JSON.stringify({ ...sessionStorage, ...localStorage, h: JSON.stringify(history.state), u: location.href });")).includes(secret), "Secret không có trong storage, URL, history");
      await fill("form.mfa-form", { otp: totp(secret, -1) });
      await b.takeCalls();
      await submit("form.mfa-form");
      await until(`document.querySelector("[data-recovery-codes]")`);
      network("8b. Xác nhận: 10 recovery code trả một lần", await b.takeCalls());
      codes = await b.eval(`return [...document.querySelectorAll("[data-recovery-codes] code")].map((e) => e.textContent);`);
      codes.forEach((c) => known.add(c).add(c.replace("-", "")));
      await noOverflow("curl/15-giao-dien.txt", "Recovery code");
      await maskPage();
      await shot3("25-ma-khoi-phuc-da-che");
      await dbUser("db/05-mfa.txt", "Đã bật MFA", demo.email);
      await b.eval(`document.querySelector('.ack input').click(); return 1;`);
      await submit("form.codes-done");
      await hasText("Đã bật");
      await shot("26-bao-mat-da-bat-1280");

      await b.takeCalls();
      await clickText("Đăng xuất");
      await until(`location.pathname === "/login"`);
      check(F, !(await storage("storage/07-sau-dang-xuat.txt", "Sau đăng xuất: web xoá token")).session.accessToken, "Đăng xuất: xoá token ở trình duyệt");
      await uiLogin(demo.email, DEMO_PW);
      network("8c. Password đúng, đã bật MFA: next mfa, có challenge, KHÔNG có accessToken", await b.takeCalls());
      await until(`location.pathname === "/login/mfa"`);
      check(F, !(await storage("storage/08-cho-mfa.txt", "Chờ MFA: chưa có token")).session.accessToken, "Chờ MFA: storage không có accessToken, challenge chỉ ở bộ nhớ");
      await shot3("27-buoc-nhap-ma");
      await noOverflow("curl/15-giao-dien.txt", "Bước nhập mã");
      const direct = await call(F, "POST", "/api/auth/login", { body: { email: demo.email, password: DEMO_PW }, note: "đúng password, đã bật MFA" });
      known.add(direct.data.challenge);
      check(F, direct.data.next === "mfa" && direct.data.challenge && !direct.text.includes("accessToken"), "Có next mfa, không có accessToken");
      const onData = await call(F, "GET", "/api/admin/dishes", { token: direct.data.challenge, note: "challenge gửi tới route dữ liệu" });
      check(F, onData.status === 401, "Challenge ở route dữ liệu → 401");

      usedOtp = totp(secret);
      await fill("form.auth-form", { otp: usedOtp });
      await b.takeCalls();
      await submit("form.auth-form");
      await until(`location.pathname.startsWith("/admin")`);
      await sleep(400);
      network("8d. Nhập đúng mã: có accessToken", await b.takeCalls());
      await storage("storage/09-sau-mfa.txt", "Sau MFA");
      await dbUser("db/05-mfa.txt", "Sau khi đăng nhập qua MFA", demo.email);

      // Dùng lại mã, sai quá giới hạn.
      await uiLogin(demo.email, DEMO_PW);
      await until(`location.pathname === "/login/mfa"`);
      await fill("form.auth-form", { otp: usedOtp });
      await submit("form.auth-form");
      await until(`document.querySelector(".banner-error")`);
      check(F, (await text()).includes("đã được dùng"), "Mã đã dùng bị từ chối");
      await shot("28-ma-da-dung-375");
      await prisma.rateLimit.deleteMany({ where: { key: `mfa-fail:user:${demo.id}` } });
      const bad = totp(secret) === "000000" ? "111111" : "000000";
      for (let i = 0; i < 5; i++) { await fill("form.auth-form", { otp: bad }); await sleep(80); await submit("form.auth-form"); await sleep(1200); }
      await hasText("Sai quá nhiều lần");
      await shot3("29-sai-5-lan-tam-khoa");
      await dbUser("db/05-mfa.txt", "Sau 5 lần sai", demo.email);
      await prisma.rateLimit.deleteMany({ where: { key: `mfa-fail:user:${demo.id}` } });

      // Recovery code dùng lần hai.
      const R = "curl/09-recovery.txt";
      await uiLogin(demo.email, DEMO_PW);
      await until(`location.pathname === "/login/mfa"`);
      await clickText("Dùng mã khôi phục");
      await until(`location.pathname === "/login/mfa/recovery"`);
      await shot3("30-nhap-ma-khoi-phuc");
      await noOverflow("curl/15-giao-dien.txt", "Nhập mã khôi phục");
      await fill("form.auth-form", { code: codes[0] });
      await b.takeCalls();
      await submit("form.auth-form");
      await until(`location.pathname === "/admin/security"`);
      await hasText("vừa đăng nhập bằng mã khôi phục");
      network("9a. Recovery code lần đầu", await b.takeCalls());
      check(R, Boolean((await prisma.recoveryCode.findUnique({ where: { codeHash: hashRecovery(codes[0]) } })).usedAt), "Dùng lần đầu: usedAt có giá trị");
      await shot("31-nhac-doi-thiet-bi-1280");
      await uiLogin(demo.email, DEMO_PW);
      await until(`location.pathname === "/login/mfa"`);
      await clickText("Dùng mã khôi phục");
      await until(`location.pathname === "/login/mfa/recovery"`);
      await fill("form.auth-form", { code: codes[0] });
      await b.takeCalls();
      await submit("form.auth-form");
      await until(`document.querySelector(".banner-error")`);
      network("9b. Recovery code lần hai: INVALID_OTP", await b.takeCalls());
      check(R, (await text()).includes("đã được dùng"), "Dùng lần hai bị từ chối");
      await shot("32-recovery-dung-lai-375");
      await prisma.rateLimit.deleteMany({ where: { key: `mfa-fail:user:${demo.id}` } });
      await dbUser("db/06-recovery.txt", "Sau hai lần dùng", demo.email);
    }

    // ===== Slide 68: reset password =====
    {
      const F = "curl/10-reset-password.txt";
      await clearIp();
      await clearOutbox();
      const direct = await raw("POST", "/api/auth/login", { body: { email: demo.email, password: DEMO_PW } });
      const mfa = await raw("POST", "/api/auth/mfa", { body: { challenge: direct.data.challenge, recoveryCode: codes[1] } });
      const oldJwt = mfa.data.accessToken;
      known.add(oldJwt);
      await dbUser("db/07-reset.txt", "Trước khi reset", demo.email);
      const before = await prisma.user.findUnique({ where: { id: demo.id } });
      await clearSession();
      await open("/forgot");
      await fill("form.auth-form", { email: demo.email });
      await submit("form.auth-form");
      await hasText("Kiểm tra email của bạn");
      await shot("33-quen-mat-khau-da-gui-375");
      const raw1 = await waitMail(demo.email, "reset");
      const link = resetLinkIn(raw1);
      known.add(new URL(link).searchParams.get("token"));
      add("mail/1-dat-lai-mat-khau.txt", raw1);
      check(F, link.startsWith(`${WEB}/reset?token=`), "Link trong thư về trang của web");
      await b.goto(link);
      await until(`document.querySelector("form.auth-form")`);
      await sleep(300);
      check(F, (await path()) === "/reset", `Token được bỏ khỏi thanh địa chỉ: ${await path()}`);
      await fill("form.auth-form", { password: NEW_PW, passwordConfirm: NEW_PW });
      await shot("34-dat-lai-mat-khau-375");
      await b.takeCalls();
      await submit("form.auth-form");
      await until(`location.search.includes("msg=password-reset")`);
      network("10a. Đặt mật khẩu mới: không cấp token", await b.takeCalls());
      await dbUser("db/07-reset.txt", "Sau khi reset", demo.email);
      const after = await prisma.user.findUnique({ where: { id: demo.id } });
      check(F, after.mfaEnabled && after.mfaSecret === before.mfaSecret && after.tokenVersion === before.tokenVersion + 1, "Reset không tắt MFA, tokenVersion tăng");
      const old = await call(F, "GET", "/api/auth/me", { token: oldJwt, note: "JWT cấp trước khi reset (plan 12.7)" });
      check(F, old.status === 401, "JWT cũ → 401");
      await uiLogin(demo.email, NEW_PW);
      await until(`location.pathname === "/login/mfa"`);
      network("10b. Đăng nhập bằng mật khẩu mới: vẫn qua MFA", await b.takeCalls());
      await shot("35-sau-reset-van-qua-mfa-375");
      check(F, true, "Reset xong đăng nhập: vẫn qua bước MFA");
    }

    // ===== Xác thực lại, tắt MFA =====
    {
      const F = "curl/11-xac-thuc-lai.txt";
      await prisma.rateLimit.deleteMany({ where: { key: `mfa-fail:user:${demo.id}` } });
      await clickText("Dùng mã khôi phục");
      await until(`location.pathname === "/login/mfa/recovery"`);
      await fill("form.auth-form", { code: codes[2] });
      await submit("form.auth-form");
      await until(`location.pathname === "/admin/security"`);
      await hasText("Tắt xác thực hai lớp");
      await clickText("Tắt xác thực hai lớp");
      await until(`document.querySelector("form.mfa-form")`);
      await shot3("36-xac-thuc-lai-de-tat");
      await noOverflow("curl/15-giao-dien.txt", "Xác thực lại");
      await fill("form.mfa-form", { password: NEW_PW, factor: "ZZZZZ-ZZZZZ" });
      await b.takeCalls();
      await submit("form.mfa-form");
      await hasText("Mật khẩu hoặc mã không đúng");
      network("11a. Sai yếu tố thứ hai: 200 INVALID_OTP, không đăng xuất", await b.takeCalls());
      check(F, Boolean(JSON.parse(await b.eval("return JSON.stringify(sessionStorage.getItem('accessToken'));"))) && (await prisma.user.findUnique({ where: { id: demo.id } })).mfaEnabled, "Sai mã: vẫn đăng nhập, MFA vẫn bật");
      await fill("form.mfa-form", { password: NEW_PW, factor: codes[3] });
      await b.takeCalls();
      await submit("form.mfa-form");
      await until(`location.search.includes("msg=mfa-disabled")`);
      network("11b. Đúng cả hai: tắt MFA, token hết hiệu lực, về đăng nhập", await b.takeCalls());
      await dbUser("db/08-tat-mfa.txt", "Sau khi tắt", demo.email);
      check(F, !(await prisma.user.findUnique({ where: { id: demo.id } })).mfaEnabled, "Đúng cả hai: MFA đã tắt");
      await shot("37-da-tat-mfa-1280");
    }

    // ===== Nơi lưu token: Reload, tab mới, đóng phiên (ghi chú 64) =====
    {
      const F = "curl/12-noi-luu-token.txt";
      await uiLogin(VIEWER, PW);
      await until(`document.querySelector("table")`);
      await open("/admin/dishes");
      await until(`document.querySelector("table")`);
      check(F, (await path()) === "/admin/dishes" && Boolean(JSON.parse(await b.eval("return JSON.stringify(sessionStorage.getItem('accessToken'));"))), "Reload: vẫn đăng nhập");
      const tab = await b.storageInNewTab(`${WEB}/admin/dishes`);
      add(F, `Tab mới mở cùng địa chỉ: sessionStorage có ${tab.session} khoá, đang ở ${tab.url}\n`);
      check(F, tab.session === 0 && tab.url === "/login", "Tab mới không có token: phải đăng nhập");
    }

    // ===== Log, bundle =====
    {
      const F = "curl/13-log-server.txt";
      const log = serverLog();
      for (const [name, v] of [["secret TOTP", secret], ["mật khẩu seed", PW], ["mật khẩu thử", DEMO_PW], ["JWT_SECRET", process.env.JWT_SECRET]]) check(F, !log.includes(v), `Log server không chứa ${name}`);
      check(F, !/eyJ[\w-]{10,}\./.test(log), "Log server không chứa JWT");
      check(F, !codes.some((c) => log.includes(c)), "Log server không chứa recovery code");

      const B = "curl/14-bundle-web.txt";
      const dist = fileURLToPath(new URL("../../web/dist/assets/", import.meta.url));
      let bundle = "";
      for (const f of await readdir(dist)) bundle += await readFile(dist + f, "utf8");
      add(B, `Đã quét ${(await readdir(dist)).length} tệp trong web/dist/assets, tổng ${bundle.length} ký tự.\n`);
      for (const [name, v] of [["JWT_SECRET", process.env.JWT_SECRET], ["OTP_PEPPER", process.env.OTP_PEPPER], ["MFA_ENCRYPTION_KEY", process.env.MFA_ENCRYPTION_KEY], ["mật khẩu seed", PW], ["chuỗi kết nối", process.env.DATABASE_URL]]) check(B, !bundle.includes(v), `Bundle không chứa ${name}`);
      const realSecret = (await readFile(new URL("../.env", import.meta.url), "utf8")).match(/^RECAPTCHA_SECRET_KEY=(.*)$/m)?.[1]?.trim();
      check(B, Boolean(realSecret) && !bundle.includes(realSecret), "Bundle không chứa secret key reCAPTCHA");
      check(B, !bundle.includes("dangerouslySetInnerHTML: ") , "Mã nguồn web không tự dùng dangerouslySetInnerHTML (React chỉ giữ tên thuộc tính)");
    }
  } finally {
    b.close();
  }
}

async function cleanup() {
  await prisma.dish.deleteMany({ where: { name: { startsWith: T } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: "@demo.example" } } });
  await prisma.rateLimit.deleteMany({});
  await clearOutbox();
}

await cleanup();
await startServer({ PORT: "3000", MAIL_TRANSPORT: "file", WEB_ORIGIN: WEB, APP_ORIGIN: WEB });
const preview = spawn("npx", ["vite", "preview"], { cwd: fileURLToPath(new URL("../../web/", import.meta.url)), stdio: "ignore", detached: true });
for (let i = 0; i < 100; i++) { try { if ((await fetch(WEB)).ok) break; } catch {} await sleep(200); }
let code = 0;
try {
  await run();
  await save();
  console.log(`Đã ghi ${files.size} tệp chữ, ${shots.size} ảnh.`);
  if (failed.length) { code = 1; console.log(`CHƯA ĐẠT ${failed.length} ca`); }
} catch (e) {
  code = 1;
  console.error(e);
  try { await save(); } catch (err) { console.error("Không ghi được bằng chứng:", err.message); }
} finally {
  try { process.kill(-preview.pid); } catch {}
  await cleanup();
  await stopServer();
  await prisma.$disconnect();
}
process.exit(code);
