// Truy vấn món cho thực đơn (và sau này bảng admin). Chuyển từ api/src/routes/dishes.js của block7: GIỮ NGUYÊN câu
// truy vấn, chỉ bỏ phần trả JSON — route SSR gọi các hàm này rồi res.render.
import { Prisma } from "../../generated/prisma/client.ts";
import { prisma } from "../db.js";
import { basicAdvancedWhere, SORTS, TEXT_MODES } from "../validators/list-query.js";
import { fulltextPage } from "../search/fulltext.js";
import { fuzzyPage } from "../search/fuzzy.js";
import { unaccentedDishIds } from "../search/accent.js";
import { draftScope, visibleDishWhere } from "../policy/permissions.js";

// Bảng dish_tags / chef_tags chỉ có cặp id; template cần mảng tag gọn: tags: [{ id, name }].
// Sắp theo id tag: id nhỏ là loại món (seed tạo trước), rồi đặc điểm, vùng miền → "Món nước · Miền Bắc".
export const TAG_SELECT = { select: { tag: { select: { id: true, name: true } } }, orderBy: { tagId: "asc" } };
export const flatTags = (links) => links.map((link) => link.tag);

// Dạng danh sách: thẻ món cần tag và tên đầu bếp, không cần nguyên liệu.
const listInclude = { chef: { select: { id: true, name: true } }, tags: TAG_SELECT };
const toListItem = ({ tags, ...dish }) => ({ ...dish, tags: flatTags(tags) });

// Dạng chi tiết: kèm đầu bếp phụ trách (và chuyên môn), tag, nguyên liệu.
const detailInclude = {
  chef: { select: { id: true, name: true, tags: TAG_SELECT } },
  tags: TAG_SELECT,
  ingredients: {
    select: { ingredient: { select: { id: true, name: true, unit: true } } },
    orderBy: { ingredient: { name: "asc" } },
  },
};
const toDetail = ({ ingredients, tags, chef, ...dish }) => ({
  ...dish,
  chef: { ...chef, tags: flatTags(chef.tags) },
  tags: flatTags(tags),
  ingredients: ingredients.map((link) => link.ingredient),
});

// Một trang danh sách theo điều kiện đã validate (validators/list-query.js → parseListQuery, không còn lỗi).
// Trả { items, total, page, pageSize }. Không có kết quả / trang vượt phạm vi vẫn là kết quả hợp lệ (items rỗng).
// `viewer`: thực đơn công khai không truyền (null) nên luôn chỉ có món published, kể cả Admin đang đăng nhập (12.2);
// khu quản trị truyền currentUser. Mặc định là trường hợp hẹp nhất, quên truyền cũng không lộ món nháp.
export async function listDishes(query, viewer = null) {
  const { page, pageSize } = query;
  if (TEXT_MODES.includes(query.mode)) return textSearch(query, viewer);

  const where = { AND: [basicAdvancedWhere(query, await unaccentedDishIds(prisma, query)), visibleDishWhere(viewer), query.status ? { status: query.status } : {}] };
  // `total` đếm CÙNG điều kiện với `items` (không đếm cả bảng). Hai câu chạy trong một transaction RepeatableRead
  // → cùng một ảnh chụp dữ liệu. Lọc + sắp xếp chạy trong SQL TRƯỚC LIMIT/OFFSET (take/skip) → sort áp dụng cho
  // toàn bộ kết quả, không riêng trang này.
  const [total, rows] = await prisma.$transaction(
    [
      prisma.dish.count({ where }),
      prisma.dish.findMany({ where, include: listInclude, orderBy: SORTS[query.sort], skip: (page - 1) * pageSize, take: pageSize }),
    ],
    // maxWait: lần đầu sau khi pool nguội, mở kết nối + bắt đầu transaction có thể quá 2s mặc định (P2028 → 500).
    { isolationLevel: "RepeatableRead", maxWait: 10_000, timeout: 15_000 },
  );
  // Trang vượt phạm vi: giữ `page` như yêu cầu, items rỗng, total thật — không tự sửa về trang cuối.
  return { items: rows.map(toListItem), total, page, pageSize };
}

