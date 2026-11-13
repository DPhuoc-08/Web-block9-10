import { useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { login } from "../../api/auth.js";
import { isBusiness } from "../../api/client.js";
import { holdChallenge } from "../../auth/challenge.js";
import { safeNext } from "../../auth/next.js";
import { setToken } from "../../auth/token.js";
import AuthShell from "../../components/AuthShell.jsx";
import { Banner, Field } from "../../components/AuthBits.jsx";
import Captcha from "../../components/Captcha.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { useToken } from "../../hooks/useAuth.js";
import { CAPTCHA_MSG, errorBanner } from "./authErrors.js";

// Chỉ nhận mã có trong bảng, không in chữ từ URL ra trang.
const MSG = {
  activated: { kind: "success", text: "Tài khoản đã được kích hoạt. Mời bạn đăng nhập." },
  "password-reset": { kind: "success", text: "Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới." },
  "logged-out": { kind: "success", text: "Bạn đã đăng xuất." },
  expired: { kind: "info", text: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại." },
  "mfa-expired": { kind: "info", text: "Phiên xác thực đã hết hạn. Hãy đăng nhập lại." },
  "mfa-disabled": { kind: "success", text: "Đã tắt xác thực hai lớp. Hãy đăng nhập lại." },
};

export default function LoginPage() {
  useDocumentTitle("Đăng nhập");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const token = useToken();
  const msg = params.get("msg") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(Object.hasOwn(MSG, msg) ? MSG[msg] : null);
  const [captchaNeeded, setCaptchaNeeded] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const captcha = useRef(null);

  // Đã đăng nhập: không hiện form nữa. setToken sau khi đăng nhập thành công cũng đi qua dòng này.
  if (token) return <Navigate to={next} replace />;

  async function onSubmit(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setErrors({});
    setBanner(null);
    try {
      const data = await login({ email, password, ...(captchaToken ? { captchaToken } : {}) });
      // Đã bật MFA: chưa có accessToken, chỉ có challenge cho bước kế tiếp (slide 37).
      if (data.next === "mfa") {
        holdChallenge(data.challenge, next);
        navigate("/login/mfa");
        return;
      }
      setToken(data.accessToken);
    } catch (err) {
      setPassword("");
      if (isBusiness(err, "VALIDATION_FAILED")) setErrors(err.fields);
      else if (isBusiness(err, "CAPTCHA_REQUIRED") || isBusiness(err, "INVALID_CAPTCHA")) {
        setCaptchaNeeded(true);
        setErrors({ captcha: CAPTCHA_MSG[err.code] });
        setBanner({ kind: "info", text: "Bạn đã nhập sai nhiều lần. Hãy tick xác nhận bên dưới rồi thử lại." });
      } else if (isBusiness(err, "INVALID_CREDENTIALS")) {
        setCaptchaNeeded((v) => v || err.captchaRequired);
        setBanner({ kind: "error", text: err.captchaRequired ? "Email hoặc mật khẩu không đúng. Lần sau cần xác nhận bạn không phải người máy." : "Email hoặc mật khẩu không đúng." });
      } else if (isBusiness(err, "ACCOUNT_NOT_ACTIVATED")) {
        setBanner({ kind: "info", text: "Tài khoản chưa được kích hoạt. Nhập mã 6 số trong email để kích hoạt.", link: { to: "/activate", state: { email }, text: "Nhập mã kích hoạt →" } });
      } else setBanner(errorBanner(err));
      captcha.current?.reset();
      busy.current = false;
      setSubmitting(false);
    }
  }

  return (
    <AuthShell page="login">
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <div className="auth-head">
          <h1>Đăng nhập</h1>
          <p>Quản lý món, đầu bếp và nguyên liệu của nhà hàng.</p>
        </div>
        <Banner banner={banner} />
        <div className="auth-fields">
          <Field name="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" placeholder="ban@example.com" error={errors.email} />
          <Field name="password" label="Mật khẩu" type="password" value={password} onChange={setPassword} autoComplete="current-password" placeholder="Nhập mật khẩu" error={errors.password} toggle link={{ to: "/forgot", text: "Quên mật khẩu?" }} />
        </div>
        {captchaNeeded && <Captcha ref={captcha} onToken={setCaptchaToken} error={errors.captcha} />}
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Đang đăng nhập…" : "Đăng nhập"}
        </button>
        <hr className="auth-divider" />
        <p className="auth-foot">
          Chưa có tài khoản? <Link to="/register">Đăng ký</Link>
        </p>
        <p className="auth-note">Khách xem thực đơn không cần tài khoản.</p>
      </form>
    </AuthShell>
  );
}
