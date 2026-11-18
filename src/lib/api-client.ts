"use client";

/**
 * طبقة مقاومة لحجب الكوكيز والتخزين داخل إطارات المعاينة (تُستدعى مرة من AppShell):
 * 1) رمز الجلسة يُقرأ من localStorage، وإن فشل التخزين من ?sid= في الرابط الحالي.
 * 2) كل طلب /api يحمله في ترويستين: Authorization Bearer و x-session-id — مساران احتياطيان.
 * 3) أي 401 من الواجهة الداخلية -> تحويل مرئي لصفحة الدخول برسالة توضيحية (لا تحميل أبدي صامت).
 */
declare global {
  interface Window {
    __rcPatched?: boolean;
    __rcNav?: boolean;
    __rcOrigFetch?: typeof fetch;
  }
}

import { currentSid as sid, withSid } from "./nav";

if (typeof window !== "undefined" && !window.__rcPatched) {
  window.__rcPatched = true;

  const origFetch = window.fetch.bind(window);
  window.__rcOrigFetch = origFetch;
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const t = sid();
    const isAppUrl =
      t !== null &&
      typeof input === "string" &&
      input.startsWith("/") &&
      !input.startsWith("/_next/");
    if (isAppUrl) {
      const h = new Headers(init?.headers);
      // الرمز داخل الرابط لكل طلبات التطبيق (API وتنقلات الصفحات RSC):
      // الرابط يعبر أي بروكسي، و middleware يحوّله إلى جلسة داخلية داخل الخادم
      let url = input as string;
      if (!/[?&]sid=/.test(url)) {
        url += (url.includes("?") ? "&" : "?") + "sid=" + encodeURIComponent(t as string);
      }
      if (url.startsWith("/api/")) {
        h.set("Authorization", `Bearer ${t}`);
        h.set("x-session-id", t);
      }
      const p = origFetch(url, { ...init, headers: h });
      if (url.startsWith("/api/")) {
        // جلسة غير صالحة -> رسالة مرئية بدل تحميل أبدي
        p.then((res) => {
          if (res.status === 401 && !input.startsWith("/api/auth/")) {
            window.__rcNav = false;
            location.assign("/login?reason=session");
          }
        }).catch(() => {});
      }
      return p;
    }
    return origFetch(input, init);
  }) as typeof fetch;

  // كل نقر على رابط داخلي = تحميل صفحة كامل حاملاً الجلسة في الرابط (دائماً، بلا شروط)
  document.addEventListener(
    "click",
    (e) => {
      const t = e.target as HTMLElement | null;
      const a = t?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target || a.hasAttribute("download")) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const href = a.getAttribute("href") ?? "";
      if (!href.startsWith("/") || href.startsWith("/api/")) return;
      e.preventDefault();
      location.assign(withSid(href));
    },
    true,
  );

  // أي تنقل برمجي يمر عبر history — نضمن بقاء الجلسة في شريط العنوان
  const origPush = history.pushState;
  history.pushState = ((data: unknown, unused: string, url?: string | URL | null) => {
    const next = typeof url === "string" ? withSid(url) : url;
    return origPush.call(history, data, unused, next as never);
  }) as typeof history.pushState;
}

export {};
