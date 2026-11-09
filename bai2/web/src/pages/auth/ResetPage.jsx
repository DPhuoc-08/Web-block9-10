import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { resetPassword } from "../../api/auth.js";
import { isBusiness } from "../../api/client.js";
import AuthShell from "../../components/AuthShell.jsx";
import { AuthResult, Banner, Field } from "../../components/AuthBits.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { errorBanner } from "./authErrors.js";

export default function ResetPage() {
  useDocumentTitle("Đặt mật khẩu mới");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [token] = useState(() => params.get("token") ?? "");
  const [v, setV] = useState({ password: "", passwordConfirm: "" });
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [unusable, setUnusable] = useState(token === "");
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);

  // Đọc token xong thì bỏ khỏi thanh địa chỉ: không còn trong lịch sử trình duyệt, không đi theo Referer sang ảnh, font bên ngoài.
  useEffect(() => {
    if (window.location.search) window.history.replaceState(window.history.state, "", "/reset");
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setBanner(null);
    setErrors({});
    try {
      await resetPassword({ token, ...v });
      navigate("/login?msg=password-reset", { replace: true });
    } catch (err) {
      if (isBusiness(err, "INVALID_RESET_TOKEN")) setUnusable(true);
      else if (isBusiness(err, "VALIDATION_FAILED")) {
        setErrors(err.fields);
        setBanner({ kind: "error", text: "Kiểm tra lại mật khẩu mới." });
      } else setBanner(errorBanner(err));
      busy.current = false;
      setSubmitting(false);
    }
  }

  if (unusable) {
    return (
      <AuthShell page="reset">
        <AuthResult icon="warn" heading="Link không dùng được" text="Link đã hết hạn, đã được dùng hoặc không đúng. Hãy yêu cầu một link mới." button={{ to: "/forgot", label: "Gửi link mới" }} link={{ to: "/login", text: "Về đăng nhập" }} />
      </AuthShell>
    );
  }

  const set = (k) => (value) => setV((old) => ({ ...old, [k]: value }));
  return (
    <AuthShell page="reset">
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <div className="auth-head">
          <h1>Đặt mật khẩu mới</h1>
          <p>Sau khi đổi, mọi phiên đăng nhập cũ của tài khoản sẽ hết hiệu lực.</p>
        </div>
        <Banner banner={banner} />
        <div className="auth-fields">
          <Field name="password" label="Mật khẩu mới" type="password" value={v.password} onChange={set("password")} autoComplete="new-password" placeholder="Tạo mật khẩu mới" error={errors.password} toggle hint="8–64 ký tự. Một câu dễ nhớ cũng được." />
          <Field name="passwordConfirm" label="Nhập lại mật khẩu mới" type="password" value={v.passwordConfirm} onChange={set("passwordConfirm")} autoComplete="new-password" placeholder="Nhập lại mật khẩu mới" error={errors.passwordConfirm} toggle />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Đang lưu…" : "Lưu mật khẩu mới"}
        </button>
        <hr className="auth-divider" />
        <p className="auth-foot">
          <Link to="/login">Về đăng nhập</Link>
        </p>
      </form>
    </AuthShell>
  );
}
