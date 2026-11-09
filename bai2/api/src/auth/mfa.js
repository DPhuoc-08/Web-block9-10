// Logic MFA (slide 18–23; plan mục 6). Không đụng req/res để Bài 2 chép nguyên; đọc và ghi database qua prisma.
// Mọi hàm kiểm tra mã trả { ok: true, ... } hoặc { ok: false, reason: "invalid" | "locked", retryAfter? }.
import QRCode from "qrcode";
import { prisma } from "../db.js";
import { hit, peek, reset, retryAfter } from "./rate-limit.js";
import { verifyPassword } from "./password.js";
import { openSecret, sealSecret } from "./secret-box.js";
import { acceptedStep, isTotpFormat, newTotpSecret, otpauthUri } from "./totp.js";
import { generateRecoveryCodes, hashRecovery, isRecoveryFormat } from "./recovery.js";

const MIN = 60_000;
const FAIL_WINDOW = 15 * MIN;
const FAIL_LOCK_AT = 5;
const FAIL_LOCK_FOR = 15 * MIN;
// Một bộ đếm theo user cho OTP, recovery code và bước xác thực lại: nếu tách riêng, kẻ tấn công được thử gấp nhiều lần.
const failKey = (userId) => `mfa-fail:user:${userId}`;
const lockedResult = (until) => ({ ok: false, reason: "locked", retryAfter: retryAfter(until) });

// Khung chung: đang khoá thì từ chối dù mã đúng; sai thì tăng bộ đếm; đúng thì xoá bộ đếm.
async function attempt(userId, check) {
  const state = await peek(failKey(userId), { windowMs: FAIL_WINDOW });
  if (state.lockedUntil) return lockedResult(state.lockedUntil);
  const outcome = await check();
  if (outcome) {
    await reset(failKey(userId));
    return { ok: true, ...outcome };
  }
  const after = await hit(failKey(userId), { windowMs: FAIL_WINDOW, lockAt: FAIL_LOCK_AT, lockMs: FAIL_LOCK_FOR });
  return after.lockedUntil ? lockedResult(after.lockedUntil) : { ok: false, reason: "invalid" };
}

async function consumeTotp(userId, code) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { mfaSecret: true } });
  if (!user?.mfaSecret) return null;
  const step = acceptedStep(openSecret(user.mfaSecret, userId), code);
  if (step === null) return null;
  // Chặn dùng lại mã (slide 21): chỉ nhận bước lớn hơn bước đã chấp nhận, và điều kiện nằm trong câu ghi. Hai request cùng
  // gửi một mã thì PostgreSQL xếp hàng trên dòng này, chỉ một request khớp điều kiện, request kia count = 0.
  const { count } = await prisma.user.updateMany({
    where: { id: userId, mfaEnabled: true, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] },
    data: { mfaLastStep: step },
  });
  return count === 1 ? { via: "totp" } : null;
}

async function consumeRecovery(userId, raw) {
  if (!isRecoveryFormat(raw)) return null;
  // usedAt: null nằm trong câu ghi nên một mã không thể được tiêu thụ hai lần, kể cả khi gửi đồng thời.
  const { count } = await prisma.recoveryCode.updateMany({ where: { userId, codeHash: hashRecovery(raw), usedAt: null }, data: { usedAt: new Date() } });
  if (count !== 1) return null;
  return { via: "recovery", remaining: await prisma.recoveryCode.count({ where: { userId, usedAt: null } }) };
}

export const verifyTotp = (userId, code) => attempt(userId, () => consumeTotp(userId, code));
export const verifyRecovery = (userId, raw) => attempt(userId, () => consumeRecovery(userId, raw));

