// Giữ recovery code gốc giữa hai request của Post/Redirect/Get (plan 12.11). Đề yêu cầu cả hai: ghi xong phải 303 (Block 5),
// và chỉ lưu hash, không lưu mã gốc, hiện một lần duy nhất (slide 22). Vì vậy mã gốc chỉ nằm trong bộ nhớ tiến trình tối đa
// 60 giây giữa POST và GET, gắn với lần đăng nhập (family refresh token, plan mục 15), đọc một lần là xoá: không ghi xuống
// database, cookie hay log.
// Chỉ Bài 1 cần: api của Bài 2 trả mã thẳng trong body JSON.
const HOLD_MS = 60_000;
const held = new Map();

export function holdCodes(familyId, codes) {
  held.set(familyId, { codes, expiresAt: Date.now() + HOLD_MS });
  // unref: bộ hẹn giờ không giữ tiến trình sống; người dùng không quay lại thì mã vẫn bị xoá.
  setTimeout(() => held.delete(familyId), HOLD_MS).unref();
}

export function takeCodes(familyId) {
  const entry = held.get(familyId);
  held.delete(familyId);
  return entry && entry.expiresAt > Date.now() ? entry.codes : null;
}
