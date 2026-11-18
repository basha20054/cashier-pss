/* خدمة العمل بدون إنترنت — PWA
 * - الأصول الثابتة (JS/CSS/خطوط/أيقونة): من الذاكرة أولاً (cache-first) → تشغيل فوري
 * - الصفحات: من الشبكة أولاً، وعند انقطاع الإنترنت تُعرض النسخة المخزّنة أو شاشة «غير متصل»
 * - طلبات API: بلا تخزين (البيانات المالية لا تُخزَّن في المتصفح) — تفشل طبيعياً فتظهر رسائل الشاشات
 */
const CACHE = "resto-cache-v1";
const OFFLINE_HTML = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>غير متصل</title></head>
<body style="font-family:Cairo,sans-serif;background:#f5efe3;color:#231710;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center;padding:24px;max-width:340px">
<p style="font-size:44px;margin:0">📡</p>
<h1 style="font-size:20px;margin:12px 0 6px">لا يوجد اتصال بالإنترنت</h1>
<p style="font-size:14px;color:#6b5138;line-height:1.7;margin:0 0 18px">
الصفحات المفتوحة سابقاً تعمل من الذاكرة، لكن تسجيل الطلبات والفواتير يحتاج اتصالاً بالخادم.
</p>
<button onclick="location.reload()" style="background:#3a2a1b;color:#efe0bb;border:0;padding:12px 28px;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer">إعادة المحاولة</button>
</div></body></html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  const isNextStatic = url.origin === self.location.origin && url.pathname.startsWith("/_next/static");
  const isLocalAsset =
    url.origin === self.location.origin &&
    (url.pathname === "/icon.png" || url.pathname === "/manifest.webmanifest" || url.pathname === "/sw.js");
  const isFont =
    url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("gstatic.com");

  // أصول ثابتة: من الذاكرة أولاً ثم التحديث في الخلفية
  if (isNextStatic || isLocalAsset || isFont) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => hit);
        return hit || network;
      }),
    );
    return;
  }

  // صفحات (تنقّل): من الشبكة أولاً مع تخزين النسخ النظيفة (بلا sid لتجنّب تلوّث الذاكرة)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !url.searchParams.has("sid")) {
            caches.open(CACHE).then((c) => c.put(req, res.clone()).catch(() => {}));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req, { ignoreSearch: false });
          if (cached) return cached;
          const shell = await caches.match("/login");
          if (shell) return shell;
          return new Response(OFFLINE_HTML, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }),
    );
    return;
  }

  // باقي الطلبات (API وغيرها): بلا تخزين — تمرّ للشبكة كما هي
});
