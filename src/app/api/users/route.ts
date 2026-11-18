import { db } from "@/db";
import { users, roleEnum } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { hashPin } from "@/lib/pin";
import { ApiError, fail, ok } from "@/lib/http";
import { asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole(["manager"]);
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        role: users.role,
        active: users.active,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(asc(users.id));
    return ok({ users: rows });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requireRole(["manager"]);
    const body = (await req.json().catch(() => null)) as {
      name?: string;
      role?: string;
      pin?: string;
    } | null;
    const name = body?.name?.trim();
    const role = body?.role ?? "";
    const pin = body?.pin ?? "";
    if (!name || name.length > 50) throw new ApiError(400, "الاسم مطلوب");
    if (!roleEnum.enumValues.includes(role as never))
      throw new ApiError(400, "الدور غير صالح");
    if (!/^\d{4,8}$/.test(pin)) throw new ApiError(400, "رقم الدخول 4–8 أرقام");
    const [row] = await db
      .insert(users)
      .values({ name, role: role as "manager" | "cashier" | "staff", pinHash: hashPin(pin) })
      .returning({ id: users.id, name: users.name, role: users.role, active: users.active });
    await logAudit(actor.id, "create", "user", row.id, { name, role });
    return ok({ user: row });
  } catch (e) {
    return fail(e);
  }
}
