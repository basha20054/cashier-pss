import { db } from "@/db";
import { diningTables } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireRole, requireUser } from "@/lib/auth";
import { fail, ok, ApiError, pgErrorCode } from "@/lib/http";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export type TableRow = {
  id: number;
  name: string;
  sortOrder: number;
  orderId: number | null;
  orderStatus: "open" | "sent" | null;
  openedAt: string | null;
  subtotal: number;
  itemCount: number;
};

export async function GET() {
  try {
    await requireUser();
    const res = await db.execute(sql`
      SELECT t.id, t.name, t.sort_order AS "sortOrder",
             o.id AS "orderId", o.status AS "orderStatus", o.opened_at AS "openedAt",
             COALESCE(s.subtotal, 0)::bigint AS subtotal,
             COALESCE(s.cnt, 0)::bigint AS "itemCount"
      FROM dining_tables t
      LEFT JOIN orders o ON o.table_id = t.id AND o.status IN ('open','sent')
      LEFT JOIN LATERAL (
        SELECT SUM(price_minor * quantity) AS subtotal, COUNT(*) AS cnt
        FROM order_items WHERE order_id = o.id
      ) s ON true
      WHERE t.active = true
      ORDER BY t.sort_order, t.id
    `);
    const tables = res.rows.map((r) => ({
      ...r,
      subtotal: Number(r.subtotal),
      itemCount: Number(r.itemCount),
    })) as unknown as TableRow[];
    return ok({ tables });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["manager"]);
    const body = (await req.json().catch(() => null)) as { name?: string } | null;
    const name = body?.name?.trim();
    if (!name || name.length > 40) throw new ApiError(400, "اسم الطاولة مطلوب (حتى 40 حرفاً)");
    try {
      const [t] = await db.insert(diningTables).values({ name }).returning();
      await logAudit(user.id, "create", "dining_table", t.id, { name });
      return ok({ table: t });
    } catch (e) {
      if (pgErrorCode(e) === "23505")
        throw new ApiError(409, "يوجد طاولة بهذا الاسم مسبقاً");
      throw e;
    }
  } catch (e) {
    return fail(e);
  }
}
