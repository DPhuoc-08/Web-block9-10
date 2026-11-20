// Nạp dữ liệu mẫu cho 7 bảng của block7 + 4 tài khoản đã kích hoạt (block9, plan mục 3.3) + 6 món nháp. Chạy: `npx prisma db seed` (lệnh khai báo trong prisma.config.js).
// CẢNH BÁO: xoá TOÀN BỘ dữ liệu của database mà DATABASE_URL đang trỏ tới → in host ra trước để kiểm tra.
// Dữ liệu tất định (không random): chạy lại luôn ra đúng dữ liệu cũ, id bắt đầu lại từ 1.
import { prisma } from "../src/db.js";
import { buildSeed } from "./seed-data/generate.js";
import { DRAFT_DISHES, GROUP_A, GROUP_B } from "./seed-data/block9.js";
import { hashPassword, checkNewPassword } from "../src/auth/password.js";
import { checkEmail } from "../src/auth/email.js";

// 16 tag, 60 đầu bếp, 250 nguyên liệu, 1.200 món (xem seed-data/generate.js và plan mục 4).
const { tags: TAGS, chefs: CHEFS, ingredients: INGREDIENTS, dishes: DISHES } = buildSeed();

// Tài khoản seed (block8, plan mục 3.3): email + mật khẩu đọc từ .env, KHÔNG ghi cứng trong code / repo.
// Thiếu hoặc sai → dừng TRƯỚC khi xoá dữ liệu.
function seedAccounts() {
  const errors = {};
  checkNewPassword(process.env.SEED_USER_PASSWORD ?? "", undefined, errors, { password: "SEED_USER_PASSWORD" });
  // Bốn tài khoản theo ghi chú slide 50. group chỉ có ở Editor: khoảng vị trí đầu bếp trong CHEFS mà Editor quản lý (plan 16 g).
  const accounts = [
    { key: "SEED_VIEWER_EMAIL", username: "Tài khoản xem thử", role: "viewer" },
    { key: "SEED_EDITOR_A_EMAIL", username: "Editor A", role: "editor", group: GROUP_A },
    { key: "SEED_EDITOR_B_EMAIL", username: "Editor B", role: "editor", group: GROUP_B },
    { key: "SEED_ADMIN_EMAIL", username: "Quản trị viên", role: "admin" },
  ].map(({ key, ...a }) => ({ ...a, key, email: checkEmail(process.env[key], errors, key) }));
  const seen = new Set();
  for (const a of accounts) {
    if (a.email && seen.has(a.email)) errors[a.key] = "phải khác các email seed còn lại";
    seen.add(a.email);
  }
  if (Object.keys(errors).length) throw new Error(`Thiếu / sai biến trong .env: ${Object.entries(errors).map(([k, v]) => `${k} (${v})`).join("; ")}`);
  return accounts.map(({ key, ...a }) => ({ ...a, emailInput: process.env[key].trim() }));
}

// Món nháp sai tên đầu bếp, tag, nguyên liệu hoặc trùng tên món gốc → dừng TRƯỚC khi xoá dữ liệu.
function checkDrafts() {
  const chefs = new Set(CHEFS.map((c) => c.name));
  const tags = new Set(TAGS);
  const ingredients = new Set(INGREDIENTS.map(([name]) => name));
  const names = new Set(DISHES.map((d) => d.name));
  for (const d of DRAFT_DISHES) {
    if (!chefs.has(d.chef) || !d.tags.every((t) => tags.has(t)) || !d.ingredients.every((i) => ingredients.has(i)) || names.has(d.name)) {
      throw new Error(`Món nháp không hợp lệ: ${d.name}`);
    }
    names.add(d.name);
  }
}

