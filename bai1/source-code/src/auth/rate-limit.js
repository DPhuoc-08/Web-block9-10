// Bộ đếm cho giới hạn tần suất và chống brute force (plan mục 5.6), lưu trong bảng rate_limits.
// Ở DB (không ở cookie, localStorage hay bộ nhớ tiến trình): xoá cookie, mở tab ẩn danh, khởi động lại server đều
// KHÔNG đặt lại bộ đếm. Khoá là chuỗi do code ghép từ hằng + email chuẩn hoá / req.ip, ví dụ "login-fail:email:an@x.vn".
import { prisma } from "../db.js";

// Tăng bộ đếm bằng MỘT câu SQL (INSERT … ON CONFLICT DO UPDATE … RETURNING): hai request đồng thời được PostgreSQL
// xếp hàng trên cùng một dòng → không có cảnh cả hai cùng đọc count = 2 rồi cùng ghi 3.
// - Cửa sổ đã qua (windowStart cũ hơn windowMs) → đếm lại từ 1, cửa sổ mới bắt đầu từ bây giờ.
// - Đạt `lockAt` lần trong cửa sổ và có lockMs → khoá đến now + lockMs (lockAt = 0: không khoá, chỉ đếm).
// - Khoá còn hiệu lực thì giữ nguyên dù cửa sổ đã qua.
// Trả { count, lockedUntil }.
export async function hit(key, { windowMs, lockAt = 0, lockMs = 0 }) {
  const [row] = await prisma.$queryRaw`
    WITH p AS (SELECT ${key}::text AS k, ${windowMs}::int * interval '1 millisecond' AS w,
                      ${lockAt}::int AS lock_at, ${lockMs}::int * interval '1 millisecond' AS lock_for)
    INSERT INTO rate_limits (key, count, "windowStart", "lockedUntil")
    SELECT k, 1, now(), CASE WHEN lock_at = 1 AND lock_for > interval '0' THEN now() + lock_for END FROM p
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits."windowStart" < now() - (SELECT w FROM p) THEN 1 ELSE rate_limits.count + 1 END,
      "windowStart" = CASE WHEN rate_limits."windowStart" < now() - (SELECT w FROM p) THEN now() ELSE rate_limits."windowStart" END,
      "lockedUntil" = CASE
        WHEN (SELECT lock_at FROM p) > 0 AND (SELECT lock_for FROM p) > interval '0'
             AND (CASE WHEN rate_limits."windowStart" < now() - (SELECT w FROM p) THEN 1 ELSE rate_limits.count + 1 END) >= (SELECT lock_at FROM p)
          THEN now() + (SELECT lock_for FROM p)
        WHEN rate_limits."lockedUntil" > now() THEN rate_limits."lockedUntil"
        ELSE NULL END
    RETURNING count, "lockedUntil"`;
  return { count: row.count, lockedUntil: row.lockedUntil };
}

// Đọc trạng thái hiện tại mà không tăng: { count (0 nếu cửa sổ đã qua), lockedUntil (null nếu hết khoá) }.
export async function peek(key, { windowMs }) {
  const row = await prisma.rateLimit.findUnique({ where: { key } });
  if (!row) return { count: 0, lockedUntil: null };
  const now = Date.now();
  return {
    count: row.windowStart.getTime() >= now - windowMs ? row.count : 0,
    lockedUntil: row.lockedUntil && row.lockedUntil.getTime() > now ? row.lockedUntil : null,
  };
}

export const reset = (key) => prisma.rateLimit.deleteMany({ where: { key } });

// Đặt khoá ngay, không tăng bộ đếm: dùng khi nơi gọi đã giữ lượt bằng hit() và tự quyết lúc khoá (auth/mfa.js, plan 14 L1).
// Một câu ghi; khoá còn hiệu lực thì giữ nguyên, không kéo dài (gửi thêm khi đang khoá không làm người dùng bị khoá lâu hơn).
// Trả lockedUntil.
export async function lock(key, lockMs) {
  const [row] = await prisma.$queryRaw`
    INSERT INTO rate_limits (key, count, "windowStart", "lockedUntil")
    VALUES (${key}, 0, now(), now() + ${lockMs}::int * interval '1 millisecond')
    ON CONFLICT (key) DO UPDATE SET "lockedUntil" = CASE
      WHEN rate_limits."lockedUntil" > now() THEN rate_limits."lockedUntil"
      ELSE now() + ${lockMs}::int * interval '1 millisecond' END
    RETURNING "lockedUntil"`;
  return row.lockedUntil;
}

// Số giây còn phải chờ (header Retry-After của trang 429).
export const retryAfter = (until) => Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 1000));

// Giới hạn tần suất đơn giản: đếm request trong cửa sổ, quá `max` → bị giới hạn (không khoá thêm).
// Trả { limited, retryAfter } — retryAfter tính tới lúc cửa sổ hiện tại kết thúc.
export async function limit(key, { windowMs, max }) {
  const { count } = await hit(key, { windowMs });
  if (count <= max) return { limited: false };
  const row = await prisma.rateLimit.findUnique({ where: { key }, select: { windowStart: true } });
  return { limited: true, retryAfter: retryAfter(row.windowStart.getTime() + windowMs) };
}
