"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, ReceiptText } from "lucide-react";
import { formatMinor } from "@/lib/money";
import { fmtTime, todayHebron } from "@/lib/time";

type InvoiceRow = {
  id: number;
  number: number;
  tableName: string;
  totalMinor: number;
  status: string;
  createdAt: string;
  paid: number;
  refunded: number;
  remaining: number;
  cashierId: number | null;
  cashierName: string | null;
};

export const STATUS_LABEL: Record<string, string> = {
  open: "غير مسددة",
  partially_paid: "سداد جزئي",
  paid: "مسددة",
  refunded: "مستردة",
  void: "ملغاة",
};
export const STATUS_CLS: Record<string, string> = {
  open: "bg-terrasoft text-terra",
  partially_paid: "bg-ambersoft text-amber",
  paid: "bg-leafsoft text-leaf",
  refunded: "bg-sand text-mocha",
  void: "bg-sand text-mocha/60",
};

function shiftDate(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export default function InvoicesPage() {
  const [date, setDate] = useState(todayHebron());
  const [rows, setRows] = useState<InvoiceRow[] | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [cashierF, setCashierF] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/invoices?date=${date}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      setRows(data.invoices);
    } catch {
      setRows([]);
      setError("تعذر تحميل الفواتير");
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered =
    rows?.filter(
      (r) =>
        (filter === "all" ? true : r.status === filter) &&
        (cashierF === "all" ? true : (r.cashierName ?? "") === cashierF),
    ) ?? null;
  const cashiers = Array.from(
    new Set((rows ?? []).map((r) => r.cashierName).filter((n): n is string => Boolean(n))),
  );
  const dayTotal = rows?.reduce((s, r) => s + r.totalMinor, 0) ?? 0;

  return (
    <div className="fade-up">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-black">الفواتير</h1>
        <span className="rounded-full bg-goldsoft px-3 py-1 text-xs font-black text-golddeep">
          {rows?.length ?? 0} فاتورة · {formatMinor(dayTotal)}
        </span>
      </div>

      <div className="card mb-3 flex items-center justify-between p-2">
        <button
          onClick={() => setDate(shiftDate(date, 1))}
          className="press rounded-lg p-2 text-mocha hover:bg-cream"
          aria-label="اليوم التالي"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <label className="flex items-center gap-2 text-sm font-extrabold">
          <CalendarDays className="h-4 w-4 text-golddeep" />
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-lg bg-cream px-2 py-1 text-sm font-bold outline-none"
            dir="ltr"
          />
        </label>
        <button
          onClick={() => setDate(shiftDate(date, -1))}
          className="press rounded-lg p-2 text-mocha hover:bg-cream"
          aria-label="اليوم السابق"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>

      <div className="slim-scroll mb-3 flex gap-2 overflow-x-auto pb-1">
        {[
          ["all", "الكل"],
          ["open", "غير مسددة"],
          ["partially_paid", "سداد جزئي"],
          ["paid", "مسددة"],
          ["refunded", "مستردة"],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            className={`press shrink-0 rounded-full px-3.5 py-1.5 text-xs font-extrabold ${
              filter === v ? "bg-coffee text-goldsoft" : "bg-paper text-mocha ring-1 ring-coffee/10"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* فلتر الموظفين — كل فواتير الفريق في مكان واحد يديرها المدير */}
      {cashiers.length > 0 ? (
        <div className="slim-scroll mb-3 flex gap-2 overflow-x-auto pb-1">
          {[["all", "كل الموظفين"] as [string, string], ...cashiers.map((c) => [c, c] as [string, string])].map(
            ([v, l]) => (
              <button
                key={v}
                onClick={() => setCashierF(v)}
                className={`press shrink-0 rounded-full px-3.5 py-1.5 text-xs font-extrabold ${
                  cashierF === v
                    ? "bg-golddeep text-cream"
                    : "bg-cream text-mocha ring-1 ring-coffee/10"
                }`}
              >
                {l}
              </button>
            ),
          )}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl bg-terrasoft px-3 py-2 text-sm font-bold text-terra">{error}</p>
      ) : null}

      {!filtered ? (
        <div className="flex justify-center py-16 text-mocha">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-14 text-mocha">
          <ReceiptText className="h-10 w-10 opacity-40" />
          <p className="text-sm font-bold">لا توجد فواتير في هذا اليوم</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((inv) => (
            <Link
              key={inv.id}
              href={`/invoices/${inv.id}`}
              className="press card flex items-center justify-between gap-3 p-3.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-black">
                  فاتورة #{inv.number}
                  <span className="ms-2 text-xs font-bold text-mocha">{inv.tableName}</span>
                </p>
                <p className="mt-0.5 text-[11px] font-bold text-mocha/80">
                  {fmtTime(inv.createdAt)}
                  {inv.cashierName ? <span className="text-golddeep"> · {inv.cashierName}</span> : null}
                </p>
              </div>
              <div className="text-end">
                <p className="text-base font-black">{formatMinor(inv.totalMinor)}</p>
                <div className="mt-0.5 flex items-center justify-end gap-1.5">
                  {inv.remaining > 0 ? (
                    <span className="text-[11px] font-extrabold text-terra">
                      متبقٍ {formatMinor(inv.remaining)}
                    </span>
                  ) : null}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${STATUS_CLS[inv.status]}`}>
                    {STATUS_LABEL[inv.status]}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
