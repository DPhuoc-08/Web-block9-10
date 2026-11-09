import { Link } from "react-router";
import { getDish } from "../api/dishes.js";
import { useLoad } from "../hooks/useLoad.js";

// Khung các trang tài khoản (bản Figma đã duyệt ở block8): ≥ 1024px chia đôi, nhỏ hơn thì dải ảnh trên đầu.
// Ảnh và dòng ghi công đọc từ món thật của thực đơn qua route công khai; lỗi thì chỉ còn nền màu.
const DISH_FOR = { login: 1, register: 2, activate: 6, forgot: 8, reset: 3 };

export default function AuthShell({ page, children }) {
  const { data: dish } = useLoad((signal) => getDish(DISH_FOR[page], { signal }), [page]);
  const photo = dish?.imageUrl ? dish : null;
  return (
    <div className="auth">
      <aside className="auth-photo">
        {photo && <img className="auth-photo-img" src={photo.imageUrl} alt="" referrerPolicy="no-referrer" />}
        <div className="auth-brand">
          <Link className="auth-brand-name" to="/dishes">
            Nhà hàng
          </Link>
          <Link className="auth-brand-back" to="/dishes">
            <span className="wide-only">← Về thực đơn</span>
            <span className="narrow-only">Thực đơn</span>
          </Link>
        </div>
        <div className="auth-greet">
          <p className="auth-slogan">
            Ăn một bữa,
            <br className="wide-only" /> đi trọn ba miền
          </p>
          <p className="auth-intro">Phở, bún, cơm, lẩu và đồ uống của 60 đầu bếp — quản lý thực đơn ngay sau khi đăng nhập.</p>
          {photo && (
            <p className="auth-credit">
              Ảnh: {photo.name}
              {photo.imageCredit ? ` · ${photo.imageCredit}` : ""}
            </p>
          )}
        </div>
      </aside>
      <main className="auth-main">{children}</main>
    </div>
  );
}
