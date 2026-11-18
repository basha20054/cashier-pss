import { db } from "@/db";
import { diningTables, orders } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { ApiError, fail, ok } from "@/lib/http";
import { and, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(["manager"]);
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id)) throw new ApiError(400, "معرّف غير صالح");
    const body = (await req.json().catch(() => null)) as {
      name?: string;
      active?: boolean;
      sortOrder?: number;
    } | null;
    const patch: Partial<typeof diningTables.$inferInsert> = {};
    if (body?.name !== undefined) {
      const name = body.name.trim();
      if (!name || name.length > 40) throw new ApiError(400, "اسم غير صالح");
      patch.name = name;
    }
    if (body?.active !== undefined) patch.active = Boolean(body.active);
    if (body?.sortOrder !== undefined && Number.isInteger(body.sortOrder))
      patch.sortOrder = body.sortOrder;
    if (Object.keys(patch).length === 0) throw new ApiError(400, "لا يوجد تغيير");
    const [t] = await db.update(diningTables).set(patch).where(eq(diningTables.id, id)).returning();
    if (!t) throw new ApiError(404, "الطاولة غير موجودة");
    await logAudit(user.id, "update", "dining_table", id, patch as Record<string, unknown>);
    return ok({ table: t });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(["manager"]);
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id)) throw new ApiError(400, "معرّف غير صالح");
    const [activeOrder] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.tableId, id), inArray(orders.status, ["open", "sent"])))
      .limit(1);
    if (activeOrder) throw new ApiError(409, "لا يمكن حذف طاولة عليها طلب نشط");
    // إن كانت مستخدمة بسجل سابق: تعطيل بدل الحذف للحفاظ على سلامة السجل المحاسبي
    const [anyOrder] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.tableId, id))
      .limit(1);
    if (anyOrder) {
      const [t] = await db
        .update(diningTables)
        .set({ active: false })
        .where(eq(diningTables.id, id))
        .returning();
      await logAudit(user.id, "deactivate", "dining_table", id);
      return ok({ table: t, deactivated: true });
    }
    await db.delete(diningTables).where(eq(diningTables.id, id));
    await logAudit(user.id, "delete", "dining_table", id);
    return ok({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
