"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpenText, Loader2, Pencil, Plus, Tag } from "lucide-react";
import Modal, { Field, inputCls } from "@/components/Modal";
import { formatMinor, parseToMinor } from "@/lib/money";

type Category = { id: number; name: string; active: boolean; sortOrder: number };
type Item = {
  id: number;
  categoryId: number;
  name: string;
  priceMinor: number;
  costMinor: number;
  active: boolean;
};

export default function MenuAdminPage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [activeCat, setActiveCat] = useState<number | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [catOpen, setCatOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [itemOpen, setItemOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [fName, setFName] = useState("");
  const [fPrice, setFPrice] = useState("");
  const [fCost, setFCost] = useState("");
  const [fCat, setFCat] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [mRes, meRes] = await Promise.all([fetch("/api/menu?all=1"), fetch("/api/auth/me")]);
    if (meRes.ok) setRole((await meRes.json()).user.role);
    if (mRes.ok) {
      const d = await mRes.json();
      setCats(d.categories);
      setItems(d.items);
      setActiveCat((c) => c ?? d.categories.find((x: Category) => x.active)?.id ?? d.categories[0]?.id ?? null);
    } else if (mRes.status === 401 || mRes.status === 403) {
      setError("ليست لديك صلاحية");
    } else {
      setError("تعذر تحميل القائمة — حدّث الصفحة");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addCategory() {
    if (!catName.trim()) return;
    setBusy(true);
    const res = await fetch("/api/menu/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: catName.trim() }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(body?.error ?? "تعذر الحفظ"), undefined;
    setCatOpen(false);
    setCatName("");
    await load();
    return undefined;
  }

  function openItemModal(item: Item | null) {
    setEditing(item);
    setFName(item?.name ?? "");
    setFPrice(item ? String(item.priceMinor / 100) : "");
    setFCost(item && item.costMinor ? String(item.costMinor / 100) : "");
    setFCat(item?.categoryId ?? activeCat ?? cats[0]?.id ?? 0);
    setItemOpen(true);
  }

  async function saveItem() {
    const price = parseToMinor(fPrice);
    const cost = fCost.trim() === "" ? 0 : parseToMinor(fCost);
    if (!fName.trim()) return setError("اسم الصنف مطلوب"), undefined;
    if (price === null) return setError("السعر غير صالح"), undefined;
    if (cost === null) return setError("التكلفة غير صالحة"), undefined;
    setBusy(true);
    const res = editing
      ? await fetch(`/api/menu/items/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fName.trim(), priceMinor: price, costMinor: cost, categoryId: fCat }),
        })
      : await fetch("/api/menu/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: fName.trim(), priceMinor: price, costMinor: cost, categoryId: fCat }),
        });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setError(body?.error ?? "تعذر الحفظ"), undefined;
    setItemOpen(false);
    await load();
    return undefined;
  }

  async function toggleItem(item: Item) {
    await fetch(`/api/menu/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !item.active }),
    });
    load();
  }

  if (role === null) {
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
        <BookOpenText className="mx-auto mb-3 h-10 w-10 text-mocha/40" />
        <p className="font-black">إدارة القائمة متاحة للمدير فقط</p>
      </div>
    );
  }

  const visible = items.filter((i) => i.categoryId === activeCat);

  return (
    <div className="fade-up">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-black">إدارة القائمة</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setCatOpen(true)}
            className="press flex items-center gap-1.5 rounded-xl bg-paper px-3 py-2 text-xs font-extrabold text-mocha ring-1 ring-coffee/15"
          >
            <Tag className="h-4 w-4" /> تصنيف
          </button>
          <button
            onClick={() => openItemModal(null)}
            className="press flex items-center gap-1.5 rounded-xl bg-coffee px-3 py-2 text-xs font-extrabold text-goldsoft"
          >
            <Plus className="h-4 w-4" /> صنف
          </button>
        </div>
      </div>

      {error ? (
        <p className="mb-3 rounded-xl bg-terrasoft px-3 py-2 text-sm font-bold text-terra">{error}</p>
      ) : null}

      <div className="slim-scroll mb-3 flex gap-2 overflow-x-auto pb-1">
        {cats.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCat(c.id)}
            className={`press shrink-0 rounded-full px-4 py-2 text-sm font-extrabold ${
              activeCat === c.id
                ? "bg-coffee text-goldsoft"
                : `bg-paper text-mocha ring-1 ring-coffee/10 ${c.active ? "" : "opacity-50 line-through"}`
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {visible.map((it) => (
          <div key={it.id} className={`card flex items-center justify-between gap-3 p-3.5 ${it.active ? "" : "opacity-55"}`}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold">{it.name}</p>
              <p className="mt-0.5 text-[11px] font-bold text-mocha">
                سعر {formatMinor(it.priceMinor)} · تكلفة {formatMinor(it.costMinor)} · مجمل ربح{" "}
                {formatMinor(it.priceMinor - it.costMinor)}
              </p>
            </div>
            <button
              onClick={() => toggleItem(it)}
              className={`press relative h-7 w-12 shrink-0 rounded-full transition ${it.active ? "bg-leaf" : "bg-sand"}`}
              aria-label={it.active ? "إيقاف الصنف" : "تفعيل الصنف"}
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  it.active ? "start-6" : "start-1"
                }`}
              />
            </button>
            <button
              onClick={() => openItemModal(it)}
              className="press shrink-0 rounded-lg bg-cream p-2 text-mocha"
              aria-label="تعديل"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        ))}
        {visible.length === 0 ? (
          <p className="card py-10 text-center text-sm font-bold text-mocha">لا توجد أصناف في هذا التصنيف</p>
        ) : null}
      </div>

      <Modal open={catOpen} onClose={() => setCatOpen(false)} title="تصنيف جديد">
        <Field label="اسم التصنيف">
          <input
            className={inputCls}
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
            maxLength={40}
            placeholder="مثال: فطور، إضافات"
          />
        </Field>
        <button
          onClick={addCategory}
          disabled={busy}
          className="press mt-1 w-full rounded-xl bg-coffee py-3 text-sm font-extrabold text-goldsoft disabled:opacity-50"
        >
          إضافة التصنيف
        </button>
      </Modal>

      <Modal open={itemOpen} onClose={() => setItemOpen(false)} title={editing ? `تعديل: ${editing.name}` : "صنف جديد"}>
        <Field label="اسم الصنف">
          <input className={inputCls} value={fName} onChange={(e) => setFName(e.target.value)} maxLength={60} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="سعر البيع (₪)">
            <input
              className={inputCls}
              inputMode="decimal"
              dir="ltr"
              value={fPrice}
              onChange={(e) => setFPrice(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="التكلفة (₪)">
            <input
              className={inputCls}
              inputMode="decimal"
              dir="ltr"
              value={fCost}
              onChange={(e) => setFCost(e.target.value)}
              placeholder="0.00"
            />
          </Field>
        </div>
        <Field label="التصنيف">
          <select className={inputCls} value={fCat} onChange={(e) => setFCat(Number(e.target.value))}>
            {cats
              .filter((c) => c.active || c.id === editing?.categoryId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
        <button
          onClick={saveItem}
          disabled={busy}
          className="press mt-1 w-full rounded-xl bg-coffee py-3 text-sm font-extrabold text-goldsoft disabled:opacity-50"
        >
          {busy ? "…" : editing ? "حفظ التعديلات" : "إضافة الصنف"}
        </button>
      </Modal>
    </div>
  );
}
