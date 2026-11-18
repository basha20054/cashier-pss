import { db } from "@/db";
import { categories, menuItems } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { ApiError, fail, ok } from "@/lib/http";
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
      active?: boolean;
      sortOrder?: number;
    } | null;
    const patch: Partial<typeof categories.$inferInsert> = {};
    if (body?.name !== undefined) {
      const name = body.name.trim();
      if (!name || name.length > 40) throw new ApiError(400, "اسم غير صالح");
      patch.name = name;
    }
    if (body?.active !== undefined) patch.active = Boolean(body.active);
    if (body?.sortOrder !== undefined && Number.isInteger(body.sortOrder))
      patch.sortOrder = body.sortOrder;
    if (Object.keys(patch).length === 0) throw new ApiError(400, "لا يوجد تغيير");
    const [c] = await db.update(categories).set(patch).where(eq(categories.id, id)).returning();
    if (!c) throw new ApiError(404, "التصنيف غير موجود");
    await logAudit(user.id, "update", "category", id, patch as Record<string, unknown>);
    return ok({ category: c });
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
    const [used] = await db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(eq(menuItems.categoryId, id))
      .limit(1);
    if (used) {
      // لا نحذف تصنيفاً له أصناف — نعطّله حفاظاً على السجل
      const [c] = await db
        .update(categories)
        .set({ active: false })
        .where(eq(categories.id, id))
        .returning();
      await logAudit(user.id, "deactivate", "category", id);
      return ok({ category: c, deactivated: true });
    }
    await db.delete(categories).where(eq(categories.id, id));
    await logAudit(user.id, "delete", "category", id);
    return ok({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
