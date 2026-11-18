import { NextRequest, NextResponse } from "next/server";

/**
 * جسر الجلسة للمتصفحات التي تحجب الكوكيز (المعاينة داخل إطار):
 * إن حضرت ?sid= في الرابط ولم توجد كوكي جلسة، ننسخها إلى ترويسة طلب داخلية
 * x-session-id فيقرأها حارس الجلسة من الخادم — دون أي اعتماد على تخزين الكوكي.
 * التحقق الفعلي من الرمز يتم دائماً مقابل جدول sessions في قاعدة البيانات.
 */
export const config = {
  // يشمل مسارات /api أيضاً — middleware يحوّل ?sid= من الرابط إلى ترويسة داخلية
  // بعد البروكسي، فلا يتأثر بأي حذف للترويسات في طريقها
  matcher: ["/((?!_next/|favicon.ico|receipt|.*\\..*).*)"],
};

export function middleware(req: NextRequest) {
  // المصدر 1: الرمز في رابط الطلب نفسه
  let sid = req.nextUrl.searchParams.get("sid");
  // المصدر 2 (حصري للتنقلات): ترويسة Referer تحمل رابط الصفحة السابقة الحامل للرمز —
  // هكذا ينجح أي تنقّل داخلي حتى لو لم يلحق الرمز صراحةً
  if (!sid) {
    const ref = req.headers.get("referer");
    if (ref) {
      try {
        sid = new URL(ref).searchParams.get("sid");
      } catch {
        /* رابط غير صالح — نتجاهل */
      }
    }
  }
  if (!sid || sid.length > 200) return NextResponse.next();
  // نمرّر sid دائماً كاحتياطي — الجلسة تُقرأ بالترتيب: كوكي، ثم Bearer، ثم هذا الترويسة
  // (وإن وُجد كوكي قديم في المتصفح لا يعطّل البدائل الصحيح)
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-session-id", sid);
  return NextResponse.next({ request: { headers: reqHeaders } });
}
