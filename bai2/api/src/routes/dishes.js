// REST API cho tài nguyên món ăn: /api/dishes. Mọi kết quả handler xử lý được đều trả 200 + ok.
// Hai route đọc công khai (slide 63), không đọc token, chỉ món published. Route ghi đi qua bốn cổng đúng thứ tự:
// requireJwt (danh tính) → requirePermission (role) → guardDish (đọc món từ DB, ABAC), tất cả đặt TRƯỚC jsonBody.
import { Router } from "express";
import { prisma, isNotFound, isForeignKeyViolation } from "../db.js";
import { ok, notFound, validationFailed, forbidden } from "../http/respond.js";
import { jsonBody } from "../http/json-body.js";
import { parseId } from "../validators/id.js";
import { hasErrors } from "../validators/common.js";
import { validateDish, checkDishRefs } from "../validators/dish.js";
import { parseListQuery, basicAdvancedWhere, SORTS, TEXT_MODES } from "../validators/list-query.js";
import { fulltextPage } from "../search/fulltext.js";
import { fuzzyPage } from "../search/fuzzy.js";
import { TAG_SELECT, flatTags } from "../http/shapes.js";
import { requireJwt } from "../auth/require-jwt.js";
import { requirePermission } from "../auth/require-permission.js";
import { can, canAssignChef, canEditDish, editableDishWhere } from "../policy/permissions.js";
import { dishFilterSql } from "../search/dish-filter.js";

const router = Router();

// Dạng chi tiết: kèm đầu bếp phụ trách (và chuyên môn), tag, nguyên liệu.
// Các bảng liên kết được "làm phẳng" thành mảng: tags: [{id, name}], ingredients: [{id, name, unit}].
export const detailInclude = {
  chef: { select: { id: true, name: true, tags: TAG_SELECT } },
  tags: TAG_SELECT,
  ingredients: {
    select: { ingredient: { select: { id: true, name: true, unit: true } } },
    orderBy: { ingredient: { name: "asc" } },
  },
};
export const toDetail = ({ ingredients, tags, chef, ...dish }) => ({
  ...dish,
  chef: { ...chef, tags: flatTags(chef.tags) },
  tags: flatTags(tags),
  ingredients: ingredients.map((link) => link.ingredient),
});

// Dạng danh sách: thẻ món ở thực đơn / dòng bảng admin cần tag và tên đầu bếp, không cần nguyên liệu.
const listInclude = { chef: { select: { id: true, name: true } }, tags: TAG_SELECT };
const toListItem = ({ tags, ...dish }) => ({ ...dish, tags: flatTags(tags) });

// Route công khai giữ nguyên response của block7 (slide 67): cột status mới không xuất hiện.
const stripStatus = ({ status, ...dish }) => dish;
const PUBLISHED = { status: "published" };

