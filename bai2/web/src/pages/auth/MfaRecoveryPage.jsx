import { useState } from "react";
import { Link, Navigate } from "react-router";
import AuthShell from "../../components/AuthShell.jsx";
import { Banner } from "../../components/AuthBits.jsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { useMfaSubmit } from "./MfaPage.jsx";

// Figma M5. Dùng mã khôi phục thường là đã mất thiết bị: xong đưa tới trang bảo mật kèm lời nhắc (ghi chú 22).
export default function MfaRecoveryPage() {
  useDocumentTitle("Nhập mã khôi phục");
  const [code, setCode] = useState("");
  const f = useMfaSubmit(() => ({ recoveryCode: code }), () => "/admin/security?recovery=1");
  if (!f.held) return <Navigate to="/login?msg=mfa-expired" replace />;

  return (
    <AuthShell page="login">
      <form className="auth-form" onSubmit={f.onSubmit} noValidate>
        <Link className="auth-back" to="/login/mfa">
          ← Nhập mã từ ứng dụng
        </Link>
        <div className="auth-head">
          <h1>Nhập mã khôi phục</h1>
          <p>Dùng một trong các mã bạn đã lưu khi bật xác thực hai lớp. Mỗi mã chỉ dùng được một lần.</p>
        </div>
        <Banner banner={f.banner} />
        <div className="auth-fields">
          <div className={`a-field${f.invalid ? " invalid" : ""}`}>
            <div className="a-label-row">
              <label htmlFor="f-code">Mã khôi phục</label>
            </div>
            <input id="f-code" className="recovery-input" name="code" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={24} placeholder="XXXXX-XXXXX" value={code} onChange={(e) => setCode(e.target.value)} aria-describedby="f-code-hint" aria-invalid={f.invalid ? true : undefined} />
            <p className="a-hint" id="f-code-hint">Gồm 10 ký tự. Viết thường hoặc thiếu dấu gạch vẫn được.</p>
          </div>
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={f.submitting || f.locked}>
          {f.submitting ? "Đang kiểm tra…" : "Đăng nhập"}
        </button>
        <hr className="auth-divider" />
        <p className="auth-foot">Mất cả điện thoại và mã khôi phục? Hãy liên hệ quản trị viên nhà hàng.</p>
      </form>
      <div className="auth-cancel">
        <button type="button" className="link-button" onClick={f.cancel}>
          Huỷ và về đăng nhập
        </button>
      </div>
    </AuthShell>
  );
}
