import { db } from "@/db";
import { diningTables, orders } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { ApiError, fail, ok, pgConstraint, pgErrorCode } from "@/lib/http";
import { and, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * فتح طلب جديد لطاولة.
 * منع التكرار: clientKey فريد — إعادة المحاولة بنفس المفتاح ترجع الطلب نفسه.
 * منع طلبين نشطين: فحص + فهرس فريد جزئي في قاعدة البيانات كضمان نهائي.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => null)) as {
      tableId?: number;
      clientKey?: string;
    } | null;
    const tableId = body?.tableId;
    const clientKey = body?.clientKey?.trim();
    if (!Number.isInteger(tableId)) throw new ApiError(400, "الطاولة مطلوبة");
    if (!clientKey || clientKey.length < 8 || clientKey.length > 64)
      throw new ApiError(400, "مفتاح منع التكرار مطلوب");

    // إعادة محاولة بنفس المفتاح؟ نرجع الطلب الأصلي
    const [dup] = await db.select().from(orders).where(eq(orders.clientKey, clientKey)).limit(1);
    if (dup) return ok({ order: dup, reused: true });

    const [table] = await db
      .select()
      .from(diningTables)
      .where(eq(diningTables.id, tableId as number))
      .limit(1);
    if (!table || !table.active) throw new ApiError(404, "الطاولة غير موجودة");

    try {
      const [order] = await db
        .insert(orders)
        .values({ tableId: tableId as number, openedBy: user.id, clientKey })
        .returning();
      await logAudit(user.id, "open_order", "order", order.id, { tableId });
      return ok({ order, reused: false });
    } catch (e) {
      if (pgErrorCode(e) === "23505" && pgConstraint(e) === "orders_client_key_unique") {
        const [existing] = await db
          .select()
          .from(orders)
          .where(eq(orders.clientKey, clientKey))
          .limit(1);
        return ok({ order: existing, reused: true });
      }
      if (pgErrorCode(e) === "23505") {
        // orders_active_table_uq — طلب نشط آخر على هذه الطاولة
        const [active] = await db
          .select()
          .from(orders)
          .where(and(eq(orders.tableId, tableId as number), inArray(orders.status, ["open", "sent"])))
          .limit(1);
        return Response.json(
          { ok: false, error: "هذه الطاولة لديها طلب نشط بالفعل", activeOrderId: active?.id ?? null },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (e) {
    return fail(e);
  }
}
