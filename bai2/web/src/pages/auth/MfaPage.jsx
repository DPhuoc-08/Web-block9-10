import { useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { submitMfa } from "../../api/auth.js";
import { isBusiness } from "../../api/client.js";
import { dropChallenge, heldChallenge } from "../../auth/challenge.js";
import { setToken } from "../../auth/token.js";
import AuthShell from "../../components/AuthShell.jsx";
import { Banner, OtpField } from "../../components/AuthBits.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { errorBanner } from "./authErrors.js";

// Bước MFA khi đăng nhập (Figma M4) và nhập mã khôi phục (M5). Challenge nằm trong bộ nhớ: không có thì quay lại đăng nhập.
export function useMfaSubmit(buildBody, onDone) {
  const navigate = useNavigate();
  const held = heldChallenge();
  const [banner, setBanner] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (busy.current || locked) return;
    busy.current = true;
    setSubmitting(true);
    setBanner(null);
    setInvalid(false);
    try {
      const data = await submitMfa({ challenge: held.challenge, ...buildBody() });
      dropChallenge();
      setToken(data.accessToken, data.refreshToken);
      navigate(onDone(held, data), { replace: true });
    } catch (err) {
      if (err.kind === "unauthenticated") {
        dropChallenge();
        navigate("/login?msg=mfa-expired", { replace: true });
        return;
      }
      if (err.kind === "rate-limited") setLocked(true);
      if (isBusiness(err, "INVALID_OTP") || isBusiness(err, "VALIDATION_FAILED")) {
        setInvalid(true);
        setBanner({ kind: "error", text: "Mã không đúng hoặc đã được dùng." });
      } else setBanner(errorBanner(err));
      busy.current = false;
      setSubmitting(false);
    }
  }
  const cancel = () => {
    dropChallenge();
    navigate("/login", { replace: true });
  };
  return { held, banner, invalid, locked, submitting, onSubmit, cancel };
}

export default function MfaPage() {
  useDocumentTitle("Xác thực hai lớp");
  const [code, setCode] = useState("");
  const f = useMfaSubmit(() => ({ code }), (held) => held.next);
  if (!f.held) return <Navigate to="/login?msg=mfa-expired" replace />;

  return (
    <AuthShell page="login">
      <form className="auth-form" onSubmit={f.onSubmit} noValidate>
        <div className="auth-head">
          <h1>Xác thực hai lớp</h1>
          <p>Mở ứng dụng xác thực trên điện thoại và nhập mã 6 số đang hiển thị.</p>
        </div>
        <Banner banner={f.banner} />
        <div className="auth-fields">
          <OtpField label="Mã xác thực" value={code} onChange={setCode} invalid={f.invalid} hint="Mã gồm 6 chữ số, đổi sau mỗi 30 giây." />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={f.submitting || f.locked}>
          {f.submitting ? "Đang kiểm tra…" : "Xác nhận"}
        </button>
        <hr className="auth-divider" />
        <p className="auth-foot">
          Mất điện thoại? <Link to="/login/mfa/recovery">Dùng mã khôi phục</Link>
        </p>
      </form>
      <div className="auth-cancel">
        <button type="button" className="link-button" onClick={f.cancel}>
          Huỷ và về đăng nhập
        </button>
      </div>
    </AuthShell>
  );
}
