// Challenge của bước MFA giữ trong bộ nhớ của trang: không vào URL, không vào storage. Reload thì mất và phải nhập lại password,
// chấp nhận được vì challenge chỉ sống 5 phút và chỉ có ích ở một bước duy nhất.
let held = null;
export const holdChallenge = (challenge, next) => { held = { challenge, next }; };
export const heldChallenge = () => held;
export const dropChallenge = () => { held = null; };
