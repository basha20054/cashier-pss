import { db } from "@/db";
import { invoices, payments } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { ApiError, fail, intIn, ok, pgErrorCode } from "@/lib/http";
import { eq, sql } from "drizzle-orm";
import { formatMinor } from "@/lib/money";

export const dynamic = "force-dynamic";

const METHODS = new Set(["cash", "card", "electronic"]);

/**
 * تسجيل دفعة (كاملة أو جزئية) — داخل معاملة مع قفل صف الفاتورة.
 * منع التكرار: idempotencyKey فريد؛ إعادة المحاولة بنفس المفتاح ترجع الدفعة نفسها دون مضاعفة.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(["manager", "cashier"]);
    const invoiceId = Number((await ctx.params).id);
    if (!Number.isInteger(invoiceId)) throw new ApiError(400, "معرّف غير صالح");

    const body = (await req.json().catch(() => null)) as {
      amountMinor?: number;
      method?: string;
      idempotencyKey?: string;
    } | null;
    const amount = intIn(body?.amountMinor, 1, 100_000_000);
    const method = body?.method ?? "";
    const key = body?.idempotencyKey?.trim();
    if (amount === null) throw new ApiError(400, "المبلغ غير صالح");
    if (!METHODS.has(method)) throw new ApiError(400, "طريقة الدفع غير صالحة");
    if (!key || key.length < 8 || key.length > 64)
      throw new ApiError(400, "مفتاح منع التكرار مطلوب");

    // إعادة محاولة؟ نرجع الدفعة المسجلة سابقاً
    const [dup] = await db.select().from(payments).where(eq(payments.idempotencyKey, key)).limit(1);
    if (dup) return ok({ payment: dup, reused: true });

    const result = await db.transaction(async (tx) => {
      const [inv] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .for("update")
        .limit(1);
      if (!inv) throw new ApiError(404, "الفاتورة غير موجودة");
      if (inv.status === "void") throw new ApiError(409, "الفاتورة ملغاة");

      const agg = await tx.execute(sql`
        SELECT
          (SELECT COALESCE(SUM(amount_minor),0) FROM payments WHERE invoice_id = ${invoiceId})
          - (SELECT COALESCE(SUM(amount_minor),0) FROM refunds WHERE invoice_id = ${invoiceId})
          ::bigint AS net
      `);
      const net = Number(agg.rows[0]?.net ?? 0);
      const remaining = inv.totalMinor - net;
      if (remaining <= 0) throw new ApiError(409, "الفاتورة مسددة بالكامل");
      if (amount > remaining)
        throw new ApiError(400, `المبلغ يتجاوز المتبقي (${formatMinor(remaining)})`);

      try {
        const [payment] = await tx
          .insert(payments)
          .values({
            invoiceId,
            amountMinor: amount,
            method: method as "cash" | "card" | "electronic",
            idempotencyKey: key,
            receivedBy: user.id,
          })
          .returning();
        const newNet = net + amount;
        const status = newNet >= inv.totalMinor ? "paid" : "partially_paid";
        await tx
          .update(invoices)
          .set({ status, updatedAt: new Date() })
          .where(eq(invoices.id, invoiceId));
        await logAudit(
          user.id,
          "add_payment",
          "invoice",
          invoiceId,
          { paymentId: payment.id, amount, method },
          tx,
        );
        return { payment, reused: false };
      } catch (e) {
        // سباق على نفس مفتاح منع التكرار -> نقرأ الموجود
        if (pgErrorCode(e) === "23505") {
          const [existing] = await tx
            .select()
            .from(payments)
            .where(eq(payments.idempotencyKey, key))
            .limit(1);
          if (existing) return { payment: existing, reused: true };
        }
        throw e;
      }
    });

    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
