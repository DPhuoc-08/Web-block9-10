// Chỉ gắn cho các route của bước MFA khi đăng nhập. Phiên chờ quá 5 phút thì phải nhập lại password: bước password không
// được trở thành quyền vào lâu dài (plan mục 4).
export const MFA_PENDING_MS = 5 * 60_000;

export function requireMfaPending(req, res, next) {
  const pending = req.session?.mfaPending;
  if (!pending) return res.redirect(303, "/login");
  if (!(pending.at > Date.now() - MFA_PENDING_MS)) {
    delete req.session.mfaPending;
    return res.redirect(303, "/login?msg=mfa-expired");
  }
  res.locals.mfaPending = pending;
  next();
}
