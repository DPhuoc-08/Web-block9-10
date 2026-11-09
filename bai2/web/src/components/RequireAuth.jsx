import { Navigate, Outlet, useLocation, useOutletContext } from "react-router";
import { signOutReason } from "../auth/token.js";
import { Loading, LoadError, ForbiddenMessage } from "./StatusView.jsx";

// Route guard cho /admin/* (slide 64): chỉ quyết định hiện gì trên giao diện. Quyền thật do api kiểm tra ở từng request.
export default function RequireAuth() {
  const auth = useOutletContext();
  const { pathname, search } = useLocation();
  if (auth.status === "anonymous") {
    const reason = signOutReason();
    // Hết hạn thì nhớ trang đang mở để quay lại; tự đăng xuất, tắt MFA thì không.
    const query = new URLSearchParams({ ...(reason ? { msg: reason } : {}), ...(reason === null || reason === "expired" ? { next: pathname + search } : {}) });
    return <Navigate to={`/login?${query}`} replace />;
  }
  if (auth.status === "loading") return <Loading />;
  if (auth.status === "error") return <LoadError error={auth.error} onRetry={auth.reload} />;
  return <Outlet context={auth} />;
}

// Trang chỉ một số role được mở (form thêm, trang xoá): báo thiếu quyền ngay, thay vì để bấm rồi mới gặp 403.
export function Guard({ allow, text, children }) {
  const { user } = useOutletContext();
  return allow(user) ? children : <ForbiddenMessage text={text} />;
}
