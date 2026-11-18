import { db } from "@/db";
import { users, roleEnum, sessions } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { hashPin } from "@/lib/pin";
import { ApiError, fail, ok } from "@/lib/http";
import { and, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireRole(["manager"]);
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id)) throw new ApiError(400, "معرّف غير صالح");
    const body = (await req.json().catch(() => null)) as {
      name?: string;
      role?: string;
      pin?: string;
      active?: boolean;
    } | null;

    const patch: Partial<typeof users.$inferInsert> = {};
    if (body?.name !== undefined) {
      const name = body.name.trim();
      if (!name || name.length > 50) throw new ApiError(400, "اسم غير صالح");
      patch.name = name;
    }
    if (body?.role !== undefined) {
      if (!roleEnum.enumValues.includes(body.role as never))
        throw new ApiError(400, "الدور غير صالح");
      patch.role = body.role as "manager" | "cashier" | "staff";
    }
    if (body?.pin !== undefined) {
      if (!/^\d{4,8}$/.test(body.pin)) throw new ApiError(400, "رقم الدخول 4–8 أرقام");
      patch.pinHash = hashPin(body.pin);
    }
    if (body?.active !== undefined) patch.active = Boolean(body.active);
    if (Object.keys(patch).length === 0) throw new ApiError(400, "لا يوجد تغيير");

    // حماية: لا يمكن إزالة آخر مدير نشط في النظام
    const demotingManager =
      (patch.role !== undefined && patch.role !== "manager") || patch.active === false;
    if (demotingManager) {
      const [target] = await db
        .select({ role: users.role, active: users.active })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      if (!target) throw new ApiError(404, "المستخدم غير موجود");
      if (target.role === "manager" && target.active) {
        const cnt = await db
          .select({ c: sql<number>`count(*)::int` })
          .from(users)
          .where(and(eq(users.role, "manager"), eq(users.active, true)));
        if (cnt[0].c <= 1)
          throw new ApiError(409, "لا يمكن إلغاء آخر مدير نشط في النظام");
      }
    }

    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, id))
      .returning({ id: users.id, name: users.name, role: users.role, active: users.active });
    if (!updated) throw new ApiError(404, "المستخدم غير موجود");
    // عند تعطيل مستخدم أو تغيير رقمه: إنهاء جلساته القائمة
    if (patch.active === false || patch.pinHash !== undefined) {
      await db.delete(sessions).where(eq(sessions.userId, id));
    }
    await logAudit(actor.id, "update", "user", id, {
      fields: Object.keys(patch).filter((k) => k !== "pinHash"),
      pinChanged: patch.pinHash !== undefined,
    });
    return ok({ user: updated });
  } catch (e) {
    return fail(e);
  }
}
