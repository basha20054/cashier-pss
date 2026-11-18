"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { go } from "@/lib/nav";
import { Armchair, Loader2, Pencil, Plus, UtensilsCrossed } from "lucide-react";
import Modal, { Field, inputCls } from "@/components/Modal";
import { formatMinor } from "@/lib/money";
import { fmtTime } from "@/lib/time";

type TableRow = {
  id: number;
  name: string;
  orderId: number | null;
  orderStatus: "open" | "sent" | null;
  openedAt: string | null;
  subtotal: number;
  itemCount: number;
};

type Me = { role: "manager" | "cashier" | "staff" };

export default function TablesPage() {
  const [tables, setTables] = useState<TableRow[] | null>(null);
  const [now, setNow] = useState(0);
  const [me, setMe] = useState<Me | null>(null);
  const [busyTable, setBusyTable] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const clientKeyRef = useRef<string | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      const [tRes, mRes] = await Promise.all([
        fetch("/api/tables"),
        fetch("/api/auth/me"),
      ]);
      let loadErr: string | null = null;
      if (tRes.ok) setTables((await tRes.json()).tables);
      else {
        setTables([]);
        loadErr =
          tRes.status === 401
            ? "تعذر تحميل الطاولات (401 — الجلسة غير معروفة للخادم)"
            : `تعذر تحميل الطاولات (HTTP ${tRes.status})`;
      }
      if (mRes.ok) setMe((await mRes.json()).user);
      setNow(Date.now());
      if (!silent) setError(loadErr);
    } catch {
      if (!silent) setError("تعذر تحميل الطاولات");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 15000);
    return () => clearInterval(t);
  }, [load]);

  async function openTable(t: TableRow) {
    if (busyTable) return;
    if (t.orderId) {
      go(`/orders/${t.orderId}`);
      return;
    }
    setBusyTable(t.id);
    setError(null);
    try {
      // مفتاح واحد لكل محاولة نقرة — إعادة الإرسال لا تكرر الطلب
      if (!clientKeyRef.current) clientKeyRef.current = crypto.randomUUID();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId: t.id, clientKey: clientKeyRef.current }),
      });
      const data = await res.json();
      if (res.ok && data.order) {
        clientKeyRef.current = null;
        go(`/orders/${data.order.id}`);
        return;
      }
      if (res.status === 409 && data.activeOrderId) {
        clientKeyRef.current = null;
        go(`/orders/${data.activeOrderId}`);
        return;
      }
      setError(data.error ?? "تعذر فتح الطاولة");
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setBusyTable(null);
    }
  }

  async function addTable() {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch("/api/tables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "تعذر إضافة الطاولة");
      return;
    }
    setAddOpen(false);
    setNewName("");
    load();
  }

  const freeCount = tables?.filter((t) => !t.orderId).length ?? 0;

  return (
    <div className="fade-up">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">الطاولات</h1>
          <p className="text-xs font-bold text-mocha">
            {tables ? `${freeCount} متاحة من ${tables.length}` : "…"}
          </p>
        </div>
        {me?.role === "manager" ? (
          <button
            onClick={() => setAddOpen(true)}
            className="press flex items-center gap-1.5 rounded-xl bg-coffee px-3.5 py-2 text-sm font-extrabold text-goldsoft"
          >
            <Plus className="h-4 w-4" /> طاولة
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mb-3 rounded-xl bg-terrasoft px-3 py-2 text-sm font-bold text-terra">{error}</p>
      ) : null}

      {!tables ? (
        <div className="flex justify-center py-20 text-mocha">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tables.map((t) => (
            <TableCard key={t.id} t={t} busy={busyTable === t.id} now={now} onOpen={() => openTable(t)} />
          ))}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="إضافة طاولة جديدة">
        <Field label="اسم الطاولة">
          <input
            className={inputCls}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="مثال: طاولة 9 أو جلسة خارجية"
            maxLength={40}
          />
        </Field>
        <button
          onClick={addTable}
          className="press mt-2 w-full rounded-xl bg-coffee py-3 text-sm font-extrabold text-goldsoft"
        >
          إضافة
        </button>
      </Modal>
    </div>
  );
}

function TableCard({ t, busy, now, onOpen }: { t: TableRow; busy: boolean; now: number; onOpen: () => void }) {
  const occupied = t.orderId !== null;
  const sent = t.orderStatus === "sent";
  // now من حالة الأم — لا نستخدم Date.now داخل التصيير (نقاء مكوّنات React)
  const mins =
    now > 0 && t.openedAt
      ? Math.max(0, Math.round((now - new Date(t.openedAt).getTime()) / 60000))
      : null;

  return (
    <button
      onClick={onOpen}
      disabled={busy}
      className={`press card relative overflow-hidden p-4 text-start ${
        occupied ? "border-terra/25" : "border-leaf/20"
      }`}
    >
      <span
        className={`absolute inset-y-0 start-0 w-1.5 ${
          occupied ? (sent ? "bg-amber" : "bg-terra") : "bg-leaf"
        }`}
      />
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            occupied ? "bg-terrasoft text-terra" : "bg-leafsoft text-leaf"
          }`}
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Armchair className="h-5 w-5" />}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
            occupied
              ? sent
                ? "bg-ambersoft text-amber"
                : "bg-terrasoft text-terra"
              : "bg-leafsoft text-leaf"
          }`}
        >
          {occupied ? (sent ? "أُرسل للمطبخ" : "مشغولة") : "متاحة"}
        </span>
      </div>
      <p className="text-base font-black">{t.name}</p>
      {occupied ? (
        <div className="mt-1 flex items-end justify-between">
          <span className="text-lg font-black text-terra">{formatMinor(t.subtotal)}</span>
          <span className="flex items-center gap-1 text-[11px] font-bold text-mocha">
            <UtensilsCrossed className="h-3 w-3" />
            {t.itemCount} صنف · {fmtTime(t.openedAt!)}{mins !== null ? ` · ${mins} د` : ""}
          </span>
        </div>
      ) : (
        <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-mocha/70">
          <Pencil className="h-3 w-3 opacity-0" />
          اضغط لفتح طلب
        </p>
      )}
    </button>
  );
}
