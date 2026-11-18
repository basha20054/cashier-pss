import { db } from "@/db";
import { categories, menuItems } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { ApiError, fail, intIn, ok } from "@/lib/http";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await requireRole(["manager"]);
    const body = (await req.json().catch(() => null)) as {
      categoryId?: number;
      name?: string;
      priceMinor?: number;
      costMinor?: number;
    } | null;
    const name = body?.name?.trim();
    const price = intIn(body?.priceMinor, 0, 100_000_000);
    const cost = body?.costMinor === undefined ? 0 : intIn(body.costMinor, 0, 100_000_000);
    const categoryId = body?.categoryId;
    if (!name || name.length > 60) throw new ApiError(400, "اسم الصنف مطلوب");
    if (price === null) throw new ApiError(400, "السعر غير صالح");
    if (cost === null) throw new ApiError(400, "التكلفة غير صالحة");
    if (!Number.isInteger(categoryId)) throw new ApiError(400, "التصنيف مطلوب");
    const [cat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, categoryId as number))
      .limit(1);
    if (!cat) throw new ApiError(404, "التصنيف غير موجود");
    const [item] = await db
      .insert(menuItems)
      .values({ name, categoryId: categoryId as number, priceMinor: price, costMinor: cost })
      .returning();
    await logAudit(user.id, "create", "menu_item", item.id, { name, price });
    return ok({ item });
  } catch (e) {
    return fail(e);
  }
}
