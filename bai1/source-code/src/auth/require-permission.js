// Cổng RBAC (cổng 2 trong 4 cổng: danh tính → RBAC → tải bản ghi → ABAC). Gắn cho TỪNG route, kể cả route đọc và GET mở form.
// Tách khỏi requireLogin: requireLogin chỉ hỏi "là ai", cổng này hỏi "role đó được làm gì". Gộp lại thì route đọc
// sẽ mất cổng hoặc mọi route phải đòi cùng một role.
// Đặt sau csrf và method-override: quyền phụ thuộc method thật (PATCH, DELETE), không phải POST của form.
import { can } from "../policy/permissions.js";

const REASONS = {
  role: "Tài khoản của bạn không có quyền thực hiện thao tác này.",
  attribute: "Món này đã được xuất bản hoặc được giao cho đầu bếp khác, nên bạn không sửa được nữa. Thay đổi của bạn chưa được lưu.",
};

export function forbidden(res, reason = "role") {
  res.status(403).render("403", { title: "Không đủ quyền", heading: "Không đủ quyền", text: REASONS[reason], forPermission: true });
}

export const requirePermission = (action) => (req, res, next) => {
  if (can(res.locals.currentUser, action)) return next();
  forbidden(res, "role");
};
