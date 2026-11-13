// Refresh token (yêu cầu của giảng viên 13/11/2026, plan mục 15): access token ngắn đi tới API, refresh token dài chỉ đi tới
// /api/auth/refresh và /logout. File thuần: không đụng req/res.
// Refresh token là chuỗi ngẫu nhiên (không phải JWT): requireJwt luôn từ chối nó, và nó chỉ có nghĩa khi tra được hash trong DB,
// nên thu hồi được ngay (khác access token: đã phát thì dùng được tới exp).
import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { generateToken, sha256 } from "./secrets.js";

export const REFRESH_TOKEN_TTL = 7 * 24 * 3600; // giây; 7 ngày theo trang của giảng viên
const FORMAT = /^[A-Za-z0-9_-]{43}$/; // randomBytes(32) base64url
const expiry = () => new Date(Date.now() + REFRESH_TOKEN_TTL * 1000);

// Đăng nhập xong (đủ bước password + MFA): mở family mới.
export async function issueRefreshToken(user, familyId = randomUUID(), db = prisma) {
  const token = generateToken();
  await db.refreshToken.create({ data: { userId: user.id, familyId, tokenHash: sha256(token), tokenVersion: user.tokenVersion, expiresAt: expiry() } });
  return token;
}

const revokeFamily = (familyId, db = prisma) => db.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });

// Đổi refresh token cũ lấy cặp mới. Trả { user, refreshToken } hoặc { error: "invalid" | "reused" }.
export async function rotateRefreshToken(token) {
  if (typeof token !== "string" || !FORMAT.test(token)) return { error: "invalid" };
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row) return { error: "invalid" };
  // Token đã dùng (đã đổi lấy token mới) xuất hiện lại: có hai bên cùng giữ nó (một bên là kẻ đánh cắp). Không biết bên nào thật
  // nên thu hồi cả family: cả hai phải đăng nhập lại.
  if (row.usedAt) {
    await revokeFamily(row.familyId);
    return { error: "reused" };
  }
  if (row.revokedAt || row.expiresAt <= new Date()) return { error: "invalid" };

  const user = await prisma.user.findUnique({ where: { id: row.userId }, select: { id: true, status: true, tokenVersion: true } });
  // tokenVersion lệch: refresh token cấp trước khi reset mật khẩu / tắt MFA (plan 12.7) — không đổi lấy access token mới được.
  if (!user || user.status !== "active" || user.tokenVersion !== row.tokenVersion) {
    await revokeFamily(row.familyId);
    return { error: "invalid" };
  }

  // Đánh dấu đã dùng bằng câu ghi có điều kiện: hai request gửi cùng một token đồng thời thì chỉ một request được count = 1,
  // request kia coi như dùng lại → thu hồi family.
  const result = await prisma.$transaction(async (tx) => {
    const { count } = await tx.refreshToken.updateMany({ where: { id: row.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (count !== 1) return null;
    return issueRefreshToken(user, row.familyId, tx);
  });
  if (!result) {
    await revokeFamily(row.familyId);
    return { error: "reused" };
  }
  return { user, refreshToken: result };
}

// Đăng xuất: thu hồi cả family của token đang giữ. Token lạ hoặc đã thu hồi thì thôi (đăng xuất luôn "thành công").
export async function revokeRefreshToken(token) {
  if (typeof token !== "string" || !FORMAT.test(token)) return;
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, select: { familyId: true } });
  if (row) await revokeFamily(row.familyId);
}
