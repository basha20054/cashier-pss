import { db } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { ApiError, fail, ok } from "@/lib/http";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** إرسال الطلب للمطبخ — idempotent: الإرسال المتكرر لا يضر */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id)) throw new ApiError(400, "معرّف غير صالح");
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) throw new ApiError(404, "الطلب غير موجود");
    if (order.status === "closed" || order.status === "cancelled")
      throw new ApiError(409, "الطلب مغلق");
    const cnt = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(orderItems)
      .where(eq(orderItems.orderId, id));
    if (!cnt[0].c) throw new ApiError(400, "أضف أصنافاً قبل الإرسال للمطبخ");
    if (order.status === "sent") return ok({ order, reused: true });
    const [updated] = await db
      .update(orders)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    await logAudit(user.id, "send_to_kitchen", "order", id);
    return ok({ order: updated, reused: false });
  } catch (e) {
    return fail(e);
  }
}
