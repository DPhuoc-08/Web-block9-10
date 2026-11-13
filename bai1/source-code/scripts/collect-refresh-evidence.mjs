// Thu bằng chứng cho ca "kẻ gian và chủ tài khoản cùng giữ một refresh token" (plan mục 15, 15.2 b). Chạy trong source-code/:
//   node scripts/collect-refresh-evidence.mjs
// Server thật ở cổng 3100. Hai Chrome headless ĐỘC LẬP (hai profile, không chung cookie): một là chủ tài khoản, một là kẻ gian.
// Kẻ gian "lấy trộm" bằng cách nhận đúng giá trị cookie refresh của chủ (như chép trong DevTools). Kịch bản A chạy trên Chrome,
// kịch bản B gửi request trực tiếp như curl -i. Tài khoản thử refresh.demo@demo.example, xoá ở cuối.
// Che: access / refresh token → vân tay 8 ký tự đầu SHA-256 (trùng 8 ký tự đầu cột tokenHash trong DB, nên đối chiếu được, không
// dùng lại được); mật khẩu → <đã che>. Còn sót token hay mật khẩu trong file nào thì không ghi gì.
import "./lib/test-env.mjs";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/auth/password.js";
import { openBrowser } from "./lib/browser.mjs";
import { client } from "./lib/client.mjs";
import { login } from "./lib/auth.mjs";
import { startServer, stopServer, serverLog } from "./lib/server.mjs";

const OUT = new URL("../../evidence/", import.meta.url);
const EMAIL = "refresh.demo@demo.example";
const PW = "mat-khau-demo-refresh-1";
const print = (v) => createHash("sha256").update(String(v)).digest("hex").slice(0, 8);
const time = (d) => (d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) + "Z" : "—");
const files = new Map();
const shots = new Map();
const known = new Set([PW, process.env.JWT_SECRET].filter(Boolean)); // mọi token gặp được thêm vào đây
const add = (path, line = "") => files.set(path, (files.get(path) ?? "") + line + "\n");
const remember = (v) => { if (v && v.length >= 20) known.add(v); return v; };

function mask(text) {
  let t = String(text);
  for (const v of [...known].sort((a, b) => b.length - a.length)) t = t.split(v).join(v === PW || v === process.env.JWT_SECRET ? "<đã che>" : `<đã che · vân tay ${print(v)}>`);
  return t;
}

// Payload của access token (base64url, ai cũng đọc được) — in ra để thấy iat/exp/fam, không in chữ ký.
function claimsOf(jwt) {
  try {
    const c = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
    return `sub=${c.sub} tv=${c.tv} fam=${String(c.fam).slice(0, 8)}… iat=${time(c.iat * 1000)} exp=${time(c.exp * 1000)} (exp − iat = ${c.exp - c.iat} giây)`;
  } catch { return "(không đọc được)"; }
}

// Một chặng Network như tab Cookies của DevTools: cookie gửi lên và Set-Cookie trả về.
function network(file, title, entries) {
  add(file, `### ${title}`);
  for (const e of entries) {
    add(file, `${e.method} ${new URL(e.url).pathname}${new URL(e.url).search}  →  ${e.status}${e.resHeaders.location ? `  Location: ${e.resHeaders.location}` : e.resHeaders.Location ? `  Location: ${e.resHeaders.Location}` : ""}`);
    // Cookie gửi lên kèm vân tay của access / refresh, để thấy request đang mang token nào (R0 hay R1).
    const sent = (e.reqHeaders.cookie ?? e.reqHeaders.Cookie ?? "").split(/;\s*/).filter(Boolean).map((c) => {
      const name = c.slice(0, c.indexOf("=")), value = decodeURIComponent(c.slice(c.indexOf("=") + 1));
      return name === "access" || name === "refresh" ? `${name} <vân tay ${print(remember(value))}>` : name;
    });
    add(file, `  Request Cookies : ${sent.length ? sent.join(", ") : "(không có)"}`);
    const setCookie = (e.resHeaders["set-cookie"] ?? e.resHeaders["Set-Cookie"] ?? "").split("\n").filter(Boolean);
    if (!setCookie.length) add(file, "  Response Cookies: (không có)");
    for (const line of setCookie) {
      const [pair, ...attrs] = line.split(/;\s*/);
      const name = pair.slice(0, pair.indexOf("="));
      const value = decodeURIComponent(pair.slice(pair.indexOf("=") + 1));
      remember(value);
      const keep = attrs.filter((a) => /^(max-age|path|httponly|samesite|expires)/i.test(a)).join("; ");
      add(file, `  Response Cookies: ${name} = ${value ? `<vân tay ${print(value)}>` : "(rỗng — xoá cookie)"}  ${keep}`);
      if (name === "access" && value) add(file, `                    payload access: ${claimsOf(value)}`);
    }
  }
  add(file);
}

