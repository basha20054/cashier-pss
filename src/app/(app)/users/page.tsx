"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Plus, UserRound, Users } from "lucide-react";
import Modal, { Field, inputCls } from "@/components/Modal";

type User = { id: number; name: string; role: "manager" | "cashier" | "staff"; active: boolean };

const ROLE_LABEL: Record<string, string> = { manager: "مدير", cashier: "كاشير", staff: "موظف" };
const ROLE_CLS: Record<string, string> = {
  manager: "bg-goldsoft text-golddeep",
  cashier: "bg-ambersoft text-amber",
  staff: "bg-leafsoft text-leaf",
};

export default function UsersPage() {
  const [rows, setRows] = useState<User[] | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [pinTarget, setPinTarget] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("cashier");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [uRes, meRes] = await Promise.all([fetch("/api/users"), fetch("/api/auth/me")]);
    if (meRes.ok) setMyRole((await meRes.json()).user.role);
    if (uRes.ok) setRows((await uRes.json()).users);
    else if (uRes.status === 403) setMyRole((r) => r ?? "staff");
    else {
      setRows([]);
      setError("تعذر تحميل المستخدمين — حدّث الصفحة");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addUser() {
    if (!name.trim()) return setError("الاسم مطلوب"), undefined;
    if (!/^\d{4,8}$/.test(pin)) return setError("رقم الدخول 4–8 أرقام"), undefined;
    setBusy(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), role, pin }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(body?.error ?? "تعذر الحفظ"), undefined;
    setAddOpen(false);
    setName("");
    setPin("");
    await load();
    return undefined;
  }

  async function toggleActive(u: User) {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !u.active }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) setError(body?.error ?? "تعذر التحديث");
    else load();
  }

  async function resetPin() {
    if (!pinTarget) return;
    if (!/^\d{4,8}$/.test(pin)) return setError("رقم الدخول 4–8 أرقام"), undefined;
    setBusy(true);
    const res = await fetch(`/api/users/${pinTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(body?.error ?? "تعذر التحديث"), undefined;
    setPinTarget(null);
    setPin("");
    setError(null);
    return undefined;
  }

  if (myRole === null) {
    return error ? (
      <div className="card mx-auto max-w-md p-6 text-center text-sm font-bold text-terra">{error}</div>
    ) : (
      <div className="flex justify-center py-24 text-mocha">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (myRole !== "manager") {
    return (
      <div className="card mx-auto max-w-md p-8 text-center">
        <Users className="mx-auto mb-3 h-10 w-10 text-mocha/40" />
        <p className="font-black">إدارة المستخدمين متاحة للمدير فقط</p>
      </div>
    );
  }

  return (
    <div className="fade-up">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-black">المستخدمون</h1>
        <button
          onClick={() => {
            setError(null);
            setAddOpen(true);
          }}
          className="press flex items-center gap-1.5 rounded-xl bg-coffee px-3.5 py-2 text-sm font-extrabold text-goldsoft"
        >
          <Plus className="h-4 w-4" /> مستخدم
        </button>
      </div>

      {error ? (
        <p className="mb-3 rounded-xl bg-terrasoft px-3 py-2 text-sm font-bold text-terra">{error}</p>
      ) : null}

      <div className="space-y-2">
        {rows?.map((u) => (
          <div key={u.id} className={`card flex items-center justify-between gap-3 p-3.5 ${u.active ? "" : "opacity-55"}`}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cream text-mocha">
                <UserRound className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold">{u.name}</p>
                <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-extrabold ${ROLE_CLS[u.role]}`}>
                  {ROLE_LABEL[u.role]}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => {
                  setPin("");
                  setPinTarget(u);
                }}
                className="press rounded-lg bg-cream p-2 text-mocha"
                aria-label="إعادة تعيين رقم الدخول"
                title="إعادة تعيين رقم الدخول"
              >
                <KeyRound className="h-4 w-4" />
              </button>
              <button
                onClick={() => toggleActive(u)}
                className={`press relative h-7 w-12 rounded-full transition ${u.active ? "bg-leaf" : "bg-sand"}`}
                aria-label={u.active ? "تعطيل" : "تفعيل"}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${u.active ? "start-6" : "start-1"}`}
                />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="مستخدم جديد">
        <Field label="الاسم">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
        </Field>
        <Field label="الدور">
          <div className="grid grid-cols-3 gap-2">
            {(["manager", "cashier", "staff"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`press rounded-xl py-2.5 text-xs font-extrabold ${
                  role === r ? "bg-coffee text-goldsoft" : "bg-cream text-mocha ring-1 ring-coffee/10"
                }`}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] font-semibold text-mocha/70">
            المدير: كل الصلاحيات · الكاشير: طلبات وفواتير ومدفوعات وتقرير · الموظف: فتح طلبات فقط
          </p>
        </Field>
        <Field label="رقم الدخول PIN (4–8 أرقام)">
          <input
            className={inputCls}
            inputMode="numeric"
            dir="ltr"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="••••"
          />
        </Field>
        <button
          onClick={addUser}
          disabled={busy}
          className="press mt-1 w-full rounded-xl bg-coffee py-3 text-sm font-extrabold text-goldsoft disabled:opacity-50"
        >
          {busy ? "…" : "إضافة المستخدم"}
        </button>
      </Modal>

      <Modal open={pinTarget !== null} onClose={() => setPinTarget(null)} title={`رقم دخول جديد — ${pinTarget?.name ?? ""}`}>
        <Field label="PIN جديد (4–8 أرقام) — سيتم إنهاء جلساته الحالية">
          <input
            className={inputCls}
            inputMode="numeric"
            dir="ltr"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            placeholder="••••"
          />
        </Field>
        <button
          onClick={resetPin}
          disabled={busy}
          className="press mt-1 w-full rounded-xl bg-coffee py-3 text-sm font-extrabold text-goldsoft disabled:opacity-50"
        >
          {busy ? "…" : "تعيين الرقم"}
        </button>
      </Modal>
    </div>
  );
}
