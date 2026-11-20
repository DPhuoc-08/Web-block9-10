// Quy tắc phân quyền (slide 51, 52; plan mục 5, 16). File thuần: không đụng req/res, không gọi database.
// `user` là bản ghi đọc từ DB (có role, chefIds) hoặc null khi chưa đăng nhập. Không bao giờ truyền dữ liệu từ form vào đây.
// Khác Bài 1 (plan 16): Editor quản lý một NHÓM đầu bếp (`chefIds`, từ chefs.managerId) thay vì một đầu bếp của tài khoản;
// chỉ Admin thêm, sửa, xoá hồ sơ đầu bếp.

const READ = ["dish:read", "chef:read", "ingredient:read", "tag:read"];
const EDIT = ["dish:create", "dish:update", "ingredient:create", "ingredient:update", "tag:create", "tag:update"];
const ADMIN_ONLY = ["dish:delete", "dish:publish", "chef:create", "chef:update", "chef:delete", "ingredient:delete", "tag:delete"];

// RBAC: Viewer chỉ đọc; Editor đọc, tạo, sửa (trừ hồ sơ đầu bếp); Admin thêm xoá, quản lý đầu bếp và là người duy nhất xuất bản món.
const ROLE_ACTIONS = {
  viewer: new Set(READ),
  editor: new Set([...READ, ...EDIT]),
  admin: new Set([...READ, ...EDIT, ...ADMIN_ONLY]),
};

// Nhóm đầu bếp của Editor. Rỗng phải là "không khớp gì": Editor chưa được gán nhóm không sửa, không xem nháp món nào.
const groupOf = (user) => (user?.role === "editor" && Array.isArray(user.chefIds) ? user.chefIds : []);
const inGroup = (user, chefId) => Number.isInteger(chefId) && groupOf(user).includes(chefId);

export function can(user, action) {
  if (!user || !ROLE_ACTIONS[user.role]?.has(action)) return false;
  // Món của Editor phải gán cho một đầu bếp trong nhóm, nên chưa có nhóm thì không tạo được món.
  if (action === "dish:create" && user.role === "editor") return groupOf(user).length > 0;
  return true;
}

// Đầu bếp được gán cho món (khi thêm, hoặc đổi khi sửa): Admin chọn bất kỳ; Editor chỉ trong nhóm mình (plan 16 d, e).
export function canAssignChef(user, chefId) {
  if (user?.role === "admin") return true;
  return inGroup(user, chefId);
}

// Điều kiện ABAC viết MỘT lần ở dạng where, để cả kiểm tra ở cổng lẫn câu ghi dùng chung một luật.
// Trả null khi không có món nào thoả (viewer, Editor chưa có nhóm).
export function editableDishWhere(user, id) {
  if (user?.role === "admin") return { id };
  const group = groupOf(user);
  if (group.length) return { id, chefId: { in: group }, status: "draft" };
  return null;
}

// ABAC: Editor chỉ sửa món đang draft của một đầu bếp trong nhóm; Admin sửa được mọi món. `dish` đọc từ DB.
export function canEditDish(user, dish) {
  if (!dish || !editableDishWhere(user, dish.id)) return false;
  if (user.role === "admin") return true;
  return dish.status === "draft" && inGroup(user, dish.chefId);
}

// Ai xem được món nháp (12.2, 16 f): Admin xem mọi món nháp; Editor chỉ món nháp của nhóm mình; còn lại không xem được.
export function canViewDish(user, dish) {
  if (!dish) return false;
  if (dish.status === "published" || user?.role === "admin") return true;
  return inGroup(user, dish.chefId);
}

// Phạm vi món nháp: "all", mảng chefId của nhóm, hoặc null. Câu SQL thô (tìm kiếm) dùng giá trị này để viết cùng luật với visibleDishWhere.
export function draftScope(user) {
  if (user?.role === "admin") return "all";
  const group = groupOf(user);
  return group.length ? group : null;
}

// Điều kiện đọc danh sách. Thực đơn công khai truyền null: không phụ thuộc người xem, chỉ có món published.
export function visibleDishWhere(user) {
  const scope = draftScope(user);
  if (scope === "all") return {};
  if (scope === null) return { status: "published" };
  return { OR: [{ status: "published" }, { status: "draft", chefId: { in: scope } }] };
}
