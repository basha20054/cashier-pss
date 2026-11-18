import { db } from "@/db";
import {
  diningTables,
  invoiceItems,
  invoices,
  orderItems,
  orders,
  settings,
} from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { ApiError, fail, ok } from "@/lib/http";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * إغلاق الطلب وإصدار فاتورة — معاملة PostgreSQL واحدة ذرّية:
 * قفل الطلب -> حساب المجاميع من لقطات الأسعار -> رقم فاتورة متسلسل بقفل صف
 * -> فاتورة + بنودها -> إغلاق الطلب. إن فشل أي جزء يُلغى الكل.
 * idempotent: إن وُجدت فاتورة لهذا الطلب تُرجع كما هي (unique(order_id)).
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(["manager", "cashier"]);
    const orderId = Number((await ctx.params).id);
    if (!Number.isInteger(orderId)) throw new ApiError(400, "معرّف غير صالح");

    const result = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for("update")
        .limit(1);
      if (!order) throw new ApiError(404, "الطلب غير موجود");

      // إعادة محاولة إغلاق طلب مغلق -> نرجع الفاتورة الموجودة
      if (order.status === "closed") {
        const [inv] = await tx
          .select()
          .from(invoices)
          .where(eq(invoices.orderId, orderId))
          .limit(1);
        if (inv) return { invoice: inv, reused: true };
        throw new ApiError(409, "الطلب مغلق");
      }

      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      if (items.length === 0) throw new ApiError(400, "لا يمكن إغلاق طلب فارغ");

      const subtotal = items.reduce((s, it) => s + it.priceMinor * it.quantity, 0);
      const discount = Math.min(order.discountMinor, subtotal);
      const [st] = await tx.select().from(settings).limit(1);
      const taxBps = st?.taxBps ?? 0;
      const taxable = subtotal - discount;
      const taxMinor = Math.round((taxable * taxBps) / 10000);
      const total = taxable + taxMinor;

      const numRes = await tx.execute(
        sql`UPDATE seq_counters SET value = value + 1 WHERE key = 'invoice_number' RETURNING value`,
      );
      const number = Number(numRes.rows[0]?.value);
      if (!number) throw new ApiError(500, "عدّاد الفواتير غير مهيأ");

      const [table] = await tx
        .select({ name: diningTables.name })
        .from(diningTables)
        .where(eq(diningTables.id, order.tableId))
        .limit(1);

      const [invoice] = await tx
        .insert(invoices)
        .values({
          number,
          orderId,
          tableName: table?.name ?? "—",
          cashierId: user.id,
          subtotalMinor: subtotal,
          discountMinor: discount,
          taxBps,
          taxMinor,
          totalMinor: total,
          status: "open",
        })
        .returning();

      await tx.insert(invoiceItems).values(
        items.map((it) => ({
          invoiceId: invoice.id,
          name: it.name,
          priceMinor: it.priceMinor,
          quantity: it.quantity,
          totalMinor: it.priceMinor * it.quantity,
        })),
      );

      await tx
        .update(orders)
        .set({ status: "closed", closedAt: new Date() })
        .where(eq(orders.id, orderId));

      await logAudit(
        user.id,
        "close_order",
        "invoice",
        invoice.id,
        { orderId, number, total },
        tx,
      );
      return { invoice, reused: false };
    });

    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
