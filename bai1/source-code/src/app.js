import "dotenv/config";
import express from "express";
import methodOverride from "method-override";
import { fileURLToPath } from "node:url";
import { prisma } from "./db.js";
import { loadUser } from "./auth/load-user.js";
import { assertJwtSecret } from "./auth/jwt.js";
import { assertRefreshConfig } from "./auth/refresh.js";
import { csrf } from "./auth/csrf.js";
import { can, canEditDish } from "./policy/permissions.js";
import { startCleanup } from "./auth/cleanup.js";
import { requireLogin } from "./auth/require-login.js";
import loginRouter from "./routes/auth/login.js";
import mfaLoginRouter from "./routes/auth/mfa.js";
import registerRouter from "./routes/auth/register.js";
import passwordResetRouter from "./routes/auth/password-reset.js";
import menuRouter from "./routes/menu.js";
import adminDishesRouter from "./routes/admin/dishes.js";
import adminChefsRouter from "./routes/admin/chefs.js";
import adminIngredientsRouter from "./routes/admin/ingredients.js";
import adminTagsRouter from "./routes/admin/tags.js";
import adminProfileRouter from "./routes/admin/profile.js";
import adminMfaRouter from "./routes/admin/mfa.js";
import { assertMfaKey } from "./auth/secret-box.js";
import { formatPrice, formatMenuPrice, tagNames } from "./format.js";
import { artFor, artShape } from "./dish-art.js";

// Thiếu bí mật → không khởi động (ký JWT bằng chuỗi rỗng / mặc định là lỗ hổng âm thầm).
for (const key of ["JWT_SECRET", "OTP_PEPPER", "APP_ORIGIN"]) {
  if (!process.env[key]) throw new Error(`Thiếu ${key} trong .env (xem .env.example).`);
}
assertMfaKey(); // thiếu hoặc sai độ dài thì không khởi động, thay vì lỗi lúc người dùng bật MFA
assertJwtSecret();
assertRefreshConfig();

const app = express();
// Không bật "trust proxy": req.ip là địa chỉ kết nối thật, không tin header X-Forwarded-For do client tự gửi
// (bộ đếm theo IP ở các bước sau dựa vào đây).

// SSR: server đọc database, dựng HTML bằng EJS rồi trả cả trang. Không có API JSON. Đăng nhập bằng JWT trong cookie (plan mục 15).
app.set("view engine", "ejs");
app.set("views", fileURLToPath(new URL("./views", import.meta.url)));
// Hàm định dạng dùng trong mọi template (chỉ là hàm thuần, không có dữ liệu hay bí mật nào).
Object.assign(app.locals, { formatPrice, formatMenuPrice, tagNames, artFor, artShape });

// File tĩnh (CSS, JS tiện dùng) trong public/. Chỉ phục vụ file, không có route ghi dữ liệu.
app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));

// Parse body của form HTML (application/x-www-form-urlencoded) thành req.body.
app.use(express.urlencoded({ extended: false }));
// Express 5: request không có body thì req.body là undefined, không phải {}.
// Gán {} để route đọc req.body.x an toàn → dữ liệu thiếu thành lỗi nhập, không thành 500.
app.use((req, res, next) => {
  req.body ??= {};
  next();
});

// Không còn express-session (plan mục 15). Trình duyệt tự xin /favicon.ico song song với trang; trả ngay ở đây để request đó không
// đi qua loadUser: hai request cùng gửi một refresh token sẽ bị coi là dùng lại và thu hồi cả family.
app.get("/favicon.ico", (req, res) => res.status(204).end());
// Từ cookie access / refresh → user đang đăng nhập (res.locals.currentUser) cho mọi route và template.
app.use(loadUser);

// Template ẩn nút bằng đúng hai hàm mà server dùng để chặn. Ẩn nút chỉ để tiện dùng; quyền được kiểm tra ở từng route.
app.use((req, res, next) => {
  res.locals.can = (action) => can(res.locals.currentUser, action);
  res.locals.canEditDish = (dish) => canEditDish(res.locals.currentUser, dish);
  next();
});

// Khu quản trị = cụm CRUD: MỌI route dưới /admin (cả GET lẫn ghi) phải đăng nhập — chặn ở server (plan 5.7, 12.2).
// Đặt TRƯỚC csrf: chưa đăng nhập thì mọi request /admin (kể cả POST gửi thẳng bằng curl, không cookie, không token)
// đều nhận 303 /login như đề yêu cầu, thay vì 403 của CSRF (lỗi phát hiện ở bước 18). Đã đăng nhập thì đi tiếp qua csrf.
app.use("/admin", requireLogin);
// Đăng xuất khi không còn phiên đăng nhập (đã đăng xuất ở tab khác, phiên hết hạn): không có gì để huỷ nên không cần
// _csrf, về /login thay vì trang 403 khó hiểu (plan 12.4). Còn phiên đăng nhập thì đi tiếp và vẫn bắt buộc _csrf.
app.post("/logout", (req, res, next) => (res.locals.currentUser ? next() : res.redirect(303, "/login?msg=logged-out")));
// CSRF: kiểm tra token trên method GỐC (POST) — phải đặt TRƯỚC method-override.
app.use(csrf);

