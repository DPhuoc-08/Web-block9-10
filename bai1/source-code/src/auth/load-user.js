// Khôi phục danh tính cho MỌI request từ hai cookie (plan mục 15; thay express-session):
//   1. Cookie access (JWT 90 giây) hợp lệ → tải user theo sub từ DB, còn active, tv khớp tokenVersion → đã đăng nhập.
//   2. Không có / hết hạn / không hợp lệ mà còn cookie refresh → server TỰ xoay vòng ngay trong request này (SSR: trình duyệt
//      không chạy JS để refresh), đặt lại hai cookie rồi xử lý tiếp chính request đó, nên form đang gửi không bị mất.
//   3. Refresh cũng không được → ẩn danh, xoá cookie. Không phải lỗi hệ thống.
// Role, chefId luôn đọc từ DB, không lấy từ payload. Handler / template chỉ đọc res.locals.currentUser, res.locals.auth.
import { prisma } from "../db.js";
import { verifyAccessToken, signAccessToken, ACCESS_TOKEN_TTL } from "./jwt.js";
import { rotateRefreshToken } from "./refresh.js";
import { getCookie, setCookie, clearCookie } from "./cookies.js";

const USER_FIELDS = { id: true, email: true, username: true, role: true, status: true, chefId: true, tokenVersion: true };

// Đặt cặp cookie sau đăng nhập, sau MFA, sau mỗi lần refresh. Max-Age của refresh = hạn thật trong DB.
export function setTokens(res, user, { token, familyId, expiresAt }) {
  setCookie(res, "access", signAccessToken(user, familyId), ACCESS_TOKEN_TTL * 1000);
  setCookie(res, "refresh", token, Math.max(1000, expiresAt.getTime() - Date.now()));
}

export function clearTokens(res) {
  clearCookie(res, "access");
  clearCookie(res, "refresh");
  clearCookie(res, "reauth");
}

function attach(res, user, familyId) {
  res.locals.currentUser = { id: user.id, email: user.email, username: user.username, role: user.role, chefId: user.chefId };
  res.locals.auth = { familyId };
}

async function fromAccess(token) {
  let claims;
  try {
    claims = verifyAccessToken(token);
  } catch {
    return null; // hết hạn, sai chữ ký, sai iss/aud/alg: đều coi như không có access token
  }
  const id = Number(claims.sub);
  if (!Number.isInteger(id) || id <= 0 || typeof claims.fam !== "string") return null;
  const user = await prisma.user.findUnique({ where: { id }, select: USER_FIELDS });
  // tv lệch: token cấp trước khi đổi / đặt lại mật khẩu.
  if (!user || user.status !== "active" || user.tokenVersion !== claims.tv) return null;
  return { user, familyId: claims.fam };
}

export async function loadUser(req, res, next) {
  res.locals.currentUser = null;
  res.locals.auth = null;
  const access = getCookie(req, "access");
  const refresh = getCookie(req, "refresh");

  const viaAccess = access ? await fromAccess(access) : null;
  if (viaAccess) {
    attach(res, viaAccess.user, viaAccess.familyId);
    return next();
  }
  if (refresh) {
    const rotated = await rotateRefreshToken(refresh);
    if (!rotated.error) {
      setTokens(res, rotated.user, rotated);
      attach(res, rotated.user, rotated.familyId);
      return next();
    }
  }
  if (access || refresh) clearTokens(res);
  next();
}
