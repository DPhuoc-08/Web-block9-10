import { useRef, useState } from "react";
import { Link } from "react-router";
import { forgot } from "../../api/auth.js";
import { isBusiness } from "../../api/client.js";
import AuthShell from "../../components/AuthShell.jsx";
import { AuthResult, Banner, Field } from "../../components/AuthBits.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { errorBanner } from "./authErrors.js";

export default function ForgotPage() {
  useDocumentTitle("Quên mật khẩu");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setBanner(null);
    setErrors({});
    try {
      await forgot({ email });
      setSent(true);
    } catch (err) {
      if (isBusiness(err, "VALIDATION_FAILED")) setErrors(err.fields);
      else setBanner(errorBanner(err));
    }
    busy.current = false;
    setSubmitting(false);
  }

  if (sent) {
    return (
      <AuthShell page="forgot">
        <AuthResult icon="mail" heading="Kiểm tra email của bạn" text="Nếu email đã đăng ký, chúng tôi đã gửi link đặt lại mật khẩu. Link có hạn 15 phút và chỉ dùng được một lần." button={{ to: "/login", label: "Về đăng nhập" }} />
      </AuthShell>
    );
  }

  return (
    <AuthShell page="forgot">
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <div className="auth-head">
          <h1>Quên mật khẩu</h1>
          <p>Nhập email đã đăng ký. Chúng tôi sẽ gửi link để bạn đặt mật khẩu mới.</p>
        </div>
        <Banner banner={banner} />
        <div className="auth-fields">
          <Field name="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" placeholder="ban@example.com" error={errors.email} />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Đang gửi…" : "Gửi link đặt lại"}
        </button>
        <hr className="auth-divider" />
        <p className="auth-foot">
          Nhớ ra rồi? <Link to="/login">Đăng nhập</Link>
        </p>
      </form>
    </AuthShell>
  );
}
