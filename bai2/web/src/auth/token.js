// Nơi DUY NHẤT đụng tới token (plan 12.6, 15). sessionStorage: còn sau Reload, không sang tab mới, mất khi đóng tab, nên tồn tại ngắn
// hơn localStorage. Rủi ro còn lại: XSS đọc được cả hai token (slide 43), vì vậy web không render HTML thô; access token chỉ sống
// 90 giây, refresh token thu hồi được ở server (đăng xuất, phát hiện dùng lại).
// Chỉ lưu token. userId, role lấy từ /api/auth/me, không lưu để quyết định quyền.
const KEY = "accessToken";
const REFRESH_KEY = "refreshToken";
const listeners = new Set();

function read(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
let token = read(KEY);
let refresh = read(REFRESH_KEY);
// Lý do vừa mất token ("expired", "logged-out", "mfa-disabled"): route guard dùng để báo đúng lời ở trang đăng nhập.
let reason = null;

const emit = () => listeners.forEach((fn) => fn());
export const getToken = () => token;
export const getRefreshToken = () => refresh;
export const signOutReason = () => reason;
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Đăng nhập, MFA, refresh đều trả cặp mới; refresh token cũ đã bị server đánh dấu đã dùng nên phải thay ngay.
export function setToken(value, refreshValue) {
  token = value;
  refresh = refreshValue ?? null;
  reason = null;
  try {
    sessionStorage.setItem(KEY, value);
    if (refresh) sessionStorage.setItem(REFRESH_KEY, refresh);
    else sessionStorage.removeItem(REFRESH_KEY);
  } catch {}
  emit();
}

export function clearToken(why = null) {
  token = null;
  refresh = null;
  reason = why;
  try {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(REFRESH_KEY);
  } catch {}
  emit();
}
