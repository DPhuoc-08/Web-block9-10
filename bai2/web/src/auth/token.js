// Nơi DUY NHẤT đụng tới token (plan 12.6). sessionStorage: còn sau Reload, không sang tab mới, mất khi đóng tab, nên tồn tại ngắn hơn
// localStorage. Rủi ro còn lại: XSS đọc được token (slide 43), vì vậy web không render HTML thô và token chỉ sống 30 phút.
// Chỉ lưu token. userId, role lấy từ /api/auth/me, không lưu để quyết định quyền.
const KEY = "accessToken";
const listeners = new Set();

function read() {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}
let token = read();
// Lý do vừa mất token ("expired", "logged-out", "mfa-disabled"): route guard dùng để báo đúng lời ở trang đăng nhập.
let reason = null;

const emit = () => listeners.forEach((fn) => fn());
export const getToken = () => token;
export const signOutReason = () => reason;
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setToken(value) {
  token = value;
  reason = null;
  try { sessionStorage.setItem(KEY, value); } catch {}
  emit();
}

export function clearToken(why = null) {
  token = null;
  reason = why;
  try { sessionStorage.removeItem(KEY); } catch {}
  emit();
}
