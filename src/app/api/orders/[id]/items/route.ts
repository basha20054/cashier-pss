import { db } from "@/db";
import { menuItems, orderItems, orders } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { ApiError, fail, intIn, ok } from "@/lib/http";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * إضافة صنف لطلب — السعر يُقرأ من قاعدة البيانات (لقطة)، لا من العميل أبداً.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const orderId = Number((await ctx.params).id);
    if (!Number.isInteger(orderId)) throw new ApiError(400, "معرّف غير صالح");
    const body = (await req.json().catch(() => null)) as {
      menuItemId?: number;
      quantity?: number;
      notes?: string;
    } | null;
    const menuItemId = body?.menuItemId;
    const quantity = intIn(body?.quantity ?? 1, 1, 99);
    if (!Number.isInteger(menuItemId)) throw new ApiError(400, "الصنف مطلوب");
    if (quantity === null) throw new ApiError(400, "الكمية غير صالحة (1–99)");
    const notes = (body?.notes ?? "").trim().slice(0, 120);

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new ApiError(404, "الطلب غير موجود");
    if (order.status !== "open" && order.status !== "sent")
      throw new ApiError(409, "الطلب مغلق — لا يمكن إضافة أصناف");

    const [mi] = await db
      .select()
      .from(menuItems)
      .where(eq(menuItems.id, menuItemId as number))
      .limit(1);
    if (!mi || !mi.active) throw new ApiError(404, "الصنف غير متاح");

    const [item] = await db
      .insert(orderItems)
      .values({
        orderId,
        menuItemId: mi.id,
        name: mi.name, // لقطة
        priceMinor: mi.priceMinor, // لقطة السعر من القاعدة
        quantity,
        notes,
      })
      .returning();
    await logAudit(user.id, "add_item", "order", orderId, {
      itemId: item.id,
      menuItemId: mi.id,
      quantity,
    });
    return ok({ item });
  } catch (e) {
    return fail(e);
  }
}
