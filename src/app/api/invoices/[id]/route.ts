import { db } from "@/db";
import { invoiceItems, invoices, payments, refunds, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ApiError, fail, ok } from "@/lib/http";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id)) throw new ApiError(400, "معرّف غير صالح");

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!invoice) throw new ApiError(404, "الفاتورة غير موجودة");

    const items = await db
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, id))
      .orderBy(asc(invoiceItems.id));

    const pays = await db
      .select({
        id: payments.id,
        amountMinor: payments.amountMinor,
        method: payments.method,
        createdAt: payments.createdAt,
        receivedByName: users.name,
      })
      .from(payments)
      .leftJoin(users, eq(payments.receivedBy, users.id))
      .where(eq(payments.invoiceId, id))
      .orderBy(asc(payments.id));

    const refs = await db
      .select({
        id: refunds.id,
        amountMinor: refunds.amountMinor,
        reason: refunds.reason,
        createdAt: refunds.createdAt,
        approvedByName: users.name,
      })
      .from(refunds)
      .leftJoin(users, eq(refunds.approvedBy, users.id))
      .where(eq(refunds.invoiceId, id))
      .orderBy(asc(refunds.id));

    const paid = pays.reduce((s, p) => s + p.amountMinor, 0);
    const refunded = refs.reduce((s, r) => s + r.amountMinor, 0);
    const remaining = Math.max(invoice.totalMinor - (paid - refunded), 0);

    const [cashier] = invoice.cashierId
      ? await db.select({ name: users.name }).from(users).where(eq(users.id, invoice.cashierId)).limit(1)
      : [null];

    return ok({
      invoice,
      items,
      payments: pays,
      refunds: refs,
      paid,
      refunded,
      remaining,
      cashierName: cashier?.name ?? null,
    });
  } catch (e) {
    return fail(e);
  }
}
