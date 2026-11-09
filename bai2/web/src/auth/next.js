// `next` chỉ nhận đường dẫn nội bộ: "/" đầu tiên nhưng không phải "//" hay "/\" (trình duyệt hiểu là sang host khác).
export const safeNext = (value) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !value.startsWith("/login") ? value : "/admin/dishes";