// Danh sách có phân trang + tìm kiếm tại server (plan mục 5.2–5.4):
//   ?mode=basic|advanced &q= &by= &page= &pageSize= &sort=  (basic: thêm ?searchIn=name,tag cho trang admin)
//   advanced thêm: &tag=<id> &minPrice= &maxPrice= &available=true|false
//   ?mode=fulltext|fuzzy &q= (bắt buộc) &page= &pageSize=   — xếp theo điểm phù hợp, mỗi món có thêm `score`
//   &by=name|ingredient|chef: q so với tên món (mặc định) / tên nguyên liệu / tên đầu bếp — basic, advanced, fuzzy
// Trả data: { items, total, page, pageSize }. Không có kết quả / trang vượt phạm vi vẫn là thành công (items: []).
// Dùng chung cho route công khai và GET /api/admin/dishes; `scope`, `filter` là điều kiện hiển thị, `shape` chỉnh từng món.
export async function sendDishList(res, query, { scope, filter, shape, extra = {} }) {
  const { errors } = query;
  // Tag phải có thật: lọc theo tag không tồn tại là điều kiện sai, không phải "0 kết quả".
  if (query.tagId !== null && !errors.tag && !(await prisma.tag.findUnique({ where: { id: query.tagId }, select: { id: true } }))) {
    errors.tag = "Tag không tồn tại.";
  }
  if (hasErrors(errors)) return validationFailed(res, errors);

  const { page, pageSize } = query;
  if (TEXT_MODES.includes(query.mode)) return textSearch(res, query, { filter, shape, extra });

  const where = { AND: [basicAdvancedWhere(query), scope] };
  // `total` đếm CÙNG điều kiện với `items` (không đếm cả bảng). Hai câu chạy trong một transaction RepeatableRead
  // → cùng một ảnh chụp dữ liệu: không có cảnh total nói 37 mà items lại thiếu/thừa vì có người vừa thêm/xoá món.
  // Lọc + sắp xếp chạy trong SQL TRƯỚC LIMIT/OFFSET (take/skip) → sort áp dụng cho toàn bộ kết quả, không riêng trang này.
  const [total, rows] = await prisma.$transaction(
    [
      prisma.dish.count({ where }),
      prisma.dish.findMany({ where, include: listInclude, orderBy: SORTS[query.sort], skip: (page - 1) * pageSize, take: pageSize }),
    ],
    // maxWait: lần đầu sau khi pool nguội, mở kết nối + bắt đầu transaction có thể quá 2s mặc định (P2028 → 500).
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 15_000 },
  );
  // Trang vượt phạm vi: giữ `page` như yêu cầu, items rỗng, total thật — không tự sửa về trang cuối.
  ok(res, { items: rows.map((row) => shape(toListItem(row))), total, page, pageSize, ...extra });
}

// Thanh danh mục của trang công khai (plan 12.5): GET /api/tags cần token nên tag đi kèm khi có ?include=tags. Chỉ đếm món published.
const publicTags = async () => {
  const tags = await prisma.tag.findMany({ include: { _count: { select: { dishes: { where: { dish: PUBLISHED } }, chefs: true } } }, orderBy: { name: "asc" } });
  return tags.map(({ _count, ...tag }) => ({ ...tag, dishCount: _count.dishes, chefCount: _count.chefs }));
};

router.get("/", async (req, res) => {
  const query = parseListQuery(req.query);
  const include = req.query.include;
  if (include !== undefined && include !== "tags") query.errors.include = "Tham số include chỉ nhận giá trị tags.";
  const extra = include === "tags" && !hasErrors(query.errors) ? { tags: await publicTags() } : {};
  await sendDishList(res, query, { scope: PUBLISHED, filter: dishFilterSql(null), shape: stripStatus, extra });
});

// Full-text / fuzzy: câu SQL (search/*.js) trả total + id và điểm của trang, đã xếp theo điểm.
// Prisma nạp phần hiển thị (tag, đầu bếp) theo danh sách id, rồi giữ đúng thứ tự điểm của SQL.
// Fuzzy chọn câu SQL theo `by` (tên món / nguyên liệu / đầu bếp, plan mục 14); fulltext luôn là tên + mô tả món.
const FUZZY_BY = { name: "dishName", ingredient: "dishIngredient", chef: "dishChef" };

async function textSearch(res, { mode, q, by, page, pageSize }, { filter, shape, extra }) {
  const skip = (page - 1) * pageSize;
  const { total, hits } =
    mode === "fulltext" ? await fulltextPage(prisma, q, skip, pageSize, filter) : await fuzzyPage(prisma, FUZZY_BY[by], q, skip, pageSize, filter);
  const rows = hits.length ? await prisma.dish.findMany({ where: { id: { in: hits.map((h) => h.id) } }, include: listInclude }) : [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  // Món vừa bị xoá giữa hai câu truy vấn → bỏ qua, không làm hỏng cả trang.
  const items = hits
    .filter((h) => byId.has(h.id))
    .map((h) => ({ ...shape(toListItem(byId.get(h.id))), score: Math.round(h.score * 1000) / 1000 }));
  ok(res, { items, total, page, pageSize, ...extra });
}

// Chi tiết. Id sai định dạng ("abc", "2.5") → NOT_FOUND ngay, không truy vấn (tránh lỗi kiểu dữ liệu thành 500).
router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return notFound(res, "Không tìm thấy món.");
  const dish = await prisma.dish.findFirst({ where: { id, ...PUBLISHED }, include: detailInclude });
  if (!dish) return notFound(res, "Không tìm thấy món.");
  ok(res, stripStatus(toDetail(dish)));
});

