// Vẽ 2 sơ đồ luồng (SVG) của Bài 2 từ code thật: mỗi ô ghi file:dòng, tìm bằng một đoạn chữ trong mã nguồn.
// Đoạn chữ không còn trong code thì script báo lỗi, nên sơ đồ không lặng lẽ lệch khỏi code.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
// Chạy: node evidence/diagrams/ve-so-do.mjs (từ thư mục bai2). Đổi code xong chạy lại để cập nhật số dòng.
const SRC = new URL("../../", import.meta.url).pathname;
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
const NOTE = "Vẽ nháp từ mã nguồn Bài 2 ngày 09/11/2026 · file:dòng tính từ thư mục bai2/ · DB = bảng trong PostgreSQL · nhóm duyệt trước khi dùng.";
const R = "api/src/routes/auth.js", J = "api/src/auth/require-jwt.js", WEB_CLIENT = "web/src/api/client.js", D = "api/src/routes/dishes.js";

diagram("1-dang-nhap-jwt-va-noi-luu-token.svg", "Đăng nhập JWT và nơi lưu token", "POST /api/auth/login → (POST /api/auth/mfa) → sessionStorage · web ở :5173, api ở :3000", [
  { kind: "req", title: "Trang đăng nhập của web gửi JSON", lines: ["email, password, captchaToken (khi api yêu cầu)", "Không gửi Authorization: chưa có token"], tag: ref("web/src/pages/auth/LoginPage.jsx", "const data = await login(") },
  { kind: "check", title: "Giới hạn theo IP, 30 lần / 15 phút", tag: `${ref(R, "login:ip:")} · DB rate_limits`, fails: [{ label: "vượt", title: "429 RATE_LIMITED + Retry-After" }] },
  { kind: "check", title: "Email đang khoá? (đủ 10 lần sai)", tag: ref(R, "if (state.lockedUntil) return loginLocked"), fails: [{ label: "đang khoá", title: "429 dù password đúng" }] },
  { kind: "check", title: "Đã sai ≥ 3 lần: CAPTCHA trước khi so password", lines: ["Bộ đếm ở DB, gọi API trực tiếp không đặt lại được"], tag: ref(R, "if (state.count >= CAPTCHA_AT"), fails: [{ label: "thiếu / sai", title: "200 CAPTCHA_REQUIRED / INVALID_CAPTCHA", lines: ["Không so password, không có token."] }] },
  { kind: "check", title: "So password Argon2id", lines: ["Email không có vẫn verify với hash giả"], tag: ref(R, "if (!(await verifyPassword(user?.passwordHash"), fails: [{ label: "sai", title: "200 INVALID_CREDENTIALS", lines: ["Bộ đếm + 1; đủ 10 lần: 429."] }] },
  { kind: "check", title: "Tài khoản active?", tag: ref(R, 'if (user.status !== "active") return fail'), fails: [{ label: "pending", title: "200 ACCOUNT_NOT_ACTIVATED", lines: ["Không có accessToken."] }] },
  { kind: "check", title: "Đã bật MFA?", lines: ["Có: trả next mfa + challenge, KHÔNG có accessToken", "Challenge ngẫu nhiên, DB lưu hash, 5 phút, dùng một lần", "Web giữ challenge trong bộ nhớ, không vào storage"], tag: `${ref(R, "if (user.mfaEnabled) return okSecret")} · DB mfa_challenges`, down: "POST /api/auth/mfa (hoặc thẳng nếu chưa bật)", fails: [{ kind: "note", label: "challenge", title: "Chỉ POST /api/auth/mfa nhận", lines: ["Gửi tới route dữ liệu: 401 vì không phải JWT.", "Access token gửi tới đây: 401."], tag: ref(R, 'router.post("/mfa", jsonBody') }] },
  { kind: "check", title: "Mã đúng và chưa dùng; challenge dùng một lần", lines: ["TOTP ±1 bước, chặn dùng lại bằng câu ghi có điều kiện", "Giới hạn IP 30 lần / 15 phút; bộ đếm user GIỮ LƯỢT trước khi kiểm mã:", "gửi đồng thời cũng chỉ 5 mã được kiểm, lượt 6+ hoặc đang khoá → 429 (sửa 12/11)"], tag: `${ref(R, "mfa:ip:")} · ${ref("api/src/auth/mfa.js", "const slot = await hit(key, { windowMs: FAIL_WINDOW })")} · ${ref(R, "const { count } = await prisma.mfaChallenge.updateMany")}`, fails: [{ label: "sai", title: "200 INVALID_OTP" }, { label: "challenge hỏng", title: "401, về đăng nhập" }] },
  { kind: "act", title: "Ký access token HS256, hạn 30 phút", lines: ["Payload chỉ có sub, tv, iat, exp, iss, aud", "Không có role, email: payload ai cũng đọc được", "Response gắn Cache-Control: no-store"], tag: ref("api/src/auth/jwt.js", "export const signAccessToken") },
  { kind: "end", title: "Web lưu token vào sessionStorage", lines: ["Lý do: còn sau Reload, không sang tab mới, mất khi đóng tab,", "ngắn hơn localStorage. Rủi ro còn lại: XSS đọc được token,", "nên không render HTML thô, token ngắn hạn, tokenVersion thu hồi"], tag: ref("web/src/auth/token.js", "export function setToken") },
], NOTE);

