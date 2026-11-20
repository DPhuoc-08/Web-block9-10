import { Link, useLocation, useOutletContext, useSearchParams } from "react-router";
import AdminSearch, { adminModeParam } from "../../../components/AdminSearch.jsx";
import { listAdminDishes } from "../../../api/dishes.js";
import { canCreateDish, canWrite, isAdmin } from "../../../auth/can.js";
import { useLoad } from "../../../hooks/useLoad.js";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.js";
import { SkeletonList, LoadError, InvalidQuery } from "../../../components/StatusView.jsx";
import Pagination from "../../../components/Pagination.jsx";
import { isBusiness, toQuery } from "../../../api/client.js";
import AdminNav from "../../../components/AdminNav.jsx";
import { useJustSaved } from "../../../hooks/useJustSaved.js";
import { useListTop } from "../../../hooks/useListTop.js";
import { formatPrice, tagNames } from "../../../format.js";
import DishImage from "../../../components/DishImage.jsx";

const PAGE_SIZE = 20;

// Kiểu tìm của admin món (plan 14.e): dùng lại các mode của GET /api/dishes, không đổi API.
const MODES = [
  { value: "basic", label: "Cơ bản", placeholder: "Tìm theo tên món hoặc tag" },
  { value: "fulltext", label: "Toàn văn", placeholder: "Các từ trong tên, mô tả — ví dụ: nước dùng xương" },
  { value: "fuzzy", label: "Gần đúng", placeholder: "Tên gõ sai vẫn ra — ví dụ: Bò lúc lắt" },
];

// Bộ lọc trạng thái: 6 món nháp nằm giữa hơn 1.200 món, không lọc thì Admin không tìm được món cần xuất bản.
const STATUS_FILTERS = [
  { value: "", label: "Tất cả" },
  { value: "draft", label: "Nháp" },
  { value: "published", label: "Đã xuất bản" },
];

