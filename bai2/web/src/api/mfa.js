import { api } from "./client.js";

export const getMfaStatus = (opts) => api.get("/api/auth/mfa/status", opts);
export const startSetup = () => api.post("/api/auth/mfa/setup");
export const confirmSetup = (body) => api.post("/api/auth/mfa/confirm", body);
export const replaceDevice = (body) => api.post("/api/auth/mfa/replace", body);
export const regenerateCodes = (body) => api.post("/api/auth/mfa/recovery-codes", body);
export const disableMfa = (body) => api.post("/api/auth/mfa/disable", body);
