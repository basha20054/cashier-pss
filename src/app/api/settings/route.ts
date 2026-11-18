import { db } from "@/db";
import { settings } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole, requireUser } from "@/lib/auth";
import { ApiError, fail, ok } from "@/lib/http";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUser();
    const [st] = await db.select().from(settings).limit(1);
    return ok({ settings: st });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireRole(["manager"]);
    const body = (await req.json().catch(() => null)) as {
      restaurantName?: string;
      taxPercent?: number;
    } | null;
    const patch: Partial<typeof settings.$inferInsert> = {};
    if (body?.restaurantName !== undefined) {
      const name = body.restaurantName.trim();
      if (!name || name.length > 60) throw new ApiError(400, "اسم المطعم غير صالح");
      patch.restaurantName = name;
    }
    if (body?.taxPercent !== undefined) {
      const tp = body.taxPercent;
      if (typeof tp !== "number" || tp < 0 || tp > 100)
        throw new ApiError(400, "نسبة الضريبة بين 0 و 100");
      patch.taxBps = Math.round(tp * 100);
    }
    if (Object.keys(patch).length === 0) throw new ApiError(400, "لا يوجد تغيير");
    const [st] = await db.select().from(settings).limit(1);
    if (st) {
      const [updated] = await db
        .update(settings)
        .set(patch)
        .where(eq(settings.id, st.id))
        .returning();
      await logAudit(user.id, "update", "settings", updated.id, patch as Record<string, unknown>);
      return ok({ settings: updated });
    }
    const [created] = await db.insert(settings).values(patch).returning();
    await logAudit(user.id, "update", "settings", created.id, patch as Record<string, unknown>);
    return ok({ settings: created });
  } catch (e) {
    return fail(e);
  }
}
