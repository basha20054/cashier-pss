import { db } from "@/db";
import { menuItems, orderItems } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { ApiError, fail, intIn, ok } from "@/lib/http";
import { eq } from "drizzle-orm";

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
      priceMinor?: number;
      costMinor?: number;
      active?: boolean;
      categoryId?: number;
    } | null;
    const patch: Partial<typeof menuItems.$inferInsert> = {};
    if (body?.name !== undefined) {
      const name = body.name.trim();
      if (!name || name.length > 60) throw new ApiError(400, "اسم غير صالح");
      patch.name = name;
    }
    if (body?.priceMinor !== undefined) {
      const p = intIn(body.priceMinor, 0, 100_000_000);
      if (p === null) throw new ApiError(400, "السعر غير صالح");
      patch.priceMinor = p;
    }
    if (body?.costMinor !== undefined) {
      const c = intIn(body.costMinor, 0, 100_000_000);
      if (c === null) throw new ApiError(400, "التكلفة غير صالحة");
      patch.costMinor = c;
    }
    if (body?.active !== undefined) patch.active = Boolean(body.active);
    if (body?.categoryId !== undefined && Number.isInteger(body.categoryId))
      patch.categoryId = body.categoryId;
    if (Object.keys(patch).length === 0) throw new ApiError(400, "لا يوجد تغيير");
    const [item] = await db.update(menuItems).set(patch).where(eq(menuItems.id, id)).returning();
    if (!item) throw new ApiError(404, "الصنف غير موجود");
    await logAudit(user.id, "update", "menu_item", id, patch as Record<string, unknown>);
    return ok({ item });
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
    // إن استُخدم الصنف في طلبات سابقة: تعطيل فقط حفاظاً على دقة الفواتير التاريخية
    const [used] = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(eq(orderItems.menuItemId, id))
      .limit(1);
    if (used) {
      const [item] = await db
        .update(menuItems)
        .set({ active: false })
        .where(eq(menuItems.id, id))
        .returning();
      await logAudit(user.id, "deactivate", "menu_item", id);
      return ok({ item, deactivated: true });
    }
    await db.delete(menuItems).where(eq(menuItems.id, id));
    await logAudit(user.id, "delete", "menu_item", id);
    return ok({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
