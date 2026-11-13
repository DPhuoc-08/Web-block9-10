// Dọn bản ghi hết hạn (plan mục 3.2, 15): refresh token và challenge MFA đã hết hạn, bộ đếm có cửa sổ và thời gian khoá đều đã qua.
// Refresh token đã dùng nhưng còn hạn được GIỮ để phát hiện dùng lại (thu hồi cả family).
// Chạy khi server khởi động và mỗi 30 phút; lỗi chỉ ghi log (lần sau dọn tiếp), không làm sập server.
import { prisma } from "../db.js";

const EVERY_MS = 30 * 60_000;
const WINDOW_MAX_MS = 60 * 60_000; // cửa sổ dài nhất của các bộ đếm (1 giờ, plan mục 4)

export async function cleanup() {
  const now = new Date();
  const [refreshTokens, challenges, limits] = await Promise.all([
    prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.mfaChallenge.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.rateLimit.deleteMany({
      where: { windowStart: { lt: new Date(now - WINDOW_MAX_MS) }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    }),
  ]);
  return { refreshTokens: refreshTokens.count, mfaChallenges: challenges.count, rateLimits: limits.count };
}

export function startCleanup() {
  const run = () => cleanup().catch((err) => console.error("Dọn token / bộ đếm hết hạn thất bại:", err.code ?? err.message));
  run();
  setInterval(run, EVERY_MS).unref();
}
