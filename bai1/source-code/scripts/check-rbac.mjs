// Kiểm tra phân quyền theo bảng nghiệm thu Bài 1 (slide 56; plan mục 10.1). Script tự chạy server thật ở cổng 3100.
//   node scripts/check-rbac.mjs        → mọi phần
//   node scripts/check-rbac.mjs C      → chỉ phần C
// A: chưa đăng nhập. B: thiếu role. C: thuộc tính món (ABAC), trường do server đặt, đổi quyền sau khi mở form. Mọi ca đều gửi request trực tiếp, không qua giao diện, rồi đọc lại database.
// Bản ghi thử có tiền tố "[TEST B9]" và được xoá ở cuối.
import "./lib/test-env.mjs";
import { prisma } from "../src/db.js";
import { client, reporter } from "./lib/client.mjs";
import { login } from "./lib/auth.mjs";
import { startServer, stopServer } from "./lib/server.mjs";

const T = "[TEST B9]";
const only = process.argv.slice(2).map((s) => s.toUpperCase());
const run = (part) => only.length === 0 || only.includes(part);
const results = [];

const signIn = async (key) => {
  const c = client();
  const res = await login(c, process.env[key], process.env.SEED_USER_PASSWORD);
  if (res.status !== 303) throw new Error(`Không đăng nhập được bằng ${key} (status ${res.status}) — đã chạy seed chưa?`);
  await c.get("/admin/profile"); // trang có form đăng xuất → có _csrf của phiên mới
  return c;
};

// Ảnh chụp dữ liệu để chứng minh "dữ liệu không đổi": toàn bộ cột của món, số bản ghi các bảng liên quan.
async function snapshot() {
  const [row] = await prisma.$queryRaw`SELECT
    (SELECT md5(string_agg(d::text, ',' ORDER BY d.id)) FROM dishes d) dishes,
    (SELECT md5(string_agg(c::text, ',' ORDER BY c.id)) FROM chefs c) chefs,
    (SELECT md5(string_agg(i::text, ',' ORDER BY i.id)) FROM ingredients i) ingredients,
    (SELECT md5(string_agg(t::text, ',' ORDER BY t.id)) FROM tags t) tags,
    (SELECT count(*)::int FROM dish_tags) dt, (SELECT count(*)::int FROM dish_ingredients) di`;
  return JSON.stringify(row);
}

// Mọi route của khu quản trị: [nhãn, method thật, đường dẫn, loại]. Thay ở đây là phải thay cả bảng quyền.
const RESOURCES = ["dishes", "chefs", "ingredients", "tags"];
const routesOf = (r) => [
  ["GET", `/admin/${r}`, "read"],
  ["GET", `/admin/${r}/new`, "form"],
  ["POST", `/admin/${r}`, "write"],
  ["GET", `/admin/${r}/1/edit`, "form"],
  ["PATCH", `/admin/${r}/1`, "write"],
  ["GET", `/admin/${r}/1/delete`, "delete-form"],
  ["DELETE", `/admin/${r}/1`, "delete"],
];
const ALL = [...RESOURCES.flatMap(routesOf), ["PATCH", "/admin/dishes/1/availability", "write"]];
const send = (c, method, path) => (method === "GET" ? c.get(path) : c.post(method === "POST" ? path : `${path}?_method=${method}`, [["available", "false"], ["name", `${T} ghi`]]));

async function partA() {
  const r = reporter("A. Chưa đăng nhập: mọi route quản trị về /login");
  const before = await snapshot();
  for (const [method, path] of ALL) {
    const res = await send(client(), method, path);
    r.ok(res.status === 303 && (res.location ?? "").startsWith("/login"), `${method} ${path}`, `${res.status} ${res.location ?? ""}`);
  }
  r.ok((await snapshot()) === before, "Dữ liệu không đổi");
  results.push(r.counts);
}

async function partB() {
  const r = reporter("B. Thiếu role: trang 403, dữ liệu không đổi");
  const before = await snapshot();
  const viewer = await signIn("SEED_VIEWER_EMAIL");
  for (const [method, path, kind] of ALL) {
    const res = await send(viewer, method, path);
    const want = kind === "read" ? 200 : 403;
    r.ok(res.status === want, `Viewer ${method} ${path} → ${want}`, res.status);
  }
  r.ok((await viewer.get("/admin/dishes/new")).text.includes("Không đủ quyền"), "Trang 403 nói rõ thiếu quyền");

  const editor = await signIn("SEED_EDITOR_A_EMAIL");
  for (const [method, path, kind] of ALL) {
    if (kind !== "delete" && kind !== "delete-form") continue;
    const res = await send(editor, method, path);
    r.ok(res.status === 403, `Editor ${method} ${path} → 403`, res.status);
  }
  for (const res of RESOURCES.filter((x) => x !== "dishes")) {
    r.ok((await editor.get(`/admin/${res}/new`)).status === 200, `Editor mở form thêm /admin/${res}/new (12.3)`);
  }
  r.ok((await snapshot()) === before, "Dữ liệu không đổi sau mọi request bị chặn");
  results.push(r.counts);
}

