// Chỉ dùng để ẩn nút, chọn form: giao diện. Quyền thật do api kiểm tra ở từng request (slide 64). Luật ABAC của từng món
// không chép sang đây: web đọc canEdit do api tính.
export const isAdmin = (user) => user?.role === "admin";
export const canWrite = (user) => user?.role === "editor" || isAdmin(user);
// Editor quản lý một nhóm đầu bếp (plan 16): chefIds lấy từ GET /api/auth/me. Chưa có nhóm thì không thêm món được.
const chefGroup = (user) => (user?.role === "editor" && Array.isArray(user.chefIds) ? user.chefIds : []);
export const canCreateDish = (user) => isAdmin(user) || chefGroup(user).length > 0;
// Hồ sơ đầu bếp: chỉ Admin thêm, sửa, xoá (plan 16 b).
export const canManageChefs = isAdmin;
// Đầu bếp hiện trong ô chọn của form món: Admin thấy tất cả, Editor chỉ nhóm mình. api vẫn kiểm tra lại (403).
export const assignableChefs = (user, chefs) => (isAdmin(user) ? chefs : chefs.filter((c) => chefGroup(user).includes(c.id)));
