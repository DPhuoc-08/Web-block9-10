import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { activate, resendOtp } from "../../api/auth.js";
import { isBusiness } from "../../api/client.js";
import AuthShell from "../../components/AuthShell.jsx";
import { Banner, Field, OtpField } from "../../components/AuthBits.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { errorBanner } from "./authErrors.js";

// Email đi theo state của router, không lên URL. Đếm ngược chỉ để dễ hiểu: api vẫn tự chặn 60 giây.
export default function ActivatePage() {
  useDocumentTitle("Nhập mã kích hoạt");
  const navigate = useNavigate();
  const { state } = useLocation();
  const [email, setEmail] = useState(state?.email ?? "");
  const [otp, setOtp] = useState("");
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(state?.registered ? { kind: "info", text: "Nếu email hợp lệ và chưa được kích hoạt, mã 6 số đã được gửi tới email đó. Mã có hạn 10 phút." } : null);
  const [cooldown, setCooldown] = useState(state?.resendAfter ?? 0);
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function onSubmit(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setBanner(null);
    setErrors({});
    try {
      await activate({ email, otp });
      navigate("/login?msg=activated", { replace: true });
    } catch (err) {
      if (isBusiness(err, "VALIDATION_FAILED")) setErrors(err.fields);
      else if (isBusiness(err, "INVALID_OTP")) {
        setErrors(err.fields);
        setBanner({ kind: "error", text: "Mã không đúng hoặc đã hết hạn." });
      } else setBanner(errorBanner(err));
      busy.current = false;
      setSubmitting(false);
    }
  }

  async function onResend() {
    setSending(true);
    setBanner(null);
    setErrors({});
    try {
      const data = await resendOtp({ email });
      setCooldown(data.resendAfter);
      setBanner({ kind: "success", text: "Nếu email hợp lệ và chưa kích hoạt, mã mới đã được gửi. Mã cũ không dùng được nữa." });
    } catch (err) {
      if (isBusiness(err, "VALIDATION_FAILED")) setErrors(err.fields);
      else {
        if (err.kind === "rate-limited" && err.retryAfter) setCooldown(err.retryAfter);
        setBanner(errorBanner(err));
      }
    }
    setSending(false);
  }

  return (
    <AuthShell page="activate">
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <div className="auth-head">
          <h1>Nhập mã kích hoạt</h1>
          <p>Mã 6 số đã được gửi tới email bạn vừa đăng ký. Mã có hạn 10 phút.</p>
        </div>
        <Banner banner={banner} />
        <div className="auth-fields">
          <Field name="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" placeholder="ban@example.com" error={errors.email} />
          <OtpField label="Mã kích hoạt" value={otp} onChange={setOtp} error={errors.otp} hint="Mã gồm 6 chữ số trong email. Có thể dán cả mã một lần." />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? "Đang kích hoạt…" : "Kích hoạt tài khoản"}
        </button>
        <hr className="auth-divider" />
        <div className="resend">
          <p className="auth-foot">Chưa nhận được mã? Kiểm tra cả mục Spam hoặc Quảng cáo.</p>
          <button type="button" className="btn btn-block" onClick={onResend} disabled={sending || cooldown > 0}>
            {cooldown > 0 ? `Gửi lại mã sau ${cooldown} giây` : sending ? "Đang gửi…" : "Gửi lại mã"}
          </button>
        </div>
        <p className="auth-foot">
          <Link to="/login">Về đăng nhập</Link>
        </p>
      </form>
    </AuthShell>
  );
}
