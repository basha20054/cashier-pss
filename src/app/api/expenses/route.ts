import { db } from "@/db";
import { expenses, users } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole, requireUser } from "@/lib/auth";
import { ApiError, fail, intIn, ok } from "@/lib/http";
import { isValidDateStr, todayHebron } from "@/lib/time";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireUser();
    const date = new URL(req.url).searchParams.get("date") ?? todayHebron();
    if (!isValidDateStr(date)) throw new ApiError(400, "تاريخ غير صالح");
    const rows = await db
      .select({
        id: expenses.id,
        title: expenses.title,
        category: expenses.category,
        amountMinor: expenses.amountMinor,
        spentOn: expenses.spentOn,
        note: expenses.note,
        createdAt: expenses.createdAt,
        createdByName: users.name,
      })
      .from(expenses)
      .leftJoin(users, eq(expenses.createdBy, users.id))
      .where(eq(expenses.spentOn, date))
      .orderBy(desc(expenses.id))
      .limit(200);
    return ok({ expenses: rows, date });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["manager"]);
    const body = (await req.json().catch(() => null)) as {
      title?: string;
      category?: string;
      amountMinor?: number;
      spentOn?: string;
      note?: string;
    } | null;
    const title = body?.title?.trim();
    const amount = intIn(body?.amountMinor, 1, 100_000_000);
    const spentOn = body?.spentOn ?? todayHebron();
    if (!title || title.length > 80) throw new ApiError(400, "بيان المصروف مطلوب");
    if (amount === null) throw new ApiError(400, "المبلغ غير صالح");
    if (!isValidDateStr(spentOn)) throw new ApiError(400, "التاريخ غير صالح");
    const category = (body?.category ?? "عام").trim().slice(0, 30) || "عام";
    const note = (body?.note ?? "").trim().slice(0, 200);
    const [row] = await db
      .insert(expenses)
      .values({ title, category, amountMinor: amount, spentOn, note, createdBy: user.id })
      .returning();
    await logAudit(user.id, "create", "expense", row.id, { title, amount });
    return ok({ expense: row });
  } catch (e) {
    return fail(e);
  }
}
