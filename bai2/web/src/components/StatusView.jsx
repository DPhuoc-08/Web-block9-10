import { Link } from "react-router";

// Giao diện cho các trạng thái tải dữ liệu không phải "ok". Trang tồn tại TRƯỚC khi có dữ liệu,
// nên phải có hình dạng cho lúc chờ, lúc không tìm thấy và lúc lỗi — tránh trang trắng khi API tắt.

export function Loading({ text = "Đang tải…" }) {
  return (
    <p className="loading" role="status" aria-live="polite">
      {text}
    </p>
  );
}

// Khung xương khi đang tải danh sách (thực đơn, bảng admin món — plan mục 7.4): giữ chỗ đúng hình dạng kết quả,
// dữ liệu về thì thay vào mà trang không bị nhảy. Trình đọc màn hình chỉ nghe "Đang tải…", các thanh xám bị ẩn.
// Mặc định 12 dòng = một trang thực đơn: chuyển trang thì cuộn về đầu danh sách NGAY lúc đang tải; khung xương ngắn
// hơn danh sách thật làm trang thấp đi, trình duyệt không cuộn tới được đầu danh sách (đo ở bước 15).
export function SkeletonList({ rows = 12, variant = "menu" }) {
  return (
    <div className={`skeleton-list ${variant}`} role="status" aria-live="polite">
      <span className="sr-only">Đang tải…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row" aria-hidden="true">
          <span className="sk sk-thumb" />
          <span className="sk-lines">
            <span className="sk sk-line" />
            <span className="sk sk-line short" />
          </span>
          <span className="sk sk-price" />
        </div>
      ))}
    </div>
  );
}

// Lỗi kỹ thuật (API tắt, sai URL, lỗi máy chủ): thông báo chung + Thử lại. Không hiện "không tìm thấy".
export function LoadError({ error, onRetry }) {
  // 403 khi tải trang: báo thiếu quyền, giữ token (slide 39), không có Thử lại.
  if (error?.kind === "forbidden") return <ForbiddenMessage />;
  return (
    <div className="message" role="alert">
      <div className="code">!</div>
      <h1>Không tải được dữ liệu</h1>
      <p className="muted">Máy chủ đang gặp sự cố hoặc không kết nối được. Vui lòng thử lại.</p>
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        Thử lại
      </button>
    </div>
  );
}

// Thiếu quyền (Figma M3). SPA báo ngay trong trang thay vì chuyển trang như SSR.
export function ForbiddenMessage({ text = "Tài khoản của bạn không có quyền thực hiện thao tác này." }) {
  return (
    <div className="message forbidden" role="alert">
      <span className="forbidden-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      </span>
      <h1>Không đủ quyền</h1>
      <p className="muted">{text}</p>
      <div className="form-actions forbidden-actions">
        <Link className="btn btn-primary" to="/admin/dishes">
          Về danh sách món
        </Link>
        <Link className="btn" to="/dishes">
          Về thực đơn
        </Link>
      </div>
    </div>
  );
}

// Không tìm thấy: route của SPA không khớp, hoặc API trả NOT_FOUND cho id trên URL.
export function NotFoundMessage({ title = "Không tìm thấy trang", text = "Trang hoặc bản ghi bạn tìm không tồn tại.", backTo = "/dishes", backLabel = "Về thực đơn" }) {
  return (
    <div className="message">
      <div className="code">404</div>
      <h1>{title}</h1>
      <p className="muted">{text}</p>
      <Link className="btn btn-primary" to={backTo}>
        {backLabel}
      </Link>
    </div>
  );
}

// Điều kiện trên URL không hợp lệ (API trả VALIDATION_FAILED, vd. ?page=0 hay ?minPrice=abc do sửa tay URL):
// không phải lỗi máy chủ nên không có "Thử lại" — chỉ ra điều kiện sai và link về danh sách mặc định.
export function InvalidQuery({ fields = {}, resetTo, resetLabel = "Xoá điều kiện" }) {
  const messages = Object.values(fields);
  return (
    <div className="panel empty" role="alert">
      <strong>Điều kiện tìm không hợp lệ</strong>
      {messages.length > 0 && (
        <ul className="invalid-list">
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      <Link className="btn" to={resetTo}>
        {resetLabel}
      </Link>
    </div>
  );
}
