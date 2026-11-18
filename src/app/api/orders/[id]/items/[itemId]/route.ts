import { db } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { ApiError, fail, intIn, ok } from "@/lib/http";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getEditableOrder(orderId: number) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw new ApiError(404, "الطلب غير موجود");
  if (order.status !== "open" && order.status !== "sent")
    throw new ApiError(409, "الطلب مغلق — لا يمكن التعديل");
  return order;
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const user = await requireUser();
    const { id, itemId } = await ctx.params;
    const orderId = Number(id);
    const itemIdN = Number(itemId);
    if (!Number.isInteger(orderId) || !Number.isInteger(itemIdN))
      throw new ApiError(400, "معرّف غير صالح");
    await getEditableOrder(orderId);

    const body = (await req.json().catch(() => null)) as {
      quantity?: number;
      notes?: string;
    } | null;
    const patch: Partial<typeof orderItems.$inferInsert> = {};
    if (body?.quantity !== undefined) {
      const q = intIn(body.quantity, 1, 99);
      if (q === null) throw new ApiError(400, "الكمية غير صالحة (1–99)");
      patch.quantity = q;
    }
    if (body?.notes !== undefined) patch.notes = body.notes.trim().slice(0, 120);
    if (Object.keys(patch).length === 0) throw new ApiError(400, "لا يوجد تغيير");

    const [item] = await db
      .update(orderItems)
      .set(patch)
      .where(and(eq(orderItems.id, itemIdN), eq(orderItems.orderId, orderId)))
      .returning();
    if (!item) throw new ApiError(404, "البند غير موجود");
    await logAudit(user.id, "update_item", "order", orderId, { itemId: itemIdN, ...patch });
    return ok({ item });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const user = await requireUser();
    const { id, itemId } = await ctx.params;
    const orderId = Number(id);
    const itemIdN = Number(itemId);
    if (!Number.isInteger(orderId) || !Number.isInteger(itemIdN))
      throw new ApiError(400, "معرّف غير صالح");
    await getEditableOrder(orderId);
    const [item] = await db
      .delete(orderItems)
      .where(and(eq(orderItems.id, itemIdN), eq(orderItems.orderId, orderId)))
      .returning();
    if (!item) throw new ApiError(404, "البند غير موجود");
    await logAudit(user.id, "remove_item", "order", orderId, {
      itemId: itemIdN,
      name: item.name,
      quantity: item.quantity,
    });
    return ok({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