// Form HTML chỉ gửi được GET/POST. Browser gửi POST kèm ?_method=PATCH|DELETE,
// middleware đổi req.method trước khi tới router để khớp router.patch / router.delete. Phải đặt trước các router.
app.use(methodOverride("_method"));

// Thông báo sau khi ghi (PRG): route redirect 303 kèm ?msg=<mã>, trang đích hiện câu tương ứng.
// Chỉ nhận mã có trong bảng này — không bao giờ in thẳng nội dung từ URL ra trang (ai cũng sửa được URL).
const FLASH = {
  "dish-created": "Đã thêm món mới.",
  "dish-updated": "Đã lưu thay đổi của món.",
  "dish-deleted": "Đã xoá món.",
  "dish-availability": "Đã đổi tình trạng của món.",
  "chef-created": "Đã thêm đầu bếp.",
  "chef-updated": "Đã lưu thay đổi của đầu bếp.",
  "chef-deleted": "Đã xoá đầu bếp.",
  "chef-transferred": "Đã chuyển các món sang đầu bếp mới và xoá đầu bếp cũ.",
  "ingredient-created": "Đã thêm nguyên liệu.",
  "ingredient-updated": "Đã lưu thay đổi của nguyên liệu.",
  "ingredient-deleted": "Đã xoá nguyên liệu.",
  "tag-created": "Đã thêm tag.",
  "tag-updated": "Đã lưu tên tag.",
  "tag-deleted": "Đã xoá tag.",
  "profile-updated": "Đã lưu tên hiển thị.",
  "password-changed": "Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.",
  "mfa-replaced": "Đã đổi sang thiết bị mới.",
  "mfa-disabled": "Đã tắt xác thực hai lớp.",
  "mfa-replace-expired": "Phiên đổi thiết bị đã hết hạn. Hãy xác thực lại để bắt đầu lại.",
  "mfa-codes-gone": "Mã khôi phục chỉ hiện một lần. Nếu chưa lưu, hãy tạo lại nhóm mã mới.",
};
app.use((req, res, next) => {
  const code = typeof req.query.msg === "string" ? req.query.msg : "";
  res.locals.flash = Object.hasOwn(FLASH, code) ? FLASH[code] : null;
  if (res.locals.flash) {
    // Nút đóng là một link GET về đúng trang hiện tại nhưng bỏ msg (và saved — dòng được tô): không cần JavaScript.
    const url = new URL(req.originalUrl, "http://localhost");
    url.searchParams.delete("msg");
    url.searchParams.delete("saved");
    res.locals.flashCloseHref = url.pathname + url.search;
  }
  // Khu quản trị đổi header (Nhà hàng / Quản trị) và bỏ footer, như layout của block7.
  res.locals.section = req.path.startsWith("/admin") ? "admin" : "menu";
  next();
});

app.get("/", (req, res) => res.redirect("/dishes"));
// Trang công khai: thực đơn, chi tiết món, đăng nhập / đăng ký / quên mật khẩu.
app.use(menuRouter);
app.use(loginRouter);
app.use(mfaLoginRouter);
app.use(registerRouter);
app.use(passwordResetRouter);
// Khu quản trị: requireLogin đã chặn ở trên (sau loadUser, trước csrf).
app.get("/admin", (req, res) => res.redirect("/admin/dishes"));
app.use("/admin/dishes", adminDishesRouter);
app.use("/admin/chefs", adminChefsRouter);
app.use("/admin/ingredients", adminIngredientsRouter);
app.use("/admin/tags", adminTagsRouter);
app.use("/admin/profile/mfa", adminMfaRouter);
app.use("/admin/profile", adminProfileRouter);

// Không route nào khớp → 404.
app.use((req, res) => {
  res.status(404).render("404");
});

// Express 5 tự chuyển lỗi của handler async tới đây.
// Ghi stack vào log server; người dùng chỉ thấy thông báo chung, không thấy err.message của DB.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render("500");
});

const port = Number(process.env.PORT) || 3000;
startCleanup();
app.listen(port, () => {
  console.log(`Server chạy tại http://localhost:${port}`);
});