async function dbRows(file, title) {
  const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true, tokenVersion: true } });
  const rows = await prisma.refreshToken.findMany({ where: { userId: user.id }, orderBy: { id: "asc" } });
  add(file, `### ${title}`);
  add(file, `users.tokenVersion = ${user.tokenVersion}`);
  add(file, "id      familyId   vân tay(tokenHash)  createdAt             usedAt                revokedAt             expiresAt");
  for (const r of rows) add(file, `${String(r.id).padEnd(7)} ${r.familyId.slice(0, 8)}…  ${r.tokenHash.slice(0, 8).padEnd(18)}  ${time(r.createdAt).padEnd(20)}  ${time(r.usedAt).padEnd(20)}  ${time(r.revokedAt).padEnd(20)}  ${time(r.expiresAt)}`);
  add(file);
}

// Nhãn nhỏ trên trang trước khi chụp, để ảnh tự nói là cửa sổ nào (script chèn, không phải giao diện của app).
const label = (page, text) => page.eval(`const d = document.createElement("div"); d.textContent = ${JSON.stringify(text)};
  d.style.cssText = "position:absolute;right:12px;top:76px;z-index:9999;background:#1f5b43;color:#fff;font:600 13px/1.4 system-ui;padding:6px 10px;border-radius:6px";
  document.body.appendChild(d); return 1;`);
// Ảnh món tải lười (loading=lazy): ép tải hết rồi mới chụp, để ảnh chụp cả trang không có ô trống.
const loadImages = (page) => page.eval(`document.querySelectorAll("img").forEach((i) => (i.loading = "eager"));
  await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 5000); }))));
  return 1;`);
async function shot(page, name, text) { await loadImages(page); await label(page, text); shots.set(`screens/${name}-1280.png`, await page.screenshot()); }

const N = "network/refresh-token-dung-lai.md", DB = "db/13-refresh-token-dung-lai.txt", CURL = "curl/16-refresh-token-dung-lai.txt";

await prisma.user.deleteMany({ where: { email: EMAIL } });
const user = await prisma.user.create({ data: { email: EMAIL, emailInput: EMAIL, username: "Demo refresh", passwordHash: await hashPassword(PW), status: "active", emailVerifiedAt: new Date() } });
await startServer({ MAIL_TRANSPORT: "file" });
const BASE = process.env.BASE_URL;
const owner = await openBrowser();
const thief = await openBrowser();
const cookie = async (page, name) => remember((await page.cookies()).find((c) => c.name === name)?.value);
const dropAccess = (page) => page.send("Network.deleteCookies", { name: "access", url: `${BASE}/` });

