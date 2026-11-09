import { api, toQuery, idPath } from "./client.js";

// Hai route công khai: không gửi token, chỉ có món đã xuất bản (slide 63).
export const listDishes = (params, opts) => api.get(`/api/dishes${toQuery(params)}`, { ...opts, anonymous: true });
export const getDish = (id, opts) => api.get(`/api/dishes/${idPath(id)}`, { ...opts, anonymous: true });
// Thanh danh mục: GET /api/tags cần token nên tag đi kèm danh sách công khai (plan 12.5).
export const listPublicTags = (opts) => listDishes({ pageSize: 1, include: "tags" }, opts).then((data) => data.tags);
// Trang quản trị: cần token, có món nháp theo quyền, có status và canEdit do server tính.
export const listAdminDishes = (params, opts) => api.get(`/api/admin/dishes${toQuery(params)}`, opts);
export const getAdminDish = (id, opts) => api.get(`/api/admin/dishes/${idPath(id)}`, opts);
export const createDish = (body) => api.post("/api/dishes", body);
export const updateDish = (id, body) => api.patch(`/api/dishes/${idPath(id)}`, body);
export const deleteDish = (id) => api.del(`/api/dishes/${idPath(id)}`);
