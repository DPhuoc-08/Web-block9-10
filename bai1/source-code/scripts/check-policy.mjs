// Kiểm thử bảng quyền của policy/permissions.js (plan bước 5). Hàm thuần nên không cần server, không cần database.
//   node scripts/check-policy.mjs
import { can, canEditDish, canViewDish, editableDishWhere, visibleDishWhere } from "../src/policy/permissions.js";

const V = { role: "viewer", chefId: null };
const A = { role: "editor", chefId: 1 };
const B = { role: "editor", chefId: 2 };
const NOCHEF = { role: "editor", chefId: null };
const ADMIN = { role: "admin", chefId: null };
const draftA = { id: 9, chefId: 1, status: "draft" };
const publishedA = { id: 8, chefId: 1, status: "published" };
const draftNoChef = { id: 7, chefId: null, status: "draft" };

const cases = [
  ["Viewer đọc được", can(V, "dish:read"), true],
  ["Viewer không tạo món", can(V, "dish:create"), false],
  ["Viewer không sửa món", can(V, "dish:update"), false],
  ["Editor tạo món", can(A, "dish:create"), true],
  ["Editor sửa đầu bếp (12.3)", can(A, "chef:update"), true],
  ["Editor không xoá món", can(A, "dish:delete"), false],
  ["Editor không xoá đầu bếp", can(A, "chef:delete"), false],
  ["Editor không đổi status, chefId", can(A, "dish:publish"), false],
  ["Editor chưa gắn đầu bếp không tạo món", can(NOCHEF, "dish:create"), false],
  ["Admin xoá món", can(ADMIN, "dish:delete"), true],
  ["Admin đổi status", can(ADMIN, "dish:publish"), true],
  ["Chưa đăng nhập không có quyền", can(null, "dish:read"), false],
  ["Role lạ không có quyền", can({ role: "root" }, "dish:read"), false],
  ["Editor A sửa nháp của A", canEditDish(A, draftA), true],
  ["Editor B không sửa nháp của A", canEditDish(B, draftA), false],
  ["Editor A không sửa món published của A", canEditDish(A, publishedA), false],
  ["Admin sửa món published", canEditDish(ADMIN, publishedA), true],
  ["Viewer không sửa món", canEditDish(V, draftA), false],
  ["chefId rỗng không khớp chefId rỗng", canEditDish(NOCHEF, draftNoChef), false],
  ["Editor chưa gắn đầu bếp không có điều kiện ghi", editableDishWhere(NOCHEF, 7), null],
  ["Editor A xem nháp của A", canViewDish(A, draftA), true],
  ["Editor B không xem nháp của A", canViewDish(B, draftA), false],
  ["Viewer không xem món nháp", canViewDish(V, draftA), false],
  ["Khách không xem món nháp", canViewDish(null, draftA), false],
  ["Admin xem món nháp", canViewDish(ADMIN, draftA), true],
  ["Khách xem món published", canViewDish(null, publishedA), true],
  ["Editor chưa gắn đầu bếp không xem nháp chefId rỗng", canViewDish(NOCHEF, draftNoChef), false],
];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
cases.push(
  ["Thực đơn công khai chỉ published", same(visibleDishWhere(null), { status: "published" }), true],
  ["Viewer chỉ published", same(visibleDishWhere(V), { status: "published" }), true],
  ["Editor chưa gắn đầu bếp chỉ published", same(visibleDishWhere(NOCHEF), { status: "published" }), true],
  ["Editor A: published hoặc nháp của A", same(visibleDishWhere(A), { OR: [{ status: "published" }, { status: "draft", chefId: 1 }] }), true],
  ["Admin không giới hạn", same(visibleDishWhere(ADMIN), {}), true],
);

let fail = 0;
for (const [label, got, want] of cases) {
  if (got !== want) fail++;
  console.log(`${got === want ? "ĐẠT     " : "CHƯA ĐẠT"} ${label}`);
}
console.log(`TỔNG: ${cases.length - fail} ĐẠT, ${fail} CHƯA ĐẠT`);
process.exitCode = fail ? 1 : 0;
