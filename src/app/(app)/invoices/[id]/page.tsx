"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { go } from "@/lib/nav";
import {
  ArrowRight,
  Banknote,
  CreditCard,
  Loader2,
  Printer,
  RotateCcw,
  Smartphone,
} from "lucide-react";
import Modal, { Field, inputCls } from "@/components/Modal";
import { formatMinor, parseToMinor } from "@/lib/money";
import { fmtDateTime, fmtTime } from "@/lib/time";
import { STATUS_CLS, STATUS_LABEL } from "../page";

type Detail = {
  invoice: {
    id: number;
    number: number;
    tableName: string;
    status: string;
    subtotalMinor: number;
    discountMinor: number;
    taxBps: number;
    taxMinor: number;
    totalMinor: number;
    createdAt: string;
  };
  items: { id: number; name: string; priceMinor: number; quantity: number; totalMinor: number }[];
  payments: { id: number; amountMinor: number; method: string; createdAt: string; receivedByName: string | null }[];
  refunds: { id: number; amountMinor: number; reason: string; createdAt: string; approvedByName: string | null }[];
  paid: number;
  refunded: number;
  remaining: number;
  cashierName: string | null;
};

const METHODS = [
  { v: "cash", label: "نقدي", icon: Banknote },
  { v: "card", label: "بطاقة", icon: CreditCard },
  { v: "electronic", label: "إلكتروني", icon: Smartphone },
] as const;

