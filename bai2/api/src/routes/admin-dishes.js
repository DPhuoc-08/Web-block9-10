// Đọc món cho trang quản trị của web (plan 7.5). Tách khỏi GET /api/dishes để route công khai giữ nguyên kết quả cho mọi người gọi
// và không đọc token. Cần token, lọc bằng visibleDishWhere, trả thêm status và canEdit do server tính: web không chép luật ABAC.
import { Router } from "express";
import { prisma } from "../db.js";
import { notFound, ok, forbidden, validationFailed } from "../http/respond.js";
import { parseId } from "../validators/id.js";
import { hasErrors } from "../validators/common.js";
import { parseListQuery } from "../validators/list-query.js";
import { requireJwt } from "../auth/require-jwt.js";
import { requirePermission } from "../auth/require-permission.js";
import { canEditDish, canViewDish, visibleDishWhere } from "../policy/permissions.js";
import { dishFilterSql } from "../search/dish-filter.js";
import { detailInclude, sendDishList, toDetail } from "./dishes.js";

const router = Router();
const STATUS_FILTERS = ["draft", "published"];

router.use(requireJwt, requirePermission("dish:read"));

router.get("/", async (req, res) => {
  const user = res.locals.currentUser;
  const query = parseListQuery(req.query);
  const rawStatus = req.query.status;
  const status = rawStatus === undefined || rawStatus === "" ? null : rawStatus;
  if (status !== null && !STATUS_FILTERS.includes(status)) query.errors.status = "Trạng thái phải là draft hoặc published.";
  if (hasErrors(query.errors)) return validationFailed(res, query.errors);
  await sendDishList(res, query, {
    scope: { AND: [visibleDishWhere(user), status ? { status } : {}] },
    filter: dishFilterSql(user, status),
    shape: (dish) => ({ ...dish, canEdit: canEditDish(user, dish) }),
  });
});

router.get("/:id", async (req, res) => {
  const user = res.locals.currentUser;
  const id = parseId(req.params.id);
  if (id === null) return notFound(res, "Không tìm thấy món.");
  const dish = await prisma.dish.findUnique({ where: { id }, include: detailInclude });
  if (!dish) return notFound(res, "Không tìm thấy món.");
  if (!canViewDish(user, dish)) return forbidden(res);
  ok(res, { ...toDetail(dish), canEdit: canEditDish(user, dish) });
});

export default router;
