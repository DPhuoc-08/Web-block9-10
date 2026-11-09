import { useEffect, useImperativeHandle, useRef } from "react";

// Widget reCAPTCHA v2 của Google. Site key là giá trị công khai; secret chỉ nằm ở api.
const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
let loader = null;

function loadScript() {
  loader ??= new Promise((resolve, reject) => {
    window.onRecaptchaReady = resolve;
    const script = document.createElement("script");
    script.src = "https://www.google.com/recaptcha/api.js?hl=vi&onload=onRecaptchaReady&render=explicit";
    script.async = true;
    script.onerror = () => {
      loader = null;
      reject(new Error("Không tải được reCAPTCHA"));
    };
    document.head.append(script);
  });
  return loader;
}

// onToken(chuỗi) khi tick xong, onToken("") khi hết hạn. Token dùng một lần nên trang gọi ref.reset() sau mỗi lần gửi không thành công.
export default function Captcha({ ref, onToken, error }) {
  const host = useRef(null);
  const widget = useRef(null);
  const callback = useRef(onToken);
  callback.current = onToken;

  useImperativeHandle(ref, () => ({
    reset() {
      if (widget.current !== null) window.grecaptcha.reset(widget.current);
      callback.current("");
    },
  }));

  useEffect(() => {
    let cancelled = false;
    // Mỗi lần effect chạy một thẻ mới: StrictMode chạy effect hai lần, widget không dựng lại được trên cùng một thẻ.
    const slot = document.createElement("div");
    host.current.append(slot);
    loadScript()
      .then(() => {
        if (cancelled) return;
        widget.current = window.grecaptcha.render(slot, {
          sitekey: SITE_KEY,
          size: window.innerWidth < 360 ? "compact" : "normal",
          callback: (token) => callback.current(token),
          "expired-callback": () => callback.current(""),
          "error-callback": () => callback.current(""),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      widget.current = null;
      slot.remove();
    };
  }, []);

  return (
    <div className={`a-field captcha-field${error ? " invalid" : ""}`}>
      <div ref={host} />
      {error && <p className="a-error" id="f-captcha-error">{error}</p>}
    </div>
  );
}
