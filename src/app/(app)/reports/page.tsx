"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, ChevronLeft, ChevronRight, CreditCard, Loader2, Smartphone } from "lucide-react";
import { formatMinor, formatMinorPlain } from "@/lib/money";
import { todayHebron } from "@/lib/time";

type Report = {
  date: string;
  invoicesCount: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentsByMethod: { cash: number; card: number; electronic: number };
  paymentsTotal: number;
  refundsTotal: number;
  refundsCount: number;
  netSales: number;
  expensesTotal: number;
  expensesCount: number;
  cashNet: number;
  outstandingAll: number;
  outstandingCount: number;
  outstandingToday: number;
};

function shiftDate(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const METHOD_META = [
  { key: "cash", label: "نقدي", icon: Banknote, cls: "bg-leaf" },
  { key: "card", label: "بطاقة", icon: CreditCard, cls: "bg-gold" },
  { key: "electronic", label: "إلكتروني", icon: Smartphone, cls: "bg-mocha" },
] as const;

export default function ReportsPage() {
  const [date, setDate] = useState(todayHebron());
  const [r, setR] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setR(null);
    setError(null);
    try {
      const res = await fetch(`/api/reports/daily?date=${date}`);
      const data = await res.json();
      if (!res.ok) {
        setError(
          res.status === 403
            ? "التقرير اليومي متاح للمدير والكاشير فقط"
            : data?.error ?? `تعذر تحميل التقرير (HTTP ${res.status})`,
        );
        return;
      }
      setR(data);
    } catch {
      setError("تعذر الاتصال بالخادم");
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const payTotal = r?.paymentsTotal ?? 0;

  return (
    <div className="fade-up">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-black">التقرير اليومي</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => setDate(shiftDate(date, 1))} className="press rounded-lg bg-paper p-2 text-mocha ring-1 ring-coffee/10" aria-label="اليوم التالي">
            <ChevronRight className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={date}
            dir="ltr"
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-lg bg-paper px-2 py-1.5 text-xs font-bold ring-1 ring-coffee/10"
          />
          <button onClick={() => setDate(shiftDate(date, -1))} className="press rounded-lg bg-paper p-2 text-mocha ring-1 ring-coffee/10" aria-label="اليوم السابق">
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl bg-terrasoft px-4 py-6 text-center text-sm font-bold text-terra">{error}</p>
      ) : !r ? (
        <div className="flex justify-center py-24 text-mocha">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {/* البطاقة الرئيسية */}
          <div className="card overflow-hidden">
            <div className="bg-gradient-to-l from-coffee to-ink p-5 text-cream">
              <p className="text-xs font-bold text-cream/60">صافي مبيعات {r.date}</p>
              <p className="mt-1 text-3xl font-black text-goldsoft">{formatMinor(r.netSales)}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white/10 py-2">
                  <p className="text-sm font-black">{r.invoicesCount}</p>
                  <p className="text-[10px] font-bold text-cream/60">فاتورة</p>
                </div>
                <div className="rounded-xl bg-white/10 py-2">
                  <p className="text-sm font-black">{formatMinorPlain(r.total)}</p>
                  <p className="text-[10px] font-bold text-cream/60">إجمالي المبيعات ₪</p>
                </div>
                <div className="rounded-xl bg-white/10 py-2">
                  <p className="text-sm font-black">{formatMinorPlain(r.paymentsTotal)}</p>
                  <p className="text-[10px] font-bold text-cream/60">المحصّل فعلياً ₪</p>
                </div>
              </div>
            </div>
          </div>

          {/* شبكة المؤشرات */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Kpi label="مجموع الأصناف" value={formatMinor(r.subtotal)} />
            <Kpi label="الخصومات" value={`-${formatMinor(r.discount)}`} tone={r.discount > 0 ? "warn" : undefined} />
            <Kpi label="الضرائب المحصّلة" value={formatMinor(r.tax)} />
            <Kpi
              label={`الاستردادات (${r.refundsCount})`}
              value={`-${formatMinor(r.refundsTotal)}`}
              tone={r.refundsTotal > 0 ? "bad" : undefined}
            />
            <Kpi label={`مصروفات اليوم (${r.expensesCount})`} value={formatMinor(r.expensesTotal)} />
            <Kpi
              label="صافي الصندوق النقدي"
              value={formatMinor(r.cashNet)}
              hint="نقدي محصّل − المصروفات"
              tone={r.cashNet < 0 ? "bad" : "good"}
            />
          </div>

          {/* المقبوضات حسب الطريقة */}
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-black text-mocha">المقبوضات حسب طريقة الدفع</h2>
            <div className="mb-3 flex h-3.5 w-full overflow-hidden rounded-full bg-sand" dir="ltr">
              {METHOD_META.map((m) => {
                const v = r.paymentsByMethod[m.key];
                const pct = payTotal > 0 ? (v / payTotal) * 100 : 0;
                return pct > 0 ? (
                  <span key={m.key} className={`${m.cls} transition-all`} style={{ width: `${pct}%` }} />
                ) : null;
              })}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {METHOD_META.map((m) => (
                <div key={m.key} className="rounded-xl bg-cream/70 p-3 text-center">
                  <m.icon className="mx-auto mb-1 h-4 w-4 text-mocha" />
                  <p className="text-sm font-black">{formatMinorPlain(r.paymentsByMethod[m.key])}</p>
                  <p className="text-[10px] font-bold text-mocha">{m.label} ₪</p>
                </div>
              ))}
            </div>
          </div>

          {/* الديون والأرصدة */}
          <div className="card p-4">
            <h2 className="mb-3 text-sm font-black text-mocha">الديون والأرصدة المتبقية</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl bg-terrasoft p-3">
                <p className="text-lg font-black text-terra">{formatMinor(r.outstandingToday)}</p>
                <p className="text-[11px] font-bold text-mocha">متبقٍ على فواتير هذا اليوم</p>
              </div>
              <div className="rounded-xl bg-ambersoft p-3">
                <p className="text-lg font-black text-amber">{formatMinor(r.outstandingAll)}</p>
                <p className="text-[11px] font-bold text-mocha">إجمالي الديون المفتوحة ({r.outstandingCount} فاتورة)</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn" | "bad";
}) {
  const cls =
    tone === "bad" ? "text-terra" : tone === "warn" ? "text-amber" : tone === "good" ? "text-leaf" : "text-ink";
  return (
    <div className="card p-3.5">
      <p className={`text-base font-black ${cls}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-bold text-mocha">{label}</p>
      {hint ? <p className="text-[10px] font-semibold text-mocha/60">{hint}</p> : null}
    </div>
  );
}
