import { useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { confirmSetup, disableMfa, getMfaStatus, regenerateCodes, replaceDevice, startSetup } from "../../../api/mfa.js";
import { isBusiness } from "../../../api/client.js";
import { clearToken } from "../../../auth/token.js";
import { Banner, Field, OtpField } from "../../../components/AuthBits.jsx";
import LeaveConfirm from "../../../components/LeaveConfirm.jsx";
import { Loading, LoadError } from "../../../components/StatusView.jsx";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.js";
import { useLoad } from "../../../hooks/useLoad.js";
import { useUnsavedChanges } from "../../../hooks/useUnsavedChanges.js";
import { errorBanner } from "../../auth/authErrors.js";

// Quản lý MFA của chính người đang đăng nhập (Figma M6–M9). Bốn màn nằm trong MỘT URL và giữ dữ liệu ở state của trang:
// secret và recovery code không bao giờ vào URL, lịch sử trình duyệt hay storage. Reload là mất, và server không phát lại.
const grouped = (secret) => secret.match(/.{1,4}/g).join(" ");

const REAUTH = {
  replace: { title: "Đổi thiết bị", notice: { kind: "info", text: "Xác nhận đây là bạn để chuyển sang thiết bị mới. Thiết bị cũ vẫn dùng được cho tới khi thiết bị mới được xác nhận." }, button: "Tiếp tục", call: replaceDevice },
  regenerate: { title: "Tạo lại mã khôi phục", notice: { kind: "info", text: "Sau khi tạo mới, các mã cũ không còn dùng được." }, button: "Tạo mã mới", call: regenerateCodes },
  disable: { title: "Tắt xác thực hai lớp", notice: { kind: "error", text: "Sau khi tắt, tài khoản chỉ còn được bảo vệ bằng mật khẩu, và bạn cần đăng nhập lại." }, button: "Tắt xác thực hai lớp", danger: true, call: disableMfa },
};

export default function SecurityPage() {
  useDocumentTitle("Bảo mật hai lớp");
  const [params] = useSearchParams();
  const { status, data, error, reload } = useLoad((signal) => getMfaStatus({ signal }), []);
  const [view, setView] = useState({ name: "overview" });
  const [notice, setNotice] = useState(null);

  if (status === "loading") return <Loading />;
  if (status !== "ok") return <LoadError error={error} onRetry={reload} />;

  const toOverview = (message = null) => {
    setNotice(message);
    setView({ name: "overview" });
    reload();
  };

  if (view.name === "setup") return <Setup enrollment={view.enrollment} onDone={(codes) => (codes ? setView({ name: "codes", codes, kind: "enabled" }) : toOverview({ kind: "success", text: "Đã chuyển sang thiết bị mới." }))} onCancel={() => toOverview()} />;
  if (view.name === "codes") return <Codes codes={view.codes} kind={view.kind} onDone={() => toOverview()} />;
  if (view.name === "reauth") return <Reauth action={view.action} onCancel={() => toOverview()} onReplace={(enrollment) => setView({ name: "setup", enrollment })} onCodes={(codes) => setView({ name: "codes", codes, kind: "regenerated" })} />;

  return <Overview mfa={data} recoveryJustUsed={params.get("recovery") === "1"} notice={notice} onSetup={(enrollment) => setView({ name: "setup", enrollment })} onReauth={(action) => setView({ name: "reauth", action })} />;
}

function Overview({ mfa, recoveryJustUsed, notice, onSetup, onReauth }) {
  const [banner, setBanner] = useState(null);
  const [opening, setOpening] = useState(false);

  async function start() {
    setOpening(true);
    setBanner(null);
    try {
      onSetup(await startSetup());
    } catch (err) {
      setBanner(errorBanner(err));
      setOpening(false);
    }
  }

  return (
    <>
      {recoveryJustUsed && mfa.enabled && (
        <div className="recovery-nudge" role="status">
          <div>
            <strong>Bạn vừa đăng nhập bằng mã khôi phục</strong>
            <p>Còn {mfa.remaining} mã dùng được. Nếu đã mất điện thoại, hãy đổi thiết bị và tạo lại mã khôi phục.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => onReauth("replace")}>
            Đổi thiết bị
          </button>
        </div>
      )}
      <section className="panel profile-card security-card" aria-labelledby="mfa-title">
        <div className="card-head">
          <h2 id="mfa-title">Bảo mật hai lớp</h2>
          <span className={`badge ${mfa.enabled ? "on" : "published"}`}>{mfa.enabled ? "Đã bật" : "Chưa bật"}</span>
        </div>
        <Banner banner={notice ?? banner} />
        {mfa.enabled ? (
          <>
            <p className="muted">Mỗi lần đăng nhập cần thêm mã 6 số từ ứng dụng xác thực trên điện thoại.</p>
            <p className="mfa-count">
              <span className="muted">Mã khôi phục còn lại</span>
              <strong>{mfa.remaining} / 10</strong>
            </p>
            <div className="mfa-actions">
              <button type="button" className="btn" onClick={() => onReauth("replace")}>Đổi thiết bị</button>
              <button type="button" className="btn" onClick={() => onReauth("regenerate")}>Tạo lại mã khôi phục</button>
              <button type="button" className="btn danger-text" onClick={() => onReauth("disable")}>Tắt xác thực hai lớp</button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">Thêm một lớp bảo vệ: sau mật khẩu, đăng nhập cần mã 6 số từ ứng dụng xác thực trên điện thoại.</p>
            <button type="button" className="btn btn-primary btn-block" onClick={start} disabled={opening}>
              {opening ? "Đang mở…" : "Bật xác thực hai lớp"}
            </button>
          </>
        )}
      </section>
    </>
  );
}

