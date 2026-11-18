// صفحة دخول خالية من JavaScript تماماً — نموذج HTML حقيقي يعمل في أي متصفح
import { Coffee, LockKeyhole } from "lucide-react";
import { fmtTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "1": "رقم الدخول غير صحيح",
  "2": "محاولات كثيرة — انتظر 5 دقائق ثم حاول مجدداً",
  "3": "مشكلة مؤقتة في الخادم — حدّث الصفحة بعد ثوانٍ وأعد المحاولة",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const { err } = await searchParams;
  // طابع زمني مُصيَّر من الخادم: إن لم يطابق وقتك الحالي فأنت ترى نسخة مخزّنة قديمة
  const serverTime = fmtTime(new Date());

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center fade-up">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-coffee via-[#4a3524] to-ink shadow-lg shadow-coffee/30">
            <Coffee className="h-10 w-10 text-goldsoft" strokeWidth={1.6} />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-ink">كاشير</h1>
          <p className="mt-1 text-sm font-semibold text-mocha">Lord Cafe · نظام محاسبة المطعم</p>
        </div>

        <div className="card p-6">
          <div className="mb-5 flex items-center justify-center gap-2 text-mocha">
            <LockKeyhole className="h-4 w-4" />
            <span className="text-sm font-bold">أدخل رقم الدخول</span>
          </div>

          {err && ERRORS[err] ? (
            <p className="mb-4 rounded-xl bg-terrasoft px-3 py-2.5 text-center text-sm font-bold text-terra">
              {ERRORS[err]}
            </p>
          ) : null}

          <form method="post" action="/api/auth/form-login">
            <input
              type="password"
              name="pin"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              autoFocus
              required
              minLength={4}
              maxLength={8}
              placeholder="••••"
              dir="ltr"
              className="mb-4 w-full rounded-2xl border border-coffee/15 bg-cream px-4 py-4 text-center text-3xl font-black tracking-[0.5em] text-ink outline-none transition focus:border-gold focus:bg-paper"
            />
            <label className="mb-4 flex cursor-pointer items-center gap-2.5 rounded-xl bg-cream px-3 py-2.5">
              <input
                type="checkbox"
                name="remember"
                value="1"
                defaultChecked
                className="h-4 w-4 shrink-0 accent-[#b8862f]"
              />
              <span className="text-xs font-bold leading-snug text-mocha">
                دخول تلقائي على هذا الجهاز (90 يوماً) — يدخل مباشرة عند فتح الرابط
              </span>
            </label>
            <button
              type="submit"
              className="press w-full rounded-2xl bg-coffee py-4 text-lg font-extrabold text-goldsoft hover:bg-ink"
            >
              دخول
            </button>
          </form>
        </div>

        {/* جسر الدخول التلقائي: إن وُجد رمز جلسة مخزّن (90 يوماً) يدخل مباشرة
            بلا أي خطوة — وإن كان معطّباً يُمسح ويظهر النموذج (لا حلقة) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){});}try{var t=localStorage.getItem('rc_token');if(!t)return;if(sessionStorage.getItem('rc_tried')){localStorage.removeItem('rc_token');sessionStorage.removeItem('rc_tried');return;}sessionStorage.setItem('rc_tried','1');location.replace('/tables?sid='+encodeURIComponent(t));}catch(e){}})();`,
          }}
        />

        {/* تحسين تدريجي: إن توفر JavaScript نلتقط النموذج ونخزّن الرمز محلياً
            كي يعمل التطبيق حتى مع حجب كوكيز الطرف الثالث. بلا JS يعمل النموذج الاصلي */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.addEventListener('submit',function(e){var f=e.target;if(!f||f.getAttribute('action')!=='/api/auth/form-login')return;e.preventDefault();var pin=String(new FormData(f).get('pin')||'');var btn=f.querySelector('button[type="submit"]');if(btn){btn.textContent='جارٍ الدخول…';btn.disabled=true;}fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:pin,remember:!!(document.getElementById('remember')||{}).checked})}).then(function(r){return r.json().then(function(d){if(r.ok&&d&&d.ok&&d.token){try{localStorage.setItem('rc_token',d.token);}catch(_){}location.assign('/tables?sid='+encodeURIComponent(d.token));return;}location.assign(r.status===429?'/login?err=2':'/login?err=1');});}).catch(function(){location.assign('/login?err=3');});});`,
          }}
        />

        <p className="mt-6 text-center text-xs font-semibold text-mocha/70" dir="ltr">
          {serverTime} · الخادم يعمل · v6
        </p>
        <p className="mt-1 text-center text-[11px] font-semibold leading-relaxed text-mocha/50">
          إن كان الوقت أعلاه قديماً أو لا يتحرك، فأنت ترى نسخة محفوظة في متصفحك — اسحب الصفحة للأسفل لتحديثها
        </p>
      </div>
    </main>
  );
}
