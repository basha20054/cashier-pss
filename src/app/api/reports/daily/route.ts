import { db } from "@/db";
import { requireRole } from "@/lib/auth";
import { ApiError, fail, ok } from "@/lib/http";
import { dayRangeHebron, isValidDateStr, todayHebron } from "@/lib/time";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * التقرير اليومي — مدير أو كاشير.
 * الحدود الزمنية محسوبة بتوقيت Asia/Hebron (يُراعي التوقيت الصيفي).
 */
export async function GET(req: Request) {
  try {
    await requireRole(["manager", "cashier"]);
    const date = new URL(req.url).searchParams.get("date") ?? todayHebron();
    if (!isValidDateStr(date)) throw new ApiError(400, "تاريخ غير صالح");
    const { start, end } = dayRangeHebron(date);

    // مجاميع الفواتير الصادرة في اليوم
    const invRes = await db.execute(sql`
      SELECT COUNT(*)::int AS invoices_count,
             COALESCE(SUM(subtotal_minor),0)::bigint AS subtotal,
             COALESCE(SUM(discount_minor),0)::bigint AS discount,
             COALESCE(SUM(tax_minor),0)::bigint AS tax,
             COALESCE(SUM(total_minor),0)::bigint AS total
      FROM invoices
      WHERE status <> 'void' AND created_at >= ${start} AND created_at < ${end}
    `);

    // المقبوضات في اليوم حسب الطريقة
    const payRes = await db.execute(sql`
      SELECT method, COALESCE(SUM(amount_minor),0)::bigint AS total
      FROM payments
      WHERE created_at >= ${start} AND created_at < ${end}
      GROUP BY method
    `);

    // الاستردادات في اليوم
    const refRes = await db.execute(sql`
      SELECT COALESCE(SUM(amount_minor),0)::bigint AS total, COUNT(*)::int AS cnt
      FROM refunds
      WHERE created_at >= ${start} AND created_at < ${end}
    `);

    // مصروفات اليوم
    const expRes = await db.execute(sql`
      SELECT COALESCE(SUM(amount_minor),0)::bigint AS total, COUNT(*)::int AS cnt
      FROM expenses
      WHERE spent_on = ${date}
    `);

    // الأرصدة المتبقية (ديون) — كل الفواتير غير المسددة بالكامل
    const debtRes = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt,
             COALESCE(SUM(GREATEST(i.total_minor - (COALESCE(p.paid,0) - COALESCE(r.refunded,0)), 0)),0)::bigint AS amount
      FROM invoices i
      LEFT JOIN (SELECT invoice_id, SUM(amount_minor) AS paid FROM payments GROUP BY invoice_id) p
        ON p.invoice_id = i.id
      LEFT JOIN (SELECT invoice_id, SUM(amount_minor) AS refunded FROM refunds GROUP BY invoice_id) r
        ON r.invoice_id = i.id
      WHERE i.status IN ('open','partially_paid')
    `);

    // ديون فواتير اليوم تحديداً
    const debtTodayRes = await db.execute(sql`
      SELECT COALESCE(SUM(GREATEST(i.total_minor - (COALESCE(p.paid,0) - COALESCE(r.refunded,0)), 0)),0)::bigint AS amount
      FROM invoices i
      LEFT JOIN (SELECT invoice_id, SUM(amount_minor) AS paid FROM payments GROUP BY invoice_id) p
        ON p.invoice_id = i.id
      LEFT JOIN (SELECT invoice_id, SUM(amount_minor) AS refunded FROM refunds GROUP BY invoice_id) r
        ON r.invoice_id = i.id
      WHERE i.status <> 'void' AND i.created_at >= ${start} AND i.created_at < ${end}
    `);

    const byMethod: Record<string, number> = { cash: 0, card: 0, electronic: 0 };
    for (const r of payRes.rows) byMethod[r.method as string] = Number(r.total);

    const inv = invRes.rows[0] as Record<string, unknown>;
    const total = Number(inv.total);
    const refundsTotal = Number(refRes.rows[0]?.total ?? 0);
    const expensesTotal = Number(expRes.rows[0]?.total ?? 0);

    return ok({
      date,
      invoicesCount: Number(inv.invoices_count),
      subtotal: Number(inv.subtotal),
      discount: Number(inv.discount),
      tax: Number(inv.tax),
      total,
      paymentsByMethod: byMethod,
      paymentsTotal: byMethod.cash + byMethod.card + byMethod.electronic,
      refundsTotal,
      refundsCount: Number(refRes.rows[0]?.cnt ?? 0),
      netSales: total - refundsTotal,
      expensesTotal,
      expensesCount: Number(expRes.rows[0]?.cnt ?? 0),
      cashNet: byMethod.cash - expensesTotal,
      outstandingAll: Number(debtRes.rows[0]?.amount ?? 0),
      outstandingCount: Number(debtRes.rows[0]?.cnt ?? 0),
      outstandingToday: Number(debtTodayRes.rows[0]?.amount ?? 0),
    });
  } catch (e) {
    return fail(e);
  }
}