function Setup({ enrollment, onDone, onCancel }) {
  const [code, setCode] = useState("");
  const [banner, setBanner] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const { replacing } = enrollment;

  async function onSubmit(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setBanner(null);
    try {
      const data = await confirmSetup({ code });
      onDone(data.replaced ? null : data.recoveryCodes);
    } catch (err) {
      setBanner(isBusiness(err, "INVALID_OTP") ? { kind: "error", text: "Mã không đúng. Kiểm tra lại ứng dụng rồi nhập mã mới nhất." } : errorBanner(err));
      setCode("");
      busy.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="panel focus-card focus-wide" aria-labelledby="mfa-title">
      {!replacing && <p className="step-label">Bước 1 / 2</p>}
      <h1 id="mfa-title">{replacing ? "Đổi thiết bị xác thực" : "Bật xác thực hai lớp"}</h1>
      <Banner banner={banner} />
      <h2>1. Quét mã bằng ứng dụng xác thực</h2>
      <div className="mfa-qr-row">
        <img className="mfa-qr" src={enrollment.qrDataUrl} width="180" height="180" alt="Mã QR để thêm tài khoản vào ứng dụng xác thực" />
        <div className="mfa-manual">
          <p className="muted">Dùng Google Authenticator, Microsoft Authenticator hoặc ứng dụng tương tự. Không quét được thì nhập khoá này:</p>
          <p className="mfa-secret">{grouped(enrollment.secret)}</p>
        </div>
      </div>
      <h2>2. Nhập mã trên ứng dụng để xác nhận</h2>
      <form className="mfa-form" onSubmit={onSubmit} noValidate>
        <OtpField label="Mã từ ứng dụng" value={code} onChange={setCode} hint="MFA chỉ bật sau khi mã đúng. Nhập sai không ảnh hưởng tài khoản." />
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Đang xác nhận…" : replacing ? "Xác nhận thiết bị mới" : "Xác nhận và bật"}
          </button>
          <button type="button" className="btn" onClick={onCancel}>Huỷ</button>
        </div>
      </form>
    </section>
  );
}

function Codes({ codes, kind, onDone }) {
  const [copied, setCopied] = useState(null);
  // Mã chỉ hiện ở đây: rời trang khi chưa xác nhận đã lưu thì hỏi lại.
  const { blocker, allowLeave } = useUnsavedChanges(true);
  const text = `${codes.join("\n")}\n`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("Đã sao chép");
    } catch {
      setCopied("Không sao chép được");
    }
    setTimeout(() => setCopied(null), 2000);
  }
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    Object.assign(document.createElement("a"), { href: url, download: "ma-khoi-phuc.txt" }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="panel focus-card" aria-labelledby="codes-title">
      {kind === "enabled" && <p className="step-label">Bước 2 / 2</p>}
      <Banner banner={{ kind: "success", text: kind === "enabled" ? "Đã bật xác thực hai lớp." : "Đã tạo nhóm mã mới. Nhóm cũ không còn dùng được." }} />
      <h1 id="codes-title">Lưu mã khôi phục</h1>
      <p className="muted no-margin">
        Khi mất điện thoại, mỗi mã cho bạn đăng nhập một lần. <strong>Các mã chỉ hiện ở trang này.</strong>
      </p>
      <div className="code-box">
        <ol className="code-list" data-recovery-codes>
          {codes.map((c, i) => (
            <li key={c}>
              <span className="code-no">{i + 1}</span>
              <code>{c}</code>
            </li>
          ))}
        </ol>
        <div className="code-actions">
          <button type="button" className="btn" onClick={copy}>{copied ?? "Sao chép"}</button>
          <button type="button" className="btn" onClick={download}>Tải tệp .txt</button>
        </div>
      </div>
      {/* Không có noValidate: ô đánh dấu dùng required của HTML, chưa tick thì trình duyệt không cho gửi. */}
      <form className="codes-done" onSubmit={(event) => { event.preventDefault(); allowLeave(); onDone(); }}>
        <label className="ack">
          <input type="checkbox" required />
          <span>Tôi đã lưu các mã này ở nơi an toàn</span>
        </label>
        <button type="submit" className="btn btn-primary btn-block">Hoàn tất</button>
      </form>
      <LeaveConfirm blocker={blocker} title="Rời trang khi chưa lưu mã?" text="Các mã khôi phục sẽ không hiện lại." />
    </section>
  );
}

