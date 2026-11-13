// Chống CSRF (plan mục 6.3, đổi ở mục 15 vì không còn session) — ba lớp kết hợp:
// 1. Cookie có SameSite=Lax: trình duyệt không gửi cookie trong POST xuất phát từ site khác.
// 2. Double-submit: cookie "csrf" (HttpOnly, ngẫu nhiên) phải trùng ô ẩn _csrf của MỌI form ghi dữ liệu. Trang lạ không đọc
//    được cookie lẫn trang của mình nên không biết giá trị → request giả bị từ chối dù trình duyệt có gửi cookie.
// 3. Header Origin (trình duyệt gửi kèm mọi POST) phải là CHÍNH site này: APP_ORIGIN, hoặc đúng địa chỉ mà trình duyệt
//    đang mở (vd. http://127.0.0.1:3000 thay vì http://localhost:3000). Form tự gửi từ trang lạ mang Origin của trang lạ
//    → bị từ chối; trang lạ không đổi được header Origin mà trình duyệt của nạn nhân gửi.
// Kiểm tra trên method GỐC (POST) trước method-override; GET/HEAD/OPTIONS không ghi gì nên không kiểm.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { COOKIE, readCookies, getCookie, setCookie, clearCookie } from "./cookies.js";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
const FORMAT = /^[A-Za-z0-9_-]{43}$/;

// Token chỉ tạo khi trang thật sự in một form ghi dữ liệu → khách chỉ xem thực đơn thì không nhận cookie nào.
function tokenFor(req, res) {
  const cookies = readCookies(req);
  if (!FORMAT.test(cookies[COOKIE.csrf] ?? "")) {
    cookies[COOKIE.csrf] = randomBytes(32).toString("base64url");
    setCookie(res, "csrf", cookies[COOKIE.csrf]); // cookie phiên trình duyệt: mất khi đóng trình duyệt, trang sau tự tạo lại
  }
  return cookies[COOKIE.csrf];
}

// Đăng nhập, đăng xuất: bỏ token cũ, trang sau tự tạo token mới (như regenerate của session cũ).
export function resetCsrf(req, res) {
  delete readCookies(req)[COOKIE.csrf];
  clearCookie(res, "csrf");
}

const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

export function csrf(req, res, next) {
  // Template gọi csrf() ngay trong form (một hàm, không phải giá trị tính sẵn: res.render sao chép locals).
  res.locals.csrf = () => tokenFor(req, res);
  if (SAFE.has(req.method)) return next();

  const origin = req.get("origin");
  const expected = getCookie(req, "csrf");
  const sent = req.body?._csrf;
  // Ngoại lệ duy nhất: POST /reset với Origin "null". Trang đặt lại mật khẩu có Referrer-Policy: no-referrer (để token
  // trong URL không lọt ra ngoài) và theo chuẩn Fetch, trang như vậy gửi form kèm Origin: null — chặn thì Chrome thật
  // không bao giờ đặt lại được mật khẩu (lỗi phát hiện ở bước 18). Request vẫn phải có _csrf đúng (dưới đây)
  // và reset token bí mật; mọi route khác vẫn từ chối Origin "null".
  const resetNull = origin === "null" && req.path === "/reset";
  const badOrigin = origin !== undefined && !resetNull && origin !== process.env.APP_ORIGIN && origin !== `${req.protocol}://${req.get("host")}`;
  if (badOrigin || !FORMAT.test(expected ?? "") || typeof sent !== "string" || !same(sent, expected)) {
    return res.status(403).render("403", { title: "Yêu cầu bị từ chối" });
  }
  next();
}
