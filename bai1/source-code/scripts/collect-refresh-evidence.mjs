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
const NEW_PW = "mat-khau-demo-refresh-2"; // ca E đổi mật khẩu
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const print = (v) => createHash("sha256").update(String(v)).digest("hex").slice(0, 8);
const time = (d) => (d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) + "Z" : "—");
const files = new Map();
const shots = new Map();
const known = new Set([PW, NEW_PW, process.env.JWT_SECRET].filter(Boolean)); // mọi token gặp được thêm vào đây
const add = (path, line = "") => files.set(path, (files.get(path) ?? "") + line + "\n");
const remember = (v) => { if (v && v.length >= 20) known.add(v); return v; };

function mask(text) {
  let t = String(text);
  for (const v of [...known].sort((a, b) => b.length - a.length)) t = t.split(v).join([PW, NEW_PW, process.env.JWT_SECRET].includes(v) ? "<đã che>" : `<đã che · vân tay ${print(v)}>`);
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
// Vòng đời token khi dùng bình thường: tự refresh, đăng xuất, đổi mật khẩu, hết hạn (ca C, D, E, F).
const N2 = "network/refresh-token-vong-doi.md", DB2 = "db/14-refresh-token-vong-doi.txt";

await prisma.user.deleteMany({ where: { email: EMAIL } });
await prisma.rateLimit.deleteMany({ where: { OR: [{ key: { contains: ":ip:" } }, { key: { contains: EMAIL } }] } });
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

  add(N2, "# Network — vòng đời access / refresh token khi dùng bình thường (thu ngày " + new Date().toISOString().slice(0, 10) + ")");
  add(N2, "");
  add(N2, "Cùng cách ghi với `refresh-token-dung-lai.md`: bản chữ tab Network → Cookies của Chrome headless, token thay bằng vân tay (trùng 8 ký tự đầu `tokenHash` ở `db/14`).");
  add(N2, "");

  // C. Access hết hạn đúng lúc đang gửi form → server tự refresh trong chính request đó, dữ liệu form được ghi.
  add(N2, "## C — access hết hạn khi đang gửi form: server tự refresh, dữ liệu không mất; JavaScript không đọc được token");
  add(N2, "");
  await owner.goto(`${BASE}/admin/profile`);
  add(N2, `Console trên trang /admin/profile: \`document.cookie\` = ${JSON.stringify(await owner.eval("return document.cookie;"))} — access, refresh, csrf đều HttpOnly nên script của trang (kể cả script lạ do lỗi XSS) không đọc được.`);
  add(N2);
  await dropAccess(owner); // như trình duyệt tự xoá cookie access sau Max-Age 90 giây trong lúc người dùng đang điền form
  await owner.fill('form[action="/admin/profile?_method=PATCH"]', { username: "Demo refresh (đã sửa)" });
  owner.takeNetwork();
  await owner.submit('form[action="/admin/profile?_method=PATCH"]');
  await cookie(owner, "refresh"); await cookie(owner, "access");
  network(N2, "C1. Gửi form đổi tên khi KHÔNG còn access (chỉ có refresh) → server xoay vòng rồi xử lý form → 303 + cặp cookie mới", owner.takeNetwork());
  const renamed = (await prisma.user.findUnique({ where: { email: EMAIL } })).username;
  add(N2, `DB: users.username = "${renamed}" — dữ liệu form đã được ghi.`);
  add(N2);
  await shot(owner, "33-tu-refresh-khi-gui-form-van-luu", "Access đã hết khi gửi form: server tự refresh, form vẫn được lưu");
  await dbRows(DB2, "Sau C1: dòng refresh cũ có usedAt, dòng mới cùng family (tự refresh khi gửi form)");

  // D. Đăng xuất thu hồi family ở server: bản sao refresh token chép trước khi đăng xuất không dùng được.
  add(N2, "## D — đăng xuất thu hồi refresh token ở server (không chỉ xoá cookie)");
  add(N2, "");
  const copied = await cookie(owner, "refresh");
  add(N2, `Chép refresh token trước khi đăng xuất: <vân tay ${print(copied)}>`);
  add(N2);
  owner.takeNetwork();
  await owner.submit('form[action="/logout"]');
  network(N2, "D1. Bấm Đăng xuất → server thu hồi family, xoá cookie, 303 /login", owner.takeNetwork());
  await thief.send("Network.clearBrowserCookies");
  await thief.goto(`${BASE}/dishes`);
  await thief.send("Network.setCookie", { name: "refresh", value: copied, url: `${BASE}/`, path: "/", httpOnly: true, sameSite: "Lax" });
  thief.takeNetwork();
  await thief.goto(`${BASE}/admin/dishes`);
  network(N2, "D2. Trình duyệt khác dùng bản sao refresh token đã chép → 303 /login (family đã thu hồi)", thief.takeNetwork());
  await dbRows(DB2, "Sau D: family của lần đăng nhập đó có revokedAt");

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

  // E. Đổi mật khẩu: tăng tokenVersion + thu hồi mọi family → thiết bị khác bị từ chối NGAY (kể cả access còn hạn).
  add(N2, "## E — đổi mật khẩu: thiết bị khác bị đăng xuất ngay, thiết bị đang dùng nhận family mới");
  add(N2, "");
  await thief.send("Network.clearBrowserCookies");
  await thief.goto(`${BASE}/login`);
  await thief.fill('form[action="/login"]', { email: EMAIL, password: PW });
  await thief.submit('form[action="/login"]');
  await cookie(thief, "refresh"); await cookie(thief, "access");
  add(N2, "Máy 2 (trình duyệt thứ hai) đăng nhập cùng tài khoản, access còn hạn.");
  add(N2);
  await owner.goto(`${BASE}/login`);
  await owner.fill('form[action="/login"]', { email: EMAIL, password: PW });
  await owner.submit('form[action="/login"]');
  await cookie(owner, "refresh"); await cookie(owner, "access");
  await dbRows(DB2, "Trước E: hai family (máy 1, máy 2), tokenVersion = 0");
  await owner.goto(`${BASE}/admin/profile/password`);
  await owner.fill('form[action="/admin/profile/password"]', { currentPassword: PW, password: NEW_PW, passwordConfirm: NEW_PW });
  owner.takeNetwork();
  await owner.submit('form[action="/admin/profile/password"]');
  await cookie(owner, "refresh"); await cookie(owner, "access");
  network(N2, "E1. Máy 1 đổi mật khẩu → 303 về hồ sơ, máy 1 nhận cặp token mới (family mới, tv mới)", owner.takeNetwork());
  thief.takeNetwork();
  await thief.goto(`${BASE}/admin/dishes`);
  network(N2, "E2. Máy 2 mở trang quản trị NGAY (access chưa hết 90 giây) → 303 /login: tv trong access lệch tokenVersion, refresh đã thu hồi", thief.takeNetwork());
  await shot(thief, "34-may-khac-bi-dang-xuat-sau-doi-mat-khau", "MÁY 2 — máy 1 vừa đổi mật khẩu: bị đăng xuất ngay");
  await dbRows(DB2, "Sau E: tokenVersion = 1, mọi family cũ có revokedAt, máy 1 có family mới");

  // F. Hạn refresh (plan 15.2 a) đo bằng thời gian thật: server chạy lại với số demo IDLE = 2, ABSOLUTE = 3 phút.
  add(N2, "## F — hạn refresh đo bằng thời gian thật (REFRESH_IDLE_MINUTES=2, REFRESH_ABSOLUTE_MINUTES=3, access 90 giây)");
  add(N2, "");
  add(N2, "Không xoá cookie bằng tay ở ca này: Chrome tự bỏ cookie access sau Max-Age 90 giây. Máy 1 để yên (hạn không hoạt động); máy 2 thao tác đều (trần tuyệt đối).");
  add(N2);
  await stopServer();
  await startServer({ MAIL_TRANSPORT: "file", REFRESH_IDLE_MINUTES: "2", REFRESH_ABSOLUTE_MINUTES: "3" });
  const loginAs = async (page) => {
    await page.send("Network.clearBrowserCookies");
    await page.goto(`${BASE}/login`);
    await page.fill('form[action="/login"]', { email: EMAIL, password: NEW_PW });
    await page.submit('form[action="/login"]');
    const refresh = await cookie(page, "refresh"); await cookie(page, "access");
    page.takeNetwork();
    return { at: Date.now(), refresh };
  };
  const m1 = await loginAs(owner), t1 = m1.at; // máy 1: để yên
  const m2 = await loginAs(thief), t2 = m2.at; // máy 2: thao tác ở giây 95
  await dbRows(DB2, "F, ngay sau đăng nhập: expiresAt = lúc cấp + 2 phút, trần (familyExpiresAt) = lúc đăng nhập + 3 phút (xem db/14 ở cột expiresAt)");
  const fam = await prisma.refreshToken.findMany({ where: { user: { email: EMAIL }, revokedAt: null }, select: { familyExpiresAt: true, createdAt: true } });
  add(DB2, `familyExpiresAt − createdAt của 2 family mới: ${fam.map((r) => Math.round((r.familyExpiresAt - r.createdAt) / 1000) + " giây").join(", ")}`);
  add(DB2);
  await sleep(t2 + 95_000 - Date.now());
  await thief.goto(`${BASE}/admin/dishes`);
  const m2last = await cookie(thief, "refresh"); await cookie(thief, "access");
  network(N2, `F1. Máy 2 thao tác ở giây ${Math.round((Date.now() - t2) / 1000)} (access đã tự hết) → 200, xoay vòng; Max-Age của refresh mới bị cắt theo trần 3 phút`, thief.takeNetwork());
  await sleep(t1 + 125_000 - Date.now());
  await owner.goto(`${BASE}/admin/dishes`);
  network(N2, `F2. Máy 1 để yên tới giây ${Math.round((Date.now() - t1) / 1000)} (quá 2 phút không hoạt động) → 303 /login`, owner.takeNetwork());
  await shot(owner, "35-het-han-khong-hoat-dong", "MÁY 1 — để yên quá hạn không hoạt động: phải đăng nhập lại");
  await sleep(t2 + 190_000 - Date.now());
  await thief.goto(`${BASE}/admin/dishes`);
  network(N2, `F3. Máy 2 thao tác tiếp ở giây ${Math.round((Date.now() - t2) / 1000)} (đã quá trần 3 phút từ lúc đăng nhập) → 303 /login dù vẫn đang dùng`, thief.takeNetwork());
  add(N2, "Ở F2, F3 Chrome đã tự bỏ cookie refresh vì Max-Age của nó bằng đúng hạn trong DB. Bước F4 kiểm tra phía server: ai giữ bản sao token đã hết hạn (vd. kẻ gian chép từ trước) gửi thẳng lên vẫn bị từ chối theo cột expiresAt.");
  add(N2);
  add(N2, "### F4. Gửi thẳng bản sao refresh token đã hết hạn (như curl -i, không có access)");
  for (const [who, token] of [["máy 1 (quá hạn không hoạt động)", m1.refresh], ["máy 2, token mới nhất (chạm trần 3 phút)", m2last]]) {
    const res = await fetch(`${BASE}/admin/dishes`, { redirect: "manual", headers: { cookie: `refresh=${token}` } });
    add(N2, `$ curl -i -b "refresh=<vân tay ${print(token)}>" ${BASE}/admin/dishes   # ${who}`);
    add(N2, `HTTP/1.1 ${res.status}  Location: ${res.headers.get("location") ?? "—"}  Set-Cookie: ${res.headers.getSetCookie().map((l) => l.split(";")[0]).join(", ") || "(không có)"}`);
  }
  add(N2);
  await dbRows(DB2, "Sau F: máy 2 có 2 dòng (expiresAt dòng thứ hai = trần của family), cả hai family đều đã quá hạn");

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
