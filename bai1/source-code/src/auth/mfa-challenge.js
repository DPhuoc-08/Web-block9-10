// Bằng chứng đã qua bước password khi tài khoản bật MFA (plan mục 15, thay mfaPending trong session). File thuần.
// Chuỗi ngẫu nhiên trong cookie "mfa" (Path=/login/mfa), DB chỉ lưu hash, hạn 5 phút, dùng một lần. Nó không phải JWT nên
// loadUser không bao giờ coi nó là đăng nhập; access / refresh token chỉ được cấp sau khi tiêu thụ nó ở bước MFA.
import { prisma } from "../db.js";
import { generateToken, sha256 } from "./secrets.js";

export const MFA_PENDING_MS = 5 * 60_000; // bước password không được trở thành quyền vào lâu dài (plan mục 4)
const FORMAT = /^[A-Za-z0-9_-]{43}$/;

export async function issueChallenge(userId, next) {
  const token = generateToken();
  const now = new Date();
  await prisma.$transaction([
    prisma.mfaChallenge.deleteMany({ where: { userId, OR: [{ usedAt: { not: null } }, { expiresAt: { lt: now } }] } }),
    prisma.mfaChallenge.create({ data: { userId, tokenHash: sha256(token), next: typeof next === "string" ? next : "", expiresAt: new Date(now.getTime() + MFA_PENDING_MS) } }),
  ]);
  return token;
}

// { pending } | { expired: true } | null (không có / lạ / đã dùng).
export async function readChallenge(token) {
  if (typeof token !== "string" || !FORMAT.test(token)) return null;
  const row = await prisma.mfaChallenge.findUnique({ where: { tokenHash: sha256(token) }, select: { id: true, userId: true, next: true, usedAt: true, expiresAt: true } });
  if (!row || row.usedAt) return null;
  if (row.expiresAt <= new Date()) return { expired: true };
  return { pending: { id: row.id, userId: row.userId, next: row.next } };
}

// Dùng một lần: điều kiện nằm trong câu ghi nên hai request cùng challenge chỉ một request được cấp token.
export async function consumeChallenge(id) {
  const { count } = await prisma.mfaChallenge.updateMany({ where: { id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
  return count === 1;
}
