// Kiểm tra phân quyền theo bảng nghiệm thu Bài 1 (slide 56; plan mục 10.1). Script tự chạy server thật ở cổng 3100.
//   node scripts/check-rbac.mjs        → mọi phần
//   node scripts/check-rbac.mjs C      → chỉ phần C
// A: chưa đăng nhập. B: thiếu role. Mọi ca đều gửi request trực tiếp, không qua giao diện, rồi đọc lại database.
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

await startServer({ MAIL_TRANSPORT: "file" });
try {
  if (run("A")) await partA();
  if (run("B")) await partB();
} finally {
  await stopServer();
  await prisma.$disconnect();
}
const pass = results.reduce((s, c) => s + c.pass, 0);
const fail = results.reduce((s, c) => s + c.fail, 0);
console.log(`\nTỔNG: ${pass} ĐẠT, ${fail} CHƯA ĐẠT`);
process.exitCode = fail ? 1 : 0;
