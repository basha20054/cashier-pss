import { db } from "@/db";
import { expenses } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { ApiError, fail, ok } from "@/lib/http";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole(["manager"]);
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id)) throw new ApiError(400, "معرّف غير صالح");
    const [row] = await db.delete(expenses).where(eq(expenses.id, id)).returning();
    if (!row) throw new ApiError(404, "المصروف غير موجود");
    await logAudit(user.id, "delete", "expense", id, { title: row.title });
    return ok({ deleted: true });
  } catch (e) {
    return fail(e);
  }
}
