import { Link, Outlet, useLocation, useNavigate } from "react-router";
import Flash from "./Flash.jsx";
import { clearToken } from "../auth/token.js";
import { useAuth } from "../hooks/useAuth.js";

// Khung chung của mọi trang. <Outlet /> là chỗ router đặt trang khớp với URL hiện tại.
// Bấm link trong khung (Link) chỉ đổi URL bằng History API — không có document request mới.
export default function Layout() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith("/admin");
  const navigate = useNavigate();
  const auth = useAuth();
  // Đăng xuất chỉ xoá token ở trình duyệt này (plan 12.7). Bản sao token ở nơi khác vẫn dùng được tới hết hạn; đã công bố giới hạn này.
  function logout() {
    clearToken("logged-out");
    navigate("/login?msg=logged-out");
  }

  return (
    <div className={isAdmin ? "admin app" : "app"}>
      <header className="site-header">
        <div className="container">
          <Link className="brand" to="/dishes">
            Nhà hàng{isAdmin && <span> / Quản trị</span>}
          </Link>
          <nav className="site-nav" aria-label="Điều hướng chính">
            <Link to="/dishes" aria-current={isAdmin ? undefined : "page"}>
              Thực đơn
            </Link>
            <Link to="/admin/dishes" aria-current={isAdmin ? "page" : undefined}>
              Quản trị
            </Link>
          </nav>
          {auth.user && (
            <div className="account">
              <Link className="account-email" to="/admin/security" title={auth.user.email}>
                {auth.user.username ?? auth.user.email}
              </Link>
              <button type="button" className="btn btn-sm" onClick={logout}>
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="container">
        <Flash />
        {/* Truyền danh tính xuống bằng context của Outlet: route guard và các trang quản trị dùng chung một lần gọi /api/auth/me. */}
        <Outlet context={auth} />
      </main>

      {!isAdmin && (
        <footer className="site-footer">
          <div className="container">
            <span>© 2026 Nhà hàng · Món Việt ba miền</span>
          </div>
        </footer>
      )}
    </div>
  );
}
