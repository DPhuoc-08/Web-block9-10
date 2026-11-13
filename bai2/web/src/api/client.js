import { clearToken, getRefreshToken, getToken, setToken } from "../auth/token.js";

// Lớp gọi API DUY NHẤT của SPA. Các trang không gọi fetch trực tiếp mà gọi hàm trong api/*.js → đi qua đây.
// Một chỗ giữ URL gốc, một chỗ kiểm tra đủ 3 tầng lỗi:
//   Tầng 1 — không nhận được response (API tắt, mất mạng, bị CORS chặn)      → ApiError kind "network"
//   Tầng 2 — status 401/403/429 của xác thực                                 → kind "unauthenticated" | "forbidden" | "rate-limited"
//            status khác không 2xx, hoặc body không đúng shape               → ApiError kind "http"
//   Tầng 3 — status 200 nhưng ok: false (lỗi nghiệp vụ)                      → ApiError kind "business" + code, fields
// Thành công → trả về `data`. Không chỉ kiểm tra status: lỗi nghiệp vụ cũng có status 200.

// URL gốc của API: địa chỉ công khai, không phải bí mật (biến VITE_ được nhúng vào mã gửi cho browser).
const BASE_URL = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  constructor(kind, { message, status = null, code = null, fields = {}, dishes = [], captchaRequired = false, retryAfter = null }) {
    super(message);
    this.name = "ApiError";
    this.kind = kind; // "network" | "http" | "business" | "unauthenticated" | "forbidden" | "rate-limited"
    this.status = status;
    this.code = code; // chỉ có với "business": NOT_FOUND | VALIDATION_FAILED | IN_USE
    this.fields = fields; // { tênTrường: thông báo } — hiện lỗi cạnh đúng ô nhập
    this.dishes = dishes; // với IN_USE: các món đang dùng bản ghi
    this.captchaRequired = captchaRequired; // đăng nhập: lần gửi sau phải có CAPTCHA
    this.retryAfter = retryAfter; // 429: số giây phải chờ (header Retry-After)
  }
}

export const isBusiness = (err, code) => err instanceof ApiError && err.kind === "business" && err.code === code;

// anonymous: route công khai và route trước đăng nhập, KHÔNG gửi token (GET không sinh preflight thừa).
// on401: "throw" = trang tự xử lý; mặc định xoá token, route guard đưa về đăng nhập và nhớ trang đang mở (slide 39).
// Đổi refresh token lấy cặp mới (plan mục 15). Một lần gọi tại một thời điểm: nhiều request cùng gặp 401 thì chờ chung một lần refresh,
// vì refresh token chỉ dùng được một lần (gửi hai lần cùng token = server coi là bị đánh cắp và thu hồi cả family).
// Kết quả: "ok" | "rejected" (server từ chối → phải đăng nhập lại) | "error" (mạng, 429, 500 → KHÔNG đăng xuất).
let refreshing = null;
function refreshTokens() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.resolve("rejected");
  refreshing ??= (async () => {
    try {
      const res = await fetch(BASE_URL + "/api/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken }) });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok && json.data?.accessToken) {
        setToken(json.data.accessToken, json.data.refreshToken);
        return "ok";
      }
      return res.status === 401 ? "rejected" : "error";
    } catch {
      return "error";
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function request(method, path, { body, signal, anonymous = false, on401 = "expire", retried = false } = {}) {
  const init = { method, signal, headers: {} };
  // Gắn Authorization ở đúng một chỗ, và URL luôn là BASE_URL của API này (slide 39); các trang không tự gắn header.
  const token = anonymous ? null : getToken();
  if (token) init.headers.Authorization = `Bearer ${token}`;
  // Chỉ đặt Content-Type khi có body: GET không kèm header này nên không phải preflight.
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  // Tầng 1: fetch chỉ ném lỗi khi không có response. Lỗi CORS cũng rơi vào đây và không cho biết chi tiết
  // (chi tiết chỉ có trong Console của browser).
  let res;
  try {
    res = await fetch(BASE_URL + path, init);
  } catch (err) {
    if (err.name === "AbortError") throw err; // request bị huỷ có chủ đích (đổi trang/đổi id) — không phải lỗi
    throw new ApiError("network", { message: "Không kết nối được tới máy chủ." });
  }

  // Tầng 2: status phải 2xx và body phải là JSON có trường ok. Ví dụ server trả index.html (status 200)
  // cho một URL API gõ sai → không phải JSON → vẫn là lỗi kỹ thuật.
  let json = null;
  if ((res.headers.get("Content-Type") ?? "").includes("application/json")) {
    json = await res.json().catch(() => null);
  }
  // Đọc body trước khi phân loại. 500 và lỗi mạng KHÔNG đi vào đây nên không làm người dùng bị đăng xuất.
  if (json?.ok === false && [401, 403, 429].includes(res.status)) {
    const e = json.error ?? {};
    const info = { status: res.status, code: e.code ?? null, message: e.message ?? "Yêu cầu không thực hiện được." };
    if (res.status === 401) {
      // Access token hết hạn (90 giây) hoặc bị từ chối: thử refresh MỘT lần rồi gửi lại đúng request này. Request ẩn danh
      // (không gửi token) và lần gửi lại không refresh nữa, nên không có vòng lặp.
      if (token && !retried && on401 !== "throw") {
        const outcome = await refreshTokens();
        if (outcome === "ok") return request(method, path, { body, signal, anonymous, on401, retried: true });
        if (outcome === "error") throw new ApiError("network", { message: "Không kết nối được tới máy chủ." });
      }
      if (on401 !== "throw") clearToken("expired");
      throw new ApiError("unauthenticated", info);
    }
    if (res.status === 403) throw new ApiError("forbidden", info); // giữ token: có danh tính, chỉ thiếu quyền
    throw new ApiError("rate-limited", { ...info, retryAfter: Number(res.headers.get("Retry-After")) || null });
  }
  if (!res.ok || json === null || typeof json.ok !== "boolean") {
    throw new ApiError("http", { status: res.status, message: `Máy chủ trả lỗi (HTTP ${res.status}).` });
  }

  // Tầng 3: rẽ nhánh theo error.code (giá trị cố định), không theo message.
  if (!json.ok) {
    const e = json.error ?? {};
    throw new ApiError("business", {
      status: res.status,
      code: e.code ?? null,
      message: e.message ?? "Yêu cầu không thực hiện được.",
      fields: e.fields ?? {},
      dishes: e.dishes ?? [],
      captchaRequired: Boolean(e.captchaRequired),
    });
  }
  return json.data;
}

// Dựng query string, bỏ các giá trị rỗng: { q: "phở", sort: "" } → "?q=ph%E1%BB%9F"
export function toQuery(params = {}) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") sp.set(key, value);
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

// Id lấy từ URL của trang (có thể là "abc") được mã hoá trước khi ghép vào URL API; API tự trả NOT_FOUND.
export const idPath = (id) => encodeURIComponent(String(id));

export const api = {
  get: (path, opts) => request("GET", path, opts),
  post: (path, body, opts) => request("POST", path, { ...opts, body }),
  patch: (path, body, opts) => request("PATCH", path, { ...opts, body }),
  del: (path, opts) => request("DELETE", path, opts),
};
