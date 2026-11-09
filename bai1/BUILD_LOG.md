# BUILD_LOG — Block 9, Bài 1 (SSR: RBAC, ABAC, MFA)

Plan: `../../block9-plan.md`. Quy ước làm việc: `../../CLAUDE.md`. Đề: `../../block9-deck.html`.
Hướng làm (đã chốt 09/11/2026, plan mục 12): thêm phân quyền và MFA vào bản SSR của block8, không có API JSON, JWT. Giao diện theo bản Figma đã duyệt (file block7, trang "Block 9 · Phân quyền và MFA").

## Bước 0 — Khởi tạo repo
**Đã làm:** tạo `Week7/block9/`, `git init` (nhánh `main`), `.gitignore`, `bai1/BUILD_LOG.md`.

**Quyết định và lý do:**
- **Một repo cho cả hai bài** ở `Week7/block9/`: giảng viên yêu cầu mỗi block một repo. Mỗi bài một thư mục để nghiệm thu và nộp riêng.
- **`.gitignore` tạo trước mọi `npm install`** (bài học block5): tránh commit nhầm `node_modules/`, `.env`.
- Nội dung chép từ block8, thêm `dist/` cho `web` của Bài 2.

**Đã kiểm tra:** `git status` sạch sau commit; `git check-ignore` xác nhận `.env`, `.env.test`, `node_modules/`, `dist/`, `.mail-outbox/` bị bỏ qua, `.env.example` không bị bỏ qua.
