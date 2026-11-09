import { api } from "./client.js";

// Các route trước khi đăng nhập: không gửi token.
const anon = { anonymous: true };
export const login = (body) => api.post("/api/auth/login", body, anon);
// 401 ở đây là challenge hết hạn, trang MFA tự xử lý: không phải "phiên đăng nhập hết hạn".
export const submitMfa = (body) => api.post("/api/auth/mfa", body, { ...anon, on401: "throw" });
export const register = (body) => api.post("/api/auth/register", body, anon);
export const activate = (body) => api.post("/api/auth/activate", body, anon);
export const resendOtp = (body) => api.post("/api/auth/activate/resend", body, anon);
export const forgot = (body) => api.post("/api/auth/forgot", body, anon);
export const resetPassword = (body) => api.post("/api/auth/reset", body, anon);
export const getMe = (opts) => api.get("/api/auth/me", opts);
