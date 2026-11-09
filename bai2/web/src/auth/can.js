// Chỉ dùng để ẩn nút, chọn form: giao diện. Quyền thật do api kiểm tra ở từng request (slide 64). Luật ABAC của từng món
// không chép sang đây: web đọc canEdit do api tính.
export const isAdmin = (user) => user?.role === "admin";
export const canWrite = (user) => user?.role === "editor" || isAdmin(user);
export const canCreateDish = (user) => isAdmin(user) || (user?.role === "editor" && Number.isInteger(user.chefId));
