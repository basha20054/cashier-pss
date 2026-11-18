import { db } from "@/db";
import { categories } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { ApiError, fail, ok, pgErrorCode } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireRole(["manager"]);
    const body = (await req.json().catch(() => null)) as {
      name?: string;
      sortOrder?: number;
    } | null;
    const name = body?.name?.trim();
    if (!name || name.length > 40) throw new ApiError(400, "اسم التصنيف مطلوب");
    try {
      const [c] = await db
        .insert(categories)
        .values({ name, sortOrder: body?.sortOrder ?? 0 })
        .returning();
      await logAudit(user.id, "create", "category", c.id, { name });
      return ok({ category: c });
    } catch (e) {
      if (pgErrorCode(e) === "23505")
        throw new ApiError(409, "يوجد تصنيف بهذا الاسم مسبقاً");
      throw e;
    }
  } catch (e) {
    return fail(e);
  }
}
