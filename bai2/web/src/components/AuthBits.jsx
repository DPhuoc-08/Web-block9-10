import { useState } from "react";
import { Link } from "react-router";

// Thành phần của các trang tài khoản, cùng class CSS với bản SSR của Bài 1.
const ICONS = {
  error: (<><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></>),
  info: (<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>),
  success: (<><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></>),
};
const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

export function Banner({ banner }) {
  if (!banner) return null;
  return (
    <div className={`banner banner-${banner.kind}`} role={banner.kind === "error" ? "alert" : "status"}>
      <svg {...svg} width="18" height="18">{ICONS[banner.kind]}</svg>
      <p>
        {banner.text}
        {banner.link && (
          <>
            {" "}
            <Link to={banner.link.to} state={banner.link.state}>{banner.link.text}</Link>
          </>
        )}
      </p>
    </div>
  );
}

// Nhãn luôn hiện, ô cao 48px, chữ 16px. Lỗi hiện dưới đúng ô.
export function Field({ name, label, type = "text", value, onChange, autoComplete, placeholder, error, hint, link, toggle, inputMode }) {
  const [shown, setShown] = useState(false);
  const id = `f-${name}`;
  const described = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`a-field${error ? " invalid" : ""}`}>
      <div className="a-label-row">
        <label htmlFor={id}>{label}</label>
        {link && <Link to={link.to}>{link.text}</Link>}
      </div>
      <div className={`a-control${toggle ? " has-toggle" : ""}`}>
        <input
          id={id}
          name={name}
          type={toggle && shown ? "text" : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          inputMode={inputMode}
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          {...(type === "email" ? { autoCapitalize: "none", spellCheck: false } : {})}
        />
        {toggle && (
          <button type="button" className="pw-toggle" aria-controls={id} aria-pressed={shown} aria-label={shown ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setShown((v) => !v)}>
            <svg {...svg} width="18" height="18"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
            <span>{shown ? "Ẩn" : "Hiện"}</span>
          </button>
        )}
      </div>
      {hint && <p className="a-hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="a-error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

// Một ô nhập thật phủ lên 6 ô vẽ: dán cả mã, tự điền trên điện thoại, trình đọc màn hình đều làm việc với một ô.
export function OtpField({ label, value, onChange, error, invalid, hint, name = "otp" }) {
  const id = `f-${name}`;
  const digits = value.split("");
  const described = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`a-field${error || invalid ? " invalid" : ""}`}>
      <div className="a-label-row">
        <label htmlFor={id}>{label}</label>
      </div>
      <div className="otp otp-enhanced">
        <div className="otp-boxes" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={`otp-box${i === Math.min(digits.length, 5) ? " active" : ""}`}>{digits[i] ?? ""}</span>
          ))}
        </div>
        <input
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
          onPaste={(e) => {
            // Dán "482 913" hay "482-913": maxLength sẽ cắt trước khi kịp bỏ ký tự thừa.
            e.preventDefault();
            onChange(e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6));
          }}
          aria-invalid={error || invalid ? true : undefined}
          aria-describedby={described}
        />
      </div>
      {hint && <p className="a-hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="a-error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

const RESULT_ICONS = {
  mail: (<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>),
  warn: (<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>),
};

export function AuthResult({ icon, heading, text, button, link }) {
  return (
    <div className="auth-form auth-result" role={icon === "mail" ? "status" : "alert"}>
      <span className={`result-icon result-${icon}`}><svg {...svg} width="26" height="26">{RESULT_ICONS[icon]}</svg></span>
      <div className="auth-head">
        <h1>{heading}</h1>
        <p>{text}</p>
      </div>
      {button && <Link className="btn btn-primary btn-block" to={button.to}>{button.label}</Link>}
      {link && <p className="auth-foot"><Link to={link.to}>{link.text}</Link></p>}
    </div>
  );
}
