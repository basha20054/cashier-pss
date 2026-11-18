"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Settings } from "lucide-react";
import { Field, inputCls } from "@/components/Modal";

type Settings = { restaurantName: string; currency: string; taxBps: number; timezone: string };

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [tax, setTax] = useState("0");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [sRes, mRes] = await Promise.all([fetch("/api/settings"), fetch("/api/auth/me")]);
    if (mRes.ok) setRole((await mRes.json()).user.role);
    if (sRes.ok) {
      const d = (await sRes.json()).settings as Settings;
      setS(d);
      setName(d.restaurantName);
      setTax(String(d.taxBps / 100));
    } else {
      setError("تعذر تحميل الإعدادات — حدّث الصفحة");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    const tp = Number(tax);
    if (!name.trim()) return setError("اسم المطعم مطلوب"), undefined;
    if (Number.isNaN(tp) || tp < 0 || tp > 100) return setError("نسبة الضريبة بين 0 و 100"), undefined;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantName: name.trim(), taxPercent: tp }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(body?.error ?? "تعذر الحفظ"), undefined;
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await load();
    return undefined;
  }

  if (role === null || !s) {
    return error ? (
      <div className="card mx-auto max-w-md p-6 text-center text-sm font-bold text-terra">{error}</div>
    ) : (
      <div className="flex justify-center py-24 text-mocha">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (role !== "manager") {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <Settings className="mx-auto mb-3 h-10 w-10 text-mocha/40" />
        <p className="font-black">الإعدادات متاحة للمدير فقط</p>
      </div>
    );
  }

  return (
    <div className="fade-up mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl font-black">إعدادات المطعم</h1>

      {error ? (
        <p className="mb-3 rounded-xl bg-terrasoft px-3 py-2 text-sm font-bold text-terra">{error}</p>
      ) : null}

      <div className="card p-5">
        <Field label="اسم المطعم (يظهر في الترويسة والإيصالات)">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        <Field label="نسبة الضريبة % (0 = بدون ضريبة — تُحسب على المجموع بعد الخصم)">
          <input
            className={inputCls}
            inputMode="decimal"
            dir="ltr"
            value={tax}
            onChange={(e) => setTax(e.target.value)}
            placeholder="0"
          />
        </Field>

        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-cream p-3">
            <p className="text-sm font-black">الشيكل ₪ (ILS)</p>
            <p className="text-[10px] font-bold text-mocha">العملة — تخزين بالأجورات</p>
          </div>
          <div className="rounded-xl bg-cream p-3">
            <p className="text-sm font-black" dir="ltr">
              {s.timezone}
            </p>
            <p className="text-[10px] font-bold text-mocha">المنطقة الزمنية للإقفالات اليومية</p>
          </div>
        </div>

        <button
          onClick={save}
          disabled={busy}
          className="press mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-coffee py-3 text-sm font-extrabold text-goldsoft disabled:opacity-50"
        >
          {saved ? <Check className="h-4 w-4 text-leaf" /> : null}
          {busy ? "…" : saved ? "تم الحفظ" : "حفظ الإعدادات"}
        </button>
      </div>

      <p className="mt-3 rounded-xl bg-ambersoft px-4 py-3 text-center text-xs font-bold text-amber">
        تغيير نسبة الضريبة يسري على الفواتير الجديدة فقط — الفواتير السابقة تحتفظ بنسبتها وقت الإصدار
      </p>
    </div>
  );
}
