"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2, Wallet } from "lucide-react";
import Modal, { Field, inputCls } from "@/components/Modal";
import { formatMinor, parseToMinor } from "@/lib/money";
import { todayHebron } from "@/lib/time";

type Expense = {
  id: number;
  title: string;
  category: string;
  amountMinor: number;
  spentOn: string;
  note: string;
  createdByName: string | null;
};

const CATEGORIES = ["مشتريات", "فواتير وخدمات", "رواتب", "صيانة", "أخرى"];

function shiftDate(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export default function ExpensesPage() {
  const [date, setDate] = useState(todayHebron());
  const [rows, setRows] = useState<Expense[] | null>(null);
  const [role, setRole] = useState<string>("staff");
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [eRes, mRes] = await Promise.all([
        fetch(`/api/expenses?date=${date}`),
        fetch("/api/auth/me"),
      ]);
      if (eRes.ok) setRows((await eRes.json()).expenses);
      else {
        setRows([]);
        setError("تعذر تحميل المصروفات — حدّث الصفحة");
      }
      if (mRes.ok) setRole((await mRes.json()).user.role);
    } catch {
      setError("تعذر التحميل");
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  async function addExpense() {
    const minor = parseToMinor(amount);
    if (!title.trim()) return setError("بيان المصروف مطلوب"), undefined;
    if (minor === null || minor <= 0) return setError("المبلغ غير صالح"), undefined;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category,
          amountMinor: minor,
          spentOn: date,
          note: note.trim(),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) return setError(body?.error ?? "تعذر الحفظ"), undefined;
      setAddOpen(false);
      setTitle("");
      setAmount("");
      setNote("");
      await load();
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  async function remove(id: number) {
    if (!confirm("حذف هذا المصروف؟")) return;
    const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    if (res.ok) load();
    else setError((await res.json().catch(() => null))?.error ?? "تعذر الحذف");
  }

  const total = rows?.reduce((s, r) => s + r.amountMinor, 0) ?? 0;
  const isManager = role === "manager";

  return (
    <div className="fade-up">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">المصروفات</h1>
          <p className="text-xs font-bold text-mocha">
            {date} · الإجمالي {formatMinor(total)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <button onClick={() => setDate(shiftDate(date, 1))} className="press rounded-lg bg-paper p-2 text-mocha ring-1 ring-coffee/10" aria-label="اليوم التالي">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button onClick={() => setDate(shiftDate(date, -1))} className="press rounded-lg bg-paper p-2 text-mocha ring-1 ring-coffee/10" aria-label="اليوم السابق">
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
          {isManager ? (
            <button
              onClick={() => setAddOpen(true)}
              className="press flex items-center gap-1.5 rounded-xl bg-coffee px-3.5 py-2 text-sm font-extrabold text-goldsoft"
            >
              <Plus className="h-4 w-4" /> مصروف
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mb-3 rounded-xl bg-terrasoft px-3 py-2 text-sm font-bold text-terra">{error}</p>
      ) : null}

      {!rows ? (
        <div className="flex justify-center py-20 text-mocha">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-14 text-mocha">
          <Wallet className="h-10 w-10 opacity-40" />
          <p className="text-sm font-bold">لا توجد مصروفات مسجلة في هذا اليوم</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((e) => (
            <div key={e.id} className="card flex items-center justify-between gap-3 p-3.5">
              <div className="min-w-0">
                <p className="text-sm font-extrabold">{e.title}</p>
                <p className="mt-0.5 text-[11px] font-bold text-mocha">
                  <span className="rounded-full bg-sand px-2 py-0.5">{e.category}</span>
                  {e.note ? <span className="ms-2">{e.note}</span> : null}
                  <span className="ms-2 text-mocha/60">{e.createdByName ?? ""}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-terra">-{formatMinor(e.amountMinor)}</span>
                {isManager ? (
                  <button
                    onClick={() => remove(e.id)}
                    className="press rounded-lg bg-terrasoft p-2 text-terra"
                    aria-label="حذف"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isManager ? (
        <p className="mt-4 rounded-xl bg-cream px-4 py-3 text-center text-xs font-bold text-mocha">
          تسجيل وحذف المصروفات متاح للمدير فقط
        </p>
      ) : null}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={`مصروف جديد — ${date}`}>
        <Field label="البيان">
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثال: شراء بن، فاتورة كهرباء"
            maxLength={80}
          />
        </Field>
        <Field label="المبلغ بالشيكل">
          <input
            className={inputCls}
            inputMode="decimal"
            dir="ltr"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="التصنيف">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`press rounded-full px-3 py-1.5 text-xs font-extrabold ${
                  category === c ? "bg-coffee text-goldsoft" : "bg-cream text-mocha ring-1 ring-coffee/10"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>
        <Field label="ملاحظة (اختياري)">
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        </Field>
        <button
          onClick={addExpense}
          disabled={busy}
          className="press mt-1 w-full rounded-xl bg-coffee py-3 text-sm font-extrabold text-goldsoft disabled:opacity-50"
        >
          {busy ? "…" : "تسجيل المصروف"}
        </button>
      </Modal>
    </div>
  );
}