// Trường do server đặt (slide 52, 63; plan 16 d). Editor: status trong body bị bỏ qua (món luôn nháp); chefId giữ lại
// để chọn đầu bếp trong nhóm, kiểm tra bằng chefOutsideGroup sau khi validate.
function withServerFields(body, user) {
  if (can(user, "dish:publish")) return body;
  const { status, ...rest } = body;
  return rest;
}

// Đầu bếp gửi lên (đã qua validate) nằm ngoài nhóm của Editor → 403, không ghi gì. Không gửi chefId (PATCH) thì không đổi đầu bếp.
const chefOutsideGroup = (user, chefId) => chefId !== undefined && !canAssignChef(user, chefId);

const DISH_STATUSES = ["draft", "published"];
function readStatus(body, errors) {
  if (body.status === undefined) return undefined;
  if (!DISH_STATUSES.includes(body.status)) { errors.status = "Trạng thái phải là draft hoặc published."; return undefined; }
  return body.status;
}

// Cổng 3 và 4: tải món từ DATABASE rồi mới xét thuộc tính, không tin chefId, status gửi từ client.
async function guardDish(req, res, next) {
  const id = parseId(req.params.id);
  if (id === null) return notFound(res, "Không tìm thấy món.");
  const dish = await prisma.dish.findUnique({ where: { id }, select: { id: true, chefId: true, status: true } });
  if (!dish) return notFound(res, "Không tìm thấy món.");
  if (!canEditDish(res.locals.currentUser, dish)) return forbidden(res);
  next();
}

// Câu ghi có điều kiện không khớp dòng nào: quyền hoặc trạng thái đã đổi sau lúc qua cổng. Ném ra để transaction rollback.
class DishWriteRefused extends Error {}

// Thêm. Validate (không cần DB) → kiểm tra id đầu bếp/nguyên liệu có thật → ghi → trả bản ghi vừa tạo (có id)
// để SPA điều hướng sang trang chi tiết.
router.post("/", requireJwt, requirePermission("dish:create"), jsonBody, async (req, res) => {
  const user = res.locals.currentUser;
  const body = withServerFields(req.body, user);
  const input = validateDish(body);
  // Editor luôn tạo nháp; Admin chọn được, bỏ trống thì published như block7.
  const status = can(user, "dish:publish") ? (readStatus(body, input.errors) ?? "published") : "draft";
  if (hasErrors(input.errors)) return validationFailed(res, input.errors);
  if (chefOutsideGroup(user, input.data.chefId)) return forbidden(res);
  await checkDishRefs(prisma, input);
  if (hasErrors(input.errors)) return validationFailed(res, input.errors);

  try {
    // Nested create: món và các dòng liên kết nguyên liệu, tag ghi trong cùng một lệnh (một transaction).
    const created = await prisma.dish.create({
      data: {
        ...input.data,
        status,
        ingredients: { create: input.ingredientIds.map((ingredientId) => ({ ingredientId })) },
        tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
      },
      include: detailInclude,
    });
    ok(res, toDetail(created));
  } catch (err) {
    // Đầu bếp/nguyên liệu vừa bị xoá ở tab khác giữa lúc kiểm tra và lúc ghi → khoá ngoại từ chối.
    if (isForeignKeyViolation(err)) return refsChanged(res, input);
    throw err;
  }
});

