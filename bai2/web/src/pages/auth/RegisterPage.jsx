import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { register } from "../../api/auth.js";
import { isBusiness } from "../../api/client.js";
import AuthShell from "../../components/AuthShell.jsx";
import { Banner, Field } from "../../components/AuthBits.jsx";
import Captcha from "../../components/Captcha.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { CAPTCHA_MSG, errorBanner } from "./authErrors.js";

// Không có ô role. Mọi trường hợp email (mới, đang chờ, đã có) nhận cùng response nên trang luôn chuyển sang nhập mã.
export default function RegisterPage() {
  useDocumentTitle("Tạo tài khoản");
  const navigate = useNavigate();
  const [v, setV] = useState({ username: "", email: "", password: "", passwordConfirm: "" });
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const captcha = useRef(null);
  const set = (k) => (value) => {
    setV((old) => ({ ...old, [k]: value }));
    setErrors(({ [k]: _removed, ...rest }) => rest);
  };

  async function onSubmit(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setBanner(null);
    try {
      const data = await register({ ...v, captchaToken });
      navigate("/activate", { state: { email: v.email.trim(), registered: true, resendAfter: data.resendAfter } });
    } catch (err) {
      if (isBusiness(err, "VALIDATION_FAILED")) {
        setErrors(err.fields);
        setBanner({ kind: "error", text: "Kiểm tra lại các ô được đánh dấu bên dưới." });
      } else if (isBusiness(err, "CAPTCHA_REQUIRED") || isBusiness(err, "INVALID_CAPTCHA")) {
        setErrors({ captcha: CAPTCHA_MSG[err.code] });
        setBanner({ kind: "error", text: "Hãy xác nhận bạn không phải người máy rồi gửi lại." });
      } else setBanner(errorBanner(err));
      captcha.current?.reset();
      busy.current = false;
      setSubmitting(false);
    }
  }

  return (
    <AuthShell page="register">
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <div className="auth-head">
          <h1>Tạo tài khoản</h1>
          <p>Dùng email của bạn. Chúng tôi gửi mã 6 số để kích hoạt tài khoản.</p>
        </div>
        <Banner banner={banner} />
        <div className="auth-fields">
          <Field name="username" label="Tên hiển thị" value={v.username} onChange={set("username")} autoComplete="name" placeholder="Nguyễn Văn An" error={errors.username} />
          <Field name="email" label="Email" type="email" value={v.email} onChange={set("email")} autoComplete="email" placeholder="ban@example.com" error={errors.email} />
          <Field name="password" label="Mật khẩu" type="password" value={v.password} onChange={set("password")} autoComplete="new-password" placeholder="Tạo mật khẩu" error={errors.password} toggle hint="8–64 ký tự. Một câu dễ nhớ cũng được." />
          <Field name="passwordConfirm" label="Nhập lại mật khẩu" type="password" value={v.passwordConfirm} onChange={set("passwordConfirm")} autoComplete="new-password" placeholder="Nhập lại mật khẩu" error={errors.passwordConfirm} toggle />
        </div>
        <Captcha ref={captcha} onToken={setCaptchaToken} error={errors.captcha} />
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Đang tạo tài khoản…" : "Tạo tài khoản"}
        </button>
        <hr className="auth-divider" />
        <p className="auth-foot">
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </p>
      </form>
    </AuthShell>
  );
}