// Form món đầy đủ, gửi như trình duyệt. extra ghi đè hoặc thêm trường.
const dishFields = ({ name, tagId, ingredientId, chefId }, extra = []) => [
  ["name", name], ["price", "50000"], ["description", "mô tả"], ["tagIds", String(tagId)], ["ingredientIds", String(ingredientId)], ["chefId", String(chefId)], ["available", "on"], ...extra,
];

async function partC() {
  const r = reporter("C. Thuộc tính món, trường do server đặt, đổi quyền sau khi mở form");
  const A = await prisma.user.findUnique({ where: { email: process.env.SEED_EDITOR_A_EMAIL.trim().toLowerCase() } });
  const B = await prisma.user.findUnique({ where: { email: process.env.SEED_EDITOR_B_EMAIL.trim().toLowerCase() } });
  const editorA = await signIn("SEED_EDITOR_A_EMAIL");
  const editorB = await signIn("SEED_EDITOR_B_EMAIL");
  const admin = await signIn("SEED_ADMIN_EMAIL");
  const tagId = (await prisma.tag.findFirst({ where: { name: "Món nước" } })).id;
  const ingredientId = (await prisma.ingredient.findFirst({ orderBy: { id: "asc" } })).id;
  const row = (id) => prisma.dish.findUnique({ where: { id } });
  const form = (name, chefId) => dishFields({ name, tagId, ingredientId, chefId });

  try {
    // Món của Editor nhận chefId từ tài khoản và draft, dù body gửi khác.
    let res = await editorA.post("/admin/dishes", [...form(`${T} A tạo`, B.chefId), ["status", "published"]]);
    const created = await prisma.dish.findFirst({ where: { name: `${T} A tạo` } });
    r.ok(res.status === 303 && created?.chefId === A.chefId && created?.status === "draft", "Editor tạo món: bỏ qua chefId, status trong body", `${res.status} chef ${created?.chefId} ${created?.status}`);

    res = await editorA.post("/admin/dishes", [...form(`${T} thêm nhanh`, "new"), ["newChef", `${T} Đầu bếp mới`]]);
    r.ok((await prisma.chef.count({ where: { name: `${T} Đầu bếp mới` } })) === 0, "Editor không thêm nhanh được đầu bếp qua chefId = new");
    const quick = await prisma.dish.findFirst({ where: { name: `${T} thêm nhanh` } });
    r.ok(res.status === 303 && quick?.chefId === A.chefId, "Món đó vẫn nhận đầu bếp của tài khoản", quick?.chefId);

    // Sửa đúng món của mình: được, nhưng không đổi được chefId, status.
    await editorA.get(`/admin/dishes/${created.id}/edit`);
    res = await editorA.post(`/admin/dishes/${created.id}?_method=PATCH`, [...form(`${T} A sửa`, B.chefId), ["status", "published"], ["role", "admin"]]);
    let after = await row(created.id);
    r.ok(res.status === 303 && after.name === `${T} A sửa` && after.chefId === A.chefId && after.status === "draft", "Editor sửa nháp của mình; chefId, status trong body bị bỏ qua", `${res.status} ${after.status}`);
    r.ok((await prisma.user.findUnique({ where: { id: A.id } })).role === "editor", "role trong body không nâng quyền");

    // Sai chủ: Editor B với món của A.
    const before = await snapshot();
    r.ok((await editorB.get(`/admin/dishes/${created.id}/edit`)).status === 403, "Editor B mở form món của A → 403");
    res = await editorB.post(`/admin/dishes/${created.id}?_method=PATCH`, [...form(`${T} B sửa`, B.chefId), ["newTags", `${T} tag thừa`]]);
    r.ok(res.status === 403, "Editor B PATCH món của A → 403", res.status);
    res = await editorB.post(`/admin/dishes/${created.id}/availability?_method=PATCH`, [["available", "false"]]);
    r.ok(res.status === 403, "Editor B đổi tình trạng món của A → 403", res.status);

    // Đúng chủ nhưng món đã published.
    const published = await prisma.dish.findFirst({ where: { chefId: A.chefId, status: "published" } });
    r.ok((await editorA.get(`/admin/dishes/${published.id}/edit`)).status === 403, "Editor A mở form món published của A → 403");
    res = await editorA.post(`/admin/dishes/${published.id}?_method=PATCH`, form(`${T} sửa published`, A.chefId));
    r.ok(res.status === 403, "Editor A PATCH món published → 403", res.status);
    res = await editorA.post(`/admin/dishes/${published.id}/availability?_method=PATCH`, [["available", "false"]]);
    r.ok(res.status === 403, "Editor A đổi nhanh Tạm hết món published → 403 (12.4)", res.status);
    r.ok((await snapshot()) === before, "Dữ liệu không đổi, không có tag thừa");
    r.ok((await prisma.tag.count({ where: { name: `${T} tag thừa` } })) === 0, "Bị từ chối thì không tạo tag mới");

    // Mở form rồi Admin đổi status trước khi gửi (slide 56).
    await editorA.get(`/admin/dishes/${created.id}/edit`);
    await admin.get(`/admin/dishes/${created.id}/edit`);
    res = await admin.post(`/admin/dishes/${created.id}?_method=PATCH`, [...form(`${T} A sửa`, A.chefId), ["status", "published"]]);
    after = await row(created.id);
    r.ok(res.status === 303 && after.status === "published", "Admin đổi status sang published", after.status);
    res = await editorA.post(`/admin/dishes/${created.id}?_method=PATCH`, form(`${T} sửa sau khi xuất bản`, A.chefId));
    after = await row(created.id);
    r.ok(res.status === 403 && after.name === `${T} A sửa`, "Form đã mở, status đổi → PATCH bị từ chối, dữ liệu không đổi", res.status);

    // Admin đổi lại, đổi đầu bếp; sửa được món của đầu bếp khác.
    res = await admin.post(`/admin/dishes/${created.id}?_method=PATCH`, [...form(`${T} A sửa`, B.chefId), ["status", "draft"]]);
    after = await row(created.id);
    r.ok(res.status === 303 && after.chefId === B.chefId && after.status === "draft", "Admin đổi được status, chefId", `${after.chefId} ${after.status}`);
    res = await admin.post(`/admin/dishes/${created.id}?_method=PATCH`, [...form(`${T} A sửa`, A.chefId), ["status", "bậy"]]);
    r.ok(res.status === 400, "Admin gửi status sai → 400", res.status);
    await admin.post(`/admin/dishes/${created.id}?_method=PATCH`, [...form(`${T} A sửa`, A.chefId), ["status", "draft"]]);

    // Hai request đồng thời: không lỗi hệ thống, kết quả cuối vẫn hợp lệ.
    await editorA.get(`/admin/dishes/${created.id}/edit`);
    await admin.get(`/admin/dishes/${created.id}/edit`);
    const [e, a] = await Promise.all([
      editorA.post(`/admin/dishes/${created.id}?_method=PATCH`, form(`${T} đồng thời`, A.chefId)),
      admin.post(`/admin/dishes/${created.id}?_method=PATCH`, [...form(`${T} Admin ghi`, A.chefId), ["status", "published"]]),
    ]);
    after = await row(created.id);
    r.ok([303, 403].includes(e.status) && a.status === 303 && after.status === "published", "Editor và Admin gửi cùng lúc: không lỗi 500", `${e.status} ${a.status}`);

    // Hạ role sau khi mở form.
    await prisma.dish.update({ where: { id: created.id }, data: { status: "draft" } });
    await editorA.get(`/admin/dishes/${created.id}/edit`);
    await prisma.user.update({ where: { id: A.id }, data: { role: "viewer" } });
    res = await editorA.post(`/admin/dishes/${created.id}?_method=PATCH`, form(`${T} sau khi hạ role`, A.chefId));
    r.ok(res.status === 403, "Hạ role sau khi mở form → PATCH 403 (đọc role từ DB mỗi request)", res.status);
    await prisma.user.update({ where: { id: A.id }, data: { role: "editor" } });

    // Editor chưa gắn đầu bếp.
    await prisma.user.update({ where: { id: B.id }, data: { chefId: null } });
    r.ok((await editorB.get("/admin/dishes/new")).status === 403, "Editor chưa gắn đầu bếp không thêm được món");
    r.ok((await editorB.get(`/admin/dishes/${created.id}/edit`)).status === 403, "Editor chưa gắn đầu bếp không khớp món nào");
  } finally {
    await prisma.user.update({ where: { id: A.id }, data: { role: "editor", chefId: A.chefId } });
    await prisma.user.update({ where: { id: B.id }, data: { role: "editor", chefId: B.chefId } });
    await prisma.dish.deleteMany({ where: { name: { startsWith: T } } });
    await prisma.tag.deleteMany({ where: { name: { startsWith: T } } });
    await prisma.chef.deleteMany({ where: { name: { startsWith: T } } });
  }
  results.push(r.counts);
}

await startServer({ MAIL_TRANSPORT: "file" });
try {
  if (run("A")) await partA();
  if (run("B")) await partB();
  if (run("C")) await partC();
} finally {
  await stopServer();
  await prisma.$disconnect();
}
const pass = results.reduce((s, c) => s + c.pass, 0);
const fail = results.reduce((s, c) => s + c.fail, 0);
console.log(`\nTỔNG: ${pass} ĐẠT, ${fail} CHƯA ĐẠT`);
process.exitCode = fail ? 1 : 0;
