// Điều kiện món nháp trong SQL thô của tìm toàn văn và gần đúng (plan 5.5). Phải nằm NGAY trong câu SQL xếp điểm: lọc sau khi có
// kết quả thì total sai và lộ số món nháp. Giá trị status là hằng viết sẵn hoặc đã qua validator.
import { Prisma } from "../../generated/prisma/client.ts";
import { draftScope } from "../policy/permissions.js";

// viewer = null: thực đơn công khai, chỉ món published, không phụ thuộc người xem.
export function dishFilterSql(viewer = null, status = null) {
  const scope = draftScope(viewer);
  const visible = scope === "all" ? Prisma.sql`TRUE` : scope === null ? Prisma.sql`d.status = 'published'` : Prisma.sql`(d.status = 'published' OR (d.status = 'draft' AND d."chefId" = ${scope}))`;
  if (status === "draft") return Prisma.sql`${visible} AND d.status = 'draft'`;
  if (status === "published") return Prisma.sql`${visible} AND d.status = 'published'`;
  return visible;
}