function Reauth({ action, onCancel, onReplace, onCodes }) {
  const config = REAUTH[action];
  const [password, setPassword] = useState("");
  const [factor, setFactor] = useState("");
  const [banner, setBanner] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setBanner(null);
    try {
      const data = await config.call({ password, factor });
      if (action === "replace") onReplace(data);
      else if (action === "regenerate") onCodes(data.recoveryCodes);
      else clearToken("mfa-disabled"); // tokenVersion đã tăng: token đang giữ không còn dùng được, route guard đưa về đăng nhập
    } catch (err) {
      setPassword("");
      setFactor("");
      setBanner(isBusiness(err, "INVALID_OTP") ? { kind: "error", text: "Mật khẩu hoặc mã không đúng." } : errorBanner(err));
      busy.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="panel focus-card focus-narrow" aria-labelledby="reauth-title">
      <h1 id="reauth-title">{config.title}</h1>
      <Banner banner={config.notice} />
      <Banner banner={banner} />
      <form className="mfa-form" onSubmit={onSubmit} noValidate>
        <Field name="password" label="Mật khẩu hiện tại" type="password" value={password} onChange={setPassword} autoComplete="current-password" placeholder="Nhập mật khẩu" toggle />
        <Field name="factor" label="Mã từ ứng dụng hoặc mã khôi phục" value={factor} onChange={setFactor} autoComplete="off" placeholder="6 chữ số hoặc XXXXX-XXXXX" hint="Sai 5 lần sẽ bị tạm khoá 15 phút." />
        <div className="form-actions">
          <button type="submit" className={`btn ${config.danger ? "btn-danger" : "btn-primary"}`} disabled={submitting}>
            {submitting ? "Đang xác nhận…" : config.button}
          </button>
          <button type="button" className="btn" onClick={onCancel}>Huỷ</button>
        </div>
      </form>
    </section>
  );
}
