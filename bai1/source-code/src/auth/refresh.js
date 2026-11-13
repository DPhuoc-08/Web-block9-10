// Refresh token của Bài 1 (plan mục 15, phần B của giảng viên). File thuần: không đụng req/res.
// Refresh token là chuỗi ngẫu nhiên, KHÔNG phải JWT: nó chỉ có nghĩa khi tra được hash trong DB, nên thu hồi được ngay
// (khác access token: đã phát thì dùng được tới exp).
// Hạn (phương án 3 ở plan 15.2 a): mỗi token sống X phút kể từ lúc cấp (hết hạn khi không hoạt động), nhưng không bao giờ vượt
// trần Y phút kể từ lúc đăng nhập. X, Y đọc từ .env để demo được trong vài phút; mặc định 120 / 720 (chính sách mục 4).
import { randomUUID } from "node:crypto";
import { prisma } from "../db.js";
import { generateToken, sha256 } from "./secrets.js";
import { ACCESS_TOKEN_TTL } from "./jwt.js";

const FORMAT = /^[A-Za-z0-9_-]{43}$/; // randomBytes(32) dạng base64url
const minutesEnv = (key, fallback) => (process.env[key] === undefined || process.env[key] === "" ? fallback : Number(process.env[key]));
export const refreshIdleMs = () => minutesEnv("REFRESH_IDLE_MINUTES", 120) * 60_000;
export const refreshAbsoluteMs = () => minutesEnv("REFRESH_ABSOLUTE_MINUTES", 720) * 60_000;

// Gọi lúc khởi động: số sai thì không chạy, thay vì âm thầm cấp token không bao giờ hết hạn.
// Hạn không hoạt động phải DÀI HƠN access token (90 giây): trong lúc access còn hạn, server không đụng tới refresh token nên không
// gia hạn nó; nếu refresh hết trước access thì người dùng luôn bị đăng xuất sau ~90 giây dù đang thao tác (phát hiện ở bước 42).
export function assertRefreshConfig() {
  const idle = minutesEnv("REFRESH_IDLE_MINUTES", 120);
  const absolute = minutesEnv("REFRESH_ABSOLUTE_MINUTES", 720);
  if (!Number.isInteger(idle) || !Number.isInteger(absolute) || idle * 60 <= ACCESS_TOKEN_TTL || absolute < idle) {
    throw new Error(`REFRESH_IDLE_MINUTES, REFRESH_ABSOLUTE_MINUTES phải là số nguyên, IDLE dài hơn access token (${ACCESS_TOKEN_TTL} giây, tức ≥ 2) và IDLE ≤ ABSOLUTE (xem .env.example).`);
  }
}

const tokenExpiry = (familyExpiresAt) => new Date(Math.min(Date.now() + refreshIdleMs(), familyExpiresAt.getTime()));

async function insert(db, user, familyId, familyExpiresAt) {
  const token = generateToken();
  const expiresAt = tokenExpiry(familyExpiresAt);
  await db.refreshToken.create({ data: { userId: user.id, familyId, tokenHash: sha256(token), tokenVersion: user.tokenVersion, expiresAt, familyExpiresAt } });
  return { token, familyId, expiresAt };
}

// Đăng nhập xong (đủ password, và MFA nếu bật): mở family mới. familyExpiresAt truyền vào khi cần giữ trần cũ
// (đổi mật khẩu không được kéo dài hạn tối đa của lần đăng nhập).
export const startFamily = (user, { db = prisma, familyExpiresAt = new Date(Date.now() + refreshAbsoluteMs()) } = {}) => insert(db, user, randomUUID(), familyExpiresAt);

export const revokeFamily = (familyId, db = prisma) => db.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });

// Đổi mật khẩu, đặt lại mật khẩu: thu hồi mọi family của user (kể cả kẻ đang giữ refresh token đánh cắp) VÀ xoá mọi challenge
// MFA đang chờ — người vừa qua bước password bằng mật khẩu cũ không được đi tiếp bước MFA (lỗi phát hiện ở bước 40, check-mfa B).
export async function revokeUserFamilies(db, userId) {
  await db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await db.mfaChallenge.deleteMany({ where: { userId } });
}

export const familyExpiry = async (familyId) =>
  (await prisma.refreshToken.findFirst({ where: { familyId }, select: { familyExpiresAt: true } }))?.familyExpiresAt ?? null;

const USER_FIELDS = { id: true, email: true, username: true, role: true, status: true, chefId: true, tokenVersion: true };

// Đổi refresh token cũ lấy token mới cùng family. Trả { user, token, familyId, expiresAt } hoặc { error }.
export async function rotateRefreshToken(token) {
  if (typeof token !== "string" || !FORMAT.test(token)) return { error: "invalid" };
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row) return { error: "invalid" };
  // Token ĐÃ DÙNG xuất hiện lại: có hai bên cùng giữ nó, server không biết bên nào là chủ thật → thu hồi cả family, cả hai
  // phải đăng nhập lại (plan 15.2 b: nghiêm ngặt như slide, không có ân hạn).
  if (row.usedAt) {
    await revokeFamily(row.familyId);
    return { error: "reused" };
  }
  if (row.revokedAt || row.expiresAt <= new Date()) return { error: "invalid" };

  const user = await prisma.user.findUnique({ where: { id: row.userId }, select: USER_FIELDS });
  // tokenVersion lệch: token cấp trước khi đổi / đặt lại mật khẩu. Tài khoản không còn active: không cấp tiếp.
  if (!user || user.status !== "active" || user.tokenVersion !== row.tokenVersion) {
    await revokeFamily(row.familyId);
    return { error: "invalid" };
  }

  // Đánh dấu đã dùng bằng câu ghi có điều kiện, cùng transaction với việc cấp token mới: hai request gửi cùng một token đồng
  // thời thì chỉ một request được count = 1; request kia bị coi là dùng lại → thu hồi family.
  const next = await prisma.$transaction(async (tx) => {
    const { count } = await tx.refreshToken.updateMany({ where: { id: row.id, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
    if (count !== 1) return null;
    return insert(tx, user, row.familyId, row.familyExpiresAt);
  });
  if (!next) {
    await revokeFamily(row.familyId);
    return { error: "reused" };
  }
  return { user, ...next };
}

// Đăng xuất: thu hồi family của token đang giữ. Token lạ hoặc đã thu hồi thì thôi.
export async function revokeRefreshToken(token) {
  if (typeof token !== "string" || !FORMAT.test(token)) return;
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, select: { familyId: true } });
  if (row) await revokeFamily(row.familyId);
}