// Full-text / fuzzy: câu SQL (search/*.js) trả total + id và điểm của trang, đã xếp theo điểm.
// Prisma nạp phần hiển thị (tag, đầu bếp) theo danh sách id, rồi giữ đúng thứ tự điểm của SQL.
// Fuzzy chọn câu SQL theo `by` (tên món / nguyên liệu / đầu bếp); fulltext luôn là tên + mô tả món.
const FUZZY_BY = { name: "dishName", ingredient: "dishIngredient", chef: "dishChef" };

// Bộ lọc của danh sách quản trị (tình trạng, đầu bếp) áp cho cả toàn văn, gần đúng: lọc NGAY trong câu SQL xếp điểm để
// `total` và số trang đúng. Điều kiện hiển thị món nháp cũng nằm ở đây, cùng luật với visibleDishWhere: nếu lọc sau khi
// xếp điểm thì `total` đếm cả món nháp và lộ sự tồn tại của chúng qua số kết quả.
function dishFilterSql({ available, chefId, status }, viewer) {
  const parts = [];
  const scope = draftScope(viewer);
  if (scope === null) parts.push(Prisma.sql`AND d.status = 'published'`);
  else if (scope !== "all") parts.push(Prisma.sql`AND (d.status = 'published' OR d."chefId" = ${scope})`);
  if (status) parts.push(status === "draft" ? Prisma.sql`AND d.status = 'draft'` : Prisma.sql`AND d.status = 'published'`);
  if (typeof available === "boolean") parts.push(Prisma.sql`AND d.available = ${available}`);
  if (chefId != null) parts.push(Prisma.sql`AND d."chefId" = ${chefId}`);
  return parts.length ? Prisma.join(parts, " ") : Prisma.empty;
}

async function textSearch({ mode, q, by, page, pageSize, available, chefId, status }, viewer) {
  const skip = (page - 1) * pageSize;
  const filter = dishFilterSql({ available, chefId, status }, viewer);
  const { total, hits } =
    mode === "fulltext" ? await fulltextPage(prisma, q, skip, pageSize, filter) : await fuzzyPage(prisma, FUZZY_BY[by], q, skip, pageSize, filter);
  const rows = hits.length ? await prisma.dish.findMany({ where: { id: { in: hits.map((h) => h.id) } }, include: listInclude }) : [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  // Món vừa bị xoá giữa hai câu truy vấn → bỏ qua, không làm hỏng cả trang.
  const items = hits
    .filter((h) => byId.has(h.id))
    .map((h) => ({ ...toListItem(byId.get(h.id)), score: Math.round(h.score * 1000) / 1000 }));
  return { items, total, page, pageSize };
}

// Chi tiết một món, không có → null.
export async function getDish(id, viewer = null) {
  const dish = await prisma.dish.findFirst({ where: { id, ...visibleDishWhere(viewer) }, include: detailInclude });
  return dish && toDetail(dish);
}

// Tag A→Z kèm số món / số đầu bếp dùng tag (thanh danh mục, ô chọn tag, kiểm tra ?tag= có thật).
// Mặc định chỉ đếm món published cho thực đơn; trang Tag quản trị truyền allDishes để điều kiện chặn xoá đúng với tổng thật.
export async function listTags({ allDishes = false } = {}) {
  const dishes = allDishes ? true : { where: { dish: { status: "published" } } };
  const tags = await prisma.tag.findMany({ include: { _count: { select: { dishes, chefs: true } } }, orderBy: { name: "asc" } });
  return tags.map(({ _count, ...tag }) => ({ ...tag, dishCount: _count.dishes, chefCount: _count.chefs }));
}
