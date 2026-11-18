import { db } from "@/db";
import { diningTables, orderItems, orders, settings } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { ApiError, fail, ok } from "@/lib/http";
import { asc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** GET — تفاصيل الطلب: الحالة والبنود واسم الطاولة ونسبة الضريبة */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id)) throw new ApiError(400, "معرّف غير صالح");

    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) throw new ApiError(404, "الطلب غير موجود");
    const [table] = await db
      .select({ name: diningTables.name })
      .from(diningTables)
      .where(eq(diningTables.id, order.tableId))
      .limit(1);
    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, id))
      .orderBy(asc(orderItems.id));
    const [st] = await db.select().from(settings).limit(1);
    const subtotal = items.reduce((s, it) => s + it.priceMinor * it.quantity, 0);
    return ok({
      order,
      items,
      tableName: table?.name ?? "—",
      subtotal,
      taxBps: st?.taxBps ?? 0,
    });
  } catch (e) {
    return fail(e);
  }
}

/**
 * DELETE — إلغاء طلب فارغ فقط لتحرير الطاولة (يُنشأ طلب بالخطأ عند انقطاع
 * التنقل بعد الإنشاء). يُمنع الحذف إن وُجدت أصناف أو فاتورة — السجل مقدّس.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id)) throw new ApiError(400, "معرّف غير صالح");

    await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, id))
        .for("update")
        .limit(1);
      if (!order) throw new ApiError(404, "الطلب غير موجود");
      if (order.status === "closed")
        throw new ApiError(409, "الطلب مغلق — لا يمكن حذفه");

      const cnt = await tx.execute(
        sql`SELECT (SELECT COUNT(*) FROM order_items WHERE order_id = ${id})
                  + (SELECT COUNT(*) FROM invoices WHERE order_id = ${id}) AS c`,
      );
      if (Number(cnt.rows[0]?.c ?? 0) > 0)
        throw new ApiError(409, "الطلب يحتوي أصنافاً أو فاتورة — يجب إغلاقه لا حذفه");

      await tx.delete(orders).where(eq(orders.id, id));
      await logAudit(user.id, "delete_empty_order", "order", id, { tableId: order.tableId }, tx);
    });

    return ok({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