export const METHOD_LABEL: Record<string, string> = {
  cash: "نقدي",
  card: "بطاقة",
  electronic: "إلكتروني",
};

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const invoiceId = Number(id);

  const [d, setD] = useState<Detail | null>(null);
  const [role, setRole] = useState<string>("staff");
  const [method, setMethod] = useState<string>("cash");
  const [amountInput, setAmountInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  // مفتاح منع تكرار لكل عملية دفع/استرداد — يتجدد فقط بعد نجاح العملية
  const payKey = useRef(crypto.randomUUID());
  const refundKey = useRef(crypto.randomUUID());

  const load = useCallback(async () => {
    const [iRes, mRes] = await Promise.all([fetch(`/api/invoices/${invoiceId}`), fetch("/api/auth/me")]);
    if (iRes.ok) setD(await iRes.json());
    else setError("تعذر تحميل الفاتورة");
    if (mRes.ok) setRole((await mRes.json()).user.role);
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  async function pay(amountMinor: number) {
    if (busy || amountMinor <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMinor, method, idempotencyKey: payKey.current }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "تعذر تسجيل الدفعة");
        return;
      }
      payKey.current = crypto.randomUUID(); // مفتاح جديد للدفعة القادمة
      setAmountInput("");
      await load();
    } catch {
      setError("تعذر الاتصال بالخادم — الدفعة محمية من التكرار، أعد المحاولة بنفس المبلغ");
    } finally {
      setBusy(false);
    }
  }

  async function doRefund() {
    const amount = parseToMinor(refundAmount);
    if (amount === null || amount <= 0) {
      setError("مبلغ الاسترداد غير صالح");
      return;
    }
    if (refundReason.trim().length < 3) {
      setError("سبب الاسترداد إلزامي");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/refunds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountMinor: amount,
          reason: refundReason.trim(),
          idempotencyKey: refundKey.current,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "تعذر تنفيذ الاسترداد");
        return;
      }
      refundKey.current = crypto.randomUUID();
      setRefundOpen(false);
      setRefundAmount("");
      setRefundReason("");
      await load();
    } catch {
      setError("تعذر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  if (!d) {
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

  const inv = d.invoice;
  const canCollect = (role === "manager" || role === "cashier") && d.remaining > 0;
  const netPaid = d.paid - d.refunded;

  return (
    <div className="fade-up mx-auto max-w-2xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => go("/invoices")}
            className="press rounded-xl bg-paper p-2 text-mocha ring-1 ring-coffee/10"
            aria-label="عودة"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-black">فاتورة #{inv.number}</h1>
            <p className="text-[11px] font-bold text-mocha">
              {inv.tableName} · {fmtDateTime(inv.createdAt)}
              {d.cashierName ? ` · ${d.cashierName}` : ""}
            </p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-extrabold ${STATUS_CLS[inv.status]}`}>
          {STATUS_LABEL[inv.status]}
        </span>
      </div>

      {error ? (
        <p className="mb-3 rounded-xl bg-terrasoft px-3 py-2 text-sm font-bold text-terra">{error}</p>
      ) : null}

      {/* البنود */}
      <div className="card mb-3 p-4">
        <h2 className="mb-2 text-sm font-black text-mocha">البنود</h2>
        <div className="divide-y divide-coffee/8">
          {d.items.map((it) => (
            <div key={it.id} className="flex items-center justify-between py-2 text-sm">
              <span className="font-bold">
                {it.name}
                <span className="ms-2 text-xs text-mocha">
                  {it.quantity} × {formatMinor(it.priceMinor)}
                </span>
              </span>
              <span className="font-extrabold">{formatMinor(it.totalMinor)}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 space-y-1 border-t border-coffee/10 pt-3 text-sm">
          <Sum label="المجموع" value={formatMinor(inv.subtotalMinor)} />
          {inv.discountMinor > 0 ? <Sum label="الخصم" value={`-${formatMinor(inv.discountMinor)}`} /> : null}
          {inv.taxMinor > 0 ? (
            <Sum label={`الضريبة (${(inv.taxBps / 100).toFixed(0)}%)`} value={formatMinor(inv.taxMinor)} />
          ) : null}
          <div className="flex items-center justify-between pt-1">
            <span className="text-base font-black">الإجمالي</span>
            <span className="text-lg font-black text-golddeep">{formatMinor(inv.totalMinor)}</span>
          </div>
          <Sum label="المدفوع" value={formatMinor(netPaid)} strong />
          {d.refunded > 0 ? <Sum label="المسترد" value={`-${formatMinor(d.refunded)}`} /> : null}
          <div className="flex items-center justify-between rounded-xl bg-coffee px-3 py-2 text-goldsoft">
            <span className="font-black">المتبقي</span>
            <span className="font-black">{formatMinor(d.remaining)}</span>
          </div>
        </div>
      </div>

      {/* سجل المدفوعات */}
      {d.payments.length > 0 ? (
        <div className="card mb-3 p-4">
          <h2 className="mb-2 text-sm font-black text-mocha">المدفوعات</h2>
          <div className="space-y-1.5">
            {d.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-cream/70 px-3 py-2 text-sm">
                <span className="font-bold">
                  {METHOD_LABEL[p.method]}
                  <span className="ms-2 text-[11px] text-mocha">
                    {fmtTime(p.createdAt)} · {p.receivedByName ?? "—"}
                  </span>
                </span>
                <span className="font-extrabold text-leaf">{formatMinor(p.amountMinor)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* الاستردادات */}
      {d.refunds.length > 0 ? (
        <div className="card mb-3 border-terra/20 p-4">
          <h2 className="mb-2 text-sm font-black text-terra">الاستردادات</h2>
          <div className="space-y-1.5">
            {d.refunds.map((r) => (
              <div key={r.id} className="rounded-lg bg-terrasoft px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-mocha">
                    {fmtTime(r.createdAt)} · {r.approvedByName ?? "—"}
                  </span>
                  <span className="font-extrabold text-terra">-{formatMinor(r.amountMinor)}</span>
                </div>
                <p className="mt-0.5 text-xs font-bold text-mocha">السبب: {r.reason}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* تحصيل دفعة */}
      {canCollect ? (
        <div className="card mb-3 p-4">
          <h2 className="mb-3 text-sm font-black text-mocha">تسجيل دفعة</h2>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.v}
                onClick={() => setMethod(m.v)}
                className={`press flex flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-extrabold ${
                  method === m.v ? "bg-coffee text-goldsoft" : "bg-cream text-mocha ring-1 ring-coffee/10"
                }`}
              >
                <m.icon className="h-5 w-5" />
                {m.label}
              </button>
            ))}
          </div>
          <div className="mb-3 grid grid-cols-4 gap-2">
            <button
              onClick={() => pay(d.remaining)}
              disabled={busy}
              className="press col-span-2 rounded-xl bg-goldsoft py-2.5 text-xs font-black text-golddeep disabled:opacity-50"
            >
              المتبقي بالضبط · {formatMinor(d.remaining)}
            </button>
            {[2000, 5000].map((v) => (
              <button
                key={v}
                onClick={() => pay(v)}
                disabled={busy || v > d.remaining}
                className="press rounded-xl bg-cream py-2.5 text-xs font-black text-mocha ring-1 ring-coffee/10 disabled:opacity-40"
              >
                {v / 100} ₪
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className={inputCls}
              inputMode="decimal"
              dir="ltr"
              placeholder="مبلغ مخصص"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
            />
            <button
              onClick={() => {
                const m = parseToMinor(amountInput);
                if (m === null || m <= 0) setError("أدخل مبلغاً صالحاً");
                else pay(m);
              }}
              disabled={busy}
              className="press shrink-0 rounded-xl bg-coffee px-5 text-sm font-extrabold text-goldsoft disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "قبض"}
            </button>
          </div>
        </div>
      ) : null}

      {/* إجراءات */}
      <div className="flex gap-2">
        <button
          onClick={() => window.print()}
          className="press flex flex-1 items-center justify-center gap-2 rounded-xl bg-paper py-3 text-sm font-extrabold text-mocha ring-1 ring-coffee/15"
        >
          <Printer className="h-4 w-4" /> طباعة إيصال
        </button>
        {role === "manager" && netPaid > 0 ? (
          <button
            onClick={() => setRefundOpen(true)}
            className="press flex flex-1 items-center justify-center gap-2 rounded-xl bg-terrasoft py-3 text-sm font-extrabold text-terra"
          >
            <RotateCcw className="h-4 w-4" /> استرداد
          </button>
        ) : null}
      </div>

      {/* نافذة الاسترداد — للمدير */}
      <Modal open={refundOpen} onClose={() => setRefundOpen(false)} title="استرداد مبلغ (مدير)">
        <div className="mb-3 rounded-xl bg-cream px-3 py-2 text-xs font-bold text-mocha">
          صافي المدفوع القابل للاسترداد: <span className="font-black text-ink">{formatMinor(netPaid)}</span>
        </div>
        <Field label={`مبلغ الاسترداد بالشيكل (حتى ${formatMinor(netPaid)})`}>
          <input
            className={inputCls}
            inputMode="decimal"
            dir="ltr"
            value={refundAmount}
            onChange={(e) => setRefundAmount(e.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="سبب الاسترداد (إلزامي)">
          <textarea
            className={`${inputCls} min-h-20 resize-none`}
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
            maxLength={200}
            placeholder="مثال: خطأ في إدخال الطلب، اعتراض الزبون…"
          />
        </Field>
        <button
          onClick={doRefund}
          disabled={busy || refundReason.trim().length < 3}
          className="press mt-1 w-full rounded-xl bg-terra py-3 text-sm font-extrabold text-white disabled:opacity-50"
        >
          {busy ? "…" : "تنفيذ الاسترداد"}
        </button>
      </Modal>

      {/* إيصال الطباعة — يظهر فقط عند الطباعة */}
      <div id="receipt-print" className="hidden print:block" dir="rtl">
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <p style={{ fontWeight: 900, fontSize: 16, margin: 0 }}>Lord Cafe</p>
          <p style={{ fontSize: 11, margin: 0 }}>فاتورة #{inv.number} — {inv.tableName}</p>
          <p style={{ fontSize: 11, margin: 0 }}>{fmtDateTime(inv.createdAt)}</p>
        </div>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <tbody>
            {d.items.map((it) => (
              <tr key={it.id}>
                <td>{it.name} × {it.quantity}</td>
                <td style={{ textAlign: "left" }}>{formatMinor(it.totalMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ borderTop: "1px dashed #000", marginTop: 6, paddingTop: 6, fontSize: 12 }}>
          <p style={{ margin: 0 }}>المجموع: {formatMinor(inv.subtotalMinor)}</p>
          {inv.discountMinor > 0 ? <p style={{ margin: 0 }}>الخصم: -{formatMinor(inv.discountMinor)}</p> : null}
          {inv.taxMinor > 0 ? <p style={{ margin: 0 }}>الضريبة: {formatMinor(inv.taxMinor)}</p> : null}
          <p style={{ margin: 0, fontWeight: 900 }}>الإجمالي: {formatMinor(inv.totalMinor)}</p>
          <p style={{ margin: 0 }}>المدفوع: {formatMinor(netPaid)} — المتبقي: {formatMinor(d.remaining)}</p>
          <p style={{ margin: "6px 0 0", textAlign: "center" }}>شكراً لزيارتكم</p>
        </div>
      </div>
    </div>
  );
}

function Sum({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`font-bold text-mocha ${strong ? "text-ink" : ""}`}>{label}</span>
      <span className={strong ? "font-black text-leaf" : "font-extrabold"}>{value}</span>
    </div>
  );
}
