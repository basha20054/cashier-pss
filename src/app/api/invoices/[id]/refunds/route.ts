import { db } from "@/db";
import { invoices, refunds } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { ApiError, fail, intIn, ok } from "@/lib/http";
import { eq, sql } from "drizzle-orm";
import { formatMinor } from "@/lib/money";

export const dynamic = "force-dynamic";

/**
 * استرداد مبلغ — مدير فقط، سبب إلزامي، لا يتجاوز صافي المدفوع.
 * idempotent عبر idempotencyKey فريد.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(["manager"]); // صلاحية الاسترداد للمدير حصراً
    const invoiceId = Number((await ctx.params).id);
    if (!Number.isInteger(invoiceId)) throw new ApiError(400, "معرّف غير صالح");

    const body = (await req.json().catch(() => null)) as {
      amountMinor?: number;
      reason?: string;
      idempotencyKey?: string;
    } | null;
    const amount = intIn(body?.amountMinor, 1, 100_000_000);
    const reason = body?.reason?.trim() ?? "";
    const key = body?.idempotencyKey?.trim();
    if (amount === null) throw new ApiError(400, "المبلغ غير صالح");
    if (reason.length < 3 || reason.length > 200)
      throw new ApiError(400, "سبب الاسترداد إلزامي (3 أحرف على الأقل)");
    if (!key || key.length < 8 || key.length > 64)
      throw new ApiError(400, "مفتاح منع التكرار مطلوب");

    const [dup] = await db.select().from(refunds).where(eq(refunds.idempotencyKey, key)).limit(1);
    if (dup) return ok({ refund: dup, reused: true });

    const result = await db.transaction(async (tx) => {
      const [inv] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .for("update")
        .limit(1);
      if (!inv) throw new ApiError(404, "الفاتورة غير موجودة");

      const agg = await tx.execute(sql`
        SELECT
          (SELECT COALESCE(SUM(amount_minor),0) FROM payments WHERE invoice_id = ${invoiceId}) AS paid,
          (SELECT COALESCE(SUM(amount_minor),0) FROM refunds WHERE invoice_id = ${invoiceId}) AS refunded
      `);
      const paid = Number(agg.rows[0]?.paid ?? 0);
      const refunded = Number(agg.rows[0]?.refunded ?? 0);
      const net = paid - refunded;
      if (net <= 0) throw new ApiError(409, "لا يوجد رصيد مدفوع قابل للاسترداد");
      if (amount > net)
        throw new ApiError(400, `مبلغ الاسترداد يتجاوز المدفوع (${formatMinor(net)})`);

      const [refund] = await tx
        .insert(refunds)
        .values({ invoiceId, amountMinor: amount, reason, idempotencyKey: key, approvedBy: user.id })
        .returning();

      const newNet = net - amount;
      const status =
        newNet <= 0 ? "refunded" : newNet < inv.totalMinor ? "partially_paid" : inv.status;
      await tx
        .update(invoices)
        .set({ status, updatedAt: new Date() })
        .where(eq(invoices.id, invoiceId));
      await logAudit(
        user.id,
        "refund",
        "invoice",
        invoiceId,
        { refundId: refund.id, amount, reason },
        tx,
      );
      return { refund, reused: false };
    });

    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
