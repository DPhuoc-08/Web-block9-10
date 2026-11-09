// Mã hoá TOTP secret bằng AES-256-GCM (ghi chú 18). Secret phải lấy lại được giá trị gốc để tính mã nên không băm một chiều
// như password; khoá nằm trong .env, tách khỏi database: lộ bảng users mà không có khoá thì không dùng được secret.
// GCM kèm thẻ xác thực nên bản mã bị sửa sẽ giải mã thất bại. File thuần, chép nguyên sang Bài 2.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const k = Buffer.from(process.env.MFA_ENCRYPTION_KEY ?? "", "base64url");
  if (k.length !== 32) throw new Error("MFA_ENCRYPTION_KEY phải là 32 byte dạng base64url (xem .env.example).");
  return k;
}

// Gọi lúc khởi động: thiếu hoặc sai khoá thì server không chạy, thay vì lỗi lúc người dùng bật MFA.
export const assertMfaKey = () => void key();

// userId làm dữ liệu xác thực kèm (AAD): chép bản mã của người này sang dòng của người khác sẽ giải mã thất bại.
const aad = (userId) => Buffer.from(`mfa:${userId}`);

export function sealSecret(plain, userId) {
  const iv = randomBytes(12); // IV mới cho mỗi lần mã hoá: GCM mất an toàn nếu dùng lại IV với cùng khoá
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(aad(userId));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function openSecret(sealed, userId) {
  const [version, iv, tag, body] = String(sealed).split(".");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("Bản mã TOTP secret không đúng định dạng.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAAD(aad(userId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