async function main() {
  const accounts = seedAccounts();
  checkDrafts();
  // Băm trước, ngoài transaction (Argon2id cố ý chậm ~0,1s mỗi lần). Cùng một mật khẩu nhưng hai salt → hai chuỗi khác nhau.
  const users = await Promise.all(accounts.map(async (a) => ({ ...a, passwordHash: await hashPassword(process.env.SEED_USER_PASSWORD) })));
  const db = new URL(process.env.DATABASE_URL);
  console.log(`Seed vào: ${db.hostname} (user ${db.username}) — dữ liệu cũ sẽ bị xoá.`);

  // Mọi lệnh trong một transaction: lỗi giữa chừng → không để lại database nửa cũ nửa mới.
  await prisma.$transaction(
    async (tx) => {
      // Xoá dữ liệu cũ VÀ đặt lại bộ đếm id về 1. Câu SQL cố định (không chứa dữ liệu người dùng).
      // Xoá cả các bảng xác thực (tài khoản, mã kích hoạt, link đặt lại, challenge MFA, bộ đếm).
      await tx.$executeRaw`TRUNCATE TABLE "dish_tags", "chef_tags", "dish_ingredients", "dishes", "chefs", "ingredients", "tags", "recovery_codes", "mfa_challenges", "password_resets", "activation_challenges", "rate_limits", "users" RESTART IDENTITY`;

      // createManyAndReturn: ghi theo lô và nhận lại id → dựng bảng tra tên → id để nối các bảng liên kết.
      const tags = await tx.tag.createManyAndReturn({ data: TAGS.map((name) => ({ name })) });
      const tagId = Object.fromEntries(tags.map((t) => [t.name, t.id]));

      const chefs = await tx.chef.createManyAndReturn({ data: CHEFS.map(({ name }) => ({ name })) });
      const chefId = Object.fromEntries(chefs.map((c) => [c.name, c.id]));
      await tx.chefTag.createMany({
        data: CHEFS.flatMap((c) => c.tags.map((t) => ({ chefId: chefId[c.name], tagId: tagId[t] }))),
      });

      const ingredients = await tx.ingredient.createManyAndReturn({ data: INGREDIENTS.map(([name, unit]) => ({ name, unit })) });
      const ingredientId = Object.fromEntries(ingredients.map((i) => [i.name, i.id]));

      // Ghi 1.200 món gốc trước (published theo mặc định), rồi mới tới món nháp: id của món gốc không đổi so với block7.
      // createManyAndReturn trả về đúng thứ tự đã gửi → món thứ i trong danh sách có id = dishes[i].id.
      for (const [list, status] of [[DISHES, "published"], [DRAFT_DISHES, "draft"]]) {
        const dishes = await tx.dish.createManyAndReturn({
          data: list.map((d) => ({
            name: d.name,
            description: d.description,
            price: d.price,
            available: d.available ?? true,
            imageUrl: d.imageUrl,
            imageCredit: d.imageCredit,
            chefId: chefId[d.chef],
            status,
          })),
          select: { id: true },
        });
        await tx.dishTag.createMany({
          data: list.flatMap((d, i) => d.tags.map((t) => ({ dishId: dishes[i].id, tagId: tagId[t] }))),
        });
        await tx.dishIngredient.createMany({
          data: list.flatMap((d, i) => d.ingredients.map((n) => ({ dishId: dishes[i].id, ingredientId: ingredientId[n] }))),
        });
      }

      // Tài khoản seed đã kích hoạt sẵn (status active, có emailVerifiedAt) để thử đăng nhập, quên mật khẩu, CRUD.
      // Tài khoản tạo qua form đăng ký thì phải qua kích hoạt bằng OTP.
      const verifiedAt = new Date("2026-11-01T00:00:00Z");
      const created = await tx.user.createManyAndReturn({ data: users.map(({ group, ...u }) => ({ ...u, status: "active", emailVerifiedAt: verifiedAt })), select: { id: true, email: true } });
      // Gán nhóm đầu bếp cho Editor (quyền gán là của Admin; hiện chỉ gán bằng seed, plan 16 c).
      for (const { email, group } of users) {
        if (!group) continue;
        const managerId = created.find((u) => u.email === email).id;
        const ids = CHEFS.slice(...group).map((c) => chefId[c.name]);
        await tx.chef.updateMany({ where: { id: { in: ids } }, data: { managerId } });
      }
    },
    // maxWait mặc định 2s không đủ để mở kết nối tới pooler ở Sydney (ap-southeast-2) → P2028.
    { maxWait: 30_000, timeout: 120_000 },
  );

  await printStats();
}