// Xác thực lại trước khi thay, tắt MFA, tạo lại recovery code (slide 23): bắt buộc cả password và yếu tố thứ hai, dù phiên đã
// đầy đủ. So password trước để nhập sai password không làm mất một recovery code.
export const reauthenticate = (userId, password, factor) =>
  attempt(userId, async () => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user || !(await verifyPassword(user.passwordHash, password))) return null;
    return isTotpFormat(factor) ? consumeTotp(userId, factor) : consumeRecovery(userId, factor);
  });

// Secret chờ xác nhận nằm ở mfaPendingSecret: chưa có hiệu lực đăng nhập và không ghi đè secret đang dùng (ghi chú 18).
const setPending = async (userId, enabled) => {
  const { count } = await prisma.user.updateMany({ where: { id: userId, mfaEnabled: enabled }, data: { mfaPendingSecret: sealSecret(newTotpSecret(), userId) } });
  return count === 1;
};
export const startEnrollment = (userId) => setPending(userId, false);
export const startReplacement = (userId) => setPending(userId, true);

// Dữ liệu để vẽ trang thiết lập; không có secret chờ thì null. Chỉ đọc, nên an toàn khi là GET.
export async function readEnrollment(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, mfaEnabled: true, mfaPendingSecret: true } });
  if (!user?.mfaPendingSecret) return null;
  const secret = openSecret(user.mfaPendingSecret, userId);
  const qrDataUrl = await QRCode.toDataURL(otpauthUri(secret, user.email), { width: 360, margin: 1, errorCorrectionLevel: "M" });
  return { secret, qrDataUrl, replacing: user.mfaEnabled };
}

const replaceCodes = async (tx, userId) => {
  const codes = generateRecoveryCodes();
  await tx.recoveryCode.deleteMany({ where: { userId } }); // sinh nhóm mới thì nhóm cũ vô hiệu (slide 22)
  await tx.recoveryCode.createMany({ data: codes.map((code) => ({ userId, codeHash: hashRecovery(code) })) });
  return codes;
};

// Chỉ bật MFA khi nhập đúng một mã (slide 53). Lần đầu bật thì sinh recovery code; thay thiết bị thì giữ nguyên nhóm mã cũ.
export const confirmEnrollment = (userId, code) =>
  attempt(userId, async () => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { mfaEnabled: true, mfaPendingSecret: true } });
    if (!user?.mfaPendingSecret) return null;
    const step = acceptedStep(openSecret(user.mfaPendingSecret, userId), code);
    if (step === null) return null;
    return prisma.$transaction(
      async (tx) => {
        // So khớp đúng bản mã vừa kiểm tra: tab khác vừa tạo secret mới thì không dòng nào khớp, không bật nhầm secret cũ.
        const { count } = await tx.user.updateMany({
          where: { id: userId, mfaPendingSecret: user.mfaPendingSecret },
          data: { mfaSecret: user.mfaPendingSecret, mfaPendingSecret: null, mfaEnabled: true, mfaLastStep: step },
        });
        if (count !== 1) return null;
        return { replaced: user.mfaEnabled, codes: user.mfaEnabled ? null : await replaceCodes(tx, userId) };
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
  });

export const regenerateCodes = (userId) => prisma.$transaction((tx) => replaceCodes(tx, userId), { maxWait: 10_000, timeout: 15_000 });

export const disableMfa = (userId) =>
  prisma.$transaction(
    async (tx) => {
      // Bài 2 (plan 12.7): tăng tokenVersion trong cùng transaction, nên mọi JWT đã cấp hết hiệu lực ngay khi tắt MFA.
      await tx.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecret: null, mfaPendingSecret: null, mfaLastStep: null, tokenVersion: { increment: 1 } } });
      await tx.recoveryCode.deleteMany({ where: { userId } });
      await tx.mfaChallenge.deleteMany({ where: { userId } });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );

export async function mfaSummary(userId) {
  const [user, remaining] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { mfaEnabled: true } }),
    prisma.recoveryCode.count({ where: { userId, usedAt: null } }),
  ]);
  return { enabled: Boolean(user?.mfaEnabled), remaining };
}