// Danh sách quản trị món (/admin/dishes?q=&page=). Phân trang tại server: mỗi lần chỉ nhận 20 món của trang đang xem
// (1.200 món tải một lần mất ~14s ở bước 5). Xếp id tăng dần (1 → 1200, plan mục 12): thứ tự cố định, sửa/xoá
// không làm các món khác đổi trang. Thêm món xong về trang 1 + thông báo (món mới nằm ở trang cuối).
// q, page nằm trên URL của trang: Reload, copy link, Back/Forward mở lại đúng trang và từ khoá.
// mode=fulltext|fuzzy (plan 14.e, 14.g): xếp theo điểm phù hợp giảm dần rồi id — ngoại lệ có chủ đích của "id tăng
// dần" (xếp theo id thì món khớp nhất có thể nằm ở trang sau); thêm cột Điểm để thấy vì sao món đứng trước.
export default function AdminDishListPage() {
  useDocumentTitle("Quản trị món ăn");
  const { user } = useOutletContext();
  const { pathname, search } = useLocation();
  const [searchParams] = useSearchParams();
  const q = searchParams.get("q")?.trim() ?? "";
  // page gửi nguyên văn cho API: API là nơi kiểm tra (page=0, page=abc → VALIDATION_FAILED → InvalidQuery).
  const rawPage = searchParams.get("page") ?? "";
  const mode = adminModeParam(searchParams);
  // Nguyên văn trên URL, api kiểm tra: giá trị lạ → VALIDATION_FAILED → InvalidQuery.
  const dishStatus = searchParams.get("status") ?? "";
  // Cơ bản: tìm cả tên món và tên tag (như admin block5 tìm cả loại); trang người dùng mặc định chỉ tìm theo tên.
  // Toàn văn / gần đúng: gửi mode + q như thực đơn.
  const { status, data, error, reload } = useLoad(
    // Không gửi sort → API xếp id ASC (mặc định của /api/dishes); toàn văn / gần đúng xếp theo điểm.
    (signal) =>
      listAdminDishes(mode ? { mode, q, status: dishStatus, page: rawPage, pageSize: PAGE_SIZE } : { q, searchIn: q ? "name,tag" : "", status: dishStatus, page: rawPage, pageSize: PAGE_SIZE }, { signal }),
    [q, rawPage, mode, dishStatus],
  );
  const { savedId, savedRowRef } = useJustSaved();
  const dishes = data?.items ?? [];
  const scored = dishes.some((d) => d.score !== undefined);
  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0;
  // Link tới trang n: giữ từ khoá + kiểu tìm, bỏ thông báo ?msg= của lần lưu trước; trang 1 không ghi page cho URL gọn.
  const hrefFor = (n) => `${pathname}${toQuery({ q, mode, status: dishStatus, page: n > 1 ? n : "" })}`;
  const statusHref = (value) => `${pathname}${toQuery({ q, mode, status: value })}`;
  // Cột thao tác chỉ có khi tài khoản ghi được; nút từng dòng theo canEdit do api tính, Xoá chỉ Admin.
  const showActions = canWrite(user);
  // Sửa/xoá xong quay về đúng URL danh sách này (giữ trang, từ khoá).
  const backState = { backTo: pathname + search };

  // Đổi trang → cuộn mượt về đầu bảng và đưa focus vào tiêu đề (nút phân trang nằm cuối bảng).
  const topRef = useListTop(rawPage);

  const invalid = status === "error" && isBusiness(error, "VALIDATION_FAILED");

  return (
    <>
      <AdminNav current="dishes" />
      <div className="toolbar">
        <h1 ref={topRef} tabIndex={-1} className="list-anchor">
          Món ăn
        </h1>
        {canCreateDish(user) && (
          <Link className="btn btn-primary" to="/admin/dishes/new" state={backState}>
            + Thêm món
          </Link>
        )}
      </div>
      {!canWrite(user) && (
        <p className="notice" role="note">
          Tài khoản của bạn chỉ có quyền xem.
        </p>
      )}
      {canWrite(user) && !canCreateDish(user) && (
        <p className="notice" role="note">
          Tài khoản Editor này chưa được giao nhóm đầu bếp nào nên chưa thêm hay sửa món được. Hãy liên hệ quản trị viên.
        </p>
      )}

      <AdminSearch label="Tìm món" placeholder="Tìm theo tên món hoặc tag" count={status === "ok" ? data.total : null} modes={MODES} />

      <div className="status-row">
        {canWrite(user) && (
          <nav className="status-filter" aria-label="Lọc theo trạng thái">
            {STATUS_FILTERS.map((f) => (
              <Link key={f.value} to={statusHref(f.value)} aria-current={f.value === dishStatus ? "true" : undefined}>
                {f.label}
              </Link>
            ))}
          </nav>
        )}
        {status === "ok" && <span className="muted">{data.total.toLocaleString("vi-VN")} món</span>}
      </div>

      {status === "loading" && <SkeletonList rows={8} variant="table" />}
      {invalid && <InvalidQuery fields={error.fields} resetTo={pathname} resetLabel="Về trang 1" />}
      {status === "error" && !invalid && <LoadError error={error} onRetry={reload} />}
      {status === "ok" && data.total === 0 && <div className="panel empty">{q ? "Không có món nào khớp từ khoá." : "Chưa có món nào."}</div>}
      {/* Trang vượt phạm vi (sửa tay URL, hoặc vừa xoá món cuối của trang cuối): thành công nhưng items rỗng. */}
      {status === "ok" && data.total > 0 && dishes.length === 0 && (
        <div className="panel empty">
          <strong>Trang {data.page} không có món nào.</strong>
          <Link to={hrefFor(totalPages)}>Về trang cuối ({totalPages})</Link>
        </div>
      )}
      {status === "ok" && dishes.length > 0 && (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Ảnh</th>
                <th>Tên</th>
                <th>Giá</th>
                <th className="col-tag">Tag</th>
                <th>Đầu bếp</th>
                <th>Tình trạng</th>
                <th>Trạng thái</th>
                {scored && <th>Điểm</th>}
                {showActions && (
                  <th>
                    <span className="sr-only">Thao tác</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {dishes.map((d) => (
                <tr key={d.id} className={d.id === savedId ? "just-saved" : undefined} ref={d.id === savedId ? savedRowRef : undefined}>
                  {/* data-label: nhãn cột hiện trên điện thoại khi bảng chuyển thành thẻ (xem style.css). */}
                  <td className="num" data-label="Mã">
                    {d.id}
                  </td>
                  <td className="thumb" data-label="Ảnh">
                    <DishImage className="table-thumb" src={d.imageUrl} loading="lazy" tags={d.tags} />
                  </td>
                  {/* Tên món mở form sửa: admin ở lại khu Quản trị (trước đây dẫn ra trang người dùng). */}
                  <td className="title" data-label="Tên">
                    {d.canEdit ? (
                      <Link to={`/admin/dishes/${d.id}/edit`} state={backState}>
                        {d.name}
                      </Link>
                    ) : (
                      d.name
                    )}
                  </td>
                  <td data-label="Giá">{formatPrice(d.price)}</td>
                  <td className="col-tag" data-label="Tag">
                    {tagNames(d.tags)}
                  </td>
                  <td data-label="Đầu bếp">{d.chef.name}</td>
                  <td data-label="Tình trạng">
                    <span className={`badge ${d.available ? "on" : "off"}`}>{d.available ? "Đang phục vụ" : "Tạm hết"}</span>
                  </td>
                  <td data-label="Trạng thái">
                    <span className={`badge ${d.status}`}>{d.status === "draft" ? "Nháp" : "Đã xuất bản"}</span>
                  </td>
                  {scored && (
                    <td className="num" data-label="Điểm">
                      {d.score.toFixed(3)}
                    </td>
                  )}
                  {/* Hai link chỉ mở trang (form sửa, trang xác nhận xoá); không link nào tự ghi dữ liệu. */}
                  {showActions && (
                    <td className="actions">
                      {d.canEdit && (
                        <Link className="btn btn-sm" to={`/admin/dishes/${d.id}/edit`} state={backState}>
                          Sửa
                        </Link>
                      )}
                      {isAdmin(user) && (
                        <Link className="btn btn-sm danger-text" to={`/admin/dishes/${d.id}/delete`} state={backState}>
                          Xoá
                        </Link>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {status === "ok" && dishes.length > 0 && (
        <>
          {/* role=status: chuyển trang thì trình đọc màn hình đọc "Món 21–40 trong 1200 món". */}
          <p className="muted page-summary" role="status">
            Món {(data.page - 1) * data.pageSize + 1}–{(data.page - 1) * data.pageSize + dishes.length} trong {data.total} món
          </p>
          <Pagination page={data.page} totalPages={totalPages} hrefFor={hrefFor} label="Phân trang món ăn" />
        </>
      )}
    </>
  );
}
