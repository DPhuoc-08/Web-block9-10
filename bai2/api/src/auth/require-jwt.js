// Cổng danh tính của API (slide 33), thay cho requireLogin của Bài 1. Không đọc cookie, không có phiên.
// Verify xong vẫn tải user từ DATABASE: role, chefId mới nhất lấy ở đây, không lấy từ payload.
import { prisma } from "../db.js";
import { verifyAccessToken } from "./jwt.js";
import { CODES, unauthenticated } from "../http/respond.js";

const bearer = (req) => /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(req.get("authorization") ?? "")?.[1] ?? null;

export async function requireJwt(req, res, next) {
  const token = bearer(req);
  if (!token) return unauthenticated(res);

  let claims;
  try {
    claims = verifyAccessToken(token);
  } catch (err) {
    if (err.name === "TokenExpiredError") return unauthenticated(res, CODES.TOKEN_EXPIRED, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    return unauthenticated(res);
  }

  const id = Number(claims.sub);
  if (!Number.isInteger(id) || id <= 0) return unauthenticated(res);
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, username: true, role: true, chefId: true, status: true, tokenVersion: true } });
  // tv lệch: token cấp trước khi reset mật khẩu hoặc tắt MFA (plan 12.7).
  if (!user || user.status !== "active" || claims.tv !== user.tokenVersion) return unauthenticated(res);

  res.locals.currentUser = user;
  next();
}
