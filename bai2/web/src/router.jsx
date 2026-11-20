import { createBrowserRouter, Navigate } from "react-router";
import Layout from "./components/Layout.jsx";
import RequireAuth, { Guard } from "./components/RequireAuth.jsx";
import { canCreateDish, canManageChefs, canWrite, isAdmin } from "./auth/can.js";
import SecurityPage from "./pages/admin/security/SecurityPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import LoginPage from "./pages/auth/LoginPage.jsx";
import MfaPage from "./pages/auth/MfaPage.jsx";
import MfaRecoveryPage from "./pages/auth/MfaRecoveryPage.jsx";
import RegisterPage from "./pages/auth/RegisterPage.jsx";
import ActivatePage from "./pages/auth/ActivatePage.jsx";
import ForgotPage from "./pages/auth/ForgotPage.jsx";
import ResetPage from "./pages/auth/ResetPage.jsx";
import DishListPage from "./pages/dishes/DishListPage.jsx";
import DishDetailPage from "./pages/dishes/DishDetailPage.jsx";
import AdminDishListPage from "./pages/admin/dishes/AdminDishListPage.jsx";
import DishFormPage from "./pages/admin/dishes/DishFormPage.jsx";
import DishDeletePage from "./pages/admin/dishes/DishDeletePage.jsx";
import AdminChefListPage from "./pages/admin/chefs/AdminChefListPage.jsx";
import ChefFormPage from "./pages/admin/chefs/ChefFormPage.jsx";
import ChefDeletePage from "./pages/admin/chefs/ChefDeletePage.jsx";
import AdminIngredientListPage from "./pages/admin/ingredients/AdminIngredientListPage.jsx";
import IngredientFormPage from "./pages/admin/ingredients/IngredientFormPage.jsx";
import IngredientDeletePage from "./pages/admin/ingredients/IngredientDeletePage.jsx";

// Routing phía client: router đọc URL trên thanh địa chỉ và chọn trang ngay trong browser.
// URL của TRANG (/dishes/2) khác URL của API (/api/dishes/2): trang do router quyết định, API do backend quyết định.
// React Router ở chế độ thư viện (createBrowserRouter): không dùng loader/action hay render ở server —
// mỗi trang tự gọi API qua api/*.js.
export const router = createBrowserRouter([
  // Trang tài khoản có khung riêng, không có header của site.
  { path: "login", element: <LoginPage /> },
  { path: "login/mfa", element: <MfaPage /> },
  { path: "login/mfa/recovery", element: <MfaRecoveryPage /> },
  { path: "register", element: <RegisterPage /> },
  { path: "activate", element: <ActivatePage /> },
  { path: "forgot", element: <ForgotPage /> },
  { path: "reset", element: <ResetPage /> },
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/dishes" replace /> },

      // Trang người dùng (chỉ đọc)
      { path: "dishes", element: <DishListPage /> },
      // Path param: /dishes/2 → useParams().id = "2"
      { path: "dishes/:id", element: <DishDetailPage /> },

      // Route guard: mọi trang dưới đây cần đăng nhập.
      {
        element: <RequireAuth />,
        children: [
          // Trang quản trị. Form và trang xác nhận xoá là trang của SPA; việc ghi là request tới API.
          { path: "admin", element: <Navigate to="/admin/dishes" replace /> },
          { path: "admin/security", element: <SecurityPage /> },
          { path: "admin/dishes", element: <AdminDishListPage /> },
          { path: "admin/dishes/new", element: <Guard allow={canCreateDish}><DishFormPage /></Guard> },
          { path: "admin/dishes/:id/edit", element: <Guard allow={canWrite}><DishFormPage /></Guard> },
          { path: "admin/dishes/:id/delete", element: <Guard allow={isAdmin}><DishDeletePage /></Guard> },
          // Đầu bếp, nguyên liệu: cùng cấu trúc URL; không có trang chi tiết (thêm/sửa/xoá xong về danh sách).
          { path: "admin/chefs", element: <AdminChefListPage /> },
          { path: "admin/chefs/new", element: <Guard allow={canManageChefs}><ChefFormPage /></Guard> },
          { path: "admin/chefs/:id/edit", element: <Guard allow={canManageChefs}><ChefFormPage /></Guard> },
          { path: "admin/chefs/:id/delete", element: <Guard allow={isAdmin}><ChefDeletePage /></Guard> },
          { path: "admin/ingredients", element: <AdminIngredientListPage /> },
          { path: "admin/ingredients/new", element: <Guard allow={canWrite}><IngredientFormPage /></Guard> },
          { path: "admin/ingredients/:id/edit", element: <Guard allow={canWrite}><IngredientFormPage /></Guard> },
          { path: "admin/ingredients/:id/delete", element: <Guard allow={isAdmin}><IngredientDeletePage /></Guard> },
        ],
      },

      // Không route nào khớp → trang "không tìm thấy" do SPA tự hiện.
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