// Sửa (PATCH): chỉ các trường gửi lên được kiểm tra và ghi. Có `ingredientIds` / `tagIds` → thay toàn bộ liên kết đó.
router.patch("/:id", requireJwt, requirePermission("dish:update"), guardDish, jsonBody, async (req, res) => {
  const id = parseId(req.params.id);
  const user = res.locals.currentUser;
  const body = withServerFields(req.body, user);
  const input = validateDish(body, { partial: true });
  const status = can(user, "dish:publish") ? readStatus(body, input.errors) : undefined;
  if (hasErrors(input.errors)) return validationFailed(res, input.errors);
  // Đổi đầu bếp: chỉ sang đầu bếp trong nhóm (plan 16 e). Đầu bếp CŨ thuộc nhóm đã kiểm ở guardDish và lại ở câu ghi dưới.
  if (chefOutsideGroup(user, input.data.chefId)) return forbidden(res);
  await checkDishRefs(prisma, input);
  if (hasErrors(input.errors)) return validationFailed(res, input.errors);

  const where = editableDishWhere(user, id);
  if (!where) return forbidden(res);
  const scalars = { ...input.data, ...(status ? { status } : {}) };

  try {
    const updated = await prisma.$transaction(
      async (tx) => {
        // Điều kiện ABAC nằm NGAY trong câu ghi đầu tiên: quyền hoặc trạng thái đổi sau lúc qua guardDish thì không khớp dòng nào
        // (ghi chú 12). Body chỉ có tag, nguyên liệu vẫn cần câu ghi này để giữ khoá dòng và kiểm điều kiện, nên cộng giá thêm 0.
        const { count } = await tx.dish.updateMany({ where, data: Object.keys(scalars).length ? scalars : { price: { increment: 0 } } });
        if (count !== 1) throw new DishWriteRefused();
        if (input.ingredientIds !== undefined) {
          await tx.dishIngredient.deleteMany({ where: { dishId: id } });
          await tx.dishIngredient.createMany({ data: input.ingredientIds.map((ingredientId) => ({ dishId: id, ingredientId })) });
        }
        if (input.tagIds !== undefined) {
          await tx.dishTag.deleteMany({ where: { dishId: id } });
          await tx.dishTag.createMany({ data: input.tagIds.map((tagId) => ({ dishId: id, tagId })) });
        }
        return tx.dish.findUniqueOrThrow({ where: { id }, include: detailInclude });
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
    ok(res, toDetail(updated));
  } catch (err) {
    if (err instanceof DishWriteRefused) {
      // Đọc lại để phân biệt món đã bị xoá với không còn quyền.
      const row = await prisma.dish.findUnique({ where: { id }, select: { id: true } });
      return row ? forbidden(res) : notFound(res, "Không tìm thấy món.");
    }
    // P2025: id không có bản ghi (hoặc vừa bị xoá) → lỗi nghiệp vụ NOT_FOUND, không phải 500.
    if (isNotFound(err)) return notFound(res, "Không tìm thấy món.");
    if (isForeignKeyViolation(err)) return refsChanged(res, input);
    throw err;
  }
});

// Xoá. Các dòng liên kết món–nguyên liệu tự xoá theo (onDelete: Cascade). Thành công: data = null.
router.delete("/:id", requireJwt, requirePermission("dish:delete"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) return notFound(res, "Không tìm thấy món.");
  try {
    await prisma.dish.delete({ where: { id } });
    ok(res, null);
  } catch (err) {
    if (isNotFound(err)) return notFound(res, "Không tìm thấy món.");
    throw err;
  }
});

// Kiểm tra lại để biết trường nào vừa thay đổi; nếu không tìm ra thì để error handler trả 500.
async function refsChanged(res, input) {
  await checkDishRefs(prisma, input);
  if (!hasErrors(input.errors)) throw new Error("Vi phạm khoá ngoại không xác định khi ghi món.");
  return validationFailed(res, input.errors);
}

export default router;