diagram("2-request-co-bearer.svg", "Một request có Bearer đi qua web và api", "web/src/api/client.js → preflight → requireJwt → RBAC → ABAC · role luôn đọc từ DB", [
  { kind: "req", title: "Trang gọi hàm trong api/*.js", lines: ["Trang không tự gắn header"] },
  { kind: "act", title: "Lớp gọi API gắn Authorization, một chỗ duy nhất", lines: ["Chỉ cho URL gốc của api", "GET /api/dishes, /:id: anonymous, không gửi token"], tag: ref(WEB_CLIENT, "if (token) init.headers.Authorization") },
  { kind: "check", title: "Preflight OPTIONS (Authorization không được miễn)", lines: ["Origin cụ thể từ CORS_ORIGIN, có Authorization trong", "Allow-Headers, không đòi token"], tag: ref("api/src/app.js", 'allowedHeaders: ["Content-Type", "Authorization"]'), fails: [{ label: "origin lạ", title: "Không có Allow-Origin", lines: ["Trình duyệt không gửi request thật."] }] },
  { kind: "check", title: "Cổng 1, requireJwt: verify", lines: ["Thuật toán cố định HS256, chữ ký, exp, iss, aud"], tag: ref("api/src/auth/jwt.js", "export const verifyAccessToken"), fails: [{ label: "sai", title: "401 UNAUTHENTICATED" }, { label: "quá exp", title: "401 TOKEN_EXPIRED" }] },
  { kind: "check", title: "Tải user theo sub: active, tv khớp tokenVersion", lines: ["Role, chefId lấy ở đây, không lấy từ payload", "Reset mật khẩu, tắt MFA tăng tokenVersion"], tag: `${ref(J, 'claims.tv !== user.tokenVersion')} · DB users`, fails: [{ label: "lệch", title: "401 UNAUTHENTICATED" }] },
  { kind: "check", title: "Cổng 2, RBAC: requirePermission, trước jsonBody", tag: ref(D, 'router.patch("/:id", requireJwt, requirePermission("dish:update"), guardDish, jsonBody'), fails: [{ label: "thiếu role", title: "403 FORBIDDEN", lines: ["Dữ liệu không đổi."] }] },
  { kind: "check", title: "Cổng 3 và 4: đọc món từ DB, canEditDish", lines: ["chefId, status trong body của Editor bị bỏ qua"], tag: ref(D, "async function guardDish"), fails: [{ label: "không có", title: "200 NOT_FOUND" }, { label: "không thoả", title: "403 FORBIDDEN" }] },
  { kind: "check", title: "Câu ghi đầu tiên của transaction có điều kiện ABAC", tag: ref(D, "await tx.dish.updateMany({ where, data:"), fails: [{ label: "count = 0", title: "Rollback, 403 hoặc NOT_FOUND" }] },
  { kind: "end", title: "200 ok: true", lines: ["Web cập nhật giao diện; trang không tự giữ dữ liệu cũ"], down: "khi bị từ chối, lớp gọi API xử lý theo status" },
  { kind: "check", title: "Web xử lý theo status", lines: ["401: xoá token, nhớ trang đang mở, về đăng nhập", "403: báo thiếu quyền, GIỮ token", "Lỗi mạng, 500: báo lỗi kỹ thuật, KHÔNG đăng xuất"], tag: ref(WEB_CLIENT, 'if (on401 !== "throw") clearToken("expired")') },
], NOTE);