// Thống kê sau khi seed — để đối chiếu với plan (mục 4) và ghi vào BUILD_LOG.
async function printStats() {
  const [dishes, chefs, ingredients, tags, dishTags, chefTags, links, free, soldOut] = await Promise.all([
    prisma.dish.count(),
    prisma.chef.count(),
    prisma.ingredient.count(),
    prisma.tag.count(),
    prisma.dishTag.count(),
    prisma.chefTag.count(),
    prisma.dishIngredient.count(),
    prisma.dish.count({ where: { price: 0 } }),
    prisma.dish.count({ where: { available: false } }),
  ]);
  console.log(
    `Seed xong: ${dishes} món, ${chefs} đầu bếp, ${ingredients} nguyên liệu, ${tags} tag; ` +
      `${dishTags} món–tag, ${chefTags} đầu bếp–tag, ${links} món–nguyên liệu; ${free} món giá 0, ${soldOut} món tạm hết; ` +
      `${await prisma.user.count({ where: { status: "active" } })} tài khoản active; ` +
      `${await prisma.dish.count({ where: { status: "published" } })} món published, ${await prisma.dish.count({ where: { status: "draft" } })} món draft.`,
  );

  // Món có đầu bếp không cùng chuyên môn → seed sai quy tắc (đầu bếp phụ trách món luôn có tag trùng với món).
  const [{ mismatched }] = await prisma.$queryRaw`
    SELECT count(*)::int AS mismatched FROM dishes d
    WHERE NOT EXISTS (
      SELECT 1 FROM dish_tags dt JOIN chef_tags ct ON ct."tagId" = dt."tagId"
      WHERE dt."dishId" = d.id AND ct."chefId" = d."chefId"
    )`;
  console.log(`Món có đầu bếp không đúng chuyên môn: ${mismatched}`);

  // Nhóm đầu bếp của từng Editor (plan 16 g): số đầu bếp, khoảng id, số món nháp trong nhóm.
  const groups = await prisma.user.findMany({
    where: { role: "editor" },
    orderBy: { id: "asc" },
    select: { username: true, managedChefs: { select: { id: true, _count: { select: { dishes: { where: { status: "draft" } } } } } } },
  });
  for (const g of groups) {
    const ids = g.managedChefs.map((c) => c.id);
    const drafts = g.managedChefs.reduce((n, c) => n + c._count.dishes, 0);
    console.log(`${g.username}: ${ids.length} đầu bếp (#${Math.min(...ids)}–#${Math.max(...ids)}), ${drafts} món nháp.`);
  }

  const [load] = await prisma.$queryRaw`
    SELECT min(n)::int AS min, max(n)::int AS max, count(*) FILTER (WHERE n = 0)::int AS idle
    FROM (SELECT c.id, count(d.id) AS n FROM chefs c LEFT JOIN dishes d ON d."chefId" = c.id GROUP BY c.id) t`;
  const [{ unusedIngredients }] = await prisma.$queryRaw`
    SELECT count(*)::int AS "unusedIngredients" FROM ingredients i
    WHERE NOT EXISTS (SELECT 1 FROM dish_ingredients di WHERE di."ingredientId" = i.id)`;
  const perTag = await prisma.$queryRaw`
    SELECT t.name, count(dt."dishId")::int AS n FROM tags t LEFT JOIN dish_tags dt ON dt."tagId" = t.id GROUP BY t.id ORDER BY t.id`;
  console.log(`Món mỗi đầu bếp: ${load.min}–${load.max} (${load.idle} đầu bếp chưa phụ trách món nào); nguyên liệu chưa món nào dùng: ${unusedIngredients}.`);
  console.log(`Món mỗi tag: ${perTag.map((t) => `${t.name} ${t.n}`).join(", ")}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
