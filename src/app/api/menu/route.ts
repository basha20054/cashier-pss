import { db } from "@/db";
import { categories, menuItems } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireUser();
    const all = new URL(req.url).searchParams.get("all") === "1";
    const cats = await db
      .select()
      .from(categories)
      .where(all ? undefined : eq(categories.active, true))
      .orderBy(asc(categories.sortOrder), asc(categories.id));
    const items = await db
      .select()
      .from(menuItems)
      .where(all ? undefined : eq(menuItems.active, true))
      .orderBy(asc(menuItems.sortOrder), asc(menuItems.id));
    return ok({ categories: cats, items });
  } catch (e) {
    return fail(e);
  }
}
