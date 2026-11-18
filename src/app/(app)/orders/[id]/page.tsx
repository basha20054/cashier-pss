"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { go } from "@/lib/nav";
import {
  ArrowRight,
  BadgePercent,
  ChefHat,
  Loader2,
  Minus,
  Plus,
  ReceiptText,
  StickyNote,
  Trash2,
} from "lucide-react";
import Modal, { Field, inputCls } from "@/components/Modal";
import { formatMinor, parseToMinor } from "@/lib/money";

type OrderItem = {
  id: number;
  menuItemId: number | null;
  name: string;
  priceMinor: number;
  quantity: number;
  notes: string;
};
type Category = { id: number; name: string };
type MenuItem = { id: number; categoryId: number; name: string; priceMinor: number };
type OrderData = {
  order: { id: number; status: "open" | "sent" | "closed"; discountMinor: number; openedAt: string };
  items: OrderItem[];
  tableName: string;
  subtotal: number;
  taxBps: number;
};

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const orderId = Number(id);

  const [data, setData] = useState<OrderData | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [activeCat, setActiveCat] = useState<number | null>(null);
  const [view, setView] = useState<"menu" | "cart">("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [noteItem, setNoteItem] = useState<OrderItem | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [popId, setPopId] = useState<number | null>(null);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    const [oRes, mRes] = await Promise.all([fetch(`/api/orders/${orderId}`), fetch("/api/menu")]);
    if (oRes.ok) setData(await oRes.json());
    else if (oRes.status === 404) setError("الطلب غير موجود");
    else setError("تعذر تحميل الطلب — حدّث الصفحة");
    if (mRes.ok) {
      const m = await mRes.json();
      setCats(m.categories);
      setMenu(m.items);
      setActiveCat((c) => c ?? m.categories[0]?.id ?? null);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const subtotal = data?.subtotal ?? 0;
  const discount = data?.order.discountMinor ?? 0;
  const taxMinor = Math.round(((subtotal - discount) * (data?.taxBps ?? 0)) / 10000);
  const total = subtotal - discount + taxMinor;
  const closed = data?.order.status === "closed";

  const visibleItems = useMemo(
    () => menu.filter((m) => m.categoryId === activeCat),
    [menu, activeCat],
  );

  async function api(fn: () => Promise<Response>) {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fn();
      const body = await res.json().catch(() => null);
      if (!res.ok) setError(body?.error ?? "حدث خطأ");
      else setError(null);
      return { res, body };
    } catch {
      setError("تعذر الاتصال بالخادم");
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function addItem(mi: MenuItem) {
    if (closed) return;
    setPopId(mi.id);
    setTimeout(() => setPopId(null), 350);
    const existing = data?.items.find((it) => it.menuItemId === mi.id && it.notes === "");
    const r = await api(() =>
      existing
        ? fetch(`/api/orders/${orderId}/items/${existing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quantity: existing.quantity + 1 }),
          })
        : fetch(`/api/orders/${orderId}/items`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ menuItemId: mi.id, quantity: 1 }),
          }),
    );
    if (r?.res.ok) await load();
  }

  async function setQty(item: OrderItem, q: number) {
    const r = await api(() =>
      q <= 0
        ? fetch(`/api/orders/${orderId}/items/${item.id}`, { method: "DELETE" })
        : fetch(`/api/orders/${orderId}/items/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quantity: q }),
          }),
    );
    if (r?.res.ok) await load();
  }

  async function saveNote() {
    if (!noteItem) return;
    const r = await api(() =>
      fetch(`/api/orders/${orderId}/items/${noteItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: noteInput }),
      }),
    );
    if (r?.res.ok) {
      setNoteItem(null);
      await load();
    }
  }

  async function saveDiscount() {
    const minor = discountInput.trim() === "" ? 0 : parseToMinor(discountInput);
    if (minor === null) {
      setError("قيمة الخصم غير صالحة");
      return;
    }
    const r = await api(() =>
      fetch(`/api/orders/${orderId}/discount`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discountMinor: minor }),
      }),
    );
    if (r?.res.ok) {
      setDiscountOpen(false);
      await load();
    }
  }

  async function sendToKitchen() {
    const r = await api(() => fetch(`/api/orders/${orderId}/send`, { method: "POST" }));
    if (r?.res.ok) await load();
  }

  async function closeOrder() {
    const r = await api(() => fetch(`/api/orders/${orderId}/close`, { method: "POST" }));
    if (r?.res.ok && r.body?.invoice) {
      go(`/invoices/${r.body.invoice.id}`);
    }
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center gap-3 py-24">
        {error ? (
          <p className="rounded-xl bg-terrasoft px-4 py-3 text-sm font-bold text-terra">{error}</p>
        ) : null}
        <div className="flex text-mocha">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  const count = data.items.reduce((s, it) => s + it.quantity, 0);

  const menuPanel = (
    <section className={view === "cart" ? "hidden md:block" : ""}>
      <div className="slim-scroll -mx-3 mb-3 flex gap-2 overflow-x-auto px-3 pb-1">
        {cats.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCat(c.id)}
            className={`press shrink-0 rounded-full px-4 py-2 text-sm font-extrabold ${
              activeCat === c.id ? "bg-coffee text-goldsoft" : "bg-paper text-mocha ring-1 ring-coffee/10"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {visibleItems.map((mi) => (
          <button
            key={mi.id}
            onClick={() => addItem(mi)}
            disabled={closed}
            className={`press card p-3 text-start ${popId === mi.id ? "pop" : ""} ${
              closed ? "opacity-50" : ""
            }`}
          >
            <p className="min-h-10 text-sm font-extrabold leading-5">{mi.name}</p>
            <p className="mt-1 text-sm font-black text-golddeep">{formatMinor(mi.priceMinor)}</p>
          </button>
        ))}
        {visibleItems.length === 0 ? (
          <p className="col-span-full rounded-xl bg-paper p-6 text-center text-sm font-bold text-mocha">
            لا توجد أصناف في هذا التصنيف
          </p>
        ) : null}
      </div>
    </section>
  );

  const cartPanel = (
    <section className={`card flex flex-col p-3 ${view === "menu" ? "hidden md:flex" : ""}`}>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-base font-black">الطلب الحالي</h2>
        <span className="rounded-full bg-goldsoft px-2.5 py-0.5 text-xs font-black text-golddeep">
          {count} صنف
        </span>
      </div>

      {error ? (
        <p className="mb-2 rounded-xl bg-terrasoft px-3 py-2 text-xs font-bold text-terra">{error}</p>
      ) : null}

      <div className="slim-scroll max-h-[42dvh] min-h-24 flex-1 space-y-2 overflow-y-auto md:max-h-[46dvh]">
        {data.items.length === 0 ? (
          <p className="py-8 text-center text-sm font-bold text-mocha/70">
            الطلب فارغ — اختر أصنافاً من القائمة
          </p>
        ) : (
          data.items.map((it) => (
            <div key={it.id} className="rounded-xl bg-cream/70 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold">{it.name}</p>
                  <p className="text-[11px] font-bold text-mocha">{formatMinor(it.priceMinor)}</p>
                </div>
                <div className="flex items-center gap-1.5" dir="ltr">
                  <button
                    onClick={() => setQty(it, it.quantity - 1)}
                    disabled={closed || busy}
                    className="press flex h-8 w-8 items-center justify-center rounded-lg bg-paper text-mocha ring-1 ring-coffee/10 disabled:opacity-40"
                    aria-label="إنقاص"
                  >
                    {it.quantity === 1 ? <Trash2 className="h-4 w-4 text-terra" /> : <Minus className="h-4 w-4" />}
                  </button>
                  <span className="w-7 text-center text-base font-black">{it.quantity}</span>
                  <button
                    onClick={() => setQty(it, it.quantity + 1)}
                    disabled={closed || busy}
                    className="press flex h-8 w-8 items-center justify-center rounded-lg bg-paper text-mocha ring-1 ring-coffee/10 disabled:opacity-40"
                    aria-label="زيادة"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <span className="w-16 text-end text-sm font-black">
                  {formatMinor(it.priceMinor * it.quantity)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <button
                  onClick={() => {
                    setNoteItem(it);
                    setNoteInput(it.notes);
                  }}
                  disabled={closed}
                  className="flex items-center gap-1 text-[11px] font-bold text-mocha/80 disabled:opacity-40"
                >
                  <StickyNote className="h-3.5 w-3.5" />
                  {it.notes ? it.notes : "إضافة ملاحظة"}
                </button>
                {it.notes ? null : null}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-3 space-y-1.5 border-t border-coffee/10 pt-3 text-sm">
        <Row label="المجموع" value={formatMinor(subtotal)} />
        <button
          onClick={() => {
            setDiscountInput(discount ? String(discount / 100) : "");
            setDiscountOpen(true);
          }}
          disabled={closed || data.items.length === 0}
          className="flex w-full items-center justify-between rounded-lg px-1 py-0.5 text-start enabled:hover:bg-cream disabled:opacity-60"
        >
          <span className="flex items-center gap-1 font-bold text-mocha">
            <BadgePercent className="h-4 w-4" /> الخصم
          </span>
          <span className={`font-extrabold ${discount ? "text-terra" : "text-golddeep"}`}>
            {discount ? `-${formatMinor(discount)}` : "إضافة خصم"}
          </span>
        </button>
        <Row
          label={`الضريبة (${((data.taxBps ?? 0) / 100).toFixed(0)}%)`}
          value={formatMinor(taxMinor)}
        />
        <div className="flex items-center justify-between rounded-xl bg-coffee px-3 py-2.5 text-goldsoft">
          <span className="font-black">الإجمالي</span>
          <span className="text-lg font-black">{formatMinor(total)}</span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={sendToKitchen}
          disabled={busy || closed || data.items.length === 0 || data.order.status === "sent"}
          className="press flex items-center justify-center gap-2 rounded-xl bg-ambersoft py-3 text-sm font-extrabold text-amber disabled:opacity-40"
        >
          <ChefHat className="h-4 w-4" />
          {data.order.status === "sent" ? "أُرسل للمطبخ" : "إرسال للمطبخ"}
        </button>
        <button
          onClick={() => setCloseOpen(true)}
          disabled={busy || closed || data.items.length === 0}
          className="press flex items-center justify-center gap-2 rounded-xl bg-coffee py-3 text-sm font-extrabold text-goldsoft disabled:opacity-40"
        >
          <ReceiptText className="h-4 w-4" />
          إغلاق وفاتورة
        </button>
      </div>
      {closed ? (
        <p className="mt-2 rounded-xl bg-sand px-3 py-2 text-center text-xs font-bold text-mocha">
          هذا الطلب مغلق وأُصدرت فاتورته
        </p>
      ) : null}
      {!closed && data.items.length === 0 ? (
        <button
          onClick={async () => {
            if (!confirm("إلغاء هذا الطلب الفارغ وتحرير الطاولة؟")) return;
            const r = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
            if (r.ok) go("/tables");
            else setError((await r.json().catch(() => null))?.error ?? "تعذر الإلغاء");
          }}
          disabled={busy}
          className="press mt-2 w-full rounded-xl bg-terrasoft py-2.5 text-xs font-extrabold text-terra disabled:opacity-50"
        >
          إلغاء الطلب الفارغ وتحرير الطاولة
        </button>
      ) : null}
    </section>
  );

  return (
    <div className="fade-up">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => go("/tables")}
            className="press rounded-xl bg-paper p-2 text-mocha ring-1 ring-coffee/10"
            aria-label="عودة"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-black">{data.tableName}</h1>
            <p className="text-[11px] font-bold text-mocha">طلب #{data.order.id}</p>
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${
            closed
              ? "bg-sand text-mocha"
              : data.order.status === "sent"
                ? "bg-ambersoft text-amber"
                : "bg-leafsoft text-leaf"
          }`}
        >
          {closed ? "مغلق" : data.order.status === "sent" ? "أُرسل للمطبخ" : "طلب مفتوح"}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.15fr_1fr]">
        {menuPanel}
        {cartPanel}
      </div>

      {/* شريط سفلي للجوال للتبديل بين القائمة والطلب */}
      <div className="fixed inset-x-0 bottom-16 z-20 px-4 md:hidden">
        <button
          onClick={() => setView(view === "menu" ? "cart" : "menu")}
          className="press mx-auto flex w-full max-w-md items-center justify-between rounded-2xl bg-ink px-4 py-3 text-cream shadow-xl"
        >
          <span className="text-sm font-extrabold">
            {view === "menu" ? `عرض الطلب · ${count} صنف` : "متابعة الاختيار من القائمة"}
          </span>
          <span className="text-base font-black text-goldsoft">{formatMinor(total)}</span>
        </button>
      </div>

      <Modal open={discountOpen} onClose={() => setDiscountOpen(false)} title="خصم على الطلب">
        <Field label="قيمة الخصم بالشيكل (0 لإزالة الخصم)">
          <input
            className={inputCls}
            inputMode="decimal"
            dir="ltr"
            value={discountInput}
            onChange={(e) => setDiscountInput(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <button
          onClick={saveDiscount}
          disabled={busy}
          className="press mt-1 w-full rounded-xl bg-coffee py-3 text-sm font-extrabold text-goldsoft disabled:opacity-50"
        >
          حفظ الخصم
        </button>
      </Modal>

      <Modal
        open={noteItem !== null}
        onClose={() => setNoteItem(null)}
        title={noteItem ? `ملاحظة: ${noteItem.name}` : "ملاحظة"}
      >
        <Field label="ملاحظة للمطبخ (بدون سكر، إكسترا… )">
          <input
            className={inputCls}
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            maxLength={120}
            placeholder="اكتب الملاحظة هنا"
          />
        </Field>
        <button
          onClick={saveNote}
          disabled={busy}
          className="press mt-1 w-full rounded-xl bg-coffee py-3 text-sm font-extrabold text-goldsoft disabled:opacity-50"
        >
          حفظ الملاحظة
        </button>
      </Modal>

      <Modal open={closeOpen} onClose={() => setCloseOpen(false)} title="إغلاق الطلب وإصدار فاتورة">
        <p className="mb-3 text-sm font-bold text-mocha">
          سيتم إصدار فاتورة برقم متسلسل وتحرير الطاولة. يمكن بعدها تسجيل الدفع كاملاً أو على دفعات.
        </p>
        <div className="mb-4 space-y-1.5 rounded-2xl bg-cream p-4 text-sm">
          <Row label="المجموع" value={formatMinor(subtotal)} />
          <Row label="الخصم" value={`-${formatMinor(discount)}`} />
          <Row label="الضريبة" value={formatMinor(taxMinor)} />
          <div className="mt-1 flex items-center justify-between border-t border-coffee/10 pt-2">
            <span className="font-black">الإجمالي المستحق</span>
            <span className="text-lg font-black text-golddeep">{formatMinor(total)}</span>
          </div>
        </div>
        <button
          onClick={closeOrder}
          disabled={busy}
          className="press flex w-full items-center justify-center gap-2 rounded-xl bg-coffee py-3 text-sm font-extrabold text-goldsoft disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
          تأكيد الإغلاق وإصدار الفاتورة
        </button>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-bold text-mocha">{label}</span>
      <span className="font-extrabold">{value}</span>
    </div>
  );
}
