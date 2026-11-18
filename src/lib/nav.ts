"use client";

/**
 * تنقل آمن يحمل الجلسة داخل الرابط — لا يعتمد على كوكي (محجوب في المعاينة)
 * ولا على ترويسة Referer (قد يقصّها المزوّد) ولا على تغليف Next للتنقل الداخلي.
 * تحميل الصفحة الكامل بالرابط هو المضمون 100%.
 */
export function currentSid(): string | null {
  try {
    const t = localStorage.getItem("rc_token");
    if (t) return t;
  } catch {
    /* التخزين محجوب — نكمل بالرابط الحالي */
  }
  try {
    const m = window.location.search.match(/[?&]sid=([^&]+)/);
    if (m) return decodeURIComponent(m[1]);
  } catch {
    /* ignore */
  }
  return null;
}

export function withSid(path: string): string {
  const t = currentSid();
  if (!t || !path.startsWith("/") || path.startsWith("/login") || path.startsWith("/api/"))
    return path;
  if (path.includes("sid=")) return path;
  return path + (path.includes("?") ? "&" : "?") + "sid=" + encodeURIComponent(t);
}

/** تنقّل بتحميل الصفحة الكامل مع الجلسة في الرابط */
export function go(path: string): void {
  location.assign(withSid(path));
}
