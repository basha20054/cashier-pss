import { db } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { ApiError, fail, intIn, ok } from "@/lib/http";
import { sql, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** تعديل الخصم — كاشير أو مدير، ويُتحقق منه مقابل المجموع المحسوب من القاعدة */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(["manager", "cashier"]);
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id)) throw new ApiError(400, "معرّف غير صالح");
    const body = (await req.json().catch(() => null)) as { discountMinor?: number } | null;
    const discount = intIn(body?.discountMinor, 0, 100_000_000);
    if (discount === null) throw new ApiError(400, "قيمة الخصم غير صالحة");

    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) throw new ApiError(404, "الطلب غير موجود");
    if (order.status !== "open" && order.status !== "sent")
      throw new ApiError(409, "الطلب مغلق");

    const res = await db.execute(
      sql`SELECT COALESCE(SUM(price_minor * quantity), 0)::bigint AS subtotal FROM order_items WHERE order_id = ${id}`,
    );
    const subtotal = Number(res.rows[0]?.subtotal ?? 0);
    if (discount > subtotal)
      throw new ApiError(400, "الخصم لا يمكن أن يتجاوز مجموع الطلب");

    const [updated] = await db
      .update(orders)
      .set({ discountMinor: discount })
      .where(eq(orders.id, id))
      .returning();
    await logAudit(user.id, "set_discount", "order", id, { discount });
    return ok({ order: updated });
  } catch (e) {
    return fail(e);
  }
}
