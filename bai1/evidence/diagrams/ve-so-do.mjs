// Vẽ 3 sơ đồ luồng (SVG) của Bài 1 từ code thật: mỗi ô ghi file:dòng, tìm bằng một đoạn chữ trong mã nguồn.
// Đoạn chữ không còn trong code thì script báo lỗi, nên sơ đồ không lặng lẽ lệch khỏi code.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
// Chạy: node evidence/diagrams/ve-so-do.mjs (từ thư mục bai1). Đổi code xong chạy lại để cập nhật số dòng.
const SRC = new URL("../../source-code/src/", import.meta.url).pathname;
const OUT = new URL("./", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const ref = (file, needle, nth = 1) => {
  const lines = readFileSync(SRC + file, "utf8").split("\n");
  let seen = 0;
  const i = lines.findIndex((l) => l.includes(needle) && ++seen === nth);
  if (i < 0) throw new Error(`Không thấy "${needle}" trong ${file}`);
  return `${file}:${i + 1}`;
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const C = { text: "#1d1d1b", muted: "#5f5f5a", border: "#d9d6cf", bg: "#f7f6f3", surface: "#ffffff", accent: "#1f5b43", accentBg: "#e8f1ec", danger: "#a8281d", dangerBg: "#fbecea", warn: "#8a5a00", warnBg: "#fdf3dc", req: "#eef0f3" };
const LH = 19, PAD = 12, W = 1100, MX = 40, MW = 520, FX = 650, FW = 410;

function box(x, y, w, kind, title, lines = [], tag = "") {
  const style = {
    req: [C.req, C.border, C.text], check: [C.surface, C.border, C.text], act: [C.accentBg, "#b9d3c5", C.text],
    end: [C.accent, C.accent, "#ffffff"], fail: [C.dangerBg, "#efc2bd", C.danger], note: [C.warnBg, "#ecd9a8", C.warn],
  }[kind];
  const h = PAD * 2 + LH * (1 + lines.length) + (tag ? LH : 0);
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${style[0]}" stroke="${style[1]}"/>`;
  if (kind === "check") s += `<rect x="${x}" y="${y}" width="5" height="${h}" rx="2" fill="${C.accent}"/>`;
  let ty = y + PAD + 14;
  s += `<text x="${x + 16}" y="${ty}" font-weight="700" fill="${style[2]}">${esc(title)}</text>`;
  for (const l of lines) { ty += LH; s += `<text x="${x + 16}" y="${ty}" fill="${kind === "end" ? "#ffffff" : kind === "fail" ? C.danger : C.muted}">${esc(l)}</text>`; }
  if (tag) { ty += LH; s += `<text x="${x + 16}" y="${ty}" font-size="12" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" fill="${kind === "end" ? "#d6e7de" : "#8a8780"}">${esc(tag)}</text>`; }
  return { svg: s, h };
}
const arrowDown = (x, y1, y2, label) =>
  `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2 - 6}" stroke="${C.accent}" stroke-width="2"/><path d="M${x - 5} ${y2 - 8} L${x} ${y2} L${x + 5} ${y2 - 8}Z" fill="${C.accent}"/>` +
  (label ? `<text x="${x + 10}" y="${(y1 + y2) / 2 + 4}" font-size="12" fill="${C.accent}" font-weight="600">${esc(label)}</text>` : "");
const arrowRight = (x1, x2, y, label) =>
  `<line x1="${x1}" y1="${y}" x2="${x2 - 6}" y2="${y}" stroke="${C.danger}" stroke-width="1.6" stroke-dasharray="5 4"/><path d="M${x2 - 8} ${y - 5} L${x2} ${y} L${x2 - 8} ${y + 5}Z" fill="${C.danger}"/>` +
  (label ? `<text x="${(x1 + x2) / 2}" y="${y - 7}" font-size="12" text-anchor="middle" fill="${C.danger}" font-weight="600">${esc(label)}</text>` : "");

// steps: { kind, title, lines, tag, down (nhãn mũi tên xuống bước sau), fails: [{ label, title, lines, tag, kind }] }
function diagram(file, heading, sub, steps, legendNote) {
  let y = 112, body = "";
  steps.forEach((st, i) => {
    const b = box(MX, y, MW, st.kind, st.title, st.lines, st.tag);
    body += b.svg;
    let fy = y, fh = 0;
    for (const f of st.fails ?? []) {
      const fb = box(FX, fy, FW, f.kind ?? "fail", f.title, f.lines, f.tag);
      body += fb.svg + arrowRight(MX + MW, FX, fy + 26, f.label);
      fy += fb.h + 10; fh = fy - y - 10;
    }
    y += Math.max(b.h, fh);
    if (i < steps.length - 1) { body += arrowDown(MX + 40, y, y + 40, st.down ?? "qua"); y += 40; }
  });
  const H = y + 70;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="14">
<title>${esc(heading)}</title>
<rect width="${W}" height="${H}" fill="${C.bg}"/>
<text x="${MX}" y="50" font-size="24" font-weight="700" fill="${C.text}">${esc(heading)}</text>
<text x="${MX}" y="78" fill="${C.muted}">${esc(sub)}</text>
<text x="${MX + 40}" y="104" font-size="12" font-weight="700" fill="${C.accent}" letter-spacing=".04em">LUỒNG CHÍNH (thứ tự trong code)</text>
<text x="${FX}" y="104" font-size="12" font-weight="700" fill="${C.danger}" letter-spacing=".04em">DỪNG Ở ĐÂY — không làm các bước bên dưới</text>
${body}
<text x="${MX}" y="${H - 28}" font-size="12" fill="${C.muted}">${esc(legendNote)}</text>
</svg>`;
  writeFileSync(OUT + file, svg);
  console.log(file, H);
}
const NOTE = "Vẽ nháp từ mã nguồn Bài 1 ngày 09/11/2026 · file:dòng trỏ vào source-code/src/ · DB = bảng trong PostgreSQL · nhóm duyệt trước khi dùng.";
const CSRF = { label: "sai / thiếu", title: "403 Yêu cầu bị từ chối", lines: ["Không đọc form, không ghi gì."], tag: "auth/csrf.js" };
const D = "routes/admin/dishes.js", M = "auth/mfa.js", LM = "routes/auth/mfa.js", AM = "routes/admin/mfa.js";

// ---------- 1. Phân quyền ----------
diagram("1-phan-quyen-bon-cong.svg", "Phân quyền: bốn cổng và câu ghi có điều kiện", "PATCH /admin/dishes/:id · danh tính → role → tải món → thuộc tính; không tin chefId, status, role gửi từ trình duyệt", [
  { kind: "req", title: "Form sửa món, hoặc request gửi thẳng", lines: ["POST /admin/dishes/:id?_method=PATCH · Cookie: sid · _csrf", "Mọi route /admin/* cùng thứ tự, kể cả GET mở form"] },
  { kind: "check", title: "Cổng 1, danh tính: có phiên đầy đủ?", lines: ["loadUser đọc session.userId rồi đọc user từ DB", "(status active, role, chefId mới nhất ở mỗi request)", "Phiên chờ MFA không có userId nên bị từ chối ở đây"], tag: `${ref("app.js", 'app.use("/admin", requireLogin)')} · DB sessions, users`, fails: [{ label: "không có", title: "303 /login", lines: ["Dữ liệu không đổi."], tag: "auth/require-login.js" }] },
  { kind: "check", title: "CSRF rồi method-override", lines: ["_csrf đúng của phiên, Origin là site này"], tag: ref("auth/csrf.js", "export function csrf"), fails: [CSRF] },
  { kind: "check", title: "Cổng 2, RBAC: requirePermission(\"dish:update\")", lines: ["can(user, action) tra bảng quyền theo role đọc từ DB", "Gắn từng route, không gộp vào requireLogin"], tag: ref(D, 'router.patch("/:id", requirePermission("dish:update"), guardDish'), fails: [{ label: "thiếu role", title: "403 Không đủ quyền", lines: ["Viewer sửa; Editor xoá."], tag: ref("auth/require-permission.js", "export const requirePermission") }] },
  { kind: "check", title: "Cổng 3: tải món từ DATABASE", lines: ["Đọc chefId, status của bản ghi, không đọc từ form"], tag: `${ref(D, "select: { id: true, chefId: true, status: true }")} · DB dishes`, fails: [{ label: "không có", title: "404 Không tìm thấy món" }] },
  { kind: "check", title: "Cổng 4, ABAC: canEditDish(user, dish)", lines: ["Admin: mọi món", "Editor: user.chefId khác rỗng, trùng dish.chefId,", "và dish.status = draft"], tag: ref(D, 'if (!canEditDish(res.locals.currentUser, dish)) return forbidden(res, "attribute")'), fails: [{ label: "không thoả", title: "403 dù có role", lines: ["Món của đầu bếp khác, hoặc đã xuất bản."] }] },
  { kind: "act", title: "Trường do server đặt: withServerFields", lines: ["Editor: bỏ chefId, status trong body, không thêm nhanh đầu bếp", "role, mfa* không bao giờ đọc từ body"], tag: ref(D, "function withServerFields") },
  { kind: "check", title: "Kiểm dữ liệu form", fails: [{ label: "sai", title: "200 VALIDATION_FAILED", lines: ["Đánh dấu ô sai, chưa ghi gì."] }] },
  { kind: "check", title: "Câu ghi ĐẦU TIÊN của transaction có điều kiện", lines: ["updateMany where editableDishWhere(user, id):", "id, chefId của user, status draft (Admin: chỉ id)", "Chạy trước khi tạo tag, nguyên liệu mới", "Quyền đổi sau lúc qua cổng thì không khớp dòng nào"], tag: `${ref(D, "const { count } = where ? await tx.dish.updateMany({ where, data: fields })")} · ${ref("policy/permissions.js", "export function editableDishWhere")}`, fails: [{ label: "count = 0", title: "Rollback, 403 hoặc 404", lines: ["Không có bản ghi thừa, dữ liệu không đổi."], tag: ref(D, "async function refuse") }] },
  { kind: "end", title: "303 về danh sách", lines: ["Tạo tag, nguyên liệu mới, cập nhật bảng nối trong cùng transaction"] },
], NOTE);

// ---------- 2. Đăng nhập có MFA ----------
diagram("2-mfa-dang-nhap.svg", "Đăng nhập có MFA", "POST /login → phiên chờ → POST /login/mfa · password đúng chưa phải là đăng nhập xong", [
  { kind: "req", title: "POST /login: các bước của block8 giữ nguyên", lines: ["CSRF → giới hạn IP → khoá email → CAPTCHA → password → active"] },
  { kind: "check", title: "Tài khoản đã bật MFA?", tag: ref("routes/auth/login.js", "req.session.mfaPending = { userId: user.id"), fails: [{ kind: "note", label: "chưa bật", title: "Phiên đầy đủ như block8", lines: ["regenerate, gán userId, 303 trang đang mở."] }] },
  { kind: "act", title: "regenerate, chỉ gán mfaPending = { userId, at, next }", lines: ["KHÔNG gán session.userId", "Cột sessions.userId vẫn ghi để reset xoá được phiên đang chờ"], tag: `${ref("routes/auth/login.js", "await regenerate(req)")} · DB sessions`, fails: [{ kind: "note", label: "gọi /admin/*", title: "303 /login", lines: ["loadUser chỉ đọc session.userId,", "nên phiên chờ không có currentUser."], tag: "auth/load-user.js, auth/require-login.js" }], down: "303 /login/mfa" },
  { kind: "check", title: "requireMfaPending: chỉ gắn cho route bước MFA", lines: ["Còn phiên chờ, chưa quá 5 phút"], tag: ref("auth/require-mfa-pending.js", "export function requireMfaPending"), fails: [{ label: "hết hạn", title: "303 /login?msg=mfa-expired", lines: ["Nhập lại password."] }] },
  { kind: "check", title: "Giới hạn IP 30 lần / 15 phút, rồi GIỮ LƯỢT trong bộ đếm theo user", lines: ["mfa-fail:user:<id> dùng chung cho OTP, recovery code, xác thực lại", "hit() là một câu ghi: N request cùng lúc nhận N lượt khác nhau,", "chỉ lượt 1–5 được kiểm mã (sửa 12/11, plan 14 L1)"], tag: `${ref("routes/auth/mfa.js", "mfa:ip:")} · ${ref(M, "const slot = await hit(key, { windowMs: FAIL_WINDOW })")} · DB rate_limits`, fails: [{ label: "đang khoá, lượt > 5", title: "429 + Retry-After", lines: ["Kể cả khi mã đúng; không kiểm mã."] }] },
  { kind: "check", title: "Mã đúng? TOTP 6 số, tối đa ±1 bước 30 giây", lines: ["Giải mã mfaSecret (AES-256-GCM, AAD là userId)", "Hoặc recovery code: HMAC-SHA256 so với codeHash"], tag: ref(M, "const step = acceptedStep(openSecret(user.mfaSecret, userId), code)"), fails: [{ label: "sai", title: "200 INVALID_OTP; lượt thứ 5 sai → khoá 15 phút", lines: ["Lượt đã giữ từ trước nên không cộng thêm."], tag: ref(M, "lockedResult(await lock(key, FAIL_LOCK_FOR)) : { ok: false, reason: \"invalid\" }") }] },
  { kind: "check", title: "Tiêu thụ bằng câu ghi có điều kiện", lines: ["TOTP: mfaLastStep rỗng hoặc nhỏ hơn bước của mã", "Recovery: usedAt: null → đặt usedAt = now", "Hai request cùng mã: chỉ một request khớp"], tag: `${ref(M, "OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }]")} · DB users, recovery_codes`, fails: [{ label: "count = 0", title: "200 INVALID_OTP", lines: ["Mã đã dùng bị từ chối."] }] },
  { kind: "act", title: "Xoá bộ đếm, đọc lại user, regenerate sid MỚI", lines: ["Gán userId, loginAt, xoá mfaPending (phiên cũ bị huỷ)"], tag: `${ref(LM, "await regenerate(req)")} · ${ref(LM, "req.session.userId = userId")}` },
  { kind: "end", title: "303 trang đang mở; dùng recovery code thì về hồ sơ", lines: ["Set-Cookie: sid mới · HttpOnly; SameSite=Lax; Path=/"], tag: ref(LM, 'return finish(req, res, "/admin/profile?msg=mfa-recovery-used")') },
], NOTE);

// ---------- 3. Thiết lập, recovery code, xác thực lại ----------
diagram("3-mfa-thiet-lap-va-xac-thuc-lai.svg", "Bật MFA, hiện recovery code một lần, xác thực lại", "POST tạo secret chờ → GET vẽ QR → POST xác nhận → 303 → GET mã một lần · thay, tắt, tạo lại mã đều xác thực lại", [
  { kind: "req", title: "POST /admin/profile/mfa/setup", lines: ["Qua requireLogin, csrf như mọi route quản trị"], tag: ref(AM, 'router.post("/setup"') },
  { kind: "act", title: "Sinh secret, lưu bản mã vào mfaPendingSecret", lines: ["Chỉ khi mfaEnabled = false · chưa có hiệu lực đăng nhập", "GET không tạo secret; đã bật thì đi đường đổi thiết bị"], tag: `${ref(M, "data: { mfaPendingSecret: sealSecret(newTotpSecret(), userId) }")} · DB users`, down: "303, GET /setup chỉ đọc để vẽ QR" },
  { kind: "req", title: "Người dùng quét QR, POST /setup/confirm với một mã", tag: ref(AM, 'router.post("/setup/confirm"') },
  { kind: "check", title: "Mã khớp secret chờ? (cùng bộ đếm MFA)", tag: ref(M, "const step = acceptedStep(openSecret(user.mfaPendingSecret, userId), code)"), fails: [{ label: "sai", title: "200 INVALID_OTP, MFA chưa bật", lines: ["Sai quá ngưỡng: 429."] }] },
  { kind: "act", title: "Một transaction bật MFA", lines: ["mfaSecret ← bản mã, mfaEnabled = true, ghi mfaLastStep", "Sinh 10 recovery code, DB chỉ lưu HMAC-SHA256 kèm pepper"], tag: `${ref(M, "data: { mfaSecret: user.mfaPendingSecret, mfaPendingSecret: null, mfaEnabled: true, mfaLastStep: step }")} · DB users, recovery_codes` },
  { kind: "act", title: "Giữ mã gốc trong RAM tối đa 60 giây, theo sessionID", lines: ["Không ghi DB, session, log (plan 12.11)"], tag: ref(AM, "holdCodes(req.sessionID, { codes: result.codes"), down: "303, giữ đúng PRG của Block 5" },
  { kind: "end", title: "GET /codes: đọc là xoá, Reload không hiện lại", lines: ["Không còn mã: về hồ sơ, mời tạo nhóm mới"], tag: ref(AM, "const held = takeCodes(req.sessionID)"), down: "về sau: đổi thiết bị, tạo lại mã, tắt MFA" },
  { kind: "req", title: "POST /admin/profile/mfa/reauth/:action", lines: ["Chỉ replace, regenerate, disable · phiên đầy đủ vẫn phải nhập"], tag: ref(AM, 'router.post("/reauth/:action", guardReauth') },
  { kind: "check", title: "Password đúng, rồi một mã TOTP hoặc recovery code", lines: ["So password trước để gõ sai không mất một recovery code", "Sai tính chung bộ đếm MFA"], tag: ref(AM, "const result = await reauthenticate(userId"), fails: [{ label: "sai", title: "200 INVALID_OTP", lines: ["Không đổi gì. Sai quá ngưỡng: 429."] }] },
  { kind: "end", title: "Làm đúng một việc đã xác thực", lines: ["replace → secret chờ mới, chỉ xác nhận được trong 10 phút ở chính phiên này (12/11, plan 14 L2) · regenerate → nhóm mã mới", "disable → xoá secret và mã", "Reset mật khẩu không đi qua đây, không đổi mfaEnabled"], tag: ref(AM, 'if (action === "replace")') },
], NOTE);
