// Quy tắc phân quyền (slide 51, 52; plan mục 5). File thuần: không đụng req/res, không gọi database, để Bài 2 chép nguyên.
// `user` là bản ghi đọc từ DB (có role, chefId) hoặc null khi chưa đăng nhập. Không bao giờ truyền dữ liệu từ form vào đây.

const READ = ["dish:read", "chef:read", "ingredient:read", "tag:read"];
const EDIT = ["dish:create", "dish:update", "chef:create", "chef:update", "ingredient:create", "ingredient:update", "tag:create", "tag:update"];
const ADMIN_ONLY = ["dish:delete", "dish:publish", "chef:delete", "ingredient:delete", "tag:delete"];

// RBAC: Viewer chỉ đọc; Editor đọc, tạo, sửa; Admin thêm xoá và là người duy nhất đổi status, chefId của món.
const ROLE_ACTIONS = {
  viewer: new Set(READ),
  editor: new Set([...READ, ...EDIT]),
  admin: new Set([...READ, ...EDIT, ...ADMIN_ONLY]),
};

// Rỗng phải là "không khớp gì": nếu so thẳng hai giá trị rỗng thì Editor chưa gắn đầu bếp sẽ khớp nhầm.
const hasChef = (user) => Number.isInteger(user?.chefId);

export function can(user, action) {
  if (!user || !ROLE_ACTIONS[user.role]?.has(action)) return false;
  // Món của Editor nhận chefId từ tài khoản, nên chưa gắn đầu bếp thì không tạo được món.
  if (action === "dish:create" && user.role === "editor") return hasChef(user);
  return true;
}

// Điều kiện ABAC viết MỘT lần ở dạng where, để cả kiểm tra ở cổng lẫn câu ghi dùng chung một luật.
// Trả null khi không có món nào thoả (viewer, Editor chưa gắn đầu bếp).
export function editableDishWhere(user, id) {
  if (user?.role === "admin") return { id };
  if (user?.role === "editor" && hasChef(user)) return { id, chefId: user.chefId, status: "draft" };
  return null;
}

// ABAC: Editor chỉ sửa món có chefId trùng chefId của mình và đang draft; Admin sửa được mọi món. `dish` đọc từ DB.
export function canEditDish(user, dish) {
  if (!dish) return false;
  const where = editableDishWhere(user, dish.id);
  if (!where) return false;
  return (where.chefId === undefined || where.chefId === dish.chefId) && (where.status === undefined || where.status === dish.status);
}

// Ai xem được món nháp (12.2): Admin xem mọi món nháp; Editor chỉ món nháp của đầu bếp mình; còn lại không xem được.
export function canViewDish(user, dish) {
  if (!dish) return false;
  if (dish.status === "published" || user?.role === "admin") return true;
  return user?.role === "editor" && hasChef(user) && user.chefId === dish.chefId;
}

// Phạm vi món nháp: "all", một chefId, hoặc null. Câu SQL thô (tìm kiếm) dùng giá trị này để viết cùng luật với visibleDishWhere.
export function draftScope(user) {
  if (user?.role === "admin") return "all";
  return user?.role === "editor" && hasChef(user) ? user.chefId : null;
}

// Điều kiện đọc danh sách. Thực đơn công khai truyền null: không phụ thuộc người xem, chỉ có món published.
export function visibleDishWhere(user) {
  const scope = draftScope(user);
  if (scope === "all") return {};
  if (scope === null) return { status: "published" };
  return { OR: [{ status: "published" }, { status: "draft", chefId: scope }] };
}
