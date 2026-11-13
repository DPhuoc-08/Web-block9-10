// Đọc / ghi cookie của Bài 1 sau khi bỏ express-session (plan mục 15). Một chỗ giữ tên và thuộc tính cookie.
// Mọi cookie đều HttpOnly (JavaScript của trang không đọc được: lỗi XSS không lấy được token), SameSite=Lax (không gửi kèm POST
// từ site khác), Secure khi production. Express 5 không tự đọc cookie nên có hàm nhỏ ở đây, không thêm gói (plan mục 0).
export const COOKIE = { access: "access", refresh: "refresh", csrf: "csrf", mfa: "mfa", reauth: "mfa_reauth", loginEmail: "login_email", activation: "activation" };

const base = () => ({ httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
// Path của từng cookie: chỉ gửi tới route cần nó. access, refresh, csrf cần ở mọi trang (server tự refresh ở request bất kỳ).
const PATH = { access: "/", refresh: "/", csrf: "/", mfa: "/login/mfa", reauth: "/admin/profile/mfa", loginEmail: "/login", activation: "/activate" };

export function readCookies(req) {
  if (req.cookies) return req.cookies;
  const out = {};
  for (const part of (req.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const name = part.slice(0, i).trim();
    if (Object.hasOwn(out, name)) continue; // trùng tên: lấy cookie đầu (path cụ thể nhất), không để cookie sau ghi đè
    try { out[name] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* giá trị hỏng: bỏ qua */ }
  }
  return (req.cookies = out);
}

// Đọc theo khoá nội bộ (access, refresh, csrf, mfa, reauth, loginEmail, activation), không theo tên cookie, để không lệch tên.
export const getCookie = (req, key) => readCookies(req)[COOKIE[key]];

// maxAgeMs không có → cookie mất khi đóng trình duyệt.
export function setCookie(res, key, value, maxAgeMs) {
  res.cookie(COOKIE[key], value, { ...base(), path: PATH[key], ...(maxAgeMs ? { maxAge: maxAgeMs } : {}) });
}
export const clearCookie = (res, key) => res.clearCookie(COOKIE[key], { ...base(), path: PATH[key] });