try {
  add(N, "# Network — refresh token bị dùng lại (thu ngày " + new Date().toISOString().slice(0, 10) + ")");
  add(N, "");
  add(N, "Bản chữ của tab Network → Cookies trong Chrome (headless, DevTools Protocol). Hai trình duyệt độc lập: **CHỦ** và **KẺ GIAN**.");
  add(N, "Token thay bằng vân tay = 8 ký tự đầu SHA-256, trùng 8 ký tự đầu `tokenHash` ở `db/13`. Chỉ ghi request trang (Document).");
  add(N, "Response của `POST /login` có một loạt dòng xoá cookie trước dòng đặt cookie mới: server bỏ token / CSRF cũ của trình duyệt trước khi cấp cặp mới (`routes/auth/login.js`). Trình duyệt áp dụng theo thứ tự, dòng sau cùng có hiệu lực.");
  add(N, "");
  add(N, "## Kịch bản A — kẻ gian dùng token trộm trước, chủ tài khoản dùng sau");
  add(N, "");

  // 1. Chủ đăng nhập.
  await owner.goto(`${BASE}/login`);
  owner.takeNetwork();
  await owner.fill('form[action="/login"]', { email: EMAIL, password: PW });
  await owner.submit('form[action="/login"]');
  const r0 = await cookie(owner, "refresh");
  await cookie(owner, "access");
  network(N, "A1. CHỦ đăng nhập → nhận access (90 giây) + refresh R0", owner.takeNetwork());
  add(N, `R0 = <vân tay ${print(r0)}>`);
  add(N);
  await shot(owner, "29-chu-tai-khoan-dang-nhap", "CHỦ TÀI KHOẢN — đã đăng nhập");
  await dbRows(DB, "Sau A1: một dòng, family mới");

  // 2. Kẻ gian cài đúng giá trị refresh của chủ rồi vào trang quản trị.
  await thief.goto(`${BASE}/dishes`);
  await thief.send("Network.setCookie", { name: "refresh", value: r0, url: `${BASE}/`, path: "/", httpOnly: true, sameSite: "Lax" });
  thief.takeNetwork();
  await thief.goto(`${BASE}/admin/dishes`);
  const r1 = await cookie(thief, "refresh");
  await cookie(thief, "access");
  network(N, "A2. KẺ GIAN gửi R0 (không có access) → server xoay vòng, kẻ gian vào được, nhận R1", thief.takeNetwork());
  add(N, `R1 = <vân tay ${print(r1)}> — khác R0: R0 đã bị đánh dấu usedAt`);
  add(N);
  await shot(thief, "30-ke-gian-dung-refresh-trom-vao-duoc", "KẺ GIAN — dùng refresh token trộm, vào được");
  await dbRows(DB, "Sau A2: R0 có usedAt, R1 cùng family");

  // 3. Chủ tài khoản: access đã hết (xoá như trình duyệt làm sau 90 giây), gửi R0 → dùng lại → thu hồi cả family.
  await dropAccess(owner);
  owner.takeNetwork();
  await owner.goto(`${BASE}/admin/dishes`);
  network(N, "A3. CHỦ (access đã hết) gửi R0 — token ĐÃ DÙNG → phát hiện dùng lại, thu hồi cả family, xoá cookie, 303 /login", owner.takeNetwork());
  await shot(owner, "31-chu-gui-token-da-dung-bi-dang-xuat", "CHỦ TÀI KHOẢN — gửi token đã bị dùng: cả family bị thu hồi");
  await dbRows(DB, "Sau A3: cả family có revokedAt (R0 và R1)");

  // 4a. Rủi ro còn lại (công bố): access token kẻ gian nhận ở A2 còn hạn thì vẫn dùng được tới exp.
  thief.takeNetwork();
  await thief.goto(`${BASE}/admin/dishes`);
  network(N, "A4a. KẺ GIAN còn access token chưa hết 90 giây → vẫn 200 (rủi ro còn lại đã công bố: JWT không tra DB)", thief.takeNetwork());
  // 4b. Access hết hạn → kẻ gian chỉ còn R1, đã bị thu hồi.
  await dropAccess(thief);
  thief.takeNetwork();
  await thief.goto(`${BASE}/admin/dishes`);
  network(N, "A4b. KẺ GIAN (access đã hết) gửi R1 — family đã thu hồi → 303 /login, mất quyền vào", thief.takeNetwork());
  await shot(thief, "32-ke-gian-mat-quyen-vao", "KẺ GIAN — R1 thuộc family đã thu hồi: mất quyền vào");

  // 5. Chủ đăng nhập lại bằng mật khẩu → family mới.
  owner.takeNetwork();
  await owner.goto(`${BASE}/login`);
  await owner.fill('form[action="/login"]', { email: EMAIL, password: PW });
  await owner.submit('form[action="/login"]');
  await cookie(owner, "refresh");
  await cookie(owner, "access");
  network(N, "A5. CHỦ đăng nhập lại bằng mật khẩu → family MỚI", owner.takeNetwork());
  await dbRows(DB, "Sau A5: family mới, family cũ vẫn bị thu hồi");

  // Kịch bản B, gửi trực tiếp như curl -i: chủ dùng trước, kẻ gian dùng token cũ sau.
  add(CURL, "# Kịch bản B — chủ tài khoản refresh trước, kẻ gian dùng token cũ sau (request trực tiếp như curl -i)");
  add(CURL, "# Token thay bằng vân tay (8 ký tự đầu SHA-256). Không có access token trong các request dưới → server phải dùng refresh.");
  add(CURL);
  const c = client();
  await login(c, EMAIL, PW);
  const b0 = remember(decodeURIComponent(c.jar.get("refresh")));
  remember(decodeURIComponent(c.jar.get("access")));
  add(CURL, `B1. Chủ đăng nhập: refresh B0 = <vân tay ${print(b0)}>`);
  const raw = async (step, token) => {
    const res = await fetch(`${BASE}/admin/dishes`, { redirect: "manual", headers: { cookie: `refresh=${token}` } });
    add(CURL, `${step}`);
    add(CURL, `$ curl -i -b "refresh=<vân tay ${print(token)}>" ${BASE}/admin/dishes`);
    add(CURL, `HTTP/1.1 ${res.status}${res.headers.get("location") ? `\nLocation: ${res.headers.get("location")}` : ""}`);
    for (const line of res.headers.getSetCookie()) {
      const value = decodeURIComponent(line.split(";")[0].split("=").slice(1).join("="));
      remember(value);
      add(CURL, `Set-Cookie: ${line.split("=")[0]}=${value ? `<vân tay ${print(value)}>` : ""}; ${line.split(/;\s*/).slice(1).filter((a) => /^(max-age|path|httponly|samesite|expires)/i.test(a)).join("; ")}`);
    }
    add(CURL);
    const line = res.headers.getSetCookie().find((l) => /^refresh=[^;]+/.test(l));
    return line ? decodeURIComponent(line.split(";")[0].slice("refresh=".length)) : null;
  };
  const b1 = await raw("B2. Chủ (access đã hết) gửi B0 → 200, nhận B1 mới", b0);
  await raw("B3. Kẻ gian gửi B0 (đã dùng) → 303 /login, cả family bị thu hồi", b0);
  await raw("B4. Chủ gửi B1 (mới nhất) → 303 /login: family đã thu hồi, chủ đăng nhập lại bằng mật khẩu", b1);
  const famB = (await prisma.refreshToken.findUnique({ where: { tokenHash: createHash("sha256").update(b0).digest("hex") } })).familyId;
  const famRows = await prisma.refreshToken.findMany({ where: { familyId: famB }, orderBy: { id: "asc" } });
  add(CURL, `DB, family ${famB.slice(0, 8)}…: ${famRows.map((r) => `vân tay ${r.tokenHash.slice(0, 8)} usedAt=${r.usedAt ? "có" : "—"} revokedAt=${r.revokedAt ? "có" : "—"}`).join(" | ")}`);

  const log = serverLog();
  const leaked = [...known].filter((v) => v.length >= 20 && log.includes(v));
  add(CURL);
  add(CURL, `Log server có chứa access / refresh token hay mật khẩu không: ${leaked.length ? `CÓ (${leaked.length})` : "không"}`);
} finally {
  owner.close();
  thief.close();
  await stopServer();
  await prisma.user.deleteMany({ where: { id: user.id } }); // xoá luôn refresh_tokens (onDelete: Cascade)
}

// Chặn cuối: còn sót giá trị bí mật thì không ghi gì.
for (const [path, text] of files) {
  const masked = mask(text);
  for (const v of known) if (masked.includes(v)) throw new Error(`Chưa che hết bí mật trong ${path} — không ghi evidence/.`);
}
for (const dir of ["screens", "network", "curl", "db"]) await mkdir(new URL(dir + "/", OUT), { recursive: true });
for (const [path, text] of files) await writeFile(new URL(path, OUT), mask(text));
for (const [path, png] of shots) await writeFile(new URL(path, OUT), png);
console.log(`Đã ghi ${files.size} file chữ, ${shots.size} ảnh vào evidence/.`);
await prisma.$disconnect();
