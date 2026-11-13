import { useSyncExternalStore } from "react";
import { getMe } from "../api/auth.js";
import { getToken, subscribe } from "../auth/token.js";
import { useLoad } from "./useLoad.js";

export const useToken = () => useSyncExternalStore(subscribe, getToken);

// Ai đang đăng nhập: luôn hỏi GET /api/auth/me, không tự đọc payload của token, không lưu role (slide 44).
// Layout gọi một lần rồi truyền xuống bằng <Outlet context>, không dùng Context giữ dữ liệu (như block7).
// status: "anonymous" | "loading" | "ok" | "error". Lỗi mạng, 500 là "error": KHÔNG coi là đã đăng xuất (slide 39).
export function useAuth() {
  const token = useToken();
  const me = useLoad((signal) => (token ? getMe({ signal }) : Promise.resolve(null)), [token]);
  if (!token) return { status: "anonymous", user: null, reload: me.reload };
  return { status: me.status === "notFound" ? "error" : me.status, user: me.data, error: me.error, reload: me.reload };
}
