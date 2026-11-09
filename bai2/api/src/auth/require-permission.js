// Cổng RBAC của API (chuyển từ Bài 1, đổi trang 403 thành JSON). Luôn đứng sau requireJwt và trước jsonBody.
import { can } from "../policy/permissions.js";
import { forbidden } from "../http/respond.js";

export const requirePermission = (action) => (req, res, next) => (can(res.locals.currentUser, action) ? next() : forbidden(res));
